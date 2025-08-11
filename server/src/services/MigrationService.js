import dbConnection from '../database/connection.js';
import fs from 'fs/promises';
import path from 'path';
import DataTransformationService from './DataTransformationService.js';
import RxDBImportService from './RxDBImportService.js';

/**
 * Migration Service for exporting data from MariaDB and importing to RxDB
 * Handles the complete migration process with validation and rollback capabilities
 */
class MigrationService {
    constructor() {
        this.exportPath = path.join(process.cwd(), 'server', 'data', 'migration');
        this.backupPath = path.join(process.cwd(), 'server', 'data', 'backup');
        this.transformationService = new DataTransformationService();
        this.rxdbImportService = new RxDBImportService();
        
        // Define all tables that need to be migrated
        this.tables = [
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
        
        // Define table dependencies for proper import order
        this.tableDependencies = {
            'users': [],
            'games': ['users'],
            'teams': ['games', 'users'],
            'game_players': ['games', 'users', 'teams'],
            'game_rounds': ['games', 'users', 'teams'],
            'game_tricks': ['game_rounds', 'users'],
            'rooms': ['users'],
            'room_players': ['rooms', 'users'],
            'user_sessions': ['users']
        };
    }

    /**
     * Export all data from MariaDB to JSON files
     * @returns {Promise<Object>} Export summary with counts and file paths
     */
    async exportFromMariaDB() {
        try {
            console.log('[Migration] Starting MariaDB data export...');
            
            // Ensure export directory exists
            await this.ensureDirectoryExists(this.exportPath);
            
            const exportSummary = {
                timestamp: new Date().toISOString(),
                tables: {},
                totalRecords: 0,
                exportPath: this.exportPath,
                success: true,
                errors: []
            };

            // Export each table
            for (const tableName of this.tables) {
                try {
                    console.log(`[Migration] Exporting table: ${tableName}`);
                    const tableData = await this.exportTable(tableName);
                    
                    exportSummary.tables[tableName] = {
                        recordCount: tableData.length,
                        filePath: path.join(this.exportPath, `${tableName}.json`),
                        exported: true
                    };
                    
                    exportSummary.totalRecords += tableData.length;
                    console.log(`[Migration] Exported ${tableData.length} records from ${tableName}`);
                    
                } catch (error) {
                    console.error(`[Migration] Error exporting table ${tableName}:`, error.message);
                    exportSummary.errors.push({
                        table: tableName,
                        error: error.message
                    });
                    exportSummary.tables[tableName] = {
                        recordCount: 0,
                        exported: false,
                        error: error.message
                    };
                }
            }

            // Write export summary
            const summaryPath = path.join(this.exportPath, 'export-summary.json');
            await fs.writeFile(summaryPath, JSON.stringify(exportSummary, null, 2));
            
            if (exportSummary.errors.length > 0) {
                exportSummary.success = false;
                console.warn(`[Migration] Export completed with ${exportSummary.errors.length} errors`);
            } else {
                console.log(`[Migration] Export completed successfully. Total records: ${exportSummary.totalRecords}`);
            }

            return exportSummary;
            
        } catch (error) {
            console.error('[Migration] Export failed:', error.message);
            throw error;
        }
    }

    /**
     * Export a single table to JSON file
     * @param {string} tableName - Name of the table to export
     * @returns {Promise<Array>} Array of records from the table
     */
    async exportTable(tableName) {
        try {
            // Get table structure first for validation
            const tableStructure = await this.getTableStructure(tableName);
            console.log(`[Migration] Table ${tableName} has ${tableStructure.length} columns`);

            // Export all data from table
            const query = `SELECT * FROM ${tableName} ORDER BY created_at ASC`;
            const rows = await dbConnection.query(query);
            
            // Transform data from MariaDB to RxDB format
            const transformedData = await this.transformationService.transformMariaDBToRxDB(tableName, rows);
            
            // Validate transformed data
            const validationResult = await this.transformationService.validateTransformedData(tableName, transformedData);
            
            // Write to JSON file
            const filePath = path.join(this.exportPath, `${tableName}.json`);
            await fs.writeFile(filePath, JSON.stringify(transformedData, null, 2));
            
            // Write validation report
            const validationPath = path.join(this.exportPath, `${tableName}-validation.json`);
            await fs.writeFile(validationPath, JSON.stringify(validationResult, null, 2));
            
            return transformedData;
            
        } catch (error) {
            console.error(`[Migration] Error exporting table ${tableName}:`, error.message);
            throw error;
        }
    }

    /**
     * Get table structure information
     * @param {string} tableName - Name of the table
     * @returns {Promise<Array>} Array of column information
     */
    async getTableStructure(tableName) {
        try {
            const query = `DESCRIBE ${tableName}`;
            const columns = await dbConnection.query(query);
            return columns;
        } catch (error) {
            console.error(`[Migration] Error getting table structure for ${tableName}:`, error.message);
            throw error;
        }
    }

    /**
     * Validate and transform table data for export
     * @param {string} tableName - Name of the table
     * @param {Array} rows - Raw data rows from database
     * @returns {Promise<Array>} Validated and transformed data
     */
    async validateAndTransformTableData(tableName, rows) {
        try {
            const transformedRows = [];
            
            for (let i = 0; i < rows.length; i++) {
                const row = rows[i];
                
                try {
                    // Transform the row based on table-specific rules
                    const transformedRow = await this.transformRowForExport(tableName, row);
                    
                    // Validate the transformed row
                    const validationResult = await this.validateRowData(tableName, transformedRow);
                    
                    if (validationResult.isValid) {
                        transformedRows.push(transformedRow);
                    } else {
                        console.warn(`[Migration] Invalid row in ${tableName} at index ${i}:`, validationResult.errors);
                        // Still include the row but mark it for review
                        transformedRow._validation_errors = validationResult.errors;
                        transformedRows.push(transformedRow);
                    }
                    
                } catch (rowError) {
                    console.error(`[Migration] Error processing row ${i} in ${tableName}:`, rowError.message);
                    // Include the original row with error information
                    row._processing_error = rowError.message;
                    transformedRows.push(row);
                }
            }
            
            return transformedRows;
            
        } catch (error) {
            console.error(`[Migration] Error validating table data for ${tableName}:`, error.message);
            throw error;
        }
    }

    /**
     * Transform a single row for export (MariaDB to RxDB format)
     * @param {string} tableName - Name of the table
     * @param {Object} row - Raw row data from MariaDB
     * @returns {Promise<Object>} Transformed row data
     */
    async transformRowForExport(tableName, row) {
        try {
            const transformedRow = { ...row };
            
            // Transform timestamps to ISO 8601 format
            for (const [key, value] of Object.entries(transformedRow)) {
                if (value instanceof Date) {
                    transformedRow[key] = value.toISOString();
                } else if (typeof value === 'string' && this.isTimestampField(key)) {
                    // Handle string timestamps from MariaDB
                    const date = new Date(value);
                    if (!isNaN(date.getTime())) {
                        transformedRow[key] = date.toISOString();
                    }
                }
            }
            
            // Handle JSON fields
            if (tableName === 'rooms') {
                if (typeof transformedRow.game_state === 'string') {
                    try {
                        transformedRow.game_state = JSON.parse(transformedRow.game_state);
                    } catch (e) {
                        console.warn(`[Migration] Invalid JSON in game_state for room ${transformedRow.room_id}`);
                        transformedRow.game_state = null;
                    }
                }
                
                if (typeof transformedRow.settings === 'string') {
                    try {
                        transformedRow.settings = JSON.parse(transformedRow.settings);
                    } catch (e) {
                        console.warn(`[Migration] Invalid JSON in settings for room ${transformedRow.room_id}`);
                        transformedRow.settings = {
                            timeLimit: 30,
                            allowSpectators: true,
                            autoStart: false
                        };
                    }
                }
            }
            
            if (tableName === 'game_players' && typeof transformedRow.current_hand === 'string') {
                try {
                    transformedRow.current_hand = JSON.parse(transformedRow.current_hand);
                } catch (e) {
                    console.warn(`[Migration] Invalid JSON in current_hand for game_player ${transformedRow.game_player_id}`);
                    transformedRow.current_hand = null;
                }
            }
            
            if (tableName === 'game_tricks' && typeof transformedRow.cards_played === 'string') {
                try {
                    transformedRow.cards_played = JSON.parse(transformedRow.cards_played);
                } catch (e) {
                    console.warn(`[Migration] Invalid JSON in cards_played for trick ${transformedRow.trick_id}`);
                    transformedRow.cards_played = [];
                }
            }
            
            return transformedRow;
            
        } catch (error) {
            console.error(`[Migration] Error transforming row in ${tableName}:`, error.message);
            throw error;
        }
    }

    /**
     * Check if a field name represents a timestamp
     * @param {string} fieldName - Name of the field
     * @returns {boolean} True if field is a timestamp
     */
    isTimestampField(fieldName) {
        const timestampFields = [
            'created_at', 'updated_at', 'started_at', 'finished_at', 
            'completed_at', 'last_login', 'expires_at', 'last_used_at',
            'joined_at', 'round_completed_at'
        ];
        return timestampFields.includes(fieldName);
    }

    /**
     * Validate row data against expected schema
     * @param {string} tableName - Name of the table
     * @param {Object} row - Row data to validate
     * @returns {Promise<Object>} Validation result with isValid flag and errors
     */
    async validateRowData(tableName, row) {
        try {
            const errors = [];
            
            // Basic validation rules for each table
            switch (tableName) {
                case 'users':
                    if (!row.user_id) errors.push('Missing user_id');
                    if (!row.username) errors.push('Missing username');
                    if (!row.email) errors.push('Missing email');
                    if (!row.password_hash) errors.push('Missing password_hash');
                    break;
                    
                case 'games':
                    if (!row.game_id) errors.push('Missing game_id');
                    if (!row.game_code) errors.push('Missing game_code');
                    if (!row.host_id) errors.push('Missing host_id');
                    if (!['waiting', 'in_progress', 'completed', 'cancelled'].includes(row.status)) {
                        errors.push(`Invalid status: ${row.status}`);
                    }
                    break;
                    
                case 'rooms':
                    if (!row.room_id) errors.push('Missing room_id');
                    if (!row.name) errors.push('Missing name');
                    if (!row.owner_id) errors.push('Missing owner_id');
                    if (!['waiting', 'playing', 'finished'].includes(row.status)) {
                        errors.push(`Invalid status: ${row.status}`);
                    }
                    break;
                    
                case 'teams':
                    if (!row.team_id) errors.push('Missing team_id');
                    if (!row.game_id) errors.push('Missing game_id');
                    if (![1, 2].includes(row.team_number)) {
                        errors.push(`Invalid team_number: ${row.team_number}`);
                    }
                    break;
                    
                // Add more validation rules as needed
            }
            
            return {
                isValid: errors.length === 0,
                errors: errors
            };
            
        } catch (error) {
            console.error(`[Migration] Error validating row data for ${tableName}:`, error.message);
            return {
                isValid: false,
                errors: [`Validation error: ${error.message}`]
            };
        }
    }

    /**
     * Get export progress information
     * @returns {Promise<Object>} Progress information
     */
    async getExportProgress() {
        try {
            const summaryPath = path.join(this.exportPath, 'export-summary.json');
            
            try {
                const summaryData = await fs.readFile(summaryPath, 'utf8');
                return JSON.parse(summaryData);
            } catch (error) {
                return {
                    inProgress: false,
                    completed: false,
                    error: 'No export summary found'
                };
            }
            
        } catch (error) {
            console.error('[Migration] Error getting export progress:', error.message);
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
            console.log(`[Migration] Created directory: ${dirPath}`);
        }
    }

    /**
     * Complete migration from MariaDB to RxDB
     * @returns {Promise<Object>} Complete migration summary
     */
    async performCompleteMigration() {
        try {
            console.log('[Migration] Starting complete migration from MariaDB to RxDB...');
            
            const migrationSummary = {
                timestamp: new Date().toISOString(),
                phases: {},
                success: true,
                errors: []
            };

            // Phase 1: Export from MariaDB
            try {
                console.log('[Migration] Phase 1: Exporting from MariaDB...');
                const exportResult = await this.exportFromMariaDB();
                migrationSummary.phases.export = exportResult;
                
                if (!exportResult.success) {
                    throw new Error('MariaDB export failed');
                }
                
            } catch (error) {
                migrationSummary.success = false;
                migrationSummary.errors.push({
                    phase: 'export',
                    error: error.message
                });
                throw error;
            }

            // Phase 2: Import to RxDB
            try {
                console.log('[Migration] Phase 2: Importing to RxDB...');
                const importResult = await this.rxdbImportService.importToRxDB();
                migrationSummary.phases.import = importResult;
                
                if (!importResult.success) {
                    throw new Error('RxDB import failed');
                }
                
            } catch (error) {
                migrationSummary.success = false;
                migrationSummary.errors.push({
                    phase: 'import',
                    error: error.message
                });
                throw error;
            }

            // Phase 3: Validate data integrity
            try {
                console.log('[Migration] Phase 3: Validating data integrity...');
                const validationResult = await this.rxdbImportService.validateDataIntegrity();
                migrationSummary.phases.validation = validationResult;
                
                if (!validationResult.isValid) {
                    console.warn('[Migration] Data integrity validation found issues');
                    migrationSummary.success = false;
                }
                
            } catch (error) {
                migrationSummary.success = false;
                migrationSummary.errors.push({
                    phase: 'validation',
                    error: error.message
                });
                // Don't throw error for validation issues, just warn
                console.warn('[Migration] Data integrity validation failed:', error.message);
            }

            // Write complete migration summary
            const summaryPath = path.join(this.exportPath, 'complete-migration-summary.json');
            await fs.writeFile(summaryPath, JSON.stringify(migrationSummary, null, 2));

            if (migrationSummary.success) {
                console.log('[Migration] Complete migration successful!');
                console.log(`[Migration] Exported: ${migrationSummary.phases.export?.totalRecords || 0} records`);
                console.log(`[Migration] Imported: ${migrationSummary.phases.import?.totalImported || 0} records`);
                console.log(`[Migration] Total documents in RxDB: ${migrationSummary.phases.validation?.totalDocuments || 0}`);
            } else {
                console.error(`[Migration] Migration completed with ${migrationSummary.errors.length} errors`);
            }

            return migrationSummary;
            
        } catch (error) {
            console.error('[Migration] Complete migration failed:', error.message);
            throw error;
        }
    }

    /**
     * Rollback migration by restoring RxDB from backup
     * @param {string} backupFileName - Optional specific backup file to restore
     * @returns {Promise<boolean>} True if rollback successful
     */
    async rollbackMigration(backupFileName = null) {
        try {
            console.log('[Migration] Starting migration rollback...');
            
            const rollbackResult = await this.rxdbImportService.rollbackImport(backupFileName);
            
            if (rollbackResult) {
                console.log('[Migration] Migration rollback completed successfully');
            } else {
                console.error('[Migration] Migration rollback failed');
            }
            
            return rollbackResult;
            
        } catch (error) {
            console.error('[Migration] Migration rollback failed:', error.message);
            throw error;
        }
    }

    /**
     * Get migration progress information
     * @returns {Promise<Object>} Progress information
     */
    async getMigrationProgress() {
        try {
            // Check for complete migration summary first
            const completeSummaryPath = path.join(this.exportPath, 'complete-migration-summary.json');
            
            try {
                const completeSummaryData = await fs.readFile(completeSummaryPath, 'utf8');
                const completeSummary = JSON.parse(completeSummaryData);
                return {
                    type: 'complete',
                    ...completeSummary
                };
            } catch (error) {
                // Fall back to individual progress checks
            }

            // Check export progress
            const exportProgress = await this.getExportProgress();
            const importProgress = await this.rxdbImportService.getImportProgress();

            return {
                type: 'partial',
                export: exportProgress,
                import: importProgress
            };
            
        } catch (error) {
            console.error('[Migration] Error getting migration progress:', error.message);
            throw error;
        }
    }

    /**
     * Clean up migration files
     * @param {boolean} keepBackups - Whether to keep backup files
     * @returns {Promise<void>}
     */
    async cleanupMigrationFiles(keepBackups = true) {
        try {
            console.log('[Migration] Cleaning up migration files...');
            
            // Clean up export files
            const exportFiles = await fs.readdir(this.exportPath);
            
            for (const file of exportFiles) {
                if (file.endsWith('.json') && !file.includes('summary')) {
                    const filePath = path.join(this.exportPath, file);
                    await fs.unlink(filePath);
                }
            }
            
            if (!keepBackups) {
                // Clean up backup files
                try {
                    const backupFiles = await fs.readdir(this.backupPath);
                    for (const file of backupFiles) {
                        const filePath = path.join(this.backupPath, file);
                        await fs.unlink(filePath);
                    }
                    console.log('[Migration] Cleaned up backup files');
                } catch (error) {
                    console.warn('[Migration] Error cleaning up backup files:', error.message);
                }
            }
            
            console.log('[Migration] Migration files cleaned up successfully');
            
        } catch (error) {
            console.error('[Migration] Error cleaning up migration files:', error.message);
            throw error;
        }
    }

    /**
     * Clean up export files
     * @returns {Promise<void>}
     */
    async cleanupExportFiles() {
        try {
            const files = await fs.readdir(this.exportPath);
            
            for (const file of files) {
                const filePath = path.join(this.exportPath, file);
                await fs.unlink(filePath);
            }
            
            console.log('[Migration] Cleaned up export files');
            
        } catch (error) {
            console.error('[Migration] Error cleaning up export files:', error.message);
            throw error;
        }
    }
}

export default MigrationService;