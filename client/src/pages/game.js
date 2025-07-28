/**
 * Game Page - Contract Crown PWA
 * Handles game table layout, card display, and basic game state management
 */

import { AuthManager } from '../core/auth.js';

class GameManager {
    constructor() {
        this.authManager = new AuthManager();
        this.socket = null;
        this.gameState = {
            gameId: null,
            currentPlayer: 'player1',
            players: {
                'player1': { username: 'You', seatPosition: 1, handSize: 4 },
                'player2': { username: 'Player 2', seatPosition: 2, handSize: 4 },
                'player3': { username: 'Player 3', seatPosition: 3, handSize: 4 },
                'player4': { username: 'Player 4', seatPosition: 4, handSize: 4 }
            },
            currentRound: 1,
            currentTrick: 1,
            trumpSuit: null,
            trumpDeclarer: 'player1',
            scores: { team1: 0, team2: 0 },
            playerHand: [
                // Initial 4 cards for trump declaration
                { suit: 'hearts', rank: 'A' },
                { suit: 'hearts', rank: 'K' },
                { suit: 'diamonds', rank: 'Q' },
                { suit: 'spades', rank: 'J' }
            ],
            selectedCard: null,
            isMyTurn: false,
            gamePhase: 'trump_declaration', // waiting, trump_declaration, playing, round_end
            leadSuit: null,
            currentTurnPlayer: null
        };
        
        this.elements = {};
        this.init();
    }

    async init() {
        try {
            // Check authentication
            if (!this.authManager.isAuthenticated()) {
                window.location.href = '/login.html';
                return;
            }

            this.initializeElements();
            this.setupEventListeners();
            this.initializeWebSocket();
            this.updateUI();
            
            // Show loading initially
            this.showLoading('Connecting to game...');
            
        } catch (error) {
            console.error('Failed to initialize game:', error);
            this.showError('Failed to initialize game. Please try again.');
        }
    }

    initializeElements() {
        // Header elements
        this.elements.leaveGameBtn = document.getElementById('leave-game-btn');
        this.elements.currentRound = document.getElementById('current-round');
        this.elements.connectionStatus = document.getElementById('connection-status');
        this.elements.statusIndicator = document.getElementById('status-indicator');
        this.elements.statusText = document.getElementById('status-text');

        // Player elements
        this.elements.playerTopName = document.getElementById('player-top-name');
        this.elements.playerLeftName = document.getElementById('player-left-name');
        this.elements.playerRightName = document.getElementById('player-right-name');
        this.elements.playerBottomName = document.getElementById('player-bottom-name');
        
        this.elements.playerTopCards = document.getElementById('player-top-cards');
        this.elements.playerLeftCards = document.getElementById('player-left-cards');
        this.elements.playerRightCards = document.getElementById('player-right-cards');
        this.elements.playerBottomCards = document.getElementById('player-bottom-cards');
        
        this.elements.playerTopTurn = document.getElementById('player-top-turn');
        this.elements.playerLeftTurn = document.getElementById('player-left-turn');
        this.elements.playerRightTurn = document.getElementById('player-right-turn');
        this.elements.playerBottomTurn = document.getElementById('player-bottom-turn');
        
        this.elements.playerTopHand = document.getElementById('player-top-hand');
        this.elements.playerLeftHand = document.getElementById('player-left-hand');
        this.elements.playerRightHand = document.getElementById('player-right-hand');
        this.elements.playerHand = document.getElementById('player-hand');

        // Center table elements
        this.elements.trumpSuit = document.getElementById('trump-suit');
        this.elements.currentTrick = document.getElementById('current-trick');
        this.elements.trickArea = document.getElementById('trick-area');
        this.elements.playedCardTop = document.getElementById('played-card-top');
        this.elements.playedCardLeft = document.getElementById('played-card-left');
        this.elements.playedCardRight = document.getElementById('played-card-right');
        this.elements.playedCardBottom = document.getElementById('played-card-bottom');
        
        // Score elements
        this.elements.team1Score = document.getElementById('team-1-score');
        this.elements.team2Score = document.getElementById('team-2-score');

        // Modal elements
        this.elements.trumpModal = document.getElementById('trump-modal');
        this.elements.trumpOptions = document.querySelectorAll('.trump-option');
        this.elements.confirmTrumpBtn = document.getElementById('confirm-trump-btn');

        // Messages and overlays
        this.elements.gameMessages = document.getElementById('game-messages');
        this.elements.loadingOverlay = document.getElementById('loading-overlay');
        this.elements.loadingText = document.getElementById('loading-text');
        this.elements.errorModal = document.getElementById('error-modal');
        this.elements.errorMessage = document.getElementById('error-message');
        this.elements.closeErrorBtn = document.getElementById('close-error-btn');
        this.elements.errorOkBtn = document.getElementById('error-ok-btn');
    }

