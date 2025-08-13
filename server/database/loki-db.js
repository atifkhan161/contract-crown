import Loki from 'lokijs';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs/promises';
import dotenv from 'dotenv';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

class LokiDBConnection {
    constructor() {
        this.database = null;
        this.collections = {};
        this.isInitialized = false;
        this.dbPath = process.env.LOKIJS_PATH || path.join(__dirname, '../data/lokijs');
        this.dbName = process.env.LOKIJS_NAME || 'trump_crown_db.json';
        this.fullDbPath = path.join(this.dbPath, this.dbName);
    }

    async initialize() {
        try {
            console.log('[LokiJS] Initializing LokiJS database...');
            
            // Ensure directory exists
            await fs.mkdir(this.dbPath, { recursive: true });

            // Create database with persistence
            this.database = new Loki(this.fullDbPath, {
                autoload: true,
                autoloadCallback: () => this.initializeCollections(),
                autosave: true,
                autosaveInterval: 5000, // 5 seconds
                persistenceMethod: 'fs'
            });

            // Wait for initialization to complete
            await new Promise((resolve) => {
                if (this.isInitialized) {
                    resolve();
                } else {
                    const checkInit = () => {
                        if (this.isInitialized) {
                            resolve();
                        } else {
                            setTimeout(checkInit, 100);
                        }
                    };
                    checkInit();
                }
            });

            console.log('[LokiJS] Database initialization completed successfully');
            return this.database;
        } catch (error) {
            console.error('[LokiJS] Initialization failed:', error.message);
            throw error;
        }
    }

    async initializeCollections() {
        try {
            console.log('[LokiJS] Setting up collections...');

            // Define collections with their configurations
            const collectionConfigs = {
                users: { 
                    unique: ['user_id', 'email', 'username'],
                    indices: ['user_id', 'email', 'username', 'created_at']
                },
                games: { 
                    unique: ['game_id', 'game_code'],
                    indices: ['game_id', 'game_code', 'status', 'created_at', 'host_id']
                },
                teams: { 
                    unique: ['team_id'],
                    indices: ['team_id', 'game_id']
                },
                gamePlayers: { 
                    unique: ['game_player_id'],
                    indices: ['game_player_id', 'game_id', 'user_id']
                },
                gameRounds: { 
                    unique: ['round_id'],
                    indices: ['round_id', 'game_id', 'round_number']
                },
                gameTricks: { 
                    unique: ['trick_id'],
                    indices: ['trick_id', 'round_id']
                },
                rooms: { 
                    unique: ['room_id', 'invite_code'],
                    indices: ['room_id', 'status', 'owner_id', 'created_at', 'version']
                },
                roomPlayers: { 
                    unique: ['id'],
                    indices: ['id', 'room_id', 'user_id']
                },
                userSessions: { 
                    unique: ['session_id'],
                    indices: ['session_id', 'user_id', 'expires_at', 'token_hash']
                }
            };

            // Create or get existing collections
            for (const [name, config] of Object.entries(collectionConfigs)) {
                let collection = this.database.getCollection(name);
                
                if (!collection) {
                    collection = this.database.addCollection(name, config);
                    console.log(`[LokiJS] Created collection: ${name}`);
                } else {
                    console.log(`[LokiJS] Using existing collection: ${name}`);
                }
                
                this.collections[name] = collection;
            }

            this.isInitialized = true;
            console.log(`[LokiJS] Initialized ${Object.keys(this.collections).length} collections`);
            
            // Seed default data
            await this.seedDefaultData();
        } catch (error) {
            console.error('[LokiJS] Collection initialization failed:', error.message);
            throw error;
        }
    }

    async seedDefaultData() {
        try {
            const { default: SeedDataService } = await import('../src/services/SeedDataService.js');
            const seedService = new SeedDataService();
            const result = await seedService.seedAllData();
            
            if (result.totalSeeded > 0) {
                await this.saveDatabase();
                console.log(`[LokiJS] Seeded ${result.totalSeeded} default users`);
            }
        } catch (error) {
            console.warn('[LokiJS] Failed to seed default data:', error.message);
        }
    }

    getCollection(name) {
        if (!this.collections[name]) {
            throw new Error(`Collection '${name}' not found`);
        }
        return this.collections[name];
    }

    async healthCheck() {
        try {
            if (!this.database || !this.isInitialized) {
                return false;
            }
            // Simple health check by accessing a collection
            const users = this.getCollection('users');
            return true;
        } catch (error) {
            console.error('[LokiJS] Health check failed:', error.message);
            return false;
        }
    }

    async close() {
        try {
            if (this.database) {
                await new Promise((resolve) => {
                    this.database.close(resolve);
                });
                this.database = null;
                this.collections = {};
                this.isInitialized = false;
                console.log('[LokiJS] Database connection closed successfully');
            }
        } catch (error) {
            console.error('[LokiJS] Error closing database:', error.message);
            throw error;
        }
    }

    isReady() {
        return this.isInitialized && this.database !== null;
    }

    getDatabase() {
        if (!this.database) {
            throw new Error('Database not initialized. Call initialize() first.');
        }
        return this.database;
    }

    getCollections() {
        return this.collections;
    }

    async saveDatabase() {
        return new Promise((resolve, reject) => {
            if (!this.database) {
                reject(new Error('Database not initialized'));
                return;
            }
            
            this.database.saveDatabase((err) => {
                if (err) {
                    reject(err);
                } else {
                    resolve();
                }
            });
        });
    }

    async createBackup(type = 'manual') {
        try {
            const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
            const backupPath = path.join(this.dbPath, 'backups');
            await fs.mkdir(backupPath, { recursive: true });
            
            const backupFile = path.join(backupPath, `backup_${type}_${timestamp}.json`);
            const data = this.database.serialize();
            
            await fs.writeFile(backupFile, data);
            console.log(`[LokiJS] Backup created: ${backupFile}`);
            return backupFile;
        } catch (error) {
            console.error('[LokiJS] Backup creation failed:', error.message);
            throw error;
        }
    }

    async restoreFromBackup(backupFilePath) {
        try {
            const data = await fs.readFile(backupFilePath, 'utf8');
            this.database.loadJSON(data);
            console.log(`[LokiJS] Restored from backup: ${backupFilePath}`);
        } catch (error) {
            console.error('[LokiJS] Restore failed:', error.message);
            throw error;
        }
    }
}

// Create singleton instance
const lokiConnection = new LokiDBConnection();

export default lokiConnection;