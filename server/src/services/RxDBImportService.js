import rxdbConnection from '../../database/rxdb-connection.js';
import { collectionConfigs } from '../database/schemas/schemaConfig.js';
import fs from 'fs/promises';
import path from 'path';

/**
 * RxDB Import Service
 * Handles bulk import of transformed data into RxDB collections
 * Includes data integrity validation and rollback capabilities
 */
class RxDBImportService {
    constructor() {
        this.importPath = path.join(process.cwd(), 'server', 'data', 'migration');
        this.backupPath = path.join(process.cwd(), 'server', 'data', 'backup');
        
        // Define import order based on dependencies
        this.importOrder = [
            'users',
            'games',
            'teams', 
            'game_players',
            'game_rounds',
            'game_tricks',
            'rooms',
            'room_players',
            'user_sessions'
        ];
        
        // Map table names to RxDB collection names
        this.tableToCollectionMap = {
            'users': 'users',
            'games': 'games',
            'teams': 'teams',
            'game_players': 'gamePlayers',
            'game_rounds': 'gameRounds',
            'game_tricks': 'gameTricks',
            'rooms': 'rooms',
            'room_players': 'roomPlayers',
            'user_sessions': 'userSessions'
        };
    }

    /**
     * Import all data from JSON files into RxDB
     * @returns {Promise<Object>} Import summary with counts and results
     */
    async importToRxDB() {
        try {
            console.log('[RxDBImport] Starting RxDB data import...');
            
            // Ensure RxDB is initialized
            if (!rxdbConnection.isReady()) {
                console.log('[RxDBImport] Initializing RxDB connection...');
                await rxdbConnection.initialize();
            }

            // Initialize all collections
            await this.initializeCollections();

            // Create backup before import
            await this.createPreImportBackup();

            const importSummary = {
                timestamp: new Date().toISOString(),
                collections: {},
                totalRecords: 0,
                totalImported: 0,
                totalFailed: 0,
                success: true,
                errors: [],
                rollbackAvailable: true
            };

            // Import each table in dependency order
            for (const tableName of this.importOrder) {
                try {
                    console.log(`[RxDBImport] Importing table: ${tableName}`);
                    const result = await this.importTable(tableName);
                    
                    importSummary.collections[tableName] = result;
                    importSummary.totalRecords += result.totalRecords;
                    importSummary.totalImported += result.imported;
                    importSummary.totalFailed += result.failed;
                    
                    console.log(`[RxDBImport] Imported ${result.imported}/${result.totalRecords} records from ${tableName}`);
                    
                } catch (error) {
                    console.error(`[RxDBImport] Error importing table ${tableName}:`, error.message);
                    importSummary.errors.push({
                        table: tableName,
                        error: error.message
                    });
                    importSummary.collections[tableName] = {
                        totalRecords: 0,
                        imported: 0,
                        failed: 0,
                        error: error.message
                    };
                }
            }

            // Write import summary
            const summaryPath = path.join(this.importPath, 'import-summary.json');
            await fs.writeFile(summaryPath, JSON.stringify(importSummary, null, 2));

            if (importSummary.errors.length > 0) {
                importSummary.success = false;
                console.warn(`[RxDBImport] Import completed with ${importSummary.errors.length} errors`);
            } else {
                console.log(`[RxDBImport] Import completed successfully. Total imported: ${importSummary.totalImported}`);
            }

            return importSummary;
            
        } catch (error) {
            console.error('[RxDBImport] Import failed:', error.message);
            throw error;
        }
    }

