/**
 * Complete Game Flow End-to-End Tests
 * Tests the entire game flow from login to game completion
 */

describe('Complete Game Flow', () => {
    const testUsers = [
        { userId: 'player-1', username: 'Alice', token: 'token-1' },
        { userId: 'player-2', username: 'Bob', token: 'token-2' },
        { userId: 'player-3', username: 'Charlie', token: 'token-3' },
        { userId: 'player-4', username: 'Diana', token: 'token-4' }
    ];

    beforeEach(() => {
        // Mock WebSocket server responses
        cy.intercept('GET', '/socket.io/*', { fixture: 'socket-io-response.json' });
        
        // Mock authentication API
        cy.intercept('POST', '/api/auth/login', {
            statusCode: 200,
            body: {
                success: true,
                token: 'test-jwt-token',
                user: {
                    userId: 'player-1',
                    username: 'Alice'
                }
            }
        }).as('login');

        // Mock game creation API
        cy.intercept('POST', '/api/games', {
            statusCode: 200,
            body: {
                success: true,
                game: {
                    gameId: 'test-game-123',
                    gameCode: 'ABC123',
                    hostId: 'player-1'
                }
            }
        }).as('createGame');

        // Mock statistics API
        cy.intercept('GET', '/api/statistics/game/*', {
            statusCode: 200,
            body: {
                success: true,
                data: {
                    gameId: 'test-game-123',
                    duration: 1800000,
                    totalRounds: 3,
                    players: testUsers.map((user, index) => ({
                        userId: user.userId,
                        username: user.username,
                        teamId: index < 2 ? 'team-1' : 'team-2',
                        tricksWon: Math.floor(Math.random() * 10),
                        teamScore: index < 2 ? 52 : 31,
                        isWinner: index < 2
                    }))
                }
            }
        }).as('getGameStats');
    });

    describe('Full 4-Player Game Session', () => {
        it('should complete a full game from login to statistics', () => {
            // Step 1: Login
            cy.visit('/login.html');
            cy.get('#username').type('alice@example.com');
            cy.get('#password').type('password123');
            cy.get('#login-form').submit();
            
            cy.wait('@login');
            cy.url().should('include', '/dashboard.html');

            // Step 2: Create Game
            cy.get('#create-room-btn').click();
            cy.wait('@createGame');
            
            // Should navigate to lobby
            cy.url().should('include', '/lobby.html');
            cy.get('#game-code-display').should('contain', 'ABC123');

            // Step 3: Simulate other players joining
            cy.window().then((win) => {
                const mockSocket = {
                    emit: cy.stub(),
                    on: cy.stub(),
                    connected: true
                };

                // Mock WebSocket events for other players joining
                if (win.socketManager) {
                    win.socketManager.socket = mockSocket;
                    
                    // Simulate players joining
                    testUsers.slice(1).forEach((user, index) => {
                        setTimeout(() => {
                            win.socketManager.emit('player-joined', {
                                gameId: 'test-game-123',
                                player: user,
                                playerCount: index + 2
                            });
                        }, (index + 1) * 500);
                    });
                }
            });

            // Wait for all players to join
            cy.get('.player-slot.occupied').should('have.length', 4);

            // Step 4: All players ready
            cy.get('#ready-btn').click();
            
            // Simulate other players becoming ready
            cy.window().then((win) => {
                testUsers.slice(1).forEach((user, index) => {
                    setTimeout(() => {
                        if (win.socketManager) {
                            win.socketManager.emit('player-ready-changed', {
                                playerId: user.userId,
                                isReady: true,
                                allReady: index === 2 // Last player
                            });
                        }
                    }, (index + 1) * 300);
                });
            });

            // Step 5: Form teams and start game
            cy.get('#form-teams-btn').should('be.enabled').click();
            cy.get('.team-assignment').should('be.visible');
            
            cy.get('#start-game-btn').should('be.enabled').click();
            
            // Should navigate to game page
            cy.url().should('include', '/game.html');

            // Step 6: Game initialization
            cy.get('#game-container').should('be.visible');
            cy.get('#current-round').should('contain', '1');
            
            // Mock initial game state
            cy.window().then((win) => {
                if (win.gameManager) {
                    win.gameManager.gameState = {
                        ...win.gameManager.gameState,
                        gameId: 'test-game-123',
                        gamePhase: 'trump_declaration',
                        currentPlayer: 'player-1',
                        isMyTurn: true,
                        playerHand: [
                            { suit: 'hearts', rank: 'A' },
                            { suit: 'hearts', rank: 'K' },
                            { suit: 'diamonds', rank: 'Q' },
                            { suit: 'spades', rank: 'J' }
                        ]
                    };
                    win.gameManager.updateUI();
                }
            });

            // Step 7: Trump declaration
            cy.get('#trump-modal').should('not.have.class', 'hidden');
            cy.get('.trump-option[data-suit="hearts"]').click();
            cy.get('#confirm-trump-btn').click();

            // Mock trump declared response
            cy.window().then((win) => {
                if (win.gameManager) {
                    win.gameManager.handleTrumpDeclared({
                        trumpSuit: 'hearts',
                        declaredBy: 'player-1',
                        phase: 'playing'
                    });
                }
            });

            cy.get('.trump-name').should('contain', 'Hearts');

            // Step 8: Play multiple tricks
            this.playCompleteTrick(1);
            this.playCompleteTrick(2);
            this.playCompleteTrick(3);
            this.playCompleteTrick(4);
            this.playCompleteTrick(5);
            this.playCompleteTrick(6);
            this.playCompleteTrick(7);
            this.playCompleteTrick(8);

            // Step 9: Round completion
            cy.window().then((win) => {
                if (win.gameManager) {
                    win.gameManager.handleRoundScores({
                        roundNumber: 1,
                        declaringTeamTricks: 6,
                        challengingTeamTricks: 2,
                        scores: { 'team-1': 6, 'team-2': 0 },
                        gameComplete: false
                    });
                }
            });

            cy.get('.round-completion-overlay').should('be.visible');
            cy.get('.round-completion-content').should('contain', 'Round 1 Complete!');

            // Step 10: Play additional rounds until game completion
            this.playCompleteRound(2, { 'team-1': 18, 'team-2': 8 });
            this.playCompleteRound(3, { 'team-1': 52, 'team-2': 20 }, true);

            // Step 11: Game completion
            cy.get('.game-completion-modal').should('be.visible');
            cy.get('.winner-announcement').should('contain', 'Team 1 Wins!');

            // Step 12: View statistics
            cy.get('#view-statistics').click();
            cy.wait('@getGameStats');
            
            cy.get('.statistics-modal').should('be.visible');
            cy.get('.player-performance').should('be.visible');
            cy.get('.personal-stats').should('be.visible');

            // Step 13: Return to dashboard
            cy.get('#close-stats-modal').click();
            cy.get('#return-to-dashboard').click();
            
            cy.url().should('include', '/dashboard.html');
        });

        it('should handle Crown Rule implementation across multiple rounds', () => {
            // Start game and navigate to game page
            this.setupGameToPlayingPhase();

            // Round 1: Declaring team makes contract
            this.playCompleteRound(1, { 'team-1': 6, 'team-2': 2 }, false, true);

            // Verify same player declares trump in Round 2 (Crown Rule)
            cy.window().then((win) => {
                if (win.gameManager) {
                    win.gameManager.prepareNextRound({
                        roundNumber: 2,
                        trumpDeclarerUserId: 'player-1' // Same player
                    });
                }
            });

            cy.get('#trump-modal').should('not.have.class', 'hidden');
            cy.get('.game-message').should('contain', 'Choose the trump suit');

            // Round 2: Declaring team fails contract
            this.playCompleteRound(2, { 'team-1': 3, 'team-2': 5 }, false, false);

            // Verify trump declaration passes to different player (Crown Rule)
            cy.window().then((win) => {
                if (win.gameManager) {
                    win.gameManager.prepareNextRound({
                        roundNumber: 3,
                        trumpDeclarerUserId: 'player-2' // Different player
                    });
                }
            });

            cy.get('.game-message').should('contain', 'Waiting for');
        });

        it('should handle player disconnection and reconnection', () => {
            this.setupGameToPlayingPhase();

            // Simulate player disconnection
            cy.window().then((win) => {
                if (win.socketManager) {
                    win.socketManager.emit('player-disconnected', {
                        playerId: 'player-2',
                        playerName: 'Bob'
                    });
                }
            });

            cy.get('.game-message').should('contain', 'Bob disconnected');

            // Simulate reconnection
            cy.window().then((win) => {
                if (win.socketManager) {
                    win.socketManager.emit('player-reconnected', {
                        playerId: 'player-2',
                        playerName: 'Bob'
                    });
                }
            });

            cy.get('.game-message').should('contain', 'Bob reconnected');
        });

        it('should validate all game rules throughout complete game', () => {
            this.setupGameToPlayingPhase();

            // Test suit following rules
            cy.window().then((win) => {
                if (win.gameManager) {
                    win.gameManager.gameState = {
                        ...win.gameManager.gameState,
                        isMyTurn: true,
                        currentTrick: {
                            cardsPlayed: [
                                { playerId: 'player-2', card: { suit: 'hearts', rank: 'K' } }
                            ]
                        },
                        playerHand: [
                            { suit: 'hearts', rank: 'A' },
                            { suit: 'spades', rank: 'Q' }
                        ]
                    };
                    win.gameManager.updateUI();
                }
            });

            // Try to play wrong suit
            cy.get('.card[data-suit="spades"]').click();
            cy.get('.game-message.error').should('contain', 'Must follow suit');

            // Play correct suit
            cy.get('.card[data-suit="hearts"]').click();
            cy.get('.game-message').should('contain', 'You played A of hearts');

            // Test trump rules
            cy.window().then((win) => {
                if (win.gameManager) {
                    win.gameManager.gameState = {
                        ...win.gameManager.gameState,
                        trumpSuit: 'spades',
                        isMyTurn: true,
                        currentTrick: {
                            cardsPlayed: [
                                { playerId: 'player-2', card: { suit: 'hearts', rank: 'K' } }
                            ]
                        },
                        playerHand: [
                            { suit: 'spades', rank: 'A' }, // Trump
                            { suit: 'diamonds', rank: 'Q' } // Off-suit
                        ]
                    };
                    win.gameManager.updateUI();
                }
            });

            // Both cards should be playable (no hearts in hand)
            cy.get('.card').should('not.have.class', 'disabled');
        });
    });

    describe('Error Handling and Edge Cases', () => {
        it('should handle network errors gracefully', () => {
            // Mock network failure
            cy.intercept('POST', '/api/auth/login', { forceNetworkError: true }).as('loginError');

            cy.visit('/login.html');
            cy.get('#username').type('alice@example.com');
            cy.get('#password').type('password123');
            cy.get('#login-form').submit();

            // Should show error message
            cy.get('.error-message').should('be.visible');
        });

        it('should handle invalid game states', () => {
            this.setupGameToPlayingPhase();

            // Simulate invalid game state
            cy.window().then((win) => {
                if (win.gameManager) {
                    win.gameManager.handleGameError({
                        type: 'invalid_game_state',
                        message: 'Game state is corrupted'
                    });
                }
            });

            cy.get('.game-message.error').should('contain', 'Game state is corrupted');
        });

        it('should handle WebSocket connection issues', () => {
            this.setupGameToPlayingPhase();

            // Simulate connection loss
            cy.window().then((win) => {
                if (win.socketManager) {
                    win.socketManager.emit('disconnect', { reason: 'transport close' });
                }
            });

            cy.get('#status-text').should('contain', 'Disconnected');

            // Simulate reconnection
            cy.window().then((win) => {
                if (win.socketManager) {
                    win.socketManager.emit('connect');
                }
            });

            cy.get('#status-text').should('contain', 'Connected');
        });
    });

    describe('Performance and Load Testing', () => {
        it('should handle rapid card plays without issues', () => {
            this.setupGameToPlayingPhase();

            // Rapidly play multiple cards
            for (let i = 0; i < 8; i++) {
                cy.window().then((win) => {
                    if (win.gameManager) {
                        win.gameManager.handleCardPlayed({
                            playedBy: `player-${(i % 4) + 1}`,
                            card: { suit: 'hearts', rank: 'A' },
                            nextPlayerId: `player-${((i + 1) % 4) + 1}`
                        });
                    }
                });
                cy.wait(100);
            }

            // Game should remain stable
            cy.get('#game-container').should('be.visible');
        });

        it('should handle multiple simultaneous game events', () => {
            this.setupGameToPlayingPhase();

            // Simulate multiple events at once
            cy.window().then((win) => {
                if (win.gameManager) {
                    // Multiple rapid events
                    win.gameManager.handleCardPlayed({
                        playedBy: 'player-2',
                        card: { suit: 'hearts', rank: 'K' }
                    });
                    
                    win.gameManager.handleTrickWon({
                        winnerId: 'player-1',
                        winningCard: { suit: 'hearts', rank: 'A' }
                    });
                    
                    win.gameManager.updateConnectionStatus('connected');
                }
            });

            // Should handle all events without crashing
            cy.get('#game-container').should('be.visible');
        });
    });

    // Helper methods
    playCompleteTrick(trickNumber) {
        cy.log(`Playing trick ${trickNumber}`);
        
        // Mock 4 cards being played
        const cards = [
            { suit: 'hearts', rank: 'A' },
            { suit: 'hearts', rank: 'K' },
            { suit: 'hearts', rank: 'Q' },
            { suit: 'hearts', rank: 'J' }
        ];

        cards.forEach((card, index) => {
            cy.window().then((win) => {
                if (win.gameManager) {
                    win.gameManager.handleCardPlayed({
                        playedBy: `player-${index + 1}`,
                        playedByName: testUsers[index].username,
                        card: card,
                        nextPlayerId: index < 3 ? `player-${index + 2}` : null
                    });
                }
            });
            cy.wait(200);
        });

        // Mock trick completion
        cy.window().then((win) => {
            if (win.gameManager) {
                win.gameManager.handleTrickWon({
                    winnerId: 'player-1',
                    winnerName: 'Alice',
                    winningCard: cards[0],
                    nextLeaderId: 'player-1'
                });
            }
        });

        cy.wait(1000); // Wait for trick completion animation
    }

    playCompleteRound(roundNumber, scores, gameComplete = false, contractMade = true) {
        cy.log(`Playing round ${roundNumber}`);
        
        // Play 8 tricks
        for (let i = 1; i <= 8; i++) {
            this.playCompleteTrick(i);
        }

        // Mock round completion
        cy.window().then((win) => {
            if (win.gameManager) {
                win.gameManager.handleRoundScores({
                    roundNumber,
                    declaringTeamTricks: contractMade ? 6 : 3,
                    challengingTeamTricks: contractMade ? 2 : 5,
                    scores,
                    gameComplete,
                    winningTeam: gameComplete ? {
                        teamId: 'team-1',
                        teamNumber: 1,
                        finalScore: scores['team-1']
                    } : null
                });
            }
        });

        if (!gameComplete) {
            cy.wait(3000); // Wait for round completion animation
        }
    }

    setupGameToPlayingPhase() {
        cy.visit('/game.html?gameId=test-game-123');
        
        // Mock authentication
        cy.window().then((win) => {
            win.localStorage.setItem('auth_token', 'test-token');
            win.localStorage.setItem('user_data', JSON.stringify({
                userId: 'player-1',
                username: 'Alice'
            }));
        });

        cy.get('#game-container').should('be.visible');

        // Mock game state in playing phase
        cy.window().then((win) => {
            if (win.gameManager) {
                win.gameManager.gameState = {
                    ...win.gameManager.gameState,
                    gameId: 'test-game-123',
                    gamePhase: 'playing',
                    trumpSuit: 'hearts',
                    currentPlayer: 'player-1',
                    isMyTurn: true,
                    currentRound: { roundNumber: 1, currentTrick: 1 },
                    currentTrick: { trickId: 'trick-1', cardsPlayed: [] },
                    playerHand: [
                        { suit: 'hearts', rank: 'A' },
                        { suit: 'spades', rank: 'K' },
                        { suit: 'diamonds', rank: 'Q' },
                        { suit: 'clubs', rank: 'J' }
                    ]
                };
                win.gameManager.updateUI();
            }
        });
    }
});