import rxdbConnection from '../../database/rxdb-connection.js';

/**
 * Reactive Query Manager Service
 * Manages RxDB reactive subscriptions for real-time updates
 */
class ReactiveQueryManager {
    constructor() {
        this.subscriptions = new Map();
        this.socketManager = null;
    }

    /**
     * Initialize the reactive query manager
     * @param {Object} socketManager - Socket.IO manager instance
     */
    initialize(socketManager) {
        this.socketManager = socketManager;
        console.log('[ReactiveQueryManager] Initialized with Socket.IO integration');
    }

    /**
     * Subscribe to room updates and emit to connected sockets
     * @param {string} roomId - Room ID to subscribe to
     * @param {string} socketId - Socket ID for the subscription
     * @returns {string} Subscription ID
     */
    subscribeToRoomUpdates(roomId, socketId) {
        const subscriptionId = `room_${roomId}_${socketId}`;
        
        try {
            if (!rxdbConnection.isReady()) {
                console.warn('[ReactiveQueryManager] RxDB not ready, skipping subscription');
                return subscriptionId;
            }

            const roomsCollection = rxdbConnection.getCollection('rooms');
            
            const subscription = roomsCollection
                .findOne({ selector: { room_id: roomId } })
                .$.subscribe(roomDoc => {
                    if (roomDoc && this.socketManager) {
                        // Emit room update to specific socket
                        const socket = this.socketManager.io.sockets.sockets.get(socketId);
                        if (socket) {
                            socket.emit('roomUpdate', {
                                roomId: roomId,
                                data: roomDoc.toJSON()
                            });
                        }
                    }
                });

            this.subscriptions.set(subscriptionId, subscription);
            console.log(`[ReactiveQueryManager] Subscribed to room updates: ${subscriptionId}`);
            
        } catch (error) {
            console.error('[ReactiveQueryManager] Error subscribing to room updates:', error);
        }

        return subscriptionId;
    }

    /**
     * Subscribe to room player updates
     * @param {string} roomId - Room ID to subscribe to
     * @param {string} socketId - Socket ID for the subscription
     * @returns {string} Subscription ID
     */
    subscribeToRoomPlayerUpdates(roomId, socketId) {
        const subscriptionId = `room_players_${roomId}_${socketId}`;
        
        try {
            if (!rxdbConnection.isReady()) {
                console.warn('[ReactiveQueryManager] RxDB not ready, skipping subscription');
                return subscriptionId;
            }

            const roomPlayersCollection = rxdbConnection.getCollection('roomPlayers');
            
            const subscription = roomPlayersCollection
                .find({ selector: { room_id: roomId } })
                .$.subscribe(playerDocs => {
                    if (playerDocs && this.socketManager) {
                        // Emit player updates to specific socket
                        const socket = this.socketManager.io.sockets.sockets.get(socketId);
                        if (socket) {
                            socket.emit('roomPlayersUpdate', {
                                roomId: roomId,
                                players: playerDocs.map(doc => doc.toJSON())
                            });
                        }
                    }
                });

            this.subscriptions.set(subscriptionId, subscription);
            console.log(`[ReactiveQueryManager] Subscribed to room player updates: ${subscriptionId}`);
            
        } catch (error) {
            console.error('[ReactiveQueryManager] Error subscribing to room player updates:', error);
        }

        return subscriptionId;
    }

    /**
     * Subscribe to game updates
     * @param {string} gameId - Game ID to subscribe to
     * @param {string} socketId - Socket ID for the subscription
     * @returns {string} Subscription ID
     */
    subscribeToGameUpdates(gameId, socketId) {
        const subscriptionId = `game_${gameId}_${socketId}`;
        
        try {
            if (!rxdbConnection.isReady()) {
                console.warn('[ReactiveQueryManager] RxDB not ready, skipping subscription');
                return subscriptionId;
            }

            const gamesCollection = rxdbConnection.getCollection('games');
            
            const subscription = gamesCollection
                .findOne({ selector: { game_id: gameId } })
                .$.subscribe(gameDoc => {
                    if (gameDoc && this.socketManager) {
                        // Emit game update to specific socket
                        const socket = this.socketManager.io.sockets.sockets.get(socketId);
                        if (socket) {
                            socket.emit('gameUpdate', {
                                gameId: gameId,
                                data: gameDoc.toJSON()
                            });
                        }
                    }
                });

            this.subscriptions.set(subscriptionId, subscription);
            console.log(`[ReactiveQueryManager] Subscribed to game updates: ${subscriptionId}`);
            
        } catch (error) {
            console.error('[ReactiveQueryManager] Error subscribing to game updates:', error);
        }

        return subscriptionId;
    }

    /**
     * Unsubscribe from a specific subscription
     * @param {string} subscriptionId - Subscription ID to unsubscribe
     */
    unsubscribe(subscriptionId) {
        const subscription = this.subscriptions.get(subscriptionId);
        if (subscription) {
            subscription.unsubscribe();
            this.subscriptions.delete(subscriptionId);
            console.log(`[ReactiveQueryManager] Unsubscribed: ${subscriptionId}`);
        }
    }

    /**
     * Unsubscribe all subscriptions for a specific socket
     * @param {string} socketId - Socket ID to clean up
     */
    unsubscribeSocket(socketId) {
        const toRemove = [];
        
        for (const [subscriptionId, subscription] of this.subscriptions) {
            if (subscriptionId.includes(socketId)) {
                subscription.unsubscribe();
                toRemove.push(subscriptionId);
            }
        }
        
        toRemove.forEach(id => this.subscriptions.delete(id));
        console.log(`[ReactiveQueryManager] Cleaned up ${toRemove.length} subscriptions for socket ${socketId}`);
    }

    /**
     * Get subscription count
     * @returns {number} Number of active subscriptions
     */
    getSubscriptionCount() {
        return this.subscriptions.size;
    }

    /**
     * Clean up all subscriptions
     */
    cleanup() {
        for (const [subscriptionId, subscription] of this.subscriptions) {
            subscription.unsubscribe();
        }
        this.subscriptions.clear();
        console.log('[ReactiveQueryManager] All subscriptions cleaned up');
    }
}

// Export singleton instance
export default new ReactiveQueryManager();