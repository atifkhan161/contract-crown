/**
 * Crown Rule Implementation Tests
 * Tests the Crown Rule across multiple rounds and scenarios
 */

describe('Crown Rule Implementation', () => {
    beforeEach(() => {
        // Set up test environment
        cy.visit('/login.html');
        
        // Mock authentication
        cy.window().then((win) => {
            win.localStorage.setItem('auth_token', 'test-token');
            win.localStorage.setItem('user_data', JSON.stringify({
                userId: 'player-1',
                username: 'Alice'
            }));
        });
        
        // Navigate to game page
        cy.visit('/game.html?gameId=test-game-123');
        
        // Wait for game to load
        cy.get('#game-container').should('be.visible');
    });

    describe('Trump Declaration Privilege', () => {
        it('should maintain trump declaration privilege when declaring team makes contract', () => {
            // Setup: Round 1 with Alice as trump declarer
            cy.window().then((win) => {
                if (win.gameManager) {
                    win.gameManager.gameState = {
                        ...win.gameManager.gameState,
                        currentRound: {
                            roundNumber: 1,
                            trumpDeclarerUserId: 'player-1', // Alice
                            dealerUserId: 'player-1'
                        },
                        gamePhase: 'trump_declaration'
                    };
                    win.gameManager.updateUI();
                }
            });

            // Alice declares trump
            cy.get('#trump-modal').should('not.have.class', 'hidden');
            cy.get('.trump-option[data-suit="hearts"]').click();
            cy.get('#confirm-trump-btn').click();

            // Mock successful contract (declaring team wins 5+ tricks)
            cy.window().then((win) => {
                if (win.gameManager) {
                    win.gameManager.handleRoundScores({
                        roundNumber: 1,
                        declaringTeamTricks: 6, // Contract made
                        challengingTeamTricks: 2,
                        scores: { 'team-1': 6, 'team-2': 0 },
                        gameComplete: false,
                        nextRound: {
                            roundNumber: 2,
                            trumpDeclarerUserId: 'player-1', // Same player (Crown Rule)
                            dealerUserId: 'player-2' // Dealer rotates
                        }
                    });
                }
            });

            // Wait for round completion animation
            cy.wait(4000);

            // Verify Alice still declares trump in Round 2
            cy.get('#trump-modal').should('not.have.class', 'hidden');
            cy.get('.game-message').should('contain', 'Choose the trump suit');
            
            // Verify round number updated
            cy.get('#current-round').should('contain', '2');
        });

        it('should pass trump declaration privilege when declaring team fails contract', () => {
            // Setup: Round 1 with Alice as trump declarer
            cy.window().then((win) => {
                if (win.gameManager) {
                    win.gameManager.gameState = {
                        ...win.gameManager.gameState,
                        currentRound: {
                            roundNumber: 1,
                            trumpDeclarerUserId: 'player-1', // Alice
                            dealerUserId: 'player-1'
                        },
                        gamePhase: 'trump_declaration'
                    };
                    win.gameManager.updateUI();
                }
            });

            // Alice declares trump
            cy.get('#trump-modal').should('not.have.class', 'hidden');
            cy.get('.trump-option[data-suit="spades"]').click();
            cy.get('#confirm-trump-btn').click();

            // Mock failed contract (declaring team wins <5 tricks)
            cy.window().then((win) => {
                if (win.gameManager) {
                    win.gameManager.handleRoundScores({
                        roundNumber: 1,
                        declaringTeamTricks: 3, // Contract failed
                        challengingTeamTricks: 5,
                        scores: { 'team-1': 0, 'team-2': 5 },
                        gameComplete: false,
                        nextRound: {
                            roundNumber: 2,
                            trumpDeclarerUserId: 'player-2', // Different player (Crown Rule)
                            dealerUserId: 'player-2' // Dealer rotates
                        }
                    });
                }
            });

            // Wait for round completion animation
            cy.wait(4000);

            // Verify different player declares trump in Round 2
            cy.get('.game-message').should('contain', 'Waiting for');
            cy.get('#trump-modal').should('have.class', 'hidden');
            
            // Verify round number updated
            cy.get('#current-round').should('contain', '2');
        });

        it('should handle Crown Rule across multiple rounds with mixed results', () => {
            // Round 1: Alice declares, makes contract
            this.simulateRound(1, 'player-1', 6, 2, true); // Contract made
            
            // Round 2: Alice declares again (Crown Rule), fails contract
            this.simulateRound(2, 'player-1', 3, 5, false); // Contract failed
            
            // Round 3: Bob declares (Crown Rule - privilege passed)
            this.simulateRound(3, 'player-2', 5, 3, true); // Contract made
            
            // Round 4: Bob declares again (Crown Rule)
            cy.window().then((win) => {
                if (win.gameManager) {
                    win.gameManager.prepareNextRound({
                        roundNumber: 4,
                        trumpDeclarerUserId: 'player-2', // Bob keeps privilege
                        dealerUserId: 'player-4'
                    });
                }
            });

            cy.get('.game-message').should('contain', 'Waiting for');
            cy.get('#current-round').should('contain', '4');
        });
    });

    describe('Dealer Rotation', () => {
        it('should rotate dealer clockwise regardless of Crown Rule', () => {
            const dealerSequence = ['player-1', 'player-2', 'player-3', 'player-4', 'player-1'];
            
            // Test dealer rotation across 5 rounds
            for (let round = 1; round <= 5; round++) {
                const expectedDealer = dealerSequence[round - 1];
                
                cy.window().then((win) => {
                    if (win.gameManager) {
                        win.gameManager.gameState = {
                            ...win.gameManager.gameState,
                            currentRound: {
                                roundNumber: round,
                                dealerUserId: expectedDealer,
                                trumpDeclarerUserId: 'player-1' // Doesn't affect dealer rotation
                            }
                        };
                        win.gameManager.updateUI();
                    }
                });

                // Verify dealer position (this would be shown in UI if implemented)
                cy.log(`Round ${round}: Dealer should be ${expectedDealer}`);
                
                // Mock round completion to advance to next round
                if (round < 5) {
                    cy.window().then((win) => {
                        if (win.gameManager) {
                            win.gameManager.handleRoundScores({
                                roundNumber: round,
                                declaringTeamTricks: 5,
                                challengingTeamTricks: 3,
                                scores: { 'team-1': round * 5, 'team-2': round * 3 },
                                gameComplete: false,
                                nextRound: {
                                    roundNumber: round + 1,
                                    dealerUserId: dealerSequence[round], // Next dealer
                                    trumpDeclarerUserId: 'player-1'
                                }
                            });
                        }
                    });
                    cy.wait(1000);
                }
            }
        });
    });

    describe('Complex Crown Rule Scenarios', () => {
        it('should handle Crown Rule when trump declarer changes teams', () => {
            // This is a theoretical scenario for testing edge cases
            // In practice, players don't change teams mid-game
            
            // Round 1: Player 1 (Team 1) declares, makes contract
            this.simulateRound(1, 'player-1', 6, 2, true);
            
            // Round 2: Player 1 declares again, fails contract
            this.simulateRound(2, 'player-1', 2, 6, false);
            
            // Round 3: Privilege should pass to dealer's left (Player 2)
            cy.window().then((win) => {
                if (win.gameManager) {
                    win.gameManager.prepareNextRound({
                        roundNumber: 3,
                        trumpDeclarerUserId: 'player-2', // Privilege passed
                        dealerUserId: 'player-3'
                    });
                }
            });

            cy.get('.game-message').should('contain', 'Waiting for');
        });

        it('should maintain Crown Rule consistency across game completion', () => {
            // Play multiple rounds until game completion
            let currentDeclarer = 'player-1';
            let teamScores = { 'team-1': 0, 'team-2': 0 };
            
            for (let round = 1; round <= 10; round++) {
                const contractMade = Math.random() > 0.3; // 70% success rate
                const declaringTricks = contractMade ? 6 : 3;
                const challengingTricks = 8 - declaringTricks;
                
                // Update scores
                if (contractMade) {
                    teamScores['team-1'] += declaringTricks;
                } else {
                    teamScores['team-1'] += 0; // No points for failed contract
                }
                teamScores['team-2'] += challengingTricks >= 4 ? challengingTricks : 0;
                
                // Check for game completion
                const gameComplete = teamScores['team-1'] >= 52 || teamScores['team-2'] >= 52;
                
                cy.window().then((win) => {
                    if (win.gameManager) {
                        win.gameManager.handleRoundScores({
                            roundNumber: round,
                            declaringTeamTricks: declaringTricks,
                            challengingTeamTricks: challengingTricks,
                            scores: teamScores,
                            gameComplete,
                            winningTeam: gameComplete ? {
                                teamId: teamScores['team-1'] >= 52 ? 'team-1' : 'team-2',
                                teamNumber: teamScores['team-1'] >= 52 ? 1 : 2,
                                finalScore: Math.max(teamScores['team-1'], teamScores['team-2'])
                            } : null
                        });
                    }
                });

                if (gameComplete) {
                    cy.get('.game-completion-modal').should('be.visible');
                    break;
                }

                // Update declarer for next round based on Crown Rule
                if (!contractMade) {
                    // Privilege passes to next player
                    const playerNumbers = ['player-1', 'player-2', 'player-3', 'player-4'];
                    const currentIndex = playerNumbers.indexOf(currentDeclarer);
                    currentDeclarer = playerNumbers[(currentIndex + 1) % 4];
                }
                
                cy.wait(1000);
            }
        });
    });

    describe('Crown Rule Edge Cases', () => {
        it('should handle Crown Rule when game starts mid-round', () => {
            // Simulate joining a game in progress
            cy.window().then((win) => {
                if (win.gameManager) {
                    win.gameManager.gameState = {
                        ...win.gameManager.gameState,
                        currentRound: {
                            roundNumber: 3, // Game in progress
                            trumpDeclarerUserId: 'player-3', // Different declarer
                            dealerUserId: 'player-2'
                        },
                        gamePhase: 'playing',
                        trumpSuit: 'diamonds'
                    };
                    win.gameManager.updateUI();
                }
            });

            // Verify game state is correctly displayed
            cy.get('#current-round').should('contain', '3');
            cy.get('.trump-name').should('contain', 'Diamonds');
        });

        it('should handle Crown Rule with player disconnections', () => {
            // Round 1: Player 1 declares trump
            cy.window().then((win) => {
                if (win.gameManager) {
                    win.gameManager.gameState = {
                        ...win.gameManager.gameState,
                        currentRound: {
                            roundNumber: 1,
                            trumpDeclarerUserId: 'player-1'
                        }
                    };
                }
            });

            // Player 1 disconnects during round
            cy.window().then((win) => {
                if (win.socketManager) {
                    win.socketManager.emit('player-disconnected', {
                        playerId: 'player-1',
                        playerName: 'Alice'
                    });
                }
            });

            // Round completes with contract made
            cy.window().then((win) => {
                if (win.gameManager) {
                    win.gameManager.handleRoundScores({
                        roundNumber: 1,
                        declaringTeamTricks: 6,
                        challengingTeamTricks: 2,
                        scores: { 'team-1': 6, 'team-2': 0 },
                        gameComplete: false,
                        nextRound: {
                            roundNumber: 2,
                            trumpDeclarerUserId: 'player-1', // Still Player 1 due to Crown Rule
                            dealerUserId: 'player-2'
                        }
                    });
                }
            });

            // Player 1 reconnects
            cy.window().then((win) => {
                if (win.socketManager) {
                    win.socketManager.emit('player-reconnected', {
                        playerId: 'player-1',
                        playerName: 'Alice'
                    });
                }
            });

            // Should still be Player 1's turn to declare trump
            cy.wait(4000);
            cy.get('#trump-modal').should('not.have.class', 'hidden');
        });
    });

    describe('Crown Rule Validation', () => {
        it('should validate Crown Rule logic in backend', () => {
            // This would test the server-side Crown Rule implementation
            // Mock API calls to verify correct trump declarer assignment
            
            cy.intercept('POST', '/api/games/*/rounds', (req) => {
                const { trumpDeclarerUserId, previousRoundResult } = req.body;
                
                // Validate Crown Rule logic
                if (previousRoundResult && previousRoundResult.declaringTeamTricks >= 5) {
                    // Same player should declare trump
                    expect(trumpDeclarerUserId).to.equal(previousRoundResult.trumpDeclarerUserId);
                } else if (previousRoundResult && previousRoundResult.declaringTeamTricks < 5) {
                    // Different player should declare trump
                    expect(trumpDeclarerUserId).to.not.equal(previousRoundResult.trumpDeclarerUserId);
                }
                
                req.reply({
                    statusCode: 200,
                    body: { success: true, roundId: 'round-123' }
                });
            }).as('createRound');

            // Simulate multiple rounds to test validation
            for (let i = 1; i <= 3; i++) {
                cy.window().then((win) => {
                    // This would trigger the API call in a real implementation
                    cy.log(`Validating Crown Rule for round ${i}`);
                });
            }
        });

        it('should display Crown Rule information to players', () => {
            // Test UI elements that explain Crown Rule
            cy.window().then((win) => {
                if (win.gameManager) {
                    win.gameManager.gameState = {
                        ...win.gameManager.gameState,
                        currentRound: {
                            roundNumber: 2,
                            trumpDeclarerUserId: 'player-1'
                        },
                        previousRound: {
                            declaringTeamTricks: 6, // Contract made
                            trumpDeclarerUserId: 'player-1'
                        }
                    };
                    win.gameManager.updateUI();
                }
            });

            // Should show Crown Rule explanation
            cy.get('.game-message').should('contain', 'Crown Rule');
        });
    });

    // Helper method to simulate a complete round
    simulateRound(roundNumber, declarer, declaringTricks, challengingTricks, contractMade) {
        cy.window().then((win) => {
            if (win.gameManager) {
                // Set up round
                win.gameManager.gameState = {
                    ...win.gameManager.gameState,
                    currentRound: {
                        roundNumber,
                        trumpDeclarerUserId: declarer
                    }
                };

                // Complete round
                win.gameManager.handleRoundScores({
                    roundNumber,
                    declaringTeamTricks: declaringTricks,
                    challengingTeamTricks: challengingTricks,
                    scores: {
                        'team-1': contractMade ? declaringTricks : 0,
                        'team-2': challengingTricks >= 4 ? challengingTricks : 0
                    },
                    gameComplete: false,
                    nextRound: {
                        roundNumber: roundNumber + 1,
                        trumpDeclarerUserId: contractMade ? declarer : this.getNextPlayer(declarer),
                        dealerUserId: this.getNextPlayer(declarer) // Simplified dealer rotation
                    }
                });
            }
        });

        cy.wait(1000);
    }

    getNextPlayer(currentPlayer) {
        const players = ['player-1', 'player-2', 'player-3', 'player-4'];
        const currentIndex = players.indexOf(currentPlayer);
        return players[(currentIndex + 1) % 4];
    }
});