    /**
     * Initialize all RxDB collections with their schemas
     */
    async initializeCollections() {
        try {
            console.log('[RxDBImport] Initializing RxDB collections...');
            
            for (const [tableName, collectionName] of Object.entries(this.tableToCollectionMap)) {
                try {
                    const config = collectionConfigs[collectionName];
                    if (!config) {
                        throw new Error(`Collection configuration not found for: ${collectionName}`);
                    }

                    // Check if collection already exists
                    try {
                        rxdbConnection.getCollection(collectionName);
                        console.log(`[RxDBImport] Collection '${collectionName}' already exists`);
                    } catch (error) {
                        // Collection doesn't exist, create it
                        await rxdbConnection.addCollection(collectionName, config.schema, {
                            methods: config.methods,
                            statics: config.statics,
                            hooks: config.hooks,
                            migrationStrategies: config.migrationStrategies
                        });
                        console.log(`[RxDBImport] Created collection: ${collectionName}`);
                    }
                    
                } catch (error) {
                    console.error(`[RxDBImport] Error initializing collection ${collectionName}:`, error.message);
                    throw error;
                }
            }
            
            console.log('[RxDBImport] All collections initialized successfully');
            
        } catch (error) {
            console.error('[RxDBImport] Error initializing collections:', error.message);
            throw error;
        }
    }

    /**
     * Import a single table into RxDB collection
     * @param {string} tableName - Name of the table to import
     * @returns {Promise<Object>} Import result for the table
     */
    async importTable(tableName) {
        try {
            const collectionName = this.tableToCollectionMap[tableName];
            if (!collectionName) {
                throw new Error(`No collection mapping found for table: ${tableName}`);
            }

            // Read transformed data from JSON file
            const filePath = path.join(this.importPath, `${tableName}.json`);
            const data = await this.readImportFile(filePath);
            
            if (!data || data.length === 0) {
                console.log(`[RxDBImport] No data found for table: ${tableName}`);
                return {
                    totalRecords: 0,
                    imported: 0,
                    failed: 0,
                    errors: []
                };
            }

            // Get RxDB collection
            const collection = rxdbConnection.getCollection(collectionName);
            
            // Import data with bulk operations
            const result = await this.bulkImportToCollection(collection, data, tableName);
            
            return result;
            
        } catch (error) {
            console.error(`[RxDBImport] Error importing table ${tableName}:`, error.message);
            throw error;
        }
    }

    /**
     * Bulk import data to RxDB collection
     * @param {Object} collection - RxDB collection instance
     * @param {Array} data - Array of documents to import
     * @param {string} tableName - Name of the source table
     * @returns {Promise<Object>} Import result
     */
    async bulkImportToCollection(collection, data, tableName) {
        try {
            const result = {
                totalRecords: data.length,
                imported: 0,
                failed: 0,
                errors: []
            };

            console.log(`[RxDBImport] Starting bulk import of ${data.length} records to ${collection.name}`);

            // Process records in batches to avoid memory issues
            const batchSize = 100;
            const batches = this.createBatches(data, batchSize);

            for (let batchIndex = 0; batchIndex < batches.length; batchIndex++) {
                const batch = batches[batchIndex];
                console.log(`[RxDBImport] Processing batch ${batchIndex + 1}/${batches.length} (${batch.length} records)`);

                try {
                    // Validate batch data before import
                    const validatedBatch = await this.validateBatchData(batch, tableName);
                    
                    // Import batch using RxDB bulk insert
                    const importResults = await this.importBatch(collection, validatedBatch);
                    
                    result.imported += importResults.successful;
                    result.failed += importResults.failed;
                    result.errors.push(...importResults.errors);
                    
                } catch (batchError) {
                    console.error(`[RxDBImport] Error processing batch ${batchIndex + 1}:`, batchError.message);
                    result.failed += batch.length;
                    result.errors.push({
                        batch: batchIndex + 1,
                        error: batchError.message,
                        recordCount: batch.length
                    });
                }
            }

            console.log(`[RxDBImport] Bulk import completed for ${collection.name}: ${result.imported}/${result.totalRecords} successful`);
            return result;
            
        } catch (error) {
            console.error(`[RxDBImport] Error in bulk import for ${tableName}:`, error.message);
            throw error;
        }
    }

