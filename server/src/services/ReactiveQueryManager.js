import rxdbConnection from '../../database/rxdb-connection.js';

/**
 * Reactive Query Manager Service
 * Manages RxDB reactive subscriptions and integrates with Socket.IO infrastructure
 * Handles subscription lifecycle, cleanup, and real-time updates
 */
class ReactiveQueryManager {
  constructor(socketManager) {
    this.socketManager = socketManager;
    this.subscriptions = new Map(); // subscriptionId -> subscription object
    this.socketSubscriptions = new Map(); // socketId -> Set of subscriptionIds
    this.roomSubscriptions = new Map(); // roomId -> Set of subscriptionIds
    this.gameSubscriptions = new Map(); // gameId -> Set of subscriptionIds
    
    console.log('[ReactiveQueryManager] Initialized with Socket.IO integration');
  }

  /**
   * Subscribe to room document changes and emit updates via Socket.IO
   * @param {string} roomId - Room ID to subscribe to
   * @param {string} socketId - Socket ID of the subscriber
   * @param {Object} options - Subscription options
   * @returns {string} Subscription ID
   */
  subscribeToRoom(roomId, socketId, options = {}) {
    try {
      const subscriptionId = `room_${roomId}_${socketId}_${Date.now()}`;
      
      // Get rooms collection
      const roomsCollection = rxdbConnection.getCollection('rooms');
      
      // Create reactive subscription for the specific room
      const subscription = roomsCollection
        .findOne(roomId)
        .$.subscribe({
          next: (roomDoc) => {
            if (roomDoc) {
              const roomData = roomDoc.toJSON();
              this._emitRoomUpdate(roomId, roomData, socketId, options);
            } else {
              // Room was deleted
              this._emitRoomDeleted(roomId, socketId);
            }
          },
          error: (error) => {
            console.error(`[ReactiveQueryManager] Room subscription error for ${roomId}:`, error.message);
            this._emitSubscriptionError(socketId, subscriptionId, error);
          }
        });

      // Store subscription
      this._storeSubscription(subscriptionId, subscription, socketId, roomId, 'room');
      
      console.log(`[ReactiveQueryManager] Created room subscription ${subscriptionId} for socket ${socketId}`);
      return subscriptionId;
    } catch (error) {
      console.error(`[ReactiveQueryManager] Error creating room subscription:`, error.message);
      throw error;
    }
  }

  /**
   * Subscribe to game document changes and emit updates via Socket.IO
   * @param {string} gameId - Game ID to subscribe to
   * @param {string} socketId - Socket ID of the subscriber
   * @param {Object} options - Subscription options
   * @returns {string} Subscription ID
   */
  subscribeToGame(gameId, socketId, options = {}) {
    try {
      const subscriptionId = `game_${gameId}_${socketId}_${Date.now()}`;
      
      // Get games collection
      const gamesCollection = rxdbConnection.getCollection('games');
      
      // Create reactive subscription for the specific game
      const subscription = gamesCollection
        .findOne(gameId)
        .$.subscribe({
          next: (gameDoc) => {
            if (gameDoc) {
              const gameData = gameDoc.toJSON();
              this._emitGameUpdate(gameId, gameData, socketId, options);
            } else {
              // Game was deleted
              this._emitGameDeleted(gameId, socketId);
            }
          },
          error: (error) => {
            console.error(`[ReactiveQueryManager] Game subscription error for ${gameId}:`, error.message);
            this._emitSubscriptionError(socketId, subscriptionId, error);
          }
        });

      // Store subscription
      this._storeSubscription(subscriptionId, subscription, socketId, gameId, 'game');
      
      console.log(`[ReactiveQueryManager] Created game subscription ${subscriptionId} for socket ${socketId}`);
      return subscriptionId;
    } catch (error) {
      console.error(`[ReactiveQueryManager] Error creating game subscription:`, error.message);
      throw error;
    }
  }

  /**
   * Subscribe to room players changes for a specific room
   * @param {string} roomId - Room ID to subscribe to
   * @param {string} socketId - Socket ID of the subscriber
   * @param {Object} options - Subscription options
   * @returns {string} Subscription ID
   */
  subscribeToRoomPlayers(roomId, socketId, options = {}) {
    try {
      const subscriptionId = `room_players_${roomId}_${socketId}_${Date.now()}`;
      
      // Get roomPlayers collection
      const roomPlayersCollection = rxdbConnection.getCollection('roomPlayers');
      
      // Create reactive subscription for room players
      const subscription = roomPlayersCollection
        .find({ room_id: roomId })
        .$.subscribe({
          next: (playerDocs) => {
            const playersData = playerDocs.map(doc => doc.toJSON());
            this._emitRoomPlayersUpdate(roomId, playersData, socketId, options);
          },
          error: (error) => {
            console.error(`[ReactiveQueryManager] Room players subscription error for ${roomId}:`, error.message);
            this._emitSubscriptionError(socketId, subscriptionId, error);
          }
        });

      // Store subscription
      this._storeSubscription(subscriptionId, subscription, socketId, roomId, 'room_players');
      
      console.log(`[ReactiveQueryManager] Created room players subscription ${subscriptionId} for socket ${socketId}`);
      return subscriptionId;
    } catch (error) {
      console.error(`[ReactiveQueryManager] Error creating room players subscription:`, error.message);
      throw error;
    }
  }

