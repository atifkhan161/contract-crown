import fs from 'fs/promises';
import path from 'path';

/**
 * Migration Error Handler
 * Provides comprehensive error handling for migration operations with detailed logging,
 * automatic retry mechanisms, and user-friendly error messages
 */
class MigrationErrorHandler {
    constructor() {
        this.logPath = path.join(process.cwd(), 'server', 'data', 'logs');
        this.maxRetries = 3;
        this.baseRetryDelay = 1000; // 1 second
        this.maxRetryDelay = 30000; // 30 seconds
        
        // Error categories for better handling
        this.errorCategories = {
            CONNECTION: 'connection',
            DATA_INTEGRITY: 'data_integrity',
            SCHEMA_CONFLICT: 'schema_conflict',
            VALIDATION: 'validation',
            STORAGE: 'storage',
            TIMEOUT: 'timeout',
            PERMISSION: 'permission',
            UNKNOWN: 'unknown'
        };
        
        // User-friendly error messages
        this.userMessages = {
            [this.errorCategories.CONNECTION]: 'Database connection failed. Please check your database configuration and network connectivity.',
            [this.errorCategories.DATA_INTEGRITY]: 'Data integrity issues detected. Some records may be corrupted or missing required fields.',
            [this.errorCategories.SCHEMA_CONFLICT]: 'Database schema conflicts detected. The data structure may have changed.',
            [this.errorCategories.VALIDATION]: 'Data validation failed. Some records do not meet the required format.',
            [this.errorCategories.STORAGE]: 'Storage operation failed. Please check disk space and file permissions.',
            [this.errorCategories.TIMEOUT]: 'Operation timed out. The migration may be taking longer than expected.',
            [this.errorCategories.PERMISSION]: 'Permission denied. Please check file and database permissions.',
            [this.errorCategories.UNKNOWN]: 'An unexpected error occurred during migration.'
        };
        
        this.ensureLogDirectory();
    }

    /**
     * Ensure log directory exists
     */
    async ensureLogDirectory() {
        try {
            await fs.access(this.logPath);
        } catch (error) {
            await fs.mkdir(this.logPath, { recursive: true });
        }
    }

    /**
     * Handle migration errors with detailed logging and retry logic
     * @param {Error} error - The error that occurred
     * @param {string} operation - The operation that failed
     * @param {Object} context - Additional context about the operation
     * @param {number} attempt - Current attempt number (for retries)
     * @returns {Promise<Object>} Error handling result
     */
    async handleMigrationError(error, operation, context = {}, attempt = 1) {
        try {
            const errorInfo = this.categorizeError(error);
            const timestamp = new Date().toISOString();
            
            // Create detailed error log entry
            const logEntry = {
                timestamp,
                operation,
                attempt,
                error: {
                    message: error.message,
                    stack: error.stack,
                    category: errorInfo.category,
                    code: error.code || 'UNKNOWN',
                    errno: error.errno,
                    sqlState: error.sqlState
                },
                context,
                severity: this.determineSeverity(errorInfo.category, attempt),
                userMessage: errorInfo.userMessage,
                retryable: errorInfo.retryable,
                suggestedActions: errorInfo.suggestedActions
            };

            // Log the error
            await this.logError(logEntry);
            
            // Determine if retry should be attempted
            if (errorInfo.retryable && attempt < this.maxRetries) {
                const retryDelay = this.calculateRetryDelay(attempt);
                
                console.warn(`[Migration Error] ${operation} failed (attempt ${attempt}/${this.maxRetries}). Retrying in ${retryDelay}ms...`);
                console.warn(`[Migration Error] Error: ${error.message}`);
                
                // Wait before retry
                await this.delay(retryDelay);
                
                return {
                    shouldRetry: true,
                    retryDelay,
                    attempt: attempt + 1,
                    errorInfo: logEntry
                };
            }
            
            // No more retries or not retryable
            console.error(`[Migration Error] ${operation} failed permanently after ${attempt} attempts`);
            console.error(`[Migration Error] Error: ${error.message}`);
            console.error(`[Migration Error] User message: ${errorInfo.userMessage}`);
            
            return {
                shouldRetry: false,
                finalError: true,
                attempt,
                errorInfo: logEntry,
                userMessage: errorInfo.userMessage,
                suggestedActions: errorInfo.suggestedActions
            };
            
        } catch (handlingError) {
            console.error('[Migration Error Handler] Error in error handling:', handlingError.message);
            
            // Fallback error handling
            return {
                shouldRetry: false,
                finalError: true,
                attempt,
                errorInfo: {
                    timestamp: new Date().toISOString(),
                    operation,
                    error: { message: error.message },
                    handlingError: handlingError.message
                },
                userMessage: 'An unexpected error occurred during migration error handling.'
            };
        }
    }

