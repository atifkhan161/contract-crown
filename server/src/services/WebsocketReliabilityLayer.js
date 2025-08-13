/**
 * Websocket Event Reliability Layer
 * Provides event delivery confirmation, retry mechanisms, and HTTP API fallback
 * for critical websocket events to ensure reliable lobby functionality.
 */

import axios from 'axios';

class WebsocketReliabilityLayer {
    constructor(io, socketManager) {
        this.io = io;
        this.socketManager = socketManager;

        // Event delivery tracking
        this.pendingEvents = new Map(); // eventId -> event data
        this.eventDeliveryStats = new Map(); // eventType -> stats
        this.eventTimeouts = new Map(); // eventId -> timeout handle

        // Retry configuration
        this.retryConfig = {
            maxRetries: 3,
            baseDelay: 1000, // 1 second
            maxDelay: 8000,  // 8 seconds
            backoffMultiplier: 2
        };

        // HTTP API fallback configuration
        this.httpFallbackConfig = {
            baseURL: process.env.API_BASE_URL || 'http://localhost:3001',
            timeout: 5000,
            headers: {
                'Content-Type': 'application/json'
            }
        };

        // Critical events that require HTTP fallback
        this.criticalEvents = new Set([
            'player-ready-changed',
            'teams-formed',
            'game-starting',
            'player-joined',
            'player-left',
            'state-synchronized'
        ]);

        // Event delivery monitoring
        this.monitoringEnabled = true;
        this.monitoringInterval = null;

        this.initializeMonitoring();
    }

    /**
     * Initialize event delivery monitoring
     */
    initializeMonitoring() {
        if (this.monitoringEnabled) {
            this.monitoringInterval = setInterval(() => {
                this.cleanupExpiredEvents();
                this.logDeliveryStats();
            }, 30000); // Every 30 seconds
        }
    }

    /**
     * Emit event with retry mechanism and delivery confirmation
     * @param {string} target - Target (room ID or socket ID)
     * @param {string} eventType - Event type
     * @param {Object} eventData - Event data
     * @param {Object} options - Emission options
     * @returns {Promise<boolean>} Success status
     */
    async emitWithRetry(target, eventType, eventData, options = {}) {
        const eventId = this.generateEventId();
        const timestamp = new Date().toISOString();

        const eventInfo = {
            id: eventId,
            target,
            eventType,
            eventData: { ...eventData, _eventId: eventId, _timestamp: timestamp },
            options,
            attempts: 0,
            maxRetries: options.maxRetries || this.retryConfig.maxRetries,
            createdAt: timestamp,
            lastAttempt: null,
            status: 'pending'
        };

        this.pendingEvents.set(eventId, eventInfo);
        this.updateEventStats(eventType, 'attempted');

        console.log(`[WebsocketReliability] Emitting event ${eventType} (${eventId}) to ${target}`);

        try {
            const success = await this.attemptEventDelivery(eventInfo);

            if (success) {
                this.handleEventSuccess(eventInfo);
                return true;
            } else {
                await this.handleEventFailure(eventInfo, new Error('Event delivery failed'));
                return false;
            }
        } catch (error) {
            await this.handleEventFailure(eventInfo, error);
            return false;
        }
    }

    /**
     * Attempt to deliver an event
     * @param {Object} eventInfo - Event information
     * @returns {Promise<boolean>} Success status
     */
    async attemptEventDelivery(eventInfo) {
        eventInfo.attempts++;
        eventInfo.lastAttempt = new Date().toISOString();

        try {
            // Determine emission method based on target
            if (eventInfo.target.startsWith('room:')) {
                const roomId = eventInfo.target.replace('room:', '');
                this.io.to(roomId).emit(eventInfo.eventType, eventInfo.eventData);
            } else if (eventInfo.target.startsWith('socket:')) {
                const socketId = eventInfo.target.replace('socket:', '');
                const socket = this.io.sockets.sockets.get(socketId);
                if (socket) {
                    socket.emit(eventInfo.eventType, eventInfo.eventData);
                } else {
                    throw new Error(`Socket ${socketId} not found`);
                }
            } else {
                // Assume it's a room ID
                this.io.to(eventInfo.target).emit(eventInfo.eventType, eventInfo.eventData);
            }

            // Set up delivery confirmation timeout
            this.setupDeliveryConfirmation(eventInfo);

            return true;
        } catch (error) {
            console.error(`[WebsocketReliability] Event delivery attempt failed:`, error);
            return false;
        }
    }

