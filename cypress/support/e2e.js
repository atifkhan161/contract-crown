// Import commands.js using ES2015 syntax:
import './commands'

// Alternatively you can use CommonJS syntax:
// require('./commands')

// Custom commands for Contract Crown testing
Cypress.Commands.add('loginUser', (username, password) => {
  cy.visit('/login')
  cy.get('[data-cy=username-input]').type(username)
  cy.get('[data-cy=password-input]').type(password)
  cy.get('[data-cy=login-button]').click()
})

Cypress.Commands.add('createGameRoom', () => {
  cy.get('[data-cy=create-room-button]').click()
  cy.get('[data-cy=game-code]').should('be.visible')
})

Cypress.Commands.add('joinGameRoom', (gameCode) => {
  cy.get('[data-cy=join-room-input]').type(gameCode)
  cy.get('[data-cy=join-room-button]').click()
})