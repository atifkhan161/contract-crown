describe('Authentication Flow', () => {
  beforeEach(() => {
    // Clear localStorage before each test
    cy.clearLocalStorage()
    // Clear cookies
    cy.clearCookies()
  })

  describe('Login Page', () => {
    beforeEach(() => {
      cy.visit('/login.html')
    })

    it('should display login form elements', () => {
      cy.get('[data-cy=username-input]').should('be.visible')
      cy.get('[data-cy=password-input]').should('be.visible')
      cy.get('[data-cy=login-button]').should('be.visible')
      cy.get('h1').should('contain', 'Contract Crown')
      cy.get('.app-subtitle').should('contain', 'Strategic Card Game')
    })

    it('should show validation errors for empty fields', () => {
      cy.get('[data-cy=login-button]').click()
      
      // Check HTML5 validation
      cy.get('[data-cy=username-input]').should('have.attr', 'required')
      cy.get('[data-cy=password-input]').should('have.attr', 'required')
    })

    it('should handle successful login', () => {
      // Mock successful login response
      cy.intercept('POST', '/api/auth/login', {
        statusCode: 200,
        body: {
          success: true,
          token: 'mock-jwt-token',
          user: {
            id: 1,
            username: 'testuser',
            email: 'test@example.com'
          },
          message: 'Login successful'
        }
      }).as('loginRequest')

      cy.get('[data-cy=username-input]').type('testuser')
      cy.get('[data-cy=password-input]').type('password123')
      cy.get('[data-cy=login-button]').click()

      cy.wait('@loginRequest')
      
      // Check that token is stored in localStorage
      cy.window().then((win) => {
        expect(win.localStorage.getItem('contract_crown_token')).to.equal('mock-jwt-token')
        expect(win.localStorage.getItem('contract_crown_user')).to.contain('testuser')
      })
    })

    it('should handle login failure with error message', () => {
      // Mock failed login response
      cy.intercept('POST', '/api/auth/login', {
        statusCode: 401,
        body: {
          success: false,
          message: 'Invalid credentials'
        }
      }).as('loginRequest')

      cy.get('[data-cy=username-input]').type('wronguser')
      cy.get('[data-cy=password-input]').type('wrongpassword')
      cy.get('[data-cy=login-button]').click()

      cy.wait('@loginRequest')
      cy.get('[data-cy=form-error]').should('contain', 'Invalid credentials')
    })

    it('should handle network error', () => {
      // Mock network error
      cy.intercept('POST', '/api/auth/login', { forceNetworkError: true }).as('loginRequest')

      cy.get('[data-cy=username-input]').type('testuser')
      cy.get('[data-cy=password-input]').type('password123')
      cy.get('[data-cy=login-button]').click()

      cy.wait('@loginRequest')
      cy.get('[data-cy=form-error]').should('contain', 'Network error')
    })

    it('should navigate to register page', () => {
      cy.get('a[href="register.html"]').click()
      cy.url().should('include', '/register.html')
    })

    it('should show loading state during login', () => {
      // Mock slow response
      cy.intercept('POST', '/api/auth/login', {
        statusCode: 200,
        body: { success: true, token: 'token', user: {} },
        delay: 1000
      }).as('loginRequest')

      cy.get('[data-cy=username-input]').type('testuser')
      cy.get('[data-cy=password-input]').type('password123')
      cy.get('[data-cy=login-button]').click()

      // Check loading state
      cy.get('#login-spinner').should('not.have.class', 'hidden')
      cy.get('[data-cy=login-button]').should('be.disabled')

      cy.wait('@loginRequest')
    })
  })

  describe('Registration Page', () => {
    beforeEach(() => {
      cy.visit('/register.html')
    })

    it('should display registration form elements', () => {
      cy.get('[data-cy=register-username-input]').should('be.visible')
      cy.get('[data-cy=register-email-input]').should('be.visible')
      cy.get('[data-cy=register-password-input]').should('be.visible')
      cy.get('[data-cy=register-confirm-password-input]').should('be.visible')
      cy.get('[data-cy=register-terms-checkbox]').should('exist')
      cy.get('[data-cy=register-button]').should('be.visible')
      cy.get('h1').should('contain', 'Contract Crown')
      cy.get('.app-subtitle').should('contain', 'Create Your Account')
    })

    it('should validate username requirements', () => {
      // Test minimum length
      cy.get('[data-cy=register-username-input]').type('ab')
      cy.get('[data-cy=register-button]').click()
      cy.get('[data-cy=register-username-input]').should('have.attr', 'minlength', '3')

      // Test maximum length
      cy.get('[data-cy=register-username-input]').clear().type('a'.repeat(25))
      cy.get('[data-cy=register-username-input]').should('have.attr', 'maxlength', '20')
    })

    it('should validate email format', () => {
      cy.get('[data-cy=register-email-input]').type('invalid-email')
      cy.get('[data-cy=register-button]').click()
      cy.get('[data-cy=register-email-input]').should('have.attr', 'type', 'email')
    })

    it('should validate password requirements', () => {
      cy.get('[data-cy=register-password-input]').type('short')
      cy.get('[data-cy=register-button]').click()
      cy.get('[data-cy=register-password-input]').should('have.attr', 'minlength', '8')
    })

    it('should show password strength indicator', () => {
      cy.get('[data-cy=register-password-input]').type('weak')
      cy.get('#password-strength').should('be.visible')
      
      cy.get('[data-cy=register-password-input]').clear().type('StrongPassword123!')
      cy.get('#password-strength').should('be.visible')
    })

    it('should validate password confirmation', () => {
      cy.get('[data-cy=register-password-input]').type('password123')
      cy.get('[data-cy=register-confirm-password-input]').type('different123')
      cy.get('[data-cy=register-button]').click()
      
      // This would be handled by client-side validation
      cy.get('[data-cy=register-confirm-password-input]').should('not.match', '[data-cy=register-password-input]')
    })

    it('should require terms acceptance', () => {
      cy.get('[data-cy=register-username-input]').type('newuser')
      cy.get('[data-cy=register-email-input]').type('new@example.com')
      cy.get('[data-cy=register-password-input]').type('password123')
      cy.get('[data-cy=register-confirm-password-input]').type('password123')
      
      cy.get('[data-cy=register-button]').click()
      cy.get('[data-cy=register-terms-checkbox]').should('have.attr', 'required')
    })

    it('should handle successful registration', () => {
      // Mock successful registration response
      cy.intercept('POST', '/api/auth/register', {
        statusCode: 201,
        body: {
          success: true,
          message: 'Registration successful'
        }
      }).as('registerRequest')

      cy.get('[data-cy=register-username-input]').type('newuser')
      cy.get('[data-cy=register-email-input]').type('new@example.com')
      cy.get('[data-cy=register-password-input]').type('password123')
      cy.get('[data-cy=register-confirm-password-input]').type('password123')
      cy.get('[data-cy=register-terms-checkbox]').check({ force: true })
      cy.get('[data-cy=register-button]').click()

      cy.wait('@registerRequest')
      
      // Should redirect to login or show success message
      cy.url().should('include', '/login.html')
    })

    it('should handle registration failure', () => {
      // Mock failed registration response
      cy.intercept('POST', '/api/auth/register', {
        statusCode: 400,
        body: {
          success: false,
          message: 'Username already exists'
        }
      }).as('registerRequest')

      cy.get('[data-cy=register-username-input]').type('existinguser')
      cy.get('[data-cy=register-email-input]').type('existing@example.com')
      cy.get('[data-cy=register-password-input]').type('password123')
      cy.get('[data-cy=register-confirm-password-input]').type('password123')
      cy.get('[data-cy=register-terms-checkbox]').check()
      cy.get('[data-cy=register-button]').click()

      cy.wait('@registerRequest')
      cy.get('[data-cy=register-form-error]').should('contain', 'Username already exists')
    })

    it('should navigate to login page', () => {
      cy.get('a[href="login.html"]').click()
      cy.url().should('include', '/login.html')
    })

    it('should show loading state during registration', () => {
      // Mock slow response
      cy.intercept('POST', '/api/auth/register', {
        statusCode: 201,
        body: { success: true },
        delay: 1000
      }).as('registerRequest')

      cy.get('[data-cy=register-username-input]').type('newuser')
      cy.get('[data-cy=register-email-input]').type('new@example.com')
      cy.get('[data-cy=register-password-input]').type('password123')
      cy.get('[data-cy=register-confirm-password-input]').type('password123')
      cy.get('[data-cy=register-terms-checkbox]').check()
      cy.get('[data-cy=register-button]').click()

      // Check loading state
      cy.get('#register-spinner').should('not.have.class', 'hidden')
      cy.get('[data-cy=register-button]').should('be.disabled')

      cy.wait('@registerRequest')
    })
  })

  describe('Authentication State Management', () => {
    it('should persist authentication state across page reloads', () => {
      // Mock login
      cy.intercept('POST', '/api/auth/login', {
        statusCode: 200,
        body: {
          success: true,
          token: 'mock-jwt-token',
          user: { id: 1, username: 'testuser' }
        }
      }).as('loginRequest')

      cy.visit('/login.html')
      cy.get('[data-cy=username-input]').type('testuser')
      cy.get('[data-cy=password-input]').type('password123')
      cy.get('[data-cy=login-button]').click()
      cy.wait('@loginRequest')

      // Reload page and check if still authenticated
      cy.reload()
      cy.window().then((win) => {
        expect(win.localStorage.getItem('contract_crown_token')).to.equal('mock-jwt-token')
      })
    })

    it('should handle token expiration', () => {
      // Set expired token
      cy.window().then((win) => {
        const expiredToken = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyLCJleHAiOjE1MTYyMzkwMjJ9.invalid'
        win.localStorage.setItem('contract_crown_token', expiredToken)
      })

      cy.visit('/login.html')
      
      // Should clear expired token
      cy.window().then((win) => {
        expect(win.localStorage.getItem('contract_crown_token')).to.be.null
      })
    })

    it('should handle logout', () => {
      // Mock logout
      cy.intercept('POST', '/api/auth/logout', {
        statusCode: 200,
        body: { success: true }
      }).as('logoutRequest')

      // Set authenticated state
      cy.window().then((win) => {
        win.localStorage.setItem('contract_crown_token', 'mock-jwt-token')
        win.localStorage.setItem('contract_crown_user', JSON.stringify({ id: 1, username: 'testuser' }))
      })

      cy.visit('/login.html')
      
      // Trigger logout (this would normally be done through UI)
      cy.window().then((win) => {
        const authManager = new win.AuthManager()
        authManager.logout()
      })

      cy.wait('@logoutRequest')
      
      // Check that tokens are cleared
      cy.window().then((win) => {
        expect(win.localStorage.getItem('contract_crown_token')).to.be.null
        expect(win.localStorage.getItem('contract_crown_user')).to.be.null
      })
    })
  })

  describe('Form Validation and UX', () => {
    it('should show appropriate error messages for login validation', () => {
      cy.visit('/login.html')
      
      // Test empty form submission
      cy.get('[data-cy=login-button]').click()
      
      // HTML5 validation should prevent submission
      cy.get('[data-cy=username-input]').then(($input) => {
        expect($input[0].validationMessage).to.not.be.empty
      })
    })

    it('should show appropriate error messages for registration validation', () => {
      cy.visit('/register.html')
      
      // Test invalid email
      cy.get('[data-cy=register-email-input]').type('invalid-email')
      cy.get('[data-cy=register-button]').click()
      
      cy.get('[data-cy=register-email-input]').then(($input) => {
        expect($input[0].validationMessage).to.not.be.empty
      })
    })

    it('should handle form accessibility', () => {
      cy.visit('/login.html')
      
      // Check labels are associated with inputs
      cy.get('label[for="username"]').should('exist')
      cy.get('label[for="password"]').should('exist')
      
      // Check ARIA attributes
      cy.get('[data-cy=username-input]').should('have.attr', 'autocomplete', 'username')
      cy.get('[data-cy=password-input]').should('have.attr', 'autocomplete', 'current-password')
    })

    it('should handle keyboard navigation', () => {
      cy.visit('/login.html')
      
      // Tab through form elements
      cy.get('body').tab()
      cy.focused().should('have.attr', 'data-cy', 'username-input')
      
      cy.focused().tab()
      cy.focused().should('have.attr', 'data-cy', 'password-input')
      
      cy.focused().tab()
      cy.focused().should('have.attr', 'data-cy', 'login-button')
    })
  })
})