    /**
     * Set up delivery confirmation timeout
     * @param {Object} eventInfo - Event information
     */
    setupDeliveryConfirmation(eventInfo) {
        const confirmationTimeout = setTimeout(() => {
            if (this.pendingEvents.has(eventInfo.id)) {
                console.log(`[WebsocketReliability] Event ${eventInfo.eventType} (${eventInfo.id}) confirmation timeout`);
                this.handleEventTimeout(eventInfo);
            }
        }, 5000); // 5 second timeout for confirmation

        this.eventTimeouts.set(eventInfo.id, confirmationTimeout);
    }

    /**
     * Handle event delivery success
     * @param {Object} eventInfo - Event information
     */
    handleEventSuccess(eventInfo) {
        console.log(`[WebsocketReliability] Event ${eventInfo.eventType} (${eventInfo.id}) delivered successfully`);

        eventInfo.status = 'delivered';
        this.updateEventStats(eventInfo.eventType, 'delivered');

        // Clean up
        this.clearEventTimeout(eventInfo.id);
        this.pendingEvents.delete(eventInfo.id);
    }

    /**
     * Handle event delivery failure
     * @param {Object} eventInfo - Event information
     * @param {Error} error - Error that occurred
     */
    async handleEventFailure(eventInfo, error) {
        console.error(`[WebsocketReliability] Event ${eventInfo.eventType} (${eventInfo.id}) failed:`, error.message);

        eventInfo.status = 'failed';
        eventInfo.lastError = error.message;

        this.updateEventStats(eventInfo.eventType, 'failed');

        // Attempt retry if within limits
        if (eventInfo.attempts < eventInfo.maxRetries) {
            await this.scheduleRetry(eventInfo);
        } else {
            // Max retries reached, try HTTP fallback for critical events
            if (this.criticalEvents.has(eventInfo.eventType)) {
                console.log(`[WebsocketReliability] Attempting HTTP fallback for critical event ${eventInfo.eventType}`);
                await this.attemptHttpFallback(eventInfo);
            }

            // Final cleanup
            this.clearEventTimeout(eventInfo.id);
            this.pendingEvents.delete(eventInfo.id);
        }
    }

    /**
     * Handle event delivery timeout
     * @param {Object} eventInfo - Event information
     */
    async handleEventTimeout(eventInfo) {
        console.log(`[WebsocketReliability] Event ${eventInfo.eventType} (${eventInfo.id}) timed out`);

        await this.handleEventFailure(eventInfo, new Error('Event delivery timeout'));
    }

    /**
     * Schedule event retry with exponential backoff
     * @param {Object} eventInfo - Event information
     */
    async scheduleRetry(eventInfo) {
        const delay = Math.min(
            this.retryConfig.baseDelay * Math.pow(this.retryConfig.backoffMultiplier, eventInfo.attempts - 1),
            this.retryConfig.maxDelay
        );

        console.log(`[WebsocketReliability] Scheduling retry ${eventInfo.attempts}/${eventInfo.maxRetries} for event ${eventInfo.eventType} (${eventInfo.id}) in ${delay}ms`);

        setTimeout(async () => {
            if (this.pendingEvents.has(eventInfo.id)) {
                try {
                    const success = await this.attemptEventDelivery(eventInfo);
                    if (success) {
                        this.handleEventSuccess(eventInfo);
                    } else {
                        await this.handleEventFailure(eventInfo, new Error('Retry attempt failed'));
                    }
                } catch (error) {
                    await this.handleEventFailure(eventInfo, error);
                }
            }
        }, delay);
    }

