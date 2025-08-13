import lokiConnection from './loki-db.js';
import { fileURLToPath } from 'url';

class LokiDBInitializer {
    constructor() {
        this.requiredCollections = [
            'users',
            'games', 
            'rooms',
            'teams',
            'gamePlayers',
            'gameRounds',
            'gameTricks',
            'roomPlayers',
            'userSessions'
        ];
    }

    async initialize() {
        try {
            console.log('[LokiJS] Starting LokiJS initialization...');

            // Initialize LokiJS connection
            await lokiConnection.initialize();

            // Verify initialization
            await this.verifyInitialization();

            console.log('[LokiJS] LokiJS initialization completed successfully');
            return true;
        } catch (error) {
            console.error('[LokiJS] Initialization failed:', error.message);
            throw error;
        }
    }

    async verifyInitialization() {
        try {
            // Check if database is ready
            if (!lokiConnection.isReady()) {
                throw new Error('LokiJS connection is not ready');
            }

            // Perform health check
            const isHealthy = await lokiConnection.healthCheck();
            if (!isHealthy) {
                throw new Error('LokiJS health check failed');
            }

            // Verify all required collections exist
            const collections = lokiConnection.getCollections();
            for (const collectionName of this.requiredCollections) {
                if (!collections[collectionName]) {
                    throw new Error(`Required collection '${collectionName}' not found`);
                }
            }

            console.log('[LokiJS] Database verification completed successfully');
            return true;
        } catch (error) {
            console.error('[LokiJS] Database verification failed:', error.message);
            throw error;
        }
    }

    async reset() {
        try {
            console.log('[LokiJS] Resetting LokiJS database...');

            // Close existing connection
            if (lokiConnection.isReady()) {
                await lokiConnection.close();
            }

            // Reinitialize
            await lokiConnection.initialize();

            console.log('[LokiJS] Database reset completed successfully');
            return true;
        } catch (error) {
            console.error('[LokiJS] Database reset failed:', error.message);
            throw error;
        }
    }

    async gracefulShutdown() {
        try {
            console.log('[LokiJS] Starting graceful shutdown...');
            
            // Save database before closing
            await lokiConnection.saveDatabase();
            await lokiConnection.close();
            
            console.log('[LokiJS] Graceful shutdown completed');
            return true;
        } catch (error) {
            console.error('[LokiJS] Graceful shutdown failed:', error.message);
            throw error;
        }
    }

    // Method to get database status
    getStatus() {
        return {
            isInitialized: lokiConnection.isReady(),
            collections: Object.keys(lokiConnection.getCollections()),
            dbPath: lokiConnection.dbPath,
            dbName: lokiConnection.dbName
        };
    }
}

// Export for use in other modules
export default LokiDBInitializer;

// CLI usage
if (process.argv[1] === fileURLToPath(import.meta.url)) {
    const initializer = new LokiDBInitializer();
    const command = process.argv[2];

    try {
        switch (command) {
            case 'init':
                await initializer.initialize();
                break;
            case 'reset':
                await initializer.reset();
                break;
            case 'status':
                await initializer.initialize();
                console.log('[LokiJS] Status:', initializer.getStatus());
                break;
            default:
                console.log('Usage: node loki-init.js [init|reset|status]');
                console.log('  init   - Initialize LokiJS database');
                console.log('  reset  - Reset LokiJS database');
                console.log('  status - Show database status');
        }

        await initializer.gracefulShutdown();
        process.exit(0);
    } catch (error) {
        console.error('LokiJS operation failed:', error.message);
        await initializer.gracefulShutdown();
        process.exit(1);
    }
}