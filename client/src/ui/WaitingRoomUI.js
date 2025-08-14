/**
 * WaitingRoomUI - Lightweight wrapper for backward compatibility
 */
import { WaitingRoomOrchestrator } from './WaitingRoomOrchestrator.js';

export class WaitingRoomUI extends WaitingRoomOrchestrator {
    constructor() {
        super();
        this.currentTheme = 'default';
        this.isMobile = this.responsiveManager.isMobile;
    }
}