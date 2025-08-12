import MigrationService from './MigrationService.js';
import MigrationErrorHandler from './MigrationErrorHandler.js';

/**
 * Enhanced Migration Service with comprehensive error handling
 * Wraps the existing MigrationService with robust error handling and retry logic
 */
class EnhancedMigrationService extends MigrationService {
    constructor() {
        super();
        this.errorHandler = new MigrationErrorHandler();
    }

    /**
     * Enhanced export from MariaDB with error handling and retries
     * @returns {Promise<Object>} Export summary with error handling results
     */
    async exportFromMariaDB() {
        return await this.executeWithErrorHandling(
            'exportFromMariaDB',
            () => super.exportFromMariaDB(),
            { operation: 'MariaDB Export', phase: 'export' }
        );
    }

    /**
     * Enhanced table export with error handling
     * @param {string} tableName - Name of the table to export
     * @returns {Promise<Array>} Array of records from the table
     */
    async exportTable(tableName) {
        return await this.executeWithErrorHandling(
            'exportTable',
            () => super.exportTable(tableName),
            { operation: `Export table ${tableName}`, tableName, phase: 'table_export' }
        );
    }

    /**
     * Enhanced complete migration with comprehensive error handling
     * @returns {Promise<Object>} Complete migration summary with error details
     */
    async performCompleteMigration() {
        const migrationStart = Date.now();
        let migrationSummary = null;
        
        try {
            console.log('[Enhanced Migration] Starting complete migration with error handling...');
            
            // Initialize migration summary with error tracking
            migrationSummary = {
                timestamp: new Date().toISOString(),
                phases: {},
                errors: [],
                retries: {},
                success: true,
                duration: 0,
                errorHandling: {
                    totalErrors: 0,
                    retriedOperations: 0,
                    finalFailures: 0
                }
            };

            // Phase 1: Export with error handling
            try {
                console.log('[Enhanced Migration] Phase 1: Enhanced MariaDB export...');
                const exportResult = await this.exportFromMariaDB();
                migrationSummary.phases.export = exportResult;
                
                if (exportResult.errorHandling) {
                    migrationSummary.errorHandling.totalErrors += exportResult.errorHandling.totalErrors || 0;
                    migrationSummary.errorHandling.retriedOperations += exportResult.errorHandling.retriedOperations || 0;
                }
                
                if (!exportResult.success) {
                    throw new Error('Enhanced MariaDB export failed');
                }
                
            } catch (error) {
                const errorResult = await this.errorHandler.handleMigrationError(
                    error, 
                    'Complete Migration - Export Phase',
                    { phase: 'export' }
                );
                
                migrationSummary.errors.push(errorResult.errorInfo);
                migrationSummary.success = false;
                migrationSummary.errorHandling.finalFailures++;
                
                throw error;
            }

            // Phase 2: Import with error handling
            try {
                console.log('[Enhanced Migration] Phase 2: Enhanced RxDB import...');
                const importResult = await this.executeWithErrorHandling(
                    'rxdbImport',
                    () => this.rxdbImportService.importToRxDB(),
                    { operation: 'RxDB Import', phase: 'import' }
                );
                
                migrationSummary.phases.import = importResult;
                
                if (importResult.errorHandling) {
                    migrationSummary.errorHandling.totalErrors += importResult.errorHandling.totalErrors || 0;
                    migrationSummary.errorHandling.retriedOperations += importResult.errorHandling.retriedOperations || 0;
                }
                
                if (!importResult.success) {
                    throw new Error('Enhanced RxDB import failed');
                }
                
            } catch (error) {
                const errorResult = await this.errorHandler.handleMigrationError(
                    error,
                    'Complete Migration - Import Phase',
                    { phase: 'import' }
                );
                
                migrationSummary.errors.push(errorResult.errorInfo);
                migrationSummary.success = false;
                migrationSummary.errorHandling.finalFailures++;
                
                throw error;
            }

            // Phase 3: Validation with error handling
            try {
                console.log('[Enhanced Migration] Phase 3: Enhanced data integrity validation...');
                const validationResult = await this.executeWithErrorHandling(
                    'dataValidation',
                    () => this.rxdbImportService.validateDataIntegrity(),
                    { operation: 'Data Integrity Validation', phase: 'validation' }
                );
                
                migrationSummary.phases.validation = validationResult;
                
                if (validationResult.errorHandling) {
                    migrationSummary.errorHandling.totalErrors += validationResult.errorHandling.totalErrors || 0;
                }
                
                if (!validationResult.isValid) {
                    console.warn('[Enhanced Migration] Data integrity validation found issues');
                    migrationSummary.success = false;
                }
                
            } catch (error) {
                const errorResult = await this.errorHandler.handleMigrationError(
                    error,
                    'Complete Migration - Validation Phase',
                    { phase: 'validation' }
                );
                
                migrationSummary.errors.push(errorResult.errorInfo);
                // Don't fail migration for validation issues, just warn
                console.warn('[Enhanced Migration] Data integrity validation failed:', error.message);
            }

            // Calculate total duration
            migrationSummary.duration = Date.now() - migrationStart;

            // Write enhanced migration summary
            const summaryPath = path.join(this.exportPath, 'enhanced-migration-summary.json');
            await fs.writeFile(summaryPath, JSON.stringify(migrationSummary, null, 2));

            // Log final results
            if (migrationSummary.success) {
                console.log('[Enhanced Migration] Complete migration successful!');
                console.log(`[Enhanced Migration] Duration: ${migrationSummary.duration}ms`);
                console.log(`[Enhanced Migration] Total errors handled: ${migrationSummary.errorHandling.totalErrors}`);
                console.log(`[Enhanced Migration] Operations retried: ${migrationSummary.errorHandling.retriedOperations}`);
            } else {
                console.error(`[Enhanced Migration] Migration completed with issues`);
                console.error(`[Enhanced Migration] Total errors: ${migrationSummary.errors.length}`);
                console.error(`[Enhanced Migration] Final failures: ${migrationSummary.errorHandling.finalFailures}`);
            }

            return migrationSummary;
            
        } catch (error) {
            // Final error handling
            if (migrationSummary) {
                migrationSummary.duration = Date.now() - migrationStart;
                migrationSummary.success = false;
                migrationSummary.finalError = {
                    message: error.message,
                    timestamp: new Date().toISOString()
                };
            }
            
            console.error('[Enhanced Migration] Complete migration failed:', error.message);
            throw error;
        }
    }

