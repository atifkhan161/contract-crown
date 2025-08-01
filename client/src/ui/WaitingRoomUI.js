/**
 * WaitingRoomUI - Visual Management Component
 * Handles all UI updates, player slot rendering, and responsive layout management
 */

export class WaitingRoomUI {
    constructor() {
        this.elements = {};
        this.currentTheme = 'default';
        this.isMobile = window.innerWidth <= 768;
        
        this.initializeElements();
        this.setupResponsiveHandlers();
        this.initializeAccessibility();
        this.setupEventListeners();
    }

    initializeElements() {
        // Header elements
        this.elements.roomCode = document.getElementById('room-code');
        this.elements.copyCodeBtn = document.getElementById('copy-code-btn');
        
        // Connection status elements
        this.elements.connectionStatus = document.getElementById('connection-status');
        this.elements.statusIndicator = document.getElementById('status-indicator');
        this.elements.statusText = document.getElementById('status-text');
        
        // Player elements
        this.elements.currentPlayers = document.getElementById('current-players');
        this.elements.playersGrid = document.querySelector('.players-grid');
        this.elements.playerSlots = {
            1: document.getElementById('player-slot-1'),
            2: document.getElementById('player-slot-2'),
            3: document.getElementById('player-slot-3'),
            4: document.getElementById('player-slot-4')
        };
        
        // Ready status elements
        this.elements.readyToggleBtn = document.getElementById('ready-toggle-btn');
        this.elements.readyCount = document.getElementById('ready-count');
        this.elements.readyStatus = document.querySelector('.ready-status');
        
        // Host control elements
        this.elements.hostControls = document.getElementById('host-controls');
        this.elements.startGameBtn = document.getElementById('start-game-btn');
        this.elements.startSpinner = document.getElementById('start-spinner');
        
        // Message elements
        this.elements.gameMessages = document.getElementById('game-messages');
        
        // Modal elements
        this.elements.loadingOverlay = document.getElementById('loading-overlay');
        this.elements.loadingText = document.getElementById('loading-text');
        this.elements.errorModal = document.getElementById('error-modal');
        this.elements.errorMessage = document.getElementById('error-message');
        this.elements.closeErrorBtn = document.getElementById('close-error-btn');
        this.elements.errorOkBtn = document.getElementById('error-ok-btn');
    }

    setupResponsiveHandlers() {
        // Handle window resize for responsive layout
        window.addEventListener('resize', () => {
            const wasMobile = this.isMobile;
            this.isMobile = window.innerWidth <= 768;
            
            if (wasMobile !== this.isMobile) {
                this.updateMobileLayout();
            }
        });

        // Handle orientation change on mobile devices
        window.addEventListener('orientationchange', () => {
            setTimeout(() => {
                this.updateMobileLayout();
            }, 100);
        });
    }

    initializeAccessibility() {
        // Set up ARIA labels and keyboard navigation
        this.elements.copyCodeBtn.setAttribute('aria-label', 'Copy room code to clipboard');
        this.elements.readyToggleBtn.setAttribute('aria-label', 'Toggle ready status');
        this.elements.startGameBtn.setAttribute('aria-label', 'Start game for all players');
        
        // Add keyboard navigation for interactive elements
        this.setupKeyboardNavigation();
    }

