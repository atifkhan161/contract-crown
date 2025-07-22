describe('Authentication Integration Tests', () => {
  beforeEach(() => {
    cy.clearLocalStorage()
    cy.clearCookies()
  })

  describe('End-to-End Authentication Flow', () => {
    it('should complete full registration and login flow', () => {
      const testUser = {
        username: 'e2euser',
        email: 'e2e@example.com',
        password: 'TestPassword123!'
      }

      // Mock registration success
      cy.intercept('POST', '/api/auth/register', {
        statusCode: 201,
        body: {
          success: true,
          message: 'Registration successful'
        }
      }).as('registerRequest')

      // Mock login success
      cy.intercept('POST', '/api/auth/login', {
        statusCode: 200,
        body: {
          success: true,
          token: 'mock-jwt-token',
          user: {
            id: 1,
            username: testUser.username,
            email: testUser.email
          }
        }
      }).as('loginRequest')

      // Step 1: Register new user
      cy.visit('/register.html')
      cy.get('[data-cy=register-username-input]').type(testUser.username)
      cy.get('[data-cy=register-email-input]').type(testUser.email)
      cy.get('[data-cy=register-password-input]').type(testUser.password)
      cy.get('[data-cy=register-confirm-password-input]').type(testUser.password)
      cy.get('[data-cy=register-terms-checkbox]').check()
      cy.get('[data-cy=register-button]').click()

      cy.wait('@registerRequest')

      // Should redirect to login page
      cy.url().should('include', '/login.html')

      // Step 2: Login with new credentials
      cy.get('[data-cy=username-input]').type(testUser.username)
      cy.get('[data-cy=password-input]').type(testUser.password)
      cy.get('[data-cy=login-button]').click()

      cy.wait('@loginRequest')

      // Verify authentication state
      cy.window().then((win) => {
        expect(win.localStorage.getItem('contract_crown_token')).to.equal('mock-jwt-token')
        const userData = JSON.parse(win.localStorage.getItem('contract_crown_user'))
        expect(userData.username).to.equal(testUser.username)
        expect(userData.email).to.equal(testUser.email)
      })
    })

    it('should handle session validation on page load', () => {
      // Mock session validation
      cy.intercept('POST', '/api/auth/validate', {
        statusCode: 200,
        body: { valid: true }
      }).as('validateRequest')

      // Set valid token
      cy.window().then((win) => {
        win.localStorage.setItem('contract_crown_token', 'valid-jwt-token')
        win.localStorage.setItem('contract_crown_user', JSON.stringify({
          id: 1,
          username: 'testuser'
        }))
      })

      cy.visit('/login.html')
      
      // Should validate session on load
      cy.wait('@validateRequest')
    })

    it('should handle token refresh flow', () => {
      // Mock token refresh
      cy.intercept('POST', '/api/auth/refresh', {
        statusCode: 200,
        body: {
          success: true,
          token: 'new-jwt-token',
          refreshToken: 'new-refresh-token'
        }
      }).as('refreshRequest')

      // Set tokens that need refresh
      cy.window().then((win) => {
        win.localStorage.setItem('contract_crown_token', 'expiring-token')
        win.localStorage.setItem('contract_crown_refresh_token', 'refresh-token')
      })

      cy.visit('/login.html')

      // Trigger token refresh (this would normally happen automatically)
      cy.window().then((win) => {
        const authManager = new win.AuthManager()
        authManager.refreshToken()
      })

      cy.wait('@refreshRequest')

      // Verify new tokens are stored
      cy.window().then((win) => {
        expect(win.localStorage.getItem('contract_crown_token')).to.equal('new-jwt-token')
        expect(win.localStorage.getItem('contract_crown_refresh_token')).to.equal('new-refresh-token')
      })
    })
  })

  describe('Authentication Error Handling', () => {
    it('should handle server errors gracefully', () => {
      cy.intercept('POST', '/api/auth/login', {
        statusCode: 500,
        body: { error: 'Internal server error' }
      }).as('loginRequest')

      cy.visit('/login.html')
      cy.get('[data-cy=username-input]').type('testuser')
      cy.get('[data-cy=password-input]').type('password123')
      cy.get('[data-cy=login-button]').click()

      cy.wait('@loginRequest')
      cy.get('[data-cy=form-error]').should('be.visible')
    })

    it('should handle rate limiting', () => {
      cy.intercept('POST', '/api/auth/login', {
        statusCode: 429,
        body: {
          success: false,
          message: 'Too many login attempts. Please try again later.'
        }
      }).as('loginRequest')

      cy.visit('/login.html')
      cy.get('[data-cy=username-input]').type('testuser')
      cy.get('[data-cy=password-input]').type('password123')
      cy.get('[data-cy=login-button]').click()

      cy.wait('@loginRequest')
      cy.get('[data-cy=form-error]').should('contain', 'Too many login attempts')
    })

    it('should handle invalid token scenarios', () => {
      // Mock API call that returns 401
      cy.intercept('GET', '/api/user/profile', {
        statusCode: 401,
        body: { error: 'Invalid token' }
      }).as('profileRequest')

      // Set invalid token
      cy.window().then((win) => {
        win.localStorage.setItem('contract_crown_token', 'invalid-token')
      })

      cy.visit('/login.html')

      // Make authenticated request
      cy.window().then((win) => {
        const authManager = new win.AuthManager()
        authManager.authenticatedFetch('/api/user/profile')
      })

      cy.wait('@profileRequest')

      // Should clear invalid token and redirect to login
      cy.window().then((win) => {
        expect(win.localStorage.getItem('contract_crown_token')).to.be.null
      })
    })
  })

  describe('Multi-tab Authentication', () => {
    it('should sync authentication state across tabs', () => {
      // This test simulates multi-tab behavior
      cy.visit('/login.html')

      // Login in first tab
      cy.intercept('POST', '/api/auth/login', {
        statusCode: 200,
        body: {
          success: true,
          token: 'mock-jwt-token',
          user: { id: 1, username: 'testuser' }
        }
      }).as('loginRequest')

      cy.get('[data-cy=username-input]').type('testuser')
      cy.get('[data-cy=password-input]').type('password123')
      cy.get('[data-cy=login-button]').click()
      cy.wait('@loginRequest')

      // Simulate storage event from another tab
      cy.window().then((win) => {
        const storageEvent = new win.StorageEvent('storage', {
          key: 'contract_crown_token',
          newValue: 'updated-token',
          oldValue: 'mock-jwt-token'
        })
        win.dispatchEvent(storageEvent)
      })

      // Verify token was updated
      cy.window().then((win) => {
        expect(win.localStorage.getItem('contract_crown_token')).to.equal('updated-token')
      })
    })

    it('should handle logout across tabs', () => {
      // Set authenticated state
      cy.window().then((win) => {
        win.localStorage.setItem('contract_crown_token', 'mock-jwt-token')
        win.localStorage.setItem('contract_crown_user', JSON.stringify({ id: 1, username: 'testuser' }))
      })

      cy.visit('/login.html')

      // Simulate logout from another tab
      cy.window().then((win) => {
        const storageEvent = new win.StorageEvent('storage', {
          key: 'contract_crown_token',
          newValue: null,
          oldValue: 'mock-jwt-token'
        })
        win.dispatchEvent(storageEvent)
      })

      // Should handle logout state change
      cy.window().then((win) => {
        expect(win.localStorage.getItem('contract_crown_token')).to.be.null
      })
    })
  })

  describe('Security Tests', () => {
    it('should not expose sensitive data in localStorage', () => {
      cy.intercept('POST', '/api/auth/login', {
        statusCode: 200,
        body: {
          success: true,
          token: 'mock-jwt-token',
          user: { id: 1, username: 'testuser', email: 'test@example.com' }
        }
      }).as('loginRequest')

      cy.visit('/login.html')
      cy.get('[data-cy=username-input]').type('testuser')
      cy.get('[data-cy=password-input]').type('password123')
      cy.get('[data-cy=login-button]').click()
      cy.wait('@loginRequest')

      // Verify password is not stored
      cy.window().then((win) => {
        const allStorage = { ...win.localStorage }
        const storageString = JSON.stringify(allStorage)
        expect(storageString).to.not.contain('password123')
      })
    })

    it('should clear sensitive data on logout', () => {
      // Set authenticated state
      cy.window().then((win) => {
        win.localStorage.setItem('contract_crown_token', 'mock-jwt-token')
        win.localStorage.setItem('contract_crown_user', JSON.stringify({ id: 1, username: 'testuser' }))
        win.localStorage.setItem('contract_crown_refresh_token', 'refresh-token')
      })

      cy.intercept('POST', '/api/auth/logout', {
        statusCode: 200,
        body: { success: true }
      }).as('logoutRequest')

      cy.visit('/login.html')

      // Trigger logout
      cy.window().then((win) => {
        const authManager = new win.AuthManager()
        authManager.logout()
      })

      cy.wait('@logoutRequest')

      // Verify all auth data is cleared
      cy.window().then((win) => {
        expect(win.localStorage.getItem('contract_crown_token')).to.be.null
        expect(win.localStorage.getItem('contract_crown_user')).to.be.null
        expect(win.localStorage.getItem('contract_crown_refresh_token')).to.be.null
      })
    })

    it('should handle XSS prevention in form inputs', () => {
      cy.visit('/login.html')
      
      const xssPayload = '<script>alert("xss")</script>'
      
      cy.get('[data-cy=username-input]').type(xssPayload)
      cy.get('[data-cy=password-input]').type('password123')
      
      // Verify input is properly escaped
      cy.get('[data-cy=username-input]').should('have.value', xssPayload)
      
      // XSS should not execute
      cy.window().then((win) => {
        expect(win.document.body.innerHTML).to.not.contain('<script>')
      })
    })
  })
})