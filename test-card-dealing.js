/**
 * Test script to verify the improved card dealing algorithm
 * Run with: node test-card-dealing.js
 */

// Mock the GameEngine class for testing
class TestGameEngine {
    constructor() {
        this.suits = ['Hearts', 'Diamonds', 'Clubs', 'Spades'];
        this.ranks = ['7', '8', '9', '10', 'J', 'Q', 'K', 'A'];
        this.cardValues = {
            '7': 7, '8': 8, '9': 9, '10': 10,
            'J': 11, 'Q': 12, 'K': 13, 'A': 14
        };
    }

    generateDeck() {
        const deck = [];
        for (const suit of this.suits) {
            for (const rank of this.ranks) {
                deck.push({
                    suit,
                    rank,
                    value: this.cardValues[rank]
                });
            }
        }
        return deck;
    }

    shuffleDeck(deck) {
        const shuffled = [...deck];
        
        // Multiple shuffle passes for better randomization
        for (let pass = 0; pass < 3; pass++) {
            for (let i = shuffled.length - 1; i > 0; i--) {
                const j = Math.floor(Math.random() * (i + 1));
                [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
            }
        }
        
        return shuffled;
    }

    validateHandDistribution(playerHands) {
        for (const [playerId, hand] of Object.entries(playerHands)) {
            const aces = hand.filter(card => card.rank === 'A').length;
            const sevens = hand.filter(card => card.rank === '7').length;
            
            if (aces >= 3 || sevens >= 3) {
                console.log(`Invalid hand for player ${playerId}: ${aces} Aces, ${sevens} 7s - reshuffling required`);
                return false;
            }
        }
        return true;
    }

    validateUniqueCards(playerHands) {
        const allDealtCards = [];
        
        for (const [playerId, hand] of Object.entries(playerHands)) {
            for (const card of hand) {
                const cardId = `${card.suit}-${card.rank}`;
                if (allDealtCards.includes(cardId)) {
                    console.log(`Duplicate card found: ${cardId} - reshuffling required`);
                    return false;
                }
                allDealtCards.push(cardId);
            }
        }
        
        return true;
    }

    dealCardsWithValidation(shuffledDeck, players, cardsPerPlayer, maxAttempts = 10) {
        let attempts = 0;
        
        while (attempts < maxAttempts) {
            attempts++;
            
            // Deal cards to players
            const playerHands = {};
            let cardIndex = 0;
            
            for (const player of players) {
                playerHands[player.user_id] = shuffledDeck.slice(cardIndex, cardIndex + cardsPerPlayer);
                cardIndex += cardsPerPlayer;
            }
            
            // Validate unique cards
            if (!this.validateUniqueCards(playerHands)) {
                console.log(`Attempt ${attempts}: Duplicate cards detected, reshuffling...`);
                shuffledDeck = this.shuffleDeck(shuffledDeck);
                continue;
            }
            
            // Validate hand distribution (no 3+ Aces or 7s)
            if (!this.validateHandDistribution(playerHands)) {
                console.log(`Attempt ${attempts}: Invalid hand distribution, reshuffling...`);
                shuffledDeck = this.shuffleDeck(shuffledDeck);
                continue;
            }
            
            // Valid deal found
            console.log(`Valid card distribution found after ${attempts} attempt(s)`);
            const remainingDeck = shuffledDeck.slice(cardIndex);
            
            return {
                playerHands,
                remainingDeck,
                attempts
            };
        }
        
        throw new Error(`Failed to find valid card distribution after ${maxAttempts} attempts`);
    }

    testCardDealing() {
        console.log('=== Testing Card Dealing Algorithm ===\n');
        
        // Mock players
        const players = [
            { user_id: 'player1' },
            { user_id: 'player2' },
            { user_id: 'player3' },
            { user_id: 'player4' }
        ];

        let totalAttempts = 0;
        let successfulDeals = 0;
        const testRuns = 10;

        for (let run = 1; run <= testRuns; run++) {
            console.log(`--- Test Run ${run} ---`);
            
            try {
                // Generate and shuffle deck
                const deck = this.generateDeck();
                const shuffledDeck = this.shuffleDeck(deck);

                // Deal 8 cards to each player
                const dealResult = this.dealCardsWithValidation(shuffledDeck, players, 8);
                const { playerHands, attempts } = dealResult;

                totalAttempts += attempts;
                successfulDeals++;

                // Display results
                console.log(`✓ Successful deal after ${attempts} attempts`);
                
                for (const [playerId, hand] of Object.entries(playerHands)) {
                    const aces = hand.filter(c => c.rank === 'A').length;
                    const sevens = hand.filter(c => c.rank === '7').length;
                    const handSummary = hand.map(c => `${c.rank}${c.suit.charAt(0)}`).join(', ');
                    console.log(`  ${playerId}: ${handSummary} (${aces}A, ${sevens}7)`);
                }
                
            } catch (error) {
                console.log(`✗ Failed: ${error.message}`);
            }
            
            console.log('');
        }

        console.log('=== Test Summary ===');
        console.log(`Successful deals: ${successfulDeals}/${testRuns}`);
        console.log(`Average attempts per deal: ${(totalAttempts / successfulDeals).toFixed(2)}`);
        console.log(`Success rate: ${((successfulDeals / testRuns) * 100).toFixed(1)}%`);
    }
}

// Run the test
const testEngine = new TestGameEngine();
testEngine.testCardDealing();