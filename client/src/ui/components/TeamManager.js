/**
 * TeamManager - Handles team formation and display
 */
export class TeamManager {
    constructor() {
        this.teams = { A: [], B: [] };
        this.draggedElement = null;
        this.touchStartPos = { x: 0, y: 0 };
        this.isDragging = false;
        this.setupDragAndDrop();
        this.setupShuffleButton();
    }

    /**
     * Update team displays
     */
    updateDisplay(teams) {
        this.teams = teams;
        
        const teamASlots = document.querySelectorAll('#team-a-slots .team-slot');
        const teamBSlots = document.querySelectorAll('#team-b-slots .team-slot');
        
        [...teamASlots, ...teamBSlots].forEach(slot => {
            slot.classList.remove('occupied');
            slot.innerHTML = '<div class="slot-placeholder">Drop player here</div>';
        });

        let teamACount = 0;
        if (teams.A) {
            teams.A.forEach((player, index) => {
                const slot = teamASlots[index];
                if (slot && player) {
                    this.populateSlot(slot, player);
                    teamACount++;
                }
            });
        }

        let teamBCount = 0;
        if (teams.B) {
            teams.B.forEach((player, index) => {
                const slot = teamBSlots[index];
                if (slot && player) {
                    this.populateSlot(slot, player);
                    teamBCount++;
                }
            });
        }

        const teamACountElement = document.getElementById('team-a-count');
        const teamBCountElement = document.getElementById('team-b-count');
        
        if (teamACountElement) {
            teamACountElement.textContent = `${teamACount}/2`;
        }
        if (teamBCountElement) {
            teamBCountElement.textContent = `${teamBCount}/2`;
        }
    }

    /**
     * Populate a team slot with player data
     */
    populateSlot(slot, player) {
        if (!slot || !player) return;
        
        slot.classList.add('occupied');
        
        const displayName = player.isBot ? `🤖 ${player.username}` : player.username;
        const readyStatus = player.isReady ? '✓' : '○';
        
        slot.innerHTML = `
            <div class="team-player-info">
                <div class="team-player-name">${displayName}</div>
                <div class="team-player-status">${readyStatus}</div>
            </div>
        `;
    }

