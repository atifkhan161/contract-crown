/**
 * AccessibilityManager - Handles accessibility features and keyboard navigation
 */
export class AccessibilityManager {
    constructor(elements) {
        this.elements = elements;
        this.lastFocusedElement = null;
        this.initialize();
    }

    initialize() {
        this.setupAriaLabels();
        this.addScreenReaderContent();
        this.setupKeyboardNavigation();
        this.setupFocusManagement();
        this.addSkipLinks();
    }

    setupAriaLabels() {
        this.elements.copyCodeBtn?.setAttribute('aria-label', 'Copy room code to clipboard');
        this.elements.startGameBtn?.setAttribute('aria-label', 'Start game for all players');
    }

    setupKeyboardNavigation() {
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

        Object.values(this.elements.playerSlots).forEach((slot, index) => {
            if (slot) {
                slot.addEventListener('keydown', (e) => {
                    this.handlePlayerSlotKeydown(e, index + 1);
                });
            }
        });

        document.addEventListener('keydown', (e) => {
            this.handleGlobalKeydown(e);
        });
    }

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

    handleGlobalKeydown(e) {
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
                this.handleEscapeKey();
                break;
        }
    }

    focusNextPlayerSlot(currentSlot) {
        const nextSlot = currentSlot < 4 ? currentSlot + 1 : 1;
        this.focusPlayerSlot(nextSlot);
    }

    focusPreviousPlayerSlot(currentSlot) {
        const prevSlot = currentSlot > 1 ? currentSlot - 1 : 4;
        this.focusPlayerSlot(prevSlot);
    }

    focusPlayerSlot(slotNumber) {
        const slot = this.elements.playerSlots[slotNumber];
        if (slot) {
            slot.focus();
        }
    }

    handleEscapeKey() {
        if (!this.elements.errorModal?.classList.contains('hidden')) {
            return;
        }
        this.elements.startGameBtn?.focus();
    }

    setupFocusManagement() {
        this.setupModalFocusTrap();
        this.setupFocusIndicators();
    }

    setupModalFocusTrap() {
        const modal = this.elements.errorModal;
        if (!modal) return;

        modal.addEventListener('keydown', (e) => {
            if (e.key === 'Tab') {
                this.trapFocusInModal(e, modal);
            }
        });
    }

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

    setupFocusIndicators() {
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

        document.addEventListener('keydown', () => {
            document.body.classList.add('keyboard-user');
        });

        document.addEventListener('mousedown', () => {
            document.body.classList.remove('keyboard-user');
        });
    }

    addScreenReaderContent() {
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

        const shortcutHints = document.createElement('div');
        shortcutHints.className = 'sr-only';
        shortcutHints.innerHTML = `
            <p>Keyboard shortcuts: Press R to toggle ready, S to start game (if host), C to copy room code, Escape to close dialogs</p>
            <p>Use arrow keys to navigate between player slots</p>
        `;
        document.body.appendChild(shortcutHints);
    }

    addSkipLinks() {
        const skipLinks = document.createElement('div');
        skipLinks.className = 'skip-links';
        skipLinks.innerHTML = `
            <a href="#players-heading" class="skip-link">Skip to players</a>
            <a href="#ready-toggle-btn" class="skip-link">Skip to ready controls</a>
        `;

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
}