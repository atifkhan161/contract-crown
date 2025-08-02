import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import BotPlayer from '../src/services/BotPlayer.js';
import BotManager from '../src/services/BotManager.js';

describe('BotPlayer', () => {
    let bot;

    beforeEach(() => {
        bot = new BotPlayer();
    });

    describe('constructor', () => {
        it('should create a bot with default properties', () => {
            expect(bot.id).toMatch(/^bot_/);
            expect(bot.name).toBeDefined();
            expect(bot.isBot).toBe(true);
            expect(['aggressive', 'conservative', 'balanced']).toContain(bot.personality);
            expect(['easy', 'medium', 'hard']).toContain(bot.difficulty);
            expect(bot.hand).toEqual([]);
            expect(bot.teamId).toBeNull();
            expect(bot.seatPosition).toBeNull();
        });

        it('should create a bot with custom options', () => {
            const customBot = new BotPlayer({
                name: 'Test Bot',
                personality: 'aggressive',
                difficulty: 'hard',
                gameId: 'test-game-123'
            });

            expect(customBot.name).toBe('Test Bot');
            expect(customBot.personality).toBe('aggressive');
            expect(customBot.difficulty).toBe('hard');
            expect(customBot.gameId).toBe('test-game-123');
        });
    });

    describe('generateBotName', () => {
        it('should generate a valid bot name', () => {
            const name = bot.generateBotName();
            expect(name).toMatch(/\w+ Bot/);
        });
    });

    describe('generatePersonality', () => {
        it('should generate a valid personality', () => {
            const personality = bot.generatePersonality();
            expect(['aggressive', 'conservative', 'balanced']).toContain(personality);
        });
    });

    describe('calculateDecisionDelay', () => {
        it('should calculate appropriate delay for different personalities', () => {
            const aggressiveBot = new BotPlayer({ personality: 'aggressive', difficulty: 'medium' });
            const conservativeBot = new BotPlayer({ personality: 'conservative', difficulty: 'medium' });
            
            expect(aggressiveBot.decisionDelay).toBeGreaterThan(0);
            expect(conservativeBot.decisionDelay).toBeGreaterThan(0);
            // Conservative bots should generally take longer
            expect(conservativeBot.decisionDelay).toBeGreaterThan(aggressiveBot.decisionDelay * 0.8);
        });
    });

    describe('calculateAggressiveness', () => {
        it('should calculate aggressiveness based on personality', () => {
            const aggressiveBot = new BotPlayer({ personality: 'aggressive' });
            const conservativeBot = new BotPlayer({ personality: 'conservative' });
            
            expect(aggressiveBot.aggressiveness).toBeGreaterThan(conservativeBot.aggressiveness);
            expect(aggressiveBot.aggressiveness).toBeLessThanOrEqual(1.0);
            expect(conservativeBot.aggressiveness).toBeGreaterThanOrEqual(0.0);
        });
    });

    describe('updateHand', () => {
        it('should update bot hand with new cards', () => {
            const cards = [
                { suit: 'Hearts', rank: 'A', value: 14 },
                { suit: 'Spades', rank: 'K', value: 13 }
            ];
            
            bot.updateHand(cards);
            expect(bot.hand).toEqual(cards);
        });
    });

    describe('setTeamAssignment', () => {
        it('should set team and seat position', () => {
            bot.setTeamAssignment('team-123', 2);
            expect(bot.teamId).toBe('team-123');
            expect(bot.seatPosition).toBe(2);
        });
    });

    describe('getState', () => {
        it('should return bot state object', () => {
            bot.setTeamAssignment('team-123', 2);
            bot.updateHand([{ suit: 'Hearts', rank: 'A' }]);
            
            const state = bot.getState();
            expect(state).toMatchObject({
                id: bot.id,
                name: bot.name,
                personality: bot.personality,
                isBot: true,
                teamId: 'team-123',
                seatPosition: 2,
                handSize: 1
            });
        });
    });

    describe('toDatabaseFormat', () => {
        it('should return database-compatible format', () => {
            const dbFormat = bot.toDatabaseFormat();
            expect(dbFormat).toMatchObject({
                user_id: bot.id,
                username: bot.name,
                is_bot: true,
                bot_personality: bot.personality,
                bot_difficulty: bot.difficulty
            });
        });
    });

    describe('toApiResponse', () => {
        it('should return API response format', () => {
            bot.setTeamAssignment('team-123', 2);
            const apiResponse = bot.toApiResponse();
            
            expect(apiResponse).toMatchObject({
                id: bot.id,
                username: bot.name,
                isBot: true,
                personality: bot.personality,
                teamId: 'team-123',
                seatPosition: 2
            });
        });
    });
});

