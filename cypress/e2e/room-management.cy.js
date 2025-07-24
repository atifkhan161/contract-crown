describe('Room Management', () => {
  let testUser;
  
  beforeEach(() => {
    // Clear any existing data
    cy.clearLocalStorage();
    cy.clearCookies();
    
    // Set up test user
    testUser = {
      id: 'test-user-id',
      username: 'testuser',
      email: 'test@example.com'
    };
    
    // Mock authentication
    cy.window().then((win) => {
      win.localStorage.setItem('contract_crown_token', 'mock-jwt-token');
      win.localStorage.setItem('contract_crown_user', JSON.stringify(testUser));
    });
    
    // Visit dashboard
    cy.visit('/dashboard.html');
  });

  describe('Room Creation Flow', () => {
    it('should create a public room with default settings', () => {
      cy.intercept('POST', '/api/rooms', {
        statusCode: 201,
        body: {
          success: true,
          message: 'Room created successfully',
          room: {
            id: 'new-room-id',
            name: 'My Game Room',
            maxPlayers: 4,
            players: [{ id: testUser.id, username: testUser.username }],
            owner: testUser.id,
            status: 'waiting',
            isPrivate: false,
            createdAt: new Date().toISOString()
          }
        }
      }).as('createRoom');

      // Open create room modal
      cy.get('#create-room-btn').click();
      
      // Fill in room details
      cy.get('#room-name').type('My Game Room');
      cy.get('#max-players').should('have.value', '4'); // Default value
      cy.get('#private-room').should('not.be.checked'); // Default unchecked
      
      // Submit form
      cy.get('#create-room-submit').click();
      
      // Verify API call
      cy.wait('@createRoom').then((interception) => {
        expect(interception.request.body).to.deep.include({
          name: 'My Game Room',
          maxPlayers: 4,
          isPrivate: false
        });
      });
      
      // Modal should close
      cy.get('#create-room-modal').should('have.class', 'hidden');
    });

    it('should create a private room with custom settings', () => {
      cy.intercept('POST', '/api/rooms', {
        statusCode: 201,
        body: {
          success: true,
          message: 'Room created successfully',
          room: {
            id: 'private-room-id',
            name: 'Private Game',
            maxPlayers: 6,
            players: [{ id: testUser.id, username: testUser.username }],
            owner: testUser.id,
            status: 'waiting',
            isPrivate: true,
            inviteCode: 'ABC123',
            createdAt: new Date().toISOString()
          }
        }
      }).as('createPrivateRoom');

      cy.get('#create-room-btn').click();
      
      cy.get('#room-name').type('Private Game');
      cy.get('#max-players').select('6');
      cy.get('#private-room').check();
      
      cy.get('#create-room-submit').click();
      
      cy.wait('@createPrivateRoom').then((interception) => {
        expect(interception.request.body).to.deep.include({
          name: 'Private Game',
          maxPlayers: 6,
          isPrivate: true
        });
      });
    });

    it('should show loading state during room creation', () => {
      cy.intercept('POST', '/api/rooms', {
        delay: 2000,
        statusCode: 201,
        body: { success: true, room: {} }
      }).as('slowCreateRoom');

      cy.get('#create-room-btn').click();
      cy.get('#room-name').type('Test Room');
      cy.get('#create-room-submit').click();
      
      // Check loading state
      cy.get('#create-room-submit').should('be.disabled');
      cy.get('#create-spinner').should('not.have.class', 'hidden');
      cy.get('#create-room-submit .btn-text').should('contain.text', 'Creating...');
      
      cy.wait('@slowCreateRoom');
      
      // Loading state should be cleared
      cy.get('#create-room-submit').should('not.be.disabled');
      cy.get('#create-spinner').should('have.class', 'hidden');
    });

    it('should handle room creation validation errors', () => {
      cy.get('#create-room-btn').click();
      
      // Try to submit without room name
      cy.get('#create-room-submit').click();
      cy.get('#form-error').should('be.visible');
      cy.get('#form-error').should('contain.text', 'Room name is required');
      
      // Clear error when typing
      cy.get('#room-name').type('Valid Name');
      cy.get('#form-error').should('have.class', 'hidden');
    });

    it('should handle server errors during room creation', () => {
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
  });

  describe('Room Joining Flow', () => {
    beforeEach(() => {
      // Mock available rooms
      const mockRooms = [
        {
          id: 'room-1',
          name: 'Open Room',
          maxPlayers: 4,
          players: [
            { id: 'other-user-1', username: 'player1' },
            { id: 'other-user-2', username: 'player2' }
          ],
          owner: 'other-user-1',
          status: 'waiting',
          isPrivate: false,
          createdAt: new Date().toISOString()
        },
        {
          id: 'room-2',
          name: 'Full Room',
          maxPlayers: 2,
          players: [
            { id: 'other-user-3', username: 'player3' },
            { id: 'other-user-4', username: 'player4' }
          ],
          owner: 'other-user-3',
          status: 'waiting',
          isPrivate: false,
          createdAt: new Date().toISOString()
        },
        {
          id: 'room-3',
          name: 'Playing Room',
          maxPlayers: 4,
          players: [
            { id: 'other-user-5', username: 'player5' },
            { id: 'other-user-6', username: 'player6' }
          ],
          owner: 'other-user-5',
          status: 'playing',
          isPrivate: false,
          createdAt: new Date().toISOString()
        }
      ];

      cy.intercept('GET', '/api/rooms', {
        statusCode: 200,
        body: { success: true, rooms: mockRooms }
      }).as('getRooms');
    });

    it('should join an available room successfully', () => {
      cy.intercept('POST', '/api/rooms/room-1/join', {
        statusCode: 200,
        body: {
          success: true,
          message: 'Joined room successfully',
          roomId: 'room-1',
          room: {
            id: 'room-1',
            name: 'Open Room',
            maxPlayers: 4,
            players: [
              { id: 'other-user-1', username: 'player1' },
              { id: 'other-user-2', username: 'player2' },
              { id: testUser.id, username: testUser.username }
            ],
            owner: 'other-user-1',
            status: 'waiting',
            isPrivate: false
          }
        }
      }).as('joinRoom');

      cy.wait('@getRooms');
      
      // Find and click join button for the open room
      cy.get('.room-item').contains('Open Room').parent().within(() => {
        cy.get('.join-room-btn').click();
      });
      
      cy.wait('@joinRoom');
      
      // Should redirect to game room
      cy.url().should('include', 'game.html?room=room-1');
    });

    it('should not show join button for full rooms', () => {
      cy.wait('@getRooms');
      
      cy.get('.room-item').contains('Full Room').parent().within(() => {
        cy.get('.join-room-btn').should('not.exist');
      });
    });

    it('should not show join button for rooms in progress', () => {
      cy.wait('@getRooms');
      
      cy.get('.room-item').contains('Playing Room').parent().within(() => {
        cy.get('.join-room-btn').should('not.exist');
        cy.get('.room-status').should('contain.text', 'Game in progress');
      });
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
      
      cy.get('.room-item').contains('Open Room').parent().within(() => {
        cy.get('.join-room-btn').click();
      });
      
      cy.wait('@joinRoomError');
      
      // Should show error (assuming alert for now)
      cy.on('window:alert', (text) => {
        expect(text).to.contains('Room is full');
      });
    });

    it('should show loading state when joining room', () => {
      cy.intercept('POST', '/api/rooms/room-1/join', {
        delay: 1000,
        statusCode: 200,
        body: { success: true, roomId: 'room-1' }
      }).as('slowJoinRoom');

      cy.wait('@getRooms');
      
      cy.get('.room-item').contains('Open Room').parent().within(() => {
        cy.get('.join-room-btn').click();
      });
      
      // Should show loading overlay
      cy.get('#loading-overlay').should('not.have.class', 'hidden');
      
      cy.wait('@slowJoinRoom');
    });
  });

  describe('Room Management for Owners', () => {
    beforeEach(() => {
      // Mock rooms where user is owner
      const mockRooms = [
        {
          id: 'my-room-1',
          name: 'My Room',
          maxPlayers: 4,
          players: [
            { id: testUser.id, username: testUser.username },
            { id: 'other-user-1', username: 'player1' }
          ],
          owner: testUser.id,
          status: 'waiting',
          isPrivate: false,
          createdAt: new Date().toISOString()
        },
        {
          id: 'other-room',
          name: 'Other Room',
          maxPlayers: 4,
          players: [{ id: 'other-user-2', username: 'player2' }],
          owner: 'other-user-2',
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

    it('should show delete button for owned rooms', () => {
      cy.wait('@getRooms');
      
      cy.get('.room-item').contains('My Room').parent().within(() => {
        cy.get('.delete-room-btn').should('be.visible');
      });
      
      cy.get('.room-item').contains('Other Room').parent().within(() => {
        cy.get('.delete-room-btn').should('not.exist');
      });
    });

    it('should delete owned room with confirmation', () => {
      cy.intercept('DELETE', '/api/rooms/my-room-1', {
        statusCode: 200,
        body: {
          success: true,
          message: 'Room deleted successfully'
        }
      }).as('deleteRoom');

      cy.wait('@getRooms');
      
      cy.get('.room-item').contains('My Room').parent().within(() => {
        cy.get('.delete-room-btn').click();
      });
      
      // Handle confirmation dialog
      cy.on('window:confirm', (text) => {
        expect(text).to.contains('Are you sure you want to delete this room?');
        return true;
      });
      
      cy.wait('@deleteRoom');
    });

    it('should cancel room deletion when user cancels', () => {
      cy.wait('@getRooms');
      
      cy.get('.room-item').contains('My Room').parent().within(() => {
        cy.get('.delete-room-btn').click();
      });
      
      // Cancel confirmation
      cy.on('window:confirm', () => false);
      
      // Room should still be visible
      cy.get('.room-item').contains('My Room').should('be.visible');
    });

    it('should handle delete room errors', () => {
      cy.intercept('DELETE', '/api/rooms/my-room-1', {
        statusCode: 403,
        body: {
          success: false,
          message: 'Only room owner can delete the room'
        }
      }).as('deleteRoomError');

      cy.wait('@getRooms');
      
      cy.get('.room-item').contains('My Room').parent().within(() => {
        cy.get('.delete-room-btn').click();
      });
      
      cy.on('window:confirm', () => true);
      
      cy.wait('@deleteRoomError');
      
      // Should show error
      cy.on('window:alert', (text) => {
        expect(text).to.contains('Only room owner can delete the room');
      });
    });
  });

  describe('Real-time Room Updates', () => {
    it('should update room list when rooms are updated', () => {
      // Initial empty room list
      cy.intercept('GET', '/api/rooms', {
        statusCode: 200,
        body: { success: true, rooms: [] }
      }).as('getEmptyRooms');

      cy.wait('@getEmptyRooms');
      cy.get('#no-rooms').should('not.have.class', 'hidden');

      // Simulate real-time room update
      cy.window().then((win) => {
        const newRooms = [
          {
            id: 'new-room',
            name: 'New Room',
            maxPlayers: 4,
            players: [{ id: 'user-id', username: 'newuser' }],
            owner: 'user-id',
            status: 'waiting',
            isPrivate: false,
            createdAt: new Date().toISOString()
          }
        ];

        // Simulate socket event (this would normally come from the socket manager)
        if (win.dashboardManager) {
          win.dashboardManager.updateRoomsList(newRooms);
        }
      });

      // Room should appear
      cy.get('#no-rooms').should('have.class', 'hidden');
      cy.get('.room-item').should('contain.text', 'New Room');
    });

    it('should update player count when players join/leave', () => {
      const initialRooms = [
        {
          id: 'room-1',
          name: 'Test Room',
          maxPlayers: 4,
          players: [{ id: 'user-1', username: 'player1' }],
          owner: 'user-1',
          status: 'waiting',
          isPrivate: false,
          createdAt: new Date().toISOString()
        }
      ];

      cy.intercept('GET', '/api/rooms', {
        statusCode: 200,
        body: { success: true, rooms: initialRooms }
      }).as('getInitialRooms');

      cy.wait('@getInitialRooms');
      
      // Initial state
      cy.get('.room-item').contains('Test Room').parent().within(() => {
        cy.get('.room-details').should('contain.text', '1/4 players');
      });

      // Simulate player joining
      cy.window().then((win) => {
        const updatedRooms = [
          {
            ...initialRooms[0],
            players: [
              { id: 'user-1', username: 'player1' },
              { id: 'user-2', username: 'player2' }
            ]
          }
        ];

        if (win.dashboardManager) {
          win.dashboardManager.updateRoomsList(updatedRooms);
        }
      });

      // Updated state
      cy.get('.room-item').contains('Test Room').parent().within(() => {
        cy.get('.room-details').should('contain.text', '2/4 players');
      });
    });
  });

  describe('Connection Status', () => {
    it('should show connected status when socket is connected', () => {
      cy.window().then((win) => {
        if (win.dashboardManager) {
          win.dashboardManager.updateConnectionStatus('connected');
        }
      });

      cy.get('#status-indicator').should('have.class', 'connected');
      cy.get('#status-text').should('contain.text', 'Connected');
    });

    it('should show disconnected status when socket is disconnected', () => {
      cy.window().then((win) => {
        if (win.dashboardManager) {
          win.dashboardManager.updateConnectionStatus('disconnected');
        }
      });

      cy.get('#status-indicator').should('have.class', 'disconnected');
      cy.get('#status-text').should('contain.text', 'Disconnected');
    });

    it('should show connecting status during reconnection', () => {
      cy.window().then((win) => {
        if (win.dashboardManager) {
          win.dashboardManager.updateConnectionStatus('connecting');
        }
      });

      cy.get('#status-indicator').should('have.class', 'connecting');
      cy.get('#status-text').should('contain.text', 'Connecting...');
    });
  });
});