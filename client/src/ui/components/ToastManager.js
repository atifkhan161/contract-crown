/**
 * ToastManager - Handles toast notifications and messages
 */
export class ToastManager {
    constructor() {
        this.container = null;
        this.initializeContainer();
    }

    /**
     * Initialize toast container
     */
    initializeContainer() {
        this.container = document.getElementById('toast-container');
        if (!this.container) {
            this.container = document.createElement('div');
            this.container.id = 'toast-container';
            this.container.className = 'toast-container';
            this.container.setAttribute('aria-live', 'polite');
            this.container.setAttribute('aria-atomic', 'false');
            document.body.appendChild(this.container);
        }
    }

    /**
     * Show a toast message
     */
    show(message, type = 'info', options = {}) {
        const {
            duration = 3000,
            icon = null,
            compact = false,
            className = ''
        } = options;

        const toast = document.createElement('div');
        toast.className = `toast-message ${type} ${compact ? 'compact' : ''} ${icon ? 'with-icon' : ''} ${className}`;
        toast.setAttribute('role', type === 'error' ? 'alert' : 'status');
        toast.setAttribute('aria-live', type === 'error' ? 'assertive' : 'polite');

        if (icon) {
            toast.innerHTML = `
                <span class="toast-icon" aria-hidden="true">${icon}</span>
                <span class="toast-text">${message}</span>
            `;
        } else {
            toast.textContent = message;
        }

        this.container.appendChild(toast);

        setTimeout(() => {
            toast.classList.add('show');
        }, 10);

        const removeToast = () => {
            toast.classList.add('hide');
            setTimeout(() => {
                if (toast.parentNode) {
                    toast.parentNode.removeChild(toast);
                }
            }, 300);
        };

        setTimeout(removeToast, duration);
        toast.addEventListener('click', removeToast);

        return toast;
    }

    /**
     * Show player joined toast
     */
    showPlayerJoined(playerName) {
        return this.show(`${playerName} joined the room`, 'player-joined', {
            icon: '👋',
            duration: 2500
        });
    }

    /**
     * Show player left toast
     */
    showPlayerLeft(playerName) {
        return this.show(`${playerName} left the room`, 'player-left', {
            icon: '👋',
            duration: 2500
        });
    }

    /**
     * Show player ready status toast
     */
    showPlayerReady(playerName, isReady) {
        const message = isReady ? `${playerName} is ready` : `${playerName} is not ready`;
        const icon = isReady ? '✅' : '⏳';
        return this.show(message, 'player-ready', {
            icon,
            duration: 2000,
            compact: true
        });
    }

    /**
     * Show host transfer toast
     */
    showHostTransfer(newHostName) {
        return this.show(`${newHostName} is now the host`, 'host-transfer', {
            icon: '👑',
            duration: 3000
        });
    }

    /**
     * Show connection status toast
     */
    showConnection(status) {
        const messages = {
            connected: { text: 'Connected to server', icon: '🟢', type: 'connection-restored' },
            disconnected: { text: 'Connection lost', icon: '🔴', type: 'connection-lost' },
            reconnecting: { text: 'Reconnecting...', icon: '🟡', type: 'warning' }
        };

        const config = messages[status];
        if (config) {
            return this.show(config.text, config.type, {
                icon: config.icon,
                duration: status === 'reconnecting' ? 5000 : 3000
            });
        }
    }

    /**
     * Show room code copied toast
     */
    showRoomCodeCopied() {
        return this.show('Room code copied to clipboard', 'success', {
            icon: '📋',
            duration: 2000,
            compact: true
        });
    }

    /**
     * Show game starting toast
     */
    showGameStarting() {
        return this.show('Game is starting...', 'info', {
            icon: '🎮',
            duration: 3000
        });
    }

    /**
     * Clear all toast messages
     */
    clear() {
        if (this.container) {
            this.container.innerHTML = '';
        }
    }
}