/**
 * EventHandlerManager - Handles common event listeners and interactions
 */
export class EventHandlerManager {
    constructor(elements, callbacks = {}) {
        this.elements = elements;
        this.callbacks = callbacks;
        this.setupEventListeners();
    }

    /**
     * Setup common event listeners
     */
    setupEventListeners() {
        // Copy room code functionality
        if (this.elements.copyCodeBtn) {
            this.elements.copyCodeBtn.addEventListener('click', () => {
                if (this.callbacks.onCopyRoomCode) {
                    this.callbacks.onCopyRoomCode();
                }
            });
        }

        // Ready button handlers
        document.addEventListener('click', (e) => {
            if (e.target.classList.contains('ready-btn') || e.target.closest('.ready-btn')) {
                const readyBtn = e.target.classList.contains('ready-btn') ? e.target : e.target.closest('.ready-btn');
                const slotNumber = readyBtn.dataset.slot;
                
                console.log('[EventHandlerManager] Ready button clicked:', { slotNumber, hasCallback: !!this.callbacks.onReadyToggle });
                
                if (slotNumber && this.callbacks.onReadyToggle) {
                    e.preventDefault();
                    e.stopPropagation();
                    this.callbacks.onReadyToggle(slotNumber);
                } else {
                    console.warn('[EventHandlerManager] Missing slot number or callback:', { slotNumber, callbacks: this.callbacks });
                }
            }
        });

        // Start game button
        if (this.elements.startGameBtn) {
            this.elements.startGameBtn.addEventListener('click', (e) => {
                console.log('[EventHandlerManager] Start game button clicked');
                e.preventDefault();
                if (this.callbacks.onStartGame) {
                    this.callbacks.onStartGame();
                } else {
                    console.warn('[EventHandlerManager] No onStartGame callback set');
                }
            });
        }

        // Leave room button
        if (this.elements.leaveRoomBtn) {
            this.elements.leaveRoomBtn.addEventListener('click', () => {
                if (this.callbacks.onLeaveRoom) {
                    this.callbacks.onLeaveRoom();
                }
            });
        }

        // Bot management
        const addBotsBtn = document.getElementById('add-bots-btn');
        if (addBotsBtn) {
            addBotsBtn.addEventListener('click', (e) => {
                console.log('[EventHandlerManager] Add bots button clicked');
                e.preventDefault();
                if (this.callbacks.onAddBots) {
                    this.callbacks.onAddBots();
                } else {
                    console.warn('[EventHandlerManager] No onAddBots callback set');
                }
            });
        }

        // Keyboard shortcuts
        document.addEventListener('keydown', (e) => {
            this.handleKeyboardShortcuts(e);
        });
    }

    /**
     * Handle keyboard shortcuts
     */
    handleKeyboardShortcuts(e) {
        if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') {
            return;
        }

        switch (e.key) {
            case 'r':
            case 'R':
                if (!e.ctrlKey && !e.metaKey) {
                    e.preventDefault();
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
                if (this.callbacks.onEscape) {
                    this.callbacks.onEscape();
                }
                break;
        }
    }

    /**
     * Set callback functions
     */
    setCallbacks(callbacks) {
        this.callbacks = { ...this.callbacks, ...callbacks };
    }
}