    /**
     * Execute operation with comprehensive error handling and retry logic
     * @param {string} operationName - Name of the operation
     * @param {Function} operation - Function to execute
     * @param {Object} context - Additional context for error handling
     * @returns {Promise<any>} Operation result with error handling metadata
     */
    async executeWithErrorHandling(operationName, operation, context = {}) {
        let attempt = 1;
        let lastError = null;
        let result = null;
        
        const errorHandlingMetadata = {
            totalErrors: 0,
            retriedOperations: 0,
            finalFailures: 0,
            attempts: []
        };

        while (attempt <= this.errorHandler.maxRetries) {
            try {
                console.log(`[Enhanced Migration] Executing ${operationName} (attempt ${attempt})`);
                
                result = await operation();
                
                // Operation succeeded
                if (attempt > 1) {
                    console.log(`[Enhanced Migration] ${operationName} succeeded after ${attempt} attempts`);
                    errorHandlingMetadata.retriedOperations++;
                }
                
                // Add error handling metadata to result
                if (typeof result === 'object' && result !== null) {
                    result.errorHandling = errorHandlingMetadata;
                }
                
                return result;
                
            } catch (error) {
                lastError = error;
                errorHandlingMetadata.totalErrors++;
                
                const errorResult = await this.errorHandler.handleMigrationError(
                    error,
                    operationName,
                    { ...context, attempt },
                    attempt
                );
                
                errorHandlingMetadata.attempts.push({
                    attempt,
                    error: errorResult.errorInfo,
                    timestamp: new Date().toISOString()
                });
                
                if (errorResult.shouldRetry) {
                    console.log(`[Enhanced Migration] Retrying ${operationName} in ${errorResult.retryDelay}ms...`);
                    attempt++;
                    continue;
                } else {
                    // Final failure
                    errorHandlingMetadata.finalFailures++;
                    console.error(`[Enhanced Migration] ${operationName} failed permanently: ${error.message}`);
                    
                    // Throw enhanced error with metadata
                    const enhancedError = new Error(`${operationName} failed: ${error.message}`);
                    enhancedError.originalError = error;
                    enhancedError.errorHandling = errorHandlingMetadata;
                    enhancedError.userMessage = errorResult.userMessage;
                    enhancedError.suggestedActions = errorResult.suggestedActions;
                    
                    throw enhancedError;
                }
            }
        }
        
        // Should not reach here, but just in case
        const finalError = new Error(`${operationName} failed after ${this.errorHandler.maxRetries} attempts`);
        finalError.originalError = lastError;
        finalError.errorHandling = errorHandlingMetadata;
        throw finalError;
    }

