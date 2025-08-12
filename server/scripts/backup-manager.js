#!/usr/bin/env node

import rxdbConnection from '../database/rxdb-connection.js';
import { fileURLToPath } from 'url';
import path from 'path';
import fs from 'fs/promises';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Backup Manager CLI Tool
 * Provides command-line interface for backup and restore operations
 */
class BackupManager {
    constructor() {
        this.commands = {
            'create': this.createBackup.bind(this),
            'list': this.listBackups.bind(this),
            'restore': this.restoreBackup.bind(this),
            'validate': this.validateBackup.bind(this),
            'cleanup': this.cleanupBackups.bind(this),
            'help': this.showHelp.bind(this)
        };
    }

    async run() {
        const args = process.argv.slice(2);
        const command = args[0] || 'help';
        
        if (!this.commands[command]) {
            console.error(`Unknown command: ${command}`);
            this.showHelp();
            process.exit(1);
        }

        try {
            await this.commands[command](args.slice(1));
        } catch (error) {
            console.error('Command failed:', error.message);
            process.exit(1);
        }
    }

    async createBackup(args) {
        const type = args[0] || 'manual';
        
        console.log(`Creating ${type} backup...`);
        
        // Initialize RxDB connection
        await rxdbConnection.initialize();
        
        // Initialize collections (minimal setup for backup)
        await this.initializeMinimalCollections();
        
        // Create backup
        const backupPath = await rxdbConnection.createBackup(type);
        
        console.log(`✅ Backup created successfully: ${backupPath}`);
        
        await rxdbConnection.gracefulShutdown();
    }

    async listBackups(args) {
        console.log('📋 Available backups:');
        
        try {
            // Initialize RxDB connection
            await rxdbConnection.initialize();
            
            const backups = await rxdbConnection.listBackups();
            
            if (backups.length === 0) {
                console.log('No backups found.');
                return;
            }

            // Sort by creation time (newest first)
            backups.sort((a, b) => b.created - a.created);

            console.log('\\n' + '='.repeat(80));
            console.log('Name'.padEnd(40) + 'Size'.padEnd(12) + 'Created'.padEnd(20) + 'Modified');
            console.log('='.repeat(80));

            for (const backup of backups) {
                const size = this.formatFileSize(backup.size);
                const created = backup.created.toLocaleString();
                const modified = backup.mtime.toLocaleString();
                
                console.log(
                    backup.name.padEnd(40) + 
                    size.padEnd(12) + 
                    created.padEnd(20) + 
                    modified
                );
            }
            
            console.log('='.repeat(80));
            console.log(`Total: ${backups.length} backup(s)`);
            
        } catch (error) {
            console.error('Failed to list backups:', error.message);
        } finally {
            await rxdbConnection.gracefulShutdown();
        }
    }

    async restoreBackup(args) {
        const backupPath = args[0];
        
        if (!backupPath) {
            console.error('Please specify backup file path');
            console.log('Usage: npm run backup:restore <backup-file-path>');
            return;
        }

        console.log(`🔄 Restoring from backup: ${backupPath}`);
        
        // Confirm restoration
        const confirmed = await this.confirmAction(
            `This will replace all current data with the backup. Continue? (y/N): `
        );
        
        if (!confirmed) {
            console.log('Restoration cancelled.');
            return;
        }

        try {
            // Initialize RxDB connection
            await rxdbConnection.initialize();
            
            // Initialize collections
            await this.initializeMinimalCollections();
            
            // Create backup before restoration
            console.log('Creating safety backup before restoration...');
            await rxdbConnection.createBackup('pre-restore');
            
            // Restore from backup
            await rxdbConnection.restoreFromBackup(backupPath);
            
            console.log('✅ Backup restored successfully');
            
        } catch (error) {
            console.error('❌ Restoration failed:', error.message);
            throw error;
        } finally {
            await rxdbConnection.gracefulShutdown();
        }
    }

    async validateBackup(args) {
        const backupPath = args[0];
        
        if (!backupPath) {
            console.error('Please specify backup file path');
            console.log('Usage: npm run backup:validate <backup-file-path>');
            return;
        }

        console.log(`🔍 Validating backup: ${backupPath}`);
        
        try {
            // Initialize RxDB connection
            await rxdbConnection.initialize();
            
            const isValid = await rxdbConnection.validateBackup(backupPath);
            
            if (isValid) {
                console.log('✅ Backup validation passed');
            } else {
                console.log('❌ Backup validation failed');
            }
            
        } catch (error) {
            console.error('❌ Backup validation failed:', error.message);
            throw error;
        } finally {
            await rxdbConnection.gracefulShutdown();
        }
    }