  /**
   * Subscribe to game players changes for a specific game
   * @param {string} gameId - Game ID to subscribe to
   * @param {string} socketId - Socket ID of the subscriber
   * @param {Object} options - Subscription options
   * @returns {string} Subscription ID
   */
  subscribeToGamePlayers(gameId, socketId, options = {}) {
    try {
      const subscriptionId = `game_players_${gameId}_${socketId}_${Date.now()}`;
      
      // Get gamePlayers collection
      const gamePlayersCollection = rxdbConnection.getCollection('gamePlayers');
      
      // Create reactive subscription for game players
      const subscription = gamePlayersCollection
        .find({ game_id: gameId })
        .$.subscribe({
          next: (playerDocs) => {
            const playersData = playerDocs.map(doc => doc.toJSON());
            this._emitGamePlayersUpdate(gameId, playersData, socketId, options);
          },
          error: (error) => {
            console.error(`[ReactiveQueryManager] Game players subscription error for ${gameId}:`, error.message);
            this._emitSubscriptionError(socketId, subscriptionId, error);
          }
        });

      // Store subscription
      this._storeSubscription(subscriptionId, subscription, socketId, gameId, 'game_players');
      
      console.log(`[ReactiveQueryManager] Created game players subscription ${subscriptionId} for socket ${socketId}`);
      return subscriptionId;
    } catch (error) {
      console.error(`[ReactiveQueryManager] Error creating game players subscription:`, error.message);
      throw error;
    }
  }

  /**
   * Subscribe to user document changes
   * @param {string} userId - User ID to subscribe to
   * @param {string} socketId - Socket ID of the subscriber
   * @param {Object} options - Subscription options
   * @returns {string} Subscription ID
   */
  subscribeToUser(userId, socketId, options = {}) {
    try {
      const subscriptionId = `user_${userId}_${socketId}_${Date.now()}`;
      
      // Get users collection
      const usersCollection = rxdbConnection.getCollection('users');
      
      // Create reactive subscription for the specific user
      const subscription = usersCollection
        .findOne(userId)
        .$.subscribe({
          next: (userDoc) => {
            if (userDoc) {
              const userData = userDoc.toJSON();
              // Filter sensitive data before emitting
              const filteredUserData = this._filterUserData(userData);
              this._emitUserUpdate(userId, filteredUserData, socketId, options);
            }
          },
          error: (error) => {
            console.error(`[ReactiveQueryManager] User subscription error for ${userId}:`, error.message);
            this._emitSubscriptionError(socketId, subscriptionId, error);
          }
        });

      // Store subscription
      this._storeSubscription(subscriptionId, subscription, socketId, userId, 'user');
      
      console.log(`[ReactiveQueryManager] Created user subscription ${subscriptionId} for socket ${socketId}`);
      return subscriptionId;
    } catch (error) {
      console.error(`[ReactiveQueryManager] Error creating user subscription:`, error.message);
      throw error;
    }
  }

  /**
   * Unsubscribe from a specific subscription
   * @param {string} subscriptionId - Subscription ID to unsubscribe
   * @returns {boolean} True if unsubscribed successfully
   */
  unsubscribe(subscriptionId) {
    try {
      const subscriptionData = this.subscriptions.get(subscriptionId);
      if (!subscriptionData) {
        return false;
      }

      // Unsubscribe from RxDB
      subscriptionData.subscription.unsubscribe();
      
      // Clean up tracking maps
      this._cleanupSubscription(subscriptionId, subscriptionData);
      
      console.log(`[ReactiveQueryManager] Unsubscribed ${subscriptionId}`);
      return true;
    } catch (error) {
      console.error(`[ReactiveQueryManager] Error unsubscribing ${subscriptionId}:`, error.message);
      return false;
    }
  }

