/**
 * TeamManager - Handles team formation and display
 */
export class TeamManager {
    constructor() {
        this.teams = { A: [], B: [] };
        this.setupDragAndDrop();
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
     * Set up drag and drop functionality
     */
    setupDragAndDrop() {
        // Set up drag events for player slots
        const playerSlots = document.querySelectorAll('.player-slot');
        playerSlots.forEach(slot => {
            slot.addEventListener('dragstart', (e) => {
                if (slot.classList.contains('occupied') && slot.getAttribute('draggable') === 'true') {
                    e.dataTransfer.setData('text/plain', slot.dataset.playerId);
                    e.dataTransfer.effectAllowed = 'move';
                    slot.classList.add('dragging');
                }
            });

            slot.addEventListener('dragend', (e) => {
                slot.classList.remove('dragging');
            });
        });

        // Set up drop events for team slots
        const teamSlots = document.querySelectorAll('.team-slot');
        teamSlots.forEach(slot => {
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
     * Set team assignment callback
     */
    setTeamAssignmentCallback(callback) {
        this.onTeamAssignment = callback;
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