    setupEventListeners() {
        // Leave game button
        this.elements.leaveGameBtn.addEventListener('click', () => this.leaveGame());

        // Trump declaration
        this.elements.trumpOptions.forEach(option => {
            option.addEventListener('click', (e) => this.selectTrumpSuit(e.currentTarget));
        });
        this.elements.confirmTrumpBtn.addEventListener('click', () => this.confirmTrumpDeclaration());

        // Error modal
        this.elements.closeErrorBtn.addEventListener('click', () => this.hideError());
        this.elements.errorOkBtn.addEventListener('click', () => this.hideError());

        // Card selection (will be set up when cards are rendered)
        this.elements.playerHand.addEventListener('click', (e) => this.handleCardClick(e));
    }

    initializeWebSocket() {
        if (typeof io === 'undefined') {
            this.showError('WebSocket connection not available');
            return;
        }

        this.socket = io();
        
        this.socket.on('connect', () => {
            console.log('Connected to game server');
            this.updateConnectionStatus('connected');
            this.joinGame();
        });

        this.socket.on('disconnect', () => {
            console.log('Disconnected from game server');
            this.updateConnectionStatus('disconnected');
        });

        this.socket.on('reconnecting', () => {
            console.log('Reconnecting to game server');
            this.updateConnectionStatus('connecting');
        });

        // Game events
        this.socket.on('game:state_update', (data) => this.handleGameStateUpdate(data));
        this.socket.on('game:trump_declared', (data) => this.handleTrumpDeclared(data));
        this.socket.on('game:card_played', (data) => this.handleCardPlayed(data));
        this.socket.on('game:trick_won', (data) => this.handleTrickWon(data));
        this.socket.on('game:round_scores', (data) => this.handleRoundScores(data));
        this.socket.on('game:error', (data) => this.handleGameError(data));
    }

    joinGame() {
        const urlParams = new URLSearchParams(window.location.search);
        const gameId = urlParams.get('gameId');
        
        if (!gameId) {
            this.showError('No game ID provided');
            return;
        }

        this.gameState.gameId = gameId;
        this.socket.emit('game:join', { 
            gameId: gameId,
            token: this.authManager.getToken()
        });
    }

    // Game State Management
    handleGameStateUpdate(data) {
        console.log('Game state update:', data);
        
        this.gameState = { ...this.gameState, ...data };
        this.updateUI();
        this.hideLoading();
        
        // Handle different game phases
        if (data.gamePhase === 'trump_declaration' && data.trumpDeclarer === this.gameState.currentPlayer) {
            setTimeout(() => {
                this.showTrumpDeclarationModal();
                this.highlightRecommendedSuit();
            }, 500);
        }
    }

    handleTrumpDeclared(data) {
        console.log('Trump declared:', data);
        this.gameState.trumpSuit = data.trumpSuit;
        this.gameState.gamePhase = 'playing';
        this.updateTrumpDisplay();
        this.hideTrumpDeclarationModal();
        this.handleTrumpDeclarationComplete();
        this.addGameMessage(`Trump suit declared: ${data.trumpSuit}`, 'success');
    }

    handleCardPlayed(data) {
        console.log('Card played:', data);
        this.renderPlayedCard(data.playerId, data.card, data.position);
        this.addGameMessage(`${data.playerName} played ${data.card.rank} of ${data.card.suit}`, 'info');
    }

