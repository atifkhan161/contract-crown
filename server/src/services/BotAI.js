/**
 * BotAI class handles AI decision-making for bot players
 * Implements trump declaration and card play logic
 */
class BotAI {
    constructor(botPlayer) {
        this.bot = botPlayer;
        this.suits = ['Hearts', 'Diamonds', 'Clubs', 'Spades'];
        this.cardValues = {
            '7': 7, '8': 8, '9': 9, '10': 10,
            'J': 11, 'Q': 12, 'K': 13, 'A': 14
        };
    }

    /**
     * Analyze initial 4-card hand and decide trump suit
     * @param {Array} hand - Array of 4 cards
     * @returns {Promise<string>} Chosen trump suit
     */
    async declareTrump(hand) {
        try {
            console.log(`[BotAI] ${this.bot.name} analyzing hand for trump declaration:`, hand.map(c => `${c.rank}${c.suit[0]}`).join(', '));

            // Analyze suit strength for each suit
            const suitAnalysis = this.analyzeSuitStrength(hand);
            
            // Apply personality-based decision making
            const trumpSuit = this.selectTrumpWithPersonality(suitAnalysis);
            
            // Add realistic delay based on bot personality
            await this.simulateDecisionDelay();
            
            console.log(`[BotAI] ${this.bot.name} declares ${trumpSuit} as trump (personality: ${this.bot.personality})`);
            return trumpSuit;
        } catch (error) {
            console.error(`[BotAI] Error in trump declaration for ${this.bot.name}:`, error);
            // Fallback to random suit
            return this.suits[Math.floor(Math.random() * this.suits.length)];
        }
    }

    /**
     * Analyze the strength of each suit in the hand
     * @param {Array} hand - Array of cards
     * @returns {Object} Suit analysis with scores
     */
    analyzeSuitStrength(hand) {
        const analysis = {};
        
        // Initialize analysis for all suits
        this.suits.forEach(suit => {
            analysis[suit] = {
                cardCount: 0,
                cards: [],
                totalValue: 0,
                averageValue: 0,
                hasHighCards: false,
                hasAce: false,
                hasKing: false,
                strength: 0
            };
        });

        // Analyze cards in hand
        hand.forEach(card => {
            const suit = card.suit;
            const suitData = analysis[suit];
            
            suitData.cardCount++;
            suitData.cards.push(card);
            suitData.totalValue += card.value || this.cardValues[card.rank];
            
            // Check for high cards
            if (card.rank === 'A') {
                suitData.hasAce = true;
                suitData.hasHighCards = true;
            } else if (card.rank === 'K') {
                suitData.hasKing = true;
                suitData.hasHighCards = true;
            } else if (['Q', 'J'].includes(card.rank)) {
                suitData.hasHighCards = true;
            }
        });

        // Calculate strength scores
        this.suits.forEach(suit => {
            const suitData = analysis[suit];
            if (suitData.cardCount > 0) {
                suitData.averageValue = suitData.totalValue / suitData.cardCount;
                
                // Base strength on card count and quality
                let strength = suitData.cardCount * 10; // Base points for having cards
                strength += suitData.totalValue; // Add card values
                
                // Bonus for high cards
                if (suitData.hasAce) strength += 15;
                if (suitData.hasKing) strength += 10;
                if (suitData.hasHighCards) strength += 5;
                
                // Bonus for multiple cards (better trump potential)
                if (suitData.cardCount >= 2) strength += suitData.cardCount * 5;
                
                suitData.strength = strength;
            }
        });

        return analysis;
    }

    /**
     * Select trump suit based on analysis and bot personality
     * @param {Object} suitAnalysis - Suit strength analysis
     * @returns {string} Selected trump suit
     */
    selectTrumpWithPersonality(suitAnalysis) {
        // Get suits with cards, sorted by strength
        const availableSuits = this.suits
            .filter(suit => suitAnalysis[suit].cardCount > 0)
            .sort((a, b) => suitAnalysis[b].strength - suitAnalysis[a].strength);

        if (availableSuits.length === 0) {
            // Shouldn't happen, but fallback to random
            return this.suits[Math.floor(Math.random() * this.suits.length)];
        }

        const topSuit = availableSuits[0];

        // Apply personality-based decision making
        switch (this.bot.personality) {
            case 'aggressive':
                return this.selectAggressiveTrump(availableSuits, suitAnalysis);
            
            case 'conservative':
                return this.selectConservativeTrump(availableSuits, suitAnalysis);
            
            case 'balanced':
            default:
                return this.selectBalancedTrump(availableSuits, suitAnalysis);
        }
    }

