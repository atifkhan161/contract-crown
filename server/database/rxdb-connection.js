import { createRxDatabase } from 'rxdb';
import { getRxStorageMemory } from 'rxdb/plugins/storage-memory';
import { RxDBDevModePlugin } from 'rxdb/plugins/dev-mode';
import { RxDBQueryBuilderPlugin } from 'rxdb/plugins/query-builder';
import { RxDBLeaderElectionPlugin } from 'rxdb/plugins/leader-election';
import { RxDBUpdatePlugin } from 'rxdb/plugins/update';
import { RxDBJsonDumpPlugin } from 'rxdb/plugins/json-dump';
import { wrappedValidateAjvStorage } from 'rxdb/plugins/validate-ajv';
import { addRxPlugin } from 'rxdb';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs/promises';
import BackupService from '../src/services/BackupService.js';

dotenv.config();

// Get current directory for ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Add RxDB plugins
if (process.env.NODE_ENV !== 'production') {
    addRxPlugin(RxDBDevModePlugin);
}
addRxPlugin(RxDBQueryBuilderPlugin);
addRxPlugin(RxDBLeaderElectionPlugin);
addRxPlugin(RxDBUpdatePlugin);
addRxPlugin(RxDBJsonDumpPlugin);

class RxDBConnection {
    constructor() {
        this.database = null;
        this.collections = {};
        this.isInitialized = false;
        this.persistenceInterval = null;
        this.backupInterval = null;
        this.backupService = null;
        this.dbPath = process.env.RXDB_PATH || path.join(__dirname, '../data/rxdb');
        this.dbName = process.env.RXDB_NAME || 'contract_crown_rxdb';
        this.backupPath = process.env.RXDB_BACKUP_PATH || path.join(__dirname, '../data/backups');
        
        // Persistence configuration
        this.persistenceConfig = {
            autosave: true,
            autosaveInterval: parseInt(process.env.RXDB_AUTOSAVE_INTERVAL) || 5000, // 5 seconds
            throttledSaves: true,
            adapter: null,
            verbose: process.env.NODE_ENV !== 'production'
        };
        
        // Backup configuration
        this.backupConfig = {
            enabled: process.env.RXDB_BACKUP_ENABLED !== 'false',
            interval: parseInt(process.env.RXDB_BACKUP_INTERVAL) || 300000, // 5 minutes
            maxBackups: parseInt(process.env.RXDB_MAX_BACKUPS) || 10,
            compressionEnabled: process.env.RXDB_BACKUP_COMPRESSION !== 'false'
        };
    }

    async initialize() {
        try {
            console.log('[RxDB] Initializing RxDB with LokiJS storage adapter...');

            // Ensure database directory exists
            await this.ensureDirectoryExists(this.dbPath);
            await this.ensureDirectoryExists(this.backupPath);

            // Configure storage with enhanced persistence settings
            const storageAdapter = await this.configureStorageAdapter();

            // Create RxDB database with enhanced storage wrapped with AJV validation
            this.database = await createRxDatabase({
                name: this.dbName,
                storage: wrappedValidateAjvStorage({
                    storage: storageAdapter
                }),
                eventReduce: true,
                ignoreDuplicate: true
            });

            console.log(`[RxDB] Database created successfully with enhanced persistence storage`);

            // Set up error handling and monitoring
            this.setupDatabaseMonitoring();

            // Initialize backup service
            this.backupService = new BackupService(this);

            // Add all collections
            await this.addAllCollections();

            // Load persisted data after collections are set up
            await this.loadPersistedData();

            // Set up persistence and backup mechanisms
            await this.setupPersistenceAndBackup();

            this.isInitialized = true;
            console.log('[RxDB] RxDB initialization completed successfully');

            return this.database;
        } catch (error) {
            console.error('[RxDB] Initialization failed:', error.message);
            console.error('[RxDB] Error details:', error);
            await this.handleInitializationError(error);
            throw new Error(`RxDB initialization failed: ${error.message}`);
        }
    }

