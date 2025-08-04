/**
 * TrickManager - Handles trick playing and scoring
 * Manages trick logic, card evaluation, and score calculation
 */

export class TrickManager {
    constructor(gameState, uiManager) {
        this.gameState = gameState;
        this.uiManager = uiManager;
        this.onTrickComplete = null; // Callback for trick completion
        this.onNewRoundStart = null; // Callback for new round start
    }

    /**
     * Set callback for trick completion events
     * @param {Function} callback - Function to call when trick is complete
     */
    setTrickCompleteCallback(callback) {
        this.onTrickComplete = callback;
    }

    /**
     * Set callback for new round start events
     * @param {Function} callback - Function to call when new round starts
     */
    setNewRoundStartCallback(callback) {
        this.onNewRoundStart = callback;
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

        // Add 1 point for winning the trick (simplified scoring)
        currentScores[teamKey] += 1;

        // Update game state
        this.gameState.updateState({ scores: currentScores });

        // Update UI with animation
        this.uiManager.updateScoreDisplay(true);

        console.log(`[TrickManager] ${teamKey} wins trick ${state.currentTrick.trickNumber}. Scores: Team1=${currentScores.team1}, Team2=${currentScores.team2}`);
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
        
        // Show trick scores
        const scores = state.scores;
        this.uiManager.addGameMessage(
            `Tricks won - Team 1: ${scores.team1}, Team 2: ${scores.team2}`,
            'info'
        );

        // Determine round winner based on trump declaring team rules
        const roundWinner = this.determineRoundWinner(scores, state.trumpDeclarer);
        
        if (roundWinner) {
            this.uiManager.addGameMessage(`${roundWinner.teamName} wins the round!`, 'success');
            
            // Update round scores
            this.updateRoundScores(roundWinner.teamKey);
            
            // Check for game winner (first to win required number of rounds)
            if (this.checkGameWinner()) {
                this.handleGameComplete();
                return;
            }
        }

        // Start next round
        setTimeout(() => this.startNextRound(roundWinner), 3000);
    }

    /**
     * Determine round winner based on trump declaring team rules
     * @param {Object} scores - Current trick scores
     * @param {string} trumpDeclarer - Player who declared trump
     * @returns {Object} Round winner information
     */
    determineRoundWinner(scores, trumpDeclarer) {
        // Determine which team declared trump
        const team1Players = ['player1', 'player3', 'human_player', 'bot_2'];
        const team2Players = ['player2', 'player4', 'bot_1', 'bot_3'];
        
        const trumpDeclaringTeam = team1Players.includes(trumpDeclarer) ? 'team1' : 'team2';
        const nonDeclaringTeam = trumpDeclaringTeam === 'team1' ? 'team2' : 'team1';
        
        const declaringTeamScore = scores[trumpDeclaringTeam];
        const nonDeclaringTeamScore = scores[nonDeclaringTeam];
        
        // Trump declaring team needs more than 4 tricks (5 or more) to win
        // Non-declaring team needs 4 or more tricks to win
        if (declaringTeamScore >= 5) {
            return {
                teamKey: trumpDeclaringTeam,
                teamName: trumpDeclaringTeam === 'team1' ? 'Team 1' : 'Team 2',
                reason: `Trump declaring team won ${declaringTeamScore} tricks (needed 5+)`
            };
        } else if (nonDeclaringTeamScore >= 4) {
            return {
                teamKey: nonDeclaringTeam,
                teamName: nonDeclaringTeam === 'team1' ? 'Team 1' : 'Team 2',
                reason: `Non-declaring team won ${nonDeclaringTeamScore} tricks (needed 4+)`
            };
        }
        
        // This shouldn't happen in an 8-trick game, but handle edge case
        return {
            teamKey: declaringTeamScore > nonDeclaringTeamScore ? trumpDeclaringTeam : nonDeclaringTeam,
            teamName: declaringTeamScore > nonDeclaringTeamScore ? 
                (trumpDeclaringTeam === 'team1' ? 'Team 1' : 'Team 2') : 
                (nonDeclaringTeam === 'team1' ? 'Team 1' : 'Team 2'),
            reason: 'Won by having more tricks'
        };
    }