    /**
     * Aggressive trump selection - prefers high-value cards and risky plays
     * @param {Array} availableSuits - Suits with cards
     * @param {Object} suitAnalysis - Suit analysis
     * @returns {string} Selected trump suit
     */
    selectAggressiveTrump(availableSuits, suitAnalysis) {
        // Aggressive bots prefer suits with high cards, even if fewer
        const highCardSuits = availableSuits.filter(suit => 
            suitAnalysis[suit].hasAce || suitAnalysis[suit].hasKing
        );

        if (highCardSuits.length > 0) {
            // Pick the suit with highest average card value among high-card suits
            return highCardSuits.reduce((best, current) => 
                suitAnalysis[current].averageValue > suitAnalysis[best].averageValue ? current : best
            );
        }

        // If no high cards, pick the strongest suit
        return availableSuits[0];
    }

    /**
     * Conservative trump selection - prefers safe plays with multiple cards
     * @param {Array} availableSuits - Suits with cards
     * @param {Object} suitAnalysis - Suit analysis
     * @returns {string} Selected trump suit
     */
    selectConservativeTrump(availableSuits, suitAnalysis) {
        // Conservative bots prefer suits with multiple cards for safety
        const multiCardSuits = availableSuits.filter(suit => 
            suitAnalysis[suit].cardCount >= 2
        );

        if (multiCardSuits.length > 0) {
            // Among multi-card suits, pick the one with best overall strength
            return multiCardSuits.reduce((best, current) => 
                suitAnalysis[current].strength > suitAnalysis[best].strength ? current : best
            );
        }

        // If only single cards, pick the strongest
        return availableSuits[0];
    }

    /**
     * Balanced trump selection - considers both card count and quality
     * @param {Array} availableSuits - Suits with cards
     * @param {Object} suitAnalysis - Suit analysis
     * @returns {string} Selected trump suit
     */
    selectBalancedTrump(availableSuits, suitAnalysis) {
        // Balanced approach considers overall strength with some randomness
        const topSuits = availableSuits.slice(0, Math.min(2, availableSuits.length));
        
        // Add some randomness to avoid being too predictable
        if (topSuits.length > 1) {
            const strengthDiff = suitAnalysis[topSuits[0]].strength - suitAnalysis[topSuits[1]].strength;
            
            // If the difference is small (less than 20%), sometimes pick the second best
            if (strengthDiff < suitAnalysis[topSuits[0]].strength * 0.2 && Math.random() < 0.3) {
                return topSuits[1];
            }
        }

        return topSuits[0];
    }

    /**
     * Simulate realistic decision delay based on bot personality and difficulty
     * @returns {Promise<void>}
     */
    async simulateDecisionDelay() {
        const delay = this.bot.decisionDelay;
        return new Promise(resolve => setTimeout(resolve, delay));
    }

    /**
     * Get trump declaration explanation for debugging/logging
     * @param {Array} hand - Bot's hand
     * @param {string} chosenTrump - Chosen trump suit
     * @returns {string} Explanation of the decision
     */
    getTrumpDeclarationExplanation(hand, chosenTrump) {
        const analysis = this.analyzeSuitStrength(hand);
        const chosenAnalysis = analysis[chosenTrump];
        
        let explanation = `${this.bot.name} (${this.bot.personality}) chose ${chosenTrump} because: `;
        
        if (chosenAnalysis.hasAce) {
            explanation += "has Ace, ";
        }
        if (chosenAnalysis.hasKing) {
            explanation += "has King, ";
        }
        if (chosenAnalysis.cardCount > 1) {
            explanation += `${chosenAnalysis.cardCount} cards in suit, `;
        }
        
        explanation += `strength score: ${chosenAnalysis.strength}`;
        
        return explanation;
    }