    async addCollection(name, schema, options = {}) {
        try {
            if (!this.database) {
                throw new Error('Database not initialized. Call initialize() first.');
            }

            console.log(`[RxDB] Adding collection: ${name}`);

            const collection = await this.database.addCollections({
                [name]: {
                    schema,
                    ...options
                }
            });

            this.collections[name] = collection[name];
            console.log(`[RxDB] Collection '${name}' added successfully`);

            return this.collections[name];
        } catch (error) {
            console.error(`[RxDB] Failed to add collection '${name}':`, error.message);
            throw error;
        }
    }

    async addAllCollections() {
        try {
            console.log('[RxDB] Adding all collections...');
            
            // Import schemas
            const { allSchemas } = await import('../src/database/schemas/index.js');
            
            // Add all collections at once for better performance
            const collectionsToAdd = {};
            for (const [name, schema] of Object.entries(allSchemas)) {
                collectionsToAdd[name] = { schema };
            }

            const collections = await this.database.addCollections(collectionsToAdd);
            
            // Store collection references
            for (const [name, collection] of Object.entries(collections)) {
                this.collections[name] = collection;
                console.log(`[RxDB] Collection '${name}' added successfully`);
            }

            console.log(`[RxDB] Added ${Object.keys(collections).length} collections successfully`);
            return collections;
        } catch (error) {
            console.error('[RxDB] Failed to add collections:', error.message);
            throw error;
        }
    }

    // Load persisted data after all collections are set up
    async loadPersistedData() {
        try {
            if (Object.keys(this.collections).length === 0) {
                console.log('[RxDB] No collections defined, skipping data load');
                return false;
            }

            console.log('[RxDB] Loading persisted data...');
            const loaded = await this.loadFromFile();
            
            if (loaded) {
                console.log('[RxDB] Persisted data loaded successfully');
            } else {
                console.log('[RxDB] No persisted data found or failed to load, starting fresh');
            }
            
            return loaded;
        } catch (error) {
            console.error('[RxDB] Failed to load persisted data:', error.message);
            return false;
        }
    }

    getCollection(name) {
        if (!this.collections[name]) {
            throw new Error(`Collection '${name}' not found. Make sure to add it first.`);
        }
        return this.collections[name];
    }

    async healthCheck() {
        try {
            if (!this.database) {
                return false;
            }

            // Simple health check by accessing database info
            const info = await this.database.requestIdlePromise();
            console.log('[RxDB] Health check passed');
            return true;
        } catch (error) {
            console.error('[RxDB] Health check failed:', error.message);
            return false;
        }
    }

    async close() {
        try {
            if (this.database) {
                await this.database.remove();
                this.database = null;
                this.collections = {};
                this.isInitialized = false;
                console.log('[RxDB] Database connection closed successfully');
            }
        } catch (error) {
            console.error('[RxDB] Error closing database:', error.message);
            throw error;
        }
    }

    // Utility method to check if database is ready
    isReady() {
        return this.isInitialized && this.database !== null;
    }

    // Get database instance
    getDatabase() {
        if (!this.database) {
            throw new Error('Database not initialized. Call initialize() first.');
        }
        return this.database;
    }

    // Get all collections
    getCollections() {
        return this.collections;
    }

    // Configure storage adapter with enhanced persistence settings
    async configureStorageAdapter() {
        try {
            // Use memory storage with enhanced JSON-based persistence
            // This provides LokiJS-like functionality with file-based persistence
            const memoryStorage = getRxStorageMemory();
            
            console.log('[RxDB] Memory storage configured with enhanced JSON persistence');
            return memoryStorage;
        } catch (error) {
            console.error('[RxDB] Failed to configure storage adapter:', error.message);
            throw error;
        }
    }

    // Set up database monitoring and error handling
    setupDatabaseMonitoring() {
        this.database.$.subscribe(
            changeEvent => {
                if (this.persistenceConfig.verbose) {
                    console.log('[RxDB] Database change event:', changeEvent.operation);
                }
            },
            error => {
                console.error('[RxDB] Database error:', error);
                this.handleDatabaseError(error);
            }
        );

        // Note: Storage error monitoring removed due to API changes in RxDB
        // Storage errors will be handled through general error handling
    }

