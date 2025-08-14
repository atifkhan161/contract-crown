/**
 * PlayerSlotManager - Handles player slot rendering and updates
 */
export class PlayerSlotManager {
    constructor(elements) {
        this.elements = elements;
    }

    /**
     * Update all player slots with current room data
     */
    updateSlots(players, currentUserId = null) {
        // Reset all slots first
        for (let i = 1; i <= 4; i++) {
            const slot = this.elements.playerSlots[i];
            if (slot) {
                this.resetSlot(slot, i);
            }
        }

        // Update player count
        if (this.elements.currentPlayers) {
            this.elements.currentPlayers.textContent = players.length;
        }

        // Populate slots with player data
        players.forEach((player, index) => {
            const slotNumber = index + 1;
            const slot = this.elements.playerSlots[slotNumber];
            
            if (slot && slotNumber <= 4) {
                this.populateSlot(slot, player, currentUserId);
            }
        });
    }

    /**
     * Reset a player slot to empty state
     */
    resetSlot(slot, position) {
        if (!slot) return;
        
        slot.classList.remove('occupied', 'ready', 'bot-player');
        slot.setAttribute('draggable', 'false');
        slot.removeAttribute('data-player-id');
        
        const nameElement = slot.querySelector('.player-name');
        const readyText = slot.querySelector('.ready-text');
        const readyIndicator = slot.querySelector('.ready-indicator');
        const hostBadge = slot.querySelector('.host-badge');
        const avatarPlaceholder = slot.querySelector('.avatar-placeholder');
        const readyBtn = slot.querySelector('.ready-btn');
        
        if (nameElement) nameElement.textContent = 'Waiting for player...';
        if (readyText) readyText.textContent = 'Not Ready';
        if (readyIndicator) readyIndicator.style.background = '';
        if (hostBadge) hostBadge.classList.add('hidden');
        if (avatarPlaceholder) {
            avatarPlaceholder.textContent = position;
            avatarPlaceholder.style.fontSize = '';
        }
        if (readyBtn) {
            readyBtn.classList.add('hidden');
            readyBtn.classList.remove('ready');
            readyBtn.disabled = false;
        }
    }

    /**
     * Populate a player slot with player data
     */
    populateSlot(slot, player, currentUserId = null) {
        if (!slot || !player) return;
        
        slot.classList.add('occupied');
        
        if (player.isReady) {
            slot.classList.add('ready');
        }

        if (player.isBot) {
            slot.classList.add('bot-player');
        } else {
            slot.classList.remove('bot-player');
        }

        if (!player.isBot) {
            slot.setAttribute('draggable', 'true');
            slot.dataset.playerId = player.id || player.user_id;
        }

        const nameElement = slot.querySelector('.player-name');
        const readyText = slot.querySelector('.ready-text');
        const hostBadge = slot.querySelector('.host-badge');
        const avatarPlaceholder = slot.querySelector('.avatar-placeholder');
        const readyBtn = slot.querySelector('.ready-btn');
        
        const displayName = player.isBot ? `🤖 ${player.username}` : (player.username || 'Unknown Player');
        if (nameElement) nameElement.textContent = displayName;
        
        if (readyText) readyText.textContent = player.isReady ? 'Ready' : 'Not Ready';
        
        if (avatarPlaceholder) {
            if (player.isBot) {
                avatarPlaceholder.textContent = '🤖';
                avatarPlaceholder.style.fontSize = '1.2em';
            } else {
                avatarPlaceholder.textContent = player.username ? player.username.charAt(0).toUpperCase() : '?';
                avatarPlaceholder.style.fontSize = '';
            }
        }
        
        if (player.isHost && hostBadge) {
            hostBadge.classList.remove('hidden');
        }

        if (readyBtn && !player.isBot) {
            const isCurrentUser = currentUserId && (player.id === currentUserId || player.user_id === currentUserId);
            
            if (isCurrentUser) {
                readyBtn.classList.remove('hidden');
                readyBtn.classList.toggle('ready', player.isReady);
                readyBtn.disabled = false;
                const btnText = readyBtn.querySelector('.ready-btn-text');
                if (btnText) {
                    btnText.textContent = player.isReady ? 'Ready' : 'Ready';
                }
            } else {
                readyBtn.classList.add('hidden');
            }
        }
    }

    /**
     * Update ready status display
     */
    updateReadyStatus(readyCount, totalCount, humanCount = 0) {
        if (this.elements.readyCount) {
            this.elements.readyCount.textContent = readyCount;
        }

        if (this.elements.totalPlayers) {
            this.elements.totalPlayers.textContent = totalCount;
        }

        const readyStatusElement = this.elements.readyStatus;
        if (readyStatusElement) {
            let statusClass = 'ready-status';

            if (readyCount === totalCount && totalCount >= 2) {
                statusClass += ' all-ready';
            } else if (readyCount > 0) {
                statusClass += ' some-ready';
            } else {
                statusClass += ' none-ready';
            }

            readyStatusElement.className = statusClass;
        }

        const requirementsElement = this.elements.gameRequirements;
        if (requirementsElement) {
            const requirementText = requirementsElement.querySelector('.requirement-text');
            if (requirementText) {
                if (humanCount >= 2) {
                    requirementText.textContent = `✓ ${humanCount} human players ready to start`;
                    requirementText.className = 'requirement-text met';
                } else {
                    requirementText.textContent = `Need at least 2 human players to start (${humanCount}/2)`;
                    requirementText.className = 'requirement-text not-met';
                }
            }
        }
    }
}