    /**
     * Get trump declaration statistics for analysis
     * @param {Array} hand - Bot's hand
     * @returns {Object} Statistics about the decision
     */
    getTrumpDeclarationStats(hand) {
        const analysis = this.analyzeSuitStrength(hand);
        
        return {
            botName: this.bot.name,
            personality: this.bot.personality,
            handSize: hand.length,
            suitDistribution: this.suits.reduce((dist, suit) => {
                dist[suit] = analysis[suit].cardCount;
                return dist;
            }, {}),
            strongestSuit: this.suits.reduce((strongest, current) => 
                analysis[current].strength > analysis[strongest].strength ? current : strongest
            ),
            hasHighCards: Object.values(analysis).some(suit => suit.hasHighCards),
            totalHandStrength: Object.values(analysis).reduce((total, suit) => total + suit.strength, 0)
        };
    }

    /**
     * Decide which card to play based on game state and trick context
     * @param {Object} gameContext - Current game context
     * @returns {Promise<Object>} Chosen card to play
     */
    async playCard(gameContext) {
        try {
            const { hand, trickState, gameState } = gameContext;
            
            console.log(`[BotAI] ${this.bot.name} deciding card to play from hand:`, 
                hand.map(c => `${c.rank}${c.suit[0]}`).join(', '));

            // Get valid cards that can be played
            const validCards = this.getValidCards(hand, trickState);
            
            if (validCards.length === 0) {
                throw new Error('No valid cards to play');
            }

            if (validCards.length === 1) {
                console.log(`[BotAI] ${this.bot.name} has only one valid card:`, 
                    `${validCards[0].rank}${validCards[0].suit[0]}`);
                await this.simulateDecisionDelay();
                return validCards[0];
            }

            // For now, just pick the first valid card (we'll enhance this later)
            const chosenCard = validCards[0];
            
            // Add realistic delay
            await this.simulateDecisionDelay();
            
            console.log(`[BotAI] ${this.bot.name} plays ${chosenCard.rank}${chosenCard.suit[0]}`);
            return chosenCard;
        } catch (error) {
            console.error(`[BotAI] Error in card play for ${this.bot.name}:`, error);
            // Fallback to first valid card
            const validCards = this.getValidCards(gameContext.hand, gameContext.trickState);
            return validCards.length > 0 ? validCards[0] : gameContext.hand[0];
        }
    }

    /**
     * Get valid cards that can be played according to Contract Crown rules
     * @param {Array} hand - Bot's current hand
     * @param {Object} trickState - Current trick state
     * @returns {Array} Valid cards that can be played
     */
    getValidCards(hand, trickState) {
        const { cardsPlayed } = trickState;
        
        // If no cards played yet, any card is valid (leading)
        if (cardsPlayed.length === 0) {
            return [...hand];
        }

        const leadSuit = cardsPlayed[0].card.suit;
        
        // Cards of the lead suit (must follow suit if possible)
        const leadSuitCards = hand.filter(card => card.suit === leadSuit);
        
        // If we have cards of the lead suit, we must play them
        if (leadSuitCards.length > 0) {
            return leadSuitCards;
        }

        // If we can't follow suit, we can play any card (trump or discard)
        return [...hand];
    }

    /**
     * Get explanation for card play decision
     * @param {Object} chosenCard - Card that was chosen
     * @param {Object} gameContext - Game context used for decision
     * @returns {string} Explanation of the decision
     */
    getCardPlayExplanation(chosenCard, gameContext) {
        try {
            let explanation = `${this.bot.name} (${this.bot.personality}) played ${chosenCard.rank}${chosenCard.suit[0]} `;
            
            const { trickState } = gameContext;
            if (trickState && trickState.cardsPlayed) {
                if (trickState.cardsPlayed.length === 0) {
                    explanation += "leading the trick.";
                } else {
                    explanation += `following suit (${trickState.cardsPlayed.length + 1}/4 cards played).`;
                }
            } else {
                explanation += "in the current trick.";
            }
            
            return explanation;
        } catch (error) {
            return `${this.bot.name} played ${chosenCard.rank}${chosenCard.suit[0]}`;
        }
    }
}

export default BotAI;