    handleTrickWon(data) {
        console.log('Trick won:', data);
        this.addGameMessage(`${data.winnerName} won the trick`, 'success');
        
        // Clear played cards after a delay
        setTimeout(() => {
            this.clearPlayedCards();
            this.gameState.currentTrick++;
            this.updateUI();
        }, 2000);
    }

    handleRoundScores(data) {
        console.log('Round scores:', data);
        this.gameState.scores = data.scores;
        this.updateScoreDisplay();
        this.addGameMessage(`Round ${data.round} complete. Scores updated.`, 'success');
    }

    handleGameError(data) {
        console.error('Game error:', data);
        this.showError(data.message || 'A game error occurred');
    }

    // UI Updates
    updateUI() {
        this.updateRoundInfo();
        this.updatePlayerInfo();
        this.updateTurnIndicators();
        this.updateTrumpDisplay();
        this.updateScoreDisplay();
        this.renderPlayerHand();
        this.renderOpponentHands();
        this.updateCardPlayability();
    }

    updateRoundInfo() {
        this.elements.currentRound.textContent = this.gameState.currentRound;
        this.elements.currentTrick.textContent = this.gameState.currentTrick;
    }

    updatePlayerInfo() {
        // Update player names and card counts
        Object.entries(this.gameState.players).forEach(([playerId, player]) => {
            const position = this.getPlayerPosition(playerId);
            const nameElement = this.elements[`player${position}Name`];
            const cardsElement = this.elements[`player${position}Cards`];
            
            if (nameElement) {
                nameElement.textContent = player.username || `Player ${player.seatPosition}`;
            }
            
            if (cardsElement) {
                const cardCount = player.handSize || 8;
                cardsElement.textContent = `${cardCount} card${cardCount !== 1 ? 's' : ''}`;
            }
        });
    }

    updateTurnIndicators() {
        // Clear all turn indicators
        [this.elements.playerTopTurn, this.elements.playerLeftTurn, 
         this.elements.playerRightTurn, this.elements.playerBottomTurn].forEach(indicator => {
            if (indicator) indicator.classList.remove('active');
        });

        // Highlight current player's turn
        if (this.gameState.currentTurnPlayer) {
            const position = this.getPlayerPosition(this.gameState.currentTurnPlayer);
            const turnIndicator = this.elements[`player${position}Turn`];
            if (turnIndicator) {
                turnIndicator.classList.add('active');
            }
        }
    }

    updateTrumpDisplay() {
        if (this.gameState.trumpSuit) {
            const suitSymbols = {
                hearts: '♥',
                diamonds: '♦',
                clubs: '♣',
                spades: '♠'
            };
            
            const symbol = suitSymbols[this.gameState.trumpSuit] || '?';
            const name = this.gameState.trumpSuit.charAt(0).toUpperCase() + this.gameState.trumpSuit.slice(1);
            
            this.elements.trumpSuit.innerHTML = `
                <span class="trump-symbol ${this.gameState.trumpSuit}">${symbol}</span>
                <span class="trump-name">${name}</span>
            `;
        } else {
            this.elements.trumpSuit.innerHTML = `
                <span class="trump-symbol">?</span>
                <span class="trump-name">Not Declared</span>
            `;
        }
    }

    updateScoreDisplay() {
        if (this.elements.team1Score) {
            this.elements.team1Score.querySelector('.score-value').textContent = this.gameState.scores.team1;
        }
        if (this.elements.team2Score) {
            this.elements.team2Score.querySelector('.score-value').textContent = this.gameState.scores.team2;
        }
    }

    updateConnectionStatus(status) {
        const statusMap = {
            connected: { text: 'Connected', class: 'connected' },
            connecting: { text: 'Connecting...', class: 'connecting' },
            disconnected: { text: 'Disconnected', class: 'disconnected' }
        };

        const statusInfo = statusMap[status] || statusMap.disconnected;
        
        this.elements.statusText.textContent = statusInfo.text;
        this.elements.statusIndicator.className = `status-indicator ${statusInfo.class}`;
    }

    // Card Rendering
    renderPlayerHand() {
        if (!this.gameState.playerHand || !this.elements.playerHand) return;

        this.elements.playerHand.innerHTML = '';
        
        this.gameState.playerHand.forEach((card, index) => {
            const cardElement = this.createCardElement(card, index);
            this.elements.playerHand.appendChild(cardElement);
        });

        // Update card count display
        this.elements.playerBottomCards.textContent = `${this.gameState.playerHand.length} card${this.gameState.playerHand.length !== 1 ? 's' : ''}`;
    }

