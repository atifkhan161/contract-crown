// Custom Cypress commands for Contract Crown

// Authentication commands
Cypress.Commands.add('registerUser', (userData) => {
  cy.request({
    method: 'POST',
    url: '/api/auth/register',
    body: userData,
    failOnStatusCode: false
  })
})

Cypress.Commands.add('authenticateUser', (credentials) => {
  cy.request({
    method: 'POST',
    url: '/api/auth/login',
    body: credentials
  }).then((response) => {
    window.localStorage.setItem('auth_token', response.body.token)
    if (response.body.user) {
      window.localStorage.setItem('auth_user', JSON.stringify(response.body.user))
    }
    if (response.body.refreshToken) {
      window.localStorage.setItem('auth_refresh_token', response.body.refreshToken)
    }
  })
})

// Enhanced authentication commands for testing
Cypress.Commands.add('loginViaUI', (username, password) => {
  cy.visit('/login.html')
  cy.get('[data-cy=username-input]').type(username)
  cy.get('[data-cy=password-input]').type(password)
  cy.get('[data-cy=login-button]').click()
})

Cypress.Commands.add('registerViaUI', (userData) => {
  cy.visit('/register.html')
  cy.get('[data-cy=register-username-input]').type(userData.username)
  cy.get('[data-cy=register-email-input]').type(userData.email)
  cy.get('[data-cy=register-password-input]').type(userData.password)
  cy.get('[data-cy=register-confirm-password-input]').type(userData.password)
  cy.get('[data-cy=register-terms-checkbox]').check()
  cy.get('[data-cy=register-button]').click()
})

Cypress.Commands.add('mockAuthSuccess', (userData = {}) => {
  const defaultUser = {
    id: 1,
    username: 'testuser',
    email: 'test@example.com',
    ...userData
  }
  
  cy.intercept('POST', '/api/auth/login', {
    statusCode: 200,
    body: {
      success: true,
      token: 'mock-jwt-token',
      user: defaultUser,
      refreshToken: 'mock-refresh-token'
    }
  }).as('loginSuccess')
})

Cypress.Commands.add('mockAuthFailure', (message = 'Invalid credentials') => {
  cy.intercept('POST', '/api/auth/login', {
    statusCode: 401,
    body: {
      success: false,
      message
    }
  }).as('loginFailure')
})

Cypress.Commands.add('mockRegisterSuccess', () => {
  cy.intercept('POST', '/api/auth/register', {
    statusCode: 201,
    body: {
      success: true,
      message: 'Registration successful'
    }
  }).as('registerSuccess')
})

Cypress.Commands.add('mockRegisterFailure', (message = 'Registration failed') => {
  cy.intercept('POST', '/api/auth/register', {
    statusCode: 400,
    body: {
      success: false,
      message
    }
  }).as('registerFailure')
})

Cypress.Commands.add('setAuthenticatedState', (userData = {}) => {
  const defaultUser = {
    id: 1,
    username: 'testuser',
    email: 'test@example.com',
    ...userData
  }
  
  cy.window().then((win) => {
    win.localStorage.setItem('auth_token', 'mock-jwt-token')
    win.localStorage.setItem('auth_user', JSON.stringify(defaultUser))
    win.localStorage.setItem('auth_refresh_token', 'mock-refresh-token')
  })
})

Cypress.Commands.add('clearAuthState', () => {
  cy.window().then((win) => {
    win.localStorage.removeItem('auth_token')
    win.localStorage.removeItem('auth_user')
    win.localStorage.removeItem('auth_refresh_token')
  })
})

Cypress.Commands.add('verifyAuthState', (shouldBeAuthenticated = true) => {
  cy.window().then((win) => {
    if (shouldBeAuthenticated) {
      expect(win.localStorage.getItem('auth_token')).to.not.be.null
      expect(win.localStorage.getItem('auth_user')).to.not.be.null
    } else {
      expect(win.localStorage.getItem('auth_token')).to.be.null
      expect(win.localStorage.getItem('auth_user')).to.be.null
    }
  })
})

// Game testing commands
Cypress.Commands.add('waitForGameState', (expectedState) => {
  cy.get('[data-cy=game-state]', { timeout: 10000 })
    .should('contain', expectedState)
})

Cypress.Commands.add('playCard', (cardIndex) => {
  cy.get(`[data-cy=player-card-${cardIndex}]`).click()
  cy.get('[data-cy=confirm-play-button]').click()
})