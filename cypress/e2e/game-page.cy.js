describe('Game Page Functionality', () => {
  beforeEach(() => {
    // Clear any existing data
    cy.clearLocalStorage();
    cy.clearCookies();
    
    // Set up authentication token
    cy.window().then((win) => {
      win.localStorage.setItem('auth_token', 'test-jwt-token');
      win.localStorage.setItem('auth_user', JSON.stringify({
        id: 'test-user-id',
        username: 'testuser'
      }));
    });

    // Mock Socket.IO
    cy.window().then((win) => {
      win.io = () => ({
        on: cy.stub(),
        emit: cy.stub(),
        disconnect: cy.stub()
      });
    });
    
    // Visit the game page with a test game ID
    cy.visit('/game.html?gameId=test-game-123');
  });

  describe('Game Page Layout and Loading', () => {
    it('should display the game header with correct elements', () => {
      cy.get('.game-header').should('be.visible');
      cy.get('.game-title').should('contain.text', 'Contract Crown');
      cy.get('#current-round').should('be.visible');
      cy.get('#leave-game-btn').should('be.visible');
      cy.get('#connection-status').should('be.visible');
    });

    it('should display the game table with all player areas', () => {
      cy.get('.game-table').should('be.visible');
      cy.get('.player-area').should('have.length', 4);
      
      // Check all player positions
      cy.get('.player-top').should('be.visible');
      cy.get('.player-left').should('be.visible');
      cy.get('.player-right').should('be.visible');
      cy.get('.player-bottom').should('be.visible');
    });

    it('should display the center table area with trump and score displays', () => {
      cy.get('.table-center').should('be.visible');
      cy.get('#trump-display').should('be.visible');
      cy.get('#trick-area').should('be.visible');
      cy.get('#score-display').should('be.visible');
    });

    it('should display game messages section', () => {
      cy.get('.game-messages-section').should('be.visible');
      cy.get('#game-messages').should('be.visible');
    });

    it('should show loading overlay initially', () => {
      cy.get('#loading-overlay').should('not.have.class', 'hidden');
      cy.get('#loading-text').should('contain.text', 'Connecting to game...');
    });
  });

  describe('Player Information Display', () => {
    beforeEach(() => {
      // Mock game state update
      cy.window().then((win) => {
        // Simulate game state loaded
        const gameState = {
          gameId: 'test-game-123',
          currentPlayer: 'player1',
          players: {
            'player1': { username: 'You', seatPosition: 1, handSize: 8 },
            'player2': { username: 'Player 2', seatPosition: 2, handSize: 8 },
            'player3': { username: 'Player 3', seatPosition: 3, handSize: 8 },
            'player4': { username: 'Player 4', seatPosition: 4, handSize: 8 }
          },
          currentRound: 1,
          currentTrick: 1,
          trumpSuit: null,
          scores: { team1: 0, team2: 0 },
          gamePhase: 'playing'
        };
        
        // Trigger game state update
        win.postMessage({ type: 'gameStateUpdate', data: gameState }, '*');
      });
    });

    it('should display player names correctly', () => {
      cy.get('#player-bottom-name').should('contain.text', 'You');
      cy.get('#player-top-name').should('contain.text', 'Player 3');
      cy.get('#player-left-name').should('contain.text', 'Player 2');
      cy.get('#player-right-name').should('contain.text', 'Player 4');
    });

    it('should display card counts for all players', () => {
      cy.get('#player-bottom-cards').should('contain.text', '8 cards');
      cy.get('#player-top-cards').should('contain.text', '8 cards');
      cy.get('#player-left-cards').should('contain.text', '8 cards');
      cy.get('#player-right-cards').should('contain.text', '8 cards');
    });

    it('should display turn indicators', () => {
      cy.get('#player-bottom-turn').should('be.visible');
      cy.get('#player-top-turn').should('be.visible');
      cy.get('#player-left-turn').should('be.visible');
      cy.get('#player-right-turn').should('be.visible');
    });
  });

  describe('Card Rendering and Hand Management', () => {
    beforeEach(() => {
      // Mock player hand with sample cards
      cy.window().then((win) => {
        const mockHand = [
          { suit: 'hearts', rank: 'A' },
          { suit: 'diamonds', rank: 'K' },
          { suit: 'clubs', rank: 'Q' },
          { suit: 'spades', rank: 'J' },
          { suit: 'hearts', rank: '10' },
          { suit: 'diamonds', rank: '9' },
          { suit: 'clubs', rank: '8' },
          { suit: 'spades', rank: '7' }
        ];
        
        win.postMessage({ 
          type: 'handUpdate', 
          data: { playerHand: mockHand, isMyTurn: true } 
        }, '*');
      });
    });

    it('should render player hand with correct number of cards', () => {
      cy.get('#player-hand .card').should('have.length', 8);
    });

    it('should display card ranks and suits correctly', () => {
      cy.get('#player-hand .card').first().within(() => {
        cy.get('.card-rank').should('contain.text', 'A');
        cy.get('.card-suit').should('contain.text', '♥');
        cy.get('.card-rank').should('have.class', 'red');
        cy.get('.card-suit').should('have.class', 'red');
      });

      cy.get('#player-hand .card').eq(2).within(() => {
        cy.get('.card-rank').should('contain.text', 'Q');
        cy.get('.card-suit').should('contain.text', '♣');
        cy.get('.card-rank').should('have.class', 'black');
        cy.get('.card-suit').should('have.class', 'black');
      });
    });

    it('should make cards hoverable when it is player turn', () => {
      cy.get('#player-hand .card').first().trigger('mouseover');
      cy.get('#player-hand .card').first().should('have.class', 'hover');
    });

    it('should allow card selection on click', () => {
      cy.get('#player-hand .card').first().click();
      cy.get('#player-hand .card').first().should('have.class', 'selected');
    });

    it('should deselect card when clicking selected card', () => {
      cy.get('#player-hand .card').first().click();
      cy.get('#player-hand .card').first().should('have.class', 'selected');
      cy.get('#player-hand .card').first().click();
      cy.get('#player-hand .card').first().should('not.have.class', 'selected');
    });

    it('should only allow one card to be selected at a time', () => {
      cy.get('#player-hand .card').first().click();
      cy.get('#player-hand .card').eq(1).click();
      
      cy.get('#player-hand .card').first().should('not.have.class', 'selected');
      cy.get('#player-hand .card').eq(1).should('have.class', 'selected');
    });

    it('should render opponent card backs', () => {
      cy.get('#player-top-hand .card-back').should('exist');
      cy.get('#player-left-hand .card-back').should('exist');
      cy.get('#player-right-hand .card-back').should('exist');
    });
  });

  describe('Trump Declaration Interface', () => {
    beforeEach(() => {
      // Mock trump declaration phase
      cy.window().then((win) => {
        const gameState = {
          gamePhase: 'trump_declaration',
          trumpDeclarer: 'player1',
          currentPlayer: 'player1',
          playerHand: [
            { suit: 'hearts', rank: 'A' },
            { suit: 'hearts', rank: 'K' },
            { suit: 'diamonds', rank: 'Q' },
            { suit: 'spades', rank: 'J' }
          ]
        };
        
        win.postMessage({ type: 'trumpDeclaration', data: gameState }, '*');
      });
    });

    it('should show trump declaration modal', () => {
      cy.get('#trump-modal').should('not.have.class', 'hidden');
      cy.get('.trump-modal-content h3').should('contain.text', 'Declare Trump Suit');
    });

    it('should display all four trump suit options', () => {
      cy.get('.trump-option').should('have.length', 4);
      cy.get('[data-suit="hearts"]').should('be.visible');
      cy.get('[data-suit="diamonds"]').should('be.visible');
      cy.get('[data-suit="clubs"]').should('be.visible');
      cy.get('[data-suit="spades"]').should('be.visible');
    });

    it('should display suit symbols correctly', () => {
      cy.get('[data-suit="hearts"] .suit-symbol').should('contain.text', '♥');
      cy.get('[data-suit="diamonds"] .suit-symbol').should('contain.text', '♦');
      cy.get('[data-suit="clubs"] .suit-symbol').should('contain.text', '♣');
      cy.get('[data-suit="spades"] .suit-symbol').should('contain.text', '♠');
    });

    it('should allow trump suit selection', () => {
      cy.get('[data-suit="hearts"]').click();
      cy.get('[data-suit="hearts"]').should('have.class', 'selected');
      cy.get('#confirm-trump-btn').should('not.be.disabled');
    });

    it('should only allow one suit to be selected', () => {
      cy.get('[data-suit="hearts"]').click();
      cy.get('[data-suit="diamonds"]').click();
      
      cy.get('[data-suit="hearts"]').should('not.have.class', 'selected');
      cy.get('[data-suit="diamonds"]').should('have.class', 'selected');
    });

    it('should disable confirm button initially', () => {
      cy.get('#confirm-trump-btn').should('be.disabled');
    });

    it('should enable confirm button after selection', () => {
      cy.get('[data-suit="hearts"]').click();
      cy.get('#confirm-trump-btn').should('not.be.disabled');
    });

    it('should show only first 4 cards during trump declaration', () => {
      cy.get('#player-hand .card').should('have.length', 4);
      cy.get('#player-bottom-cards').should('contain.text', '4 cards (choosing trump)');
    });

    it('should disable cards during trump declaration', () => {
      cy.get('#player-hand .card').should('have.class', 'disabled');
    });
  });

  describe('Game State Display', () => {
    beforeEach(() => {
      // Mock active game state
      cy.window().then((win) => {
        const gameState = {
          currentRound: 2,
          currentTrick: 3,
          trumpSuit: 'hearts',
          scores: { team1: 15, team2: 8 },
          gamePhase: 'playing'
        };
        
        win.postMessage({ type: 'gameStateUpdate', data: gameState }, '*');
      });
    });

    it('should display current round number', () => {
      cy.get('#current-round').should('contain.text', '2');
    });

    it('should display current trick number', () => {
      cy.get('#current-trick').should('contain.text', '3');
    });

    it('should display trump suit when declared', () => {
      cy.get('#trump-suit .trump-symbol').should('contain.text', '♥');
      cy.get('#trump-suit .trump-name').should('contain.text', 'Hearts');
      cy.get('#trump-suit .trump-symbol').should('have.class', 'hearts');
    });

    it('should display team scores', () => {
      cy.get('#team-1-score .score-value').should('contain.text', '15');
      cy.get('#team-2-score .score-value').should('contain.text', '8');
    });

    it('should display trick area with card slots', () => {
      cy.get('.played-card-slot').should('have.length', 4);
      cy.get('[data-position="top"]').should('be.visible');
      cy.get('[data-position="left"]').should('be.visible');
      cy.get('[data-position="right"]').should('be.visible');
      cy.get('[data-position="bottom"]').should('be.visible');
    });
  });

  describe('Card Playing and Trick Management', () => {
    beforeEach(() => {
      // Mock playing phase
      cy.window().then((win) => {
        const gameState = {
          gamePhase: 'playing',
          isMyTurn: true,
          playerHand: [
            { suit: 'hearts', rank: 'A' },
            { suit: 'diamonds', rank: 'K' },
            { suit: 'clubs', rank: 'Q' },
            { suit: 'spades', rank: 'J' }
          ]
        };
        
        win.postMessage({ type: 'gameStateUpdate', data: gameState }, '*');
      });
    });

    it('should allow playing cards when it is player turn', () => {
      cy.get('#player-hand .card').first().should('not.have.class', 'disabled');
      cy.get('#player-hand .card').first().click();
      
      // Card should be selected and playable
      cy.get('#player-hand .card').first().should('have.class', 'selected');
    });

    it('should show played cards in trick area', () => {
      // Mock a played card
      cy.window().then((win) => {
        const playedCard = {
          playerId: 'player2',
          card: { suit: 'hearts', rank: 'K' },
          position: 'left'
        };
        
        win.postMessage({ type: 'cardPlayed', data: playedCard }, '*');
      });

      cy.get('[data-position="left"]').should('have.class', 'active');
      cy.get('[data-position="left"] .played-card').should('exist');
    });

    it('should display card rank and suit in played cards', () => {
      // Mock a played card
      cy.window().then((win) => {
        const playedCard = {
          playerId: 'player2',
          card: { suit: 'hearts', rank: 'K' },
          position: 'left'
        };
        
        win.postMessage({ type: 'cardPlayed', data: playedCard }, '*');
      });

      cy.get('[data-position="left"] .played-card .card-rank').should('contain.text', 'K');
      cy.get('[data-position="left"] .played-card .card-suit').should('contain.text', '♥');
    });
  });

  describe('Game Messages', () => {
    it('should display game messages', () => {
      // Mock adding a game message
      cy.window().then((win) => {
        win.postMessage({ 
          type: 'gameMessage', 
          data: { message: 'Player 2 played King of Hearts', type: 'info' } 
        }, '*');
      });

      cy.get('#game-messages .game-message').should('contain.text', 'Player 2 played King of Hearts');
      cy.get('#game-messages .game-message').should('have.class', 'info');
    });

    it('should display different message types with correct styling', () => {
      cy.window().then((win) => {
        win.postMessage({ 
          type: 'gameMessage', 
          data: { message: 'Trump declared!', type: 'success' } 
        }, '*');
        win.postMessage({ 
          type: 'gameMessage', 
          data: { message: 'Invalid move', type: 'error' } 
        }, '*');
        win.postMessage({ 
          type: 'gameMessage', 
          data: { message: 'Your turn', type: 'warning' } 
        }, '*');
      });

      cy.get('#game-messages .game-message.success').should('exist');
      cy.get('#game-messages .game-message.error').should('exist');
      cy.get('#game-messages .game-message.warning').should('exist');
    });

    it('should auto-scroll messages to bottom', () => {
      // Add multiple messages
      cy.window().then((win) => {
        for (let i = 1; i <= 15; i++) {
          win.postMessage({ 
            type: 'gameMessage', 
            data: { message: `Message ${i}`, type: 'info' } 
          }, '*');
        }
      });

      // Should show latest message
      cy.get('#game-messages').should('contain.text', 'Message 15');
    });
  });

  describe('Connection Status', () => {
    it('should display connection status indicator', () => {
      cy.get('#status-indicator').should('be.visible');
      cy.get('#status-text').should('be.visible');
    });

    it('should show connecting status initially', () => {
      cy.get('#status-text').should('contain.text', 'Connecting...');
      cy.get('#status-indicator').should('have.class', 'connecting');
    });

    it('should update to connected status', () => {
      cy.window().then((win) => {
        win.postMessage({ type: 'connectionStatus', data: 'connected' }, '*');
      });

      cy.get('#status-text').should('contain.text', 'Connected');
      cy.get('#status-indicator').should('have.class', 'connected');
    });

    it('should show disconnected status', () => {
      cy.window().then((win) => {
        win.postMessage({ type: 'connectionStatus', data: 'disconnected' }, '*');
      });

      cy.get('#status-text').should('contain.text', 'Disconnected');
      cy.get('#status-indicator').should('have.class', 'disconnected');
    });
  });

  describe('Leave Game Functionality', () => {
    it('should show confirmation dialog when leaving game', () => {
      cy.window().then((win) => {
        cy.stub(win, 'confirm').returns(true);
      });

      cy.get('#leave-game-btn').click();
      
      cy.window().its('confirm').should('have.been.called');
    });

    it('should redirect to dashboard when leaving game', () => {
      cy.window().then((win) => {
        cy.stub(win, 'confirm').returns(true);
      });

      cy.get('#leave-game-btn').click();
      
      // Should redirect to dashboard
      cy.url().should('include', 'dashboard.html');
    });

    it('should not leave game when user cancels', () => {
      cy.window().then((win) => {
        cy.stub(win, 'confirm').returns(false);
      });

      cy.get('#leave-game-btn').click();
      
      // Should stay on game page
      cy.url().should('include', 'game.html');
    });
  });

  describe('Error Handling', () => {
    it('should display error modal for game errors', () => {
      cy.window().then((win) => {
        win.postMessage({ 
          type: 'gameError', 
          data: { message: 'Connection lost to game server' } 
        }, '*');
      });

      cy.get('#error-modal').should('not.have.class', 'hidden');
      cy.get('#error-message').should('contain.text', 'Connection lost to game server');
    });

    it('should close error modal when OK button is clicked', () => {
      cy.window().then((win) => {
        win.postMessage({ 
          type: 'gameError', 
          data: { message: 'Test error' } 
        }, '*');
      });

      cy.get('#error-ok-btn').click();
      cy.get('#error-modal').should('have.class', 'hidden');
    });

    it('should close error modal when close button is clicked', () => {
      cy.window().then((win) => {
        win.postMessage({ 
          type: 'gameError', 
          data: { message: 'Test error' } 
        }, '*');
      });

      cy.get('#close-error-btn').click();
      cy.get('#error-modal').should('have.class', 'hidden');
    });
  });

  describe('Responsive Design', () => {
    it('should adapt layout for mobile devices', () => {
      cy.viewport(375, 667); // iPhone SE size
      
      cy.get('.game-table').should('be.visible');
      cy.get('.card').should('have.css', 'width', '45px');
      cy.get('.card').should('have.css', 'height', '68px');
    });

    it('should adapt layout for very small screens', () => {
      cy.viewport(320, 568); // iPhone 5 size
      
      cy.get('.game-table').should('be.visible');
      cy.get('.card').should('have.css', 'width', '35px');
      cy.get('.card').should('have.css', 'height', '53px');
    });

    it('should maintain functionality on tablet', () => {
      cy.viewport(768, 1024); // iPad size
      
      cy.get('.game-table').should('be.visible');
      cy.get('#player-hand .card').should('be.visible');
      cy.get('#trump-display').should('be.visible');
    });

    it('should handle landscape orientation', () => {
      cy.viewport(667, 375); // iPhone SE landscape
      
      cy.get('.game-table').should('be.visible');
      cy.get('.game-header').should('be.visible');
    });
  });

  describe('Touch Interactions', () => {
    beforeEach(() => {
      cy.viewport(375, 667); // Mobile viewport
    });

    it('should handle touch events on cards', () => {
      // Mock player hand
      cy.window().then((win) => {
        const mockHand = [
          { suit: 'hearts', rank: 'A' },
          { suit: 'diamonds', rank: 'K' }
        ];
        
        win.postMessage({ 
          type: 'handUpdate', 
          data: { playerHand: mockHand, isMyTurn: true } 
        }, '*');
      });

      cy.get('#player-hand .card').first().trigger('touchstart');
      cy.get('#player-hand .card').first().should('have.class', 'touching');
      
      cy.get('#player-hand .card').first().trigger('touchend');
      cy.get('#player-hand .card').first().should('not.have.class', 'touching');
    });

    it('should handle swipe gestures on cards', () => {
      // Mock player hand
      cy.window().then((win) => {
        const mockHand = [{ suit: 'hearts', rank: 'A' }];
        win.postMessage({ 
          type: 'handUpdate', 
          data: { playerHand: mockHand, isMyTurn: true } 
        }, '*');
      });

      cy.get('#player-hand .card').first()
        .trigger('touchstart', { touches: [{ clientX: 100, clientY: 200 }] })
        .trigger('touchmove', { touches: [{ clientX: 100, clientY: 150 }] })
        .trigger('touchend');
      
      // Should select the card after swipe up
      cy.get('#player-hand .card').first().should('have.class', 'selected');
    });
  });

  describe('Accessibility', () => {
    it('should have proper ARIA labels and roles', () => {
      cy.get('.game-table').should('have.attr', 'role');
      cy.get('#player-hand').should('have.attr', 'aria-label');
      cy.get('.card').should('have.attr', 'tabindex');
    });

    it('should support keyboard navigation', () => {
      // Mock player hand
      cy.window().then((win) => {
        const mockHand = [
          { suit: 'hearts', rank: 'A' },
          { suit: 'diamonds', rank: 'K' }
        ];
        
        win.postMessage({ 
          type: 'handUpdate', 
          data: { playerHand: mockHand, isMyTurn: true } 
        }, '*');
      });

      cy.get('#player-hand .card').first().focus();
      cy.get('#player-hand .card').first().type('{enter}');
      cy.get('#player-hand .card').first().should('have.class', 'selected');
    });

    it('should have sufficient color contrast', () => {
      cy.get('.card-rank.red').should('have.css', 'color', 'rgb(220, 53, 69)');
      cy.get('.card-rank.black').should('have.css', 'color', 'rgb(0, 0, 0)');
    });
  });
});