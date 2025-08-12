import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { createGzip, createGunzip } from 'zlib';
import { pipeline } from 'stream/promises';
import { createReadStream, createWriteStream } from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * BackupService - Handles backup and restore operations for RxDB
 * Provides automated backup creation, validation, and restoration capabilities
 */
class BackupService {
    constructor(rxdbConnection) {
        this.rxdbConnection = rxdbConnection;
        this.backupPath = process.env.RXDB_BACKUP_PATH || path.join(__dirname, '../../data/backups');
        this.maxBackups = parseInt(process.env.RXDB_MAX_BACKUPS) || 10;
        this.compressionEnabled = process.env.RXDB_BACKUP_COMPRESSION !== 'false';
        this.backupPrefix = 'rxdb_backup';
    }

    /**
     * Create a backup of the current database state
     * @param {string} type - Type of backup (scheduled, manual, migration, shutdown)
     * @returns {Promise<string>} Path to created backup file
     */
    async createBackup(type = 'scheduled') {
        try {
            console.log(`[BackupService] Creating ${type} backup...`);

            // Ensure backup directory exists
            await this.ensureBackupDirectory();

            // Generate backup filename with timestamp
            const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
            const backupName = `${this.backupPrefix}_${type}_${timestamp}`;
            const backupFile = this.compressionEnabled ? `${backupName}.json.gz` : `${backupName}.json`;
            const backupFilePath = path.join(this.backupPath, backupFile);

            // Export database to JSON
            const database = this.rxdbConnection.getDatabase();
            const exportData = await database.exportJSON();

            // Add metadata to backup
            const backupData = {
                metadata: {
                    version: '1.0',
                    type: type,
                    timestamp: new Date().toISOString(),
                    collections: Object.keys(this.rxdbConnection.getCollections()),
                    totalDocuments: await this.getTotalDocumentCount()
                },
                data: exportData
            };

            // Write backup file (compressed or uncompressed)
            if (this.compressionEnabled) {
                await this.writeCompressedBackup(backupFilePath, backupData);
            } else {
                await fs.writeFile(backupFilePath, JSON.stringify(backupData, null, 2));
            }

            // Validate backup integrity
            await this.validateBackup(backupFilePath);

            console.log(`[BackupService] Backup created successfully: ${backupFilePath}`);
            return backupFilePath;

        } catch (error) {
            console.error(`[BackupService] Failed to create backup:`, error.message);
            throw new Error(`Backup creation failed: ${error.message}`);
        }
    }

    /**
     * Create an emergency backup (minimal metadata, fastest possible)
     * @returns {Promise<string>} Path to emergency backup file
     */
    async createEmergencyBackup() {
        try {
            console.log('[BackupService] Creating emergency backup...');

            const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
            const backupName = `${this.backupPrefix}_emergency_${timestamp}.json`;
            const backupFilePath = path.join(this.backupPath, backupName);

            // Quick export without compression
            const database = this.rxdbConnection.getDatabase();
            const exportData = await database.exportJSON();

            await fs.writeFile(backupFilePath, JSON.stringify(exportData, null, 2));

            console.log(`[BackupService] Emergency backup created: ${backupFilePath}`);
            return backupFilePath;

        } catch (error) {
            console.error('[BackupService] Emergency backup failed:', error.message);
            throw error;
        }
    }

    /**
     * Restore database from backup file
     * @param {string} backupFilePath - Path to backup file
     * @returns {Promise<boolean>} Success status
     */
    async restoreFromBackup(backupFilePath) {
        try {
            console.log(`[BackupService] Restoring from backup: ${backupFilePath}`);

            // Validate backup file exists and is readable
            await this.validateBackupFile(backupFilePath);

            // Read backup data
            const backupData = await this.readBackupFile(backupFilePath);

            // Validate backup data structure
            await this.validateBackupData(backupData);

            // Clear current database
            await this.clearDatabase();

            // Import backup data
            const database = this.rxdbConnection.getDatabase();
            const importData = backupData.data || backupData; // Handle both formats

            await database.importJSON(importData);

            // Verify restoration
            await this.verifyRestoration(backupData);

            console.log('[BackupService] Database restored successfully from backup');
            return true;

        } catch (error) {
            console.error('[BackupService] Restore failed:', error.message);
            throw new Error(`Restore operation failed: ${error.message}`);
        }
    }

    /**
     * Get the latest backup file
     * @returns {Promise<string|null>} Path to latest backup or null if none found
     */
    async getLatestBackup() {
        try {
            const backupFiles = await this.listBackupFiles();
            
            if (backupFiles.length === 0) {
                return null;
            }

            // Sort by modification time (newest first)
            const sortedFiles = backupFiles.sort((a, b) => b.mtime - a.mtime);
            return sortedFiles[0].path;

        } catch (error) {
            console.error('[BackupService] Failed to get latest backup:', error.message);
            return null;
        }
    }

    /**
     * List all available backup files
     * @returns {Promise<Array>} Array of backup file info
     */
    async listBackupFiles() {
        try {
            const files = await fs.readdir(this.backupPath);
            const backupFiles = [];

            for (const file of files) {
                if (file.startsWith(this.backupPrefix)) {
                    const filePath = path.join(this.backupPath, file);
                    const stats = await fs.stat(filePath);
                    
                    backupFiles.push({
                        name: file,
                        path: filePath,
                        size: stats.size,
                        mtime: stats.mtime,
                        created: stats.birthtime
                    });
                }
            }

            return backupFiles;

        } catch (error) {
            if (error.code === 'ENOENT') {
                return [];
            }
            throw error;
        }
    }