    /**
     * Set up drag and drop functionality with touch support
     */
    setupDragAndDrop() {
        // Set up drag events for player slots
        const playerSlots = document.querySelectorAll('.player-slot');
        playerSlots.forEach(slot => {
            // Mouse drag events
            slot.addEventListener('dragstart', (e) => {
                if (slot.classList.contains('occupied') && slot.getAttribute('draggable') === 'true') {
                    e.dataTransfer.setData('text/plain', slot.dataset.playerId);
                    e.dataTransfer.effectAllowed = 'move';
                    slot.classList.add('dragging');
                    this.draggedElement = slot;
                }
            });

            slot.addEventListener('dragend', (e) => {
                slot.classList.remove('dragging');
                this.draggedElement = null;
            });

            // Touch events for mobile
            slot.addEventListener('touchstart', (e) => {
                if (slot.classList.contains('occupied')) {
                    // Don't prevent default if touching a button or interactive element
                    const target = e.target;
                    if (target.tagName === 'BUTTON' || target.closest('button') || target.classList.contains('ready-btn')) {
                        return; // Let the button handle the touch event normally
                    }
                    
                    const touch = e.touches[0];
                    this.touchStartPos = { x: touch.clientX, y: touch.clientY };
                    this.draggedElement = slot;
                    slot.classList.add('touch-dragging');
                    // Don't prevent default yet - only prevent when we start dragging
                }
            }, { passive: true });

            slot.addEventListener('touchmove', (e) => {
                if (this.draggedElement === slot) {
                    const touch = e.touches[0];
                    const deltaX = Math.abs(touch.clientX - this.touchStartPos.x);
                    const deltaY = Math.abs(touch.clientY - this.touchStartPos.y);
                    
                    // Start dragging if moved enough
                    if (!this.isDragging && (deltaX > 10 || deltaY > 10)) {
                        // Now prevent default since we're actually dragging
                        e.preventDefault();
                        this.isDragging = true;
                        slot.classList.add('dragging');
                        this.createDragGhost(slot, touch);
                    }
                    
                    if (this.isDragging) {
                        e.preventDefault();
                        this.updateDragGhost(touch);
                        this.handleTouchDragOver(touch);
                    }
                }
            }, { passive: false });

            slot.addEventListener('touchend', (e) => {
                if (this.draggedElement === slot) {
                    // Only prevent default if we were actually dragging
                    if (this.isDragging) {
                        e.preventDefault();
                        this.handleTouchDrop(e.changedTouches[0]);
                    }
                    this.cleanupTouch();
                }
            }, { passive: false });

            slot.addEventListener('touchcancel', (e) => {
                if (this.draggedElement === slot) {
                    this.cleanupTouch();
                }
            });
        });

        // Set up drop events for team slots
        const teamSlots = document.querySelectorAll('.team-slot');
        teamSlots.forEach(slot => {
            // Mouse drag events
            slot.addEventListener('dragover', (e) => {
                e.preventDefault();
                e.dataTransfer.dropEffect = 'move';
                slot.classList.add('drag-over');
            });

            slot.addEventListener('dragleave', (e) => {
                slot.classList.remove('drag-over');
            });

            slot.addEventListener('drop', (e) => {
                e.preventDefault();
                slot.classList.remove('drag-over');
                
                const playerId = e.dataTransfer.getData('text/plain');
                const team = slot.closest('.team-slots').dataset.team;
                const slotId = slot.dataset.slot;
                
                if (playerId && team && this.onTeamAssignment) {
                    this.onTeamAssignment(playerId, team, slotId);
                }
            });
        });
    }

    /**
     * Create a visual ghost element for touch dragging
     */
    createDragGhost(element, touch) {
        const ghost = element.cloneNode(true);
        ghost.id = 'drag-ghost';
        ghost.style.position = 'fixed';
        ghost.style.pointerEvents = 'none';
        ghost.style.zIndex = '9999';
        ghost.style.opacity = '0.8';
        ghost.style.transform = 'scale(0.9)';
        ghost.style.left = (touch.clientX - 50) + 'px';
        ghost.style.top = (touch.clientY - 30) + 'px';
        ghost.classList.add('drag-ghost');
        
        document.body.appendChild(ghost);
        this.dragGhost = ghost;
    }

    /**
     * Update drag ghost position
     */
    updateDragGhost(touch) {
        if (this.dragGhost) {
            this.dragGhost.style.left = (touch.clientX - 50) + 'px';
            this.dragGhost.style.top = (touch.clientY - 30) + 'px';
        }
    }

    /**
     * Handle touch drag over team slots
     */
    handleTouchDragOver(touch) {
        const elementBelow = document.elementFromPoint(touch.clientX, touch.clientY);
        const teamSlot = elementBelow?.closest('.team-slot');
        
        // Remove previous drag-over states
        document.querySelectorAll('.team-slot.drag-over').forEach(slot => {
            slot.classList.remove('drag-over');
        });
        
        // Add drag-over to current slot
        if (teamSlot) {
            teamSlot.classList.add('drag-over');
        }
    }

    /**
     * Handle touch drop
     */
    handleTouchDrop(touch) {
        const elementBelow = document.elementFromPoint(touch.clientX, touch.clientY);
        const teamSlot = elementBelow?.closest('.team-slot');
        
        if (teamSlot && this.draggedElement) {
            const playerId = this.draggedElement.dataset.playerId;
            const team = teamSlot.closest('.team-slots').dataset.team;
            const slotId = teamSlot.dataset.slot;
            
            if (playerId && team && this.onTeamAssignment) {
                this.onTeamAssignment(playerId, team, slotId);
            }
        }
        
        // Remove drag-over states
        document.querySelectorAll('.team-slot.drag-over').forEach(slot => {
            slot.classList.remove('drag-over');
        });
    }

