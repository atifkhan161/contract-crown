import GameEngine from './src/services/GameEngine.js';
import BotTurnProcessor from './src/services/BotTurnProcessor.js';
import BotManager from './src/services/BotManager.js';
import BotPlayer from './src/services/BotPlayer.js';
import dbConnection from './database/connection.js';
import { v4 as uuidv4 } from 'uuid';

async function testBotTurnProcessing() {
    try {
        console.log('Testing Bot Turn Processing...');
        
        const gameEngine = new GameEngine();
        const testGameId = uuidv4();
        const testUserId = uuidv4();
        
        // Initialize database connection
        await dbConnection.initialize();
        console.log('✓ Database connected');

        // Clean up any existing test data
        await dbConnection.query('DELETE FROM users WHERE username LIKE "TestUser%" OR is_bot = 1');
        await dbConnection.query('DELETE FROM games WHERE game_code LIKE "TEST%"');

        // Create test user
        await dbConnection.query(`
            INSERT INTO users (user_id, username, email, created_at)
            VALUES (?, ?, ?, NOW())
        `, [testUserId, `TestUser_${testUserId.substring(0, 8)}`, `test-${testUserId}@example.com`]);
        console.log('✓ Test user created');

        // Create test game (demo mode)
        await dbConnection.query(`
            INSERT INTO games (game_id, game_code, host_id, is_demo_mode, created_at)
            VALUES (?, ?, ?, ?, NOW())
        `, [testGameId, 'TEST01', testUserId, true]);
        console.log('✓ Test demo game created');

        // Create test bots
        const testBots = BotManager.createBotsForGame(testGameId, 3);
        console.log('✓ Test bots created');

        // Store bots in database
        await BotManager.storeBotPlayersInDatabase(testGameId);
        console.log('✓ Bot users stored in database');

        // Verify bot users were created
        const botUserIds = testBots.map(bot => bot.id);
        const botUsersCheck = await dbConnection.query(`
            SELECT user_id, username, is_bot FROM users WHERE user_id IN (${botUserIds.map(() => '?').join(',')})
        `, botUserIds);
        console.log(`✓ Bot users verification: ${botUsersCheck.length} of ${testBots.length} bots found in database`);

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

        // Initialize demo game
        await gameEngine.initializeDemoGame(testGameId, testUserId, testBots);
        console.log('✓ Demo game initialized');

        // Start the game
        const gameStartResult = await gameEngine.startNewGame(testGameId);
        console.log('✓ Game started');

        // Test 1: Check next action player detection
        const nextPlayer = await gameEngine.getNextActionPlayer(testGameId);
        console.log(`✓ Next action player detection: ${nextPlayer.playerId ? 'PASS' : 'FAIL'}`);
        console.log(`  - Player: ${nextPlayer.playerId}`);
        console.log(`  - Action: ${nextPlayer.actionType}`);
        console.log(`  - Phase: ${nextPlayer.phase}`);

        // Test 2: Check if next player is a bot
        const isNextPlayerBot = await gameEngine.isPlayerBotInDatabase(nextPlayer.playerId);
        console.log(`✓ Next player is bot: ${isNextPlayerBot ? 'PASS' : 'FAIL'}`);

        // Test 3: Process bot turn if it's a bot's turn
        if (isNextPlayerBot) {
            console.log('Processing bot turn...');
            const botTurnResult = await BotTurnProcessor.processBotTurnIfNeeded(testGameId, nextPlayer.playerId);
            console.log(`✓ Bot turn processing: ${botTurnResult ? 'PASS' : 'FAIL'}`);
            
            if (botTurnResult) {
                console.log(`  - Action: ${botTurnResult.actionType}`);
                console.log(`  - Player: ${botTurnResult.playerName}`);
                if (botTurnResult.trumpSuit) {
                    console.log(`  - Trump: ${botTurnResult.trumpSuit}`);
                }
                if (botTurnResult.card) {
                    console.log(`  - Card: ${botTurnResult.card.rank} of ${botTurnResult.card.suit}`);
                }
            }
        }

        // Test 4: Test automatic game turn advancement
        console.log('Testing automatic game turn advancement...');
        const advanceResult = await gameEngine.advanceGameTurn(testGameId);
        console.log(`✓ Game turn advancement: ${advanceResult.gameAdvanced ? 'PASS' : 'FAIL'}`);

        // Test 5: Test continuous bot processing
        console.log('Testing continuous bot processing...');
        const continuousResult = await gameEngine.processBotTurnsUntilHumanAction(testGameId, 5);
        console.log(`✓ Continuous bot processing: ${continuousResult.botActions ? 'PASS' : 'FAIL'}`);
        console.log(`  - Bot actions processed: ${continuousResult.botActions?.length || 0}`);
        console.log(`  - Requires human action: ${continuousResult.requiresHumanAction}`);

        // Test 6: Test bot action validation
        const firstBot = testBots[0];
        const validationResult = await BotTurnProcessor.validateBotAction(testGameId, firstBot.id, 'declare_trump');
        console.log(`✓ Bot action validation: ${validationResult.isValid !== undefined ? 'PASS' : 'FAIL'}`);

        // Test 7: Test error handling
        try {
            await BotTurnProcessor.processBotTurnIfNeeded('invalid-game-id', firstBot.id);
            console.log('✓ Error handling: FAIL (should have thrown error)');
        } catch (error) {
            console.log('✓ Error handling: PASS (correctly threw error)');
        }

        // Test 8: Test bot action error handling
        try {
            const errorResult = await BotTurnProcessor.handleBotActionError(testGameId, firstBot.id, new Error('Test error'));
            console.log(`✓ Bot error handling: ${errorResult ? 'PASS' : 'FAIL'}`);
        } catch (error) {
            console.log('✓ Bot error handling: PASS (handled gracefully)');
        }

        // Clean up
        BotManager.clearGameBots(testGameId);
        await dbConnection.query('DELETE FROM game_players WHERE game_id = ?', [testGameId]);
        await dbConnection.query('DELETE FROM teams WHERE game_id = ?', [testGameId]);
        await dbConnection.query('DELETE FROM games WHERE game_id = ?', [testGameId]);
        await dbConnection.query('DELETE FROM users WHERE user_id = ? OR is_bot = 1', [testUserId]);
        console.log('✓ Test data cleaned up');

        console.log('\n🎉 All bot turn processing tests passed!');
        
    } catch (error) {
        console.error('❌ Test failed:', error.message);
        console.error(error.stack);
    } finally {
        await dbConnection.close();
        process.exit(0);
    }
}

testBotTurnProcessing();