/**
 * LoadingManager - Handles loading states and overlays
 */
export class LoadingManager {
    constructor(elements) {
        this.elements = elements;
    }

    /**
     * Show loading overlay
     */
    show(message = 'Loading...') {
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
    hide() {
        if (this.elements.loadingOverlay) {
            this.elements.loadingOverlay.classList.add('hidden');
        }
    }

    /**
     * Show start game loading state
     */
    showStartGame() {
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
    hideStartGame() {
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
     * Set button loading state
     */
    setButtonLoading(buttonElement, loading, originalText = 'Button') {
        if (!buttonElement) return;

        if (loading) {
            buttonElement.disabled = true;
            const buttonText = buttonElement.querySelector('.btn-text');
            if (buttonText) {
                buttonText.dataset.originalText = buttonText.textContent;
                buttonText.textContent = 'Loading...';
            }
        } else {
            buttonElement.disabled = false;
            const buttonText = buttonElement.querySelector('.btn-text');
            if (buttonText) {
                buttonText.textContent = buttonText.dataset.originalText || originalText;
            }
        }
    }
}