    renderOpponentHands() {
        // Render card backs for opponents based on actual hand sizes
        const positions = ['Top', 'Left', 'Right'];
        
        positions.forEach(position => {
            const handElement = this.elements[`player${position}Hand`];
            if (!handElement) return;

            // Get card count for this position from game state
            const playerId = this.getPlayerIdByPosition(position);
            const player = this.gameState.players[playerId];
            const cardCount = player ? (player.handSize || 8) : 8;

            handElement.innerHTML = '';
            
            // Create card backs with stacking effect
            for (let i = 0; i < cardCount; i++) {
                const cardBack = this.createCardBackElement(i, cardCount);
                handElement.appendChild(cardBack);
            }
        });
    }

    createCardElement(card, index) {
        const cardElement = document.createElement('div');
        cardElement.className = 'card';
        cardElement.dataset.cardIndex = index;
        cardElement.dataset.suit = card.suit;
        cardElement.dataset.rank = card.rank;

        // Check if card is playable (basic validation)
        const isPlayable = this.isCardPlayable(card);
        if (!isPlayable) {
            cardElement.classList.add('disabled');
        }

        const isRed = card.suit === 'hearts' || card.suit === 'diamonds';
        const colorClass = isRed ? 'red' : 'black';

        const suitSymbols = {
            hearts: '♥',
            diamonds: '♦',
            clubs: '♣',
            spades: '♠'
        };

        // Enhanced card layout with corner ranks and center suit
        cardElement.innerHTML = `
            <div class="card-corner card-corner-top">
                <div class="card-rank ${colorClass}">${card.rank}</div>
                <div class="card-suit-small ${colorClass}">${suitSymbols[card.suit]}</div>
            </div>
            <div class="card-center">
                <div class="card-suit ${colorClass}">${suitSymbols[card.suit]}</div>
            </div>
            <div class="card-corner card-corner-bottom">
                <div class="card-rank ${colorClass}">${card.rank}</div>
                <div class="card-suit-small ${colorClass}">${suitSymbols[card.suit]}</div>
            </div>
        `;

        // Add touch event listeners for better mobile interaction
        this.addCardTouchEvents(cardElement);

        return cardElement;
    }

    createCardBackElement(index, totalCards) {
        const cardBack = document.createElement('div');
        cardBack.className = 'card-back';
        
        // Add stacking effect
        cardBack.style.zIndex = totalCards - index;
        
        // Add subtle animation delay for visual appeal
        cardBack.style.animationDelay = `${index * 0.1}s`;
        
        return cardBack;
    }

    addCardTouchEvents(cardElement) {
        let touchStartY = 0;
        let touchStartTime = 0;
        let isDragging = false;

        // Touch start
        cardElement.addEventListener('touchstart', (e) => {
            touchStartY = e.touches[0].clientY;
            touchStartTime = Date.now();
            isDragging = false;
            
            // Add touch feedback
            cardElement.classList.add('touching');
        }, { passive: true });

        // Touch move
        cardElement.addEventListener('touchmove', (e) => {
            const touchY = e.touches[0].clientY;
            const deltaY = touchStartY - touchY;
            
            // If moved up significantly, consider it a drag
            if (deltaY > 20) {
                isDragging = true;
                cardElement.style.transform = `translateY(${-Math.min(deltaY, 50)}px)`;
            }
        }, { passive: true });

        // Touch end
        cardElement.addEventListener('touchend', (e) => {
            const touchDuration = Date.now() - touchStartTime;
            
            cardElement.classList.remove('touching');
            cardElement.style.transform = '';
            
            // If it was a quick tap or significant drag up, select the card
            if (touchDuration < 300 || isDragging) {
                this.handleCardSelection(cardElement);
            }
        });

        // Mouse events for desktop
        cardElement.addEventListener('mouseenter', () => {
            if (!cardElement.classList.contains('disabled')) {
                cardElement.classList.add('hover');
            }
        });

        cardElement.addEventListener('mouseleave', () => {
            cardElement.classList.remove('hover');
        });
    }