    /**
     * Categorize error and determine handling strategy
     * @param {Error} error - The error to categorize
     * @returns {Object} Error category information
     */
    categorizeError(error) {
        const message = error.message.toLowerCase();
        const code = error.code;
        const errno = error.errno;
        
        let category = this.errorCategories.UNKNOWN;
        let retryable = false;
        let suggestedActions = [];
        
        // Connection errors
        if (code === 'ECONNREFUSED' || code === 'ENOTFOUND' || code === 'ETIMEDOUT' || 
            message.includes('connection') || message.includes('connect')) {
            category = this.errorCategories.CONNECTION;
            retryable = true;
            suggestedActions = [
                'Check database server is running',
                'Verify database connection configuration',
                'Check network connectivity',
                'Ensure database credentials are correct'
            ];
        }
        
        // Data integrity errors
        else if (message.includes('duplicate') || message.includes('constraint') || 
                 message.includes('foreign key') || message.includes('unique')) {
            category = this.errorCategories.DATA_INTEGRITY;
            retryable = false;
            suggestedActions = [
                'Check for duplicate records in source data',
                'Verify foreign key relationships',
                'Review data constraints and validation rules',
                'Consider data cleanup before migration'
            ];
        }
        
        // Schema conflicts
        else if (message.includes('schema') || message.includes('column') || 
                 message.includes('table') || message.includes('unknown column')) {
            category = this.errorCategories.SCHEMA_CONFLICT;
            retryable = false;
            suggestedActions = [
                'Verify database schema matches expected structure',
                'Check for recent schema changes',
                'Update migration scripts to match current schema',
                'Consider running schema migration first'
            ];
        }
        
        // Validation errors
        else if (message.includes('validation') || message.includes('invalid') || 
                 message.includes('required') || message.includes('format')) {
            category = this.errorCategories.VALIDATION;
            retryable = false;
            suggestedActions = [
                'Review data format requirements',
                'Check for missing required fields',
                'Validate data types and formats',
                'Consider data transformation before migration'
            ];
        }
        
        // Storage errors
        else if (code === 'ENOSPC' || code === 'EACCES' || code === 'EPERM' || 
                 message.includes('disk') || message.includes('space') || message.includes('permission')) {
            category = this.errorCategories.STORAGE;
            retryable = code === 'ENOSPC'; // Retry for disk space issues
            suggestedActions = [
                'Check available disk space',
                'Verify file and directory permissions',
                'Ensure write access to migration directories',
                'Consider cleaning up temporary files'
            ];
        }
        
        // Timeout errors
        else if (code === 'ETIMEDOUT' || message.includes('timeout') || message.includes('timed out')) {
            category = this.errorCategories.TIMEOUT;
            retryable = true;
            suggestedActions = [
                'Increase operation timeout settings',
                'Consider processing data in smaller batches',
                'Check system performance and load',
                'Verify network stability'
            ];
        }
        
        // Permission errors
        else if (code === 'EACCES' || code === 'EPERM' || message.includes('permission') || 
                 message.includes('access denied')) {
            category = this.errorCategories.PERMISSION;
            retryable = false;
            suggestedActions = [
                'Check database user permissions',
                'Verify file system permissions',
                'Ensure proper access rights for migration directories',
                'Contact system administrator if needed'
            ];
        }
        
        return {
            category,
            retryable,
            userMessage: this.userMessages[category],
            suggestedActions
        };
    }

    /**
     * Determine error severity based on category and attempt
     * @param {string} category - Error category
     * @param {number} attempt - Current attempt number
     * @returns {string} Severity level
     */
    determineSeverity(category, attempt) {
        if (category === this.errorCategories.DATA_INTEGRITY || 
            category === this.errorCategories.SCHEMA_CONFLICT) {
            return 'CRITICAL';
        }
        
        if (attempt >= this.maxRetries) {
            return 'HIGH';
        }
        
        if (category === this.errorCategories.CONNECTION || 
            category === this.errorCategories.TIMEOUT) {
            return attempt === 1 ? 'MEDIUM' : 'HIGH';
        }
        
        return 'MEDIUM';
    }

    /**
     * Calculate retry delay with exponential backoff
     * @param {number} attempt - Current attempt number
     * @returns {number} Delay in milliseconds
     */
    calculateRetryDelay(attempt) {
        const delay = this.baseRetryDelay * Math.pow(2, attempt - 1);
        return Math.min(delay, this.maxRetryDelay);
    }