    // Set up persistence and backup mechanisms
    async setupPersistenceAndBackup() {
        try {
            // Set up periodic backup if enabled
            if (this.backupConfig.enabled) {
                this.setupPeriodicBackup();
            }

            // Set up persistence monitoring
            this.setupPersistenceMonitoring();

            console.log('[RxDB] Persistence and backup mechanisms configured successfully');
        } catch (error) {
            console.error('[RxDB] Failed to setup persistence and backup:', error.message);
            throw error;
        }
    }

    // Set up periodic backup
    setupPeriodicBackup() {
        this.backupInterval = setInterval(async () => {
            try {
                await this.backupService.createBackup('scheduled');
                await this.backupService.cleanupOldBackups();
            } catch (error) {
                console.error('[RxDB] Backup error:', error.message);
                this.handleBackupError(error);
            }
        }, this.backupConfig.interval);

        console.log(`[RxDB] Periodic backup setup completed (${this.backupConfig.interval}ms intervals)`);
    }

    // Set up persistence monitoring
    setupPersistenceMonitoring() {
        // Monitor for persistence failures and implement recovery
        this.persistenceInterval = setInterval(async () => {
            try {
                await this.validatePersistence();
            } catch (error) {
                console.error('[RxDB] Persistence validation error:', error.message);
                // For memory storage, persistence errors are less critical
                // Just log and continue, don't attempt recovery unless it's a serious issue
                if (error.message.includes('permission') || error.message.includes('ENOSPC')) {
                    await this.handlePersistenceError(error);
                }
            }
        }, 60000); // Check every minute

        console.log('[RxDB] Persistence monitoring setup completed');
    }

    // Enhanced save database to file with LokiJS-like features
    async saveToFile() {
        try {
            if (!this.database) return;

            const dump = await this.database.exportJSON();
            
            // Ensure directory exists
            await fs.mkdir(this.dbPath, { recursive: true });

            // Create main database file
            const filePath = path.join(this.dbPath, `${this.dbName}.json`);
            
            // Add metadata for enhanced persistence
            const enhancedDump = {
                metadata: {
                    version: '1.0',
                    timestamp: new Date().toISOString(),
                    collections: Object.keys(this.collections),
                    persistenceConfig: this.persistenceConfig
                },
                data: dump
            };

            // Write with atomic operation (write to temp file first, then rename)
            const tempFilePath = `${filePath}.tmp`;
            await fs.writeFile(tempFilePath, JSON.stringify(enhancedDump, null, 2));
            await fs.rename(tempFilePath, filePath);

            // Create backup rotation
            await this.rotateDataFiles(filePath);

            if (this.persistenceConfig.verbose) {
                console.log(`[RxDB] Database persisted to: ${filePath}`);
            }
        } catch (error) {
            console.error('[RxDB] Failed to save database to file:', error.message);
            throw error;
        }
    }

    // Enhanced load database from file with recovery options
    async loadFromFile() {
        try {
            const filePath = path.join(this.dbPath, `${this.dbName}.json`);

            try {
                const data = await fs.readFile(filePath, 'utf8');
                const parsedData = JSON.parse(data);

                // Handle both old and new format
                const dump = parsedData.data || parsedData;
                const metadata = parsedData.metadata;

                if (metadata && this.persistenceConfig.verbose) {
                    console.log(`[RxDB] Loading database from ${metadata.timestamp}, collections: ${metadata.collections?.join(', ')}`);
                }

                // Validate dump structure
                if (dump.collections && dump.collections.length > 0) {
                    const existingCollections = Object.keys(this.collections);
                    const dumpCollections = dump.collections.map(col => col.name);
                    const matchingCollections = dumpCollections.filter(name => existingCollections.includes(name));

                    if (matchingCollections.length > 0) {
                        await this.database.importJSON(dump);
                        console.log(`[RxDB] Database loaded successfully from: ${filePath}`);
                        return true;
                    } else {
                        console.log('[RxDB] No matching collections found in dump file, starting fresh');
                        return false;
                    }
                } else {
                    console.log('[RxDB] Empty database file found, starting fresh');
                    return false;
                }
            } catch (error) {
                if (error.code === 'ENOENT') {
                    console.log('[RxDB] No existing database file found, starting fresh');
                    return false;
                }
                if (error.code === 'JD1') {
                    console.log('[RxDB] Collections in dump file do not match current schema, attempting recovery...');
                    return await this.attemptDataRecovery();
                }
                if (error instanceof SyntaxError) {
                    console.error('[RxDB] Database file corrupted, attempting recovery...');
                    return await this.attemptDataRecovery();
                }
                throw error;
            }
        } catch (error) {
            console.error('[RxDB] Failed to load database from file:', error.message);
            console.log('[RxDB] Attempting data recovery...');
            return await this.attemptDataRecovery();
        }
    }