  /**
   * Unsubscribe all subscriptions for a socket
   * @param {string} socketId - Socket ID
   * @returns {number} Number of subscriptions unsubscribed
   */
  unsubscribeSocket(socketId) {
    try {
      const socketSubs = this.socketSubscriptions.get(socketId);
      if (!socketSubs) {
        return 0;
      }

      let unsubscribedCount = 0;
      for (const subscriptionId of socketSubs) {
        if (this.unsubscribe(subscriptionId)) {
          unsubscribedCount++;
        }
      }

      console.log(`[ReactiveQueryManager] Unsubscribed ${unsubscribedCount} subscriptions for socket ${socketId}`);
      return unsubscribedCount;
    } catch (error) {
      console.error(`[ReactiveQueryManager] Error unsubscribing socket ${socketId}:`, error.message);
      return 0;
    }
  }

  /**
   * Get subscription statistics
   * @returns {Object} Subscription statistics
   */
  getStats() {
    return {
      totalSubscriptions: this.subscriptions.size,
      activeSocketConnections: this.socketSubscriptions.size,
      roomSubscriptions: this.roomSubscriptions.size,
      gameSubscriptions: this.gameSubscriptions.size,
      subscriptionsByType: this._getSubscriptionsByType()
    };
  }

  /**
   * Store subscription and update tracking maps
   * @private
   */
  _storeSubscription(subscriptionId, subscription, socketId, resourceId, type) {
    const subscriptionData = {
      subscription,
      socketId,
      resourceId,
      type,
      createdAt: new Date().toISOString()
    };

    this.subscriptions.set(subscriptionId, subscriptionData);

    // Track by socket
    if (!this.socketSubscriptions.has(socketId)) {
      this.socketSubscriptions.set(socketId, new Set());
    }
    this.socketSubscriptions.get(socketId).add(subscriptionId);

    // Track by resource type
    if (type === 'room' || type === 'room_players') {
      if (!this.roomSubscriptions.has(resourceId)) {
        this.roomSubscriptions.set(resourceId, new Set());
      }
      this.roomSubscriptions.get(resourceId).add(subscriptionId);
    } else if (type === 'game' || type === 'game_players') {
      if (!this.gameSubscriptions.has(resourceId)) {
        this.gameSubscriptions.set(resourceId, new Set());
      }
      this.gameSubscriptions.get(resourceId).add(subscriptionId);
    }
  }

  /**
   * Clean up subscription from tracking maps
   * @private
   */
  _cleanupSubscription(subscriptionId, subscriptionData) {
    const { socketId, resourceId, type } = subscriptionData;

    // Remove from main subscriptions map
    this.subscriptions.delete(subscriptionId);

    // Clean up socket tracking
    const socketSubs = this.socketSubscriptions.get(socketId);
    if (socketSubs) {
      socketSubs.delete(subscriptionId);
      if (socketSubs.size === 0) {
        this.socketSubscriptions.delete(socketId);
      }
    }

    // Clean up resource tracking
    if (type === 'room' || type === 'room_players') {
      const roomSubs = this.roomSubscriptions.get(resourceId);
      if (roomSubs) {
        roomSubs.delete(subscriptionId);
        if (roomSubs.size === 0) {
          this.roomSubscriptions.delete(resourceId);
        }
      }
    } else if (type === 'game' || type === 'game_players') {
      const gameSubs = this.gameSubscriptions.get(resourceId);
      if (gameSubs) {
        gameSubs.delete(subscriptionId);
        if (gameSubs.size === 0) {
          this.gameSubscriptions.delete(resourceId);
        }
      }
    }
  }

  /**
   * Emit room update via Socket.IO
   * @private
   */
  _emitRoomUpdate(roomId, roomData, socketId, options) {
    try {
      const socket = this.socketManager.io.sockets.sockets.get(socketId);
      if (socket) {
        socket.emit('room:update', {
          roomId,
          data: roomData,
          timestamp: new Date().toISOString(),
          source: 'reactive_subscription'
        });
      }

      // Also emit to room if broadcast is enabled
      if (options.broadcast !== false) {
        this.socketManager.io.to(roomId).emit('room:state_changed', {
          roomId,
          data: roomData,
          timestamp: new Date().toISOString(),
          source: 'reactive_subscription'
        });
      }
    } catch (error) {
      console.error(`[ReactiveQueryManager] Error emitting room update:`, error.message);
    }
  }

