describe('Authentication Edge Cases', () => {
  beforeEach(() => {
    cy.clearLocalStorage()
    cy.clearCookies()
  })

  describe('Form Validation Edge Cases', () => {
    it('should handle special characters in username', () => {
      cy.visit('/login.html')
      
      const specialChars = ['@', '#', '$', '%', '^', '&', '*']
      specialChars.forEach(char => {
        cy.get('[data-cy=username-input]').clear().type(`user${char}name`)
        cy.get('[data-cy=password-input]').type('password123')
        cy.get('[data-cy=login-button]').click()
        
        // Should handle special characters gracefully
        cy.get('[data-cy=username-input]').should('have.value', `user${char}name`)
      })
    })

    it('should handle very long input values', () => {
      cy.visit('/register.html')
      
      const longString = 'a'.repeat(1000)
      
      cy.get('[data-cy=register-username-input]').type(longString)
      cy.get('[data-cy=register-email-input]').type(`${longString}@example.com`)
      cy.get('[data-cy=register-password-input]').type(longString)
      
      // Should respect maxlength attributes
      cy.get('[data-cy=register-username-input]').should('have.attr', 'maxlength', '20')
    })

    it('should handle unicode characters', () => {
      cy.visit('/login.html')
      
      const unicodeUsername = 'тест用户名'
      const unicodePassword = 'пароль密码'
      
      cy.get('[data-cy=username-input]').type(unicodeUsername)
      cy.get('[data-cy=password-input]').type(unicodePassword)
      
      cy.get('[data-cy=username-input]').should('have.value', unicodeUsername)
      cy.get('[data-cy=password-input]').should('have.value', unicodePassword)
    })

    it('should handle rapid form submissions', () => {
      cy.mockAuthSuccess()
      
      cy.visit('/login.html')
      cy.get('[data-cy=username-input]').type('testuser')
      cy.get('[data-cy=password-input]').type('password123')
      
      // Rapidly click submit button
      cy.get('[data-cy=login-button]').click().click().click()
      
      // Should only make one request
      cy.get('@loginSuccess.all').should('have.length', 1)
    })

    it('should handle form submission with Enter key', () => {
      cy.mockAuthSuccess()
      
      cy.visit('/login.html')
      cy.get('[data-cy=username-input]').type('testuser')
      cy.get('[data-cy=password-input]').type('password123{enter}')
      
      cy.wait('@loginSuccess')
      cy.verifyAuthState(true)
    })
  })

  describe('Network and Connectivity Issues', () => {
    it('should handle intermittent network failures', () => {
      let requestCount = 0
      
      cy.intercept('POST', '/api/auth/login', (req) => {
        requestCount++
        if (requestCount === 1) {
          req.forceNetworkError()
        } else {
          req.reply({
            statusCode: 200,
            body: {
              success: true,
              token: 'mock-jwt-token',
              user: { id: 1, username: 'testuser' }
            }
          })
        }
      }).as('loginRequest')

      cy.visit('/login.html')
      cy.get('[data-cy=username-input]').type('testuser')
      cy.get('[data-cy=password-input]').type('password123')
      cy.get('[data-cy=login-button]').click()

      // First request fails
      cy.wait('@loginRequest')
      cy.get('[data-cy=form-error]').should('contain', 'Network error')

      // Retry should succeed
      cy.get('[data-cy=login-button]').click()
      cy.wait('@loginRequest')
      cy.verifyAuthState(true)
    })

    it('should handle slow network responses', () => {
      cy.intercept('POST', '/api/auth/login', {
        statusCode: 200,
        body: {
          success: true,
          token: 'mock-jwt-token',
          user: { id: 1, username: 'testuser' }
        },
        delay: 5000
      }).as('slowLogin')

      cy.visit('/login.html')
      cy.get('[data-cy=username-input]').type('testuser')
      cy.get('[data-cy=password-input]').type('password123')
      cy.get('[data-cy=login-button]').click()

      // Should show loading state
      cy.get('#login-spinner').should('not.have.class', 'hidden')
      cy.get('[data-cy=login-button]').should('be.disabled')

      cy.wait('@slowLogin')
      cy.verifyAuthState(true)
    })

    it('should handle request timeouts', () => {
      cy.intercept('POST', '/api/auth/login', { forceNetworkError: true }).as('timeoutRequest')

      cy.visit('/login.html')
      cy.get('[data-cy=username-input]').type('testuser')
      cy.get('[data-cy=password-input]').type('password123')
      cy.get('[data-cy=login-button]').click()

      cy.wait('@timeoutRequest')
      cy.get('[data-cy=form-error]').should('contain', 'Network error')
    })
  })

  describe('Browser Compatibility and Storage', () => {
    it('should handle localStorage being unavailable', () => {
      cy.visit('/login.html')
      
      // Mock localStorage being unavailable
      cy.window().then((win) => {
        Object.defineProperty(win, 'localStorage', {
          value: null,
          writable: false
        })
      })

      cy.mockAuthSuccess()
      cy.get('[data-cy=username-input]').type('testuser')
      cy.get('[data-cy=password-input]').type('password123')
      cy.get('[data-cy=login-button]').click()

      // Should handle gracefully without crashing
      cy.wait('@loginSuccess')
    })

    it('should handle localStorage quota exceeded', () => {
      cy.visit('/login.html')
      
      // Fill localStorage to capacity
      cy.window().then((win) => {
        try {
          const largeData = 'x'.repeat(5 * 1024 * 1024) // 5MB
          win.localStorage.setItem('large_data', largeData)
        } catch (e) {
          // Expected to fail
        }
      })

      cy.mockAuthSuccess()
      cy.get('[data-cy=username-input]').type('testuser')
      cy.get('[data-cy=password-input]').type('password123')
      cy.get('[data-cy=login-button]').click()

      cy.wait('@loginSuccess')
      // Should handle storage errors gracefully
    })

    it('should handle page refresh during authentication', () => {
      cy.intercept('POST', '/api/auth/login', {
        statusCode: 200,
        body: {
          success: true,
          token: 'mock-jwt-token',
          user: { id: 1, username: 'testuser' }
        },
        delay: 2000
      }).as('slowLogin')

      cy.visit('/login.html')
      cy.get('[data-cy=username-input]').type('testuser')
      cy.get('[data-cy=password-input]').type('password123')
      cy.get('[data-cy=login-button]').click()

      // Refresh page during request
      cy.reload()

      // Should reset form state
      cy.get('[data-cy=username-input]').should('have.value', '')
      cy.get('[data-cy=password-input]').should('have.value', '')
    })
  })

  describe('Security Edge Cases', () => {
    it('should handle malformed JWT tokens', () => {
      cy.visit('/login.html')
      
      // Set malformed token
      cy.window().then((win) => {
        win.localStorage.setItem('contract_crown_token', 'malformed.jwt.token')
      })

      cy.reload()

      // Should clear malformed token
      cy.window().then((win) => {
        expect(win.localStorage.getItem('contract_crown_token')).to.be.null
      })
    })

    it('should handle token with invalid signature', () => {
      cy.visit('/login.html')
      
      // Set token with invalid signature
      const invalidToken = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyfQ.invalid_signature'
      
      cy.window().then((win) => {
        win.localStorage.setItem('contract_crown_token', invalidToken)
      })

      cy.reload()

      // Should handle invalid token gracefully
      cy.window().then((win) => {
        expect(win.localStorage.getItem('contract_crown_token')).to.be.null
      })
    })

    it('should prevent CSRF attacks', () => {
      cy.visit('/login.html')
      
      // Attempt to submit form from different origin (simulated)
      cy.window().then((win) => {
        const form = win.document.getElementById('login-form')
        const originalAction = form.action
        form.action = 'https://malicious-site.com/steal-credentials'
        
        // Form should still submit to correct endpoint
        expect(form.action).to.not.equal('https://malicious-site.com/steal-credentials')
      })
    })

    it('should handle SQL injection attempts in form fields', () => {
      const sqlInjection = "'; DROP TABLE users; --"
      
      cy.intercept('POST', '/api/auth/login', (req) => {
        // Verify that SQL injection attempt is properly handled
        expect(req.body.username).to.equal(sqlInjection)
        expect(req.body.password).to.equal('password123')
        
        req.reply({
          statusCode: 401,
          body: { success: false, message: 'Invalid credentials' }
        })
      }).as('sqlInjectionAttempt')

      cy.visit('/login.html')
      cy.get('[data-cy=username-input]').type(sqlInjection)
      cy.get('[data-cy=password-input]').type('password123')
      cy.get('[data-cy=login-button]').click()

      cy.wait('@sqlInjectionAttempt')
      cy.get('[data-cy=form-error]').should('contain', 'Invalid credentials')
    })
  })

  describe('Accessibility Edge Cases', () => {
    it('should handle screen reader navigation', () => {
      cy.visit('/login.html')
      
      // Check ARIA labels and roles
      cy.get('[data-cy=username-input]').should('have.attr', 'aria-label').or('have.attr', 'aria-labelledby')
      cy.get('[data-cy=password-input]').should('have.attr', 'aria-label').or('have.attr', 'aria-labelledby')
      
      // Check error message association
      cy.get('#username-error').should('have.attr', 'role', 'alert').or('have.attr', 'aria-live')
    })

    it('should handle high contrast mode', () => {
      cy.visit('/login.html')
      
      // Simulate high contrast mode
      cy.get('body').invoke('attr', 'style', 'filter: contrast(200%)')
      
      // Form should still be usable
      cy.get('[data-cy=username-input]').should('be.visible')
      cy.get('[data-cy=password-input]').should('be.visible')
      cy.get('[data-cy=login-button]').should('be.visible')
    })

    it('should handle keyboard-only navigation', () => {
      cy.visit('/login.html')
      
      // Navigate using only keyboard
      cy.get('body').tab()
      cy.focused().should('have.attr', 'data-cy', 'username-input')
      
      cy.focused().type('testuser').tab()
      cy.focused().should('have.attr', 'data-cy', 'password-input')
      
      cy.focused().type('password123').tab()
      cy.focused().should('have.attr', 'data-cy', 'login-button')
      
      // Should be able to submit with Enter
      cy.mockAuthSuccess()
      cy.focused().type('{enter}')
      cy.wait('@loginSuccess')
    })
  })

  describe('Performance Edge Cases', () => {
    it('should handle multiple rapid authentication attempts', () => {
      let requestCount = 0
      
      cy.intercept('POST', '/api/auth/login', (req) => {
        requestCount++
        req.reply({
          statusCode: 200,
          body: {
            success: true,
            token: `token-${requestCount}`,
            user: { id: 1, username: 'testuser' }
          }
        })
      }).as('multipleLogins')

      cy.visit('/login.html')
      cy.get('[data-cy=username-input]').type('testuser')
      cy.get('[data-cy=password-input]').type('password123')
      
      // Submit multiple times rapidly
      for (let i = 0; i < 5; i++) {
        cy.get('[data-cy=login-button]').click()
      }

      // Should handle gracefully without overwhelming the server
      cy.get('@multipleLogins.all').should('have.length.at.most', 2)
    })

    it('should handle memory leaks in event listeners', () => {
      cy.visit('/login.html')
      
      // Simulate multiple page loads
      for (let i = 0; i < 10; i++) {
        cy.reload()
        cy.get('[data-cy=username-input]').should('be.visible')
      }

      // Check that event listeners are properly cleaned up
      cy.window().then((win) => {
        // This is a simplified check - in real scenarios you'd use memory profiling tools
        expect(win.document.querySelectorAll('*').length).to.be.lessThan(1000)
      })
    })
  })
})