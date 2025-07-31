/**
 * Dashboard Page JavaScript
 * Handles room management, user stats, and real-time updates
 */

import { AuthManager } from '../core/auth.js';
import { SocketManager } from '../core/SocketManager.js';
import { RoomManager } from '../core/RoomManager.js';

class DashboardManager {
    constructor() {
        this.authManager = new AuthManager();
        this.socketManager = new SocketManager(this.authManager);
        this.roomManager = new RoomManager(this.authManager);
        
        this.elements = {};
        this.currentUser = null;
        this.rooms = [];
        this.userStats = {
            gamesPlayed: 0,
            gamesWon: 0,
            winRate: 0
        };
        
        this.initializeElements();
        this.setupEventListeners();
        this.initialize();
    }

    initializeElements() {
        // Header elements
        this.elements.usernameDisplay = document.getElementById('username-display');
        this.elements.logoutBtn = document.getElementById('logout-btn');
        
        // Connection status
        this.elements.connectionStatus = document.getElementById('connection-status');
        this.elements.statusIndicator = document.getElementById('status-indicator');
        this.elements.statusText = document.getElementById('status-text');
        
        // Room management
        this.elements.createRoomBtn = document.getElementById('create-room-btn');
        this.elements.roomsList = document.getElementById('rooms-list');
        this.elements.noRooms = document.getElementById('no-rooms');
        
        // Stats
        this.elements.gamesPlayed = document.getElementById('games-played');
        this.elements.gamesWon = document.getElementById('games-won');
        this.elements.winRate = document.getElementById('win-rate');
        
        // Modal elements
        this.elements.createRoomModal = document.getElementById('create-room-modal');
        this.elements.createRoomForm = document.getElementById('create-room-form');
        this.elements.closeModalBtn = document.getElementById('close-modal-btn');
        this.elements.cancelCreateBtn = document.getElementById('cancel-create-btn');
        this.elements.createRoomSubmit = document.getElementById('create-room-submit');
        this.elements.createSpinner = document.getElementById('create-spinner');
        this.elements.formError = document.getElementById('form-error');
        
        // Form inputs
        this.elements.roomNameInput = document.getElementById('room-name');
        this.elements.maxPlayersSelect = document.getElementById('max-players');
        this.elements.privateRoomCheckbox = document.getElementById('private-room');
        
        // Loading overlay
        this.elements.loadingOverlay = document.getElementById('loading-overlay');
    }

    setupEventListeners() {
        // Logout
        this.elements.logoutBtn.addEventListener('click', () => this.handleLogout());
        
        // Create room modal
        this.elements.createRoomBtn.addEventListener('click', () => this.showCreateRoomModal());
        this.elements.closeModalBtn.addEventListener('click', () => this.hideCreateRoomModal());
        this.elements.cancelCreateBtn.addEventListener('click', () => this.hideCreateRoomModal());
        
        // Modal overlay click to close
        this.elements.createRoomModal.addEventListener('click', (e) => {
            if (e.target === this.elements.createRoomModal) {
                this.hideCreateRoomModal();
            }
        });
        
        // Create room form
        this.elements.createRoomForm.addEventListener('submit', (e) => this.handleCreateRoom(e));
        
        // Socket event listeners
        this.setupSocketListeners();
    }

    setupSocketListeners() {
        // Connection status
        this.socketManager.on('connect', () => this.updateConnectionStatus('connected'));
        this.socketManager.on('disconnect', () => this.updateConnectionStatus('disconnected'));
        this.socketManager.on('reconnecting', () => this.updateConnectionStatus('connecting'));
        
        // Room updates
        this.socketManager.on('roomsUpdated', (rooms) => {
            console.log('[Dashboard] Rooms updated via WebSocket:', rooms);
            this.updateRoomsList(rooms);
        });
        this.socketManager.on('roomCreated', (room) => {
            console.log('[Dashboard] Room created via WebSocket:', room);
            this.handleRoomCreated(room);
        });
        this.socketManager.on('roomJoined', (roomData) => this.handleRoomJoined(roomData));
        this.socketManager.on('roomError', (error) => this.handleRoomError(error));
        this.socketManager.on('roomDeleted', (data) => {
            console.log('[Dashboard] Room deleted via WebSocket:', data);
            this.handleRoomDeleted(data);
        });
        
        // User stats updates
        this.socketManager.on('userStatsUpdated', (stats) => this.updateUserStats(stats));
        
        // Handle WebSocket authentication errors gracefully
        this.socketManager.on('auth_error', (error) => {
            console.warn('[Dashboard] WebSocket authentication failed:', error);
            this.updateConnectionStatus('disconnected');
            // Don't redirect immediately - the dashboard can work without WebSocket
        });
    }

