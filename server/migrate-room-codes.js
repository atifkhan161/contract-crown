#!/usr/bin/env node

/**
 * Room Code Migration Script
 * Migrates existing rooms to use 5-digit codes in the invite_code column
 */

import DatabaseInitializer from './database/init.js';

async function migrateRoomCodes() {
    console.log('🔄 Starting room code migration...\n');
    
    const initializer = new DatabaseInitializer();
    
    try {
        // Initialize database connection
        console.log('📡 Connecting to database...');
        await initializer.initialize();
        
        // Run room code migration
        console.log('🏠 Migrating room codes...');
        await initializer.migrateRoomCodes();
        
        console.log('\n✅ Room code migration completed successfully!');
        console.log('🎉 All rooms now have 5-digit codes in the invite_code column');
        
    } catch (error) {
        console.error('\n❌ Migration failed:', error.message);
        console.error('💡 Try running: node database/init.js migrate-rooms');
        process.exit(1);
    }
}

// Run migration
migrateRoomCodes()
    .then(() => {
        console.log('\n🏁 Migration script completed');
        process.exit(0);
    })
    .catch((error) => {
        console.error('\n💥 Unexpected error:', error);
        process.exit(1);
    });