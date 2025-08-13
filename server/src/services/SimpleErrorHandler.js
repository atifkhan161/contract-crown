/**
 * Simple Error Handler - Replacement for LokiJS error handling
 */
class SimpleErrorHandler {
    constructor() {
        this.errorCounts = {
            database: 0,
            websocket: 0,
            api: 0
        };
    }

    logError(type, error) {
        this.errorCounts[type] = (this.errorCounts[type] || 0) + 1;
        console.error(`[${type.toUpperCase()}] Error:`, error.message);
    }

    getErrorStats() {
        return { ...this.errorCounts };
    }

    resetErrorCounts() {
        this.errorCounts = {
            database: 0,
            websocket: 0,
            api: 0
        };
    }
}

export default SimpleErrorHandler;
