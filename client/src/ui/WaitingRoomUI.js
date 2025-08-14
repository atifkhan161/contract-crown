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
        
        // Ready status elements (now in host controls)
        this.elements.readyCount = document.getElementById('ready-count');
        this.elements.totalPlayers = document.getElementById('total-players');
        this.elements.readyStatus = document.querySelector('.ready-status');
        this.elements.gameRequirements = document.getElementById('game-requirements');
        
        // Team management elements
        this.elements.teamASlots = document.getElementById('team-a-slots');
        this.elements.teamBSlots = document.getElementById('team-b-slots');
        this.elements.teamACount = document.getElementById('team-a-count');
        this.elements.teamBCount = document.getElementById('team-b-count');
        this.elements.addBotsBtn = document.getElementById('add-bots-btn');
        this.elements.botCountDisplay = document.getElementById('bot-count-display');
        
        // Host control elements
        this.elements.hostControls = document.getElementById('host-controls');
        this.elements.startGameBtn = document.getElementById('start-game-btn');
        this.elements.startSpinner = document.getElementById('start-spinner');
        this.elements.resetToWaitingBtn = document.getElementById('reset-to-waiting-btn');
        this.elements.resetSpinner = document.getElementById('reset-spinner');
        
        // Debug logging for host controls
        console.log('[WaitingRoomUI] Host controls element found:', !!this.elements.hostControls);
        console.log('[WaitingRoomUI] Start game button found:', !!this.elements.startGameBtn);
        if (this.elements.hostControls) {
            console.log('[WaitingRoomUI] Initial host controls classes:', this.elements.hostControls.classList.toString());
        }
        
        // Message elements (now using toast system)
        // this.elements.gameMessages = document.getElementById('game-messages'); // Removed - using toasts now
        
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
                    // Focus on current player's ready button if available
                    const currentPlayerReadyBtn = document.querySelector('.player-slot.occupied .ready-btn:not(.hidden)');
                    currentPlayerReadyBtn?.click();
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

        // Focus start game button as default action
        this.elements.startGameBtn?.focus();
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

        // Set up drag and drop for team management
        this.setupDragAndDrop();

        // Set up ready button handlers
        this.setupReadyButtonHandlers();

        // Set up bot management
        this.setupBotManagement();
    }

    /**
     * Update player slots with current room data
     * @param {Array} players - Array of player objects
     * @param {string} currentUserId - Current user's ID
     */
    updatePlayerSlots(players, currentUserId = null) {
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
                this.populatePlayerSlot(slot, player, currentUserId);
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
        if (!slot) return;
        
        slot.classList.remove('occupied', 'ready', 'bot-player');
        slot.setAttribute('draggable', 'false');
        slot.removeAttribute('data-player-id');
        
        const nameElement = slot.querySelector('.player-name');
        const readyText = slot.querySelector('.ready-text');
        const readyIndicator = slot.querySelector('.ready-indicator');
        const hostBadge = slot.querySelector('.host-badge');
        const avatarPlaceholder = slot.querySelector('.avatar-placeholder');
        const readyBtn = slot.querySelector('.ready-btn');
        
        if (nameElement) nameElement.textContent = 'Waiting for player...';
        if (readyText) readyText.textContent = 'Not Ready';
        if (readyIndicator) readyIndicator.style.background = '';
        if (hostBadge) hostBadge.classList.add('hidden');
        if (avatarPlaceholder) {
            avatarPlaceholder.textContent = position;
            avatarPlaceholder.style.fontSize = '';
        }
        if (readyBtn) {
            readyBtn.classList.add('hidden');
            readyBtn.classList.remove('ready');
        }
    }

    /**
     * Populate a player slot with player data
     * @param {HTMLElement} slot - The slot element
     * @param {Object} player - Player data object
     * @param {string} currentUserId - Current user's ID
     */
    populatePlayerSlot(slot, player, currentUserId = null) {
        if (!slot || !player) return;
        
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

        // Make slot draggable for team assignment
        if (!player.isBot) {
            slot.setAttribute('draggable', 'true');
            slot.dataset.playerId = player.id || player.user_id;
        }

        const nameElement = slot.querySelector('.player-name');
        const readyText = slot.querySelector('.ready-text');
        const hostBadge = slot.querySelector('.host-badge');
        const avatarPlaceholder = slot.querySelector('.avatar-placeholder');
        const readyBtn = slot.querySelector('.ready-btn');
        
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

        // Handle ready button - only show for current user
        if (readyBtn && !player.isBot) {
            const isCurrentUser = currentUserId && (player.id === currentUserId || player.user_id === currentUserId);
            
            if (isCurrentUser) {
                readyBtn.classList.remove('hidden');
                readyBtn.classList.toggle('ready', player.isReady);
                const btnText = readyBtn.querySelector('.ready-btn-text');
                if (btnText) {
                    btnText.textContent = player.isReady ? 'Ready' : 'Ready';
                }
            } else {
                readyBtn.classList.add('hidden');
            }
        }
    }

    /**
     * Update ready status display
     * @param {number} readyCount - Number of ready players
     * @param {number} totalCount - Total number of connected players
     * @param {number} humanCount - Number of human players
     */
    updateReadyStatus(readyCount, totalCount, humanCount = 0) {
        if (this.elements.readyCount) {
            this.elements.readyCount.textContent = readyCount;
        }

        if (this.elements.totalPlayers) {
            this.elements.totalPlayers.textContent = totalCount;
        }

        // Update ready status text with enhanced information
        const readyStatusElement = this.elements.readyStatus;
        if (readyStatusElement) {
            let statusClass = 'ready-status';

            // Add visual feedback based on ready state
            if (readyCount === totalCount && totalCount >= 2) {
                statusClass += ' all-ready';
            } else if (readyCount > 0) {
                statusClass += ' some-ready';
            } else {
                statusClass += ' none-ready';
            }

            readyStatusElement.className = statusClass;
        }

        // Update game requirements
        const requirementsElement = this.elements.gameRequirements;
        if (requirementsElement) {
            const requirementText = requirementsElement.querySelector('.requirement-text');
            if (requirementText) {
                if (humanCount >= 2) {
                    requirementText.textContent = `✓ ${humanCount} human players ready to start`;
                    requirementText.className = 'requirement-text met';
                } else {
                    requirementText.textContent = `Need at least 2 human players to start (${humanCount}/2)`;
                    requirementText.className = 'requirement-text not-met';
                }
            }
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
     * Set up drag and drop functionality for team management
     */
    setupDragAndDrop() {
        // Set up drag events for player slots
        Object.values(this.elements.playerSlots).forEach(slot => {
            slot.addEventListener('dragstart', (e) => {
                if (slot.classList.contains('occupied') && slot.getAttribute('draggable') === 'true') {
                    e.dataTransfer.setData('text/plain', slot.dataset.playerId);
                    e.dataTransfer.effectAllowed = 'move';
                    slot.classList.add('dragging');
                }
            });

            slot.addEventListener('dragend', (e) => {
                slot.classList.remove('dragging');
            });
        });

        // Set up drop events for team slots
        const teamSlots = document.querySelectorAll('.team-slot');
        teamSlots.forEach(slot => {
            slot.addEventListener('dragover', (e) => {
                e.preventDefault();
                e.dataTransfer.dropEffect = 'move';
                slot.classList.add('drag-over');
            });

            slot.addEventListener('dragleave', (e) => {
                slot.classList.remove('drag-over');
            });

            slot.addEventListener('drop', (e) => {
                e.preventDefault();
                slot.classList.remove('drag-over');
                
                const playerId = e.dataTransfer.getData('text/plain');
                const team = slot.closest('.team-slots').dataset.team;
                const slotId = slot.dataset.slot;
                
                if (playerId && team) {
                    this.assignPlayerToTeam(playerId, team, slotId);
                }
            });
        });
    }

    /**
     * Set up ready button handlers for player slots
     */
    setupReadyButtonHandlers() {
        document.addEventListener('click', (e) => {
            if (e.target.classList.contains('ready-btn') || e.target.closest('.ready-btn')) {
                const readyBtn = e.target.classList.contains('ready-btn') ? e.target : e.target.closest('.ready-btn');
                const slotNumber = readyBtn.dataset.slot;
                
                if (slotNumber && this.onReadyToggle) {
                    this.onReadyToggle(slotNumber);
                }
            }
        });
    }

    /**
     * Set up bot management functionality
     */
    setupBotManagement() {
        if (this.elements.addBotsBtn) {
            this.elements.addBotsBtn.addEventListener('click', () => {
                if (this.onAddBots) {
                    this.onAddBots();
                }
            });
        }
    }

    /**
     * Assign player to team
     * @param {string} playerId - Player ID
     * @param {string} team - Team (A or B)
     * @param {string} slotId - Team slot ID
     */
    assignPlayerToTeam(playerId, team, slotId) {
        if (this.onTeamAssignment) {
            this.onTeamAssignment(playerId, team, slotId);
        }
    }

    /**
     * Update team displays
     * @param {Object} teams - Team assignments
     */
    updateTeamDisplay(teams) {
        // Clear team slots
        const teamASlots = document.querySelectorAll('#team-a-slots .team-slot');
        const teamBSlots = document.querySelectorAll('#team-b-slots .team-slot');
        
        [...teamASlots, ...teamBSlots].forEach(slot => {
            slot.classList.remove('occupied');
            slot.innerHTML = '<div class="slot-placeholder">Drop player here</div>';
        });

        // Populate team A
        let teamACount = 0;
        if (teams.A) {
            teams.A.forEach((player, index) => {
                const slot = teamASlots[index];
                if (slot && player) {
                    this.populateTeamSlot(slot, player);
                    teamACount++;
                }
            });
        }

        // Populate team B
        let teamBCount = 0;
        if (teams.B) {
            teams.B.forEach((player, index) => {
                const slot = teamBSlots[index];
                if (slot && player) {
                    this.populateTeamSlot(slot, player);
                    teamBCount++;
                }
            });
        }

        // Update team counts
        if (this.elements.teamACount) {
            this.elements.teamACount.textContent = `${teamACount}/2`;
        }
        if (this.elements.teamBCount) {
            this.elements.teamBCount.textContent = `${teamBCount}/2`;
        }
    }

    /**
     * Populate a team slot with player data
     * @param {HTMLElement} slot - Team slot element
     * @param {Object} player - Player data
     */
    populateTeamSlot(slot, player) {
        if (!slot || !player) return;
        
        slot.classList.add('occupied');
        
        const displayName = player.isBot ? `🤖 ${player.username}` : player.username;
        const readyStatus = player.isReady ? '✓' : '○';
        
        slot.innerHTML = `
            <div class="team-player-info">
                <div class="team-player-name">${displayName}</div>
                <div class="team-player-status">${readyStatus}</div>
            </div>
        `;
    }

    /**
     * Update bot count display
     * @param {number} botCount - Number of bots
     */
    updateBotCount(botCount) {
        if (this.elements.botCountDisplay) {
            this.elements.botCountDisplay.textContent = `(${botCount})`;
        }
        
        if (this.elements.addBotsBtn) {
            const btnText = this.elements.addBotsBtn.querySelector('.btn-text');
            if (btnText) {
                btnText.textContent = botCount > 0 ? 'Remove Bots' : 'Add Bots';
            }
        }
    }

    /**
     * Set callback for ready toggle
     * @param {Function} callback - Ready toggle callback
     */
    setReadyToggleCallback(callback) {
        this.onReadyToggle = callback;
    }

    /**
     * Set callback for team assignment
     * @param {Function} callback - Team assignment callback
     */
    setTeamAssignmentCallback(callback) {
        this.onTeamAssignment = callback;
    }

    /**
     * Set callback for adding bots
     * @param {Function} callback - Add bots callback
     */
    setAddBotsCallback(callback) {
        this.onAddBots = callback;
    }

    /**
     * Show or hide host controls
     * @param {boolean} isHost - Whether current user is host
     * @param {boolean} canStart - Whether game can be started
     */
    showHostControls(isHost, canStart = false, roomStatus = 'waiting') {
        console.log('[WaitingRoomUI] showHostControls called:', { isHost, canStart, roomStatus });
        
        const hostControls = this.elements.hostControls;
        const startButton = this.elements.startGameBtn;
        const resetButton = this.elements.resetToWaitingBtn;
        
        console.log('[WaitingRoomUI] Host controls element:', hostControls);
        console.log('[WaitingRoomUI] Start button element:', startButton);
        console.log('[WaitingRoomUI] Reset button element:', resetButton);
        
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

        // Show/hide bot management based on host status
        const botManagement = document.getElementById('bot-management');
        if (botManagement) {
            if (isHost) {
                botManagement.classList.remove('hidden');
            } else {
                botManagement.classList.add('hidden');
            }
        }

        // Handle start game button
        if (startButton) {
            const shouldShowStartButton = roomStatus === 'waiting';
            const shouldEnableStartButton = shouldShowStartButton && canStart;
            
            startButton.disabled = !shouldEnableStartButton;
            
            if (shouldShowStartButton) {
                startButton.classList.remove('hidden');
                if (shouldEnableStartButton) {
                    startButton.classList.remove('btn-disabled');
                } else {
                    startButton.classList.add('btn-disabled');
                }
            } else {
                startButton.classList.add('hidden');
            }
            
            console.log('[WaitingRoomUI] Start button - show:', shouldShowStartButton, 'enabled:', shouldEnableStartButton);
        } else {
            console.error('[WaitingRoomUI] Start button element not found!');
        }

        // Handle reset to waiting button
        if (resetButton) {
            const shouldShowResetButton = roomStatus === 'playing';
            
            if (shouldShowResetButton) {
                resetButton.classList.remove('hidden');
            } else {
                resetButton.classList.add('hidden');
            }
            
            console.log('[WaitingRoomUI] Reset button - show:', shouldShowResetButton);
        } else {
            console.error('[WaitingRoomUI] Reset button element not found!');
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
     * Add message (deprecated - use toast system instead)
     * @deprecated Use showToast() instead
     */
    addMessage(message, type = 'system') {
        console.warn('[WaitingRoomUI] addMessage is deprecated, use showToast instead');
        this.showToast(message, type, { compact: true });
    }

    /**
     * Clear all messages (deprecated - use clearToasts instead)
     * @deprecated Use clearToasts() instead
     */
    clearMessages() {
        console.warn('[WaitingRoomUI] clearMessages is deprecated, use clearToasts instead');
        this.clearToasts();
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
            this.showToast('No room code to copy', 'error', { compact: true });
            return;
        }

        try {
            await navigator.clipboard.writeText(roomCode);
            this.showRoomCodeCopiedToast();
            
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
            this.showToast('Failed to copy room code', 'error', { compact: true });
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
        if (e.currentTarget && e.currentTarget.classList) {
            e.currentTarget.classList.add('touch-active');
        }
    }

    /**
     * Handle touch end for visual feedback
     */
    handleTouchEnd(e) {
        setTimeout(() => {
            if (e.currentTarget && e.currentTarget.classList) {
                e.currentTarget.classList.remove('touch-active');
            }
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
     * Show a toast message
     * @param {string} message - The message to display
     * @param {string} type - The type of toast (info, success, warning, error, system)
     * @param {Object} options - Additional options
     */
    showToast(message, type = 'info', options = {}) {
        const {
            duration = 3000,
            icon = null,
            compact = false,
            className = ''
        } = options;

        // Get or create toast container
        let toastContainer = document.getElementById('toast-container');
        if (!toastContainer) {
            toastContainer = document.createElement('div');
            toastContainer.id = 'toast-container';
            toastContainer.className = 'toast-container';
            toastContainer.setAttribute('aria-live', 'polite');
            toastContainer.setAttribute('aria-atomic', 'false');
            document.body.appendChild(toastContainer);
        }

        // Create toast element
        const toast = document.createElement('div');
        toast.className = `toast-message ${type} ${compact ? 'compact' : ''} ${icon ? 'with-icon' : ''} ${className}`;
        toast.setAttribute('role', type === 'error' ? 'alert' : 'status');
        toast.setAttribute('aria-live', type === 'error' ? 'assertive' : 'polite');

        // Set toast content
        if (icon) {
            toast.innerHTML = `
                <span class="toast-icon" aria-hidden="true">${icon}</span>
                <span class="toast-text">${message}</span>
            `;
        } else {
            toast.textContent = message;
        }

        // Add toast to container
        toastContainer.appendChild(toast);

        // Trigger show animation
        setTimeout(() => {
            toast.classList.add('show');
        }, 10);

        // Auto-remove toast after duration
        const removeToast = () => {
            toast.classList.add('hide');
            setTimeout(() => {
                if (toast.parentNode) {
                    toast.parentNode.removeChild(toast);
                }
            }, 300);
        };

        setTimeout(removeToast, duration);

        // Allow manual dismissal on click (for touch devices)
        toast.addEventListener('click', removeToast);

        return toast;
    }

    /**
     * Show player joined toast
     * @param {string} playerName - Name of the player who joined
     */
    showPlayerJoinedToast(playerName) {
        this.showToast(`${playerName} joined the room`, 'player-joined', {
            icon: '👋',
            duration: 2500
        });
    }

    /**
     * Show player left toast
     * @param {string} playerName - Name of the player who left
     */
    showPlayerLeftToast(playerName) {
        this.showToast(`${playerName} left the room`, 'player-left', {
            icon: '👋',
            duration: 2500
        });
    }

    /**
     * Show player ready status toast
     * @param {string} playerName - Name of the player
     * @param {boolean} isReady - Whether the player is ready
     */
    showPlayerReadyToast(playerName, isReady) {
        const message = isReady ? `${playerName} is ready` : `${playerName} is not ready`;
        const icon = isReady ? '✅' : '⏳';
        this.showToast(message, 'player-ready', {
            icon,
            duration: 2000,
            compact: true
        });
    }

    /**
     * Show host transfer toast
     * @param {string} newHostName - Name of the new host
     */
    showHostTransferToast(newHostName) {
        this.showToast(`${newHostName} is now the host`, 'host-transfer', {
            icon: '👑',
            duration: 3000
        });
    }

    /**
     * Show connection status toast
     * @param {string} status - Connection status (connected, disconnected, reconnecting)
     */
    showConnectionToast(status) {
        const messages = {
            connected: { text: 'Connected to server', icon: '🟢', type: 'connection-restored' },
            disconnected: { text: 'Connection lost', icon: '🔴', type: 'connection-lost' },
            reconnecting: { text: 'Reconnecting...', icon: '🟡', type: 'warning' }
        };

        const config = messages[status];
        if (config) {
            this.showToast(config.text, config.type, {
                icon: config.icon,
                duration: status === 'reconnecting' ? 5000 : 3000
            });
        }
    }

    /**
     * Show room code copied toast
     */
    showRoomCodeCopiedToast() {
        this.showToast('Room code copied to clipboard', 'success', {
            icon: '📋',
            duration: 2000,
            compact: true
        });
    }

    /**
     * Show game starting toast
     */
    showGameStartingToast() {
        this.showToast('Game is starting...', 'info', {
            icon: '🎮',
            duration: 3000
        });
    }

    /**
     * Clear all toast messages
     */
    clearToasts() {
        const toastContainer = document.getElementById('toast-container');
        if (toastContainer) {
            toastContainer.innerHTML = '';
        }
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
        this.clearToasts();
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