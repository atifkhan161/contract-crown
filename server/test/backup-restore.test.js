import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import rxdbConnection from '../database/rxdb-connection.js';
import BackupService from '../src/services/BackupService.js';
import MigrationBackupService from '../src/services/MigrationBackupService.js';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

describe('Backup and Restore Functionality', () => {
    let backupService;
    let migrationBackupService;
    let testBackupPath;

    beforeEach(async () => {
        // Initialize RxDB connection
        await rxdbConnection.initialize();
        
        // Create test collections
        await createTestCollections();
        
        // Initialize backup services
        backupService = new BackupService(rxdbConnection);
        migrationBackupService = new MigrationBackupService(rxdbConnection);
        
        // Set up test backup directory
        testBackupPath = path.join(__dirname, '../data/test-backups');
        await fs.mkdir(testBackupPath, { recursive: true });
    });

    afterEach(async () => {
        // Clean up test data
        try {
            await fs.rm(testBackupPath, { recursive: true, force: true });
        } catch (error) {
            // Ignore cleanup errors
        }
        
        // Close RxDB connection
        await rxdbConnection.gracefulShutdown();
    });

    describe('BackupService', () => {
        it('should create a backup successfully', async () => {
            // Add some test data
            await addTestData();
            
            // Create backup
            const backupPath = await backupService.createBackup('test');
            
            // Verify backup file exists
            expect(backupPath).toBeDefined();
            const backupExists = await fs.access(backupPath).then(() => true).catch(() => false);
            expect(backupExists).toBe(true);
            
            // Verify backup content
            const backupData = await backupService.readBackupFile(backupPath);
            expect(backupData).toBeDefined();
            expect(backupData.metadata).toBeDefined();
            expect(backupData.metadata.type).toBe('test');
            expect(backupData.data).toBeDefined();
        });

        it('should list available backups', async () => {
            // Create multiple backups
            await backupService.createBackup('test1');
            await backupService.createBackup('test2');
            
            // List backups
            const backups = await backupService.listBackupFiles();
            
            expect(backups.length).toBeGreaterThanOrEqual(2);
            expect(backups[0]).toHaveProperty('name');
            expect(backups[0]).toHaveProperty('path');
            expect(backups[0]).toHaveProperty('size');
            expect(backups[0]).toHaveProperty('created');
        });

        it('should validate backup integrity', async () => {
            // Add test data and create backup
            await addTestData();
            const backupPath = await backupService.createBackup('validation-test');
            
            // Validate backup
            const isValid = await backupService.validateBackup(backupPath);
            expect(isValid).toBe(true);
        });

        it('should restore from backup successfully', async () => {
            // Add initial test data
            const initialData = await addTestData();
            
            // Create backup
            const backupPath = await backupService.createBackup('restore-test');
            
            // Clear data
            await clearTestData();
            
            // Verify data is cleared
            const usersCollection = rxdbConnection.getCollection('users');
            const userCount = await usersCollection.count().exec();
            expect(userCount).toBe(0);
            
            // Restore from backup
            const restored = await backupService.restoreFromBackup(backupPath);
            expect(restored).toBe(true);
            
            // Verify data is restored
            const restoredUserCount = await usersCollection.count().exec();
            expect(restoredUserCount).toBe(initialData.userCount);
        });

        it('should cleanup old backups', async () => {
            // Create more backups than the limit
            const maxBackups = 3;
            backupService.maxBackups = maxBackups;
            
            for (let i = 0; i < maxBackups + 2; i++) {
                await backupService.createBackup(`cleanup-test-${i}`);
                // Small delay to ensure different timestamps
                await new Promise(resolve => setTimeout(resolve, 10));
            }
            
            // Cleanup old backups
            const deletedCount = await backupService.cleanupOldBackups();
            
            expect(deletedCount).toBe(2);
            
            // Verify remaining backup count
            const remainingBackups = await backupService.listBackupFiles();
            expect(remainingBackups.length).toBeLessThanOrEqual(maxBackups);
        });

        it('should handle corrupted backup files gracefully', async () => {
            // Create a corrupted backup file
            const corruptedBackupPath = path.join(testBackupPath, 'corrupted_backup.json');
            await fs.writeFile(corruptedBackupPath, 'invalid json content');
            
            // Try to validate corrupted backup
            await expect(backupService.validateBackup(corruptedBackupPath)).rejects.toThrow();
            
            // Try to restore from corrupted backup
            await expect(backupService.restoreFromBackup(corruptedBackupPath)).rejects.toThrow();
        });
    });

    describe('MigrationBackupService', () => {
        it('should create pre-migration backup', async () => {
            const migrationId = 'test-migration-001';
            
            // Create pre-migration backup
            const backupInfo = await migrationBackupService.createPreMigrationBackup(migrationId);
            
            expect(backupInfo).toBeDefined();
            expect(backupInfo.migrationId).toBe(migrationId);
            expect(backupInfo.type).toBe('pre-migration');
            expect(backupInfo.status).toBe('completed');
            expect(backupInfo.backupPath).toBeDefined();
            
            // Verify backup directory exists
            const backupExists = await fs.access(backupInfo.backupPath).then(() => true).catch(() => false);
            expect(backupExists).toBe(true);
        });

        it('should create post-migration backup with validation', async () => {
            const migrationId = 'test-migration-002';
            
            // Add some test data
            await addTestData();
            
            // Create post-migration backup
            const backupInfo = await migrationBackupService.createPostMigrationBackup(migrationId);
            
            expect(backupInfo).toBeDefined();
            expect(backupInfo.migrationId).toBe(migrationId);
            expect(backupInfo.type).toBe('post-migration');
            expect(backupInfo.validation).toBeDefined();
            expect(backupInfo.validation.success).toBe(true);
        });

        it('should validate migration success', async () => {
            const migrationId = 'test-migration-003';
            
            // Add test data
            await addTestData();
            
            // Validate migration
            const validation = await migrationBackupService.validateMigrationSuccess(migrationId);
            
            expect(validation).toBeDefined();
            expect(validation.migrationId).toBe(migrationId);
            expect(validation.success).toBe(true);
            expect(validation.checks).toBeDefined();
            expect(validation.checks.length).toBeGreaterThan(0);
        });
    });

    describe('Persistence Configuration', () => {
        it('should have correct persistence settings', () => {
            const persistenceConfig = rxdbConnection.getPersistenceConfig();
            
            expect(persistenceConfig).toBeDefined();
            expect(persistenceConfig.autosave).toBeDefined();
            expect(persistenceConfig.autosaveInterval).toBeDefined();
            expect(persistenceConfig.throttledSaves).toBeDefined();
        });

        it('should have correct backup settings', () => {
            const backupConfig = rxdbConnection.getBackupConfig();
            
            expect(backupConfig).toBeDefined();
            expect(backupConfig.enabled).toBeDefined();
            expect(backupConfig.interval).toBeDefined();
            expect(backupConfig.maxBackups).toBeDefined();
        });

        it('should update persistence configuration', () => {
            const newConfig = {
                autosaveInterval: 10000,
                verbose: true
            };
            
            rxdbConnection.updatePersistenceConfig(newConfig);
            
            const updatedConfig = rxdbConnection.getPersistenceConfig();
            expect(updatedConfig.autosaveInterval).toBe(10000);
            expect(updatedConfig.verbose).toBe(true);
        });

        it('should update backup configuration', () => {
            const newConfig = {
                maxBackups: 5,
                compressionEnabled: true
            };
            
            rxdbConnection.updateBackupConfig(newConfig);
            
            const updatedConfig = rxdbConnection.getBackupConfig();
            expect(updatedConfig.maxBackups).toBe(5);
            expect(updatedConfig.compressionEnabled).toBe(true);
        });
    });

    // Helper functions
    async function createTestCollections() {
        const collections = [
            {
                name: 'users',
                schema: {
                    version: 0,
                    primaryKey: 'user_id',
                    type: 'object',
                    properties: {
                        user_id: { type: 'string' },
                        username: { type: 'string' },
                        email: { type: 'string' }
                    },
                    required: ['user_id', 'username', 'email']
                }
            },
            {
                name: 'games',
                schema: {
                    version: 0,
                    primaryKey: 'game_id',
                    type: 'object',
                    properties: {
                        game_id: { type: 'string' },
                        game_code: { type: 'string' },
                        status: { type: 'string' }
                    },
                    required: ['game_id', 'game_code']
                }
            }
        ];

        for (const collection of collections) {
            try {
                await rxdbConnection.addCollection(collection.name, collection.schema);
            } catch (error) {
                // Collection might already exist
                console.log(`Collection ${collection.name} already exists or failed to create:`, error.message);
            }
        }
    }

    async function addTestData() {
        const usersCollection = rxdbConnection.getCollection('users');
        const gamesCollection = rxdbConnection.getCollection('games');

        // Add test users
        const testUsers = [
            { user_id: 'user1', username: 'testuser1', email: 'test1@example.com' },
            { user_id: 'user2', username: 'testuser2', email: 'test2@example.com' },
            { user_id: 'user3', username: 'testuser3', email: 'test3@example.com' }
        ];

        for (const user of testUsers) {
            await usersCollection.insert(user);
        }

        // Add test games
        const testGames = [
            { game_id: 'game1', game_code: 'GAME001', status: 'waiting' },
            { game_id: 'game2', game_code: 'GAME002', status: 'in_progress' }
        ];

        for (const game of testGames) {
            await gamesCollection.insert(game);
        }

        return {
            userCount: testUsers.length,
            gameCount: testGames.length
        };
    }

    async function clearTestData() {
        const collections = rxdbConnection.getCollections();
        
        for (const [name, collection] of Object.entries(collections)) {
            await collection.find().remove();
        }
    }
});