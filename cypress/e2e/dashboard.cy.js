describe('Dashboard Functionality', () => {
  beforeEach(() => {
    // Clear any existing data
    cy.clearLocalStorage();
    cy.clearCookies();
    
    // Visit the login page and authenticate
    cy.visit('/login.html');
    
    // Login with test user
    cy.get('#username').type('testuser');
    cy.get('#password').type('testpass123');
    cy.get('#login-btn').click();
    
    // Wait for redirect to dashboard
    cy.url().should('include', 'dashboard.html');
  });

  describe('Dashboard Layout and Navigation', () => {
    it('should display the dashboard header with user info', () => {
      cy.get('.dashboard-header').should('be.visible');
      cy.get('.app-title').should('contain.text', 'Contract Crown');
      cy.get('#username-display').should('contain.text', 'testuser');
      cy.get('#logout-btn').should('be.visible');
    });

    it('should display connection status', () => {
      cy.get('#connection-status').should('be.visible');
      cy.get('#status-indicator').should('be.visible');
      cy.get('#status-text').should('be.visible');
    });

    it('should display room management section', () => {
      cy.get('.room-section').should('be.visible');
      cy.get('.section-header h2').should('contain.text', 'Game Rooms');
      cy.get('#create-room-btn').should('be.visible');
    });

    it('should display user stats section', () => {
      cy.get('.stats-section').should('be.visible');
      cy.get('.stats-section h2').should('contain.text', 'Your Stats');
      cy.get('.stats-grid').should('be.visible');
      cy.get('#games-played').should('be.visible');
      cy.get('#games-won').should('be.visible');
      cy.get('#win-rate').should('be.visible');
    });
  });

  describe('Room Creation', () => {
    it('should open create room modal when create button is clicked', () => {
      cy.get('#create-room-btn').click();
      cy.get('#create-room-modal').should('not.have.class', 'hidden');
      cy.get('.modal-header h3').should('contain.text', 'Create New Room');
    });

    it('should close create room modal when close button is clicked', () => {
      cy.get('#create-room-btn').click();
      cy.get('#close-modal-btn').click();
      cy.get('#create-room-modal').should('have.class', 'hidden');
    });

    it('should close create room modal when cancel button is clicked', () => {
      cy.get('#create-room-btn').click();
      cy.get('#cancel-create-btn').click();
      cy.get('#create-room-modal').should('have.class', 'hidden');
    });

    it('should close create room modal when clicking overlay', () => {
      cy.get('#create-room-btn').click();
      cy.get('#create-room-modal').click({ force: true });
      cy.get('#create-room-modal').should('have.class', 'hidden');
    });

    it('should validate required room name', () => {
      cy.get('#create-room-btn').click();
      cy.get('#create-room-submit').click();
      cy.get('#form-error').should('be.visible');
      cy.get('#form-error').should('contain.text', 'Room name is required');
    });

    it('should validate room name length', () => {
      cy.get('#create-room-btn').click();
      cy.get('#room-name').type('a'.repeat(51)); // 51 characters
      cy.get('#create-room-submit').click();
      cy.get('#form-error').should('be.visible');
      cy.get('#form-error').should('contain.text', '50 characters or less');
    });

    it('should create room with valid data', () => {
      // Intercept the API call
      cy.intercept('POST', '/api/rooms', {
        statusCode: 201,
        body: {
          success: true,
          message: 'Room created successfully',
          room: {
            id: 'test-room-id',
            name: 'Test Room',
            maxPlayers: 4,
            players: [{ id: 'user-id', username: 'testuser' }],
            owner: 'user-id',
            status: 'waiting',
            isPrivate: false,
            createdAt: new Date().toISOString()
          }
        }
      }).as('createRoom');

      cy.get('#create-room-btn').click();
      cy.get('#room-name').type('Test Room');
      cy.get('#max-players').select('4');
      cy.get('#create-room-submit').click();

      cy.wait('@createRoom');
      cy.get('#create-room-modal').should('have.class', 'hidden');
    });

    it('should handle room creation errors', () => {
      // Intercept the API call with error
      cy.intercept('POST', '/api/rooms', {
        statusCode: 400,
        body: {
          success: false,
          message: 'You already have an active room'
        }
      }).as('createRoomError');

      cy.get('#create-room-btn').click();
      cy.get('#room-name').type('Test Room');
      cy.get('#create-room-submit').click();

      cy.wait('@createRoomError');
      cy.get('#form-error').should('be.visible');
      cy.get('#form-error').should('contain.text', 'You already have an active room');
    });

    it('should create private room with invite code', () => {
      cy.intercept('POST', '/api/rooms', {
        statusCode: 201,
        body: {
          success: true,
          message: 'Room created successfully',
          room: {
            id: 'test-room-id',
            name: 'Private Room',
            maxPlayers: 4,
            players: [{ id: 'user-id', username: 'testuser' }],
            owner: 'user-id',
            status: 'waiting',
            isPrivate: true,
            inviteCode: 'ABC123',
            createdAt: new Date().toISOString()
          }
        }
      }).as('createPrivateRoom');

      cy.get('#create-room-btn').click();
      cy.get('#room-name').type('Private Room');
      cy.get('#private-room').check();
      cy.get('#create-room-submit').click();

      cy.wait('@createPrivateRoom');
      cy.get('#create-room-modal').should('have.class', 'hidden');
    });
  });

  describe('Room List Display', () => {
    beforeEach(() => {
      // Mock rooms data
      const mockRooms = [
        {
          id: 'room-1',
          name: 'Test Room 1',
          maxPlayers: 4,
          players: [
            { id: 'user-1', username: 'player1' },
            { id: 'user-2', username: 'player2' }
          ],
          owner: 'user-1',
          status: 'waiting',
          isPrivate: false,
          createdAt: new Date().toISOString()
        },
        {
          id: 'room-2',
          name: 'Private Room',
          maxPlayers: 6,
          players: [{ id: 'user-3', username: 'player3' }],
          owner: 'user-3',
          status: 'waiting',
          isPrivate: true,
          createdAt: new Date().toISOString()
        }
      ];

      cy.intercept('GET', '/api/rooms', {
        statusCode: 200,
        body: { success: true, rooms: mockRooms }
      }).as('getRooms');
    });

    it('should display list of available rooms', () => {
      cy.wait('@getRooms');
      cy.get('.room-item').should('have.length', 2);
      cy.get('.room-item').first().should('contain.text', 'Test Room 1');
      cy.get('.room-item').last().should('contain.text', 'Private Room');
    });

    it('should display room details correctly', () => {
      cy.wait('@getRooms');
      cy.get('.room-item').first().within(() => {
        cy.get('.room-name').should('contain.text', 'Test Room 1');
        cy.get('.room-details').should('contain.text', '2/4 players');
        cy.get('.room-status').should('contain.text', 'Waiting for players');
      });
    });

    it('should show private room indicator', () => {
      cy.wait('@getRooms');
      cy.get('.room-item').last().within(() => {
        cy.get('.room-private').should('contain.text', 'Private');
      });
    });

    it('should display no rooms message when list is empty', () => {
      cy.intercept('GET', '/api/rooms', {
        statusCode: 200,
        body: { success: true, rooms: [] }
      }).as('getEmptyRooms');

      cy.wait('@getEmptyRooms');
      cy.get('#no-rooms').should('not.have.class', 'hidden');
      cy.get('.no-rooms-content h3').should('contain.text', 'No active rooms');
    });
  });

  describe('Room Actions', () => {
    beforeEach(() => {
      // Mock rooms data with joinable room
      const mockRooms = [
        {
          id: 'room-1',
          name: 'Joinable Room',
          maxPlayers: 4,
          players: [{ id: 'other-user', username: 'otherplayer' }],
          owner: 'other-user',
          status: 'waiting',
          isPrivate: false,
          createdAt: new Date().toISOString()
        },
        {
          id: 'room-2',
          name: 'My Room',
          maxPlayers: 4,
          players: [{ id: 'current-user', username: 'testuser' }],
          owner: 'current-user',
          status: 'waiting',
          isPrivate: false,
          createdAt: new Date().toISOString()
        }
      ];

      cy.intercept('GET', '/api/rooms', {
        statusCode: 200,
        body: { success: true, rooms: mockRooms }
      }).as('getRooms');
    });

    it('should join a room successfully', () => {
      cy.intercept('POST', '/api/rooms/room-1/join', {
        statusCode: 200,
        body: {
          success: true,
          message: 'Joined room successfully',
          roomId: 'room-1'
        }
      }).as('joinRoom');

      cy.wait('@getRooms');
      cy.get('.room-item').first().within(() => {
        cy.get('.join-room-btn').click();
      });

      cy.wait('@joinRoom');
      // Should redirect to game room
      cy.url().should('include', 'game.html?room=room-1');
    });

    it('should handle join room errors', () => {
      cy.intercept('POST', '/api/rooms/room-1/join', {
        statusCode: 400,
        body: {
          success: false,
          message: 'Room is full'
        }
      }).as('joinRoomError');

      cy.wait('@getRooms');
      cy.get('.room-item').first().within(() => {
        cy.get('.join-room-btn').click();
      });

      cy.wait('@joinRoomError');
      // Should show error message (assuming alert for now)
      cy.on('window:alert', (text) => {
        expect(text).to.contains('Room is full');
      });
    });

    it('should delete own room', () => {
      cy.intercept('DELETE', '/api/rooms/room-2', {
        statusCode: 200,
        body: {
          success: true,
          message: 'Room deleted successfully'
        }
      }).as('deleteRoom');

      cy.wait('@getRooms');
      cy.get('.room-item').last().within(() => {
        cy.get('.delete-room-btn').click();
      });

      // Confirm deletion
      cy.on('window:confirm', () => true);
      cy.wait('@deleteRoom');
    });
  });

  describe('User Statistics', () => {
    it('should display user statistics', () => {
      cy.intercept('GET', '/api/users/stats', {
        statusCode: 200,
        body: {
          success: true,
          stats: {
            gamesPlayed: 10,
            gamesWon: 6,
            winRate: 60
          }
        }
      }).as('getUserStats');

      cy.wait('@getUserStats');
      cy.get('#games-played').should('contain.text', '10');
      cy.get('#games-won').should('contain.text', '6');
      cy.get('#win-rate').should('contain.text', '60%');
    });

    it('should handle stats loading errors gracefully', () => {
      cy.intercept('GET', '/api/users/stats', {
        statusCode: 500,
        body: {
          success: false,
          message: 'Failed to fetch stats'
        }
      }).as('getUserStatsError');

      cy.wait('@getUserStatsError');
      // Should display default values
      cy.get('#games-played').should('contain.text', '0');
      cy.get('#games-won').should('contain.text', '0');
      cy.get('#win-rate').should('contain.text', '0%');
    });
  });

  describe('Real-time Updates', () => {
    it('should update room list when new room is created', () => {
      // This would test Socket.IO events
      // For now, we'll test the UI update mechanism
      cy.window().then((win) => {
        // Simulate socket event
        const mockRoom = {
          id: 'new-room',
          name: 'New Room',
          maxPlayers: 4,
          players: [{ id: 'user-id', username: 'newuser' }],
          owner: 'user-id',
          status: 'waiting',
          isPrivate: false,
          createdAt: new Date().toISOString()
        };

        // Trigger room update (this would normally come from socket)
        win.postMessage({ type: 'roomCreated', room: mockRoom }, '*');
      });

      // Verify room appears in list
      cy.get('.room-item').should('contain.text', 'New Room');
    });
  });

  describe('Logout Functionality', () => {
    it('should logout and redirect to login page', () => {
      cy.get('#logout-btn').click();
      
      // Confirm logout
      cy.on('window:confirm', () => true);
      
      // Should redirect to login page
      cy.url().should('include', 'login.html');
      
      // Should clear local storage
      cy.window().then((win) => {
        expect(win.localStorage.getItem('contract_crown_token')).to.be.null;
        expect(win.localStorage.getItem('contract_crown_user')).to.be.null;
      });
    });

    it('should cancel logout when user cancels', () => {
      cy.get('#logout-btn').click();
      
      // Cancel logout
      cy.on('window:confirm', () => false);
      
      // Should stay on dashboard
      cy.url().should('include', 'dashboard.html');
    });
  });

  describe('Responsive Design', () => {
    it('should adapt layout for mobile devices', () => {
      cy.viewport(375, 667); // iPhone SE size
      
      cy.get('.dashboard-header').should('be.visible');
      cy.get('.section-header').should('have.css', 'flex-direction', 'column');
      cy.get('.stats-grid').should('have.css', 'grid-template-columns').and('include', '1fr');
    });

    it('should adapt layout for tablet devices', () => {
      cy.viewport(768, 1024); // iPad size
      
      cy.get('.dashboard-container').should('be.visible');
      cy.get('.stats-grid').should('be.visible');
    });
  });

  describe('Error Handling', () => {
    it('should handle network errors gracefully', () => {
      cy.intercept('GET', '/api/rooms', { forceNetworkError: true }).as('networkError');
      
      cy.reload();
      cy.wait('@networkError');
      
      // Should show some error indication
      cy.get('#no-rooms').should('not.have.class', 'hidden');
    });

    it('should handle authentication errors', () => {
      cy.intercept('GET', '/api/rooms', {
        statusCode: 401,
        body: {
          success: false,
          message: 'Token expired'
        }
      }).as('authError');
      
      cy.wait('@authError');
      
      // Should redirect to login
      cy.url().should('include', 'login.html');
    });
  });
});