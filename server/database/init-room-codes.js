/**
 * Database initialization script for room codes
 * Run this script to ensure the database schema supports room codes
 */

import dbConnection from './connection.js';

async function initializeRoomCodeSchema() {
    try {
        console.log('🔧 Initializing room code database schema...');

        // Check if rooms table exists
        try {
            await dbConnection.query('SELECT 1 FROM rooms LIMIT 1');
            console.log('✅ Rooms table exists');
        } catch (error) {
            console.error('❌ Rooms table does not exist. Please create it first.');
            return false;
        }

        // Add room_code column if it doesn't exist
        try {
            await dbConnection.query('ALTER TABLE rooms ADD COLUMN room_code VARCHAR(5)');
            console.log('✅ Added room_code column');
        } catch (error) {
            if (error.message.includes('Duplicate column') || error.message.includes('already exists')) {
                console.log('ℹ️  room_code column already exists');
            } else {
                console.warn('⚠️  Error adding room_code column:', error.message);
            }
        }

        // Add version column if it doesn't exist
        try {
            await dbConnection.query('ALTER TABLE rooms ADD COLUMN version INT DEFAULT 1');
            console.log('✅ Added version column');
        } catch (error) {
            if (error.message.includes('Duplicate column') || error.message.includes('already exists')) {
                console.log('ℹ️  version column already exists');
            } else {
                console.warn('⚠️  Error adding version column:', error.message);
            }
        }

        // Create unique index on room_code
        try {
            await dbConnection.query('CREATE UNIQUE INDEX idx_rooms_code_unique ON rooms(room_code)');
            console.log('✅ Created unique index on room_code');
        } catch (error) {
            if (error.message.includes('already exists') || error.message.includes('Duplicate key')) {
                console.log('ℹ️  Unique index on room_code already exists');
            } else {
                console.warn('⚠️  Error creating unique index:', error.message);
            }
        }

        // Update existing rooms to have version = 1 if NULL
        try {
            const result = await dbConnection.query('UPDATE rooms SET version = 1 WHERE version IS NULL');
            if (result.affectedRows > 0) {
                console.log(`✅ Updated ${result.affectedRows} rooms with version = 1`);
            } else {
                console.log('ℹ️  All rooms already have version numbers');
            }
        } catch (error) {
            console.warn('⚠️  Error updating room versions:', error.message);
        }

        // Test room code generation
        try {
            const testCode = generateTestRoomCode();
            console.log(`✅ Room code generation test: ${testCode}`);
            
            // Test database query
            const existing = await dbConnection.query('SELECT room_id FROM rooms WHERE room_code = ?', [testCode]);
            console.log(`✅ Room code uniqueness check test: ${existing.length === 0 ? 'working' : 'found existing'}`);
        } catch (error) {
            console.warn('⚠️  Error testing room code functionality:', error.message);
        }

        console.log('🎉 Room code schema initialization complete!');
        return true;

    } catch (error) {
        console.error('❌ Failed to initialize room code schema:', error);
        return false;
    }
}

function generateTestRoomCode() {
    const chars = '0123456789ABCDEFGHJKLMNPQRSTUVWXYZ';
    let code = '';
    for (let i = 0; i < 5; i++) {
        code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return code;
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
    initializeRoomCodeSchema()
        .then((success) => {
            if (success) {
                console.log('✅ Database initialization completed successfully');
                process.exit(0);
            } else {
                console.error('❌ Database initialization failed');
                process.exit(1);
            }
        })
        .catch((error) => {
            console.error('❌ Unexpected error during initialization:', error);
            process.exit(1);
        });
}

export { initializeRoomCodeSchema };