    /**
     * Attempt HTTP API fallback for critical events
     * @param {Object} eventInfo - Event information
     */
    async attemptHttpFallback(eventInfo) {
        try {
            console.log(`[WebsocketReliability] Attempting HTTP fallback for ${eventInfo.eventType}`);

            const fallbackResult = await this.executeHttpFallback(eventInfo);

            if (fallbackResult.success) {
                console.log(`[WebsocketReliability] HTTP fallback successful for ${eventInfo.eventType}`);
                this.updateEventStats(eventInfo.eventType, 'fallback_success');

                // Notify clients about the fallback
                this.notifyFallbackSuccess(eventInfo);
            } else {
                console.error(`[WebsocketReliability] HTTP fallback failed for ${eventInfo.eventType}:`, fallbackResult.error);
                this.updateEventStats(eventInfo.eventType, 'fallback_failed');
            }
        } catch (error) {
            console.error(`[WebsocketReliability] HTTP fallback error for ${eventInfo.eventType}:`, error);
            this.updateEventStats(eventInfo.eventType, 'fallback_error');
        }
    }

    /**
     * Execute HTTP fallback based on event type
     * @param {Object} eventInfo - Event information
     * @returns {Promise<Object>} Fallback result
     */
    async executeHttpFallback(eventInfo) {
        const { eventType, eventData } = eventInfo;

        try {
            switch (eventType) {
                case 'player-ready-changed':
                    return await this.fallbackPlayerReady(eventData);

                case 'teams-formed':
                    return await this.fallbackTeamsFormed(eventData);

                case 'game-starting':
                    return await this.fallbackGameStarting(eventData);

                case 'player-joined':
                case 'player-left':
                    return await this.fallbackRoomUpdate(eventData);

                case 'state-synchronized':
                    return await this.fallbackStateSynchronization(eventData);

                default:
                    return { success: false, error: 'No fallback available for event type' };
            }
        } catch (error) {
            return { success: false, error: error.message };
        }
    }

    /**
     * HTTP fallback for player ready status changes
     * @param {Object} eventData - Event data
     * @returns {Promise<Object>} Result
     */
    async fallbackPlayerReady(eventData) {
        try {
            const response = await axios.post(
                `${this.httpFallbackConfig.baseURL}/api/rooms/${eventData.gameId}/ready`,
                {
                    isReady: eventData.isReady,
                    playerId: eventData.playerId
                },
                {
                    timeout: this.httpFallbackConfig.timeout,
                    headers: this.httpFallbackConfig.headers
                }
            );

            return { success: true, data: response.data };
        } catch (error) {
            return { success: false, error: error.message };
        }
    }

    /**
     * HTTP fallback for team formation
     * @param {Object} eventData - Event data
     * @returns {Promise<Object>} Result
     */
    async fallbackTeamsFormed(eventData) {
        try {
            // Use the HTTP API to form teams, which will sync with websocket state
            const response = await axios.post(
                `${this.httpFallbackConfig.baseURL}/api/rooms/${eventData.gameId}/form-teams`,
                {},
                {
                    timeout: this.httpFallbackConfig.timeout,
                    headers: {
                        ...this.httpFallbackConfig.headers,
                        'Authorization': `Bearer ${eventData.authToken || ''}`
                    }
                }
            );

            // After successful HTTP fallback, ensure websocket state is synchronized
            if (response.data.success && this.socketManager) {
                const gameRoom = this.socketManager.gameRooms?.get(eventData.gameId);
                if (gameRoom && response.data.teams) {
                    // Update websocket room state with HTTP API result
                    gameRoom.teams.team1 = response.data.teams.team1?.map(p => p.id) || [];
                    gameRoom.teams.team2 = response.data.teams.team2?.map(p => p.id) || [];
                    
                    // Update player team assignments
                    if (response.data.room?.players) {
                        response.data.room.players.forEach(player => {
                            const wsPlayer = gameRoom.players.get(player.id);
                            if (wsPlayer) {
                                wsPlayer.teamAssignment = player.teamAssignment;
                            }
                        });
                    }
                    
                    console.log(`[WebsocketReliabilityLayer] Synchronized websocket state after HTTP team formation fallback for room ${eventData.gameId}`);
                }
            }

            return { success: true, data: response.data };
        } catch (error) {
            console.error('[WebsocketReliabilityLayer] HTTP fallback for team formation failed:', error);
            return { success: false, error: error.message };
        }
    }

