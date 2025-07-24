describe('Dashboard Authentication Integration', () => {
  describe('Authentication Required', () => {
    it('should redirect to login when not authenticated', () => {
      cy.clearLocalStorage();
      cy.visit('/dashboard.html');
      
      // Should redirect to login page
      cy.url().should('include', 'login.html');
    });

    it('should redirect to login when token is expired', () => {
      // Set expired token
      const expiredToken = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6InRlc3QtdXNlci1pZCIsImV4cCI6MTYwMDAwMDAwMH0.invalid';
      cy.window().then((win) => {
        win.localStorage.setItem('auth_token', expiredToken);
        win.localStorage.setItem('auth_user', JSON.stringify({
          id: 'test-user-id',
          username: 'testuser'
        }));
      });

      cy.visit('/dashboard.html');
      
      // Should redirect to login page
      cy.url().should('include', 'login.html');
    });

    it('should redirect to login when token is invalid', () => {
      cy.window().then((win) => {
        win.localStorage.setItem('auth_token', 'invalid-token');
        win.localStorage.setItem('auth_user', JSON.stringify({
          id: 'test-user-id',
          username: 'testuser'
        }));
      });

      cy.visit('/dashboard.html');
      
      // Should redirect to login page
      cy.url().should('include', 'login.html');
    });
  });

  describe('Successful Authentication Flow', () => {
    beforeEach(() => {
      // Mock successful login
      cy.intercept('POST', '/api/auth/login', {
        statusCode: 200,
        body: {
          success: true,
          token: 'valid-jwt-token',
          user: {
            user_id: 'test-user-id',
            username: 'testuser',
            email: 'test@example.com'
          },
          message: 'Login successful'
        }
      }).as('login');

      // Mock dashboard API calls
      cy.intercept('GET', '/api/rooms', {
        statusCode: 200,
        body: { success: true, rooms: [] }
      }).as('getRooms');

      cy.intercept('GET', '/api/users/stats', {
        statusCode: 200,
        body: {
          success: true,
          stats: { gamesPlayed: 0, gamesWon: 0, winRate: 0 }
        }
      }).as('getUserStats');
    });

    it('should login and redirect to dashboard', () => {
      cy.visit('/login.html');
      
      cy.get('#username').type('testuser');
      cy.get('#password').type('testpass123');
      cy.get('#login-btn').click();
      
      cy.wait('@login');
      
      // Should redirect to dashboard
      cy.url().should('include', 'dashboard.html');
      
      // Should display user info
      cy.get('#username-display').should('contain.text', 'testuser');
    });

    it('should maintain authentication state across page reloads', () => {
      // Set valid authentication state
      cy.window().then((win) => {
        win.localStorage.setItem('auth_token', 'valid-jwt-token');
        win.localStorage.setItem('auth_user', JSON.stringify({
          user_id: 'test-user-id',
          username: 'testuser',
          email: 'test@example.com'
        }));
      });

      cy.visit('/dashboard.html');
      
      // Should load dashboard successfully
      cy.get('#username-display').should('contain.text', 'testuser');
      
      // Reload page
      cy.reload();
      
      // Should still be authenticated
      cy.get('#username-display').should('contain.text', 'testuser');
    });
  });

  describe('API Authentication', () => {
    beforeEach(() => {
      // Set up authenticated state
      cy.window().then((win) => {
        win.localStorage.setItem('auth_token', 'valid-jwt-token');
        win.localStorage.setItem('auth_user', JSON.stringify({
          user_id: 'test-user-id',
          username: 'testuser',
          email: 'test@example.com'
        }));
      });
    });

    it('should include auth token in API requests', () => {
      cy.intercept('GET', '/api/rooms', (req) => {
        expect(req.headers).to.have.property('authorization', 'Bearer valid-jwt-token');
        req.reply({
          statusCode: 200,
          body: { success: true, rooms: [] }
        });
      }).as('getRoomsWithAuth');

      cy.visit('/dashboard.html');
      cy.wait('@getRoomsWithAuth');
    });

    it('should handle 401 responses by redirecting to login', () => {
      cy.intercept('GET', '/api/rooms', {
        statusCode: 401,
        body: {
          success: false,
          message: 'Token expired'
        }
      }).as('getUnauthorized');

      cy.visit('/dashboard.html');
      cy.wait('@getUnauthorized');
      
      // Should redirect to login
      cy.url().should('include', 'login.html');
      
      // Should clear local storage
      cy.window().then((win) => {
        expect(win.localStorage.getItem('auth_token')).to.be.null;
        expect(win.localStorage.getItem('auth_user')).to.be.null;
      });
    });

    it('should handle token refresh on API calls', () => {
      // Mock token refresh
      cy.intercept('POST', '/api/auth/refresh', {
        statusCode: 200,
        body: {
          success: true,
          token: 'new-jwt-token',
          refreshToken: 'new-refresh-token'
        }
      }).as('refreshToken');

      // First API call returns 401
      cy.intercept('GET', '/api/rooms', {
        statusCode: 401,
        body: { success: false, message: 'Token expired' }
      }).as('getUnauthorizedFirst');

      // Second API call (after refresh) succeeds
      cy.intercept('GET', '/api/rooms', {
        statusCode: 200,
        body: { success: true, rooms: [] }
      }).as('getRoomsAfterRefresh');

      cy.visit('/dashboard.html');
      
      // Should attempt refresh and retry
      cy.wait('@getUnauthorizedFirst');
      cy.wait('@refreshToken');
      cy.wait('@getRoomsAfterRefresh');
      
      // Should update token in localStorage
      cy.window().then((win) => {
        expect(win.localStorage.getItem('auth_token')).to.equal('new-jwt-token');
      });
    });
  });

  describe('Logout Flow', () => {
    beforeEach(() => {
      // Set up authenticated state
      cy.window().then((win) => {
        win.localStorage.setItem('auth_token', 'valid-jwt-token');
        win.localStorage.setItem('auth_user', JSON.stringify({
          user_id: 'test-user-id',
          username: 'testuser',
          email: 'test@example.com'
        }));
      });

      // Mock API calls
      cy.intercept('GET', '/api/rooms', {
        statusCode: 200,
        body: { success: true, rooms: [] }
      });

      cy.intercept('GET', '/api/users/stats', {
        statusCode: 200,
        body: {
          success: true,
          stats: { gamesPlayed: 0, gamesWon: 0, winRate: 0 }
        }
      });
    });

    it('should logout and clear authentication state', () => {
      cy.intercept('POST', '/api/auth/logout', {
        statusCode: 200,
        body: { success: true, message: 'Logged out successfully' }
      }).as('logout');

      cy.visit('/dashboard.html');
      
      cy.get('#logout-btn').click();
      
      // Confirm logout
      cy.on('window:confirm', () => true);
      
      cy.wait('@logout');
      
      // Should redirect to login
      cy.url().should('include', 'login.html');
      
      // Should clear authentication state
      cy.window().then((win) => {
        expect(win.localStorage.getItem('auth_token')).to.be.null;
        expect(win.localStorage.getItem('auth_user')).to.be.null;
      });
    });

    it('should handle logout API errors gracefully', () => {
      cy.intercept('POST', '/api/auth/logout', {
        statusCode: 500,
        body: { success: false, message: 'Server error' }
      }).as('logoutError');

      cy.visit('/dashboard.html');
      
      cy.get('#logout-btn').click();
      cy.on('window:confirm', () => true);
      
      cy.wait('@logoutError');
      
      // Should still clear local state and redirect
      cy.url().should('include', 'login.html');
      cy.window().then((win) => {
        expect(win.localStorage.getItem('auth_token')).to.be.null;
      });
    });

    it('should handle network errors during logout', () => {
      cy.intercept('POST', '/api/auth/logout', { forceNetworkError: true }).as('logoutNetworkError');

      cy.visit('/dashboard.html');
      
      cy.get('#logout-btn').click();
      cy.on('window:confirm', () => true);
      
      cy.wait('@logoutNetworkError');
      
      // Should still clear local state and redirect
      cy.url().should('include', 'login.html');
      cy.window().then((win) => {
        expect(win.localStorage.getItem('auth_token')).to.be.null;
      });
    });
  });

  describe('Session Management', () => {
    it('should validate session on dashboard load', () => {
      cy.intercept('POST', '/api/auth/validate', {
        statusCode: 200,
        body: {
          valid: true,
          user: {
            user_id: 'test-user-id',
            username: 'testuser',
            email: 'test@example.com'
          }
        }
      }).as('validateSession');

      cy.window().then((win) => {
        win.localStorage.setItem('auth_token', 'valid-jwt-token');
        win.localStorage.setItem('auth_user', JSON.stringify({
          user_id: 'test-user-id',
          username: 'testuser'
        }));
      });

      cy.visit('/dashboard.html');
      
      // Should validate session
      cy.wait('@validateSession');
      
      // Should display dashboard
      cy.get('#username-display').should('contain.text', 'testuser');
    });

    it('should handle invalid session validation', () => {
      cy.intercept('POST', '/api/auth/validate', {
        statusCode: 401,
        body: { valid: false, message: 'Invalid session' }
      }).as('invalidateSession');

      cy.window().then((win) => {
        win.localStorage.setItem('auth_token', 'invalid-token');
        win.localStorage.setItem('auth_user', JSON.stringify({
          user_id: 'test-user-id',
          username: 'testuser'
        }));
      });

      cy.visit('/dashboard.html');
      
      cy.wait('@invalidateSession');
      
      // Should redirect to login
      cy.url().should('include', 'login.html');
    });
  });

  describe('Cross-tab Authentication', () => {
    it('should sync authentication state across tabs', () => {
      // Set up authenticated state
      cy.window().then((win) => {
        win.localStorage.setItem('auth_token', 'valid-jwt-token');
        win.localStorage.setItem('auth_user', JSON.stringify({
          user_id: 'test-user-id',
          username: 'testuser'
        }));
      });

      cy.visit('/dashboard.html');
      
      // Simulate logout in another tab by clearing localStorage
      cy.window().then((win) => {
        win.localStorage.removeItem('auth_token');
        win.localStorage.removeItem('auth_user');
        
        // Trigger storage event
        win.dispatchEvent(new StorageEvent('storage', {
          key: 'auth_token',
          oldValue: 'valid-jwt-token',
          newValue: null,
          storageArea: win.localStorage
        }));
      });

      // Should redirect to login
      cy.url().should('include', 'login.html');
    });
  });
});