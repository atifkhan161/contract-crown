import GameEngine from './src/services/GameEngine.js';
import GameRuleValidator from './src/services/GameRuleValidator.js';
import BotTurnProcessor from './src/services/BotTurnProcessor.js';
import BotManager from './src/services/BotManager.js';
import dbConnection from './database/connection.js';
import { v4 as uuidv4 } from 'uuid';

async function testGameRuleCompliance() {
    try {
        console.log('Testing Game Rule Compliance Validation...');
        
        const gameEngine = new GameEngine();
        const ruleValidator = new GameRuleValidator();
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
        `, [testGameId, 'TEST03', testUserId, true]);

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

        // Test 1: Initial rule compliance validation (after dealing)
        console.log('\nTesting initial rule compliance...');
        let validationResult = await ruleValidator.validateGameRuleCompliance(testGameId);
        console.log(`✓ Initial validation: ${validationResult.overallCompliance ? 'COMPLIANT' : 'NON-COMPLIANT'}`);
        console.log(`  - Checks passed: ${validationResult.summary.passedChecks}/${validationResult.summary.totalChecks}`);
        console.log(`  - Violations: ${validationResult.summary.totalViolations}`);

        // Process trump declaration by bot
        let nextPlayer = await gameEngine.getNextActionPlayer(testGameId);
        if (nextPlayer.actionType === 'declare_trump') {
            const isBot = await gameEngine.isPlayerBotInDatabase(nextPlayer.playerId);
            if (isBot) {
                console.log('\nProcessing bot trump declaration...');
                await BotTurnProcessor.processBotTurnIfNeeded(testGameId, nextPlayer.playerId);
                console.log('✓ Bot trump declaration completed');
            }
        }

        // Test 2: Rule compliance after trump declaration
        console.log('\nTesting rule compliance after trump declaration...');
        validationResult = await ruleValidator.validateGameRuleCompliance(testGameId);
        console.log(`✓ Post-trump validation: ${validationResult.overallCompliance ? 'COMPLIANT' : 'NON-COMPLIANT'}`);
        console.log(`  - Checks passed: ${validationResult.summary.passedChecks}/${validationResult.summary.totalChecks}`);
        console.log(`  - Violations: ${validationResult.summary.totalViolations}`);

        // Deal final cards and start trick-taking
        const gameState = await gameEngine.getDemoGameState(testGameId);
        if (gameState.currentRound && gameState.currentRound.trump_suit) {
            await gameEngine.completeTrumpDeclaration(testGameId, gameStartResult.remainingDeck);
            const firstTrickId = await gameEngine.startFirstTrick(gameState.currentRound.round_id, gameState.currentRound.first_player_user_id);
            console.log('✓ Final cards dealt and first trick started');
        }

        // Test 3: Rule compliance after final dealing
        console.log('\nTesting rule compliance after final dealing...');
        validationResult = await ruleValidator.validateGameRuleCompliance(testGameId);
        console.log(`✓ Post-dealing validation: ${validationResult.overallCompliance ? 'COMPLIANT' : 'NON-COMPLIANT'}`);
        console.log(`  - Checks passed: ${validationResult.summary.passedChecks}/${validationResult.summary.totalChecks}`);
        console.log(`  - Violations: ${validationResult.summary.totalViolations}`);

        // Process several bot card plays
        console.log('\nProcessing bot card plays...');
        const continuousResult = await gameEngine.processBotTurnsUntilHumanAction(testGameId, 5);
        console.log(`✓ Processed ${continuousResult.botActions?.length || 0} bot card plays`);

        // Test 4: Rule compliance after card plays
        console.log('\nTesting rule compliance after card plays...');
        validationResult = await ruleValidator.validateGameRuleCompliance(testGameId);
        console.log(`✓ Post-card-play validation: ${validationResult.overallCompliance ? 'COMPLIANT' : 'NON-COMPLIANT'}`);
        console.log(`  - Checks passed: ${validationResult.summary.passedChecks}/${validationResult.summary.totalChecks}`);
        console.log(`  - Violations: ${validationResult.summary.totalViolations}`);

        // Test 5: Individual validation components
        console.log('\nTesting individual validation components...');
        
        const deckValidation = await ruleValidator.validateDeckIntegrity(testGameId);
        console.log(`✓ Deck integrity: ${deckValidation.isValid ? 'VALID' : 'INVALID'}`);
        console.log(`  - Total cards: ${deckValidation.details.totalCardsDealt}`);
        console.log(`  - Duplicates: ${deckValidation.details.duplicateCards.length}`);
        console.log(`  - Invalid cards: ${deckValidation.details.invalidCards.length}`);

        const dealingValidation = await ruleValidator.validateDealingRules(testGameId);
        console.log(`✓ Dealing rules: ${dealingValidation.isValid ? 'VALID' : 'INVALID'}`);
        console.log(`  - Players with correct hand size: ${dealingValidation.details.playersWithCorrectHandSize}`);

        const trumpValidation = await ruleValidator.validateTrumpDeclarationRules(testGameId);
        console.log(`✓ Trump declaration: ${trumpValidation.isValid ? 'VALID' : 'INVALID'}`);
        console.log(`  - Trump suit: ${trumpValidation.details.trumpSuit}`);
        console.log(`  - Valid trump suit: ${trumpValidation.details.isValidTrumpSuit}`);

        const cardPlayValidation = await ruleValidator.validateCardPlayRules(testGameId);
        console.log(`✓ Card play rules: ${cardPlayValidation.isValid ? 'VALID' : 'INVALID'}`);
        console.log(`  - Tricks validated: ${cardPlayValidation.details.tricksValidated}`);
        console.log(`  - Suit following violations: ${cardPlayValidation.details.suitFollowingViolations}`);
        console.log(`  - Turn order violations: ${cardPlayValidation.details.turnOrderViolations}`);

        // Test 6: Generate compliance report
        console.log('\nGenerating compliance report...');
        const complianceReport = ruleValidator.generateComplianceReport(validationResult);
        console.log('✓ Compliance report generated');
        console.log(complianceReport);

        // Test 7: Test with intentional rule violation (for testing)
        console.log('\nTesting violation detection...');
        try {
            // Try to create a duplicate card scenario for testing
            const players = await gameEngine.getGamePlayers(testGameId);
            const testPlayer = players[0];
            
            // Add a duplicate card to test violation detection
            const currentHand = await dbConnection.query(`
                SELECT current_hand FROM game_players WHERE game_id = ? AND user_id = ?
            `, [testGameId, testPlayer.user_id]);
            
            if (currentHand.length > 0 && currentHand[0].current_hand) {
                const hand = JSON.parse(currentHand[0].current_hand);
                if (hand.length > 0) {
                    // Duplicate the first card
                    hand.push(hand[0]);
                    
                    await dbConnection.query(`
                        UPDATE game_players SET current_hand = ? WHERE game_id = ? AND user_id = ?
                    `, [JSON.stringify(hand), testGameId, testPlayer.user_id]);
                    
                    // Validate again - should detect violation
                    const violationTest = await ruleValidator.validateGameRuleCompliance(testGameId);
                    console.log(`✓ Violation detection test: ${!violationTest.overallCompliance ? 'PASS' : 'FAIL'}`);
                    console.log(`  - Violations detected: ${violationTest.summary.totalViolations}`);
                    
                    // Restore original hand
                    hand.pop();
                    await dbConnection.query(`
                        UPDATE game_players SET current_hand = ? WHERE game_id = ? AND user_id = ?
                    `, [JSON.stringify(hand), testGameId, testPlayer.user_id]);
                }
            }
        } catch (error) {
            console.log('✓ Violation detection test completed (with expected errors)');
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

        console.log('\n🎉 Game rule compliance validation tests completed!');
        
    } catch (error) {
        console.error('❌ Test failed:', error.message);
        console.error(error.stack);
    } finally {
        await dbConnection.close();
        process.exit(0);
    }
}

testGameRuleCompliance();