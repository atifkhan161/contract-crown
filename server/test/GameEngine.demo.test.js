import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import GameEngine from '../src/services/GameEngine.js';
import BotPlayer from '../src/services/BotPlayer.js';
import rxdbConnection from '../database/rxdb-connection.js';
import { v4 as uuidv4 } from 'uuid';

describe('GameEngine Demo Mode Integration', () => {
    let gameEngine;
    let testGameId;
    let testUserId;
    let testBots;

    beforeEach(async () => {
        gameEngine = new GameEngine();
        testGameId = uuidv4();
        testUserId = uuidv4();
        
        // Create test bots
        testBots = [
            new BotPlayer({ gameId: testGameId, name: 'Test Bot 1' }),
            new BotPlayer({ gameId: testGameId, name: 'Test Bot 2' }),
            new BotPlayer({ gameId: testGameId, name: 'Test Bot 3' })
        ];

        // Initialize database connection
        await dbConnection.initialize();

        // Create test user
        await dbConnection.query(`
            INSERT INTO users (user_id, username, email, created_at)
            VALUES (?, ?, ?, NOW())
        `, [testUserId, 'TestUser', 'test@example.com']);

        // Create test game
        await dbConnection.query(`
            INSERT INTO games (game_id, game_code, host_id, is_demo_mode, created_at)
            VALUES (?, ?, ?, ?, NOW())
        `, [testGameId, 'TEST01', testUserId, false]);

        // Create bot users
        for (const bot of testBots) {
            await dbConnection.query(`
                INSERT INTO users (user_id, username, email, is_bot, bot_personality, bot_difficulty, created_at)
                VALUES (?, ?, ?, ?, ?, ?, NOW())
            `, [bot.id, bot.name, `${bot.id}@bot.local`, true, bot.personality, bot.difficulty]);
        }

        // Create teams
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
            INSERT INTO game_players (game_id, user_id, team_id, seat_position, joined_at)
            VALUES (?, ?, ?, ?, NOW())
        `, [testGameId, testUserId, team1Id, 1]);

        await dbConnection.query(`
            INSERT INTO game_players (game_id, user_id, team_id, seat_position, joined_at)
            VALUES (?, ?, ?, ?, NOW())
        `, [testGameId, testBots[0].id, team1Id, 2]);

        await dbConnection.query(`
            INSERT INTO game_players (game_id, user_id, team_id, seat_position, joined_at)
            VALUES (?, ?, ?, ?, NOW())
        `, [testGameId, testBots[1].id, team2Id, 3]);

        await dbConnection.query(`
            INSERT INTO game_players (game_id, user_id, team_id, seat_position, joined_at)
            VALUES (?, ?, ?, ?, NOW())
        `, [testGameId, testBots[2].id, team2Id, 4]);
    });

    afterEach(async () => {
        // Clean up test data
        try {
            await dbConnection.query('DELETE FROM game_players WHERE game_id = ?', [testGameId]);
            await dbConnection.query('DELETE FROM teams WHERE game_id = ?', [testGameId]);
            await dbConnection.query('DELETE FROM games WHERE game_id = ?', [testGameId]);
            await dbConnection.query('DELETE FROM users WHERE user_id = ? OR is_bot = 1', [testUserId]);
        } catch (error) {
            console.error('Cleanup error:', error);
        }
        await dbConnection.close();
    });

    describe('Demo Mode Detection', () => {
        it('should detect non-demo mode correctly', async () => {
            const isDemoMode = await gameEngine.isDemoMode(testGameId);
            expect(isDemoMode).toBe(false);
        });

        it('should detect demo mode correctly after enabling', async () => {
            // Enable demo mode
            await dbConnection.query('UPDATE games SET is_demo_mode = 1 WHERE game_id = ?', [testGameId]);
            
            const isDemoMode = await gameEngine.isDemoMode(testGameId);
            expect(isDemoMode).toBe(true);
        });

        it('should return false for non-existent game', async () => {
            const fakeGameId = uuidv4();
            const isDemoMode = await gameEngine.isDemoMode(fakeGameId);
            expect(isDemoMode).toBe(false);
        });
    });

    describe('Demo Game Initialization', () => {
        it('should initialize demo game with correct player composition', async () => {
            const result = await gameEngine.initializeDemoGame(testGameId, testUserId, testBots);
            
            expect(result.gameId).toBe(testGameId);
            expect(result.isDemoMode).toBe(true);
            expect(result.humanPlayerId).toBe(testUserId);
            expect(result.botPlayerIds).toHaveLength(3);
            expect(result.totalPlayers).toBe(4);
            expect(result.status).toBe('initialized');

            // Verify demo mode was set in database
            const isDemoMode = await gameEngine.isDemoMode(testGameId);
            expect(isDemoMode).toBe(true);
        });

        it('should throw error with incorrect number of bots', async () => {
            const invalidBots = [testBots[0], testBots[1]]; // Only 2 bots
            
            await expect(
                gameEngine.initializeDemoGame(testGameId, testUserId, invalidBots)
            ).rejects.toThrow('Demo game must have exactly 3 bot players');
        });
    });

    describe('Bot Player Detection', () => {
        it('should correctly identify bot players', () => {
            const isBot1 = gameEngine.isPlayerBot(testBots[0].id, testBots);
            const isBot2 = gameEngine.isPlayerBot(testBots[1].id, testBots);
            const isHuman = gameEngine.isPlayerBot(testUserId, testBots);
            
            expect(isBot1).toBe(true);
            expect(isBot2).toBe(true);
            expect(isHuman).toBe(false);
        });

        it('should identify bot players from database', async () => {
            const isBot = await gameEngine.isPlayerBotInDatabase(testBots[0].id);
            const isHuman = await gameEngine.isPlayerBotInDatabase(testUserId);
            
            expect(isBot).toBe(true);
            expect(isHuman).toBe(false);
        });
    });

    describe('Demo Game State', () => {
        it('should return enhanced demo game state', async () => {
            // Enable demo mode
            await dbConnection.query('UPDATE games SET is_demo_mode = 1 WHERE game_id = ?', [testGameId]);
            
            const gameState = await gameEngine.getDemoGameState(testGameId);
            
            expect(gameState.isDemoMode).toBe(true);
            expect(gameState.demoInfo).toBeDefined();
            expect(gameState.demoInfo.humanPlayers).toHaveLength(1);
            expect(gameState.demoInfo.botPlayers).toHaveLength(3);
            expect(gameState.demoInfo.humanPlayers[0].user_id).toBe(testUserId);
        });

        it('should return regular game state for non-demo games', async () => {
            const gameState = await gameEngine.getDemoGameState(testGameId);
            
            expect(gameState.isDemoMode).toBeUndefined();
            expect(gameState.demoInfo).toBeUndefined();
        });
    });

    describe('Demo Game Operation Validation', () => {
        it('should allow valid operations in demo mode', async () => {
            // Enable demo mode
            await dbConnection.query('UPDATE games SET is_demo_mode = 1 WHERE game_id = ?', [testGameId]);
            
            const validOperations = [
                'deal_cards', 'declare_trump', 'play_card', 
                'complete_trick', 'complete_round', 'start_next_round', 'complete_game'
            ];
            
            for (const operation of validOperations) {
                const isValid = await gameEngine.validateDemoGameOperation(testGameId, operation);
                expect(isValid).toBe(true);
            }
        });

        it('should reject invalid operations in demo mode', async () => {
            // Enable demo mode
            await dbConnection.query('UPDATE games SET is_demo_mode = 1 WHERE game_id = ?', [testGameId]);
            
            const invalidOperations = ['invalid_operation', 'admin_action', 'reset_game'];
            
            for (const operation of invalidOperations) {
                const isValid = await gameEngine.validateDemoGameOperation(testGameId, operation);
                expect(isValid).toBe(false);
            }
        });

        it('should allow all operations in regular games', async () => {
            const isValid1 = await gameEngine.validateDemoGameOperation(testGameId, 'any_operation');
            const isValid2 = await gameEngine.validateDemoGameOperation(testGameId, 'admin_action');
            
            expect(isValid1).toBe(true);
            expect(isValid2).toBe(true);
        });
    });

    describe('Demo Mode Integration with Game Methods', () => {
        beforeEach(async () => {
            // Enable demo mode for these tests
            await dbConnection.query('UPDATE games SET is_demo_mode = 1 WHERE game_id = ?', [testGameId]);
        });

        it('should start new demo game with demo mode flag', async () => {
            const result = await gameEngine.startNewGame(testGameId);
            
            expect(result.isDemoMode).toBe(true);
            expect(result.gameId).toBe(testGameId);
            expect(result.phase).toBe('trump_declaration');
        });

        it('should validate demo operations during card dealing', async () => {
            const result = await gameEngine.dealInitialCards(testGameId);
            
            expect(result.playerHands).toBeDefined();
            expect(Object.keys(result.playerHands)).toHaveLength(4);
        });
    });
});