    setupKeyboardNavigation() {
        // Handle Enter key for buttons
        const buttons = [this.elements.copyCodeBtn, this.elements.readyToggleBtn, this.elements.startGameBtn];
        
        buttons.forEach(button => {
            if (button) {
                button.addEventListener('keydown', (e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        button.click();
                    }
                });
            }
        });
    }

    setupEventListeners() {
        // Copy room code functionality
        if (this.elements.copyCodeBtn) {
            this.elements.copyCodeBtn.addEventListener('click', () => {
                this.copyRoomCode();
            });
        }

        // Error modal close handlers
        if (this.elements.closeErrorBtn) {
            this.elements.closeErrorBtn.addEventListener('click', () => {
                this.hideError();
            });
        }

        if (this.elements.errorOkBtn) {
            this.elements.errorOkBtn.addEventListener('click', () => {
                this.hideError();
            });
        }

        // Close modal on overlay click
        if (this.elements.errorModal) {
            this.elements.errorModal.addEventListener('click', (e) => {
                if (e.target.classList.contains('modal-overlay')) {
                    this.hideError();
                }
            });
        }
    }

    /**
     * Update player slots with current room data
     * @param {Array} players - Array of player objects
     */
    updatePlayerSlots(players) {
        // Reset all slots first
        for (let i = 1; i <= 4; i++) {
            const slot = this.elements.playerSlots[i];
            if (slot) {
                this.resetPlayerSlot(slot, i);
            }
        }

        // Update player count
        if (this.elements.currentPlayers) {
            this.elements.currentPlayers.textContent = players.length;
        }

        // Populate slots with player data
        players.forEach((player, index) => {
            const slotNumber = index + 1;
            const slot = this.elements.playerSlots[slotNumber];
            
            if (slot && slotNumber <= 4) {
                this.populatePlayerSlot(slot, player);
            }
        });

        // Update mobile layout if needed
        if (this.isMobile) {
            this.updateMobileLayout();
        }
    }

    /**
     * Reset a player slot to empty state
     * @param {HTMLElement} slot - The slot element
     * @param {number} position - Slot position number
     */
    resetPlayerSlot(slot, position) {
        slot.classList.remove('occupied', 'ready');
        
        const nameElement = slot.querySelector('.player-name');
        const readyText = slot.querySelector('.ready-text');
        const readyIndicator = slot.querySelector('.ready-indicator');
        const hostBadge = slot.querySelector('.host-badge');
        const avatarPlaceholder = slot.querySelector('.avatar-placeholder');
        
        if (nameElement) nameElement.textContent = 'Waiting for player...';
        if (readyText) readyText.textContent = 'Not Ready';
        if (readyIndicator) readyIndicator.style.background = '';
        if (hostBadge) hostBadge.classList.add('hidden');
        if (avatarPlaceholder) avatarPlaceholder.textContent = position;
    }

    /**
     * Populate a player slot with player data
     * @param {HTMLElement} slot - The slot element
     * @param {Object} player - Player data object
     */
    populatePlayerSlot(slot, player) {
        slot.classList.add('occupied');
        
        if (player.isReady) {
            slot.classList.add('ready');
        }

        const nameElement = slot.querySelector('.player-name');
        const readyText = slot.querySelector('.ready-text');
        const hostBadge = slot.querySelector('.host-badge');
        const avatarPlaceholder = slot.querySelector('.avatar-placeholder');
        
        if (nameElement) nameElement.textContent = player.username || 'Unknown Player';
        if (readyText) readyText.textContent = player.isReady ? 'Ready' : 'Not Ready';
        if (avatarPlaceholder) avatarPlaceholder.textContent = player.username ? player.username.charAt(0).toUpperCase() : '?';
        
        // Show host badge if this player is the host
        if (player.isHost && hostBadge) {
            hostBadge.classList.remove('hidden');
        }
    }

    /**
     * Update ready status display
     * @param {number} readyCount - Number of ready players
     * @param {number} totalCount - Total number of connected players
     */
    updateReadyStatus(readyCount, totalCount) {
        if (this.elements.readyCount) {
            this.elements.readyCount.textContent = readyCount;
        }

        // Update ready status text with enhanced information
        const readyStatusElement = this.elements.readyStatus;
        if (readyStatusElement) {
            let statusText = `${readyCount} of ${totalCount} players ready`;
            let statusClass = 'ready-status';

            // Add visual feedback based on ready state
            if (readyCount === totalCount && totalCount >= 2) {
                statusText += ' ✓';
                statusClass += ' all-ready';
            } else if (readyCount > 0) {
                statusClass += ' some-ready';
            } else {
                statusClass += ' none-ready';
            }

            readyStatusElement.textContent = statusText;
            readyStatusElement.className = statusClass;
        }
    }

    /**
     * Update connection status indicator
     * @param {string} status - Connection status: 'connected', 'connecting', 'disconnected', 'reconnecting'
     */
    updateConnectionStatus(status) {
        const indicator = this.elements.statusIndicator;
        const text = this.elements.statusText;
        
        if (indicator) {
            // Remove all status classes
            indicator.classList.remove('connected', 'connecting', 'disconnected', 'reconnecting');
            indicator.classList.add(status);
        }

        if (text) {
            const statusTexts = {
                connected: 'Connected',
                connecting: 'Connecting...',
                disconnected: 'Disconnected',
                reconnecting: 'Reconnecting...'
            };
            text.textContent = statusTexts[status] || 'Unknown';
        }
    }

    /**
     * Show or hide host controls
     * @param {boolean} isHost - Whether current user is host
     * @param {boolean} canStart - Whether game can be started
     */
    showHostControls(isHost, canStart = false) {
        const hostControls = this.elements.hostControls;
        const startButton = this.elements.startGameBtn;
        
        if (hostControls) {
            if (isHost) {
                hostControls.classList.remove('hidden');
            } else {
                hostControls.classList.add('hidden');
            }
        }

        if (startButton) {
            startButton.disabled = !canStart;
            
            if (canStart) {
                startButton.classList.remove('btn-disabled');
            } else {
                startButton.classList.add('btn-disabled');
            }
        }
    }

    /**
     * Update ready button state
     * @param {boolean} isReady - Current user's ready status
     * @param {boolean} enabled - Whether button should be enabled
     */
    updateReadyButton(isReady, enabled = true) {
        const button = this.elements.readyToggleBtn;
        
        if (button) {
            const buttonText = button.querySelector('.btn-text');
            
            if (buttonText) {
                if (enabled) {
                    buttonText.textContent = isReady ? 'Not Ready' : 'Ready Up';
                } else {
                    buttonText.textContent = isReady ? 'Ready...' : 'Getting Ready...';
                }
            }
            
            button.disabled = !enabled;
            
            // Enhanced visual states
            if (!enabled) {
                button.classList.add('btn-disabled');
                button.classList.remove('btn-success', 'btn-primary');
            } else if (isReady) {
                button.classList.add('btn-success');
                button.classList.remove('btn-primary', 'btn-disabled');
            } else {
                button.classList.add('btn-primary');
                button.classList.remove('btn-success', 'btn-disabled');
            }

            // Add accessibility attributes
            button.setAttribute('aria-pressed', isReady.toString());
            button.setAttribute('aria-disabled', (!enabled).toString());
        }
    }

    /**
     * Show loading overlay
     * @param {string} message - Loading message
     */
    showLoading(message = 'Loading...') {
        if (this.elements.loadingOverlay) {
            this.elements.loadingOverlay.classList.remove('hidden');
        }
        
        if (this.elements.loadingText) {
            this.elements.loadingText.textContent = message;
        }
    }

    /**
     * Hide loading overlay
     */
    hideLoading() {
        if (this.elements.loadingOverlay) {
            this.elements.loadingOverlay.classList.add('hidden');
        }
    }

    /**
     * Show start game loading state
     */
    showStartGameLoading() {
        const button = this.elements.startGameBtn;
        const spinner = this.elements.startSpinner;
        
        if (button) {
            button.disabled = true;
            const buttonText = button.querySelector('.btn-text');
            if (buttonText) buttonText.textContent = 'Starting...';
        }
        
        if (spinner) {
            spinner.classList.remove('hidden');
        }
    }

    /**
     * Hide start game loading state
     */
    hideStartGameLoading() {
        const button = this.elements.startGameBtn;
        const spinner = this.elements.startSpinner;
        
        if (button) {
            const buttonText = button.querySelector('.btn-text');
            if (buttonText) buttonText.textContent = 'Start Game';
        }
        
        if (spinner) {
            spinner.classList.add('hidden');
        }
    }

    /**
     * Display error message
     * @param {string} message - Error message to display
     */
    displayError(message) {
        if (this.elements.errorMessage) {
            this.elements.errorMessage.textContent = message;
        }
        
        if (this.elements.errorModal) {
            this.elements.errorModal.classList.remove('hidden');
        }
    }

    /**
     * Hide error modal
     */
    hideError() {
        if (this.elements.errorModal) {
            this.elements.errorModal.classList.add('hidden');
        }
    }

    /**
     * Add message to game messages area
     * @param {string} message - Message text
     * @param {string} type - Message type: 'system', 'error', 'success'
     */
    addMessage(message, type = 'system') {
        const messagesContainer = this.elements.gameMessages;
        
        if (messagesContainer) {
            const messageElement = document.createElement('div');
            messageElement.className = `message ${type}`;
            messageElement.textContent = message;
            
            messagesContainer.appendChild(messageElement);
            
            // Auto-scroll to bottom
            messagesContainer.scrollTop = messagesContainer.scrollHeight;
            
            // Limit message history to prevent memory issues
            const messages = messagesContainer.querySelectorAll('.message');
            if (messages.length > 50) {
                messages[0].remove();
            }
        }
    }

    /**
     * Clear all messages
     */
    clearMessages() {
        if (this.elements.gameMessages) {
            this.elements.gameMessages.innerHTML = '';
        }
    }

    /**
     * Set room code display
     * @param {string} roomCode - Room code to display
     */
    setRoomCode(roomCode) {
        if (this.elements.roomCode) {
            this.elements.roomCode.textContent = roomCode || '------';
        }
    }

    /**
     * Copy room code to clipboard
     */
    async copyRoomCode() {
        const roomCode = this.elements.roomCode?.textContent;
        
        if (!roomCode || roomCode === '------') {
            this.addMessage('No room code to copy', 'error');
            return;
        }

        try {
            await navigator.clipboard.writeText(roomCode);
            this.addMessage('Room code copied to clipboard!', 'success');
            
            // Visual feedback
            const copyBtn = this.elements.copyCodeBtn;
            if (copyBtn) {
                const originalText = copyBtn.innerHTML;
                copyBtn.innerHTML = '✓';
                setTimeout(() => {
                    copyBtn.innerHTML = originalText;
                }, 1000);
            }
        } catch (error) {
            console.error('Failed to copy room code:', error);
            this.addMessage('Failed to copy room code', 'error');
        }
    }

    /**
     * Update mobile layout adjustments
     */
    updateMobileLayout() {
        const container = document.querySelector('.waiting-room-container');
        
        if (this.isMobile) {
            container?.classList.add('mobile-layout');
            
            // Adjust player grid for mobile
            const playersGrid = this.elements.playersGrid;
            if (playersGrid) {
                playersGrid.style.gridTemplateColumns = '1fr';
            }
        } else {
            container?.classList.remove('mobile-layout');
            
            // Reset player grid for desktop
            const playersGrid = this.elements.playersGrid;
            if (playersGrid) {
                playersGrid.style.gridTemplateColumns = '';
            }
        }
    }

    /**
     * Get current UI state for debugging
     * @returns {Object} Current UI state
     */
    getState() {
        return {
            isMobile: this.isMobile,
            roomCode: this.elements.roomCode?.textContent,
            connectionStatus: this.elements.statusIndicator?.className,
            playerCount: this.elements.currentPlayers?.textContent,
            readyCount: this.elements.readyCount?.textContent,
            isHostControlsVisible: !this.elements.hostControls?.classList.contains('hidden'),
            isLoadingVisible: !this.elements.loadingOverlay?.classList.contains('hidden'),
            isErrorVisible: !this.elements.errorModal?.classList.contains('hidden')
        };
    }

    /**
     * Cleanup UI resources
     */
    cleanup() {
        // Remove event listeners
        window.removeEventListener('resize', this.updateMobileLayout);
        window.removeEventListener('orientationchange', this.updateMobileLayout);
        
        // Clear any timers or intervals
        this.clearMessages();
        this.hideLoading();
        this.hideError();
    }
}