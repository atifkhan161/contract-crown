describe('Contract Crown - Basic App Tests', () => {
  beforeEach(() => {
    cy.visit('/')
  })

  it('should load the application', () => {
    cy.get('#app').should('be.visible')
    cy.contains('Contract Crown').should('be.visible')
  })

  it('should register service worker for PWA', () => {
    cy.window().then((win) => {
      expect(win.navigator.serviceWorker).to.exist
    })
  })

  it('should have proper PWA manifest', () => {
    cy.request('/manifest.json').then((response) => {
      expect(response.status).to.eq(200)
      expect(response.body).to.have.property('name', 'Contract Crown')
      expect(response.body).to.have.property('short_name', 'Contract Crown')
    })
  })

  it('should be responsive on mobile viewport', () => {
    cy.viewport('iphone-x')
    cy.get('#app').should('be.visible')
    cy.contains('Contract Crown').should('be.visible')
  })
})