    isCardPlayable(card) {
        // Basic playability check - in a real game this would check suit following rules
        if (!this.gameState.isMyTurn) return false;
        
        // During trump declaration phase, all cards are playable
        if (this.gameState.gamePhase === 'trump_declaration') return true;
        
        // During playing phase, implement suit following rules
        if (this.gameState.gamePhase === 'playing') {
            // If no cards played yet in trick, any card is playable
            if (!this.gameState.leadSuit) return true;
            
            // Must follow suit if possible
            const hasLeadSuit = this.gameState.playerHand.some(c => c.suit === this.gameState.leadSuit);
            if (hasLeadSuit && card.suit !== this.gameState.leadSuit) {
                // Can only play non-lead suit if no lead suit cards available
                return false;
            }
        }
        
        return true;
    }

    updateCardPlayability() {
        // Update which cards can be played based on current game state
        const cardElements = this.elements.playerHand.querySelectorAll('.card');
        
        cardElements.forEach((cardElement, index) => {
            const card = this.gameState.playerHand[index];
            if (!card) return;
            
            const isPlayable = this.isCardPlayable(card);
            
            if (isPlayable) {
                cardElement.classList.remove('disabled');
            } else {
                cardElement.classList.add('disabled');
            }
        });
    }

    renderPlayedCard(playerId, card, position) {
        const slotElement = this.elements[`playedCard${position.charAt(0).toUpperCase() + position.slice(1)}`];
        if (!slotElement) return;

        const cardElement = this.createPlayedCardElement(card);
        slotElement.innerHTML = '';
        slotElement.appendChild(cardElement);
        slotElement.classList.add('active');
    }

    createPlayedCardElement(card) {
        const cardElement = document.createElement('div');
        cardElement.className = 'played-card';

        const isRed = card.suit === 'hearts' || card.suit === 'diamonds';
        const colorClass = isRed ? 'red' : 'black';

        const suitSymbols = {
            hearts: '♥',
            diamonds: '♦',
            clubs: '♣',
            spades: '♠'
        };

        cardElement.innerHTML = `
            <div class="card-rank ${colorClass}">${card.rank}</div>
            <div class="card-suit ${colorClass}">${suitSymbols[card.suit]}</div>
        `;

        return cardElement;
    }

    clearPlayedCards() {
        [this.elements.playedCardTop, this.elements.playedCardLeft,
         this.elements.playedCardRight, this.elements.playedCardBottom].forEach(slot => {
            if (slot) {
                slot.innerHTML = '';
                slot.classList.remove('active');
            }
        });
    }

    // Card Interaction
    handleCardClick(event) {
        const cardElement = event.target.closest('.card');
        if (!cardElement) return;

        this.handleCardSelection(cardElement);
    }

    handleCardSelection(cardElement) {
        if (!this.gameState.isMyTurn || cardElement.classList.contains('disabled')) {
            this.addGameMessage("It's not your turn or this card cannot be played", 'warning');
            return;
        }

        const cardIndex = parseInt(cardElement.dataset.cardIndex);
        const card = this.gameState.playerHand[cardIndex];

        if (!card) return;

        // Toggle selection
        if (this.gameState.selectedCard === cardIndex) {
            this.deselectCard();
        } else {
            this.selectCard(cardIndex);
        }
    }

    selectCard(cardIndex) {
        // Deselect previous card
        this.deselectCard();

        // Select new card
        this.gameState.selectedCard = cardIndex;
        const cardElement = this.elements.playerHand.children[cardIndex];
        if (cardElement) {
            cardElement.classList.add('selected');
        }

        // Play the card (for now, auto-play on selection)
        this.playSelectedCard();
    }

    deselectCard() {
        if (this.gameState.selectedCard !== null) {
            const cardElement = this.elements.playerHand.children[this.gameState.selectedCard];
            if (cardElement) {
                cardElement.classList.remove('selected');
            }
            this.gameState.selectedCard = null;
        }
    }