    async initialize() {
        try {
            console.log('[Dashboard] Initializing dashboard...');
            
            // Check authentication
            const isAuthenticated = this.authManager.isAuthenticated();
            const token = this.authManager.getToken();
            const user = this.authManager.getCurrentUser();
            
            console.log('[Dashboard] Auth check:', {
                isAuthenticated,
                hasToken: !!token,
                token: token?.substring(0, 20) + '...',
                hasUser: !!user,
                user: user?.username
            });
            
            if (!isAuthenticated) {
                console.log('[Dashboard] User not authenticated, redirecting to login');
                window.location.href = 'login.html';
                return;
            }

            // Get current user
            this.currentUser = user;
            if (this.currentUser && this.elements.usernameDisplay) {
                this.elements.usernameDisplay.textContent = this.currentUser.username;
                console.log('[Dashboard] User display updated:', this.currentUser.username);
            } else {
                console.error('[Dashboard] Missing user data or username display element');
            }
            
            // Set up minimal authentication state monitoring
            // Only listen for explicit logout events, not automatic session validation
            if (typeof this.authManager.onAuthStateChange === 'function') {
                this.authManager.onAuthStateChange((authState) => {
                    console.log('[Dashboard] Auth state changed:', authState);
                    // Only redirect if we're sure the user was logged out (not just a validation failure)
                    if (!authState.isAuthenticated && !this.authManager.getToken()) {
                        console.log('[Dashboard] User logged out, redirecting to login');
                        window.location.href = 'login.html';
                    }
                });
            }

            // Initialize socket connection (non-blocking)
            try {
                await this.socketManager.connect();
                console.log('[Dashboard] WebSocket connected successfully');
            } catch (error) {
                console.warn('[Dashboard] WebSocket connection failed, continuing without real-time updates:', error);
                this.updateConnectionStatus('disconnected');
            }
            
            // Load initial data
            await this.loadDashboardData();
            
        } catch (error) {
            console.error('Dashboard initialization error:', error);
            this.showError('Failed to initialize dashboard. Please refresh the page.');
        }
    }

    async loadDashboardData() {
        try {
            this.showLoading(true);
            
            // Load rooms and user stats
            await Promise.all([
                this.loadRooms(),
                this.loadUserStats()
            ]);
            
        } catch (error) {
            console.error('Error loading dashboard data:', error);
            this.showError('Failed to load dashboard data.');
        } finally {
            this.showLoading(false);
        }
    }

    async loadRooms() {
        try {
            const rooms = await this.roomManager.getRooms();
            this.updateRoomsList(rooms);
        } catch (error) {
            console.error('Error loading rooms:', error);
            throw error;
        }
    }

    async loadUserStats() {
        try {
            const stats = await this.authManager.getUserStats();
            this.updateUserStats(stats);
        } catch (error) {
            console.error('Error loading user stats:', error);
            // Don't throw - stats are not critical
        }
    }

    updateConnectionStatus(status) {
        const indicator = this.elements.statusIndicator;
        const text = this.elements.statusText;
        
        indicator.className = `status-indicator ${status}`;
        
        switch (status) {
            case 'connected':
                text.textContent = 'Connected';
                break;
            case 'connecting':
                text.textContent = 'Connecting...';
                break;
            case 'disconnected':
                text.textContent = 'Disconnected';
                break;
        }
    }

    updateRoomsList(rooms) {
        this.rooms = rooms;
        
        if (rooms.length === 0) {
            this.elements.roomsList.innerHTML = '';
            this.elements.noRooms.classList.remove('hidden');
            return;
        }
        
        this.elements.noRooms.classList.add('hidden');
        
        const roomsHTML = rooms.map(room => this.createRoomHTML(room)).join('');
        this.elements.roomsList.innerHTML = roomsHTML;
        
        // Add event listeners to room action buttons
        this.attachRoomEventListeners();
    }

    createRoomHTML(room) {
        const isWaiting = room.status === 'waiting';
        const canJoin = isWaiting && room.players.length < room.maxPlayers;
        const isOwner = room.owner === (this.currentUser.user_id || this.currentUser.id);
        
        return `
            <div class="room-item" data-room-id="${room.id}">
                <div class="room-info">
                    <h3 class="room-name">${room.name}</h3>
                    <div class="room-details">
                        <span class="room-players">${room.players.length}/${room.maxPlayers} players</span>
                        <span class="room-status ${room.status}">
                            ${room.status === 'waiting' ? 'Waiting for players' : 'Game in progress'}
                        </span>
                        ${room.isPrivate ? '<span class="room-private">Private</span>' : ''}
                    </div>
                </div>
                <div class="room-actions">
                    ${canJoin ? `<button class="btn btn-primary btn-sm join-room-btn" data-room-id="${room.id}">Join</button>` : ''}
                    ${isOwner ? `<button class="btn btn-secondary btn-sm delete-room-btn" data-room-id="${room.id}">Delete</button>` : ''}
                </div>
            </div>
        `;
    }

