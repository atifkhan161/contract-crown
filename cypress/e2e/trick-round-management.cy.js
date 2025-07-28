/**
 * Trick and Round Management Tests
 * Tests the complete trick-taking and round completion flow
 */

describe('Trick and Round Management', () => {
    beforeEach(() => {
        // Set up test environment
        cy.visit('/login.html');
        
        // Mock authentication
        cy.window().then((win) => {
            win.localStorage.setItem('auth_token', 'test-token');
            win.localStorage.setItem('user_data', JSON.stringify({
                userId: 'test-user-1',
                username: 'TestPlayer1'
            }));
        });
        
        // Navigate to game page
        cy.visit('/game.html?gameId=test-game-123');
        
        // Wait for game to load
        cy.get('#game-container').should('be.visible');
    });

    describe('Trick Completion', () => {
        it('should handle trick winner announcement', () => {
            // Mock trick won event
            cy.window().then((win) => {
                const gameManager = win.gameManager;
                if (gameManager) {
                    gameManager.handleTrickWon({
                        winnerId: 'player-2',
                        winnerName: 'Player 2',
                        winningCard: { suit: 'hearts', rank: 'A' },
                        cardsPlayed: [
                            { playerId: 'player-1', card: { suit: 'hearts', rank: 'K' } },
                            { playerId: 'player-2', card: { suit: 'hearts', rank: 'A' } },
                            { playerId: 'player-3', card: { suit: 'hearts', rank: 'Q' } },
                            { playerId: 'player-4', card: { suit: 'hearts', rank: 'J' } }
                        ],
                        nextLeaderId: 'player-2'
                    });
                }
            });

            // Should show winner message
            cy.get('.game-message')
                .should('contain', 'Player 2 won the trick with A of hearts');

            // Should highlight winning card
            cy.get('.winning-card').should('exist');

            // Should clear played cards after delay
            cy.wait(3000);
            cy.get('.played-card-slot.active').should('not.exist');
        });

        it('should show trick winner animation', () => {
            // Mock trick winner animation
            cy.window().then((win) => {
                const gameManager = win.gameManager;
                if (gameManager) {
                    // Add some played cards first
                    gameManager.renderPlayedCard('player-1', { suit: 'hearts', rank: 'K' }, 'top');
                    gameManager.renderPlayedCard('player-2', { suit: 'hearts', rank: 'A' }, 'left');
                    
                    // Show winner animation
                    gameManager.showTrickWinnerAnimation('player-2', { suit: 'hearts', rank: 'A' });
                }
            });

            // Should highlight winning card
            cy.get('.winning-card').should('exist');
            cy.get('.winner-pulse').should('exist');
            
            // Should show losing cards as dimmed
            cy.get('.losing-card').should('exist');
        });

        it('should prepare for next trick', () => {
            // Mock next trick preparation
            cy.window().then((win) => {
                const gameManager = win.gameManager;
                if (gameManager) {
                    gameManager.gameState = {
                        ...gameManager.gameState,
                        currentRound: { currentTrick: 3 }
                    };
                    
                    gameManager.prepareNextTrick({
                        nextLeaderId: 'player-2'
                    });
                }
            });

            // Should update trick number
            cy.window().then((win) => {
                const gameManager = win.gameManager;
                expect(gameManager.gameState.currentRound.currentTrick).to.equal(4);
            });

            // Should show next trick message
            cy.get('.game-message').should('contain', 'Starting trick 4');
        });
    });

    describe('Round Completion', () => {
        it('should handle round completion with scores', () => {
            // Mock round completion
            cy.window().then((win) => {
                const gameManager = win.gameManager;
                if (gameManager) {
                    gameManager.handleRoundScores({
                        roundNumber: 1,
                        declaringTeamTricks: 6,
                        challengingTeamTricks: 2,
                        scores: {
                            'team-1': 6,
                            'team-2': 0
                        },
                        gameComplete: false,
                        nextRound: {
                            roundId: 'round-2',
                            roundNumber: 2,
                            dealerUserId: 'player-2',
                            firstPlayerUserId: 'player-3',
                            trumpDeclarerUserId: 'player-3'
                        }
                    });
                }
            });

            // Should show round completion overlay
            cy.get('.round-completion-overlay').should('be.visible');
            cy.get('.round-completion-content').should('contain', 'Round 1 Complete!');

            // Should show team results
            cy.get('.team-result').should('have.length', 2);
            cy.get('.success').should('contain', 'Contract Made!');

            // Should update scores
            cy.get('.score-value').should('contain', '6');
        });

        it('should show round completion animation', () => {
            // Mock round completion animation
            cy.window().then((win) => {
                const gameManager = win.gameManager;
                if (gameManager) {
                    gameManager.showRoundCompletionAnimation({
                        roundNumber: 1,
                        declaringTeamTricks: 5,
                        challengingTeamTricks: 3
                    });
                }
            });

            // Should show overlay with animation
            cy.get('.round-completion-overlay').should('be.visible');
            cy.get('.round-completion-content').should('have.css', 'animation-name', 'slideIn');

            // Should auto-dismiss after delay
            cy.wait(3500);
            cy.get('.round-completion-overlay').should('not.exist');
        });

        it('should prepare for next round', () => {
            // Mock next round preparation
            cy.window().then((win) => {
                const gameManager = win.gameManager;
                if (gameManager) {
                    gameManager.prepareNextRound({
                        roundId: 'round-2',
                        roundNumber: 2,
                        dealerUserId: 'player-2',
                        firstPlayerUserId: 'player-3',
                        trumpDeclarerUserId: 'test-user-1', // Current player
                        playerHands: {
                            'test-user-1': [
                                { suit: 'spades', rank: 'A' },
                                { suit: 'hearts', rank: 'K' },
                                { suit: 'diamonds', rank: 'Q' },
                                { suit: 'clubs', rank: 'J' }
                            ]
                        }
                    });
                }
            });

            // Should update round number
            cy.get('#current-round').should('contain', '2');

            // Should reset trump suit
            cy.get('.trump-name').should('contain', 'Not Declared');

            // Should show trump declaration modal for current player
            cy.get('#trump-modal').should('not.have.class', 'hidden');

            // Should show new round message
            cy.get('.game-message').should('contain', 'Starting Round 2');
        });

        it('should handle failed contract', () => {
            // Mock failed contract scenario
            cy.window().then((win) => {
                const gameManager = win.gameManager;
                if (gameManager) {
                    gameManager.showRoundResults({
                        roundNumber: 1,
                        declaringTeamTricks: 3, // Failed contract
                        challengingTeamTricks: 5,
                        scores: {
                            'team-1': 0, // No points for failed contract
                            'team-2': 5
                        }
                    });
                }
            });

            // Should show failure message
            cy.get('.game-message').should('contain', 'Declaring team 3 tricks');
            cy.get('.game-message').should('contain', 'Team team-2 earned 5 points');
        });
    });

    describe('Game Completion', () => {
        it('should handle game completion', () => {
            // Mock game completion
            cy.window().then((win) => {
                const gameManager = win.gameManager;
                if (gameManager) {
                    gameManager.handleGameComplete({
                        gameComplete: true,
                        winningTeam: {
                            teamId: 'team-1',
                            teamNumber: 1,
                            finalScore: 52
                        },
                        scores: {
                            'team-1': 52,
                            'team-2': 31
                        }
                    });
                }
            });

            // Should show game completion modal
            cy.get('.game-completion-modal').should('be.visible');
            cy.get('.game-complete-header').should('contain', 'Game Complete!');
            cy.get('.winner-announcement').should('contain', 'Team 1 Wins!');
            cy.get('.final-score').should('contain', '52 points');
        });

        it('should show final scores', () => {
            // Mock game completion modal
            cy.window().then((win) => {
                const gameManager = win.gameManager;
                if (gameManager) {
                    gameManager.showGameCompletionModal({
                        winningTeam: {
                            teamId: 'team-1',
                            teamNumber: 1,
                            finalScore: 52
                        },
                        scores: {
                            'team-1': 52,
                            'team-2': 31
                        }
                    });
                }
            });

            // Should show final scores
            cy.get('.final-scores').should('be.visible');
            cy.get('.team-final-score').should('have.length', 2);
            cy.get('.team-final-score.winner').should('exist');

            // Should have action buttons
            cy.get('#return-to-dashboard').should('be.visible');
            cy.get('#view-statistics').should('be.visible');
        });

        it('should handle return to dashboard', () => {
            // Mock game completion modal
            cy.window().then((win) => {
                const gameManager = win.gameManager;
                if (gameManager) {
                    gameManager.showGameCompletionModal({
                        winningTeam: { teamNumber: 1, finalScore: 52 },
                        scores: { 'team-1': 52, 'team-2': 31 }
                    });
                }
            });

            // Click return to dashboard
            cy.get('#return-to-dashboard').click();

            // Should navigate to dashboard
            cy.url().should('include', '/dashboard.html');
        });
    });

    describe('Crown Rule Implementation', () => {
        it('should maintain trump declaration privilege on successful contract', () => {
            // Mock successful contract completion
            cy.window().then((win) => {
                const gameManager = win.gameManager;
                if (gameManager) {
                    gameManager.prepareNextRound({
                        roundId: 'round-2',
                        roundNumber: 2,
                        trumpDeclarerUserId: 'test-user-1', // Same player as previous round
                        dealerUserId: 'player-2' // Dealer rotated
                    });
                }
            });

            // Should show trump declaration for same player
            cy.window().then((win) => {
                const gameManager = win.gameManager;
                expect(gameManager.gameState.currentRound.trumpDeclarerUserId).to.equal('test-user-1');
            });
        });

        it('should pass trump declaration on failed contract', () => {
            // Mock failed contract completion
            cy.window().then((win) => {
                const gameManager = win.gameManager;
                if (gameManager) {
                    gameManager.prepareNextRound({
                        roundId: 'round-2',
                        roundNumber: 2,
                        trumpDeclarerUserId: 'player-2', // Different player
                        dealerUserId: 'player-2'
                    });
                }
            });

            // Should show trump declaration for different player
            cy.window().then((win) => {
                const gameManager = win.gameManager;
                expect(gameManager.gameState.currentRound.trumpDeclarerUserId).to.equal('player-2');
            });

            // Should show waiting message
            cy.get('.game-message').should('contain', 'Waiting for');
        });
    });

    describe('Score Animation', () => {
        it('should animate score updates', () => {
            // Mock score update with animation
            cy.window().then((win) => {
                const gameManager = win.gameManager;
                if (gameManager) {
                    gameManager.gameState.scores = { team1: 10, team2: 5 };
                    gameManager.updateScoreDisplay(true);
                }
            });

            // Should show animation class
            cy.get('.score-value.updating').should('exist');

            // Animation should complete
            cy.wait(1000);
            cy.get('.score-value.updating').should('not.exist');
        });

        it('should highlight winning team score', () => {
            // Mock game completion with winner highlight
            cy.window().then((win) => {
                const gameManager = win.gameManager;
                if (gameManager) {
                    gameManager.showGameCompletionModal({
                        winningTeam: {
                            teamId: 'team-1',
                            teamNumber: 1,
                            finalScore: 52
                        },
                        scores: {
                            'team-1': 52,
                            'team-2': 31
                        }
                    });
                }
            });

            // Should highlight winner
            cy.get('.team-final-score.winner').should('exist');
            cy.get('.team-final-score.winner').should('have.css', 'animation-name', 'winnerHighlight');
        });
    });
});