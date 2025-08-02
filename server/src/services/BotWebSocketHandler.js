import BotManager from './BotManager.js';

/**
 * BotWebSocketHandler manages WebSocket communication for bot players
 * Handles bot actions, responses, and integration with the game flow
 */
class BotWebSocketHandler {
    constructor(socketManager) {
        this.socketManager = socketManager;
        this.io = socketManager.io;
        this.botActionQueue = new Map(); // gameId -> queue of pending bot actions
        this.botTimers = new Map(); // gameId -> Map(botId -> timer)
    }

    /**
     * Initialize bot WebSocket handling for a game
     * @param {string} gameId - Game ID
     * @param {Array} bots - Array of bot players
     */
    initializeBotHandling(gameId, bots) {
        try {
            console.log(`[BotWebSocket] Initializing bot handling for game ${gameId} with ${bots.length} bots`);
            
            // Initialize action queue for this game
            this.botActionQueue.set(gameId, []);
            this.botTimers.set(gameId, new Map());

            // Set up bot event simulation for each bot
            bots.forEach(bot => {
                this.setupBotEventHandlers(gameId, bot);
            });

            console.log(`[BotWebSocket] Bot handling initialized for game ${gameId}`);
        } catch (error) {
            console.error('[BotWebSocket] Error initializing bot handling:', error);
        }
    }

    /**
     * Set up event handlers for a specific bot
     * @param {string} gameId - Game ID
     * @param {BotPlayer} bot - Bot player instance
     */
    setupBotEventHandlers(gameId, bot) {
        try {
            // Create a virtual socket-like object for the bot
            const botSocket = this.createBotSocket(gameId, bot);
            
            // Store bot socket reference for later use
            if (!this.socketManager.botSockets) {
                this.socketManager.botSockets = new Map();
            }
            this.socketManager.botSockets.set(bot.id, botSocket);

            console.log(`[BotWebSocket] Event handlers set up for bot ${bot.name} (${bot.id})`);
        } catch (error) {
            console.error(`[BotWebSocket] Error setting up bot event handlers for ${bot.name}:`, error);
        }
    }

    /**
     * Create a virtual socket object for bot communication
     * @param {string} gameId - Game ID
     * @param {BotPlayer} bot - Bot player instance
     * @returns {Object} Virtual socket object
     */
    createBotSocket(gameId, bot) {
        return {
            id: `bot_socket_${bot.id}`,
            userId: bot.id,
            username: bot.name,
            isBot: true,
            gameId: gameId,
            
            // Simulate socket.emit for bot responses
            emit: (event, data) => {
                this.handleBotEmit(gameId, bot, event, data);
            },
            
            // Simulate socket.join for room management
            join: (room) => {
                console.log(`[BotWebSocket] Bot ${bot.name} joined room ${room}`);
            },
            
            // Simulate socket.leave for room management
            leave: (room) => {
                console.log(`[BotWebSocket] Bot ${bot.name} left room ${room}`);
            },
            
            // Bot-specific properties
            bot: bot
        };
    }

    /**
     * Handle bot emit events (responses from bot)
     * @param {string} gameId - Game ID
     * @param {BotPlayer} bot - Bot player instance
     * @param {string} event - Event name
     * @param {Object} data - Event data
     */
    handleBotEmit(gameId, bot, event, data) {
        try {
            console.log(`[BotWebSocket] Bot ${bot.name} emitted ${event}:`, data);
            
            // Forward bot events to human players in the game
            this.broadcastBotAction(gameId, bot, event, data);
        } catch (error) {
            console.error(`[BotWebSocket] Error handling bot emit for ${bot.name}:`, error);
        }
    }

    /**
     * Broadcast bot action to human players
     * @param {string} gameId - Game ID
     * @param {BotPlayer} bot - Bot player instance
     * @param {string} event - Event name
     * @param {Object} data - Event data
     */
    broadcastBotAction(gameId, bot, event, data) {
        try {
            const eventData = {
                ...data,
                playerId: bot.id,
                playerName: bot.name,
                isBot: true,
                timestamp: new Date().toISOString()
            };

            // Broadcast to all human players in the game
            this.io.to(gameId).emit(event, eventData);
            
            console.log(`[BotWebSocket] Broadcasted bot action ${event} from ${bot.name} to game ${gameId}`);
        } catch (error) {
            console.error(`[BotWebSocket] Error broadcasting bot action:`, error);
        }
    }