    playSelectedCard() {
        if (this.gameState.selectedCard === null || !this.gameState.isMyTurn) return;

        const card = this.gameState.playerHand[this.gameState.selectedCard];
        if (!card) return;

        // Emit card play to server
        this.socket.emit('game:play_card', {
            gameId: this.gameState.gameId,
            card: card
        });

        // Remove card from hand (optimistic update)
        this.gameState.playerHand.splice(this.gameState.selectedCard, 1);
        this.gameState.selectedCard = null;
        this.gameState.isMyTurn = false;
        
        this.renderPlayerHand();
    }

    // Trump Declaration
    showTrumpDeclarationModal() {
        // Show only the first 4 cards during trump declaration
        this.renderInitialCards();
        this.elements.trumpModal.classList.remove('hidden');
        this.addGameMessage("Choose the trump suit based on your first 4 cards", 'info');
    }

    hideTrumpDeclarationModal() {
        this.elements.trumpModal.classList.add('hidden');
        this.clearTrumpSelection();
    }

    renderInitialCards() {
        // During trump declaration, show only first 4 cards
        if (this.gameState.gamePhase === 'trump_declaration') {
            const initialCards = this.gameState.playerHand.slice(0, 4);
            this.renderPartialHand(initialCards);
            
            // Update card count display
            this.elements.playerBottomCards.textContent = "4 cards (choosing trump)";
        }
    }

    renderPartialHand(cards) {
        if (!this.elements.playerHand) return;

        this.elements.playerHand.innerHTML = '';
        
        cards.forEach((card, index) => {
            const cardElement = this.createCardElement(card, index);
            // During trump declaration, cards are not playable
            cardElement.classList.add('disabled');
            this.elements.playerHand.appendChild(cardElement);
        });
    }

    selectTrumpSuit(optionElement) {
        // Clear previous selection
        this.elements.trumpOptions.forEach(option => option.classList.remove('selected'));
        
        // Select new option
        optionElement.classList.add('selected');
        this.elements.confirmTrumpBtn.disabled = false;
        
        // Add visual feedback
        const suit = optionElement.dataset.suit;
        this.addGameMessage(`Selected ${suit} as trump suit`, 'info');
    }

    confirmTrumpDeclaration() {
        const selectedOption = document.querySelector('.trump-option.selected');
        if (!selectedOption) {
            this.addGameMessage('Please select a trump suit first', 'warning');
            return;
        }

        const trumpSuit = selectedOption.dataset.suit;
        
        // Validate trump declaration
        if (!this.validateTrumpDeclaration(trumpSuit)) {
            this.addGameMessage('Invalid trump selection', 'error');
            return;
        }
        
        // Show loading state
        this.elements.confirmTrumpBtn.disabled = true;
        this.elements.confirmTrumpBtn.innerHTML = '<span class="spinner"></span> Declaring...';
        
        this.socket.emit('game:declare_trump', {
            gameId: this.gameState.gameId,
            trumpSuit: trumpSuit
        });

        this.addGameMessage(`Declaring ${trumpSuit} as trump...`, 'info');
    }

    validateTrumpDeclaration(trumpSuit) {
        // Basic validation - ensure it's a valid suit
        const validSuits = ['hearts', 'diamonds', 'clubs', 'spades'];
        if (!validSuits.includes(trumpSuit)) {
            return false;
        }

        // Check if player is allowed to declare trump
        if (this.gameState.gamePhase !== 'trump_declaration') {
            return false;
        }

        // Additional validation could be added here
        return true;
    }

    clearTrumpSelection() {
        this.elements.trumpOptions.forEach(option => option.classList.remove('selected'));
        this.elements.confirmTrumpBtn.disabled = true;
        this.elements.confirmTrumpBtn.innerHTML = 'Confirm Trump';
    }

    handleTrumpDeclarationComplete() {
        // After trump is declared, deal remaining 4 cards
        this.dealRemainingCards();
        this.gameState.gamePhase = 'playing';
        this.updateUI();
        this.addGameMessage("Trump declared! Dealing remaining cards...", 'success');
    }