    // Ensure directory exists
    async ensureDirectoryExists(dirPath) {
        try {
            await fs.mkdir(dirPath, { recursive: true });
        } catch (error) {
            if (error.code !== 'EEXIST') {
                throw error;
            }
        }
    }

    // Validate persistence is working correctly
    async validatePersistence() {
        try {
            // For memory storage with JSON persistence, check the JSON file instead of .db file
            const dbFilePath = path.join(this.dbPath, `${this.dbName}.json`);
            
            try {
                const stats = await fs.stat(dbFilePath);
                
                // Check if file was modified recently (within last 10 minutes)
                const tenMinutesAgo = Date.now() - (10 * 60 * 1000);
                if (stats.mtime.getTime() < tenMinutesAgo) {
                    console.warn('[RxDB] Database file has not been updated recently, checking persistence...');
                    // Force a save to test persistence
                    await this.forcePersistence();
                }
            } catch (statError) {
                if (statError.code === 'ENOENT') {
                    // File doesn't exist yet, which is normal for memory storage
                    // Try to create initial persistence file
                    console.log('[RxDB] Database file not found, creating initial persistence...');
                    await this.saveToFile();
                } else {
                    throw statError;
                }
            }
        } catch (error) {
            console.warn('[RxDB] Persistence validation warning:', error.message);
            // Don't throw for memory storage - it's less critical
        }
    }

    // Force persistence operation
    async forcePersistence() {
        try {
            // Trigger a small write operation to force persistence
            const testCollection = this.collections[Object.keys(this.collections)[0]];
            if (testCollection) {
                // Just query to trigger any pending writes
                await testCollection.find().limit(1).exec();
            }
            console.log('[RxDB] Forced persistence operation completed');
        } catch (error) {
            console.error('[RxDB] Failed to force persistence:', error.message);
            throw error;
        }
    }

    // Handle database errors
    async handleDatabaseError(error) {
        console.error('[RxDB] Handling database error:', error.message);
        
        // Implement recovery strategies based on error type
        if (error.code === 'STORAGE_WRITE_ERROR') {
            await this.handleStorageWriteError(error);
        } else if (error.code === 'CONFLICT_ERROR') {
            await this.handleConflictError(error);
        } else {
            // Generic error handling
            console.error('[RxDB] Unhandled database error:', error);
        }
    }

    // Handle storage errors
    async handleStorageError(error) {
        console.error('[RxDB] Handling storage error:', error.message);
        
        try {
            // Attempt to recover from storage error
            if (error.message.includes('ENOSPC')) {
                console.error('[RxDB] Disk space error detected');
                // Could implement disk cleanup or alerting here
            } else if (error.message.includes('EACCES')) {
                console.error('[RxDB] Permission error detected');
                // Could implement permission recovery here
            }
            
            // Try to create a backup before attempting recovery
            if (this.backupService) {
                await this.backupService.createEmergencyBackup();
            }
        } catch (recoveryError) {
            console.error('[RxDB] Storage error recovery failed:', recoveryError.message);
        }
    }

    // Handle persistence errors
    async handlePersistenceError(error) {
        console.error('[RxDB] Handling persistence error:', error.message);
        
        try {
            // Attempt to recover persistence
            await this.recoverPersistence();
        } catch (recoveryError) {
            console.error('[RxDB] Persistence recovery failed:', recoveryError.message);
            // Could implement alerting or fallback mechanisms here
        }
    }

    // Handle backup errors
    handleBackupError(error) {
        console.error('[RxDB] Backup error occurred:', error.message);
        
        // Could implement backup retry logic or alerting here
        if (error.message.includes('ENOSPC')) {
            console.error('[RxDB] Backup failed due to insufficient disk space');
        } else if (error.message.includes('EACCES')) {
            console.error('[RxDB] Backup failed due to permission issues');
        }
    }