    /**
     * HTTP fallback for game starting
     * @param {Object} eventData - Event data
     * @returns {Promise<Object>} Result
     */
    async fallbackGameStarting(eventData) {
        try {
            const response = await axios.post(
                `${this.httpFallbackConfig.baseURL}/api/rooms/${eventData.gameId}/start`,
                {
                    startedBy: eventData.startedById
                },
                {
                    timeout: this.httpFallbackConfig.timeout,
                    headers: this.httpFallbackConfig.headers
                }
            );

            return { success: true, data: response.data };
        } catch (error) {
            return { success: false, error: error.message };
        }
    }

    /**
     * HTTP fallback for room updates (join/leave)
     * @param {Object} eventData - Event data
     * @returns {Promise<Object>} Result
     */
    async fallbackRoomUpdate(eventData) {
        try {
            // Get current room state via HTTP API
            const response = await axios.get(
                `${this.httpFallbackConfig.baseURL}/api/rooms/${eventData.gameId}`,
                {
                    timeout: this.httpFallbackConfig.timeout,
                    headers: this.httpFallbackConfig.headers
                }
            );

            return { success: true, data: response.data };
        } catch (error) {
            return { success: false, error: error.message };
        }
    }

    /**
     * HTTP fallback for state synchronization
     * @param {Object} eventData - Event data
     * @returns {Promise<Object>} Result
     */
    async fallbackStateSynchronization(eventData) {
        try {
            // Get current room state and broadcast via polling mechanism
            const response = await axios.get(
                `${this.httpFallbackConfig.baseURL}/api/rooms/${eventData.gameId}`,
                {
                    timeout: this.httpFallbackConfig.timeout,
                    headers: this.httpFallbackConfig.headers
                }
            );

            // Trigger a state refresh for all clients
            this.io.to(eventData.gameId).emit('state-refresh-required', {
                gameId: eventData.gameId,
                reason: 'websocket_fallback',
                timestamp: new Date().toISOString()
            });

            return { success: true, data: response.data };
        } catch (error) {
            return { success: false, error: error.message };
        }
    }

    /**
     * Notify clients about successful fallback
     * @param {Object} eventInfo - Event information
     */
    notifyFallbackSuccess(eventInfo) {
        const roomId = this.extractRoomId(eventInfo.target);
        if (roomId) {
            this.io.to(roomId).emit('fallback-notification', {
                eventType: eventInfo.eventType,
                eventId: eventInfo.id,
                message: 'Event delivered via HTTP fallback',
                timestamp: new Date().toISOString()
            });
        }
    }

    /**
     * Extract room ID from target
     * @param {string} target - Target identifier
     * @returns {string|null} Room ID
     */
    extractRoomId(target) {
        if (target.startsWith('room:')) {
            return target.replace('room:', '');
        }
        // Assume target is room ID if not prefixed
        return target;
    }

    /**
     * Confirm event delivery (called by client acknowledgment)
     * @param {string} eventId - Event ID
     */
    confirmEventDelivery(eventId) {
        const eventInfo = this.pendingEvents.get(eventId);
        if (eventInfo) {
            console.log(`[WebsocketReliability] Event delivery confirmed: ${eventInfo.eventType} (${eventId})`);
            this.handleEventSuccess(eventInfo);
        }
    }

