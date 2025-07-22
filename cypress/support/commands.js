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
    window.localStorage.setItem('authToken', response.body.token)
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