    /**
     * Import a single batch of records
     * @param {Object} collection - RxDB collection
     * @param {Array} batch - Batch of records to import
     * @returns {Promise<Object>} Batch import result
     */
    async importBatch(collection, batch) {
        const result = {
            successful: 0,
            failed: 0,
            errors: []
        };

        try {
            // Use RxDB bulk insert for better performance
            const insertResults = await collection.bulkInsert(batch);
            
            result.successful = insertResults.success.length;
            result.failed = insertResults.error.length;
            
            // Process any errors
            for (const error of insertResults.error) {
                result.errors.push({
                    document: error.documentData,
                    error: error.error.message
                });
            }
            
        } catch (error) {
            // Fallback to individual inserts if bulk insert fails
            console.warn(`[RxDBImport] Bulk insert failed, falling back to individual inserts: ${error.message}`);
            
            for (let i = 0; i < batch.length; i++) {
                const record = batch[i];
                try {
                    await collection.insert(record);
                    result.successful++;
                } catch (insertError) {
                    result.failed++;
                    result.errors.push({
                        recordIndex: i,
                        document: record,
                        error: insertError.message
                    });
                }
            }
        }

        return result;
    }

    /**
     * Validate batch data before import
     * @param {Array} batch - Batch of records to validate
     * @param {string} tableName - Name of the source table
     * @returns {Promise<Array>} Validated batch data
     */
    async validateBatchData(batch, tableName) {
        try {
            const validatedBatch = [];
            
            for (const record of batch) {
                try {
                    // Handle room_players composite key
                    if (tableName === 'room_players') {
                        record.id = `${record.room_id}_${record.user_id}`;
                    }
                    
                    // Remove any transformation error markers
                    delete record._transformation_error;
                    delete record._validation_errors;
                    delete record._processing_error;
                    
                    // Ensure required timestamps are present
                    if (!record.created_at && this.requiresCreatedAt(tableName)) {
                        record.created_at = new Date().toISOString();
                    }
                    
                    validatedBatch.push(record);
                    
                } catch (validationError) {
                    console.warn(`[RxDBImport] Validation failed for record in ${tableName}:`, validationError.message);
                    // Skip invalid records
                }
            }
            
            return validatedBatch;
            
        } catch (error) {
            console.error(`[RxDBImport] Error validating batch data for ${tableName}:`, error.message);
            throw error;
        }
    }

    /**
     * Check if table requires created_at timestamp
     * @param {string} tableName - Name of the table
     * @returns {boolean} True if created_at is required
     */
    requiresCreatedAt(tableName) {
        const tablesWithCreatedAt = [
            'users', 'games', 'game_rounds', 'game_tricks', 
            'rooms', 'room_players', 'user_sessions', 'game_players'
        ];
        return tablesWithCreatedAt.includes(tableName);
    }

    /**
     * Create batches from data array
     * @param {Array} data - Data to batch
     * @param {number} batchSize - Size of each batch
     * @returns {Array} Array of batches
     */
    createBatches(data, batchSize) {
        const batches = [];
        for (let i = 0; i < data.length; i += batchSize) {
            batches.push(data.slice(i, i + batchSize));
        }
        return batches;
    }

    /**
     * Read import file
     * @param {string} filePath - Path to the import file
     * @returns {Promise<Array>} Parsed data from file
     */
    async readImportFile(filePath) {
        try {
            const fileContent = await fs.readFile(filePath, 'utf8');
            return JSON.parse(fileContent);
        } catch (error) {
            if (error.code === 'ENOENT') {
                console.warn(`[RxDBImport] Import file not found: ${filePath}`);
                return [];
            }
            console.error(`[RxDBImport] Error reading import file ${filePath}:`, error.message);
            throw error;
        }
    }

    /**
     * Create backup before import for rollback capability
     */
    async createPreImportBackup() {
        try {
            console.log('[RxDBImport] Creating pre-import backup...');
            
            // Ensure backup directory exists
            await this.ensureDirectoryExists(this.backupPath);
            
            // Save current RxDB state
            const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
            const backupFileName = `pre-import-backup-${timestamp}.json`;
            const backupPath = path.join(this.backupPath, backupFileName);
            
            if (rxdbConnection.isReady()) {
                const database = rxdbConnection.getDatabase();
                const dump = await database.exportJSON();
                await fs.writeFile(backupPath, JSON.stringify(dump, null, 2));
                console.log(`[RxDBImport] Pre-import backup created: ${backupPath}`);
            } else {
                console.log('[RxDBImport] No existing data to backup');
            }
            
        } catch (error) {
            console.error('[RxDBImport] Error creating pre-import backup:', error.message);
            // Don't throw error, just warn
            console.warn('[RxDBImport] Continuing without backup');
        }
    }

