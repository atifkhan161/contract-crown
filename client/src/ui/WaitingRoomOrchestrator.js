/**
 * WaitingRoomOrchestrator - Simple orchestrator for UI components
 */
import {
    ConnectionStatusManager,
    PlayerSlotManager,
    ToastManager,
    LoadingManager,
    ModalManager,
    EventHandlerManager,
    TeamManager
} from './components/index.js';
import { AccessibilityManager } from './components/AccessibilityManager.js';
import { ResponsiveLayoutManager } from './components/ResponsiveLayoutManager.js';

export class WaitingRoomOrchestrator {
    constructor() {
        this.elements = this.initializeElements();
        this.initializeComponents();
    }

    initializeElements() {
        return {
            roomCode: document.getElementById('room-code'),
            copyCodeBtn: document.getElementById('copy-code-btn'),
            connectionStatus: document.getElementById('connection-status'),
            statusIndicator: document.getElementById('status-indicator'),
            statusText: document.getElementById('status-text'),
            currentPlayers: document.getElementById('current-players'),
            playersGrid: document.querySelector('.players-grid'),
            playerSlots: {
                1: document.getElementById('player-slot-1'),
                2: document.getElementById('player-slot-2'),
                3: document.getElementById('player-slot-3'),
                4: document.getElementById('player-slot-4')
            },
            readyCount: document.getElementById('ready-count'),
            totalPlayers: document.getElementById('total-players'),
            readyStatus: document.querySelector('.ready-status'),
            gameRequirements: document.getElementById('game-requirements'),
            hostControls: document.getElementById('host-controls'),
            startGameBtn: document.getElementById('start-game-btn'),
            startSpinner: document.getElementById('start-spinner'),
            resetToWaitingBtn: document.getElementById('reset-to-waiting-btn'),
            resetSpinner: document.getElementById('reset-spinner'),
            loadingOverlay: document.getElementById('loading-overlay'),
            loadingText: document.getElementById('loading-text'),
            errorModal: document.getElementById('error-modal'),
            errorMessage: document.getElementById('error-message'),
            closeErrorBtn: document.getElementById('close-error-btn'),
            errorOkBtn: document.getElementById('error-ok-btn'),
            botCountDisplay: document.getElementById('bot-count-display')
        };
    }

    initializeComponents() {
        this.connectionManager = new ConnectionStatusManager(this.elements);
        this.playerSlotManager = new PlayerSlotManager(this.elements);
        this.toastManager = new ToastManager();
        this.loadingManager = new LoadingManager(this.elements);
        this.modalManager = new ModalManager(this.elements);
        this.teamManager = new TeamManager();
        this.accessibilityManager = new AccessibilityManager(this.elements);
        this.responsiveManager = new ResponsiveLayoutManager(this.elements);
        this.eventHandler = new EventHandlerManager(this.elements, {
            onCopyRoomCode: () => this.copyRoomCode(),
            onReadyToggle: (slotNumber) => this.onReadyToggle && this.onReadyToggle(slotNumber),
            onAddBots: () => this.onAddBots && this.onAddBots(),
            onStartGame: () => this.onStartGame && this.onStartGame()
        });
    }

    // Delegate methods to appropriate components
    updatePlayerSlots(players, currentUserId) {
        this.playerSlotManager.updateSlots(players, currentUserId);
        if (this.responsiveManager.isMobile) {
            this.responsiveManager.updateMobileLayout();
        }
    }

    updateReadyStatus(readyCount, totalCount, humanCount) {
        this.playerSlotManager.updateReadyStatus(readyCount, totalCount, humanCount);
    }

    updateConnectionStatus(status, details) {
        this.connectionManager.updateStatus(status, details);
    }

    showConnectionWarning(type, message, options) {
        this.connectionManager.showWarning(type, message, options);
    }

    hideConnectionWarning() {
        this.connectionManager.hideWarning();
    }

    showConnectionRecoveryOptions(options) {
        return this.modalManager.showRecoveryOptions(options);
    }

    updateTeamDisplay(teams) {
        this.teamManager.updateDisplay(teams);
    }

    updateBotCount(botCount) {
        if (this.elements.botCountDisplay) {
            this.elements.botCountDisplay.textContent = `(${botCount})`;
        }
    }