    dealRemainingCards() {
        // In a real implementation, this would come from the server
        // For now, simulate dealing the remaining 4 cards
        if (this.gameState.playerHand.length === 4) {
            const remainingCards = [
                { suit: 'hearts', rank: '10' },
                { suit: 'diamonds', rank: '9' },
                { suit: 'clubs', rank: '8' },
                { suit: 'spades', rank: '7' }
            ];
            
            this.gameState.playerHand = [...this.gameState.playerHand, ...remainingCards];
            
            // Animate card dealing
            setTimeout(() => {
                this.renderPlayerHand();
                this.addCardDealingAnimation();
            }, 500);
        }
    }

    addCardDealingAnimation() {
        const cards = this.elements.playerHand.querySelectorAll('.card');
        cards.forEach((card, index) => {
            if (index >= 4) { // Only animate the new cards
                card.classList.add('card-dealing');
                card.style.animationDelay = `${(index - 4) * 0.1}s`;
            }
        });
    }

    getSuitRecommendation() {
        // Analyze first 4 cards to suggest best trump suit
        if (this.gameState.playerHand.length < 4) return null;
        
        const firstFour = this.gameState.playerHand.slice(0, 4);
        const suitCounts = {};
        const highCards = ['A', 'K', 'Q', 'J'];
        
        firstFour.forEach(card => {
            if (!suitCounts[card.suit]) {
                suitCounts[card.suit] = { count: 0, highCards: 0 };
            }
            suitCounts[card.suit].count++;
            if (highCards.includes(card.rank)) {
                suitCounts[card.suit].highCards++;
            }
        });
        
        // Find suit with most cards or highest value cards
        let bestSuit = null;
        let bestScore = 0;
        
        Object.entries(suitCounts).forEach(([suit, data]) => {
            const score = data.count * 2 + data.highCards * 3;
            if (score > bestScore) {
                bestScore = score;
                bestSuit = suit;
            }
        });
        
        return bestSuit;
    }

    highlightRecommendedSuit() {
        const recommendedSuit = this.getSuitRecommendation();
        if (recommendedSuit) {
            const recommendedOption = document.querySelector(`[data-suit="${recommendedSuit}"]`);
            if (recommendedOption) {
                recommendedOption.classList.add('recommended');
                
                // Add recommendation text
                const recommendation = document.createElement('div');
                recommendation.className = 'suit-recommendation';
                recommendation.textContent = 'Recommended';
                recommendedOption.appendChild(recommendation);
            }
        }
    }

    // Utility Methods
    getPlayerPosition(playerId) {
        // This would map player IDs to screen positions
        // For now, return a default mapping
        const positions = ['Bottom', 'Left', 'Top', 'Right'];
        const playerIndex = Object.keys(this.gameState.players).indexOf(playerId);
        return positions[playerIndex] || 'Bottom';
    }

    getPlayerIdByPosition(position) {
        // Reverse mapping from position to player ID
        const positions = ['Bottom', 'Left', 'Top', 'Right'];
        const positionIndex = positions.indexOf(position);
        const playerIds = Object.keys(this.gameState.players);
        return playerIds[positionIndex] || null;
    }

    addGameMessage(message, type = 'info') {
        const messageElement = document.createElement('div');
        messageElement.className = `game-message ${type}`;
        messageElement.textContent = message;
        
        this.elements.gameMessages.appendChild(messageElement);
        this.elements.gameMessages.scrollTop = this.elements.gameMessages.scrollHeight;

        // Remove old messages if too many
        const messages = this.elements.gameMessages.children;
        if (messages.length > 10) {
            messages[0].remove();
        }
    }

    // UI State Management
    showLoading(message = 'Loading...') {
        this.elements.loadingText.textContent = message;
        this.elements.loadingOverlay.classList.remove('hidden');
    }

    hideLoading() {
        this.elements.loadingOverlay.classList.add('hidden');
    }

    showError(message) {
        this.elements.errorMessage.textContent = message;
        this.elements.errorModal.classList.remove('hidden');
    }

    hideError() {
        this.elements.errorModal.classList.add('hidden');
    }

    leaveGame() {
        if (confirm('Are you sure you want to leave the game?')) {
            if (this.socket) {
                this.socket.emit('game:leave', { gameId: this.gameState.gameId });
            }
            window.location.href = '/dashboard.html';
        }
    }
}

// Initialize game when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    new GameManager();
});

export { GameManager };