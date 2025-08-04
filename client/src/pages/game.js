/**
 * Game Page - Contract Crown PWA
 * Entry point for the game page using modular GameManager
 */

import { GameManager } from '../core/GameManager.js';

class GamePageController {
    constructor() {
        this.gameManager = new GameManager();
        this.init();
    }

    async init() {
        try {
            await this.gameManager.init();
        } catch (error) {
            console.error('[Game] Failed to initialize:', error);
        }
    }

    /**
     * Cleanup when leaving the page
     */
    cleanup() {
        if (this.gameManager) {
            this.gameManager.cleanup();
        }
    }
}

// Initialize game when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    window.gamePageController = new GamePageController();
});

// Cleanup on page unload
window.addEventListener('beforeunload', () => {
    if (window.gamePageController) {
        window.gamePageController.cleanup();
    }
});