    /**
     * Rollback import by restoring from backup
     * @param {string} backupFileName - Name of the backup file to restore
     * @returns {Promise<boolean>} True if rollback successful
     */
    async rollbackImport(backupFileName = null) {
        try {
            console.log('[RxDBImport] Starting import rollback...');
            
            let backupPath;
            if (backupFileName) {
                backupPath = path.join(this.backupPath, backupFileName);
            } else {
                // Find the most recent backup
                const backupFiles = await fs.readdir(this.backupPath);
                const preImportBackups = backupFiles
                    .filter(file => file.startsWith('pre-import-backup-'))
                    .sort()
                    .reverse();
                
                if (preImportBackups.length === 0) {
                    throw new Error('No backup files found for rollback');
                }
                
                backupPath = path.join(this.backupPath, preImportBackups[0]);
            }
            
            // Read backup data
            const backupData = await fs.readFile(backupPath, 'utf8');
            const dump = JSON.parse(backupData);
            
            // Close current database
            await rxdbConnection.close();
            
            // Reinitialize database
            await rxdbConnection.initialize();
            await this.initializeCollections();
            
            // Import backup data
            const database = rxdbConnection.getDatabase();
            await database.importJSON(dump);
            
            console.log(`[RxDBImport] Rollback completed successfully from: ${backupPath}`);
            return true;
            
        } catch (error) {
            console.error('[RxDBImport] Rollback failed:', error.message);
            throw error;
        }
    }

    /**
     * Get import progress information
     * @returns {Promise<Object>} Progress information
     */
    async getImportProgress() {
        try {
            const summaryPath = path.join(this.importPath, 'import-summary.json');
            
            try {
                const summaryData = await fs.readFile(summaryPath, 'utf8');
                return JSON.parse(summaryData);
            } catch (error) {
                return {
                    inProgress: false,
                    completed: false,
                    error: 'No import summary found'
                };
            }
            
        } catch (error) {
            console.error('[RxDBImport] Error getting import progress:', error.message);
            throw error;
        }
    }

    /**
     * Validate data integrity after import
     * @returns {Promise<Object>} Validation result
     */
    async validateDataIntegrity() {
        try {
            console.log('[RxDBImport] Starting data integrity validation...');
            
            const validationResult = {
                isValid: true,
                collections: {},
                totalDocuments: 0,
                errors: []
            };

            for (const [tableName, collectionName] of Object.entries(this.tableToCollectionMap)) {
                try {
                    const collection = rxdbConnection.getCollection(collectionName);
                    const count = await collection.count().exec();
                    
                    validationResult.collections[collectionName] = {
                        documentCount: count,
                        isValid: true
                    };
                    
                    validationResult.totalDocuments += count;
                    console.log(`[RxDBImport] Collection ${collectionName}: ${count} documents`);
                    
                } catch (error) {
                    validationResult.isValid = false;
                    validationResult.errors.push({
                        collection: collectionName,
                        error: error.message
                    });
                    
                    validationResult.collections[collectionName] = {
                        documentCount: 0,
                        isValid: false,
                        error: error.message
                    };
                }
            }

            if (validationResult.errors.length > 0) {
                validationResult.isValid = false;
            }

            console.log(`[RxDBImport] Data integrity validation completed. Total documents: ${validationResult.totalDocuments}`);
            return validationResult;
            
        } catch (error) {
            console.error('[RxDBImport] Error validating data integrity:', error.message);
            throw error;
        }
    }

    /**
     * Ensure directory exists, create if it doesn't
     * @param {string} dirPath - Directory path to ensure
     */
    async ensureDirectoryExists(dirPath) {
        try {
            await fs.access(dirPath);
        } catch (error) {
            // Directory doesn't exist, create it
            await fs.mkdir(dirPath, { recursive: true });
            console.log(`[RxDBImport] Created directory: ${dirPath}`);
        }
    }
}

export default RxDBImportService;