describe('BotManager', () => {
    const testGameId = 'test-game-123';

    afterEach(() => {
        // Clean up after each test
        BotManager.clearGameBots(testGameId);
    });

    describe('createBotsForGame', () => {
        it('should create specified number of bots for a game', () => {
            const bots = BotManager.createBotsForGame(testGameId, 3);
            
            expect(bots).toHaveLength(3);
            expect(bots.every(bot => bot.isBot)).toBe(true);
            expect(bots.every(bot => bot.gameId === testGameId)).toBe(true);
        });

        it('should create bots with custom options', () => {
            const options = {
                difficulty: 'hard',
                personalities: ['aggressive', 'conservative', 'balanced'],
                names: ['Bot A', 'Bot B', 'Bot C']
            };
            
            const bots = BotManager.createBotsForGame(testGameId, 3, options);
            
            expect(bots[0].name).toBe('Bot A');
            expect(bots[0].personality).toBe('aggressive');
            expect(bots[0].difficulty).toBe('hard');
        });
    });

    describe('getBotPlayer', () => {
        it('should retrieve bot player by ID', () => {
            const bots = BotManager.createBotsForGame(testGameId, 2);
            const retrievedBot = BotManager.getBotPlayer(testGameId, bots[0].id);
            
            expect(retrievedBot).toBe(bots[0]);
        });

        it('should return null for non-existent bot', () => {
            const retrievedBot = BotManager.getBotPlayer(testGameId, 'non-existent-id');
            expect(retrievedBot).toBeNull();
        });
    });

    describe('getGameBots', () => {
        it('should return all bots for a game', () => {
            const bots = BotManager.createBotsForGame(testGameId, 3);
            const gameBots = BotManager.getGameBots(testGameId);
            
            expect(gameBots).toHaveLength(3);
            expect(gameBots).toEqual(expect.arrayContaining(bots));
        });

        it('should return empty array for game with no bots', () => {
            const gameBots = BotManager.getGameBots('non-existent-game');
            expect(gameBots).toEqual([]);
        });
    });

    describe('isBotPlayer', () => {
        it('should identify bot players correctly', () => {
            const bots = BotManager.createBotsForGame(testGameId, 2);
            
            expect(BotManager.isBotPlayer(testGameId, bots[0].id)).toBe(true);
            expect(BotManager.isBotPlayer(testGameId, 'human-player-id')).toBe(false);
        });
    });

    describe('assignBotsToTeams', () => {
        it('should assign bots to teams and seat positions', () => {
            const bots = BotManager.createBotsForGame(testGameId, 3);
            const assignments = [
                { teamId: 'team-1', seatPosition: 2 },
                { teamId: 'team-2', seatPosition: 3 },
                { teamId: 'team-1', seatPosition: 4 }
            ];
            
            const assignedBots = BotManager.assignBotsToTeams(testGameId, assignments);
            
            expect(assignedBots[0].teamId).toBe('team-1');
            expect(assignedBots[0].seatPosition).toBe(2);
            expect(assignedBots[1].teamId).toBe('team-2');
            expect(assignedBots[1].seatPosition).toBe(3);
        });
    });

    describe('updateBotHands', () => {
        it('should update bot hands with new cards', () => {
            const bots = BotManager.createBotsForGame(testGameId, 2);
            const handUpdates = {
                [bots[0].id]: [{ suit: 'Hearts', rank: 'A' }],
                [bots[1].id]: [{ suit: 'Spades', rank: 'K' }]
            };
            
            BotManager.updateBotHands(testGameId, handUpdates);
            
            expect(bots[0].hand).toEqual([{ suit: 'Hearts', rank: 'A' }]);
            expect(bots[1].hand).toEqual([{ suit: 'Spades', rank: 'K' }]);
        });
    });

    describe('clearGameBots', () => {
        it('should clear all bots for a game', () => {
            BotManager.createBotsForGame(testGameId, 3);
            expect(BotManager.getGameBots(testGameId)).toHaveLength(3);
            
            BotManager.clearGameBots(testGameId);
            expect(BotManager.getGameBots(testGameId)).toHaveLength(0);
        });
    });

    describe('getStatistics', () => {
        it('should return bot statistics', () => {
            BotManager.createBotsForGame(testGameId, 3);
            const stats = BotManager.getStatistics();
            
            expect(stats.totalGames).toBe(1);
            expect(stats.totalBots).toBe(3);
            expect(stats.averageBotsPerGame).toBe('3.00');
            expect(stats.personalityDistribution).toBeDefined();
            expect(stats.difficultyDistribution).toBeDefined();
        });
    });
});