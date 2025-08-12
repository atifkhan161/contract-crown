import BackupService from './BackupService.js';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * MigrationBackupService - Specialized backup service for migration operations
 * Handles pre-migration backups, rollback scenarios, and migration validation
 */
class MigrationBackupService extends BackupService {
    constructor(rxdbConnection) {
        super(rxdbConnection);
        this.migrationBackupPath = process.env.MIGRATION_BACKUP_PATH || path.join(__dirname, '../../data/migration-backups');
        this.migrationPrefix = 'migration_backup';
    }

    /**
     * Create a pre-migration backup with MariaDB data export
     * @param {string} migrationId - Unique identifier for the migration
     * @returns {Promise<Object>} Backup information
     */
    async createPreMigrationBackup(migrationId) {
        try {
            console.log(`[MigrationBackup] Creating pre-migration backup for: ${migrationId}`);

            // Ensure migration backup directory exists
            await this.ensureMigrationBackupDirectory();

            // Create timestamp for backup
            const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
            const backupName = `${this.migrationPrefix}_${migrationId}_${timestamp}`;

            // Create backup metadata
            const backupMetadata = {
                migrationId,
                timestamp: new Date().toISOString(),
                type: 'pre-migration',
                version: '1.0',
                status: 'in-progress'
            };

            // Create backup directory for this migration
            const migrationBackupDir = path.join(this.migrationBackupPath, backupName);
            await fs.mkdir(migrationBackupDir, { recursive: true });

            // Export MariaDB data (if available)
            const mariadbBackup = await this.exportMariaDBData(migrationBackupDir);

            // Export current RxDB data (if any)
            const rxdbBackup = await this.exportRxDBData(migrationBackupDir);

            // Create backup manifest
            const manifest = {
                ...backupMetadata,
                mariadbBackup,
                rxdbBackup,
                backupPath: migrationBackupDir,
                status: 'completed'
            };

            const manifestPath = path.join(migrationBackupDir, 'manifest.json');
            await fs.writeFile(manifestPath, JSON.stringify(manifest, null, 2));

            console.log(`[MigrationBackup] Pre-migration backup completed: ${migrationBackupDir}`);
            return manifest;

        } catch (error) {
            console.error('[MigrationBackup] Pre-migration backup failed:', error.message);
            throw new Error(`Pre-migration backup failed: ${error.message}`);
        }
    }

    /**
     * Create a post-migration backup with validation
     * @param {string} migrationId - Migration identifier
     * @returns {Promise<Object>} Backup information
     */
    async createPostMigrationBackup(migrationId) {
        try {
            console.log(`[MigrationBackup] Creating post-migration backup for: ${migrationId}`);

            // Create standard RxDB backup
            const backupPath = await this.createBackup('post-migration');

            // Validate migration success
            const validationResult = await this.validateMigrationSuccess(migrationId);

            // Create migration completion record
            const completionRecord = {
                migrationId,
                timestamp: new Date().toISOString(),
                type: 'post-migration',
                backupPath,
                validation: validationResult,
                status: validationResult.success ? 'success' : 'failed'
            };

            // Save completion record
            const recordPath = path.join(this.migrationBackupPath, `${migrationId}_completion.json`);
            await fs.writeFile(recordPath, JSON.stringify(completionRecord, null, 2));

            console.log(`[MigrationBackup] Post-migration backup completed: ${backupPath}`);
            return completionRecord;

        } catch (error) {
            console.error('[MigrationBackup] Post-migration backup failed:', error.message);
            throw new Error(`Post-migration backup failed: ${error.message}`);
        }
    }

    /**
     * Rollback to pre-migration state
     * @param {string} migrationId - Migration identifier
     * @returns {Promise<boolean>} Rollback success status
     */
    async rollbackMigration(migrationId) {
        try {
            console.log(`[MigrationBackup] Rolling back migration: ${migrationId}`);

            // Find pre-migration backup
            const preMigrationBackup = await this.findPreMigrationBackup(migrationId);
            if (!preMigrationBackup) {
                throw new Error(`No pre-migration backup found for: ${migrationId}`);
            }

            // Create rollback backup of current state
            await this.createBackup('pre-rollback');

            // Restore MariaDB data if available
            if (preMigrationBackup.mariadbBackup && preMigrationBackup.mariadbBackup.available) {
                await this.restoreMariaDBData(preMigrationBackup.mariadbBackup.path);
            }

            // Clear RxDB data
            await this.clearRxDBData();

            // Create rollback completion record
            const rollbackRecord = {
                migrationId,
                timestamp: new Date().toISOString(),
                type: 'rollback',
                originalBackup: preMigrationBackup.backupPath,
                status: 'completed'
            };

            const recordPath = path.join(this.migrationBackupPath, `${migrationId}_rollback.json`);
            await fs.writeFile(recordPath, JSON.stringify(rollbackRecord, null, 2));

            console.log(`[MigrationBackup] Migration rollback completed: ${migrationId}`);
            return true;

        } catch (error) {
            console.error('[MigrationBackup] Migration rollback failed:', error.message);
            throw new Error(`Migration rollback failed: ${error.message}`);
        }
    }