    /**
     * Log error to file
     * @param {Object} logEntry - Error log entry
     */
    async logError(logEntry) {
        try {
            const logFileName = `migration-errors-${new Date().toISOString().split('T')[0]}.log`;
            const logFilePath = path.join(this.logPath, logFileName);
            
            const logLine = JSON.stringify(logEntry) + '\n';
            await fs.appendFile(logFilePath, logLine);
            
            // Also log to console for immediate visibility
            console.error(`[Migration Error] ${logEntry.operation} - ${logEntry.error.message}`);
            
        } catch (logError) {
            console.error('[Migration Error Handler] Failed to write error log:', logError.message);
        }
    }

    /**
     * Handle data integrity errors specifically
     * @param {Error} error - Data integrity error
     * @param {string} tableName - Table where error occurred
     * @param {Object} record - Record that caused the error
     * @returns {Promise<Object>} Handling result
     */
    async handleDataIntegrityError(error, tableName, record = null) {
        try {
            const context = {
                tableName,
                recordId: record?.id || record?.user_id || record?.game_id || 'unknown',
                recordData: record ? JSON.stringify(record) : null
            };
            
            const result = await this.handleMigrationError(
                error, 
                `Data integrity check for table ${tableName}`, 
                context
            );
            
            // Additional data integrity specific handling
            if (record) {
                await this.quarantineRecord(tableName, record, error);
            }
            
            return result;
            
        } catch (handlingError) {
            console.error('[Migration Error Handler] Error handling data integrity error:', handlingError.message);
            throw handlingError;
        }
    }

    /**
     * Handle schema conflict errors
     * @param {Error} error - Schema conflict error
     * @param {string} collectionName - Collection where conflict occurred
     * @returns {Promise<Object>} Handling result
     */
    async handleSchemaConflict(error, collectionName) {
        try {
            const context = {
                collectionName,
                conflictType: this.determineSchemaConflictType(error)
            };
            
            const result = await this.handleMigrationError(
                error,
                `Schema conflict in collection ${collectionName}`,
                context
            );
            
            // Provide specific schema conflict guidance
            result.schemaGuidance = this.getSchemaConflictGuidance(error, collectionName);
            
            return result;
            
        } catch (handlingError) {
            console.error('[Migration Error Handler] Error handling schema conflict:', handlingError.message);
            throw handlingError;
        }
    }

    /**
     * Handle connection errors with specific retry logic
     * @param {Error} error - Connection error
     * @param {string} operation - Operation that failed
     * @returns {Promise<Object>} Handling result
     */
    async handleConnectionError(error, operation) {
        try {
            const context = {
                connectionType: this.determineConnectionType(error),
                host: error.hostname || 'unknown',
                port: error.port || 'unknown'
            };
            
            return await this.handleMigrationError(error, operation, context);
            
        } catch (handlingError) {
            console.error('[Migration Error Handler] Error handling connection error:', handlingError.message);
            throw handlingError;
        }
    }

    /**
     * Quarantine problematic record for manual review
     * @param {string} tableName - Table name
     * @param {Object} record - Problematic record
     * @param {Error} error - Error that occurred
     */
    async quarantineRecord(tableName, record, error) {
        try {
            const quarantinePath = path.join(this.logPath, 'quarantine');
            await fs.mkdir(quarantinePath, { recursive: true });
            
            const quarantineFile = path.join(quarantinePath, `${tableName}-quarantine.json`);
            
            const quarantineEntry = {
                timestamp: new Date().toISOString(),
                tableName,
                record,
                error: {
                    message: error.message,
                    code: error.code
                }
            };
            
            // Read existing quarantine data
            let quarantineData = [];
            try {
                const existingData = await fs.readFile(quarantineFile, 'utf8');
                quarantineData = JSON.parse(existingData);
            } catch (readError) {
                // File doesn't exist or is empty, start with empty array
            }
            
            quarantineData.push(quarantineEntry);
            
            await fs.writeFile(quarantineFile, JSON.stringify(quarantineData, null, 2));
            
            console.warn(`[Migration Error Handler] Record quarantined in ${quarantineFile}`);
            
        } catch (quarantineError) {
            console.error('[Migration Error Handler] Failed to quarantine record:', quarantineError.message);
        }
    }

    /**
     * Determine schema conflict type
     * @param {Error} error - Schema error
     * @returns {string} Conflict type
     */
    determineSchemaConflictType(error) {
        const message = error.message.toLowerCase();
        
        if (message.includes('version')) return 'version_mismatch';
        if (message.includes('field') || message.includes('property')) return 'field_mismatch';
        if (message.includes('type')) return 'type_mismatch';
        if (message.includes('required')) return 'required_field_missing';
        
        return 'unknown_conflict';
    }

