/**
 * ConnectionStatusManager - Handles connection status display and warnings
 */
export class ConnectionStatusManager {
    constructor(elements) {
        this.elements = elements;
        this.currentStatus = 'disconnected';
    }

    /**
     * Update connection status indicator
     */
    updateStatus(status, details = {}) {
        this.currentStatus = status;
        
        const { statusIndicator, statusText, connectionStatus } = this.elements;
        
        if (statusIndicator) {
            statusIndicator.classList.remove('connected', 'connecting', 'disconnected', 'reconnecting', 'warning', 'error');
            statusIndicator.classList.add(status);
        }

        if (statusText) {
            const statusTexts = {
                connected: 'Connected',
                connecting: 'Connecting...',
                disconnected: 'Disconnected',
                reconnecting: details.reconnectAttempts ? 
                    `Reconnecting... (${details.reconnectAttempts}/${details.maxReconnectAttempts})` : 
                    'Reconnecting...'
            };
            statusText.textContent = statusTexts[status] || 'Unknown';
        }

        if (connectionStatus) {
            connectionStatus.classList.remove('status-connected', 'status-connecting', 'status-disconnected', 'status-reconnecting');
            connectionStatus.classList.add(`status-${status}`);
            
            if (details.reconnectAttempts > 0) {
                connectionStatus.classList.add('status-warning');
            }
        }

        if (statusIndicator) {
            statusIndicator.setAttribute('aria-label', `Connection status: ${status}`);
            statusIndicator.setAttribute('title', statusText?.textContent || status);
        }
    }

    /**
     * Show connection warning
     */
    showWarning(type, message, options = {}) {
        const { autoHide = true, duration = 5000 } = options;
        
        let warningElement = document.getElementById('connection-warning');
        if (!warningElement) {
            warningElement = document.createElement('div');
            warningElement.id = 'connection-warning';
            warningElement.className = 'connection-warning';
            
            const statusElement = this.elements.connectionStatus;
            if (statusElement && statusElement.parentNode) {
                statusElement.parentNode.insertBefore(warningElement, statusElement.nextSibling);
            } else {
                const header = document.querySelector('.waiting-room-header .header-content');
                if (header) header.appendChild(warningElement);
            }
        }

        warningElement.className = `connection-warning ${type}`;
        warningElement.innerHTML = `
            <span class="warning-icon">⚠️</span>
            <span class="warning-text">${message}</span>
            <button class="warning-close" onclick="this.parentElement.style.display='none'">×</button>
        `;
        warningElement.style.display = 'flex';

        if (autoHide) {
            setTimeout(() => {
                if (warningElement && warningElement.parentNode) {
                    warningElement.style.display = 'none';
                }
            }, duration);
        }
    }

    /**
     * Hide connection warning
     */
    hideWarning() {
        const warningElement = document.getElementById('connection-warning');
        if (warningElement) {
            warningElement.style.display = 'none';
        }
    }

    /**
     * Get current status
     */
    getStatus() {
        return this.currentStatus;
    }
}