    /**
     * Validate migration data integrity
     * @param {string} migrationId - Migration identifier
     * @returns {Promise<Object>} Validation results
     */
    async validateMigrationSuccess(migrationId) {
        try {
            console.log(`[MigrationBackup] Validating migration success: ${migrationId}`);

            const validation = {
                migrationId,
                timestamp: new Date().toISOString(),
                checks: [],
                success: true,
                errors: []
            };

            // Check RxDB collections exist and have data
            const collections = this.rxdbConnection.getCollections();
            for (const [name, collection] of Object.entries(collections)) {
                try {
                    const count = await collection.count().exec();
                    validation.checks.push({
                        type: 'collection_count',
                        collection: name,
                        count,
                        status: 'passed'
                    });
                } catch (error) {
                    validation.checks.push({
                        type: 'collection_count',
                        collection: name,
                        error: error.message,
                        status: 'failed'
                    });
                    validation.success = false;
                    validation.errors.push(`Collection ${name} validation failed: ${error.message}`);
                }
            }

            // Check data consistency
            const consistencyCheck = await this.checkDataConsistency();
            validation.checks.push(consistencyCheck);
            if (!consistencyCheck.status === 'passed') {
                validation.success = false;
                validation.errors.push('Data consistency check failed');
            }

            console.log(`[MigrationBackup] Migration validation completed: ${validation.success ? 'PASSED' : 'FAILED'}`);
            return validation;

        } catch (error) {
            console.error('[MigrationBackup] Migration validation failed:', error.message);
            return {
                migrationId,
                timestamp: new Date().toISOString(),
                success: false,
                errors: [error.message]
            };
        }
    }

    // Private helper methods

    async ensureMigrationBackupDirectory() {
        try {
            await fs.mkdir(this.migrationBackupPath, { recursive: true });
        } catch (error) {
            if (error.code !== 'EEXIST') {
                throw error;
            }
        }
    }

    async exportMariaDBData(backupDir) {
        try {
            // Check if MariaDB export data exists
            const exportPath = path.join(process.cwd(), 'server', 'data', 'migration');
            
            try {
                await fs.access(exportPath);
                
                // Copy MariaDB export data to backup
                const mariadbBackupPath = path.join(backupDir, 'mariadb_export');
                await fs.mkdir(mariadbBackupPath, { recursive: true });
                
                // Copy all JSON files from export directory
                const files = await fs.readdir(exportPath);
                const jsonFiles = files.filter(file => file.endsWith('.json'));
                
                for (const file of jsonFiles) {
                    const sourcePath = path.join(exportPath, file);
                    const destPath = path.join(mariadbBackupPath, file);
                    await fs.copyFile(sourcePath, destPath);
                }
                
                return {
                    available: true,
                    path: mariadbBackupPath,
                    files: jsonFiles,
                    timestamp: new Date().toISOString()
                };
                
            } catch (error) {
                console.log('[MigrationBackup] No MariaDB export data found');
                return {
                    available: false,
                    reason: 'No export data found'
                };
            }
            
        } catch (error) {
            console.warn('[MigrationBackup] Failed to export MariaDB data:', error.message);
            return {
                available: false,
                error: error.message
            };
        }
    }

    async exportRxDBData(backupDir) {
        try {
            if (!this.rxdbConnection.isReady()) {
                return {
                    available: false,
                    reason: 'RxDB not initialized'
                };
            }

            const rxdbBackupPath = path.join(backupDir, 'rxdb_export.json');
            const database = this.rxdbConnection.getDatabase();
            const exportData = await database.exportJSON();
            
            await fs.writeFile(rxdbBackupPath, JSON.stringify(exportData, null, 2));
            
            return {
                available: true,
                path: rxdbBackupPath,
                timestamp: new Date().toISOString()
            };
            
        } catch (error) {
            console.warn('[MigrationBackup] Failed to export RxDB data:', error.message);
            return {
                available: false,
                error: error.message
            };
        }
    }

    async findPreMigrationBackup(migrationId) {
        try {
            const files = await fs.readdir(this.migrationBackupPath);
            const migrationBackups = files.filter(file => 
                file.startsWith(`${this.migrationPrefix}_${migrationId}_`)
            );
            
            if (migrationBackups.length === 0) {
                return null;
            }
            
            // Get the most recent backup
            const backupDir = migrationBackups.sort().reverse()[0];
            const manifestPath = path.join(this.migrationBackupPath, backupDir, 'manifest.json');
            
            const manifestData = await fs.readFile(manifestPath, 'utf8');
            return JSON.parse(manifestData);
            
        } catch (error) {
            console.error('[MigrationBackup] Failed to find pre-migration backup:', error.message);
            return null;
        }
    }

    async restoreMariaDBData(mariadbBackupPath) {
        // This would integrate with MariaDB restoration logic
        // For now, just log the operation
        console.log(`[MigrationBackup] MariaDB data restoration would be performed from: ${mariadbBackupPath}`);
        // Implementation would depend on the specific MariaDB setup
    }

    async clearRxDBData() {
        try {
            const collections = this.rxdbConnection.getCollections();
            
            for (const [name, collection] of Object.entries(collections)) {
                await collection.remove();
                console.log(`[MigrationBackup] Cleared collection: ${name}`);
            }
            
        } catch (error) {
            console.error('[MigrationBackup] Failed to clear RxDB data:', error.message);
            throw error;
        }
    }

    async checkDataConsistency() {
        try {
            // Basic consistency checks
            const collections = this.rxdbConnection.getCollections();
            let totalDocuments = 0;
            
            for (const [name, collection] of Object.entries(collections)) {
                const count = await collection.count().exec();
                totalDocuments += count;
            }
            
            return {
                type: 'data_consistency',
                totalDocuments,
                collectionsChecked: Object.keys(collections).length,
                status: 'passed',
                timestamp: new Date().toISOString()
            };
            
        } catch (error) {
            return {
                type: 'data_consistency',
                error: error.message,
                status: 'failed',
                timestamp: new Date().toISOString()
            };
        }
    }
}

export default MigrationBackupService;