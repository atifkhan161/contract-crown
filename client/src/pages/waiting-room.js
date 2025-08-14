/**
 * Waiting Room - Lightweight wrapper for backward compatibility
 */
import { WaitingRoomController } from './WaitingRoomController.js';

class WaitingRoomManager extends WaitingRoomController {
    constructor() {
        super();
    }
}

// Initialize waiting room when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    const manager = new WaitingRoomManager();
    
    // Expose for debugging
    window.waitingRoomManager = manager;
    
    console.log('[WaitingRoom] Manager initialized and exposed globally');
});