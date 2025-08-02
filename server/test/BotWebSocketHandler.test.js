import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import BotWebSocketHandler from '../src/services/BotWebSocketHandler.js';
import BotManager from '../src/services/BotManager.js';
import BotPlayer from '../src/services/BotPlayer.js';

describe('BotWebSocketHandler', () => {
    let botWebSocketHandler;
    let mockSocketManager;
    let mockIo;
    let testGameId;
    let testBots;

    beforeEach(() => {
        testGameId = 'test-game-123';
        
        // Create mock socket manager and io
        mockIo = {
            to: vi.fn().mockReturnThis(),
            emit: vi.fn()
        };
        
        mockSocketManager = {
            io: mockIo,
            botSockets: new Map()
        };

        botWebSocketHandler = new BotWebSocketHandler(mockSocketManager);

        // Create test bots
        testBots = BotManager.createBotsForGame(testGameId, 3);
    });

    afterEach(() => {
        // Clean up
        BotManager.clearGameBots(testGameId);
        botWebSocketHandler.cleanupBotHandling(testGameId);
    });

    describe('initializeBotHandling', () => {
        it('should initialize bot handling for a game', () => {
            botWebSocketHandler.initializeBotHandling(testGameId, testBots);

            expect(botWebSocketHandler.botActionQueue.has(testGameId)).toBe(true);
            expect(botWebSocketHandler.botTimers.has(testGameId)).toBe(true);
            expect(mockSocketManager.botSockets.size).toBe(3);
        });

        it('should handle empty bot array', () => {
            botWebSocketHandler.initializeBotHandling(testGameId, []);

            expect(botWebSocketHandler.botActionQueue.has(testGameId)).toBe(true);
            expect(botWebSocketHandler.botTimers.has(testGameId)).toBe(true);
        });
    });

    describe('createBotSocket', () => {
        it('should create a virtual socket for bot', () => {
            const bot = testBots[0];
            const botSocket = botWebSocketHandler.createBotSocket(testGameId, bot);

            expect(botSocket.id).toBe(`bot_socket_${bot.id}`);
            expect(botSocket.userId).toBe(bot.id);
            expect(botSocket.username).toBe(bot.name);
            expect(botSocket.isBot).toBe(true);
            expect(botSocket.gameId).toBe(testGameId);
            expect(typeof botSocket.emit).toBe('function');
            expect(typeof botSocket.join).toBe('function');
            expect(typeof botSocket.leave).toBe('function');
        });
    });

    describe('handleBotEmit', () => {
        it('should handle bot emit events', () => {
            const bot = testBots[0];
            const eventData = { test: 'data' };
            
            const broadcastSpy = vi.spyOn(botWebSocketHandler, 'broadcastBotAction');
            
            botWebSocketHandler.handleBotEmit(testGameId, bot, 'test-event', eventData);
            
            expect(broadcastSpy).toHaveBeenCalledWith(testGameId, bot, 'test-event', eventData);
        });
    });

    describe('broadcastBotAction', () => {
        it('should broadcast bot action to game room', () => {
            const bot = testBots[0];
            const eventData = { test: 'data' };
            
            botWebSocketHandler.broadcastBotAction(testGameId, bot, 'test-event', eventData);
            
            expect(mockIo.to).toHaveBeenCalledWith(testGameId);
            expect(mockIo.emit).toHaveBeenCalledWith('test-event', expect.objectContaining({
                test: 'data',
                playerId: bot.id,
                playerName: bot.name,
                isBot: true,
                timestamp: expect.any(String)
            }));
        });
    });

    describe('simulateBotTrumpDeclaration', () => {
        it('should simulate bot trump declaration', async () => {
            botWebSocketHandler.initializeBotHandling(testGameId, testBots);
            
            const bot = testBots[0];
            const hand = [
                { suit: 'Hearts', rank: 'A', value: 14 },
                { suit: 'Spades', rank: 'K', value: 13 },
                { suit: 'Diamonds', rank: 'Q', value: 12 },
                { suit: 'Clubs', rank: 'J', value: 11 }
            ];

            // Mock bot AI delay
            vi.spyOn(bot.ai, 'simulateDecisionDelay').mockResolvedValue();

            const trumpSuit = await botWebSocketHandler.simulateBotTrumpDeclaration(testGameId, bot.id, hand);
            
            expect(['Hearts', 'Diamonds', 'Clubs', 'Spades']).toContain(trumpSuit);
            expect(mockIo.to).toHaveBeenCalledWith(testGameId);
            expect(mockIo.emit).toHaveBeenCalledWith('trump-declared', expect.objectContaining({
                gameId: testGameId,
                playerId: bot.id,
                playerName: bot.name,
                trumpSuit: trumpSuit,
                isBot: true
            }));
        });

        it('should handle bot not found', async () => {
            const trumpSuit = await botWebSocketHandler.simulateBotTrumpDeclaration(testGameId, 'non-existent-bot', []);
            
            expect(['Hearts', 'Diamonds', 'Clubs', 'Spades']).toContain(trumpSuit);
        });
    });

    describe('simulateBotCardPlay', () => {
        it('should simulate bot card play', async () => {
            botWebSocketHandler.initializeBotHandling(testGameId, testBots);
            
            const bot = testBots[0];
            const gameContext = {
                hand: [
                    { suit: 'Hearts', rank: 'A', value: 14 },
                    { suit: 'Spades', rank: 'K', value: 13 }
                ],
                trickState: {
                    cardsPlayed: [],
                    trumpSuit: 'Hearts'
                },
                gameState: {}
            };

            // Mock bot AI delay
            vi.spyOn(bot.ai, 'simulateDecisionDelay').mockResolvedValue();

            const chosenCard = await botWebSocketHandler.simulateBotCardPlay(testGameId, bot.id, gameContext);
            
            expect(gameContext.hand).toContainEqual(chosenCard);
            expect(mockIo.to).toHaveBeenCalledWith(testGameId);
            expect(mockIo.emit).toHaveBeenCalledWith('card-played', expect.objectContaining({
                gameId: testGameId,
                playerId: bot.id,
                playerName: bot.name,
                card: chosenCard,
                isBot: true
            }));
        });

        it('should handle bot not found', async () => {
            const result = await botWebSocketHandler.simulateBotCardPlay(testGameId, 'non-existent-bot', {});
            
            expect(result).toBeNull();
        });
    });

    describe('handleBotTurn', () => {
        beforeEach(() => {
            botWebSocketHandler.initializeBotHandling(testGameId, testBots);
        });

        it('should handle trump declaration turn', async () => {
            const bot = testBots[0];
            const context = {
                hand: [
                    { suit: 'Hearts', rank: 'A', value: 14 },
                    { suit: 'Spades', rank: 'K', value: 13 }
                ]
            };

            // Mock bot AI delay
            vi.spyOn(bot.ai, 'simulateDecisionDelay').mockResolvedValue();

            const result = await botWebSocketHandler.handleBotTurn(testGameId, bot.id, 'trump_declaration', context);
            
            expect(['Hearts', 'Diamonds', 'Clubs', 'Spades']).toContain(result);
        });

        it('should handle card play turn', async () => {
            const bot = testBots[0];
            const context = {
                hand: [
                    { suit: 'Hearts', rank: 'A', value: 14 },
                    { suit: 'Spades', rank: 'K', value: 13 }
                ],
                trickState: {
                    cardsPlayed: [],
                    trumpSuit: 'Hearts'
                },
                gameState: {}
            };

            // Mock bot AI delay
            vi.spyOn(bot.ai, 'simulateDecisionDelay').mockResolvedValue();

            const result = await botWebSocketHandler.handleBotTurn(testGameId, bot.id, 'card_play', context);
            
            expect(context.hand).toContainEqual(result);
        });

        it('should handle unknown action type', async () => {
            const bot = testBots[0];
            
            const result = await botWebSocketHandler.handleBotTurn(testGameId, bot.id, 'unknown_action', {});
            
            expect(result).toBeNull();
        });

        it('should handle bot not found', async () => {
            const result = await botWebSocketHandler.handleBotTurn(testGameId, 'non-existent-bot', 'trump_declaration', {});
            
            expect(result).toBeNull();
        });
    });

    describe('queueBotAction', () => {
        it('should queue bot action', () => {
            const action = {
                botId: 'bot-123',
                actionType: 'trump_declaration',
                context: {},
                timestamp: new Date().toISOString()
            };

            botWebSocketHandler.queueBotAction(testGameId, action);
            
            const queue = botWebSocketHandler.botActionQueue.get(testGameId);
            expect(queue).toContain(action);
        });

        it('should create queue if not exists', () => {
            const action = {
                botId: 'bot-123',
                actionType: 'trump_declaration',
                context: {},
                timestamp: new Date().toISOString()
            };

            botWebSocketHandler.queueBotAction('new-game-id', action);
            
            expect(botWebSocketHandler.botActionQueue.has('new-game-id')).toBe(true);
        });
    });

    describe('setBotActionTimer', () => {
        it('should set bot action timer', () => {
            const callback = vi.fn();
            
            botWebSocketHandler.setBotActionTimer(testGameId, 'bot-123', 100, callback);
            
            expect(botWebSocketHandler.botTimers.has(testGameId)).toBe(true);
            expect(botWebSocketHandler.botTimers.get(testGameId).has('bot-123')).toBe(true);
        });

        it('should clear existing timer before setting new one', () => {
            const callback1 = vi.fn();
            const callback2 = vi.fn();
            
            botWebSocketHandler.setBotActionTimer(testGameId, 'bot-123', 100, callback1);
            botWebSocketHandler.setBotActionTimer(testGameId, 'bot-123', 200, callback2);
            
            const gameTimers = botWebSocketHandler.botTimers.get(testGameId);
            expect(gameTimers.size).toBe(1);
        });
    });

    describe('cleanupBotHandling', () => {
        it('should clean up all bot handling data', () => {
            botWebSocketHandler.initializeBotHandling(testGameId, testBots);
            botWebSocketHandler.setBotActionTimer(testGameId, 'bot-123', 1000, () => {});
            
            botWebSocketHandler.cleanupBotHandling(testGameId);
            
            expect(botWebSocketHandler.botActionQueue.has(testGameId)).toBe(false);
            expect(botWebSocketHandler.botTimers.has(testGameId)).toBe(false);
        });
    });

    describe('getBotActionQueueStatus', () => {
        it('should return queue status', () => {
            botWebSocketHandler.initializeBotHandling(testGameId, testBots);
            
            const action = {
                botId: 'bot-123',
                actionType: 'trump_declaration',
                context: {},
                timestamp: new Date().toISOString()
            };
            botWebSocketHandler.queueBotAction(testGameId, action);
            botWebSocketHandler.setBotActionTimer(testGameId, 'bot-123', 1000, () => {});
            
            const status = botWebSocketHandler.getBotActionQueueStatus(testGameId);
            
            expect(status).toMatchObject({
                gameId: testGameId,
                queueLength: 1,
                totalActiveTimers: 1
            });
            expect(status.pendingActions).toHaveLength(1);
            expect(status.activeTimers).toContain('bot-123');
        });

        it('should handle non-existent game', () => {
            const status = botWebSocketHandler.getBotActionQueueStatus('non-existent-game');
            
            expect(status).toMatchObject({
                gameId: 'non-existent-game',
                queueLength: 0,
                totalActiveTimers: 0
            });
        });
    });
});