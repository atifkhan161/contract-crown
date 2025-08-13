#!/usr/bin/env node

/**
 * Migration script from RxDB to LokiJS
 * This script helps migrate data from RxDB to LokiJS format
 */

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import lokiConnection from '../database/loki-db.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

class RxDBToLokiMigration {
    constructor() {
        this.rxdbPath = path.join(__dirname, '../data/rxdb');
        this.lokiPath = path.join(__dirname, '../data/lokijs');
        this.backupPath = path.join(__dirname, '../data/migration-backup');
    }

    async migrate() {
        try {
            console.log('[Migration] Starting RxDB to LokiJS migration...');

            // Create backup directory
            await fs.mkdir(this.backupPath, { recursive: true });

            // Check if RxDB data exists
            const rxdbExists = await this.checkRxDBData();
            if (!rxdbExists) {
                console.log('[Migration] No RxDB data found. Starting fresh with LokiJS.');
                await this.initializeLokiJS();
                return;
            }

            // Backup existing RxDB data
            await this.backupRxDBData();

            // Initialize LokiJS
            await this.initializeLokiJS();

            // Migrate data if available
            await this.migrateData();

            // Seed default users
            await this.seedDefaultUsers();

            console.log('[Migration] Migration completed successfully!');
            console.log('[Migration] RxDB data has been backed up to:', this.backupPath);
            console.log('[Migration] LokiJS is now ready to use.');

        } catch (error) {
            console.error('[Migration] Migration failed:', error.message);
            throw error;
        }
    }

    async checkRxDBData() {
        try {
            const rxdbFiles = await fs.readdir(this.rxdbPath);
            return rxdbFiles.some(file => file.endsWith('.json'));
        } catch (error) {
            return false;
        }
    }

    async backupRxDBData() {
        try {
            console.log('[Migration] Backing up RxDB data...');
            
            const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
            const backupDir = path.join(this.backupPath, `rxdb-backup-${timestamp}`);
            await fs.mkdir(backupDir, { recursive: true });

            // Copy all RxDB files
            const rxdbFiles = await fs.readdir(this.rxdbPath);
            for (const file of rxdbFiles) {
                const srcPath = path.join(this.rxdbPath, file);
                const destPath = path.join(backupDir, file);
                await fs.copyFile(srcPath, destPath);
            }

            console.log('[Migration] RxDB data backed up to:', backupDir);
        } catch (error) {
            console.error('[Migration] Backup failed:', error.message);
            throw error;
        }
    }

    async initializeLokiJS() {
        try {
            console.log('[Migration] Initializing LokiJS...');
            await lokiConnection.initialize();
            console.log('[Migration] LokiJS initialized successfully');
        } catch (error) {
            console.error('[Migration] LokiJS initialization failed:', error.message);
            throw error;
        }
    }

    async migrateData() {
        try {
            console.log('[Migration] Migrating data from RxDB to LokiJS...');
            
            // Try to read RxDB export file
            const rxdbExportPath = path.join(this.rxdbPath, 'trump_crown_rxdb.json');
            
            try {
                const rxdbData = await fs.readFile(rxdbExportPath, 'utf8');
                const parsedData = JSON.parse(rxdbData);
                
                if (parsedData.data && parsedData.data.collections) {
                    await this.importCollections(parsedData.data.collections);
                } else if (parsedData.collections) {
                    await this.importCollections(parsedData.collections);
                } else {
                    console.log('[Migration] No collection data found in RxDB export');
                }
            } catch (error) {
                console.log('[Migration] Could not read RxDB export file, starting with empty database');
            }

        } catch (error) {
            console.error('[Migration] Data migration failed:', error.message);
            // Don't throw - we can continue with empty database
        }
    }

    async importCollections(collections) {
        try {
            let totalImported = 0;

            for (const collection of collections) {
                const collectionName = collection.name;
                const documents = collection.docs || [];

                if (documents.length === 0) {
                    console.log(`[Migration] Collection '${collectionName}' is empty, skipping`);
                    continue;
                }

                console.log(`[Migration] Importing ${documents.length} documents to '${collectionName}'`);

                try {
                    const lokiCollection = lokiConnection.getCollection(collectionName);
                    
                    // Clean documents (remove RxDB-specific fields)
                    const cleanedDocs = documents.map(doc => {
                        const cleaned = { ...doc };
                        delete cleaned._rev;
                        delete cleaned._attachments;
                        delete cleaned._deleted;
                        return cleaned;
                    });

                    // Insert documents
                    lokiCollection.insert(cleanedDocs);
                    totalImported += cleanedDocs.length;

                    console.log(`[Migration] Successfully imported ${cleanedDocs.length} documents to '${collectionName}'`);
                } catch (error) {
                    console.warn(`[Migration] Failed to import collection '${collectionName}':`, error.message);
                }
            }

            if (totalImported > 0) {
                // Save the database
                await lokiConnection.saveDatabase();
                console.log(`[Migration] Successfully imported ${totalImported} total documents`);
            }

        } catch (error) {
            console.error('[Migration] Collection import failed:', error.message);
            throw error;
        }
    }

    async seedDefaultUsers() {
        try {
            console.log('[Migration] Seeding default users...');
            
            const { default: SeedDataService } = await import('../src/services/SeedDataService.js');
            const seedService = new SeedDataService();
            const result = await seedService.seedAllData();
            
            if (result.totalSeeded > 0) {
                await lokiConnection.saveDatabase();
                console.log(`[Migration] Seeded ${result.totalSeeded} default users`);
            } else {
                console.log('[Migration] Default users already exist, skipping');
            }
        } catch (error) {
            console.warn('[Migration] Failed to seed default users:', error.message);
        }
    }

    async cleanup() {
        try {
            if (lokiConnection.isReady()) {
                await lokiConnection.close();
            }
        } catch (error) {
            console.error('[Migration] Cleanup error:', error.message);
        }
    }
}

// CLI usage
if (process.argv[1] === fileURLToPath(import.meta.url)) {
    const migration = new RxDBToLokiMigration();
    
    try {
        await migration.migrate();
        await migration.cleanup();
        process.exit(0);
    } catch (error) {
        console.error('[Migration] Migration script failed:', error.message);
        await migration.cleanup();
        process.exit(1);
    }
}

export default RxDBToLokiMigration;