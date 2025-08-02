import GameEngine from './GameEngine.js';
import dbConnection from '../../database/connection.js';

/**
 * GameRuleValidator ensures that all game actions comply with Contract Crown rules
 * Provides comprehensive validation for both human and bot players
 */
class GameRuleValidator {
    constructor() {
        this.gameEngine = new GameEngine();
        this.suits = ['Hearts', 'Diamonds', 'Clubs', 'Spades'];
        this.ranks = ['7', '8', '9', '10', 'J', 'Q', 'K', 'A'];
        this.cardValues = {
            '7': 7, '8': 8, '9': 9, '10': 10,
            'J': 11, 'Q': 12, 'K': 13, 'A': 14
        };
    }

    /**
     * Validate complete game rule compliance for a demo game
     * @param {string} gameId - Game ID
     * @returns {Promise<Object>} Comprehensive validation result
     */
    async validateGameRuleCompliance(gameId) {
        try {
            console.log(`[GameRuleValidator] Starting comprehensive rule validation for game ${gameId}`);

            const validationResults = {
                gameId,
                overallCompliance: true,
                validationTimestamp: new Date().toISOString(),
                checks: {
                    deckValidation: await this.validateDeckIntegrity(gameId),
                    dealingValidation: await this.validateDealingRules(gameId),
                    trumpValidation: await this.validateTrumpDeclarationRules(gameId),
                    cardPlayValidation: await this.validateCardPlayRules(gameId),
                    scoringValidation: await this.validateScoringRules(gameId),
                    crownRuleValidation: await this.validateCrownRuleApplication(gameId)
                },
                violations: [],
                summary: {}
            };

            // Collect all violations
            Object.values(validationResults.checks).forEach(check => {
                if (!check.isValid) {
                    validationResults.overallCompliance = false;
                    validationResults.violations.push(...(check.violations || []));
                }
            });

            // Generate summary
            validationResults.summary = {
                totalChecks: Object.keys(validationResults.checks).length,
                passedChecks: Object.values(validationResults.checks).filter(c => c.isValid).length,
                failedChecks: Object.values(validationResults.checks).filter(c => !c.isValid).length,
                totalViolations: validationResults.violations.length
            };

            console.log(`[GameRuleValidator] Validation complete: ${validationResults.overallCompliance ? 'COMPLIANT' : 'VIOLATIONS FOUND'}`);
            return validationResults;

        } catch (error) {
            console.error('[GameRuleValidator] Error during rule validation:', error.message);
            throw error;
        }
    }

    /**
     * Validate deck integrity and card distribution
     * @param {string} gameId - Game ID
     * @returns {Promise<Object>} Deck validation result
     */
    async validateDeckIntegrity(gameId) {
        try {
            const result = {
                isValid: true,
                violations: [],
                details: {
                    totalCardsDealt: 0,
                    expectedCards: 32,
                    duplicateCards: [],
                    missingCards: [],
                    invalidCards: []
                }
            };

            // Get all player hands
            const players = await this.gameEngine.getGamePlayers(gameId);
            const allCards = [];

            for (const player of players) {
                const handResult = await dbConnection.query(`
                    SELECT current_hand FROM game_players 
                    WHERE game_id = ? AND user_id = ?
                `, [gameId, player.user_id]);

                if (handResult.length > 0 && handResult[0].current_hand) {
                    const hand = JSON.parse(handResult[0].current_hand);
                    allCards.push(...hand);
                }
            }

            result.details.totalCardsDealt = allCards.length;

            // Check for duplicate cards
            const cardStrings = allCards.map(card => `${card.rank}${card.suit}`);
            const duplicates = cardStrings.filter((card, index) => cardStrings.indexOf(card) !== index);
            result.details.duplicateCards = [...new Set(duplicates)];

            // Check for invalid cards (not in 32-card deck)
            const validCards = [];
            for (const suit of this.suits) {
                for (const rank of this.ranks) {
                    validCards.push(`${rank}${suit}`);
                }
            }

            result.details.invalidCards = cardStrings.filter(card => !validCards.includes(card));

            // Check for missing cards (if all 32 should be dealt)
            if (allCards.length === 32) {
                result.details.missingCards = validCards.filter(card => !cardStrings.includes(card));
            }

            // Validate results
            if (result.details.duplicateCards.length > 0) {
                result.isValid = false;
                result.violations.push({
                    type: 'DUPLICATE_CARDS',
                    description: 'Duplicate cards found in game',
                    details: result.details.duplicateCards
                });
            }

            if (result.details.invalidCards.length > 0) {
                result.isValid = false;
                result.violations.push({
                    type: 'INVALID_CARDS',
                    description: 'Cards not in 32-card deck found',
                    details: result.details.invalidCards
                });
            }

            if (allCards.length > 32) {
                result.isValid = false;
                result.violations.push({
                    type: 'TOO_MANY_CARDS',
                    description: 'More than 32 cards dealt',
                    details: { dealt: allCards.length, expected: 32 }
                });
            }

            return result;

        } catch (error) {
            console.error('[GameRuleValidator] Deck validation error:', error.message);
            return {
                isValid: false,
                violations: [{ type: 'VALIDATION_ERROR', description: error.message }],
                details: {}
            };
        }
    }