    /**
     * Clean up touch dragging state
     */
    cleanupTouch() {
        if (this.draggedElement) {
            this.draggedElement.classList.remove('dragging', 'touch-dragging');
        }
        
        if (this.dragGhost) {
            this.dragGhost.remove();
            this.dragGhost = null;
        }
        
        document.querySelectorAll('.team-slot.drag-over').forEach(slot => {
            slot.classList.remove('drag-over');
        });
        
        this.draggedElement = null;
        this.isDragging = false;
    }

    /**
     * Set up shuffle button functionality
     */
    setupShuffleButton() {
        const shuffleBtn = document.getElementById('shuffle-teams-btn');
        if (shuffleBtn) {
            shuffleBtn.addEventListener('click', () => {
                if (this.onShuffleTeams) {
                    this.onShuffleTeams();
                }
            });
        }
    }

    /**
     * Set team assignment callback
     */
    setTeamAssignmentCallback(callback) {
        this.onTeamAssignment = callback;
    }

    /**
     * Set shuffle teams callback
     */
    setShuffleTeamsCallback(callback) {
        this.onShuffleTeams = callback;
    }

    /**
     * Show or hide shuffle button based on host status
     */
    showShuffleButton(isHost, hasPlayers = false) {
        const shuffleContainer = document.getElementById('team-shuffle-container');
        const shuffleBtn = document.getElementById('shuffle-teams-btn');
        
        if (shuffleContainer) {
            shuffleContainer.classList.toggle('hidden', !isHost);
        }
        
        if (shuffleBtn) {
            shuffleBtn.disabled = !hasPlayers;
            shuffleBtn.title = hasPlayers ? 
                'Randomly shuffle players between teams' : 
                'Need players to shuffle teams';
        }
    }

    /**
     * Shuffle players randomly between teams
     */
    shuffleTeams(players) {
        if (!players || players.length === 0) {
            return { A: [], B: [] };
        }

        // Filter out players that can be shuffled (connected players)
        const shufflablePlayers = players.filter(player => 
            player && (player.isConnected !== false)
        );

        if (shufflablePlayers.length === 0) {
            return { A: [], B: [] };
        }

        // Shuffle the array using Fisher-Yates algorithm
        const shuffled = [...shufflablePlayers];
        for (let i = shuffled.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
        }

        // Distribute players between teams
        const teams = { A: [], B: [] };
        shuffled.forEach((player, index) => {
            if (index % 2 === 0 && teams.A.length < 2) {
                teams.A.push(player);
            } else if (teams.B.length < 2) {
                teams.B.push(player);
            } else if (teams.A.length < 2) {
                teams.A.push(player);
            }
        });

        return teams;
    }

    /**
     * Auto-assign players to teams
     */
    autoAssignTeams(players) {
        const teams = { A: [], B: [] };
        const humanPlayers = players.filter(player => !player.isBot);
        const botPlayers = players.filter(player => player.isBot);

        players.forEach((player, index) => {
            if (!player.teamAssignment) {
                if (player.isBot) {
                    player.teamAssignment = teams.A.length <= teams.B.length ? 'A' : 'B';
                } else {
                    const humanIndex = humanPlayers.indexOf(player);
                    player.teamAssignment = humanIndex % 2 === 0 ? 'A' : 'B';
                }
            }

            if (player.teamAssignment === 'A' && teams.A.length < 2) {
                teams.A.push(player);
            } else if (player.teamAssignment === 'B' && teams.B.length < 2) {
                teams.B.push(player);
            } else if (teams.A.length < 2) {
                player.teamAssignment = 'A';
                teams.A.push(player);
            } else if (teams.B.length < 2) {
                player.teamAssignment = 'B';
                teams.B.push(player);
            }
        });

        return teams;
    }
}