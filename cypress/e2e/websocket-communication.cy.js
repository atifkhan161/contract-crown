/**
 * Cypress tests for real-time WebSocket communication
 * Tests WebSocket connection, game events, and state synchronization
 */

describe('WebSocket Real-time Communication', () => {
  let testUsers;
  let gameCode;

  beforeEach(() => {
    // Create test users
    testUsers = [
      { username: 'player1', email: 'player1@test.com', password: 'password123' },
      { username: 'player2', email: 'player2@test.com', password: 'password123' },
      { username: 'player3', email: 'player3@test.com', password: 'password123' },
      { username: 'player4', email: 'player4@test.com', password: 'password123' }
    ];

    // Clean up any existing test data
    cy.task('cleanupTestData');
  });

  afterEach(() => {
    cy.task('cleanupTestData');
  });

  describe('WebSocket Connection Establishment', () => {
    it('should establish WebSocket connection on login', () => {
      // Register and login first user
      cy.visit('/register.html');
      cy.get('#username').type(testUsers[0].username);
      cy.get('#email').type(testUsers[0].email);
      cy.get('#password').type(testUsers[0].password);
      cy.get('#confirmPassword').type(testUsers[0].password);
      cy.get('#registerForm').submit();

      cy.visit('/login.html');
      cy.get('#username').type(testUsers[0].username);
      cy.get('#password').type(testUsers[0].password);
      cy.get('#loginForm').submit();

      // Should redirect to dashboard and establish WebSocket connection
      cy.url().should('include', '/dashboard.html');
      
      // Check connection status widget shows connected
      cy.get('#connectionStatus').should('be.visible');
      cy.get('#connectionStatus .status-text').should('contain', 'Connected');
      cy.get('#connectionStatus .status-indicator').should('have.class', 'connected');
    });

    it('should show connection status changes in real-time', () => {
      // Login user
      cy.task('createTestUser', testUsers[0]);
      cy.visit('/login.html');
      cy.get('#username').type(testUsers[0].username);
      cy.get('#password').type(testUsers[0].password);
      cy.get('#loginForm').submit();

      cy.url().should('include', '/dashboard.html');

      // Initially connected
      cy.get('#connectionStatus .status-text').should('contain', 'Connected');
      cy.get('#connectionStatus .status-indicator').should('have.class', 'connected');

      // Simulate connection loss
      cy.window().then((win) => {
        win.websocketManager.disconnect();
      });

      // Should show disconnected status
      cy.get('#connectionStatus .status-text').should('contain', 'Disconnected');
      cy.get('#connectionStatus .status-indicator').should('have.class', 'disconnected');

      // Simulate reconnection
      cy.window().then((win) => {
        win.websocketManager.connect();
      });

      // Should show reconnecting then connected
      cy.get('#connectionStatus .status-text').should('contain', 'Reconnecting');
      cy.get('#connectionStatus .status-indicator').should('have.class', 'reconnecting');
      
      cy.get('#connectionStatus .status-text', { timeout: 5000 }).should('contain', 'Connected');
      cy.get('#connectionStatus .status-indicator').should('have.class', 'connected');
    });
  });

  describe('Game State Synchronization', () => {
    beforeEach(() => {
      // Create test users and set up game
      testUsers.forEach(user => {
        cy.task('createTestUser', user);
      });
    });

    it('should synchronize game state across multiple clients', () => {
      // Host creates game
      cy.visit('/login.html');
      cy.get('#username').type(testUsers[0].username);
      cy.get('#password').type(testUsers[0].password);
      cy.get('#loginForm').submit();

      cy.get('#createRoomBtn').click();
      cy.get('#gameCode').invoke('text').then((code) => {
        gameCode = code;
      });

      // Navigate to lobby
      cy.get('#joinLobbyBtn').click();
      cy.url().should('include', '/lobby.html');

      // Open second browser window for player 2
      cy.window().then((win) => {
        const newWindow = win.open('/login.html', '_blank');
        cy.wrap(newWindow).as('player2Window');
      });

      // Login player 2 in new window
      cy.get('@player2Window').then((win) => {
        cy.wrap(win.document.querySelector('#username')).type(testUsers[1].username);
        cy.wrap(win.document.querySelector('#password')).type(testUsers[1].password);
        cy.wrap(win.document.querySelector('#loginForm')).submit();
      });

      // Player 2 joins game
      cy.get('@player2Window').then((win) => {
        cy.wrap(win.document.querySelector('#gameCodeInput')).type(gameCode);
        cy.wrap(win.document.querySelector('#joinRoomBtn')).click();
      });

      // Both players should see each other in lobby
      cy.get('.player-slot[data-position="1"] .player-name').should('contain', testUsers[0].username);
      cy.get('.player-slot[data-position="2"] .player-name').should('contain', testUsers[1].username);

      // Player 2 window should also show both players
      cy.get('@player2Window').then((win) => {
        cy.wrap(win.document.querySelector('.player-slot[data-position="1"] .player-name'))
          .should('contain', testUsers[0].username);
        cy.wrap(win.document.querySelector('.player-slot[data-position="2"] .player-name'))
          .should('contain', testUsers[1].username);
      });
    });

    it('should broadcast ready status changes in real-time', () => {
      // Set up 4-player game
      cy.task('createTestGame', { 
        hostUser: testUsers[0], 
        players: testUsers,
        status: 'waiting'
      }).then((game) => {
        gameCode = game.gameCode;
      });

      // Login as player 1
      cy.visit('/login.html');
      cy.get('#username').type(testUsers[0].username);
      cy.get('#password').type(testUsers[0].password);
      cy.get('#loginForm').submit();

      // Join lobby
      cy.get('#gameCodeInput').type(gameCode);
      cy.get('#joinRoomBtn').click();
      cy.url().should('include', '/lobby.html');

      // Initially all players should be not ready
      cy.get('.player-slot[data-position="1"] .ready-status').should('contain', 'Not Ready');
      cy.get('.player-slot[data-position="2"] .ready-status').should('contain', 'Not Ready');

      // Mark player 1 as ready
      cy.get('#readyBtn').click();
      cy.get('.player-slot[data-position="1"] .ready-status').should('contain', 'Ready');

      // Simulate player 2 marking ready from another client
      cy.window().then((win) => {
        win.websocketManager.emit('player:ready', {
          gameId: gameCode,
          playerId: testUsers[1].username,
          ready: true
        });
      });

      // Should see player 2 as ready
      cy.get('.player-slot[data-position="2"] .ready-status').should('contain', 'Ready');
    });
  });

  describe('Real-time Game Events', () => {
    beforeEach(() => {
      // Set up complete 4-player game
      testUsers.forEach(user => {
        cy.task('createTestUser', user);
      });

      cy.task('createTestGame', { 
        hostUser: testUsers[0], 
        players: testUsers,
        status: 'in_progress'
      }).then((game) => {
        gameCode = game.gameCode;
      });
    });

    it('should broadcast trump declaration events', () => {
      // Login and join game
      cy.visit('/login.html');
      cy.get('#username').type(testUsers[0].username);
      cy.get('#password').type(testUsers[0].password);
      cy.get('#loginForm').submit();

      cy.visit(`/game.html?gameId=${gameCode}`);

      // Wait for game to load
      cy.get('#gameTable').should('be.visible');

      // If this player is trump declarer, declare trump
      cy.get('#trumpSelection').then(($selection) => {
        if ($selection.is(':visible')) {
          cy.get('#trumpSelection .suit-hearts').click();
          cy.get('#confirmTrumpBtn').click();
        }
      });

      // All players should see trump declared
      cy.get('#trumpIndicator').should('be.visible');
      cy.get('#trumpIndicator .trump-suit').should('contain', 'Hearts');

      // Simulate trump declaration from another player
      cy.window().then((win) => {
        win.websocketManager.emit('game:trump_declared', {
          gameId: gameCode,
          trumpSuit: 'Spades',
          declaringPlayer: testUsers[1].username
        });
      });

      // Should update trump display
      cy.get('#trumpIndicator .trump-suit').should('contain', 'Spades');
    });

    it('should broadcast card play events in real-time', () => {
      // Login and join active game
      cy.visit('/login.html');
      cy.get('#username').type(testUsers[0].username);
      cy.get('#password').type(testUsers[0].password);
      cy.get('#loginForm').submit();

      cy.visit(`/game.html?gameId=${gameCode}`);
      cy.get('#gameTable').should('be.visible');

      // Wait for cards to be dealt
      cy.get('#playerHand .card').should('have.length.greaterThan', 0);

      // If it's this player's turn, play a card
      cy.get('#gameTable').then(($table) => {
        if ($table.find('.current-turn[data-player="' + testUsers[0].username + '"]').length > 0) {
          cy.get('#playerHand .card').first().click();
          cy.get('#playCardBtn').click();
        }
      });

      // Simulate card play from another player
      cy.window().then((win) => {
        win.websocketManager.emit('game:card_played', {
          gameId: gameCode,
          playerId: testUsers[1].username,
          card: { suit: 'Hearts', rank: 'A' },
          trickNumber: 1
        });
      });

      // Should see card played on table
      cy.get('#trickArea .played-card[data-player="' + testUsers[1].username + '"]')
        .should('be.visible')
        .should('contain', 'A♥');
    });

    it('should broadcast trick completion and scoring', () => {
      // Set up game in progress
      cy.visit('/login.html');
      cy.get('#username').type(testUsers[0].username);
      cy.get('#password').type(testUsers[0].password);
      cy.get('#loginForm').submit();

      cy.visit(`/game.html?gameId=${gameCode}`);

      // Simulate trick completion
      cy.window().then((win) => {
        win.websocketManager.emit('game:trick_won', {
          gameId: gameCode,
          trickNumber: 1,
          winner: testUsers[0].username,
          winningCard: { suit: 'Hearts', rank: 'A' },
          trickCards: [
            { playerId: testUsers[0].username, card: { suit: 'Hearts', rank: 'A' } },
            { playerId: testUsers[1].username, card: { suit: 'Hearts', rank: 'K' } },
            { playerId: testUsers[2].username, card: { suit: 'Hearts', rank: 'Q' } },
            { playerId: testUsers[3].username, card: { suit: 'Hearts', rank: 'J' } }
          ]
        });
      });

      // Should show trick winner animation
      cy.get('#trickWinnerDisplay').should('be.visible');
      cy.get('#trickWinnerDisplay .winner-name').should('contain', testUsers[0].username);

      // Should clear trick area after animation
      cy.get('#trickArea .played-card', { timeout: 3000 }).should('not.exist');

      // Should update score display
      cy.get('#scoreDisplay').should('be.visible');
    });
  });

  describe('Connection Loss and Recovery', () => {
    beforeEach(() => {
      cy.task('createTestUser', testUsers[0]);
    });

    it('should handle connection loss gracefully', () => {
      // Login user
      cy.visit('/login.html');
      cy.get('#username').type(testUsers[0].username);
      cy.get('#password').type(testUsers[0].password);
      cy.get('#loginForm').submit();

      cy.url().should('include', '/dashboard.html');

      // Verify connected status
      cy.get('#connectionStatus .status-text').should('contain', 'Connected');

      // Simulate connection loss
      cy.window().then((win) => {
        // Force disconnect WebSocket
        if (win.websocketManager && win.websocketManager.socket) {
          win.websocketManager.socket.disconnect();
        }
      });

      // Should show disconnected status
      cy.get('#connectionStatus .status-text').should('contain', 'Disconnected');
      cy.get('#connectionStatus .status-indicator').should('have.class', 'disconnected');

      // Should show reconnection message
      cy.get('#connectionMessage').should('be.visible');
      cy.get('#connectionMessage').should('contain', 'Connection lost. Attempting to reconnect...');
    });

    it('should automatically reconnect after connection loss', () => {
      // Login user
      cy.visit('/login.html');
      cy.get('#username').type(testUsers[0].username);
      cy.get('#password').type(testUsers[0].password);
      cy.get('#loginForm').submit();

      // Simulate connection loss and recovery
      cy.window().then((win) => {
        // Disconnect
        win.websocketManager.disconnect();
        
        // Wait a moment then reconnect
        setTimeout(() => {
          win.websocketManager.connect();
        }, 1000);
      });

      // Should show reconnecting status
      cy.get('#connectionStatus .status-text').should('contain', 'Reconnecting');
      cy.get('#connectionStatus .status-indicator').should('have.class', 'reconnecting');

      // Should eventually reconnect
      cy.get('#connectionStatus .status-text', { timeout: 10000 }).should('contain', 'Connected');
      cy.get('#connectionStatus .status-indicator').should('have.class', 'connected');

      // Connection message should disappear
      cy.get('#connectionMessage').should('not.be.visible');
    });

    it('should sync game state after reconnection', () => {
      // Set up game in progress
      cy.task('createTestGame', { 
        hostUser: testUsers[0], 
        players: testUsers.slice(0, 2),
        status: 'in_progress'
      }).then((game) => {
        gameCode = game.gameCode;
      });

      // Login and join game
      cy.visit('/login.html');
      cy.get('#username').type(testUsers[0].username);
      cy.get('#password').type(testUsers[0].password);
      cy.get('#loginForm').submit();

      cy.visit(`/game.html?gameId=${gameCode}`);
      cy.get('#gameTable').should('be.visible');

      // Simulate connection loss
      cy.window().then((win) => {
        win.websocketManager.disconnect();
      });

      // Should show disconnected status
      cy.get('#connectionStatus .status-text').should('contain', 'Disconnected');

      // Reconnect
      cy.window().then((win) => {
        win.websocketManager.connect();
      });

      // Should reconnect and sync game state
      cy.get('#connectionStatus .status-text', { timeout: 10000 }).should('contain', 'Connected');

      // Game state should be restored
      cy.get('#gameTable').should('be.visible');
      cy.get('#playerHand').should('be.visible');
      cy.get('#scoreDisplay').should('be.visible');
    });
  });

  describe('Error Handling', () => {
    beforeEach(() => {
      cy.task('createTestUser', testUsers[0]);
    });

    it('should handle WebSocket authentication errors', () => {
      // Login with invalid token
      cy.visit('/dashboard.html');
      
      // Should redirect to login due to invalid auth
      cy.url().should('include', '/login.html');
      
      // Should show authentication error
      cy.get('#errorMessage').should('be.visible');
      cy.get('#errorMessage').should('contain', 'Authentication required');
    });

    it('should handle invalid game events gracefully', () => {
      // Login user
      cy.visit('/login.html');
      cy.get('#username').type(testUsers[0].username);
      cy.get('#password').type(testUsers[0].password);
      cy.get('#loginForm').submit();

      // Send invalid game event
      cy.window().then((win) => {
        win.websocketManager.emit('invalid:event', {
          invalidData: 'test'
        });
      });

      // Should not crash the application
      cy.get('#connectionStatus').should('be.visible');
      cy.get('#connectionStatus .status-text').should('contain', 'Connected');
    });

    it('should display appropriate error messages for game errors', () => {
      // Set up game
      cy.task('createTestGame', { 
        hostUser: testUsers[0], 
        players: testUsers.slice(0, 2),
        status: 'in_progress'
      }).then((game) => {
        gameCode = game.gameCode;
      });

      // Login and join game
      cy.visit('/login.html');
      cy.get('#username').type(testUsers[0].username);
      cy.get('#password').type(testUsers[0].password);
      cy.get('#loginForm').submit();

      cy.visit(`/game.html?gameId=${gameCode}`);

      // Simulate game error
      cy.window().then((win) => {
        win.websocketManager.emit('game:error', {
          gameId: gameCode,
          error: 'Invalid move',
          message: 'You cannot play that card'
        });
      });

      // Should show error message
      cy.get('#gameErrorMessage').should('be.visible');
      cy.get('#gameErrorMessage').should('contain', 'You cannot play that card');

      // Error should disappear after timeout
      cy.get('#gameErrorMessage', { timeout: 5000 }).should('not.be.visible');
    });
  });});
