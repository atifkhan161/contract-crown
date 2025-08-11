import rxdbConnection from './rxdb-connection.js';
import { fileURLToPath } from 'url';

class RxDBInitializer {
  constructor() {
    this.requiredCollections = [
      'users',
      'games', 
      'rooms',
      'teams',
      'game_players',
      'game_rounds',
      'game_tricks',
      'user_sessions'
    ];
  }

  async initialize() {
    try {
      console.log('[RxDB] Starting RxDB initialization...');

      // Initialize RxDB connection
      await rxdbConnection.initialize();

      // Verify initialization
      await this.verifyInitialization();

      console.log('[RxDB] RxDB initialization completed successfully');
      return true;
    } catch (error) {
      console.error('[RxDB] Initialization failed:', error.message);
      throw error;
    }
  }

  async verifyInitialization() {
    try {
      // Check if database is ready
      if (!rxdbConnection.isReady()) {
        throw new Error('RxDB connection is not ready');
      }

      // Perform health check
      const isHealthy = await rxdbConnection.healthCheck();
      if (!isHealthy) {
        throw new Error('RxDB health check failed');
      }

      console.log('[RxDB] Database verification completed successfully');
      return true;
    } catch (error) {
      console.error('[RxDB] Database verification failed:', error.message);
      throw error;
    }
  }

  async reset() {
    try {
      console.log('[RxDB] Resetting RxDB database...');

      // Close existing connection
      if (rxdbConnection.isReady()) {
        await rxdbConnection.close();
      }

      // Reinitialize
      await rxdbConnection.initialize();

      console.log('[RxDB] Database reset completed successfully');
      return true;
    } catch (error) {
      console.error('[RxDB] Database reset failed:', error.message);
      throw error;
    }
  }

  async gracefulShutdown() {
    try {
      console.log('[RxDB] Starting graceful shutdown...');
      await rxdbConnection.gracefulShutdown();
      console.log('[RxDB] Graceful shutdown completed');
      return true;
    } catch (error) {
      console.error('[RxDB] Graceful shutdown failed:', error.message);
      throw error;
    }
  }

  // Method to get database status
  getStatus() {
    return {
      isInitialized: rxdbConnection.isReady(),
      collections: Object.keys(rxdbConnection.getCollections()),
      dbPath: rxdbConnection.dbPath,
      dbName: rxdbConnection.dbName
    };
  }
}

// Export for use in other modules
export default RxDBInitializer;

// CLI usage
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const initializer = new RxDBInitializer();
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
        console.log('[RxDB] Status:', initializer.getStatus());
        break;
      default:
        console.log('Usage: node rxdb-init.js [init|reset|status]');
        console.log('  init   - Initialize RxDB with LokiJS storage');
        console.log('  reset  - Reset RxDB database');
        console.log('  status - Show database status');
    }

    await initializer.gracefulShutdown();
    process.exit(0);
  } catch (error) {
    console.error('RxDB operation failed:', error.message);
    await initializer.gracefulShutdown();
    process.exit(1);
  }
}