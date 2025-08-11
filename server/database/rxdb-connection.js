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
        this.dbPath = process.env.RXDB_PATH || path.join(__dirname, '../data/rxdb');
        this.dbName = process.env.RXDB_NAME || 'contract_crown_rxdb';
    }

    async initialize() {
        try {
            console.log('[RxDB] Initializing RxDB with LokiJS storage adapter...');

            // Create RxDB database with Memory storage wrapped with AJV validation
            this.database = await createRxDatabase({
                name: this.dbName,
                storage: wrappedValidateAjvStorage({
                    storage: getRxStorageMemory()
                }),
                eventReduce: true,
                ignoreDuplicate: true
            });

            console.log(`[RxDB] Database created successfully with memory storage`);

            // Set up error handling
            this.database.$.subscribe(
                changeEvent => {
                    console.log('[RxDB] Database change event:', changeEvent.operation);
                },
                error => {
                    console.error('[RxDB] Database error:', error);
                }
            );

            // Load existing data if available
            await this.loadFromFile();

            // Set up periodic persistence using JSON dump
            this.setupPersistence();

            this.isInitialized = true;
            console.log('[RxDB] RxDB initialization completed successfully');

            return this.database;
        } catch (error) {
            console.error('[RxDB] Initialization failed:', error.message);
            console.error('[RxDB] Error details:', error);
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

    // Set up periodic persistence
    setupPersistence() {
        // Save database state every 30 seconds
        this.persistenceInterval = setInterval(async () => {
            try {
                await this.saveToFile();
            } catch (error) {
                console.error('[RxDB] Persistence error:', error.message);
            }
        }, 30000);

        console.log('[RxDB] Periodic persistence setup completed (30s intervals)');
    }

    // Save database to file
    async saveToFile() {
        try {
            if (!this.database) return;

            const dump = await this.database.exportJSON();
            const fs = await import('fs/promises');

            // Ensure directory exists
            await fs.mkdir(this.dbPath, { recursive: true });

            const filePath = path.join(this.dbPath, `${this.dbName}.json`);
            await fs.writeFile(filePath, JSON.stringify(dump, null, 2));

            console.log(`[RxDB] Database persisted to: ${filePath}`);
        } catch (error) {
            console.error('[RxDB] Failed to save database to file:', error.message);
            throw error;
        }
    }

    // Load database from file
    async loadFromFile() {
        try {
            const fs = await import('fs/promises');
            const filePath = path.join(this.dbPath, `${this.dbName}.json`);

            try {
                const data = await fs.readFile(filePath, 'utf8');
                const dump = JSON.parse(data);

                // Only try to import if there are collections in the dump that match existing collections
                if (dump.collections && dump.collections.length > 0) {
                    const existingCollections = Object.keys(this.collections);
                    const dumpCollections = dump.collections.map(col => col.name);
                    const matchingCollections = dumpCollections.filter(name => existingCollections.includes(name));

                    if (matchingCollections.length > 0) {
                        await this.database.importJSON(dump);
                        console.log(`[RxDB] Database loaded from: ${filePath}`);
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
                    console.log('[RxDB] Collections in dump file do not match current schema, starting fresh');
                    return false;
                }
                throw error;
            }
        } catch (error) {
            console.error('[RxDB] Failed to load database from file:', error.message);
            // Don't throw error, just start fresh
            console.log('[RxDB] Starting with fresh database due to load error');
            return false;
        }
    }

    // Method to handle graceful shutdown
    async gracefulShutdown() {
        console.log('[RxDB] Starting graceful shutdown...');
        try {
            // Clear persistence interval
            if (this.persistenceInterval) {
                clearInterval(this.persistenceInterval);
                this.persistenceInterval = null;
            }

            // Save final state
            await this.saveToFile();

            await this.close();
            console.log('[RxDB] Graceful shutdown completed');
        } catch (error) {
            console.error('[RxDB] Error during graceful shutdown:', error.message);
            throw error;
        }
    }
}

// Create singleton instance
const rxdbConnection = new RxDBConnection();

export default rxdbConnection;