  /**
   * Emit game update via Socket.IO
   * @private
   */
  _emitGameUpdate(gameId, gameData, socketId, options) {
    try {
      const socket = this.socketManager.io.sockets.sockets.get(socketId);
      if (socket) {
        socket.emit('game:update', {
          gameId,
          data: gameData,
          timestamp: new Date().toISOString(),
          source: 'reactive_subscription'
        });
      }

      // Also emit to game room if broadcast is enabled
      if (options.broadcast !== false) {
        this.socketManager.io.to(gameId).emit('game:state_changed', {
          gameId,
          data: gameData,
          timestamp: new Date().toISOString(),
          source: 'reactive_subscription'
        });
      }
    } catch (error) {
      console.error(`[ReactiveQueryManager] Error emitting game update:`, error.message);
    }
  }

  /**
   * Emit room players update via Socket.IO
   * @private
   */
  _emitRoomPlayersUpdate(roomId, playersData, socketId, options) {
    try {
      const socket = this.socketManager.io.sockets.sockets.get(socketId);
      if (socket) {
        socket.emit('room:players_update', {
          roomId,
          players: playersData,
          timestamp: new Date().toISOString(),
          source: 'reactive_subscription'
        });
      }

      // Also emit to room if broadcast is enabled
      if (options.broadcast !== false) {
        this.socketManager.io.to(roomId).emit('room:players_changed', {
          roomId,
          players: playersData,
          timestamp: new Date().toISOString(),
          source: 'reactive_subscription'
        });
      }
    } catch (error) {
      console.error(`[ReactiveQueryManager] Error emitting room players update:`, error.message);
    }
  }

  /**
   * Emit game players update via Socket.IO
   * @private
   */
  _emitGamePlayersUpdate(gameId, playersData, socketId, options) {
    try {
      const socket = this.socketManager.io.sockets.sockets.get(socketId);
      if (socket) {
        socket.emit('game:players_update', {
          gameId,
          players: playersData,
          timestamp: new Date().toISOString(),
          source: 'reactive_subscription'
        });
      }

      // Also emit to game room if broadcast is enabled
      if (options.broadcast !== false) {
        this.socketManager.io.to(gameId).emit('game:players_changed', {
          gameId,
          players: playersData,
          timestamp: new Date().toISOString(),
          source: 'reactive_subscription'
        });
      }
    } catch (error) {
      console.error(`[ReactiveQueryManager] Error emitting game players update:`, error.message);
    }
  }

  /**
   * Emit user update via Socket.IO
   * @private
   */
  _emitUserUpdate(userId, userData, socketId, options) {
    try {
      const socket = this.socketManager.io.sockets.sockets.get(socketId);
      if (socket) {
        socket.emit('user:update', {
          userId,
          data: userData,
          timestamp: new Date().toISOString(),
          source: 'reactive_subscription'
        });
      }
    } catch (error) {
      console.error(`[ReactiveQueryManager] Error emitting user update:`, error.message);
    }
  }

  /**
   * Emit room deleted event
   * @private
   */
  _emitRoomDeleted(roomId, socketId) {
    try {
      const socket = this.socketManager.io.sockets.sockets.get(socketId);
      if (socket) {
        socket.emit('room:deleted', {
          roomId,
          timestamp: new Date().toISOString(),
          source: 'reactive_subscription'
        });
      }
    } catch (error) {
      console.error(`[ReactiveQueryManager] Error emitting room deleted:`, error.message);
    }
  }

  /**
   * Emit game deleted event
   * @private
   */
  _emitGameDeleted(gameId, socketId) {
    try {
      const socket = this.socketManager.io.sockets.sockets.get(socketId);
      if (socket) {
        socket.emit('game:deleted', {
          gameId,
          timestamp: new Date().toISOString(),
          source: 'reactive_subscription'
        });
      }
    } catch (error) {
      console.error(`[ReactiveQueryManager] Error emitting game deleted:`, error.message);
    }
  }

  /**
   * Emit subscription error
   * @private
   */
  _emitSubscriptionError(socketId, subscriptionId, error) {
    try {
      const socket = this.socketManager.io.sockets.sockets.get(socketId);
      if (socket) {
        socket.emit('subscription:error', {
          subscriptionId,
          error: error.message,
          timestamp: new Date().toISOString()
        });
      }
    } catch (emitError) {
      console.error(`[ReactiveQueryManager] Error emitting subscription error:`, emitError.message);
    }
  }

  /**
   * Filter sensitive user data before emitting
   * @private
   */
  _filterUserData(userData) {
    const { password_hash, ...filteredData } = userData;
    return filteredData;
  }

  /**
   * Get subscriptions grouped by type
   * @private
   */
  _getSubscriptionsByType() {
    const typeCount = {};
    for (const [, subscriptionData] of this.subscriptions) {
      const type = subscriptionData.type;
      typeCount[type] = (typeCount[type] || 0) + 1;
    }
    return typeCount;
  }
}

export default ReactiveQueryManager;