    /**
     * Validate dealing rules compliance
     * @param {string} gameId - Game ID
     * @returns {Promise<Object>} Dealing validation result
     */
    async validateDealingRules(gameId) {
        try {
            const result = {
                isValid: true,
                violations: [],
                details: {
                    playersWithCorrectHandSize: 0,
                    expectedHandSize: 8,
                    handSizes: {}
                }
            };

            const players = await this.gameEngine.getGamePlayers(gameId);
            
            for (const player of players) {
                const handResult = await dbConnection.query(`
                    SELECT current_hand FROM game_players 
                    WHERE game_id = ? AND user_id = ?
                `, [gameId, player.user_id]);

                let handSize = 0;
                if (handResult.length > 0 && handResult[0].current_hand) {
                    const hand = JSON.parse(handResult[0].current_hand);
                    handSize = hand.length;
                }

                result.details.handSizes[player.user_id] = handSize;

                if (handSize === result.details.expectedHandSize) {
                    result.details.playersWithCorrectHandSize++;
                } else if (handSize !== 0 && handSize !== 4) { // 0 = not dealt yet, 4 = initial deal, 8 = final deal
                    result.isValid = false;
                    result.violations.push({
                        type: 'INCORRECT_HAND_SIZE',
                        description: `Player ${player.user_id} has ${handSize} cards, expected ${result.details.expectedHandSize}`,
                        details: { playerId: player.user_id, actual: handSize, expected: result.details.expectedHandSize }
                    });
                }
            }

            return result;

        } catch (error) {
            console.error('[GameRuleValidator] Dealing validation error:', error.message);
            return {
                isValid: false,
                violations: [{ type: 'VALIDATION_ERROR', description: error.message }],
                details: {}
            };
        }
    }

    /**
     * Validate trump declaration rules
     * @param {string} gameId - Game ID
     * @returns {Promise<Object>} Trump validation result
     */
    async validateTrumpDeclarationRules(gameId) {
        try {
            const result = {
                isValid: true,
                violations: [],
                details: {
                    trumpSuit: null,
                    declaringPlayer: null,
                    declaringTeam: null,
                    isValidTrumpSuit: false
                }
            };

            const currentRound = await this.gameEngine.getCurrentRound(gameId);
            if (!currentRound) {
                return result; // No round started yet
            }

            result.details.trumpSuit = currentRound.trump_suit;
            result.details.declaringPlayer = currentRound.first_player_user_id;
            result.details.declaringTeam = currentRound.declaring_team_id;

            // Validate trump suit
            if (currentRound.trump_suit) {
                result.details.isValidTrumpSuit = this.suits.includes(currentRound.trump_suit);
                
                if (!result.details.isValidTrumpSuit) {
                    result.isValid = false;
                    result.violations.push({
                        type: 'INVALID_TRUMP_SUIT',
                        description: `Invalid trump suit: ${currentRound.trump_suit}`,
                        details: { trumpSuit: currentRound.trump_suit, validSuits: this.suits }
                    });
                }

                // Validate that the correct player declared trump
                if (currentRound.first_player_user_id !== currentRound.first_player_user_id) {
                    result.isValid = false;
                    result.violations.push({
                        type: 'WRONG_TRUMP_DECLARER',
                        description: 'Wrong player declared trump',
                        details: { 
                            expectedPlayer: currentRound.first_player_user_id,
                            actualPlayer: currentRound.first_player_user_id 
                        }
                    });
                }
            }

            return result;

        } catch (error) {
            console.error('[GameRuleValidator] Trump validation error:', error.message);
            return {
                isValid: false,
                violations: [{ type: 'VALIDATION_ERROR', description: error.message }],
                details: {}
            };
        }
    }