    /**
     * Update round scores (accumulate tricks won by winning team)
     * @param {string} winningTeam - Team that won the round
     */
    updateRoundScores(winningTeam) {
        const state = this.gameState.getState();
        const roundScores = state.roundScores || { team1: 0, team2: 0 };
        const currentScores = state.scores;
        
        // Add the number of tricks the winning team scored this round
        const tricksWon = currentScores[winningTeam];
        roundScores[winningTeam] += tricksWon;
        
        this.gameState.updateState({ roundScores });
        
        // Update round score display with animation
        this.uiManager.updateRoundScoreDisplay(true);
        
        this.uiManager.addGameMessage(
            `${winningTeam === 'team1' ? 'Team 1' : 'Team 2'} adds ${tricksWon} points to their score`,
            'info'
        );
        
        this.uiManager.addGameMessage(
            `Game scores - Team 1: ${roundScores.team1}, Team 2: ${roundScores.team2}`,
            'info'
        );
    }

    /**
     * Check if there's a game winner
     * @returns {boolean} True if game is complete
     */
    checkGameWinner() {
        const state = this.gameState.getState();
        const roundScores = state.roundScores || { team1: 0, team2: 0 };
        
        // Game ends when a team reaches 52 points
        const pointsToWin = 52;
        
        return roundScores.team1 >= pointsToWin || roundScores.team2 >= pointsToWin;
    }

    /**
     * Start the next round
     * @param {Object} roundWinner - Information about the round winner
     */
    startNextRound(roundWinner) {
        const state = this.gameState.getState();
        
        // Determine next trump declarer based on round result
        let nextTrumpDeclarer;
        
        if (roundWinner) {
            // If the trump declaring team won, they declare again
            // If they lost, next player in clockwise order declares
            const team1Players = ['player1', 'player3', 'human_player', 'bot_2'];
            const currentDeclarerTeam = team1Players.includes(state.trumpDeclarer) ? 'team1' : 'team2';
            
            if (roundWinner.teamKey === currentDeclarerTeam) {
                // Same team won, same player declares trump again
                nextTrumpDeclarer = state.trumpDeclarer;
            } else {
                // Other team won, next player in clockwise order declares
                nextTrumpDeclarer = this.gameState.getNextPlayerInOrder(state.trumpDeclarer);
            }
        } else {
            // Fallback to next player in order
            nextTrumpDeclarer = this.gameState.getNextPlayerInOrder(state.trumpDeclarer);
        }
        
        // Reset for next round
        this.gameState.updateState({
            currentRound: state.currentRound + 1,
            gamePhase: 'trump_declaration',
            trumpSuit: null,
            trumpDeclarer: nextTrumpDeclarer,
            scores: { team1: 0, team2: 0 }, // Reset trick scores for new round
            leadSuit: null,
            currentTurnPlayer: null,
            isMyTurn: false
        });

        // Reset trick for new round
        this.gameState.resetTrickForNewRound();

        // Deal new cards for the new round
        if (state.isDemoMode) {
            // For demo mode, we need to call the DemoGameManager to setup new round
            // This will be handled by the GameManager
            const declarerName = this.gameState.getPlayerNameById(nextTrumpDeclarer);
            this.uiManager.addGameMessage(`Round ${state.currentRound + 1} begins! ${declarerName} will declare trump.`, 'success');
            
            // Trigger new round setup callback
            if (this.onNewRoundStart) {
                this.onNewRoundStart(nextTrumpDeclarer);
            }
        } else {
            // For multiplayer, server handles card dealing
            const declarerName = this.gameState.getPlayerNameById(nextTrumpDeclarer);
            this.uiManager.addGameMessage(`Round ${state.currentRound + 1} begins! ${declarerName} will declare trump.`, 'success');
            this.uiManager.updateUI();
        }
    }

    /**
     * Get the next player in clockwise order
     * @param {string} currentPlayerId - Current player ID
     * @returns {string} Next player ID
     */
    getNextPlayerInOrder(currentPlayerId) {
        return this.gameState.getNextPlayerInOrder(currentPlayerId);
    }



    /**
     * Handle game completion
     */
    handleGameComplete() {
        const state = this.gameState.getState();
        const roundScores = state.roundScores || { team1: 0, team2: 0 };
        
        const winner = roundScores.team1 > roundScores.team2 ? 'Team 1' : 'Team 2';
        const finalScore = `${roundScores.team1} - ${roundScores.team2}`;
        
        this.uiManager.addGameMessage(`Game Over! ${winner} wins with ${finalScore} points`, 'success');
        
        // Show game over modal or redirect
        setTimeout(() => {
            if (confirm(`Game Over! ${winner} wins with ${finalScore} points\n\nReturn to lobby?`)) {
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