    /**
     * Simulate bot trump declaration
     * @param {string} gameId - Game ID
     * @param {string} botId - Bot ID
     * @param {Array} hand - Bot's initial hand
     * @returns {Promise<void>}
     */
    async simulateBotTrumpDeclaration(gameId, botId, hand) {
        try {
            const bot = BotManager.getBotPlayer(gameId, botId);
            if (!bot) {
                console.error(`[BotWebSocket] Bot ${botId} not found for trump declaration`);
                // Fallback to random trump
                const suits = ['Hearts', 'Diamonds', 'Clubs', 'Spades'];
                return suits[Math.floor(Math.random() * suits.length)];
            }

            console.log(`[BotWebSocket] Simulating trump declaration for bot ${bot.name}`);

            // Use bot AI to decide trump
            const trumpSuit = await bot.declareTrump(hand);
            
            // Create trump declaration event data
            const declarationData = {
                gameId: gameId,
                playerId: bot.id,
                playerName: bot.name,
                trumpSuit: trumpSuit,
                isBot: true,
                explanation: bot.getTrumpDeclarationExplanation(hand, trumpSuit)
            };

            // Broadcast trump declaration to all players
            this.broadcastBotAction(gameId, bot, 'trump-declared', declarationData);

            console.log(`[BotWebSocket] Bot ${bot.name} declared ${trumpSuit} as trump`);
            return trumpSuit;
        } catch (error) {
            console.error(`[BotWebSocket] Error in bot trump declaration:`, error);
            // Fallback to random trump
            const suits = ['Hearts', 'Diamonds', 'Clubs', 'Spades'];
            return suits[Math.floor(Math.random() * suits.length)];
        }
    }

    /**
     * Simulate bot card play
     * @param {string} gameId - Game ID
     * @param {string} botId - Bot ID
     * @param {Object} gameContext - Current game context
     * @returns {Promise<Object>} Played card
     */
    async simulateBotCardPlay(gameId, botId, gameContext) {
        try {
            const bot = BotManager.getBotPlayer(gameId, botId);
            if (!bot) {
                console.error(`[BotWebSocket] Bot ${botId} not found for card play`);
                return null;
            }

            console.log(`[BotWebSocket] Simulating card play for bot ${bot.name}`);

            // Use bot AI to decide which card to play
            const chosenCard = await bot.playCard(gameContext);
            
            // Create card play event data
            const cardPlayData = {
                gameId: gameId,
                playerId: bot.id,
                playerName: bot.name,
                card: chosenCard,
                isBot: true,
                explanation: bot.getCardPlayExplanation(chosenCard, gameContext)
            };

            // Broadcast card play to all players
            this.broadcastBotAction(gameId, bot, 'card-played', cardPlayData);

            console.log(`[BotWebSocket] Bot ${bot.name} played ${chosenCard.rank} of ${chosenCard.suit}`);
            return chosenCard;
        } catch (error) {
            console.error(`[BotWebSocket] Error in bot card play:`, error);
            return null;
        }
    }

    /**
     * Handle bot turn in the game flow
     * @param {string} gameId - Game ID
     * @param {string} botId - Bot ID
     * @param {string} actionType - Type of action ('trump_declaration' or 'card_play')
     * @param {Object} context - Action context
     * @returns {Promise<any>} Action result
     */
    async handleBotTurn(gameId, botId, actionType, context) {
        try {
            const bot = BotManager.getBotPlayer(gameId, botId);
            if (!bot) {
                console.error(`[BotWebSocket] Bot ${botId} not found for turn handling`);
                return null;
            }

            console.log(`[BotWebSocket] Handling bot turn for ${bot.name}: ${actionType}`);

            // Add bot turn to action queue
            this.queueBotAction(gameId, {
                botId: botId,
                actionType: actionType,
                context: context,
                timestamp: new Date().toISOString()
            });

            // Process the action based on type
            let result = null;
            switch (actionType) {
                case 'trump_declaration':
                    result = await this.simulateBotTrumpDeclaration(gameId, botId, context.hand);
                    break;
                
                case 'card_play':
                    result = await this.simulateBotCardPlay(gameId, botId, context);
                    break;
                
                default:
                    console.warn(`[BotWebSocket] Unknown bot action type: ${actionType}`);
                    break;
            }

            // Remove completed action from queue
            this.dequeueCompletedBotAction(gameId, botId, actionType);

            return result;
        } catch (error) {
            console.error(`[BotWebSocket] Error handling bot turn:`, error);
            return null;
        }
    }