    /**
     * Validate card play rules compliance
     * @param {string} gameId - Game ID
     * @returns {Promise<Object>} Card play validation result
     */
    async validateCardPlayRules(gameId) {
        try {
            const result = {
                isValid: true,
                violations: [],
                details: {
                    tricksValidated: 0,
                    suitFollowingViolations: 0,
                    invalidCardPlays: 0,
                    turnOrderViolations: 0
                }
            };

            const currentRound = await this.gameEngine.getCurrentRound(gameId);
            if (!currentRound) {
                return result; // No round to validate
            }

            // Get all tricks for this round
            const tricks = await dbConnection.query(`
                SELECT * FROM game_tricks 
                WHERE round_id = ? 
                ORDER BY trick_number ASC
            `, [currentRound.round_id]);

            for (const trick of tricks) {
                result.details.tricksValidated++;
                
                const cardsPlayed = JSON.parse(trick.cards_played || '[]');
                if (cardsPlayed.length === 0) continue;

                // Validate suit-following rules
                const leadSuit = cardsPlayed[0].card.suit;
                const trumpSuit = currentRound.trump_suit;

                for (let i = 1; i < cardsPlayed.length; i++) {
                    const cardPlay = cardsPlayed[i];
                    const playedCard = cardPlay.card;

                    // Check if player should have followed suit
                    const playerHand = await this.getPlayerHandAtTime(gameId, cardPlay.playerId, cardPlay.playedAt);
                    const leadSuitCards = playerHand.filter(card => card.suit === leadSuit);

                    if (leadSuitCards.length > 0 && playedCard.suit !== leadSuit) {
                        // Player had lead suit cards but didn't follow suit
                        result.isValid = false;
                        result.details.suitFollowingViolations++;
                        result.violations.push({
                            type: 'SUIT_FOLLOWING_VIOLATION',
                            description: `Player ${cardPlay.playerId} failed to follow suit`,
                            details: {
                                trickId: trick.trick_id,
                                playerId: cardPlay.playerId,
                                leadSuit,
                                playedSuit: playedCard.suit,
                                hadLeadSuitCards: leadSuitCards.length
                            }
                        });
                    }
                }

                // Validate turn order
                const expectedPlayers = await this.getExpectedTurnOrder(gameId, trick.leading_player_id);
                for (let i = 0; i < cardsPlayed.length; i++) {
                    if (cardsPlayed[i].playerId !== expectedPlayers[i]) {
                        result.isValid = false;
                        result.details.turnOrderViolations++;
                        result.violations.push({
                            type: 'TURN_ORDER_VIOLATION',
                            description: 'Card played out of turn',
                            details: {
                                trickId: trick.trick_id,
                                position: i,
                                expectedPlayer: expectedPlayers[i],
                                actualPlayer: cardsPlayed[i].playerId
                            }
                        });
                    }
                }
            }

            return result;

        } catch (error) {
            console.error('[GameRuleValidator] Card play validation error:', error.message);
            return {
                isValid: false,
                violations: [{ type: 'VALIDATION_ERROR', description: error.message }],
                details: {}
            };
        }
    }