    showHostControls(isHost, canStart, roomStatus) {
        const hostControls = this.elements.hostControls;
        const startButton = this.elements.startGameBtn;
        const resetButton = this.elements.resetToWaitingBtn;
        
        if (hostControls) {
            hostControls.classList.toggle('hidden', !isHost);
        }

        const botManagement = document.getElementById('bot-management');
        if (botManagement) {
            botManagement.classList.toggle('hidden', !isHost);
        }

        if (startButton) {
            const shouldShowStartButton = roomStatus === 'waiting';
            const shouldEnableStartButton = shouldShowStartButton && canStart;
            
            startButton.disabled = !shouldEnableStartButton;
            startButton.classList.toggle('hidden', !shouldShowStartButton);
            startButton.classList.toggle('btn-disabled', !shouldEnableStartButton);
        }

        if (resetButton) {
            const shouldShowResetButton = roomStatus === 'playing';
            resetButton.classList.toggle('hidden', !shouldShowResetButton);
        }
    }

    showLoading(message) {
        this.loadingManager.show(message);
    }

    hideLoading() {
        this.loadingManager.hide();
    }

    showStartGameLoading() {
        this.loadingManager.showStartGame();
    }

    hideStartGameLoading() {
        this.loadingManager.hideStartGame();
    }

    displayError(message) {
        this.modalManager.showError(message);
    }

    hideError() {
        this.modalManager.hideError();
    }

    setRoomCode(roomCode) {
        if (this.elements.roomCode) {
            this.elements.roomCode.textContent = roomCode || '------';
        }
    }

    async copyRoomCode() {
        const roomCode = this.elements.roomCode?.textContent;
        
        if (!roomCode || roomCode === '------') {
            this.showToast('No room code to copy', 'error', { compact: true });
            return;
        }

        try {
            await navigator.clipboard.writeText(roomCode);
            this.toastManager.showRoomCodeCopied();
            
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

    // Toast methods
    showToast(message, type, options) {
        return this.toastManager.show(message, type, options);
    }

    showPlayerJoinedToast(playerName) {
        this.toastManager.showPlayerJoined(playerName);
    }

    showPlayerLeftToast(playerName) {
        this.toastManager.showPlayerLeft(playerName);
    }

    showPlayerReadyToast(playerName, isReady) {
        this.toastManager.showPlayerReady(playerName, isReady);
    }

    showHostTransferToast(newHostName) {
        this.toastManager.showHostTransfer(newHostName);
    }

    showConnectionToast(status) {
        this.toastManager.showConnection(status);
    }

    showGameStartingToast() {
        this.toastManager.showGameStarting();
    }

    clearToasts() {
        this.toastManager.clear();
    }

    // Callback setters
    setReadyToggleCallback(callback) {
        this.onReadyToggle = callback;
        if (this.eventHandler) {
            this.eventHandler.setCallbacks({ onReadyToggle: callback });
        }
    }

    setTeamAssignmentCallback(callback) {
        this.onTeamAssignment = callback;
        this.teamManager.setTeamAssignmentCallback(callback);
    }

    setAddBotsCallback(callback) {
        this.onAddBots = callback;
        if (this.eventHandler) {
            this.eventHandler.setCallbacks({ onAddBots: callback });
        }
    }

    setStartGameCallback(callback) {
        this.onStartGame = callback;
        if (this.eventHandler) {
            this.eventHandler.setCallbacks({ onStartGame: callback });
        }
    }

    getState() {
        return {
            isMobile: this.responsiveManager.isMobile,
            roomCode: this.elements.roomCode?.textContent,
            connectionStatus: this.elements.statusIndicator?.className,
            playerCount: this.elements.currentPlayers?.textContent,
            readyCount: this.elements.readyCount?.textContent,
            isHostControlsVisible: !this.elements.hostControls?.classList.contains('hidden'),
            isLoadingVisible: !this.elements.loadingOverlay?.classList.contains('hidden'),
            isErrorVisible: !this.elements.errorModal?.classList.contains('hidden')
        };
    }

    cleanup() {
        this.responsiveManager?.cleanup();
        this.clearToasts();
        this.hideLoading();
        this.hideError();
        
        // Cleanup components
        Object.keys(this).forEach(key => {
            if (key.endsWith('Manager') || key === 'teamManager' || key === 'eventHandler') {
                const component = this[key];
                if (component && typeof component.cleanup === 'function') {
                    component.cleanup();
                }
            }
        });
    }
}