    attachRoomEventListeners() {
        // Join room buttons
        document.querySelectorAll('.join-room-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const roomId = e.target.dataset.roomId;
                this.handleJoinRoom(roomId);
            });
        });
        
        // Delete room buttons
        document.querySelectorAll('.delete-room-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const roomId = e.target.dataset.roomId;
                this.handleDeleteRoom(roomId);
            });
        });
    }

    updateUserStats(stats) {
        this.userStats = stats;
        
        this.elements.gamesPlayed.textContent = stats.gamesPlayed || 0;
        this.elements.gamesWon.textContent = stats.gamesWon || 0;
        
        const winRate = stats.gamesPlayed > 0 
            ? Math.round((stats.gamesWon / stats.gamesPlayed) * 100)
            : 0;
        this.elements.winRate.textContent = `${winRate}%`;
    }

    showCreateRoomModal() {
        this.elements.createRoomModal.classList.remove('hidden');
        this.elements.roomNameInput.focus();
        this.clearFormError();
    }

    hideCreateRoomModal() {
        this.elements.createRoomModal.classList.add('hidden');
        this.elements.createRoomForm.reset();
        this.clearFormError();
        this.setCreateRoomLoading(false);
    }

    async handleCreateRoom(e) {
        e.preventDefault();
        
        const formData = new FormData(this.elements.createRoomForm);
        const roomData = {
            name: formData.get('roomName').trim(),
            maxPlayers: parseInt(formData.get('maxPlayers')),
            isPrivate: formData.get('isPrivate') === 'on'
        };

        // Validate
        if (!roomData.name) {
            this.showFormError('Room name is required');
            return;
        }

        if (roomData.name.length > 50) {
            this.showFormError('Room name must be 50 characters or less');
            return;
        }

        try {
            this.setCreateRoomLoading(true);
            this.clearFormError();
            
            const createdRoom = await this.roomManager.createRoom(roomData);
            
            // Handle successful room creation
            this.hideCreateRoomModal();
            
            // Immediately redirect to lobby
            window.location.href = `waiting-room.html?room=${createdRoom.id}`;
            
        } catch (error) {
            console.error('Create room error:', error);
            this.showFormError(error.message || 'Failed to create room');
            this.setCreateRoomLoading(false);
        }
    }

    async handleJoinRoom(roomId) {
        try {
            this.showLoading(true);
            const response = await this.roomManager.joinRoom(roomId);
            
            // Hide loading and redirect to lobby
            this.showLoading(false);
            window.location.href = `waiting-room.html?room=${response.roomId}`;
            
        } catch (error) {
            console.error('Join room error:', error);
            this.showError(error.message || 'Failed to join room');
            this.showLoading(false);
        }
    }

    async handleDeleteRoom(roomId) {
        if (!confirm('Are you sure you want to delete this room?')) {
            return;
        }

        try {
            this.showLoading(true);
            await this.roomManager.deleteRoom(roomId);
        } catch (error) {
            console.error('Delete room error:', error);
            this.showError(error.message || 'Failed to delete room');
        } finally {
            this.showLoading(false);
        }
    }

    handleRoomCreated(room) {
        this.hideCreateRoomModal();
        
        // Add the new room to the list immediately for better UX
        this.rooms.push(room);
        this.updateRoomsList(this.rooms);
        
        // Auto-redirect to lobby if user created the room
        if (room.owner === (this.currentUser.user_id || this.currentUser.id)) {
            setTimeout(() => {
                window.location.href = `waiting-room.html?room=${room.id}`;
            }, 500);
        }
    }

    handleRoomJoined(roomData) {
        // Redirect to lobby page for the room
        window.location.href = `waiting-room.html?room=${roomData.roomId}`;
    }

    handleRoomError(error) {
        this.showError(error.message || 'Room operation failed');
    }

    handleRoomDeleted(data) {
        // Remove the deleted room from the list
        this.rooms = this.rooms.filter(room => room.id !== data.roomId);
        this.updateRoomsList(this.rooms);
    }

    handleLogout() {
        if (confirm('Are you sure you want to logout?')) {
            this.authManager.logout();
            window.location.href = 'login.html';
        }
    }

    setCreateRoomLoading(loading) {
        if (loading) {
            this.elements.createRoomSubmit.disabled = true;
            this.elements.createSpinner.classList.remove('hidden');
            this.elements.createRoomSubmit.querySelector('.btn-text').textContent = 'Creating...';
        } else {
            this.elements.createRoomSubmit.disabled = false;
            this.elements.createSpinner.classList.add('hidden');
            this.elements.createRoomSubmit.querySelector('.btn-text').textContent = 'Create Room';
        }
    }

    showLoading(show) {
        if (show) {
            this.elements.loadingOverlay.classList.remove('hidden');
        } else {
            this.elements.loadingOverlay.classList.add('hidden');
        }
    }

    showFormError(message) {
        this.elements.formError.textContent = message;
        this.elements.formError.classList.remove('hidden');
    }

    clearFormError() {
        this.elements.formError.textContent = '';
        this.elements.formError.classList.add('hidden');
    }

    showError(message) {
        // For now, use alert - could be replaced with a toast notification system
        alert(message);
    }
}

// Initialize dashboard when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    new DashboardManager();
});