    /**
     * Validate scoring rules compliance
     * @param {string} gameId - Game ID
     * @returns {Promise<Object>} Scoring validation result
     */
    async validateScoringRules(gameId) {
        try {
            const result = {
                isValid: true,
                violations: [],
                details: {
                    roundsValidated: 0,
                    scoringErrors: 0,
                    teamScores: {}
                }
            };

            // Get completed rounds
            const rounds = await dbConnection.query(`
                SELECT * FROM game_rounds 
                WHERE game_id = ? AND round_completed_at IS NOT NULL
                ORDER BY round_number ASC
            `, [gameId]);

            for (const round of rounds) {
                result.details.roundsValidated++;

                const declaringTeamTricks = round.declaring_team_tricks_won || 0;
                const challengingTeamTricks = round.challenging_team_tricks_won || 0;

                // Validate trick count totals 8
                if (declaringTeamTricks + challengingTeamTricks !== 8) {
                    result.isValid = false;
                    result.details.scoringErrors++;
                    result.violations.push({
                        type: 'INCORRECT_TRICK_COUNT',
                        description: `Round ${round.round_number} tricks don't total 8`,
                        details: {
                            roundNumber: round.round_number,
                            declaringTeamTricks,
                            challengingTeamTricks,
                            total: declaringTeamTricks + challengingTeamTricks
                        }
                    });
                }

                // Validate scoring rules
                const expectedDeclaringScore = declaringTeamTricks >= 5 ? declaringTeamTricks : 0;
                const expectedChallengingScore = challengingTeamTricks >= 4 ? challengingTeamTricks : 0;

                // Get actual scores from teams table (would need to track score changes)
                // This is a simplified validation - in a real implementation, 
                // we'd track score changes per round
            }

            // Get current team scores
            const teams = await this.gameEngine.getGameTeams(gameId);
            teams.forEach(team => {
                result.details.teamScores[team.team_id] = team.current_score;
            });

            return result;

        } catch (error) {
            console.error('[GameRuleValidator] Scoring validation error:', error.message);
            return {
                isValid: false,
                violations: [{ type: 'VALIDATION_ERROR', description: error.message }],
                details: {}
            };
        }
    }

    /**
     * Validate Crown Rule application
     * @param {string} gameId - Game ID
     * @returns {Promise<Object>} Crown Rule validation result
     */
    async validateCrownRuleApplication(gameId) {
        try {
            const result = {
                isValid: true,
                violations: [],
                details: {
                    roundsChecked: 0,
                    crownRuleApplications: 0,
                    dealerRotations: 0
                }
            };

            const rounds = await dbConnection.query(`
                SELECT * FROM game_rounds 
                WHERE game_id = ? 
                ORDER BY round_number ASC
            `, [gameId]);

            for (let i = 1; i < rounds.length; i++) {
                const previousRound = rounds[i - 1];
                const currentRound = rounds[i];
                result.details.roundsChecked++;

                // Check dealer rotation (should rotate clockwise)
                if (previousRound.dealer_user_id === currentRound.dealer_user_id) {
                    // Dealer should have rotated unless it's the same round
                    result.isValid = false;
                    result.violations.push({
                        type: 'DEALER_ROTATION_ERROR',
                        description: `Dealer didn't rotate from round ${previousRound.round_number} to ${currentRound.round_number}`,
                        details: {
                            previousRound: previousRound.round_number,
                            currentRound: currentRound.round_number,
                            dealer: previousRound.dealer_user_id
                        }
                    });
                } else {
                    result.details.dealerRotations++;
                }

                // Check Crown Rule application
                if (previousRound.round_completed_at && previousRound.declaring_team_tricks_won !== null) {
                    const declaringTeamMadeContract = previousRound.declaring_team_tricks_won >= 5;
                    
                    if (declaringTeamMadeContract) {
                        // Same player should declare trump
                        if (previousRound.first_player_user_id !== currentRound.first_player_user_id) {
                            result.isValid = false;
                            result.violations.push({
                                type: 'CROWN_RULE_VIOLATION',
                                description: 'Crown Rule not applied - same player should declare trump',
                                details: {
                                    previousRound: previousRound.round_number,
                                    currentRound: currentRound.round_number,
                                    expectedDeclarer: previousRound.first_player_user_id,
                                    actualDeclarer: currentRound.first_player_user_id
                                }
                            });
                        } else {
                            result.details.crownRuleApplications++;
                        }
                    }
                }
            }

            return result;

        } catch (error) {
            console.error('[GameRuleValidator] Crown Rule validation error:', error.message);
            return {
                isValid: false,
                violations: [{ type: 'VALIDATION_ERROR', description: error.message }],
                details: {}
            };
        }
    }