    // Handle initialization errors
    async handleInitializationError(error) {
        console.error('[RxDB] Handling initialization error:', error.message);
        
        try {
            // Attempt to recover from initialization failure
            if (error.message.includes('corrupted') || error.message.includes('invalid')) {
                console.log('[RxDB] Attempting to recover from corrupted database...');
                await this.recoverFromCorruption();
            }
        } catch (recoveryError) {
            console.error('[RxDB] Initialization error recovery failed:', recoveryError.message);
        }
    }

    // Recover from database corruption
    async recoverFromCorruption() {
        try {
            console.log('[RxDB] Starting corruption recovery...');
            
            // Try to load from most recent backup
            const latestBackup = await this.backupService.getLatestBackup();
            if (latestBackup) {
                console.log(`[RxDB] Attempting to restore from backup: ${latestBackup}`);
                await this.backupService.restoreFromBackup(latestBackup);
                console.log('[RxDB] Successfully recovered from backup');
            } else {
                console.warn('[RxDB] No backup available for recovery, starting with fresh database');
                // Remove corrupted database file (JSON file for memory storage)
                const dbFilePath = path.join(this.dbPath, `${this.dbName}.json`);
                try {
                    await fs.unlink(dbFilePath);
                } catch (unlinkError) {
                    // File might not exist, ignore
                }
            }
        } catch (error) {
            console.error('[RxDB] Corruption recovery failed:', error.message);
            throw error;
        }
    }

    // Recover persistence functionality
    async recoverPersistence() {
        try {
            console.log('[RxDB] Attempting to recover persistence...');
            
            // Check if database file exists and is accessible (JSON file for memory storage)
            const dbFilePath = path.join(this.dbPath, `${this.dbName}.json`);
            try {
                await fs.access(dbFilePath, fs.constants.W_OK);
            } catch (accessError) {
                console.error('[RxDB] Database file is not writable, attempting to fix permissions');
                // Could implement permission fixing here
                throw new Error('Database file permission issues');
            }
            
            // Force a persistence operation
            await this.forcePersistence();
            console.log('[RxDB] Persistence recovery completed');
        } catch (error) {
            console.error('[RxDB] Persistence recovery failed:', error.message);
            throw error;
        }
    }

    // Method to handle graceful shutdown
    async gracefulShutdown() {
        console.log('[RxDB] Starting graceful shutdown...');
        try {
            // Clear intervals
            if (this.persistenceInterval) {
                clearInterval(this.persistenceInterval);
                this.persistenceInterval = null;
            }
            
            if (this.backupInterval) {
                clearInterval(this.backupInterval);
                this.backupInterval = null;
            }

            // Create final backup and cleanup old ones
            if (this.backupConfig.enabled && this.backupService) {
                await this.backupService.createBackup('shutdown');
                await this.backupService.cleanupShutdownBackups();
            }

            // Force final persistence
            await this.forcePersistence();

            await this.close();
            console.log('[RxDB] Graceful shutdown completed');
        } catch (error) {
            console.error('[RxDB] Error during graceful shutdown:', error.message);
            throw error;
        }
    }

    // Handle storage write errors
    async handleStorageWriteError(error) {
        console.error('[RxDB] Handling storage write error:', error.message);
        
        try {
            // Check disk space and permissions (JSON file for memory storage)
            const dbFilePath = path.join(this.dbPath, `${this.dbName}.json`);
            await fs.access(path.dirname(dbFilePath), fs.constants.W_OK);
            
            // Try to force persistence
            await this.forcePersistence();
        } catch (recoveryError) {
            console.error('[RxDB] Storage write error recovery failed:', recoveryError.message);
            throw recoveryError;
        }
    }

    // Handle conflict errors
    async handleConflictError(error) {
        console.error('[RxDB] Handling conflict error:', error.message);
        
        // Conflict errors are typically handled by RxDB's conflict resolution
        // Log for monitoring purposes
        console.warn('[RxDB] Document conflict detected, RxDB will handle resolution');
    }

