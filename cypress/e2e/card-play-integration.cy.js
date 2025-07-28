/**
 * Card Play Integration Tests
 * Tests the complete card play flow with game rules enforcement
 */

describe('Card Play Integration', () => {
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

    describe('Card Play Validation', () => {
        it('should validate suit following rules', () => {
            // Mock game state with cards played
            cy.window().then((win) => {
                const gameManager = win.gameManager;
                if (gameManager) {
                    gameManager.gameState = {
                        ...gameManager.gameState,
                        gamePhase: 'playing',
                        isMyTurn: true,
                        currentTrick: {
                            trickId: 'trick-1',
                            cardsPlayed: [
                                {
                                    playerId: 'player-2',
                                    card: { suit: 'hearts', rank: 'K' }
                                }
                            ]
                        },
                        playerHand: [
                            { suit: 'hearts', rank: 'A' },
                            { suit: 'spades', rank: 'Q' },
                            { suit: 'diamonds', rank: 'J' }
                        ]
                    };
                    gameManager.updateUI();
                }
            });

            // Try to play a non-heart card when hearts are available
            cy.get('.card[data-suit="spades"]').click();
            
            // Should show error message
            cy.get('.game-message.error')
                .should('be.visible')
                .and('contain', 'Must follow suit');

            // Hearts card should be playable
            cy.get('.card[data-suit="hearts"]').should('not.have.class', 'disabled');
            
            // Non-hearts cards should be disabled
            cy.get('.card[data-suit="spades"]').should('have.class', 'disabled');
            cy.get('.card[data-suit="diamonds"]').should('have.class', 'disabled');
        });

        it('should allow any card when no lead suit', () => {
            // Mock game state with no cards played in trick
            cy.window().then((win) => {
                const gameManager = win.gameManager;
                if (gameManager) {
                    gameManager.gameState = {
                        ...gameManager.gameState,
                        gamePhase: 'playing',
                        isMyTurn: true,
                        currentTrick: {
                            trickId: 'trick-1',
                            cardsPlayed: []
                        },
                        playerHand: [
                            { suit: 'hearts', rank: 'A' },
                            { suit: 'spades', rank: 'Q' },
                            { suit: 'diamonds', rank: 'J' }
                        ]
                    };
                    gameManager.updateUI();
                }
            });

            // All cards should be playable
            cy.get('.card').should('not.have.class', 'disabled');
        });

        it('should allow trump or off-suit when cannot follow suit', () => {
            // Mock game state where player cannot follow suit
            cy.window().then((win) => {
                const gameManager = win.gameManager;
                if (gameManager) {
                    gameManager.gameState = {
                        ...gameManager.gameState,
                        gamePhase: 'playing',
                        isMyTurn: true,
                        trumpSuit: 'spades',
                        currentTrick: {
                            trickId: 'trick-1',
                            cardsPlayed: [
                                {
                                    playerId: 'player-2',
                                    card: { suit: 'hearts', rank: 'K' }
                                }
                            ]
                        },
                        playerHand: [
                            { suit: 'spades', rank: 'A' }, // Trump
                            { suit: 'diamonds', rank: 'Q' }, // Off-suit
                            { suit: 'clubs', rank: 'J' } // Off-suit
                        ]
                    };
                    gameManager.updateUI();
                }
            });

            // All cards should be playable since no hearts available
            cy.get('.card').should('not.have.class', 'disabled');
        });
    });

    describe('Card Play Flow', () => {
        it('should handle successful card play', () => {
            // Mock successful card play
            cy.window().then((win) => {
                const gameManager = win.gameManager;
                if (gameManager) {
                    gameManager.gameState = {
                        ...gameManager.gameState,
                        gamePhase: 'playing',
                        isMyTurn: true,
                        currentTrick: {
                            trickId: 'trick-1',
                            cardsPlayed: []
                        },
                        playerHand: [
                            { suit: 'hearts', rank: 'A' },
                            { suit: 'spades', rank: 'Q' }
                        ]
                    };
                    gameManager.updateUI();

                    // Mock socket emit
                    gameManager.socket = {
                        emit: cy.stub().as('socketEmit')
                    };
                }
            });

            // Play a card
            cy.get('.card[data-suit="hearts"]').click();

            // Should emit play-card event
            cy.get('@socketEmit').should('have.been.calledWith', 'play-card');

            // Card should be removed from hand
            cy.get('.card[data-suit="hearts"]').should('not.exist');

            // Should show play message
            cy.get('.game-message')
                .should('contain', 'You played A of hearts');
        });

        it('should show card play animation', () => {
            // Mock card play response
            cy.window().then((win) => {
                const gameManager = win.gameManager;
                if (gameManager) {
                    gameManager.gameState = {
                        ...gameManager.gameState,
                        gamePhase: 'playing'
                    };

                    // Simulate card played event
                    gameManager.handleCardPlayed({
                        playedBy: 'player-2',
                        playedByName: 'Player 2',
                        card: { suit: 'hearts', rank: 'K' },
                        cardsInTrick: [
                            {
                                playerId: 'player-2',
                                card: { suit: 'hearts', rank: 'K' }
                            }
                        ],
                        nextPlayerId: 'test-user-1'
                    });
                }
            });

            // Should show played card in trick area
            cy.get('.played-card-slot.active').should('exist');
            cy.get('.played-card').should('contain', 'K');

            // Should show game message
            cy.get('.game-message')
                .should('contain', 'Player 2 played K of hearts');
        });

        it('should handle card play errors', () => {
            // Mock error response
            cy.window().then((win) => {
                const gameManager = win.gameManager;
                if (gameManager) {
                    gameManager.gameState = {
                        ...gameManager.gameState,
                        gamePhase: 'playing',
                        isMyTurn: true
                    };

                    // Simulate error
                    gameManager.handleGameError({
                        type: 'invalid_card_play',
                        message: 'Must follow suit when possible'
                    });
                }
            });

            // Should show error message
            cy.get('.game-message.error')
                .should('be.visible')
                .and('contain', 'Must follow suit');

            // Should highlight valid cards
            cy.get('.card.valid-play').should('exist');
        });
    });

    describe('Turn Management', () => {
        it('should prevent play when not player turn', () => {
            // Mock game state where it's not player's turn
            cy.window().then((win) => {
                const gameManager = win.gameManager;
                if (gameManager) {
                    gameManager.gameState = {
                        ...gameManager.gameState,
                        gamePhase: 'playing',
                        isMyTurn: false,
                        currentTurnPlayer: 'player-2',
                        playerHand: [
                            { suit: 'hearts', rank: 'A' }
                        ]
                    };
                    gameManager.updateUI();
                }
            });

            // Cards should be disabled
            cy.get('.card').should('have.class', 'disabled');

            // Clicking should show warning
            cy.get('.card').click();
            cy.get('.game-message')
                .should('contain', "It's not your turn");
        });

        it('should update turn indicators', () => {
            // Mock turn change
            cy.window().then((win) => {
                const gameManager = win.gameManager;
                if (gameManager) {
                    gameManager.gameState = {
                        ...gameManager.gameState,
                        currentTurnPlayer: 'player-2'
                    };
                    gameManager.updateTurnIndicators();
                }
            });

            // Should highlight current player's turn
            cy.get('.turn-indicator.active').should('exist');
        });
    });

    describe('Lead Suit Indication', () => {
        it('should show lead suit indicator', () => {
            // Mock first card played
            cy.window().then((win) => {
                const gameManager = win.gameManager;
                if (gameManager) {
                    gameManager.showLeadSuitIndicator('hearts');
                }
            });

            // Should show lead suit indicator
            cy.get('.lead-suit-indicator')
                .should('be.visible')
                .and('contain', 'Lead:')
                .and('contain', '♥');
        });

        it('should clear lead suit on new trick', () => {
            // Mock trick completion
            cy.window().then((win) => {
                const gameManager = win.gameManager;
                if (gameManager) {
                    gameManager.clearPlayedCards();
                }
            });

            // Lead suit indicator should be cleared
            cy.get('.lead-suit-indicator').should('not.exist');
        });
    });

    describe('Visual Feedback', () => {
        it('should highlight valid cards on error', () => {
            // Mock invalid play error
            cy.window().then((win) => {
                const gameManager = win.gameManager;
                if (gameManager) {
                    gameManager.gameState = {
                        ...gameManager.gameState,
                        isMyTurn: true,
                        playerHand: [
                            { suit: 'hearts', rank: 'A' },
                            { suit: 'spades', rank: 'Q' }
                        ]
                    };
                    gameManager.highlightValidCards();
                }
            });

            // Valid cards should be highlighted
            cy.get('.card.valid-play').should('exist');
        });

        it('should show card selection feedback', () => {
            // Mock card selection
            cy.window().then((win) => {
                const gameManager = win.gameManager;
                if (gameManager) {
                    gameManager.gameState = {
                        ...gameManager.gameState,
                        isMyTurn: true,
                        playerHand: [
                            { suit: 'hearts', rank: 'A' }
                        ]
                    };
                    gameManager.updateUI();
                }
            });

            // Hover should show feedback
            cy.get('.card').trigger('mouseover');
            cy.get('.card').should('have.class', 'hover');
        });
    });
});