/**
 * TrickManager - Handles trick playing and scoring
 * Manages trick logic, card evaluation, and score calculation
 */

export class TrickManager {
    constructor(gameState, uiManager) {
        this.gameState = gameState;
        this.uiManager = uiManager;
        this.onTrickComplete = null; // Callback for trick completion
    }

    /**
     * Set callback for trick completion events
     * @param {Function} callback - Function to call when trick is complete
     */
    setTrickCompleteCallback(callback) {
        this.onTrickComplete = callback;
    }

    /**
     * Add a card to the current trick
     * @param {string} playerId - Player who played the card
     * @param {Object} card - Card that was played
     */
    addCardToTrick(playerId, card) {
        this.gameState.addCardToTrick(playerId, card);
        
        const state = this.gameState.getState();
        const trick = state.currentTrick;
        
        // Check if trick is complete (4 cards played)
        if (trick.cardsPlayed && trick.cardsPlayed.length === 4) {
            setTimeout(() => this.evaluateTrick(), 1500);
        }
    }

    /**
     * Evaluate the current trick to determine winner
     */
    evaluateTrick() {
        const state = this.gameState.getState();
        const trick = state.currentTrick;
        
        if (!trick.cardsPlayed || trick.cardsPlayed.length !== 4) {
            console.error('[TrickManager] Cannot evaluate incomplete trick');
            return;
        }

        const winner = this.determineTrickWinner(trick.cardsPlayed, trick.leadSuit, state.trumpSuit);
        
        if (winner) {
            this.handleTrickWon(winner, trick);
        }
    }

    /**
     * Determine the winner of a trick
     * @param {Array} cardsPlayed - Cards played in the trick
     * @param {string} leadSuit - Lead suit of the trick
     * @param {string} trumpSuit - Current trump suit
     * @returns {Object} Winner information
     */
    determineTrickWinner(cardsPlayed, leadSuit, trumpSuit) {
        if (!cardsPlayed || cardsPlayed.length === 0) return null;

        let winningCard = null;
        let winningPlayer = null;

        // Card rank values (higher number = stronger card)
        const rankValues = {
            '7': 1, '8': 2, '9': 3, '10': 4,
            'J': 5, 'Q': 6, 'K': 7, 'A': 8
        };

        for (const play of cardsPlayed) {
            const { playerId, card } = play;
            
            if (!winningCard) {
                winningCard = card;
                winningPlayer = playerId;
                continue;
            }

            // Trump cards beat non-trump cards
            const isCurrentTrump = card.suit === trumpSuit;
            const isWinningTrump = winningCard.suit === trumpSuit;

            if (isCurrentTrump && !isWinningTrump) {
                winningCard = card;
                winningPlayer = playerId;
            } else if (!isCurrentTrump && isWinningTrump) {
                // Winning card remains trump
                continue;
            } else if (isCurrentTrump && isWinningTrump) {
                // Both trump - higher rank wins
                if (rankValues[card.rank] > rankValues[winningCard.rank]) {
                    winningCard = card;
                    winningPlayer = playerId;
                }
            } else {
                // Neither trump - must follow lead suit
                const isCurrentLeadSuit = card.suit === leadSuit;
                const isWinningLeadSuit = winningCard.suit === leadSuit;

                if (isCurrentLeadSuit && !isWinningLeadSuit) {
                    winningCard = card;
                    winningPlayer = playerId;
                } else if (isCurrentLeadSuit && isWinningLeadSuit) {
                    // Both lead suit - higher rank wins
                    if (rankValues[card.rank] > rankValues[winningCard.rank]) {
                        winningCard = card;
                        winningPlayer = playerId;
                    }
                }
                // If current card is not lead suit and winning card is, winning card stays
            }
        }

        return {
            playerId: winningPlayer,
            card: winningCard,
            cardsWon: cardsPlayed.map(play => play.card)
        };
    }

    /**
     * Handle trick completion
     * @param {Object} winner - Winner information
     * @param {Object} trick - Completed trick
     */
    handleTrickWon(winner, trick) {
        const playerName = this.gameState.getPlayerNameById(winner.playerId);
        
        // Show trick winner message
        this.uiManager.addGameMessage(
            `${playerName} wins the trick with ${winner.card.rank} of ${winner.card.suit}`,
            'success'
        );

        // Update scores
        this.updateScores(winner.playerId, winner.cardsWon);

        // Clear played cards after showing winner
        setTimeout(() => {
            this.uiManager.clearPlayedCards();
            this.gameState.clearTrick();
            
            // Set next trick leader
            this.startNextTrick(winner.playerId);
            
        }, 2000);

        // Trigger callback
        if (this.onTrickComplete) {
            this.onTrickComplete(winner, trick);
        }
    }

    /**
     * Update scores based on trick winner
     * @param {string} winnerPlayerId - Player who won the trick
     * @param {Array} cardsWon - Cards won in the trick
     */
    updateScores(winnerPlayerId, cardsWon) {
        const state = this.gameState.getState();
        const currentScores = { ...state.scores };

        // Determine team assignment (simplified - players 1&3 vs 2&4)
        const team1Players = ['player1', 'player3', 'human_player', 'bot_2'];
        const team2Players = ['player2', 'player4', 'bot_1', 'bot_3'];

        const isTeam1 = team1Players.includes(winnerPlayerId);
        const teamKey = isTeam1 ? 'team1' : 'team2';

        // Calculate points from cards won
        let points = 0;
        cardsWon.forEach(card => {
            // In Contract Crown, typically Aces and 10s are worth points
            if (card.rank === 'A') points += 4;
            else if (card.rank === '10') points += 3;
            else if (card.rank === 'K') points += 2;
            else if (card.rank === 'Q') points += 1;
        });

        // Add base point for winning trick
        points += 1;

        currentScores[teamKey] += points;

        // Update game state
        this.gameState.updateState({ scores: currentScores });

        // Update UI with animation
        this.uiManager.updateScoreDisplay(true);

        console.log(`[TrickManager] ${teamKey} scores ${points} points. New scores:`, currentScores);
    }

