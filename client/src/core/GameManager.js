/**
 * GameManager - Main orchestrator for the Contract Crown game
 * Coordinates all game modules and manages overall game flow
 */

import { GameState } from './GameState.js';
import { UIManager } from '../components/UIManager.js';
import { CardManager } from '../components/CardManager.js';
import { TrumpManager } from '../components/TrumpManager.js';
import { TrickManager } from '../components/TrickManager.js';
import { DemoGameManager } from './DemoGameManager.js';
import { WebSocketGameManager } from './WebSocketGameManager.js';
import { AuthManager } from './auth.js';

export class GameManager {
    constructor() {
        this.authManager = new AuthManager();
        this.gameState = new GameState();
        
        // Initialize managers
        this.uiManager = new UIManager(this.gameState);
        this.cardManager = new CardManager(this.gameState, this.uiManager);
        this.trumpManager = new TrumpManager(this.gameState, this.uiManager);
        this.trickManager = new TrickManager(this.gameState, this.uiManager);
        
        // Game mode managers (initialized based on mode)
        this.demoGameManager = null;
        this.webSocketGameManager = null;
        
        this.currentGameManager = null;
        this.isDemoMode = false;
    }

    /**
     * Initialize the game manager
     */
    async init() {
        try {
            // Check authentication
            if (!this.authManager.isAuthenticated()) {
                window.location.href = '/login.html';
                return;
            }

            // Check game mode
            const urlParams = new URLSearchParams(window.location.search);
            this.isDemoMode = urlParams.get('demo') === 'true';
            const gameId = urlParams.get('gameId') || urlParams.get('room');

            // Initialize UI
            this.setupEventListeners();
            this.uiManager.showLoading('Initializing game...');

            // Initialize appropriate game manager
            if (this.isDemoMode) {
                this.demoGameManager = new DemoGameManager(
                    this.gameState,
                    this.uiManager,
                    this.cardManager,
                    this.trumpManager,
                    this.trickManager
                );
                this.currentGameManager = this.demoGameManager;
                
                // Set up specific callbacks for demo mode
                this.cardManager.setCardPlayCallback((card) => this.demoGameManager.handleCardPlay(card));
                this.trumpManager.setTrumpDeclarationCallback((suit) => this.demoGameManager.handleTrumpDeclaration(suit));
                
                await this.demoGameManager.init(gameId);
            } else {
                this.webSocketGameManager = new WebSocketGameManager(
                    this.gameState,
                    this.uiManager,
                    this.cardManager,
                    this.trumpManager,
                    this.trickManager,
                    this.authManager
                );
                this.currentGameManager = this.webSocketGameManager;
                
                // Set up specific callbacks for multiplayer mode
                this.cardManager.setCardPlayCallback((card) => this.webSocketGameManager.handleCardPlay(card));
                this.trumpManager.setTrumpDeclarationCallback((suit) => this.webSocketGameManager.handleTrumpDeclaration(suit));
                
                await this.webSocketGameManager.init(gameId);
            }

            // Initial UI update
            this.uiManager.updateUI();

        } catch (error) {
            console.error('[GameManager] Failed to initialize:', error);
            this.uiManager.showError('Failed to initialize game. Please try again.');
        }
    }

    /**
     * Set up global event listeners
     */
    setupEventListeners() {
        // Leave game button (desktop)
        const leaveGameBtn = document.getElementById('leave-game-btn');
        if (leaveGameBtn) {
            leaveGameBtn.addEventListener('click', () => this.leaveGame());
        }

        // Mobile leave game button
        const mobileLeaveGameBtn = document.getElementById('mobile-leave-game-btn');
        if (mobileLeaveGameBtn) {
            mobileLeaveGameBtn.addEventListener('click', () => this.leaveGame());
        }

        // Error modal handlers
        const closeErrorBtn = document.getElementById('close-error-btn');
        const errorOkBtn = document.getElementById('error-ok-btn');
        
        if (closeErrorBtn) {
            closeErrorBtn.addEventListener('click', () => this.uiManager.hideError());
        }
        if (errorOkBtn) {
            errorOkBtn.addEventListener('click', () => this.uiManager.hideError());
        }

        // Delegate card and trump events to respective managers
        this.cardManager.setupEventListeners();
        this.trumpManager.setupEventListeners();
    }

    /**
     * Handle card play action
     * @param {Object} card - Card to play
     */
    async playCard(card) {
        if (!this.currentGameManager) {
            console.error('[GameManager] No active game manager');
            return;
        }

        try {
            await this.currentGameManager.playCard(card);
        } catch (error) {
            console.error('[GameManager] Error playing card:', error);
            this.uiManager.showError('Failed to play card. Please try again.');
        }
    }

    /**
     * Handle trump declaration
     * @param {string} suit - Trump suit to declare
     */
    async declareTrump(suit) {
        if (!this.currentGameManager) {
            console.error('[GameManager] No active game manager');
            return;
        }

        try {
            await this.currentGameManager.declareTrump(suit);
        } catch (error) {
            console.error('[GameManager] Error declaring trump:', error);
            this.uiManager.showError('Failed to declare trump. Please try again.');
        }
    }

    /**
     * Leave the current game
     */
    async leaveGame() {
        try {
            if (this.currentGameManager && this.currentGameManager.cleanup) {
                await this.currentGameManager.cleanup();
            }

            // Navigate back to appropriate page
            if (this.isDemoMode) {
                window.location.href = '/dashboard.html';
            } else {
                window.location.href = '/waiting-room.html';
            }
        } catch (error) {
            console.error('[GameManager] Error leaving game:', error);
            // Force navigation even if cleanup fails
            window.location.href = '/dashboard.html';
        }
    }

    /**
     * Get current game state
     * @returns {Object} Current game state
     */
    getGameState() {
        return this.gameState.getState();
    }

    /**
     * Update game state
     * @param {Object} updates - State updates to apply
     */
    updateGameState(updates) {
        this.gameState.updateState(updates);
        this.uiManager.updateUI();
    }

    /**
     * Cleanup resources
     */
    cleanup() {
        if (this.currentGameManager && this.currentGameManager.cleanup) {
            this.currentGameManager.cleanup();
        }
    }
}