    /**
     * Queue a bot action for processing
     * @param {string} gameId - Game ID
     * @param {Object} action - Action to queue
     */
    queueBotAction(gameId, action) {
        try {
            if (!this.botActionQueue.has(gameId)) {
                this.botActionQueue.set(gameId, []);
            }
            
            const queue = this.botActionQueue.get(gameId);
            queue.push(action);
            
            console.log(`[BotWebSocket] Queued bot action for game ${gameId}: ${action.actionType}`);
        } catch (error) {
            console.error('[BotWebSocket] Error queuing bot action:', error);
        }
    }

    /**
     * Remove completed bot action from queue
     * @param {string} gameId - Game ID
     * @param {string} botId - Bot ID
     * @param {string} actionType - Action type
     */
    dequeueCompletedBotAction(gameId, botId, actionType) {
        try {
            if (!this.botActionQueue.has(gameId)) {
                return;
            }
            
            const queue = this.botActionQueue.get(gameId);
            const actionIndex = queue.findIndex(action => 
                action.botId === botId && action.actionType === actionType
            );
            
            if (actionIndex !== -1) {
                queue.splice(actionIndex, 1);
                console.log(`[BotWebSocket] Dequeued completed bot action: ${actionType}`);
            }
        } catch (error) {
            console.error('[BotWebSocket] Error dequeuing bot action:', error);
        }
    }

    /**
     * Set up a timer for bot action timeout
     * @param {string} gameId - Game ID
     * @param {string} botId - Bot ID
     * @param {number} timeout - Timeout in milliseconds
     * @param {Function} callback - Callback to execute on timeout
     */
    setBotActionTimer(gameId, botId, timeout, callback) {
        try {
            // Clear existing timer if any
            this.clearBotActionTimer(gameId, botId);
            
            const timer = setTimeout(() => {
                console.log(`[BotWebSocket] Bot action timeout for ${botId} in game ${gameId}`);
                callback();
            }, timeout);
            
            if (!this.botTimers.has(gameId)) {
                this.botTimers.set(gameId, new Map());
            }
            
            this.botTimers.get(gameId).set(botId, timer);
        } catch (error) {
            console.error('[BotWebSocket] Error setting bot action timer:', error);
        }
    }

    /**
     * Clear bot action timer
     * @param {string} gameId - Game ID
     * @param {string} botId - Bot ID
     */
    clearBotActionTimer(gameId, botId) {
        try {
            if (this.botTimers.has(gameId)) {
                const gameTimers = this.botTimers.get(gameId);
                if (gameTimers.has(botId)) {
                    clearTimeout(gameTimers.get(botId));
                    gameTimers.delete(botId);
                }
            }
        } catch (error) {
            console.error('[BotWebSocket] Error clearing bot action timer:', error);
        }
    }

    /**
     * Clean up bot WebSocket handling for a game
     * @param {string} gameId - Game ID
     */
    cleanupBotHandling(gameId) {
        try {
            console.log(`[BotWebSocket] Cleaning up bot handling for game ${gameId}`);
            
            // Clear all bot timers for this game
            if (this.botTimers.has(gameId)) {
                const gameTimers = this.botTimers.get(gameId);
                gameTimers.forEach((timer, botId) => {
                    clearTimeout(timer);
                });
                this.botTimers.delete(gameId);
            }
            
            // Clear bot action queue
            this.botActionQueue.delete(gameId);
            
            // Clean up bot sockets
            if (this.socketManager.botSockets) {
                const botsToRemove = [];
                this.socketManager.botSockets.forEach((socket, botId) => {
                    if (socket.gameId === gameId) {
                        botsToRemove.push(botId);
                    }
                });
                
                botsToRemove.forEach(botId => {
                    this.socketManager.botSockets.delete(botId);
                });
            }
            
            console.log(`[BotWebSocket] Bot handling cleanup completed for game ${gameId}`);
        } catch (error) {
            console.error('[BotWebSocket] Error cleaning up bot handling:', error);
        }
    }

    /**
     * Get bot action queue status for debugging
     * @param {string} gameId - Game ID
     * @returns {Object} Queue status
     */
    getBotActionQueueStatus(gameId) {
        try {
            const queue = this.botActionQueue.get(gameId) || [];
            const timers = this.botTimers.get(gameId) || new Map();
            
            return {
                gameId: gameId,
                queueLength: queue.length,
                pendingActions: queue.map(action => ({
                    botId: action.botId,
                    actionType: action.actionType,
                    timestamp: action.timestamp
                })),
                activeTimers: Array.from(timers.keys()),
                totalActiveTimers: timers.size
            };
        } catch (error) {
            console.error('[BotWebSocket] Error getting bot action queue status:', error);
            return { error: error.message };
        }
    }
}

export default BotWebSocketHandler;