    /**
     * Start the next trick
     * @param {string} leadPlayerId - Player who leads the next trick
     */
    startNextTrick(leadPlayerId) {
        const state = this.gameState.getState();
        
        // Check if round is complete (all cards played)
        const playerHand = state.playerHand || [];
        if (playerHand.length === 0) {
            this.handleRoundComplete();
            return;
        }

        // Set up next trick
        this.gameState.updateState({
            currentTurnPlayer: leadPlayerId,
            isMyTurn: (leadPlayerId === 'human_player'), // Check if it's the human player's turn
            leadSuit: null
        });

        // Update UI
        this.uiManager.updateTurnIndicators();
        this.uiManager.removeLeadSuitIndicator();

        // Show next trick message
        const leaderName = this.gameState.getPlayerNameById(leadPlayerId);
        this.uiManager.addGameMessage(`${leaderName} leads the next trick`, 'info');
        
        console.log(`[TrickManager] Next trick leader: ${leadPlayerId}, isMyTurn: ${leadPlayerId === 'human_player'}`);
    }

    /**
     * Handle round completion
     */
    handleRoundComplete() {
        const state = this.gameState.getState();
        
        this.uiManager.addGameMessage('Round complete!', 'success');
        
        // Show final scores
        const scores = state.scores;
        this.uiManager.addGameMessage(
            `Final scores - Team 1: ${scores.team1}, Team 2: ${scores.team2}`,
            'info'
        );

        // Check for game winner (example: first to 50 points)
        const winningScore = 50;
        if (scores.team1 >= winningScore || scores.team2 >= winningScore) {
            this.handleGameComplete();
        } else {
            // Start next round
            setTimeout(() => this.startNextRound(), 3000);
        }
    }

    /**
     * Start the next round
     */
    startNextRound() {
        const state = this.gameState.getState();
        
        // Reset for next round
        this.gameState.updateState({
            currentRound: state.currentRound + 1,
            gamePhase: 'trump_declaration',
            trumpSuit: null,
            trumpDeclarer: this.getNextTrumpDeclarer(),
            leadSuit: null,
            currentTurnPlayer: null,
            isMyTurn: false
        });

        // Clear trick
        this.gameState.clearTrick();

        // In a real game, new cards would be dealt here
        // For demo, we could generate new hands

        this.uiManager.addGameMessage(`Round ${state.currentRound + 1} begins!`, 'success');
        this.uiManager.updateUI();
    }

    /**
     * Get the next trump declarer (rotates clockwise)
     * @returns {string} Next trump declarer player ID
     */
    getNextTrumpDeclarer() {
        const state = this.gameState.getState();
        const currentDeclarer = state.trumpDeclarer;
        
        return this.gameState.getNextPlayerInOrder(currentDeclarer);
    }

    /**
     * Handle game completion
     */
    handleGameComplete() {
        const state = this.gameState.getState();
        const scores = state.scores;
        
        const winner = scores.team1 > scores.team2 ? 'Team 1' : 'Team 2';
        const finalScore = `${scores.team1} - ${scores.team2}`;
        
        this.uiManager.addGameMessage(`Game Over! ${winner} wins ${finalScore}`, 'success');
        
        // Show game over modal or redirect
        setTimeout(() => {
            if (confirm(`Game Over! ${winner} wins ${finalScore}\n\nReturn to lobby?`)) {
                window.location.href = '/lobby.html';
            }
        }, 2000);
    }

    /**
     * Get current trick information
     * @returns {Object} Current trick info
     */
    getCurrentTrickInfo() {
        const state = this.gameState.getState();
        const trick = state.currentTrick;
        
        return {
            trickNumber: trick?.trickNumber || 1,
            cardsPlayed: trick?.cardsPlayed || [],
            leadSuit: trick?.leadSuit,
            isComplete: (trick?.cardsPlayed?.length || 0) === 4,
            leadingPlayer: trick?.leadingPlayerId
        };
    }

    /**
     * Check if player must follow suit
     * @param {string} playerId - Player ID to check
     * @param {Object} card - Card being played
     * @returns {boolean} True if must follow suit
     */
    mustFollowSuit(playerId, card) {
        const state = this.gameState.getState();
        const leadSuit = state.leadSuit;
        
        if (!leadSuit || card.suit === leadSuit) {
            return true; // No lead suit or card matches lead suit
        }

        // Check if player has cards of lead suit
        const playerHand = state.playerHand || [];
        const cardsOfLeadSuit = playerHand.filter(c => c.suit === leadSuit);
        
        return cardsOfLeadSuit.length === 0; // Can play any card if no lead suit cards
    }

    /**
     * Get valid cards for current player
     * @returns {Array} Array of valid cards
     */
    getValidCardsForTrick() {
        const state = this.gameState.getState();
        const playerHand = state.playerHand || [];
        const leadSuit = state.leadSuit;
        
        if (!leadSuit) {
            // No lead suit - all cards valid
            return [...playerHand];
        }

        // Must follow lead suit if possible
        const cardsOfLeadSuit = playerHand.filter(card => card.suit === leadSuit);
        if (cardsOfLeadSuit.length > 0) {
            return cardsOfLeadSuit;
        }

        // Can't follow suit - all cards valid
        return [...playerHand];
    }
}