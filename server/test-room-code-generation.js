/**
 * Test script for room code generation
 * Run this to test if room code generation is working properly
 */

import Room from './src/models/Room.js';

async function testRoomCodeGeneration() {
    console.log('🧪 Testing room code generation...\n');
    
    // Initialize database connection
    try {
        const dbConnection = (await import('./database/connection.js')).default;
        await dbConnection.initialize();
        console.log('✅ Database connection initialized\n');
    } catch (error) {
        console.error('❌ Failed to initialize database:', error.message);
        console.log('⚠️  Continuing with limited testing...\n');
    }

    // Test 1: Basic room code generation
    console.log('Test 1: Basic room code generation');
    try {
        for (let i = 0; i < 5; i++) {
            const code = Room.generateRoomCode();
            console.log(`  Generated code ${i + 1}: ${code} (length: ${code.length})`);
            
            // Validate format
            if (code.length !== 5) {
                console.error(`  ❌ Invalid length: expected 5, got ${code.length}`);
            } else if (!/^[0-9A-Z]+$/.test(code)) {
                console.error(`  ❌ Invalid characters: ${code}`);
            } else {
                console.log(`  ✅ Valid format`);
            }
        }
    } catch (error) {
        console.error('  ❌ Error in basic generation:', error.message);
    }

    console.log('\nTest 2: Unique room code generation');
    try {
        const code = await Room.generateUniqueRoomCode();
        console.log(`  Generated unique code: ${code}`);
        console.log('  ✅ Unique generation successful');
    } catch (error) {
        console.error('  ❌ Error in unique generation:', error.message);
        console.log('  This might be expected if database is not set up yet');
    }

    console.log('\nTest 3: Room creation test');
    try {
        // Use an existing user from the database
        const dbConnection = (await import('./database/connection.js')).default;
        const users = await dbConnection.query('SELECT user_id FROM users LIMIT 1');
        
        if (users.length === 0) {
            throw new Error('No users found in database. Please create a user first.');
        }
        
        const testUserId = users[0].user_id;
        console.log('  ✅ Using existing user:', testUserId);

        const testRoomData = {
            name: 'Test Room',
            maxPlayers: 4,
            isPrivate: false,
            ownerId: testUserId
        };

        console.log('  Attempting to create room with data:', testRoomData);
        const room = await Room.create(testRoomData);
        console.log('  ✅ Room created successfully!');
        console.log('  Room details:', {
            id: room.room_id,
            name: room.name,
            inviteCode: room.invite_code
        });

        // Clean up - delete the test room
        try {
            await room.delete();
            console.log('  ✅ Test room cleaned up');
        } catch (cleanupError) {
            console.warn('  ⚠️  Could not clean up test room:', cleanupError.message);
        }

    } catch (error) {
        console.error('  ❌ Error in room creation:', error.message);
        console.log('  This indicates a database or schema issue');
    }

    console.log('\n🏁 Room code generation tests complete!');
}

// Run the tests
testRoomCodeGeneration()
    .then(() => {
        console.log('\n✅ All tests completed');
        process.exit(0);
    })
    .catch((error) => {
        console.error('\n❌ Test suite failed:', error);
        process.exit(1);
    });