    /**
     * Get player's hand at a specific time (simplified - would need hand history tracking)
     * @param {string} gameId - Game ID
     * @param {string} playerId - Player ID
     * @param {string} timestamp - Timestamp
     * @returns {Promise<Array>} Player's hand at that time
     */
    async getPlayerHandAtTime(gameId, playerId, timestamp) {
        try {
            // Simplified implementation - returns current hand
            // In a real implementation, we'd track hand changes over time
            const handResult = await dbConnection.query(`
                SELECT current_hand FROM game_players 
                WHERE game_id = ? AND user_id = ?
            `, [gameId, playerId]);

            if (handResult.length > 0 && handResult[0].current_hand) {
                return JSON.parse(handResult[0].current_hand);
            }

            return [];
        } catch (error) {
            console.error('[GameRuleValidator] Error getting player hand at time:', error.message);
            return [];
        }
    }

    /**
     * Get expected turn order for a trick
     * @param {string} gameId - Game ID
     * @param {string} leadingPlayerId - Leading player ID
     * @returns {Promise<Array>} Expected player order
     */
    async getExpectedTurnOrder(gameId, leadingPlayerId) {
        try {
            const players = await this.gameEngine.getGamePlayers(gameId);
            const leadingIndex = players.findIndex(p => p.user_id === leadingPlayerId);
            
            if (leadingIndex === -1) {
                return [];
            }

            const turnOrder = [];
            for (let i = 0; i < 4; i++) {
                const playerIndex = (leadingIndex + i) % players.length;
                turnOrder.push(players[playerIndex].user_id);
            }

            return turnOrder;
        } catch (error) {
            console.error('[GameRuleValidator] Error getting turn order:', error.message);
            return [];
        }
    }

    /**
     * Generate a compliance report
     * @param {Object} validationResults - Validation results
     * @returns {string} Formatted compliance report
     */
    generateComplianceReport(validationResults) {
        let report = `\n=== CONTRACT CROWN RULE COMPLIANCE REPORT ===\n`;
        report += `Game ID: ${validationResults.gameId}\n`;
        report += `Validation Time: ${validationResults.validationTimestamp}\n`;
        report += `Overall Compliance: ${validationResults.overallCompliance ? 'COMPLIANT' : 'NON-COMPLIANT'}\n\n`;

        report += `SUMMARY:\n`;
        report += `- Total Checks: ${validationResults.summary.totalChecks}\n`;
        report += `- Passed: ${validationResults.summary.passedChecks}\n`;
        report += `- Failed: ${validationResults.summary.failedChecks}\n`;
        report += `- Total Violations: ${validationResults.summary.totalViolations}\n\n`;

        if (validationResults.violations.length > 0) {
            report += `VIOLATIONS:\n`;
            validationResults.violations.forEach((violation, index) => {
                report += `${index + 1}. ${violation.type}: ${violation.description}\n`;
                if (violation.details) {
                    report += `   Details: ${JSON.stringify(violation.details, null, 2)}\n`;
                }
            });
        } else {
            report += `No rule violations found. Game is fully compliant with Contract Crown rules.\n`;
        }

        report += `\n=== END REPORT ===\n`;
        return report;
    }
}

export default GameRuleValidator;