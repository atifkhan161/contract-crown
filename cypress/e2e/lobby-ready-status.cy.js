/**
 * Lobby Ready Status and Team Formation Tests
 * Tests the implementation of task 5.2
 */

describe('Lobby Ready Status and Team Formation', () => {
    beforeEach(() => {
        // Mock authentication
        cy.window().then((win) => {
            win.localStorage.setItem('auth_token', 'mock-jwt-token');
            win.localStorage.setItem('user_data', JSON.stringify({
                id: 'user-1',
                username: 'TestUser1'
            }));
        });
    });

    it('should display ready status toggle button', () => {
        cy.visit('/lobby.html?room=test-room-1');
        
        // Check that ready toggle button exists
        cy.get('#ready-toggle-btn').should('exist');
        cy.get('#ready-toggle-btn .btn-text').should('contain', 'Ready Up');
    });

    it('should show team formation section', () => {
        cy.visit('/lobby.html?room=test-room-1');
        
        // Check that team formation section exists
        cy.get('.teams-section').should('exist');
        cy.get('#team-1').should('exist');
        cy.get('#team-2').should('exist');
        
        // Check team headers
        cy.get('#team-1 h3').should('contain', 'Team 1');
        cy.get('#team-2 h3').should('contain', 'Team 2');
    });

    it('should show shuffle teams button for host', () => {
        cy.visit('/lobby.html?room=test-room-1');
        
        // Mock being the host
        cy.window().then((win) => {
            // Simulate host status
            const mockRoom = {
                id: 'test-room-1',
                name: 'Test Room',
                owner: 'user-1',
                players: [
                    { id: 'user-1', username: 'TestUser1', isReady: false },
                    { id: 'user-2', username: 'TestUser2', isReady: false },
                    { id: 'user-3', username: 'TestUser3', isReady: false },
                    { id: 'user-4', username: 'TestUser4', isReady: false }
                ]
            };
            
            // Simulate the lobby manager being initialized with host status
            win.postMessage({ type: 'mock-room-data', room: mockRoom }, '*');
        });
        
        // Check that shuffle teams button exists and is visible for host
        cy.get('#shuffle-teams-btn').should('exist');
        cy.get('#shuffle-teams-btn .btn-text').should('contain', 'Form Teams');
    });

    it('should display player ready status indicators', () => {
        cy.visit('/lobby.html?room=test-room-1');
        
        // Check that player slots have ready status indicators
        cy.get('.player-slot').each(($slot) => {
            cy.wrap($slot).find('.player-status .status-indicator').should('exist');
            cy.wrap($slot).find('.player-status .status-text').should('exist');
            cy.wrap($slot).find('.ready-badge').should('exist');
        });
    });

    it('should show ready count display', () => {
        cy.visit('/lobby.html?room=test-room-1');
        
        // Check ready count display
        cy.get('.ready-status').should('exist');
        cy.get('#ready-count').should('exist');
        cy.get('#total-players').should('exist');
        
        // Should show initial count
        cy.get('#ready-count').should('contain', '0');
        cy.get('#total-players').should('contain', '4');
    });

    it('should show host controls for game start', () => {
        cy.visit('/lobby.html?room=test-room-1');
        
        // Check host controls section
        cy.get('#host-controls').should('exist');
        cy.get('#start-game-btn').should('exist');
        cy.get('#start-game-btn .btn-text').should('contain', 'Start Game');
        
        // Start button should be disabled initially
        cy.get('#start-game-btn').should('be.disabled');
    });

    it('should display team assignment slots', () => {
        cy.visit('/lobby.html?room=test-room-1');
        
        // Check team player slots
        cy.get('#team-1 .team-player-slot').should('have.length', 2);
        cy.get('#team-2 .team-player-slot').should('have.length', 2);
        
        // Initially should show "Waiting..." text
        cy.get('.team-player-slot .slot-text').should('contain', 'Waiting...');
    });

    it('should handle ready button click', () => {
        cy.visit('/lobby.html?room=test-room-1');
        
        // Mock successful ready status API call
        cy.intercept('POST', '/api/rooms/*/ready', {
            statusCode: 200,
            body: { success: true, message: 'Ready status updated' }
        }).as('toggleReady');
        
        // Click ready button
        cy.get('#ready-toggle-btn').click();
        
        // Should make API call
        cy.wait('@toggleReady');
    });

    it('should handle team formation button click', () => {
        cy.visit('/lobby.html?room=test-room-1');
        
        // Mock successful team formation API call
        cy.intercept('POST', '/api/rooms/*/form-teams', {
            statusCode: 200,
            body: { 
                success: true, 
                teams: {
                    team1: [{ id: 'user-1', username: 'TestUser1' }],
                    team2: [{ id: 'user-2', username: 'TestUser2' }]
                }
            }
        }).as('formTeams');
        
        // Make button visible first
        cy.get('#shuffle-teams-btn').invoke('removeClass', 'hidden');
        
        // Click form teams button
        cy.get('#shuffle-teams-btn').click();
        
        // Should make API call
        cy.wait('@formTeams');
    });

    it('should handle start game button click', () => {
        cy.visit('/lobby.html?room=test-room-1');
        
        // Mock successful game start API call
        cy.intercept('POST', '/api/rooms/*/start', {
            statusCode: 200,
            body: { success: true, message: 'Game started' }
        }).as('startGame');
        
        // Make host controls visible and enable start button
        cy.get('#host-controls').invoke('removeClass', 'hidden');
        cy.get('#start-game-btn').invoke('prop', 'disabled', false);
        
        // Click start game button
        cy.get('#start-game-btn').click();
        
        // Should make API call
        cy.wait('@startGame');
    });
});