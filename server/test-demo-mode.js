import GameEngine from './src/services/GameEngine.js';
import BotPlayer from './src/services/BotPlayer.js';
import dbConnection from './database/connection.js';
import { v4 as uuidv4 } from 'uuid';

async function testDemoMode() {
    try {
        console.log('Testing GameEngine Demo Mode Integration...');
        
        const gameEngine = new GameEngine();
        const testGameId = uuidv4();
        const testUserId = uuidv4();
        
        // Initialize database connection
        await dbConnection.initialize();
        console.log('✓ Database connected');

        // Clean up any existing test data first
        await dbConnection.query('DELETE FROM users WHERE username LIKE "TestUser%" OR is_bot = 1');
        await dbConnection.query('DELETE FROM games WHERE game_code LIKE "TEST%"');

        // Create test user
        await dbConnection.query(`
            INSERT INTO users (user_id, username, email, created_at)
            VALUES (?, ?, ?, NOW())
        `, [testUserId, `TestUser_${testUserId.substring(0, 8)}`, `test-${testUserId}@example.com`]);
        console.log('✓ Test user created');

        // Create test game (non-demo initially)
        await dbConnection.query(`
            INSERT INTO games (game_id, game_code, host_id, is_demo_mode, created_at)
            VALUES (?, ?, ?, ?, NOW())
        `, [testGameId, 'TEST01', testUserId, false]);
        console.log('✓ Test game created');

        // Test 1: Check non-demo mode detection
        let isDemoMode = await gameEngine.isDemoMode(testGameId);
        console.log(`✓ Non-demo mode detection: ${isDemoMode === false ? 'PASS' : 'FAIL'}`);

        // Test 2: Enable demo mode and check detection
        await dbConnection.query('UPDATE games SET is_demo_mode = 1 WHERE game_id = ?', [testGameId]);
        isDemoMode = await gameEngine.isDemoMode(testGameId);
        console.log(`✓ Demo mode detection: ${isDemoMode === true ? 'PASS' : 'FAIL'}`);

        // Test 3: Create test bots
        const testBots = [
            new BotPlayer({ gameId: testGameId, name: 'Test Bot 1' }),
            new BotPlayer({ gameId: testGameId, name: 'Test Bot 2' }),
            new BotPlayer({ gameId: testGameId, name: 'Test Bot 3' })
        ];
        console.log('✓ Test bots created');

        // Create bot users in database
        for (const bot of testBots) {
            await dbConnection.query(`
                INSERT INTO users (user_id, username, email, is_bot, bot_personality, bot_difficulty, created_at)
                VALUES (?, ?, ?, ?, ?, ?, NOW())
            `, [bot.id, bot.name, `${bot.id}@bot.local`, true, bot.personality, bot.difficulty]);
        }
        console.log('✓ Bot users created in database');

        // Create teams and game players
        const team1Id = uuidv4();
        const team2Id = uuidv4();
        
        await dbConnection.query(`
            INSERT INTO teams (team_id, game_id, team_number, current_score, player1_id, player2_id)
            VALUES (?, ?, ?, ?, ?, ?)
        `, [team1Id, testGameId, 1, 0, testUserId, testBots[0].id]);

        await dbConnection.query(`
            INSERT INTO teams (team_id, game_id, team_number, current_score, player1_id, player2_id)
            VALUES (?, ?, ?, ?, ?, ?)
        `, [team2Id, testGameId, 2, 0, testBots[1].id, testBots[2].id]);

        // Create game players
        await dbConnection.query(`
            INSERT INTO game_players (game_player_id, game_id, user_id, team_id, seat_position, joined_at)
            VALUES (?, ?, ?, ?, ?, NOW())
        `, [uuidv4(), testGameId, testUserId, team1Id, 1]);

        for (let i = 0; i < testBots.length; i++) {
            const teamId = i === 0 ? team1Id : team2Id;
            const seatPosition = i + 2;
            await dbConnection.query(`
                INSERT INTO game_players (game_player_id, game_id, user_id, team_id, seat_position, joined_at)
                VALUES (?, ?, ?, ?, ?, NOW())
            `, [uuidv4(), testGameId, testBots[i].id, teamId, seatPosition]);
        }
        console.log('✓ Teams and game players created');

        // Test 4: Initialize demo game
        const initResult = await gameEngine.initializeDemoGame(testGameId, testUserId, testBots);
        console.log(`✓ Demo game initialization: ${initResult.isDemoMode && initResult.totalPlayers === 4 ? 'PASS' : 'FAIL'}`);

        // Test 5: Bot player detection
        const isBot = gameEngine.isPlayerBot(testBots[0].id, testBots);
        const isHuman = gameEngine.isPlayerBot(testUserId, testBots);
        console.log(`✓ Bot player detection: ${isBot === true && isHuman === false ? 'PASS' : 'FAIL'}`);

        // Test 6: Database bot detection
        const isBotInDb = await gameEngine.isPlayerBotInDatabase(testBots[0].id);
        const isHumanInDb = await gameEngine.isPlayerBotInDatabase(testUserId);
        console.log(`✓ Database bot detection: ${isBotInDb === true && isHumanInDb === false ? 'PASS' : 'FAIL'}`);

        // Test 7: Demo game state
        const demoGameState = await gameEngine.getDemoGameState(testGameId);
        console.log(`✓ Demo game state: ${demoGameState.isDemoMode && demoGameState.demoInfo ? 'PASS' : 'FAIL'}`);

        // Test 8: Operation validation
        const validOp = await gameEngine.validateDemoGameOperation(testGameId, 'deal_cards');
        const invalidOp = await gameEngine.validateDemoGameOperation(testGameId, 'invalid_operation');
        console.log(`✓ Operation validation: ${validOp === true && invalidOp === false ? 'PASS' : 'FAIL'}`);

        // Clean up
        await dbConnection.query('DELETE FROM game_players WHERE game_id = ?', [testGameId]);
        await dbConnection.query('DELETE FROM teams WHERE game_id = ?', [testGameId]);
        await dbConnection.query('DELETE FROM games WHERE game_id = ?', [testGameId]);
        await dbConnection.query('DELETE FROM users WHERE user_id = ? OR is_bot = 1', [testUserId]);
        console.log('✓ Test data cleaned up');

        console.log('\n🎉 All demo mode tests passed!');
        
    } catch (error) {
        console.error('❌ Test failed:', error.message);
        console.error(error.stack);
    } finally {
        await dbConnection.close();
        process.exit(0);
    }
}

testDemoMode();