    /**
     * Get schema conflict guidance
     * @param {Error} error - Schema error
     * @param {string} collectionName - Collection name
     * @returns {Array} Guidance steps
     */
    getSchemaConflictGuidance(error, collectionName) {
        const conflictType = this.determineSchemaConflictType(error);
        
        const guidance = {
            version_mismatch: [
                'Check RxDB schema version compatibility',
                'Consider running schema migration',
                'Update schema version in collection definition'
            ],
            field_mismatch: [
                'Review field definitions in schema',
                'Check for renamed or removed fields',
                'Update data transformation logic'
            ],
            type_mismatch: [
                'Verify data types match schema requirements',
                'Check for type conversion needs',
                'Update validation rules'
            ],
            required_field_missing: [
                'Ensure all required fields are present',
                'Add default values for missing fields',
                'Update data preparation logic'
            ],
            unknown_conflict: [
                'Review complete schema definition',
                'Check RxDB documentation for changes',
                'Consider schema regeneration'
            ]
        };
        
        return guidance[conflictType] || guidance.unknown_conflict;
    }

    /**
     * Determine connection type from error
     * @param {Error} error - Connection error
     * @returns {string} Connection type
     */
    determineConnectionType(error) {
        const message = error.message.toLowerCase();
        
        if (message.includes('mysql') || message.includes('mariadb')) return 'mariadb';
        if (message.includes('rxdb') || message.includes('lokijs')) return 'rxdb';
        if (message.includes('socket')) return 'socket';
        
        return 'unknown';
    }

    /**
     * Delay execution for specified milliseconds
     * @param {number} ms - Milliseconds to delay
     * @returns {Promise} Promise that resolves after delay
     */
    delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    /**
     * Get error statistics from logs
     * @param {string} date - Date to get stats for (YYYY-MM-DD format)
     * @returns {Promise<Object>} Error statistics
     */
    async getErrorStatistics(date = null) {
        try {
            const targetDate = date || new Date().toISOString().split('T')[0];
            const logFileName = `migration-errors-${targetDate}.log`;
            const logFilePath = path.join(this.logPath, logFileName);
            
            try {
                const logData = await fs.readFile(logFilePath, 'utf8');
                const logLines = logData.trim().split('\n').filter(line => line.trim());
                
                const stats = {
                    totalErrors: logLines.length,
                    errorsByCategory: {},
                    errorsBySeverity: {},
                    errorsByOperation: {},
                    retryableErrors: 0,
                    finalErrors: 0
                };
                
                for (const line of logLines) {
                    try {
                        const logEntry = JSON.parse(line);
                        
                        // Count by category
                        const category = logEntry.error.category;
                        stats.errorsByCategory[category] = (stats.errorsByCategory[category] || 0) + 1;
                        
                        // Count by severity
                        const severity = logEntry.severity;
                        stats.errorsBySeverity[severity] = (stats.errorsBySeverity[severity] || 0) + 1;
                        
                        // Count by operation
                        const operation = logEntry.operation;
                        stats.errorsByOperation[operation] = (stats.errorsByOperation[operation] || 0) + 1;
                        
                        // Count retryable vs final
                        if (logEntry.retryable) {
                            stats.retryableErrors++;
                        } else {
                            stats.finalErrors++;
                        }
                        
                    } catch (parseError) {
                        console.warn('[Migration Error Handler] Failed to parse log entry:', parseError.message);
                    }
                }
                
                return stats;
                
            } catch (readError) {
                return {
                    totalErrors: 0,
                    message: `No error log found for date ${targetDate}`
                };
            }
            
        } catch (error) {
            console.error('[Migration Error Handler] Error getting error statistics:', error.message);
            throw error;
        }
    }

    /**
     * Clear old error logs
     * @param {number} daysToKeep - Number of days of logs to keep
     * @returns {Promise<void>}
     */
    async clearOldLogs(daysToKeep = 30) {
        try {
            const files = await fs.readdir(this.logPath);
            const cutoffDate = new Date();
            cutoffDate.setDate(cutoffDate.getDate() - daysToKeep);
            
            for (const file of files) {
                if (file.startsWith('migration-errors-') && file.endsWith('.log')) {
                    const dateStr = file.replace('migration-errors-', '').replace('.log', '');
                    const fileDate = new Date(dateStr);
                    
                    if (fileDate < cutoffDate) {
                        const filePath = path.join(this.logPath, file);
                        await fs.unlink(filePath);
                        console.log(`[Migration Error Handler] Deleted old log file: ${file}`);
                    }
                }
            }
            
        } catch (error) {
            console.error('[Migration Error Handler] Error clearing old logs:', error.message);
            throw error;
        }
    }
}

export default MigrationErrorHandler;