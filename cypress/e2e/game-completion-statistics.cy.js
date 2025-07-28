/**
 * Game Completion and Statistics Tests
 * Tests the complete game completion flow and statistics tracking
 */

describe('Game Completion and Statistics', () => {
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

    describe('Game Completion Flow', () => {
        it('should handle game completion announcement', () => {
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
                        },
                        statistics: {
                            duration: 1800000, // 30 minutes
                            playerStats: [
                                {
                                    userId: 'test-user-1',
                                    username: 'TestPlayer1',
                                    teamId: 'team-1',
                                    tricksWon: 15,
                                    teamScore: 52,
                                    isWinner: true
                                }
                            ]
                        }
                    });
                }
            });

            // Should show game completion modal
            cy.get('.game-completion-modal').should('be.visible');
            cy.get('.game-complete-header').should('contain', 'Game Complete!');
            cy.get('.winner-announcement').should('contain', 'Team 1 Wins!');
        });

        it('should display final scores correctly', () => {
            // Mock game completion with detailed scores
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
            
            // Winner should be highlighted
            cy.get('.team-final-score.winner').should('exist');
            cy.get('.team-final-score.winner').should('contain', '52 points');
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

    describe('Game Statistics Display', () => {
        beforeEach(() => {
            // Mock fetch for statistics API
            cy.intercept('GET', '/api/statistics/game/*', {
                statusCode: 200,
                body: {
                    success: true,
                    data: {
                        gameId: 'test-game-123',
                        duration: 1800000,
                        totalRounds: 3,
                        totalTricks: 24,
                        status: 'completed',
                        players: [
                            {
                                userId: 'test-user-1',
                                username: 'TestPlayer1',
                                teamId: 'team-1',
                                tricksWon: 15,
                                teamScore: 52,
                                isWinner: true
                            },
                            {
                                userId: 'test-user-2',
                                username: 'TestPlayer2',
                                teamId: 'team-1',
                                tricksWon: 8,
                                teamScore: 52,
                                isWinner: true
                            },
                            {
                                userId: 'test-user-3',
                                username: 'TestPlayer3',
                                teamId: 'team-2',
                                tricksWon: 1,
                                teamScore: 31,
                                isWinner: false
                            },
                            {
                                userId: 'test-user-4',
                                username: 'TestPlayer4',
                                teamId: 'team-2',
                                tricksWon: 0,
                                teamScore: 31,
                                isWinner: false
                            }
                        ],
                        trumpStats: {
                            'test-user-1': {
                                declarations: 2,
                                successful: 2,
                                failed: 0
                            },
                            'test-user-3': {
                                declarations: 1,
                                successful: 0,
                                failed: 1
                            }
                        }
                    }
                }
            }).as('getGameStats');
        });

        it('should display game statistics modal', () => {
            // Mock game completion and show statistics
            cy.window().then((win) => {
                const gameManager = win.gameManager;
                if (gameManager) {
                    gameManager.gameState.gameId = 'test-game-123';
                    gameManager.showGameStatistics();
                }
            });

            // Wait for API call
            cy.wait('@getGameStats');

            // Should show statistics modal
            cy.get('.statistics-modal').should('be.visible');
            cy.get('.modal-header h2').should('contain', 'Game Statistics');
        });

        it('should show game overview statistics', () => {
            // Trigger statistics display
            cy.window().then((win) => {
                const gameManager = win.gameManager;
                if (gameManager) {
                    gameManager.gameState.gameId = 'test-game-123';
                    gameManager.showGameStatistics();
                }
            });

            cy.wait('@getGameStats');

            // Should show game overview
            cy.get('.game-overview').should('be.visible');
            cy.get('.stat-item').should('have.length.at.least', 4);
            
            // Check specific statistics
            cy.get('.stat-item').contains('Duration').parent().should('contain', '30m');
            cy.get('.stat-item').contains('Total Rounds').parent().should('contain', '3');
            cy.get('.stat-item').contains('Total Tricks').parent().should('contain', '24');
        });

        it('should display player performance table', () => {
            // Trigger statistics display
            cy.window().then((win) => {
                const gameManager = win.gameManager;
                if (gameManager) {
                    gameManager.gameState.gameId = 'test-game-123';
                    gameManager.showGameStatistics();
                }
            });

            cy.wait('@getGameStats');

            // Should show player performance
            cy.get('.player-performance').should('be.visible');
            cy.get('.table-row').should('have.length', 4);
            
            // Check winner highlighting
            cy.get('.table-row.winner').should('have.length', 2);
            cy.get('.result.win').should('contain', '🏆 Win');
            cy.get('.result.loss').should('contain', '❌ Loss');
        });

        it('should show trump declaration statistics', () => {
            // Trigger statistics display
            cy.window().then((win) => {
                const gameManager = win.gameManager;
                if (gameManager) {
                    gameManager.gameState.gameId = 'test-game-123';
                    gameManager.showGameStatistics();
                }
            });

            cy.wait('@getGameStats');

            // Should show trump statistics
            cy.get('.trump-statistics').should('be.visible');
            cy.get('.trump-stat-item').should('have.length', 2);
            
            // Check trump success rates
            cy.get('.success-rate').should('contain', '100%');
            cy.get('.success-rate').should('contain', '0%');
        });

        it('should display personal statistics', () => {
            // Trigger statistics display
            cy.window().then((win) => {
                const gameManager = win.gameManager;
                if (gameManager) {
                    gameManager.gameState.gameId = 'test-game-123';
                    gameManager.showGameStatistics();
                }
            });

            cy.wait('@getGameStats');

            // Should show personal stats
            cy.get('.personal-stats').should('be.visible');
            cy.get('.personal-stat').should('have.length.at.least', 3);
            
            // Check personal performance
            cy.get('.personal-stat').contains('Tricks Won').parent().should('contain', '15');
            cy.get('.personal-stat').contains('Team Score').parent().should('contain', '52');
            cy.get('.personal-stat').contains('Result').parent().should('contain', 'Victory');
        });

        it('should handle statistics modal actions', () => {
            // Trigger statistics display
            cy.window().then((win) => {
                const gameManager = win.gameManager;
                if (gameManager) {
                    gameManager.gameState.gameId = 'test-game-123';
                    gameManager.showGameStatistics();
                }
            });

            cy.wait('@getGameStats');

            // Should have action buttons
            cy.get('#share-stats').should('be.visible');
            cy.get('#download-stats').should('be.visible');
            cy.get('#view-profile').should('be.visible');

            // Test close functionality
            cy.get('#close-stats-modal').click();
            cy.get('.statistics-modal').should('not.exist');
        });
    });

    describe('Statistics Sharing and Export', () => {
        beforeEach(() => {
            // Mock statistics API
            cy.intercept('GET', '/api/statistics/game/*', {
                statusCode: 200,
                body: {
                    success: true,
                    data: {
                        gameId: 'test-game-123',
                        duration: 1800000,
                        players: [
                            {
                                userId: 'test-user-1',
                                username: 'TestPlayer1',
                                tricksWon: 15,
                                isWinner: true
                            }
                        ]
                    }
                }
            }).as('getGameStats');
        });

        it('should share game statistics', () => {
            // Mock navigator.clipboard
            cy.window().then((win) => {
                win.navigator.clipboard = {
                    writeText: cy.stub().resolves()
                };
            });

            // Trigger statistics display
            cy.window().then((win) => {
                const gameManager = win.gameManager;
                if (gameManager) {
                    gameManager.gameState.gameId = 'test-game-123';
                    gameManager.showGameStatistics();
                }
            });

            cy.wait('@getGameStats');

            // Click share button
            cy.get('#share-stats').click();

            // Should show success message
            cy.get('.game-message').should('contain', 'copied to clipboard');
        });

        it('should download game statistics', () => {
            // Trigger statistics display
            cy.window().then((win) => {
                const gameManager = win.gameManager;
                if (gameManager) {
                    gameManager.gameState.gameId = 'test-game-123';
                    gameManager.showGameStatistics();
                }
            });

            cy.wait('@getGameStats');

            // Click download button
            cy.get('#download-stats').click();

            // Should show download message
            cy.get('.game-message').should('contain', 'downloaded');
        });

        it('should navigate to profile page', () => {
            // Trigger statistics display
            cy.window().then((win) => {
                const gameManager = win.gameManager;
                if (gameManager) {
                    gameManager.gameState.gameId = 'test-game-123';
                    gameManager.showGameStatistics();
                }
            });

            cy.wait('@getGameStats');

            // Click view profile button
            cy.get('#view-profile').click();

            // Should navigate to profile
            cy.url().should('include', '/profile.html');
        });
    });

    describe('Statistics Error Handling', () => {
        it('should handle statistics API errors', () => {
            // Mock API error
            cy.intercept('GET', '/api/statistics/game/*', {
                statusCode: 500,
                body: {
                    success: false,
                    message: 'Failed to fetch statistics'
                }
            }).as('getGameStatsError');

            // Trigger statistics display
            cy.window().then((win) => {
                const gameManager = win.gameManager;
                if (gameManager) {
                    gameManager.gameState.gameId = 'test-game-123';
                    gameManager.showGameStatistics();
                }
            });

            cy.wait('@getGameStatsError');

            // Should show error message
            cy.get('.game-message.error').should('contain', 'Failed to load game statistics');
        });

        it('should handle missing statistics data', () => {
            // Mock empty statistics response
            cy.intercept('GET', '/api/statistics/game/*', {
                statusCode: 200,
                body: {
                    success: true,
                    data: {
                        gameId: 'test-game-123',
                        players: []
                    }
                }
            }).as('getEmptyStats');

            // Trigger statistics display
            cy.window().then((win) => {
                const gameManager = win.gameManager;
                if (gameManager) {
                    gameManager.gameState.gameId = 'test-game-123';
                    gameManager.showGameStatistics();
                }
            });

            cy.wait('@getEmptyStats');

            // Should show no data message
            cy.get('.no-data').should('contain', 'No player data available');
        });
    });

    describe('Mobile Responsiveness', () => {
        it('should display statistics modal correctly on mobile', () => {
            // Set mobile viewport
            cy.viewport(375, 667);

            // Mock statistics API
            cy.intercept('GET', '/api/statistics/game/*', {
                statusCode: 200,
                body: {
                    success: true,
                    data: {
                        gameId: 'test-game-123',
                        duration: 1800000,
                        players: [
                            {
                                userId: 'test-user-1',
                                username: 'TestPlayer1',
                                tricksWon: 15,
                                isWinner: true
                            }
                        ]
                    }
                }
            }).as('getMobileStats');

            // Trigger statistics display
            cy.window().then((win) => {
                const gameManager = win.gameManager;
                if (gameManager) {
                    gameManager.gameState.gameId = 'test-game-123';
                    gameManager.showGameStatistics();
                }
            });

            cy.wait('@getMobileStats');

            // Should be responsive
            cy.get('.statistics-modal .modal-content').should('have.css', 'width');
            cy.get('.modal-actions').should('be.visible');
            
            // Actions should stack vertically on mobile
            cy.get('.modal-actions').should('have.css', 'flex-direction', 'column');
        });
    });
});