/**
 * ModalManager - Handles modal dialogs and error displays
 */
export class ModalManager {
    constructor(elements) {
        this.elements = elements;
        this.lastFocusedElement = null;
        this.setupEventListeners();
    }

    /**
     * Setup modal event listeners
     */
    setupEventListeners() {
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

        if (this.elements.errorModal) {
            this.elements.errorModal.addEventListener('click', (e) => {
                if (e.target.classList.contains('modal-overlay')) {
                    this.hideError();
                }
            });
        }
    }

    /**
     * Display error message
     */
    showError(message) {
        this.lastFocusedElement = document.activeElement;
        
        if (this.elements.errorMessage) {
            this.elements.errorMessage.textContent = message;
        }
        
        if (this.elements.errorModal) {
            this.elements.errorModal.classList.remove('hidden');
        }

        setTimeout(() => {
            const firstButton = this.elements.errorModal?.querySelector('button');
            firstButton?.focus();
        }, 100);
    }

    /**
     * Hide error modal
     */
    hideError() {
        if (this.elements.errorModal) {
            this.elements.errorModal.classList.add('hidden');
        }

        if (this.lastFocusedElement) {
            this.lastFocusedElement.focus();
            this.lastFocusedElement = null;
        }
    }

    /**
     * Show recovery options modal
     */
    showRecoveryOptions(options = {}) {
        const { 
            showRefresh = true, 
            showRetry = true, 
            showHttpFallback = false,
            onRefresh = () => window.location.reload(),
            onRetry = () => {},
            onHttpFallback = () => {}
        } = options;

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

        document.body.appendChild(recoveryModal);

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

        recoveryModal.querySelector('.modal-overlay')?.addEventListener('click', () => {
            recoveryModal.remove();
        });

        return recoveryModal;
    }
}