    /**
     * Generate unique event ID
     * @returns {string} Event ID
     */
    generateEventId() {
        return `evt_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }

    /**
     * Clear event timeout
     * @param {string} eventId - Event ID
     */
    clearEventTimeout(eventId) {
        const timeout = this.eventTimeouts.get(eventId);
        if (timeout) {
            clearTimeout(timeout);
            this.eventTimeouts.delete(eventId);
        }
    }

    /**
     * Update event delivery statistics
     * @param {string} eventType - Event type
     * @param {string} status - Status (attempted, delivered, failed, etc.)
     */
    updateEventStats(eventType, status) {
        if (!this.eventDeliveryStats.has(eventType)) {
            this.eventDeliveryStats.set(eventType, {
                attempted: 0,
                delivered: 0,
                failed: 0,
                fallback_success: 0,
                fallback_failed: 0,
                fallback_error: 0
            });
        }

        const stats = this.eventDeliveryStats.get(eventType);
        if (stats[status] !== undefined) {
            stats[status]++;
        }
    }

    /**
     * Clean up expired events
     */
    cleanupExpiredEvents() {
        const now = Date.now();
        const expiredEvents = [];

        for (const [eventId, eventInfo] of this.pendingEvents) {
            const eventAge = now - new Date(eventInfo.createdAt).getTime();
            if (eventAge > 300000) { // 5 minutes
                expiredEvents.push(eventId);
            }
        }

        for (const eventId of expiredEvents) {
            console.log(`[WebsocketReliability] Cleaning up expired event: ${eventId}`);
            this.clearEventTimeout(eventId);
            this.pendingEvents.delete(eventId);
        }
    }

    /**
     * Log delivery statistics
     */
    logDeliveryStats() {
        if (this.eventDeliveryStats.size > 0) {
            console.log('[WebsocketReliability] Event delivery statistics:');
            for (const [eventType, stats] of this.eventDeliveryStats) {
                const successRate = stats.attempted > 0 ?
                    ((stats.delivered / stats.attempted) * 100).toFixed(2) : '0.00';

                console.log(`  ${eventType}: ${stats.delivered}/${stats.attempted} (${successRate}%) success, ${stats.failed} failed, ${stats.fallback_success} fallback success`);
            }
        }
    }

    /**
     * Get event delivery statistics
     * @returns {Object} Statistics
     */
    getDeliveryStats() {
        const stats = {};
        for (const [eventType, eventStats] of this.eventDeliveryStats) {
            stats[eventType] = { ...eventStats };
        }

        return {
            eventStats: stats,
            pendingEvents: this.pendingEvents.size,
            monitoringEnabled: this.monitoringEnabled,
            criticalEvents: Array.from(this.criticalEvents)
        };
    }

    /**
     * Enable or disable monitoring
     * @param {boolean} enabled - Whether to enable monitoring
     */
    setMonitoringEnabled(enabled) {
        this.monitoringEnabled = enabled;

        if (enabled && !this.monitoringInterval) {
            this.initializeMonitoring();
        } else if (!enabled && this.monitoringInterval) {
            clearInterval(this.monitoringInterval);
            this.monitoringInterval = null;
        }

        console.log(`[WebsocketReliability] Monitoring ${enabled ? 'enabled' : 'disabled'}`);
    }

    /**
     * Add event type to critical events list
     * @param {string} eventType - Event type
     */
    addCriticalEvent(eventType) {
        this.criticalEvents.add(eventType);
        console.log(`[WebsocketReliability] Added ${eventType} to critical events`);
    }

    /**
     * Remove event type from critical events list
     * @param {string} eventType - Event type
     */
    removeCriticalEvent(eventType) {
        this.criticalEvents.delete(eventType);
        console.log(`[WebsocketReliability] Removed ${eventType} from critical events`);
    }

    /**
     * Shutdown and cleanup
     */
    shutdown() {
        console.log('[WebsocketReliability] Shutting down...');

        // Clear all timeouts
        for (const timeout of this.eventTimeouts.values()) {
            clearTimeout(timeout);
        }

        // Clear monitoring interval
        if (this.monitoringInterval) {
            clearInterval(this.monitoringInterval);
        }

        // Clear maps
        this.pendingEvents.clear();
        this.eventTimeouts.clear();

        console.log('[WebsocketReliability] Shutdown complete');
    }
}

export default WebsocketReliabilityLayer;