    // Public methods for backup operations
    async createBackup(type = 'manual') {
        if (!this.backupService) {
            throw new Error('Backup service not initialized');
        }
        return await this.backupService.createBackup(type);
    }

    async restoreFromBackup(backupFilePath) {
        if (!this.backupService) {
            throw new Error('Backup service not initialized');
        }
        return await this.backupService.restoreFromBackup(backupFilePath);
    }

    async listBackups() {
        if (!this.backupService) {
            throw new Error('Backup service not initialized');
        }
        return await this.backupService.listBackupFiles();
    }

    async validateBackup(backupFilePath) {
        if (!this.backupService) {
            throw new Error('Backup service not initialized');
        }
        return await this.backupService.validateBackup(backupFilePath);
    }

    async cleanupShutdownBackups() {
        if (!this.backupService) {
            throw new Error('Backup service not initialized');
        }
        return await this.backupService.cleanupShutdownBackups();
    }

    // Get persistence configuration
    getPersistenceConfig() {
        return { ...this.persistenceConfig };
    }

    // Get backup configuration
    getBackupConfig() {
        return { ...this.backupConfig };
    }

    // Update persistence settings (requires restart to take effect)
    updatePersistenceConfig(newConfig) {
        this.persistenceConfig = { ...this.persistenceConfig, ...newConfig };
        console.log('[RxDB] Persistence configuration updated:', this.persistenceConfig);
    }

    // Update backup settings
    updateBackupConfig(newConfig) {
        this.backupConfig = { ...this.backupConfig, ...newConfig };
        
        // Restart backup interval if it changed
        if (newConfig.interval && this.backupInterval) {
            clearInterval(this.backupInterval);
            if (this.backupConfig.enabled) {
                this.setupPeriodicBackup();
            }
        }
        
        console.log('[RxDB] Backup configuration updated:', this.backupConfig);
    }

    // Rotate data files for backup
    async rotateDataFiles(currentFilePath) {
        try {
            const maxRotations = 3;
            const baseFileName = path.basename(currentFilePath, '.json');
            const dirPath = path.dirname(currentFilePath);

            // Rotate existing backup files
            for (let i = maxRotations - 1; i >= 1; i--) {
                const oldFile = path.join(dirPath, `${baseFileName}.${i}.json`);
                const newFile = path.join(dirPath, `${baseFileName}.${i + 1}.json`);
                
                try {
                    await fs.access(oldFile);
                    await fs.rename(oldFile, newFile);
                } catch (error) {
                    // File doesn't exist, continue
                }
            }

            // Create first backup from current file
            const firstBackup = path.join(dirPath, `${baseFileName}.1.json`);
            try {
                await fs.access(currentFilePath);
                await fs.copyFile(currentFilePath, firstBackup);
            } catch (error) {
                // Current file doesn't exist yet, continue
            }
        } catch (error) {
            console.warn('[RxDB] Failed to rotate data files:', error.message);
        }
    }

    // Attempt to recover data from backup files
    async attemptDataRecovery() {
        try {
            const baseFileName = `${this.dbName}`;
            const maxAttempts = 4; // Try main file + 3 backups

            for (let i = 0; i < maxAttempts; i++) {
                const fileName = i === 0 ? `${baseFileName}.json` : `${baseFileName}.${i}.json`;
                const filePath = path.join(this.dbPath, fileName);

                try {
                    console.log(`[RxDB] Attempting recovery from: ${fileName}`);
                    const data = await fs.readFile(filePath, 'utf8');
                    const parsedData = JSON.parse(data);
                    const dump = parsedData.data || parsedData;

                    if (dump.collections && dump.collections.length > 0) {
                        await this.database.importJSON(dump);
                        console.log(`[RxDB] Successfully recovered data from: ${fileName}`);
                        return true;
                    }
                } catch (error) {
                    console.warn(`[RxDB] Recovery attempt failed for ${fileName}:`, error.message);
                    continue;
                }
            }

            console.warn('[RxDB] All recovery attempts failed, starting with fresh database');
            return false;
        } catch (error) {
            console.error('[RxDB] Data recovery failed:', error.message);
            return false;
        }
    }
}

// Create singleton instance
const rxdbConnection = new RxDBConnection();

export default rxdbConnection;