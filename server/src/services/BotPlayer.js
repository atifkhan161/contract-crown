import { v4 as uuidv4 } from 'uuid';
import BotAI from './BotAI.js';

/**
 * BotPlayer class represents an AI player in the game
 * Handles bot player creation, management, and basic properties
 */
class BotPlayer {
    constructor(options = {}) {
        this.id = options.id || uuidv4();
        this.name = options.name || this.generateBotName();
        this.personality = options.personality || this.generatePersonality();
        this.isBot = true;
        this.difficulty = options.difficulty || 'medium';
        this.hand = [];
        this.teamId = options.teamId || null;
        this.seatPosition = options.seatPosition || null;
        this.gameId = options.gameId || null;
        
        // Bot-specific properties
        this.decisionDelay = this.calculateDecisionDelay();
        this.aggressiveness = this.calculateAggressiveness();
        this.riskTolerance = this.calculateRiskTolerance();
        
        // Initialize AI engine
        this.ai = new BotAI(this);
        
        console.log(`[BotPlayer] Created bot ${this.name} (${this.id}) with personality: ${this.personality}`);
    }

    /**
     * Generate a random bot name from predefined list
     * @returns {string} Bot name
     */
    generateBotName() {
        const botNames = [
            'Alice Bot', 'Bob Bot', 'Charlie Bot', 'Diana Bot',
            'Eddie Bot', 'Fiona Bot', 'George Bot', 'Helen Bot',
            'Ivan Bot', 'Julia Bot', 'Kevin Bot', 'Luna Bot',
            'Max Bot', 'Nina Bot', 'Oscar Bot', 'Penny Bot',
            'Quinn Bot', 'Ruby Bot', 'Sam Bot', 'Tina Bot'
        ];
        
        return botNames[Math.floor(Math.random() * botNames.length)];
    }

    /**
     * Generate a random personality type
     * @returns {string} Personality type
     */
    generatePersonality() {
        const personalities = ['aggressive', 'conservative', 'balanced'];
        return personalities[Math.floor(Math.random() * personalities.length)];
    }

    /**
     * Calculate decision delay based on personality and difficulty
     * @returns {number} Delay in milliseconds
     */
    calculateDecisionDelay() {
        const baseDelay = {
            easy: 1500,
            medium: 2000,
            hard: 2500
        };

        const personalityModifier = {
            aggressive: 0.8,
            balanced: 1.0,
            conservative: 1.2
        };

        const base = baseDelay[this.difficulty] || baseDelay.medium;
        const modifier = personalityModifier[this.personality] || 1.0;
        
        // Add some randomness (±30%)
        const randomFactor = 0.7 + (Math.random() * 0.6);
        
        return Math.floor(base * modifier * randomFactor);
    }

    /**
     * Calculate aggressiveness level (0-1)
     * @returns {number} Aggressiveness level
     */
    calculateAggressiveness() {
        const baseAggressiveness = {
            aggressive: 0.8,
            balanced: 0.5,
            conservative: 0.2
        };

        const difficultyModifier = {
            easy: 0.8,
            medium: 1.0,
            hard: 1.2
        };

        const base = baseAggressiveness[this.personality] || 0.5;
        const modifier = difficultyModifier[this.difficulty] || 1.0;
        
        return Math.min(1.0, base * modifier);
    }

    /**
     * Calculate risk tolerance level (0-1)
     * @returns {number} Risk tolerance level
     */
    calculateRiskTolerance() {
        const baseRiskTolerance = {
            aggressive: 0.7,
            balanced: 0.4,
            conservative: 0.1
        };

        return baseRiskTolerance[this.personality] || 0.4;
    }

    /**
     * Update bot's hand
     * @param {Array} cards - Array of card objects
     */
    updateHand(cards) {
        this.hand = [...cards];
        console.log(`[BotPlayer] ${this.name} hand updated with ${cards.length} cards`);
    }

    /**
     * Set bot's team assignment
     * @param {string} teamId - Team ID
     * @param {number} seatPosition - Seat position (1-4)
     */
    setTeamAssignment(teamId, seatPosition) {
        this.teamId = teamId;
        this.seatPosition = seatPosition;
        console.log(`[BotPlayer] ${this.name} assigned to team ${teamId}, seat ${seatPosition}`);
    }

    /**
     * Get bot's current state for game synchronization
     * @returns {Object} Bot state object
     */
    getState() {
        return {
            id: this.id,
            name: this.name,
            personality: this.personality,
            isBot: this.isBot,
            difficulty: this.difficulty,
            teamId: this.teamId,
            seatPosition: this.seatPosition,
            gameId: this.gameId,
            handSize: this.hand.length,
            aggressiveness: this.aggressiveness,
            riskTolerance: this.riskTolerance
        };
    }

    /**
     * Convert bot to database-compatible format
     * @returns {Object} Database representation
     */
    toDatabaseFormat() {
        return {
            user_id: this.id,
            username: this.name,
            is_bot: true,
            bot_personality: this.personality,
            bot_difficulty: this.difficulty,
            bot_aggressiveness: this.aggressiveness,
            bot_risk_tolerance: this.riskTolerance
        };
    }

    /**
     * Make a trump declaration decision
     * @param {Array} hand - Initial 4-card hand
     * @returns {Promise<string>} Chosen trump suit
     */
    async declareTrump(hand = null) {
        const cardsToAnalyze = hand || this.hand;
        if (cardsToAnalyze.length === 0) {
            console.warn(`[BotPlayer] ${this.name} has no cards for trump declaration`);
            return 'Hearts'; // Default fallback
        }
        
        return await this.ai.declareTrump(cardsToAnalyze);
    }

    /**
     * Get trump declaration explanation for debugging
     * @param {Array} hand - Hand used for decision
     * @param {string} chosenTrump - Chosen trump suit
     * @returns {string} Decision explanation
     */
    getTrumpDeclarationExplanation(hand, chosenTrump) {
        return this.ai.getTrumpDeclarationExplanation(hand, chosenTrump);
    }

    /**
     * Make a card play decision
     * @param {Object} gameContext - Current game context
     * @returns {Promise<Object>} Chosen card to play
     */
    async playCard(gameContext) {
        // Use bot's current hand if not provided in context
        const contextWithHand = {
            ...gameContext,
            hand: gameContext.hand || this.hand
        };
        
        if (contextWithHand.hand.length === 0) {
            console.warn(`[BotPlayer] ${this.name} has no cards to play`);
            throw new Error('No cards available to play');
        }
        
        return await this.ai.playCard(contextWithHand);
    }

    /**
     * Get card play explanation for debugging
     * @param {Object} chosenCard - Card that was chosen
     * @param {Object} gameContext - Game context used for decision
     * @returns {string} Decision explanation
     */
    getCardPlayExplanation(chosenCard, gameContext) {
        return this.ai.getCardPlayExplanation(chosenCard, gameContext);
    }

    /**
     * Convert bot to API response format
     * @returns {Object} API response format
     */
    toApiResponse() {
        return {
            id: this.id,
            username: this.name,
            isBot: true,
            personality: this.personality,
            difficulty: this.difficulty,
            teamId: this.teamId,
            seatPosition: this.seatPosition,
            handSize: this.hand.length
        };
    }
}

export default BotPlayer;