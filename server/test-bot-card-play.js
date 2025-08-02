import GameEngine from './src/services/GameEngine.js';
import BotTurnProcessor from './src/services/BotTurnProcessor.js';
import BotManager from './src/services/BotManager.js';
import dbConnection from './database/connection.js';
import { v4 as uuidv4 } from 'uuid';

async function testBotCardPlay() {
    try {
        console.log('Testing Bot Card Play Processing...');
        
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

        // Create test game (demo mode)
        await dbConnection.query(`
            INSERT INTO games (game_id, game_code, host_id, is_demo_mode, created_at)
            VALUES (?, ?, ?, ?, NOW())
        `, [testGameId, 'TEST02', testUserId, true]);

        // Create test bots
        const testBots = BotManager.createBotsForGame(testGameId, 3);
        await BotManager.storeBotPlayersInDatabase(testGameId);

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

        // Initialize demo game and start it
        await gameEngine.initializeDemoGame(testGameId, testUserId, testBots);
        const gameStartResult = await gameEngine.startNewGame(testGameId);
        console.log('✓ Demo game setup complete');

        // Process trump declaration (should be a bot)
        let nextPlayer = await gameEngine.getNextActionPlayer(testGameId);
        if (nextPlayer.actionType === 'declare_trump') {
            const isBot = await gameEngine.isPlayerBotInDatabase(nextPlayer.playerId);
            if (isBot) {
                console.log('Processing bot trump declaration...');
                await BotTurnProcessor.processBotTurnIfNeeded(testGameId, nextPlayer.playerId);
                console.log('✓ Bot trump declaration completed');
            }
        }

        // Deal final cards after trump declaration
        const gameState = await gameEngine.getDemoGameState(testGameId);
        if (gameState.currentRound && gameState.currentRound.trump_suit) {
            const finalCardsResult = await gameEngine.completeTrumpDeclaration(testGameId, gameStartResult.remainingDeck);
            console.log('✓ Final cards dealt');

            // Start first trick
            const firstTrickId = await gameEngine.startFirstTrick(gameState.currentRound.round_id, gameState.currentRound.first_player_user_id);
            console.log('✓ First trick started');

            // Test bot card play
            nextPlayer = await gameEngine.getNextActionPlayer(testGameId);
            console.log(`Next player for card play: ${nextPlayer.playerId} (action: ${nextPlayer.actionType})`);

            if (nextPlayer.actionType === 'play_card') {
                const isBot = await gameEngine.isPlayerBotInDatabase(nextPlayer.playerId);
                console.log(`Next player is bot: ${isBot}`);

                if (isBot) {
                    console.log('Processing bot card play...');
                    const cardPlayResult = await BotTurnProcessor.processBotTurnIfNeeded(testGameId, nextPlayer.playerId);
                    console.log(`✓ Bot card play: ${cardPlayResult ? 'PASS' : 'FAIL'}`);
                    
                    if (cardPlayResult && cardPlayResult.card) {
                        console.log(`  - Bot played: ${cardPlayResult.card.rank} of ${cardPlayResult.card.suit}`);
                        console.log(`  - Player: ${cardPlayResult.playerName}`);
                    }

                    // Test continuous bot processing for multiple card plays
                    console.log('Testing continuous bot card plays...');
                    const continuousResult = await gameEngine.processBotTurnsUntilHumanAction(testGameId, 3);
                    console.log(`✓ Continuous card play processing: ${continuousResult.botActions ? 'PASS' : 'FAIL'}`);
                    console.log(`  - Additional bot actions: ${continuousResult.botActions?.length || 0}`);
                    console.log(`  - Requires human action: ${continuousResult.requiresHumanAction}`);
                    
                    if (continuousResult.nextHumanPlayer) {
                        console.log(`  - Next human player: ${continuousResult.nextHumanPlayer.playerId}`);
                    }
                }
            }
        }

        // Clean up
        BotManager.clearGameBots(testGameId);
        await dbConnection.query('DELETE FROM game_tricks WHERE round_id IN (SELECT round_id FROM game_rounds WHERE game_id = ?)', [testGameId]);
        await dbConnection.query('DELETE FROM game_rounds WHERE game_id = ?', [testGameId]);
        await dbConnection.query('DELETE FROM game_players WHERE game_id = ?', [testGameId]);
        await dbConnection.query('DELETE FROM teams WHERE game_id = ?', [testGameId]);
        await dbConnection.query('DELETE FROM games WHERE game_id = ?', [testGameId]);
        await dbConnection.query('DELETE FROM users WHERE user_id = ? OR is_bot = 1', [testUserId]);
        console.log('✓ Test data cleaned up');

        console.log('\n🎉 Bot card play processing tests completed!');
        
    } catch (error) {
        console.error('❌ Test failed:', error.message);
        console.error(error.stack);
    } finally {
        await dbConnection.close();
        process.exit(0);
    }
}

testBotCardPlay();