    /**
     * Clean up old backup files based on retention policy
     * @returns {Promise<number>} Number of files deleted
     */
    async cleanupOldBackups() {
        try {
            const backupFiles = await this.listBackupFiles();
            
            if (backupFiles.length <= this.maxBackups) {
                return 0;
            }

            // Sort by creation time (oldest first)
            const sortedFiles = backupFiles.sort((a, b) => a.created - b.created);
            const filesToDelete = sortedFiles.slice(0, backupFiles.length - this.maxBackups);

            let deletedCount = 0;
            for (const file of filesToDelete) {
                try {
                    await fs.unlink(file.path);
                    console.log(`[BackupService] Deleted old backup: ${file.name}`);
                    deletedCount++;
                } catch (deleteError) {
                    console.warn(`[BackupService] Failed to delete backup ${file.name}:`, deleteError.message);
                }
            }

            console.log(`[BackupService] Cleanup completed: ${deletedCount} old backups deleted`);
            return deletedCount;

        } catch (error) {
            console.error('[BackupService] Backup cleanup failed:', error.message);
            return 0;
        }
    }

    /**
     * Validate backup file integrity
     * @param {string} backupFilePath - Path to backup file
     * @returns {Promise<boolean>} Validation result
     */
    async validateBackup(backupFilePath) {
        try {
            // Check file exists and is readable
            await fs.access(backupFilePath, fs.constants.R_OK);

            // Read and parse backup data
            const backupData = await this.readBackupFile(backupFilePath);

            // Validate structure
            await this.validateBackupData(backupData);

            console.log(`[BackupService] Backup validation passed: ${backupFilePath}`);
            return true;

        } catch (error) {
            console.error(`[BackupService] Backup validation failed for ${backupFilePath}:`, error.message);
            throw new Error(`Backup validation failed: ${error.message}`);
        }
    }

    // Private helper methods

    async ensureBackupDirectory() {
        try {
            await fs.mkdir(this.backupPath, { recursive: true });
        } catch (error) {
            if (error.code !== 'EEXIST') {
                throw error;
            }
        }
    }

    async writeCompressedBackup(filePath, data) {
        const jsonString = JSON.stringify(data, null, 2);
        const { Readable } = await import('stream');
        const readStream = Readable.from([jsonString]);
        const writeStream = createWriteStream(filePath);
        const gzipStream = createGzip();

        await pipeline(readStream, gzipStream, writeStream);
    }

    async readBackupFile(filePath) {
        try {
            if (filePath.endsWith('.gz')) {
                // Read compressed backup
                return await this.readCompressedBackup(filePath);
            } else {
                // Read uncompressed backup
                const data = await fs.readFile(filePath, 'utf8');
                return JSON.parse(data);
            }
        } catch (error) {
            throw new Error(`Failed to read backup file: ${error.message}`);
        }
    }

    async readCompressedBackup(filePath) {
        return new Promise((resolve, reject) => {
            const chunks = [];
            const readStream = createReadStream(filePath);
            const gunzipStream = createGunzip();

            gunzipStream.on('data', chunk => chunks.push(chunk));
            gunzipStream.on('end', () => {
                try {
                    const jsonString = Buffer.concat(chunks).toString();
                    const data = JSON.parse(jsonString);
                    resolve(data);
                } catch (parseError) {
                    reject(new Error(`Failed to parse compressed backup: ${parseError.message}`));
                }
            });
            gunzipStream.on('error', reject);

            readStream.pipe(gunzipStream);
        });
    }

    async validateBackupFile(filePath) {
        try {
            await fs.access(filePath, fs.constants.R_OK);
            const stats = await fs.stat(filePath);
            
            if (stats.size === 0) {
                throw new Error('Backup file is empty');
            }
        } catch (error) {
            throw new Error(`Backup file validation failed: ${error.message}`);
        }
    }

    async validateBackupData(backupData) {
        if (!backupData) {
            throw new Error('Backup data is null or undefined');
        }

        // Handle both formats (with and without metadata wrapper)
        const dataToValidate = backupData.data || backupData;

        if (!dataToValidate.collections || !Array.isArray(dataToValidate.collections)) {
            throw new Error('Invalid backup format: missing collections array');
        }

        // Validate each collection has required structure
        for (const collection of dataToValidate.collections) {
            if (!collection.name || !collection.docs) {
                throw new Error(`Invalid collection structure in backup: ${collection.name || 'unnamed'}`);
            }
        }
    }

    async getTotalDocumentCount() {
        try {
            let totalCount = 0;
            const collections = this.rxdbConnection.getCollections();
            
            for (const [name, collection] of Object.entries(collections)) {
                const count = await collection.count().exec();
                totalCount += count;
            }
            
            return totalCount;
        } catch (error) {
            console.warn('[BackupService] Failed to get document count:', error.message);
            return 0;
        }
    }

    async clearDatabase() {
        try {
            const collections = this.rxdbConnection.getCollections();
            
            for (const [name, collection] of Object.entries(collections)) {
                await collection.remove();
            }
            
            console.log('[BackupService] Database cleared for restoration');
        } catch (error) {
            throw new Error(`Failed to clear database: ${error.message}`);
        }
    }

    async verifyRestoration(backupData) {
        try {
            const expectedCollections = backupData.metadata?.collections || [];
            const currentCollections = Object.keys(this.rxdbConnection.getCollections());
            
            // Verify all expected collections exist
            for (const collectionName of expectedCollections) {
                if (!currentCollections.includes(collectionName)) {
                    throw new Error(`Collection ${collectionName} not found after restoration`);
                }
            }
            
            console.log('[BackupService] Restoration verification completed successfully');
        } catch (error) {
            throw new Error(`Restoration verification failed: ${error.message}`);
        }
    }
}

export default BackupService;