    async cleanupBackups(args) {
        console.log('🧹 Cleaning up old backups...');
        
        try {
            // Initialize RxDB connection
            await rxdbConnection.initialize();
            
            const backups = await rxdbConnection.listBackups();
            const maxBackups = rxdbConnection.getBackupConfig().maxBackups;
            
            console.log(`Current backups: ${backups.length}, Max allowed: ${maxBackups}`);
            
            if (backups.length <= maxBackups) {
                console.log('No cleanup needed.');
                return;
            }

            // Confirm cleanup
            const toDelete = backups.length - maxBackups;
            const confirmed = await this.confirmAction(
                `This will delete ${toDelete} old backup(s). Continue? (y/N): `
            );
            
            if (!confirmed) {
                console.log('Cleanup cancelled.');
                return;
            }

            const deletedCount = await rxdbConnection.backupService.cleanupOldBackups();
            console.log(`✅ Cleanup completed: ${deletedCount} backup(s) deleted`);
            
        } catch (error) {
            console.error('❌ Cleanup failed:', error.message);
            throw error;
        } finally {
            await rxdbConnection.gracefulShutdown();
        }
    }

    showHelp() {
        console.log(`
📦 RxDB Backup Manager

Usage: node scripts/backup-manager.js <command> [options]

Commands:
  create [type]     Create a new backup (default: manual)
                    Types: manual, scheduled, migration, shutdown
  
  list             List all available backups
  
  restore <path>   Restore database from backup file
                   Creates safety backup before restoration
  
  validate <path>  Validate backup file integrity
  
  cleanup          Remove old backups based on retention policy
  
  help             Show this help message

Examples:
  node scripts/backup-manager.js create manual
  node scripts/backup-manager.js list
  node scripts/backup-manager.js restore /path/to/backup.json
  node scripts/backup-manager.js validate /path/to/backup.json
  node scripts/backup-manager.js cleanup

Environment Variables:
  RXDB_BACKUP_PATH        Backup directory path
  RXDB_MAX_BACKUPS        Maximum number of backups to keep
  RXDB_BACKUP_COMPRESSION Enable/disable backup compression
        `);
    }

    // Helper methods

    async initializeMinimalCollections() {
        // Initialize minimal collections for backup operations
        // This would normally be done by the application startup
        const collections = ['users', 'games', 'rooms', 'teams', 'gameplayers', 'gamerounds', 'gametricks', 'usersessions'];
        
        for (const collectionName of collections) {
            try {
                // Try to get existing collection
                rxdbConnection.getCollection(collectionName);
            } catch (error) {
                // Collection doesn't exist, create minimal schema
                const minimalSchema = {
                    version: 0,
                    primaryKey: `${collectionName.slice(0, -1)}_id`,
                    type: 'object',
                    properties: {
                        [`${collectionName.slice(0, -1)}_id`]: { type: 'string' }
                    },
                    required: [`${collectionName.slice(0, -1)}_id`]
                };
                
                await rxdbConnection.addCollection(collectionName, minimalSchema);
            }
        }
    }

    formatFileSize(bytes) {
        const sizes = ['B', 'KB', 'MB', 'GB'];
        if (bytes === 0) return '0 B';
        const i = Math.floor(Math.log(bytes) / Math.log(1024));
        return Math.round(bytes / Math.pow(1024, i) * 100) / 100 + ' ' + sizes[i];
    }

    async confirmAction(message) {
        // Simple confirmation for CLI
        // In a real implementation, you might want to use a proper CLI library
        process.stdout.write(message);
        
        return new Promise((resolve) => {
            process.stdin.once('data', (data) => {
                const input = data.toString().trim().toLowerCase();
                resolve(input === 'y' || input === 'yes');
            });
        });
    }
}

// Run the backup manager if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
    const manager = new BackupManager();
    manager.run().catch(error => {
        console.error('Backup manager failed:', error.message);
        process.exit(1);
    });
}

export default BackupManager;