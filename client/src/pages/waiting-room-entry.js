/**
 * Waiting Room Entry Point - Simple initialization
 */
import { WaitingRoomController } from './WaitingRoomController.js';

// Initialize waiting room when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    const controller = new WaitingRoomController();
    
    // Expose for debugging
    window.waitingRoomController = controller;
    
    console.log('[WaitingRoom] Controller initialized');
});