    /**
     * Enhanced rollback with error handling
     * @param {string} backupFileName - Optional specific backup file to restore
     * @returns {Promise<boolean>} True if rollback successful
     */
    async rollbackMigration(backupFileName = null) {
        return await this.executeWithErrorHandling(
            'rollbackMigration',
            () => super.rollbackMigration(backupFileName),
            { operation: 'Migration Rollback', backupFileName }
        );
    }

    /**
     * Get enhanced migration progress with error information
     * @returns {Promise<Object>} Progress information with error details
     */
    async getMigrationProgress() {
        try {
            const baseProgress = await super.getMigrationProgress();
            
            // Add error statistics
            const errorStats = await this.errorHandler.getErrorStatistics();
            
            return {
                ...baseProgress,
                errorStatistics: errorStats,
                errorHandling: {
                    logsAvailable: true,
                    quarantinedRecords: await this.getQuarantinedRecordsCount()
                }
            };
            
        } catch (error) {
            console.error('[Enhanced Migration] Error getting migration progress:', error.message);
            throw error;
        }
    }

    /**
     * Get count of quarantined records
     * @returns {Promise<number>} Number of quarantined records
     */
    async getQuarantinedRecordsCount() {
        try {
            const quarantinePath = path.join(this.errorHandler.logPath, 'quarantine');
            
            try {
                const files = await fs.readdir(quarantinePath);
                let totalCount = 0;
                
                for (const file of files) {
                    if (file.endsWith('-quarantine.json')) {
                        const filePath = path.join(quarantinePath, file);
                        const data = await fs.readFile(filePath, 'utf8');
                        const records = JSON.parse(data);
                        totalCount += records.length;
                    }
                }
                
                return totalCount;
                
            } catch (error) {
                return 0; // No quarantine directory or files
            }
            
        } catch (error) {
            console.error('[Enhanced Migration] Error getting quarantined records count:', error.message);
            return 0;
        }
    }

    /**
     * Clean up with enhanced error handling
     * @param {boolean} keepBackups - Whether to keep backup files
     * @returns {Promise<void>}
     */
    async cleanupMigrationFiles(keepBackups = true) {
        return await this.executeWithErrorHandling(
            'cleanupMigrationFiles',
            () => super.cleanupMigrationFiles(keepBackups),
            { operation: 'Migration Cleanup', keepBackups }
        );
    }

    /**
     * Get detailed error report
     * @param {string} date - Date to get report for (YYYY-MM-DD format)
     * @returns {Promise<Object>} Detailed error report
     */
    async getErrorReport(date = null) {
        try {
            const errorStats = await this.errorHandler.getErrorStatistics(date);
            const quarantinedCount = await this.getQuarantinedRecordsCount();
            
            return {
                date: date || new Date().toISOString().split('T')[0],
                statistics: errorStats,
                quarantinedRecords: quarantinedCount,
                recommendations: this.generateErrorRecommendations(errorStats)
            };
            
        } catch (error) {
            console.error('[Enhanced Migration] Error generating error report:', error.message);
            throw error;
        }
    }

    /**
     * Generate recommendations based on error statistics
     * @param {Object} errorStats - Error statistics
     * @returns {Array} Array of recommendations
     */
    generateErrorRecommendations(errorStats) {
        const recommendations = [];
        
        if (errorStats.totalErrors === 0) {
            recommendations.push('No errors detected. Migration appears to be running smoothly.');
            return recommendations;
        }
        
        // Connection error recommendations
        if (errorStats.errorsByCategory?.connection > 0) {
            recommendations.push('Connection errors detected. Consider checking database connectivity and network stability.');
        }
        
        // Data integrity recommendations
        if (errorStats.errorsByCategory?.data_integrity > 0) {
            recommendations.push('Data integrity issues found. Review source data quality and consider data cleanup.');
        }
        
        // Schema conflict recommendations
        if (errorStats.errorsByCategory?.schema_conflict > 0) {
            recommendations.push('Schema conflicts detected. Verify database schema compatibility and update migration scripts.');
        }
        
        // High error rate recommendations
        if (errorStats.totalErrors > 10) {
            recommendations.push('High error rate detected. Consider running migration in smaller batches or during off-peak hours.');
        }
        
        // Critical error recommendations
        if (errorStats.errorsBySeverity?.CRITICAL > 0) {
            recommendations.push('Critical errors found. Review error logs immediately and consider stopping migration until issues are resolved.');
        }
        
        return recommendations;
    }
}

export default EnhancedMigrationService;