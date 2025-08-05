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
        
        // Debug logging for host controls
        console.log('[WaitingRoomUI] Host controls element found:', !!this.elements.hostControls);
        console.log('[WaitingRoomUI] Start game button found:', !!this.elements.startGameBtn);
        if (this.elements.hostControls) {
            console.log('[WaitingRoomUI] Initial host controls classes:', this.elements.hostControls.classList.toString());
        }
        
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
        const handleResize = () => {
            const wasMobile = this.isMobile;
            this.isMobile = window.innerWidth <= 768;
            
            if (wasMobile !== this.isMobile) {
                this.updateMobileLayout();
            }
            
            // Update touch targets for current screen size
            this.updateTouchTargets();
        };

        window.addEventListener('resize', handleResize);

        // Enhanced orientation change handling
        const handleOrientationChange = () => {
            // Wait for viewport to stabilize after orientation change
            setTimeout(() => {
                this.updateMobileLayout();
                this.handleOrientationSpecificLayout();
                this.updateTouchTargets();
                
                // Force a reflow to ensure proper layout
                document.body.offsetHeight;
            }, 150);
        };

        window.addEventListener('orientationchange', handleOrientationChange);
        
        // Also listen for screen orientation API if available
        if (screen.orientation) {
            screen.orientation.addEventListener('change', handleOrientationChange);
        }

        // Handle viewport changes on mobile browsers
        const handleViewportChange = () => {
            if (this.isMobile) {
                this.adjustForViewportChanges();
            }
        };

        window.addEventListener('resize', handleViewportChange);
        
        // Store handlers for cleanup
        this.resizeHandler = handleResize;
        this.orientationHandler = handleOrientationChange;
        this.viewportHandler = handleViewportChange;
    }

    initializeAccessibility() {
        // Set up ARIA labels and keyboard navigation
        this.elements.copyCodeBtn?.setAttribute('aria-label', 'Copy room code to clipboard');
        this.elements.readyToggleBtn?.setAttribute('aria-label', 'Toggle ready status');
        this.elements.startGameBtn?.setAttribute('aria-label', 'Start game for all players');
        
        // Add screen reader only content
        this.addScreenReaderContent();
        
        // Add keyboard navigation for interactive elements
        this.setupKeyboardNavigation();
        
        // Set up focus management
        this.setupFocusManagement();
        
        // Add skip links for better navigation
        this.addSkipLinks();
    }

    setupKeyboardNavigation() {
        // Handle Enter and Space key for buttons
        const buttons = [
            this.elements.copyCodeBtn, 
            this.elements.readyToggleBtn, 
            this.elements.startGameBtn,
            document.getElementById('leave-room-btn')
        ];
        
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

        // Add keyboard navigation for player slots
        Object.values(this.elements.playerSlots).forEach((slot, index) => {
            if (slot) {
                slot.addEventListener('keydown', (e) => {
                    this.handlePlayerSlotKeydown(e, index + 1);
                });
            }
        });

        // Add global keyboard shortcuts
        document.addEventListener('keydown', (e) => {
            this.handleGlobalKeydown(e);
        });
    }

    /**
     * Handle keyboard navigation for player slots
     */
    handlePlayerSlotKeydown(e, slotNumber) {
        switch (e.key) {
            case 'ArrowDown':
            case 'ArrowRight':
                e.preventDefault();
                this.focusNextPlayerSlot(slotNumber);
                break;
            case 'ArrowUp':
            case 'ArrowLeft':
                e.preventDefault();
                this.focusPreviousPlayerSlot(slotNumber);
                break;
            case 'Home':
                e.preventDefault();
                this.focusPlayerSlot(1);
                break;
            case 'End':
                e.preventDefault();
                this.focusPlayerSlot(4);
                break;
        }
    }

    /**
     * Handle global keyboard shortcuts
     */
    handleGlobalKeydown(e) {
        // Only handle shortcuts when not in input fields
        if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') {
            return;
        }

        switch (e.key) {
            case 'r':
            case 'R':
                if (!e.ctrlKey && !e.metaKey) {
                    e.preventDefault();
                    this.elements.readyToggleBtn?.click();
                }
                break;
            case 's':
            case 'S':
                if (!e.ctrlKey && !e.metaKey) {
                    e.preventDefault();
                    if (!this.elements.startGameBtn?.disabled) {
                        this.elements.startGameBtn?.click();
                    }
                }
                break;
            case 'c':
            case 'C':
                if (!e.ctrlKey && !e.metaKey) {
                    e.preventDefault();
                    this.elements.copyCodeBtn?.click();
                }
                break;
            case 'Escape':
                e.preventDefault();
                this.handleEscapeKey();
                break;
        }
    }

    /**
     * Focus next player slot
     */
    focusNextPlayerSlot(currentSlot) {
        const nextSlot = currentSlot < 4 ? currentSlot + 1 : 1;
        this.focusPlayerSlot(nextSlot);
    }

    /**
     * Focus previous player slot
     */
    focusPreviousPlayerSlot(currentSlot) {
        const prevSlot = currentSlot > 1 ? currentSlot - 1 : 4;
        this.focusPlayerSlot(prevSlot);
    }

    /**
     * Focus specific player slot
     */
    focusPlayerSlot(slotNumber) {
        const slot = this.elements.playerSlots[slotNumber];
        if (slot) {
            slot.focus();
        }
    }

    /**
     * Handle escape key press
     */
    handleEscapeKey() {
        // Close any open modals
        if (!this.elements.errorModal?.classList.contains('hidden')) {
            this.hideError();
            return;
        }

        // Focus main ready button as default action
        this.elements.readyToggleBtn?.focus();
    }

    /**
     * Set up focus management
     */
    setupFocusManagement() {
        // Trap focus in modals
        this.setupModalFocusTrap();
        
        // Manage focus indicators
        this.setupFocusIndicators();
        
        // Handle focus restoration
        this.setupFocusRestoration();
    }

    /**
     * Set up modal focus trap
     */
    setupModalFocusTrap() {
        const modal = this.elements.errorModal;
        if (!modal) return;

        modal.addEventListener('keydown', (e) => {
            if (e.key === 'Tab') {
                this.trapFocusInModal(e, modal);
            }
        });
    }

    /**
     * Trap focus within modal
     */
    trapFocusInModal(e, modal) {
        const focusableElements = modal.querySelectorAll(
            'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
        );
        
        const firstElement = focusableElements[0];
        const lastElement = focusableElements[focusableElements.length - 1];

        if (e.shiftKey) {
            if (document.activeElement === firstElement) {
                e.preventDefault();
                lastElement.focus();
            }
        } else {
            if (document.activeElement === lastElement) {
                e.preventDefault();
                firstElement.focus();
            }
        }
    }

    /**
     * Set up focus indicators
     */
    setupFocusIndicators() {
        // Add visible focus indicators for keyboard users
        const style = document.createElement('style');
        style.textContent = `
            .keyboard-user *:focus {
                outline: 2px solid var(--primary-color) !important;
                outline-offset: 2px !important;
            }
            
            .keyboard-user .player-slot:focus {
                box-shadow: 0 0 0 3px rgba(74, 144, 226, 0.3) !important;
            }
        `;
        document.head.appendChild(style);

        // Detect keyboard usage
        document.addEventListener('keydown', () => {
            document.body.classList.add('keyboard-user');
        });

        document.addEventListener('mousedown', () => {
            document.body.classList.remove('keyboard-user');
        });
    }

    /**
     * Set up focus restoration
     */
    setupFocusRestoration() {
        this.lastFocusedElement = null;

        // Store focus before showing modal
        const originalDisplayError = this.displayError.bind(this);
        this.displayError = (message) => {
            this.lastFocusedElement = document.activeElement;
            originalDisplayError(message);
            
            // Focus first button in modal
            setTimeout(() => {
                const firstButton = this.elements.errorModal?.querySelector('button');
                firstButton?.focus();
            }, 100);
        };

        // Restore focus after hiding modal
        const originalHideError = this.hideError.bind(this);
        this.hideError = () => {
            originalHideError();
            
            // Restore focus
            if (this.lastFocusedElement) {
                this.lastFocusedElement.focus();
                this.lastFocusedElement = null;
            }
        };
    }

    /**
     * Add screen reader only content
     */
    addScreenReaderContent() {
        // Add screen reader only styles
        const style = document.createElement('style');
        style.textContent = `
            .sr-only {
                position: absolute !important;
                width: 1px !important;
                height: 1px !important;
                padding: 0 !important;
                margin: -1px !important;
                overflow: hidden !important;
                clip: rect(0, 0, 0, 0) !important;
                white-space: nowrap !important;
                border: 0 !important;
            }
        `;
        document.head.appendChild(style);

        // Add keyboard shortcut hints
        const shortcutHints = document.createElement('div');
        shortcutHints.className = 'sr-only';
        shortcutHints.innerHTML = `
            <p>Keyboard shortcuts: Press R to toggle ready, S to start game (if host), C to copy room code, Escape to close dialogs</p>
            <p>Use arrow keys to navigate between player slots</p>
        `;
        document.body.appendChild(shortcutHints);
    }

    /**
     * Add skip links for better navigation
     */
    addSkipLinks() {
        const skipLinks = document.createElement('div');
        skipLinks.className = 'skip-links';
        skipLinks.innerHTML = `
            <a href="#players-heading" class="skip-link">Skip to players</a>
            <a href="#ready-toggle-btn" class="skip-link">Skip to ready controls</a>
            <a href="#game-messages" class="skip-link">Skip to messages</a>
        `;

        // Add skip link styles
        const style = document.createElement('style');
        style.textContent = `
            .skip-links {
                position: absolute;
                top: -100px;
                left: 0;
                z-index: 1000;
            }
            
            .skip-link {
                position: absolute;
                top: -100px;
                left: 0;
                background: var(--primary-color);
                color: white;
                padding: 8px 16px;
                text-decoration: none;
                border-radius: 4px;
                font-weight: bold;
                transition: top 0.3s;
            }
            
            .skip-link:focus {
                top: 10px;
            }
        `;
        document.head.appendChild(style);

        document.body.insertBefore(skipLinks, document.body.firstChild);
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

        // Add bot styling if this is a bot player
        if (player.isBot) {
            slot.classList.add('bot-player');
        } else {
            slot.classList.remove('bot-player');
        }

        const nameElement = slot.querySelector('.player-name');
        const readyText = slot.querySelector('.ready-text');
        const hostBadge = slot.querySelector('.host-badge');
        const avatarPlaceholder = slot.querySelector('.avatar-placeholder');
        
        // Display bot name with bot indicator
        const displayName = player.isBot ? `🤖 ${player.username}` : (player.username || 'Unknown Player');
        if (nameElement) nameElement.textContent = displayName;
        
        if (readyText) readyText.textContent = player.isReady ? 'Ready' : 'Not Ready';
        
        // For bots, show a robot icon in avatar, for humans show first letter
        if (avatarPlaceholder) {
            if (player.isBot) {
                avatarPlaceholder.textContent = '🤖';
                avatarPlaceholder.style.fontSize = '1.2em';
            } else {
                avatarPlaceholder.textContent = player.username ? player.username.charAt(0).toUpperCase() : '?';
                avatarPlaceholder.style.fontSize = '';
            }
        }
        
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
     * Update connection status indicator with enhanced information
     * @param {string} status - Connection status: 'connected', 'connecting', 'disconnected', 'reconnecting'
     * @param {Object} details - Additional connection details
     */
    updateConnectionStatus(status, details = {}) {
        const indicator = this.elements.statusIndicator;
        const text = this.elements.statusText;
        const statusContainer = this.elements.connectionStatus;
        
        if (indicator) {
            // Remove all status classes
            indicator.classList.remove('connected', 'connecting', 'disconnected', 'reconnecting', 'warning', 'error');
            indicator.classList.add(status);
        }

        if (text) {
            const statusTexts = {
                connected: 'Connected',
                connecting: 'Connecting...',
                disconnected: 'Disconnected',
                reconnecting: details.reconnectAttempts ? 
                    `Reconnecting... (${details.reconnectAttempts}/${details.maxReconnectAttempts})` : 
                    'Reconnecting...'
            };
            text.textContent = statusTexts[status] || 'Unknown';
        }

        // Update container classes for additional styling
        if (statusContainer) {
            statusContainer.classList.remove('status-connected', 'status-connecting', 'status-disconnected', 'status-reconnecting');
            statusContainer.classList.add(`status-${status}`);
            
            // Add warning class if connection is unstable
            if (details.reconnectAttempts > 0) {
                statusContainer.classList.add('status-warning');
            }
        }

        // Store status for accessibility
        if (indicator) {
            indicator.setAttribute('aria-label', `Connection status: ${status}`);
            indicator.setAttribute('title', text?.textContent || status);
        }
    }

    /**
     * Show connection warning with user-friendly message
     * @param {string} type - Warning type
     * @param {string} message - Warning message
     * @param {Object} options - Display options
     */
    showConnectionWarning(type, message, options = {}) {
        const { autoHide = true, duration = 5000 } = options;
        
        // Create or update warning element
        let warningElement = document.getElementById('connection-warning');
        if (!warningElement) {
            warningElement = document.createElement('div');
            warningElement.id = 'connection-warning';
            warningElement.className = 'connection-warning';
            
            // Insert after connection status
            const statusElement = this.elements.connectionStatus;
            if (statusElement && statusElement.parentNode) {
                statusElement.parentNode.insertBefore(warningElement, statusElement.nextSibling);
            } else {
                // Fallback: add to header
                const header = document.querySelector('.waiting-room-header .header-content');
                if (header) {
                    header.appendChild(warningElement);
                }
            }
        }

        warningElement.className = `connection-warning ${type}`;
        warningElement.innerHTML = `
            <span class="warning-icon">⚠️</span>
            <span class="warning-text">${message}</span>
            <button class="warning-close" onclick="this.parentElement.style.display='none'">×</button>
        `;
        warningElement.style.display = 'flex';

        // Auto-hide if requested
        if (autoHide) {
            setTimeout(() => {
                if (warningElement && warningElement.parentNode) {
                    warningElement.style.display = 'none';
                }
            }, duration);
        }
    }

    /**
     * Hide connection warning
     */
    hideConnectionWarning() {
        const warningElement = document.getElementById('connection-warning');
        if (warningElement) {
            warningElement.style.display = 'none';
        }
    }

    /**
     * Show connection recovery options
     * @param {Object} options - Recovery options
     */
    showConnectionRecoveryOptions(options = {}) {
        const { 
            showRefresh = true, 
            showRetry = true, 
            showHttpFallback = false,
            onRefresh = () => window.location.reload(),
            onRetry = () => {},
            onHttpFallback = () => {}
        } = options;

        // Create recovery modal
        const recoveryModal = document.createElement('div');
        recoveryModal.id = 'connection-recovery-modal';
        recoveryModal.className = 'modal connection-recovery-modal';
        recoveryModal.innerHTML = `
            <div class="modal-overlay"></div>
            <div class="modal-content">
                <div class="modal-header">
                    <h3>Connection Issues</h3>
                </div>
                <div class="modal-body">
                    <p>We're having trouble maintaining a stable connection. You can:</p>
                    <div class="recovery-options">
                        ${showRefresh ? '<button id="recovery-refresh" class="btn btn-primary">Refresh Page</button>' : ''}
                        ${showRetry ? '<button id="recovery-retry" class="btn btn-secondary">Retry Connection</button>' : ''}
                        ${showHttpFallback ? '<button id="recovery-fallback" class="btn btn-secondary">Use Backup Mode</button>' : ''}
                    </div>
                    <p class="recovery-note">Your progress will be preserved.</p>
                </div>
            </div>
        `;

        // Add to page
        document.body.appendChild(recoveryModal);

        // Set up event listeners
        if (showRefresh) {
            document.getElementById('recovery-refresh')?.addEventListener('click', onRefresh);
        }
        if (showRetry) {
            document.getElementById('recovery-retry')?.addEventListener('click', () => {
                recoveryModal.remove();
                onRetry();
            });
        }
        if (showHttpFallback) {
            document.getElementById('recovery-fallback')?.addEventListener('click', () => {
                recoveryModal.remove();
                onHttpFallback();
            });
        }

        // Close on overlay click
        recoveryModal.querySelector('.modal-overlay')?.addEventListener('click', () => {
            recoveryModal.remove();
        });

        return recoveryModal;
    }

    /**
     * Show or hide host controls
     * @param {boolean} isHost - Whether current user is host
     * @param {boolean} canStart - Whether game can be started
     */
    showHostControls(isHost, canStart = false) {
        console.log('[WaitingRoomUI] showHostControls called:', { isHost, canStart });
        
        const hostControls = this.elements.hostControls;
        const startButton = this.elements.startGameBtn;
        
        console.log('[WaitingRoomUI] Host controls element:', hostControls);
        console.log('[WaitingRoomUI] Start button element:', startButton);
        
        if (hostControls) {
            if (isHost) {
                console.log('[WaitingRoomUI] Showing host controls (removing hidden class)');
                hostControls.classList.remove('hidden');
            } else {
                console.log('[WaitingRoomUI] Hiding host controls (adding hidden class)');
                hostControls.classList.add('hidden');
            }
            console.log('[WaitingRoomUI] Host controls classes after update:', hostControls.classList.toString());
        } else {
            console.error('[WaitingRoomUI] Host controls element not found!');
        }

        if (startButton) {
            startButton.disabled = !canStart;
            
            if (canStart) {
                startButton.classList.remove('btn-disabled');
            } else {
                startButton.classList.add('btn-disabled');
            }
            console.log('[WaitingRoomUI] Start button disabled:', startButton.disabled);
        } else {
            console.error('[WaitingRoomUI] Start button element not found!');
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
        const body = document.body;
        
        if (this.isMobile) {
            container?.classList.add('mobile-layout');
            body.classList.add('mobile-device');
            
            // Adjust player grid for mobile
            const playersGrid = this.elements.playersGrid;
            if (playersGrid) {
                playersGrid.style.gridTemplateColumns = '1fr';
            }
            
            // Enable mobile-specific features
            this.enableMobileFeatures();
        } else {
            container?.classList.remove('mobile-layout');
            body.classList.remove('mobile-device');
            
            // Reset player grid for desktop
            const playersGrid = this.elements.playersGrid;
            if (playersGrid) {
                playersGrid.style.gridTemplateColumns = '';
            }
            
            // Disable mobile-specific features
            this.disableMobileFeatures();
        }
        
        // Update touch targets regardless of device type
        this.updateTouchTargets();
    }

    /**
     * Handle orientation-specific layout adjustments
     */
    handleOrientationSpecificLayout() {
        if (!this.isMobile) return;

        const isLandscape = window.innerWidth > window.innerHeight;
        const container = document.querySelector('.waiting-room-container');
        
        if (isLandscape) {
            container?.classList.add('landscape-mode');
            container?.classList.remove('portrait-mode');
            
            // Adjust player grid for landscape
            const playersGrid = this.elements.playersGrid;
            if (playersGrid && window.innerWidth >= 640) {
                playersGrid.style.gridTemplateColumns = 'repeat(2, 1fr)';
            }
        } else {
            container?.classList.add('portrait-mode');
            container?.classList.remove('landscape-mode');
            
            // Single column for portrait
            const playersGrid = this.elements.playersGrid;
            if (playersGrid) {
                playersGrid.style.gridTemplateColumns = '1fr';
            }
        }
    }

    /**
     * Update touch targets for better mobile interaction
     */
    updateTouchTargets() {
        const touchElements = [
            this.elements.copyCodeBtn,
            this.elements.readyToggleBtn,
            this.elements.startGameBtn,
            document.getElementById('leave-room-btn'),
            document.getElementById('close-error-btn'),
            document.getElementById('error-ok-btn')
        ];

        touchElements.forEach(element => {
            if (element) {
                // Ensure minimum touch target size (44px x 44px)
                const computedStyle = window.getComputedStyle(element);
                const currentHeight = parseInt(computedStyle.height);
                const currentWidth = parseInt(computedStyle.width);
                
                if (currentHeight < 44) {
                    element.style.minHeight = '44px';
                }
                if (currentWidth < 44) {
                    element.style.minWidth = '44px';
                }
                
                // Add touch-friendly class
                element.classList.add('touch-target');
            }
        });

        // Update player slots for touch interaction
        Object.values(this.elements.playerSlots).forEach(slot => {
            if (slot) {
                slot.classList.add('touch-friendly');
            }
        });
    }

    /**
     * Enable mobile-specific features
     */
    enableMobileFeatures() {
        // Prevent zoom on input focus
        const viewport = document.querySelector('meta[name="viewport"]');
        if (viewport) {
            viewport.setAttribute('content', 
                'width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no'
            );
        }

        // Add mobile-specific event listeners
        this.addMobileEventListeners();
        
        // Enable swipe gestures for navigation
        this.enableSwipeGestures();
    }

    /**
     * Disable mobile-specific features
     */
    disableMobileFeatures() {
        // Re-enable zoom
        const viewport = document.querySelector('meta[name="viewport"]');
        if (viewport) {
            viewport.setAttribute('content', 'width=device-width, initial-scale=1.0');
        }

        // Remove mobile-specific event listeners
        this.removeMobileEventListeners();
        
        // Disable swipe gestures
        this.disableSwipeGestures();
    }

    /**
     * Add mobile-specific event listeners
     */
    addMobileEventListeners() {
        // Touch feedback for buttons
        const buttons = document.querySelectorAll('.btn, .copy-btn');
        buttons.forEach(button => {
            button.addEventListener('touchstart', this.handleTouchStart.bind(this), { passive: true });
            button.addEventListener('touchend', this.handleTouchEnd.bind(this), { passive: true });
        });

        // Prevent double-tap zoom on buttons
        buttons.forEach(button => {
            button.addEventListener('touchend', (e) => {
                e.preventDefault();
                button.click();
            });
        });
    }

    /**
     * Remove mobile-specific event listeners
     */
    removeMobileEventListeners() {
        const buttons = document.querySelectorAll('.btn, .copy-btn');
        buttons.forEach(button => {
            button.removeEventListener('touchstart', this.handleTouchStart);
            button.removeEventListener('touchend', this.handleTouchEnd);
        });
    }

    /**
     * Handle touch start for visual feedback
     */
    handleTouchStart(e) {
        e.currentTarget.classList.add('touch-active');
    }

    /**
     * Handle touch end for visual feedback
     */
    handleTouchEnd(e) {
        setTimeout(() => {
            e.currentTarget.classList.remove('touch-active');
        }, 150);
    }

    /**
     * Enable swipe gestures for navigation
     */
    enableSwipeGestures() {
        let startX = 0;
        let startY = 0;
        
        const handleTouchStart = (e) => {
            startX = e.touches[0].clientX;
            startY = e.touches[0].clientY;
        };
        
        const handleTouchEnd = (e) => {
            if (!startX || !startY) return;
            
            const endX = e.changedTouches[0].clientX;
            const endY = e.changedTouches[0].clientY;
            
            const diffX = startX - endX;
            const diffY = startY - endY;
            
            // Only trigger if horizontal swipe is dominant
            if (Math.abs(diffX) > Math.abs(diffY) && Math.abs(diffX) > 50) {
                if (diffX > 0) {
                    // Swipe left - could trigger leave room
                    this.handleSwipeLeft();
                } else {
                    // Swipe right - could trigger refresh
                    this.handleSwipeRight();
                }
            }
            
            startX = 0;
            startY = 0;
        };
        
        document.addEventListener('touchstart', handleTouchStart, { passive: true });
        document.addEventListener('touchend', handleTouchEnd, { passive: true });
        
        this.swipeStartHandler = handleTouchStart;
        this.swipeEndHandler = handleTouchEnd;
    }

    /**
     * Disable swipe gestures
     */
    disableSwipeGestures() {
        if (this.swipeStartHandler) {
            document.removeEventListener('touchstart', this.swipeStartHandler);
        }
        if (this.swipeEndHandler) {
            document.removeEventListener('touchend', this.swipeEndHandler);
        }
    }

    /**
     * Handle swipe left gesture
     */
    handleSwipeLeft() {
        // Optional: Show leave room confirmation
        console.log('[WaitingRoomUI] Swipe left detected');
    }

    /**
     * Handle swipe right gesture
     */
    handleSwipeRight() {
        // Optional: Refresh room data
        console.log('[WaitingRoomUI] Swipe right detected');
    }

    /**
     * Adjust for viewport changes (keyboard show/hide on mobile)
     */
    adjustForViewportChanges() {
        const viewportHeight = window.innerHeight;
        const documentHeight = document.documentElement.clientHeight;
        
        // Detect if virtual keyboard is likely open
        const keyboardOpen = viewportHeight < documentHeight * 0.75;
        
        const container = document.querySelector('.waiting-room-container');
        if (container) {
            if (keyboardOpen) {
                container.classList.add('keyboard-open');
            } else {
                container.classList.remove('keyboard-open');
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
        if (this.resizeHandler) {
            window.removeEventListener('resize', this.resizeHandler);
        }
        if (this.orientationHandler) {
            window.removeEventListener('orientationchange', this.orientationHandler);
            if (screen.orientation) {
                screen.orientation.removeEventListener('change', this.orientationHandler);
            }
        }
        if (this.viewportHandler) {
            window.removeEventListener('resize', this.viewportHandler);
        }
        
        // Remove mobile-specific event listeners
        this.removeMobileEventListeners();
        
        // Disable swipe gestures
        this.disableSwipeGestures();
        
        // Clear any timers or intervals
        this.clearMessages();
        this.hideLoading();
        this.hideError();
        
        // Remove added styles and elements
        const addedStyles = document.querySelectorAll('style[data-waiting-room]');
        addedStyles.forEach(style => style.remove());
        
        const skipLinks = document.querySelector('.skip-links');
        if (skipLinks) {
            skipLinks.remove();
        }
    }
}