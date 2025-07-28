import { v4 as uuidv4 } from 'uuid';
import dbConnection from '../../database/connection.js';

/**
 * GameEngine class handles core game logic for Contract Crown
 * Implements 32-card deck, trump declaration, trick-taking, and scoring
 */
class GameEngine {
    constructor() {
        // Define the 32-card deck (7 through Ace)
        this.suits = ['Hearts', 'Diamonds', 'Clubs', 'Spades'];
        this.ranks = ['7', '8', '9', '10', 'J', 'Q', 'K', 'A'];
        
        // Card values for comparison (higher value wins)
        this.cardValues = {
            '7': 7, '8': 8, '9': 9, '10': 10,
            'J': 11, 'Q': 12, 'K': 13, 'A': 14
        };
    }

    /**
     * Generate a complete 32-card deck
     * @returns {Array} Array of card objects with suit and rank
     */
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

    /**
     * Shuffle deck using Fisher-Yates algorithm
     * @param {Array} deck - Array of cards to shuffle
     * @returns {Array} Shuffled deck
     */
    shuffleDeck(deck) {
        const shuffled = [...deck];
        for (let i = shuffled.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
        }
        return shuffled;
    }

    /**
     * Deal initial 4 cards to each player
     * @param {string} gameId - Game ID
     * @returns {Object} Object containing player hands and remaining deck
     */
    async dealInitialCards(gameId) {
        try {
            // Get game players in seat order
            const players = await this.getGamePlayers(gameId);
            if (players.length !== 4) {
                throw new Error('Game must have exactly 4 players');
            }

            // Generate and shuffle deck
            const deck = this.generateDeck();
            const shuffledDeck = this.shuffleDeck(deck);

            // Deal 4 cards to each player
            const playerHands = {};
            let cardIndex = 0;

            for (const player of players) {
                playerHands[player.user_id] = shuffledDeck.slice(cardIndex, cardIndex + 4);
                cardIndex += 4;
            }

            // Store remaining 16 cards for later dealing
            const remainingDeck = shuffledDeck.slice(16);

            // Update player hands in database
            for (const player of players) {
                await dbConnection.query(`
                    UPDATE game_players 
                    SET current_hand = ? 
                    WHERE game_id = ? AND user_id = ?
                `, [JSON.stringify(playerHands[player.user_id]), gameId, player.user_id]);
            }

            console.log(`[GameEngine] Dealt initial 4 cards to each player in game ${gameId}`);

            return {
                playerHands,
                remainingDeck,
                dealerUserId: players[0].user_id, // First player is dealer for first round
                firstPlayerUserId: players[1].user_id // Player to left of dealer goes first
            };
        } catch (error) {
            console.error('[GameEngine] Deal initial cards error:', error.message);
            throw error;
        }
    }

    /**
     * Deal final 4 cards to each player after trump declaration
     * @param {string} gameId - Game ID
     * @param {Array} remainingDeck - Remaining 16 cards to deal
     * @returns {Object} Updated player hands
     */
    async dealFinalCards(gameId, remainingDeck) {
        try {
            // Get current player hands
            const players = await this.getGamePlayers(gameId);
            const updatedHands = {};

            let cardIndex = 0;
            for (const player of players) {
                // Get current hand from database
                const currentHandResult = await dbConnection.query(`
                    SELECT current_hand FROM game_players 
                    WHERE game_id = ? AND user_id = ?
                `, [gameId, player.user_id]);

                const currentHand = JSON.parse(currentHandResult[0].current_hand || '[]');
                
                // Add 4 more cards to make 8 total
                const additionalCards = remainingDeck.slice(cardIndex, cardIndex + 4);
                const fullHand = [...currentHand, ...additionalCards];
                
                updatedHands[player.user_id] = fullHand;
                cardIndex += 4;

                // Update database with full hand
                await dbConnection.query(`
                    UPDATE game_players 
                    SET current_hand = ? 
                    WHERE game_id = ? AND user_id = ?
                `, [JSON.stringify(fullHand), gameId, player.user_id]);
            }

            console.log(`[GameEngine] Dealt final 4 cards to each player in game ${gameId}`);
            return updatedHands;
        } catch (error) {
            console.error('[GameEngine] Deal final cards error:', error.message);
            throw error;
        }
    }

    /**
     * Get next dealer for a new round (rotates clockwise)
     * @param {string} gameId - Game ID
     * @param {string} currentDealerId - Current dealer's user ID
     * @returns {Object} Next dealer and first player info
     */
    async getNextDealer(gameId, currentDealerId) {
        try {
            const players = await this.getGamePlayers(gameId);
            const currentDealerIndex = players.findIndex(p => p.user_id === currentDealerId);
            
            if (currentDealerIndex === -1) {
                throw new Error('Current dealer not found in game');
            }

            // Next dealer is clockwise (next index, wrapping around)
            const nextDealerIndex = (currentDealerIndex + 1) % players.length;
            const firstPlayerIndex = (nextDealerIndex + 1) % players.length;

            return {
                dealerUserId: players[nextDealerIndex].user_id,
                firstPlayerUserId: players[firstPlayerIndex].user_id
            };
        } catch (error) {
            console.error('[GameEngine] Get next dealer error:', error.message);
            throw error;
        }
    }

    /**
     * Get game players in seat order
     * @param {string} gameId - Game ID
     * @returns {Array} Array of player objects ordered by seat position
     */
    async getGamePlayers(gameId) {
        try {
            const players = await dbConnection.query(`
                SELECT gp.user_id, gp.seat_position, gp.team_id, u.username
                FROM game_players gp
                JOIN users u ON gp.user_id = u.user_id
                WHERE gp.game_id = ?
                ORDER BY gp.seat_position ASC
            `, [gameId]);

            return players;
        } catch (error) {
            console.error('[GameEngine] Get game players error:', error.message);
            throw error;
        }
    }

    /**
     * Create a new game round
     * @param {string} gameId - Game ID
     * @param {number} roundNumber - Round number
     * @param {string} dealerUserId - Dealer's user ID
     * @param {string} firstPlayerUserId - First player's user ID
     * @returns {string} Round ID
     */
    async createGameRound(gameId, roundNumber, dealerUserId, firstPlayerUserId) {
        try {
            const roundId = uuidv4();
            
            await dbConnection.query(`
                INSERT INTO game_rounds (
                    round_id, game_id, round_number, dealer_user_id, 
                    first_player_user_id, created_at
                ) VALUES (?, ?, ?, ?, ?, NOW())
            `, [roundId, gameId, roundNumber, dealerUserId, firstPlayerUserId]);

            console.log(`[GameEngine] Created round ${roundNumber} for game ${gameId}`);
            return roundId;
        } catch (error) {
            console.error('[GameEngine] Create game round error:', error.message);
            throw error;
        }
    }

    /**
     * Declare trump suit for the current round
     * @param {string} gameId - Game ID
     * @param {string} roundId - Round ID
     * @param {string} playerId - Player declaring trump
     * @param {string} trumpSuit - Trump suit ('Hearts', 'Diamonds', 'Clubs', 'Spades')
     * @returns {Object} Trump declaration result with team assignments
     */
    async declareTrump(gameId, roundId, playerId, trumpSuit) {
        try {
            // Validate trump suit
            if (!this.suits.includes(trumpSuit)) {
                throw new Error('Invalid trump suit. Must be Hearts, Diamonds, Clubs, or Spades');
            }

            // Get round info to verify it's the correct player's turn
            const roundResult = await dbConnection.query(`
                SELECT first_player_user_id, trump_suit, declaring_team_id
                FROM game_rounds 
                WHERE round_id = ? AND game_id = ?
            `, [roundId, gameId]);

            if (roundResult.length === 0) {
                throw new Error('Round not found');
            }

            const round = roundResult[0];

            // Check if trump has already been declared
            if (round.trump_suit) {
                throw new Error('Trump has already been declared for this round');
            }

            // Verify it's the correct player's turn to declare trump
            if (round.first_player_user_id !== playerId) {
                throw new Error('Only the first player can declare trump');
            }

            // Get player's team
            const playerTeamResult = await dbConnection.query(`
                SELECT team_id FROM game_players 
                WHERE game_id = ? AND user_id = ?
            `, [gameId, playerId]);

            if (playerTeamResult.length === 0) {
                throw new Error('Player not found in game');
            }

            const declaringTeamId = playerTeamResult[0].team_id;

            // Update round with trump declaration
            await dbConnection.query(`
                UPDATE game_rounds 
                SET trump_suit = ?, declaring_team_id = ?
                WHERE round_id = ?
            `, [trumpSuit, declaringTeamId, roundId]);

            // Get team information
            const teams = await this.getGameTeams(gameId);
            const declaringTeam = teams.find(t => t.team_id === declaringTeamId);
            const challengingTeam = teams.find(t => t.team_id !== declaringTeamId);

            console.log(`[GameEngine] Trump declared: ${trumpSuit} by player ${playerId} in game ${gameId}`);

            return {
                trumpSuit,
                declaringTeamId,
                challengingTeamId: challengingTeam.team_id,
                declaringTeam: {
                    teamId: declaringTeam.team_id,
                    teamNumber: declaringTeam.team_number,
                    players: [declaringTeam.player1_id, declaringTeam.player2_id].filter(Boolean)
                },
                challengingTeam: {
                    teamId: challengingTeam.team_id,
                    teamNumber: challengingTeam.team_number,
                    players: [challengingTeam.player1_id, challengingTeam.player2_id].filter(Boolean)
                },
                phase: 'final_dealing' // Next phase is dealing final cards
            };
        } catch (error) {
            console.error('[GameEngine] Declare trump error:', error.message);
            throw error;
        }
    }

    /**
     * Validate trump declaration timeout
     * @param {string} roundId - Round ID
     * @param {number} timeoutSeconds - Timeout in seconds (default 30)
     * @returns {boolean} True if declaration is within timeout
     */
    async validateTrumpTimeout(roundId, timeoutSeconds = 30) {
        try {
            const roundResult = await dbConnection.query(`
                SELECT created_at FROM game_rounds WHERE round_id = ?
            `, [roundId]);

            if (roundResult.length === 0) {
                return false;
            }

            const roundCreated = new Date(roundResult[0].created_at);
            const now = new Date();
            const elapsedSeconds = (now - roundCreated) / 1000;

            return elapsedSeconds <= timeoutSeconds;
        } catch (error) {
            console.error('[GameEngine] Validate trump timeout error:', error.message);
            return false;
        }
    }

    /**
     * Handle trump declaration timeout (auto-assign random trump)
     * @param {string} gameId - Game ID
     * @param {string} roundId - Round ID
     * @returns {Object} Auto-assigned trump result
     */
    async handleTrumpTimeout(gameId, roundId) {
        try {
            // Check if trump is already declared
            const roundResult = await dbConnection.query(`
                SELECT trump_suit, first_player_user_id FROM game_rounds 
                WHERE round_id = ?
            `, [roundId]);

            if (roundResult.length === 0 || roundResult[0].trump_suit) {
                throw new Error('Round not found or trump already declared');
            }

            // Auto-assign random trump suit
            const randomTrumpSuit = this.suits[Math.floor(Math.random() * this.suits.length)];
            const firstPlayerId = roundResult[0].first_player_user_id;

            console.log(`[GameEngine] Trump declaration timeout, auto-assigning ${randomTrumpSuit} in game ${gameId}`);

            // Use the regular declare trump method
            return await this.declareTrump(gameId, roundId, firstPlayerId, randomTrumpSuit);
        } catch (error) {
            console.error('[GameEngine] Handle trump timeout error:', error.message);
            throw error;
        }
    }

    /**
     * Get game teams information
     * @param {string} gameId - Game ID
     * @returns {Array} Array of team objects
     */
    async getGameTeams(gameId) {
        try {
            const teams = await dbConnection.query(`
                SELECT team_id, team_number, current_score, player1_id, player2_id
                FROM teams 
                WHERE game_id = ?
                ORDER BY team_number ASC
            `, [gameId]);

            return teams;
        } catch (error) {
            console.error('[GameEngine] Get game teams error:', error.message);
            throw error;
        }
    }

    /**
     * Get current round information
     * @param {string} gameId - Game ID
     * @returns {Object} Current round information
     */
    async getCurrentRound(gameId) {
        try {
            const roundResult = await dbConnection.query(`
                SELECT * FROM game_rounds 
                WHERE game_id = ? 
                ORDER BY round_number DESC 
                LIMIT 1
            `, [gameId]);

            if (roundResult.length === 0) {
                return null;
            }

            return roundResult[0];
        } catch (error) {
            console.error('[GameEngine] Get current round error:', error.message);
            throw error;
        }
    }

    /**
     * Complete trump declaration phase and deal final cards
     * @param {string} gameId - Game ID
     * @param {Array} remainingDeck - Remaining cards to deal
     * @returns {Object} Updated game state with full hands
     */
    async completeTrumpDeclaration(gameId, remainingDeck) {
        try {
            // Deal final 4 cards to each player
            const updatedHands = await this.dealFinalCards(gameId, remainingDeck);

            console.log(`[GameEngine] Completed trump declaration phase for game ${gameId}`);

            return {
                playerHands: updatedHands,
                phase: 'trick_taking' // Next phase is trick-taking
            };
        } catch (error) {
            console.error('[GameEngine] Complete trump declaration error:', error.message);
            throw error;
        }
    }

    /**
     * Validate if a card play is legal according to Contract Crown rules
     * @param {string} gameId - Game ID
     * @param {string} roundId - Round ID
     * @param {string} trickId - Trick ID
     * @param {string} playerId - Player attempting to play card
     * @param {Object} card - Card being played {suit, rank}
     * @returns {Object} Validation result
     */
    async validateCardPlay(gameId, roundId, trickId, playerId, card) {
        try {
            // Get player's current hand
            const handResult = await dbConnection.query(`
                SELECT current_hand FROM game_players 
                WHERE game_id = ? AND user_id = ?
            `, [gameId, playerId]);

            if (handResult.length === 0) {
                return { isValid: false, reason: 'Player not found in game' };
            }

            const playerHand = JSON.parse(handResult[0].current_hand || '[]');
            
            // Check if player has the card
            const hasCard = playerHand.some(c => c.suit === card.suit && c.rank === card.rank);
            if (!hasCard) {
                return { isValid: false, reason: 'Player does not have this card' };
            }

            // Get trick information
            const trickResult = await dbConnection.query(`
                SELECT cards_played, leading_player_id FROM game_tricks 
                WHERE trick_id = ?
            `, [trickId]);

            if (trickResult.length === 0) {
                return { isValid: false, reason: 'Trick not found' };
            }

            const cardsPlayed = JSON.parse(trickResult[0].cards_played || '[]');
            
            // If this is the first card of the trick, any card is valid
            if (cardsPlayed.length === 0) {
                return { isValid: true };
            }

            // Get trump suit for this round
            const roundResult = await dbConnection.query(`
                SELECT trump_suit FROM game_rounds WHERE round_id = ?
            `, [roundId]);

            const trumpSuit = roundResult[0]?.trump_suit;
            const leadSuit = cardsPlayed[0].card.suit;

            // Check suit-following rules
            const playerSuitCards = playerHand.filter(c => c.suit === leadSuit);
            
            // Must follow suit if possible
            if (playerSuitCards.length > 0 && card.suit !== leadSuit) {
                return { isValid: false, reason: 'Must follow suit when possible' };
            }

            // If can't follow suit, can play trump or any other card
            return { isValid: true };
        } catch (error) {
            console.error('[GameEngine] Validate card play error:', error.message);
            return { isValid: false, reason: 'Validation error' };
        }
    }

    /**
     * Play a card in the current trick with comprehensive validation
     * @param {string} gameId - Game ID
     * @param {string} roundId - Round ID
     * @param {string} trickId - Trick ID
     * @param {string} playerId - Player playing the card
     * @param {Object} card - Card being played
     * @returns {Object} Play result
     */
    async playCard(gameId, roundId, trickId, playerId, card) {
        try {
            // Comprehensive validation
            const validation = await this.validateCardPlay(gameId, roundId, trickId, playerId, card);
            if (!validation.isValid) {
                throw new Error(validation.reason);
            }

            // Additional turn validation
            const turnValidation = await this.validatePlayerTurn(gameId, trickId, playerId);
            if (!turnValidation.isValid) {
                throw new Error(turnValidation.reason);
            }

            // Get current trick state
            const trickResult = await dbConnection.query(`
                SELECT cards_played, leading_player_id FROM game_tricks WHERE trick_id = ?
            `, [trickId]);

            if (trickResult.length === 0) {
                throw new Error('Trick not found');
            }

            const cardsPlayed = JSON.parse(trickResult[0].cards_played || '[]');
            const leadingPlayerId = trickResult[0].leading_player_id;
            
            // Ensure card has proper value for comparison
            const cardWithValue = {
                ...card,
                value: this.cardValues[card.rank] || 0
            };

            // Add the played card with timestamp
            const playedCard = {
                playerId,
                card: cardWithValue,
                playedAt: new Date().toISOString(),
                position: cardsPlayed.length // 0-3 for play order
            };

            cardsPlayed.push(playedCard);

            // Update trick with new card
            await dbConnection.query(`
                UPDATE game_tricks SET cards_played = ?, updated_at = NOW() WHERE trick_id = ?
            `, [JSON.stringify(cardsPlayed), trickId]);

            // Remove card from player's hand
            const handResult = await dbConnection.query(`
                SELECT current_hand FROM game_players 
                WHERE game_id = ? AND user_id = ?
            `, [gameId, playerId]);

            const playerHand = JSON.parse(handResult[0].current_hand || '[]');
            const updatedHand = playerHand.filter(c => !(c.suit === card.suit && c.rank === card.rank));

            await dbConnection.query(`
                UPDATE game_players SET current_hand = ? 
                WHERE game_id = ? AND user_id = ?
            `, [JSON.stringify(updatedHand), gameId, playerId]);

            console.log(`[GameEngine] Player ${playerId} played ${card.rank} of ${card.suit} in trick ${trickId} (${cardsPlayed.length}/4 cards)`);

            // Check if trick is complete (4 cards played)
            if (cardsPlayed.length === 4) {
                const trickResult = await this.completeTrick(gameId, roundId, trickId);
                return {
                    ...trickResult,
                    cardPlayed: cardWithValue,
                    playerId,
                    cardsInTrick: cardsPlayed
                };
            }

            // Get next player in turn order
            const nextPlayerId = await this.getNextPlayer(gameId, playerId);

            return {
                trickId,
                cardsPlayed,
                cardsInTrick: cardsPlayed,
                nextPlayerId,
                trickComplete: false,
                cardPlayed: cardWithValue,
                playerId,
                leadSuit: cardsPlayed.length === 1 ? card.suit : (cardsPlayed[0]?.card?.suit || null)
            };
        } catch (error) {
            console.error('[GameEngine] Play card error:', error.message);
            
            // Return structured error for better client handling
            throw {
                type: 'card_play_error',
                message: error.message,
                code: this.getErrorCode(error.message),
                playerId,
                card,
                trickId
            };
        }
    }

    /**
     * Validate if it's the player's turn to play
     * @param {string} gameId - Game ID
     * @param {string} trickId - Trick ID
     * @param {string} playerId - Player attempting to play
     * @returns {Object} Validation result
     */
    async validatePlayerTurn(gameId, trickId, playerId) {
        try {
            // Get trick information
            const trickResult = await dbConnection.query(`
                SELECT cards_played, leading_player_id FROM game_tricks WHERE trick_id = ?
            `, [trickId]);

            if (trickResult.length === 0) {
                return { isValid: false, reason: 'Trick not found' };
            }

            const cardsPlayed = JSON.parse(trickResult[0].cards_played || '[]');
            const leadingPlayerId = trickResult[0].leading_player_id;

            // If no cards played yet, only the leading player can play
            if (cardsPlayed.length === 0) {
                if (playerId !== leadingPlayerId) {
                    return { isValid: false, reason: 'Only the leading player can play the first card' };
                }
                return { isValid: true };
            }

            // Check if player has already played in this trick
            const hasAlreadyPlayed = cardsPlayed.some(play => play.playerId === playerId);
            if (hasAlreadyPlayed) {
                return { isValid: false, reason: 'Player has already played in this trick' };
            }

            // Determine whose turn it is based on play order
            const expectedPlayerId = await this.getExpectedPlayer(gameId, leadingPlayerId, cardsPlayed.length);
            if (playerId !== expectedPlayerId) {
                return { isValid: false, reason: 'Not your turn to play' };
            }

            return { isValid: true };
        } catch (error) {
            console.error('[GameEngine] Validate player turn error:', error.message);
            return { isValid: false, reason: 'Turn validation error' };
        }
    }

    /**
     * Get the expected player for the current position in trick
     * @param {string} gameId - Game ID
     * @param {string} leadingPlayerId - Leading player ID
     * @param {number} position - Position in trick (0-3)
     * @returns {string} Expected player ID
     */
    async getExpectedPlayer(gameId, leadingPlayerId, position) {
        try {
            const players = await this.getGamePlayers(gameId);
            const leadingIndex = players.findIndex(p => p.user_id === leadingPlayerId);
            
            if (leadingIndex === -1) {
                throw new Error('Leading player not found');
            }

            const expectedIndex = (leadingIndex + position) % players.length;
            return players[expectedIndex].user_id;
        } catch (error) {
            console.error('[GameEngine] Get expected player error:', error.message);
            throw error;
        }
    }

    /**
     * Get error code for structured error handling
     * @param {string} message - Error message
     * @returns {string} Error code
     */
    getErrorCode(message) {
        if (message.includes('Must follow suit')) return 'SUIT_FOLLOWING_VIOLATION';
        if (message.includes('not your turn')) return 'TURN_VIOLATION';
        if (message.includes('does not have this card')) return 'CARD_NOT_IN_HAND';
        if (message.includes('already played')) return 'ALREADY_PLAYED';
        if (message.includes('Trick not found')) return 'TRICK_NOT_FOUND';
        return 'UNKNOWN_ERROR';
    }

    /**
     * Determine the winner of a trick
     * @param {Array} cardsPlayed - Array of played cards with player info
     * @param {string} trumpSuit - Trump suit for the round
     * @returns {Object} Trick winner information
     */
    determineTrickWinner(cardsPlayed, trumpSuit) {
        if (cardsPlayed.length !== 4) {
            throw new Error('Trick must have exactly 4 cards to determine winner');
        }

        const leadSuit = cardsPlayed[0].card.suit;
        let winningCard = cardsPlayed[0];

        for (let i = 1; i < cardsPlayed.length; i++) {
            const currentCard = cardsPlayed[i];
            
            // Trump beats non-trump
            if (currentCard.card.suit === trumpSuit && winningCard.card.suit !== trumpSuit) {
                winningCard = currentCard;
            }
            // Higher trump beats lower trump
            else if (currentCard.card.suit === trumpSuit && winningCard.card.suit === trumpSuit) {
                if (currentCard.card.value > winningCard.card.value) {
                    winningCard = currentCard;
                }
            }
            // Higher card of lead suit beats lower (if no trump involved)
            else if (currentCard.card.suit === leadSuit && winningCard.card.suit === leadSuit) {
                if (currentCard.card.value > winningCard.card.value) {
                    winningCard = currentCard;
                }
            }
            // Lead suit beats off-suit (if no trump involved)
            else if (currentCard.card.suit === leadSuit && winningCard.card.suit !== leadSuit && winningCard.card.suit !== trumpSuit) {
                winningCard = currentCard;
            }
        }

        return {
            winningPlayerId: winningCard.playerId,
            winningCard: winningCard.card
        };
    }

    /**
     * Complete a trick and determine winner
     * @param {string} gameId - Game ID
     * @param {string} roundId - Round ID
     * @param {string} trickId - Trick ID
     * @returns {Object} Completed trick result
     */
    async completeTrick(gameId, roundId, trickId) {
        try {
            // Get trick and round information
            const [trickResult, roundResult] = await Promise.all([
                dbConnection.query(`SELECT cards_played FROM game_tricks WHERE trick_id = ?`, [trickId]),
                dbConnection.query(`SELECT trump_suit FROM game_rounds WHERE round_id = ?`, [roundId])
            ]);

            const cardsPlayed = JSON.parse(trickResult[0].cards_played);
            const trumpSuit = roundResult[0].trump_suit;

            // Determine trick winner
            const winner = this.determineTrickWinner(cardsPlayed, trumpSuit);

            // Update trick with winner and completion time
            await dbConnection.query(`
                UPDATE game_tricks 
                SET winning_player_id = ?, completed_at = NOW() 
                WHERE trick_id = ?
            `, [winner.winningPlayerId, trickId]);

            // Update player's tricks won count
            await dbConnection.query(`
                UPDATE game_players 
                SET tricks_won_current_round = tricks_won_current_round + 1 
                WHERE game_id = ? AND user_id = ?
            `, [gameId, winner.winningPlayerId]);

            console.log(`[GameEngine] Trick ${trickId} won by player ${winner.winningPlayerId}`);

            // Check if round is complete (8 tricks played)
            const tricksInRound = await dbConnection.query(`
                SELECT COUNT(*) as trick_count FROM game_tricks gt
                JOIN game_rounds gr ON gt.round_id = gr.round_id
                WHERE gr.game_id = ? AND gr.round_id = ? AND gt.completed_at IS NOT NULL
            `, [gameId, roundId]);

            const isRoundComplete = tricksInRound[0].trick_count === 8;

            if (isRoundComplete) {
                return await this.completeRound(gameId, roundId);
            }

            // Create next trick with winner as leader
            const nextTrickId = await this.createNextTrick(roundId, winner.winningPlayerId);

            return {
                trickId,
                winner: winner.winningPlayerId,
                winningCard: winner.winningCard,
                cardsPlayed,
                trickComplete: true,
                roundComplete: false,
                nextTrickId,
                nextLeaderId: winner.winningPlayerId
            };
        } catch (error) {
            console.error('[GameEngine] Complete trick error:', error.message);
            throw error;
        }
    }

    /**
     * Create the next trick in the round
     * @param {string} roundId - Round ID
     * @param {string} leadingPlayerId - Player who leads the next trick
     * @returns {string} New trick ID
     */
    async createNextTrick(roundId, leadingPlayerId) {
        try {
            // Get current trick count for this round
            const trickCountResult = await dbConnection.query(`
                SELECT COUNT(*) as trick_count FROM game_tricks WHERE round_id = ?
            `, [roundId]);

            const nextTrickNumber = trickCountResult[0].trick_count + 1;
            const trickId = uuidv4();

            await dbConnection.query(`
                INSERT INTO game_tricks (
                    trick_id, round_id, trick_number, leading_player_id, 
                    cards_played, created_at
                ) VALUES (?, ?, ?, ?, '[]', NOW())
            `, [trickId, roundId, nextTrickNumber, leadingPlayerId]);

            console.log(`[GameEngine] Created trick ${nextTrickNumber} with leader ${leadingPlayerId}`);
            return trickId;
        } catch (error) {
            console.error('[GameEngine] Create next trick error:', error.message);
            throw error;
        }
    }

    /**
     * Get the next player in turn order (clockwise)
     * @param {string} gameId - Game ID
     * @param {string} currentPlayerId - Current player's ID
     * @returns {string} Next player's ID
     */
    async getNextPlayer(gameId, currentPlayerId) {
        try {
            const players = await this.getGamePlayers(gameId);
            const currentIndex = players.findIndex(p => p.user_id === currentPlayerId);
            
            if (currentIndex === -1) {
                throw new Error('Current player not found in game');
            }

            const nextIndex = (currentIndex + 1) % players.length;
            return players[nextIndex].user_id;
        } catch (error) {
            console.error('[GameEngine] Get next player error:', error.message);
            throw error;
        }
    }

    /**
     * Start the first trick of a round
     * @param {string} roundId - Round ID
     * @param {string} firstPlayerId - First player to lead
     * @returns {string} Trick ID
     */
    async startFirstTrick(roundId, firstPlayerId) {
        try {
            const trickId = uuidv4();

            await dbConnection.query(`
                INSERT INTO game_tricks (
                    trick_id, round_id, trick_number, leading_player_id, 
                    cards_played, created_at
                ) VALUES (?, ?, 1, ?, '[]', NOW())
            `, [trickId, roundId, firstPlayerId]);

            console.log(`[GameEngine] Started first trick of round with leader ${firstPlayerId}`);
            return trickId;
        } catch (error) {
            console.error('[GameEngine] Start first trick error:', error.message);
            throw error;
        }
    }

    /**
     * Complete a round and calculate scores
     * @param {string} gameId - Game ID
     * @param {string} roundId - Round ID
     * @returns {Object} Round completion result with scores
     */
    async completeRound(gameId, roundId) {
        try {
            // Get round information
            const roundResult = await dbConnection.query(`
                SELECT declaring_team_id, trump_suit FROM game_rounds 
                WHERE round_id = ?
            `, [roundId]);

            const declaringTeamId = roundResult[0].declaring_team_id;
            const trumpSuit = roundResult[0].trump_suit;

            // Calculate tricks won by each team
            const teamTricks = await this.calculateTeamTricks(gameId, declaringTeamId);
            
            // Apply Contract Crown scoring rules
            const scores = this.calculateRoundScores(teamTricks);

            // Update team scores in database
            await this.updateTeamScores(gameId, declaringTeamId, scores);

            // Update round completion
            await dbConnection.query(`
                UPDATE game_rounds 
                SET declaring_team_tricks_won = ?, challenging_team_tricks_won = ?, 
                    round_completed_at = NOW()
                WHERE round_id = ?
            `, [teamTricks.declaringTeamTricks, teamTricks.challengingTeamTricks, roundId]);

            // Check if game is complete
            const gameComplete = await this.checkGameComplete(gameId);

            if (gameComplete.isComplete) {
                await this.completeGame(gameId, gameComplete.winningTeamId);
                
                return {
                    roundComplete: true,
                    gameComplete: true,
                    scores,
                    teamTricks,
                    winningTeamId: gameComplete.winningTeamId,
                    finalScores: gameComplete.finalScores
                };
            }

            // Start next round if game continues
            const nextRoundInfo = await this.startNextRound(gameId, roundId, scores);

            return {
                roundComplete: true,
                gameComplete: false,
                scores,
                teamTricks,
                nextRound: nextRoundInfo
            };
        } catch (error) {
            console.error('[GameEngine] Complete round error:', error.message);
            throw error;
        }
    }

    /**
     * Calculate tricks won by each team
     * @param {string} gameId - Game ID
     * @param {string} declaringTeamId - Declaring team ID
     * @returns {Object} Tricks won by each team
     */
    async calculateTeamTricks(gameId, declaringTeamId) {
        try {
            // Get all players and their tricks won
            const playerTricks = await dbConnection.query(`
                SELECT gp.user_id, gp.team_id, gp.tricks_won_current_round
                FROM game_players gp
                WHERE gp.game_id = ?
            `, [gameId]);

            let declaringTeamTricks = 0;
            let challengingTeamTricks = 0;

            for (const player of playerTricks) {
                if (player.team_id === declaringTeamId) {
                    declaringTeamTricks += player.tricks_won_current_round;
                } else {
                    challengingTeamTricks += player.tricks_won_current_round;
                }
            }

            return {
                declaringTeamTricks,
                challengingTeamTricks,
                declaringTeamId
            };
        } catch (error) {
            console.error('[GameEngine] Calculate team tricks error:', error.message);
            throw error;
        }
    }

    /**
     * Calculate round scores based on Contract Crown rules
     * @param {Object} teamTricks - Tricks won by each team
     * @returns {Object} Scores for each team
     */
    calculateRoundScores(teamTricks) {
        const { declaringTeamTricks, challengingTeamTricks } = teamTricks;

        // Contract Crown scoring rules:
        // - Declaring team needs 5+ tricks to score
        // - Challenging team needs 4+ tricks to score
        // - Points equal to tricks won (if minimum met)

        const declaringTeamScore = declaringTeamTricks >= 5 ? declaringTeamTricks : 0;
        const challengingTeamScore = challengingTeamTricks >= 4 ? challengingTeamTricks : 0;

        return {
            declaringTeamScore,
            challengingTeamScore,
            declaringTeamMadeContract: declaringTeamTricks >= 5,
            challengingTeamMadeContract: challengingTeamTricks >= 4
        };
    }

    /**
     * Update team scores in database
     * @param {string} gameId - Game ID
     * @param {string} declaringTeamId - Declaring team ID
     * @param {Object} scores - Round scores
     */
    async updateTeamScores(gameId, declaringTeamId, scores) {
        try {
            // Update declaring team score
            await dbConnection.query(`
                UPDATE teams 
                SET current_score = current_score + ? 
                WHERE game_id = ? AND team_id = ?
            `, [scores.declaringTeamScore, gameId, declaringTeamId]);

            // Update challenging team score
            await dbConnection.query(`
                UPDATE teams 
                SET current_score = current_score + ? 
                WHERE game_id = ? AND team_id != ?
            `, [scores.challengingTeamScore, gameId, declaringTeamId]);

            console.log(`[GameEngine] Updated scores: Declaring team +${scores.declaringTeamScore}, Challenging team +${scores.challengingTeamScore}`);
        } catch (error) {
            console.error('[GameEngine] Update team scores error:', error.message);
            throw error;
        }
    }

    /**
     * Check if game is complete (team reached 52 points)
     * @param {string} gameId - Game ID
     * @returns {Object} Game completion status
     */
    async checkGameComplete(gameId) {
        try {
            const teams = await dbConnection.query(`
                SELECT team_id, current_score FROM teams 
                WHERE game_id = ? 
                ORDER BY current_score DESC
            `, [gameId]);

            const winningTeam = teams.find(team => team.current_score >= 52);

            if (winningTeam) {
                return {
                    isComplete: true,
                    winningTeamId: winningTeam.team_id,
                    finalScores: teams.map(t => ({
                        teamId: t.team_id,
                        score: t.current_score
                    }))
                };
            }

            return { isComplete: false };
        } catch (error) {
            console.error('[GameEngine] Check game complete error:', error.message);
            throw error;
        }
    }

    /**
     * Complete the game and update final statistics
     * @param {string} gameId - Game ID
     * @param {string} winningTeamId - Winning team ID
     */
    async completeGame(gameId, winningTeamId) {
        try {
            // Update game status
            await dbConnection.query(`
                UPDATE games 
                SET status = 'completed', completed_at = NOW(), winning_team_id = ?
                WHERE game_id = ?
            `, [winningTeamId, gameId]);

            // Update player statistics
            const winningPlayers = await dbConnection.query(`
                SELECT user_id FROM game_players 
                WHERE game_id = ? AND team_id = ?
            `, [gameId, winningTeamId]);

            const allPlayers = await dbConnection.query(`
                SELECT user_id FROM game_players WHERE game_id = ?
            `, [gameId]);

            // Update stats for winning players
            for (const player of winningPlayers) {
                await dbConnection.query(`
                    UPDATE users 
                    SET total_games_played = total_games_played + 1,
                        total_games_won = total_games_won + 1
                    WHERE user_id = ?
                `, [player.user_id]);
            }

            // Update stats for losing players
            const losingPlayers = allPlayers.filter(p => 
                !winningPlayers.some(wp => wp.user_id === p.user_id)
            );

            for (const player of losingPlayers) {
                await dbConnection.query(`
                    UPDATE users 
                    SET total_games_played = total_games_played + 1
                    WHERE user_id = ?
                `, [player.user_id]);
            }

            console.log(`[GameEngine] Game ${gameId} completed, winner: team ${winningTeamId}`);
        } catch (error) {
            console.error('[GameEngine] Complete game error:', error.message);
            throw error;
        }
    }

    /**
     * Start next round with Crown Rule implementation
     * @param {string} gameId - Game ID
     * @param {string} currentRoundId - Current round ID
     * @param {Object} scores - Current round scores
     * @returns {Object} Next round information
     */
    async startNextRound(gameId, currentRoundId, scores) {
        try {
            // Get current round info
            const currentRound = await dbConnection.query(`
                SELECT round_number, dealer_user_id, first_player_user_id, declaring_team_id
                FROM game_rounds WHERE round_id = ?
            `, [currentRoundId]);

            const roundInfo = currentRound[0];

            // Apply Crown Rule for trump declaration privilege
            let nextFirstPlayer;
            
            if (scores.declaringTeamMadeContract) {
                // Declaring team made contract: same player declares trump again
                nextFirstPlayer = roundInfo.first_player_user_id;
                console.log(`[GameEngine] Crown Rule: Declaring team made contract, same player declares trump`);
            } else {
                // Declaring team failed: trump declaration passes to dealer's left
                nextFirstPlayer = await this.getNextPlayer(gameId, roundInfo.dealer_user_id);
                console.log(`[GameEngine] Crown Rule: Declaring team failed, trump declaration passes`);
            }

            // Get next dealer (rotates clockwise)
            const nextDealerInfo = await this.getNextDealer(gameId, roundInfo.dealer_user_id);

            // Create next round
            const nextRoundNumber = roundInfo.round_number + 1;
            const nextRoundId = await this.createGameRound(
                gameId,
                nextRoundNumber,
                nextDealerInfo.dealerUserId,
                nextFirstPlayer
            );

            // Reset player trick counts for new round
            await dbConnection.query(`
                UPDATE game_players 
                SET tricks_won_current_round = 0, current_hand = NULL
                WHERE game_id = ?
            `, [gameId]);

            // Deal new cards for next round
            const dealResult = await this.dealInitialCards(gameId);

            console.log(`[GameEngine] Started round ${nextRoundNumber} for game ${gameId}`);

            return {
                roundId: nextRoundId,
                roundNumber: nextRoundNumber,
                dealerUserId: nextDealerInfo.dealerUserId,
                firstPlayerUserId: nextFirstPlayer,
                playerHands: dealResult.playerHands,
                remainingDeck: dealResult.remainingDeck,
                phase: 'trump_declaration'
            };
        } catch (error) {
            console.error('[GameEngine] Start next round error:', error.message);
            throw error;
        }
    }

    /**
     * Get current game state
     * @param {string} gameId - Game ID
     * @returns {Object} Complete game state
     */
    async getGameState(gameId) {
        try {
            // Get game info
            const gameResult = await dbConnection.query(`
                SELECT * FROM games WHERE game_id = ?
            `, [gameId]);

            if (gameResult.length === 0) {
                throw new Error('Game not found');
            }

            const game = gameResult[0];

            // Get current round
            const currentRound = await this.getCurrentRound(gameId);
            
            // Get teams and scores
            const teams = await this.getGameTeams(gameId);
            
            // Get players
            const players = await this.getGamePlayers(gameId);

            // Get current trick if in progress
            let currentTrick = null;
            if (currentRound) {
                const trickResult = await dbConnection.query(`
                    SELECT * FROM game_tricks 
                    WHERE round_id = ? AND completed_at IS NULL
                    ORDER BY trick_number DESC LIMIT 1
                `, [currentRound.round_id]);

                if (trickResult.length > 0) {
                    currentTrick = {
                        trickId: trickResult[0].trick_id,
                        trickNumber: trickResult[0].trick_number,
                        leadingPlayerId: trickResult[0].leading_player_id,
                        cardsPlayed: JSON.parse(trickResult[0].cards_played || '[]')
                    };
                }
            }

            return {
                gameId: game.game_id,
                status: game.status,
                targetScore: game.target_score,
                createdAt: game.created_at,
                startedAt: game.started_at,
                completedAt: game.completed_at,
                winningTeamId: game.winning_team_id,
                currentRound,
                teams,
                players,
                currentTrick
            };
        } catch (error) {
            console.error('[GameEngine] Get game state error:', error.message);
            throw error;
        }
    }

    /**
     * Start a new game with initial card dealing
     * @param {string} gameId - Game ID
     * @returns {Object} Initial game state with dealt cards
     */
    async startNewGame(gameId) {
        try {
            // Deal initial 4 cards to each player
            const dealResult = await this.dealInitialCards(gameId);
            
            // Create first round
            const roundId = await this.createGameRound(
                gameId, 
                1, 
                dealResult.dealerUserId, 
                dealResult.firstPlayerUserId
            );

            // Update game status
            await dbConnection.query(`
                UPDATE games 
                SET status = 'in_progress', started_at = NOW() 
                WHERE game_id = ?
            `, [gameId]);

            console.log(`[GameEngine] Started new game ${gameId}`);

            return {
                gameId,
                roundId,
                roundNumber: 1,
                dealerUserId: dealResult.dealerUserId,
                firstPlayerUserId: dealResult.firstPlayerUserId,
                playerHands: dealResult.playerHands,
                remainingDeck: dealResult.remainingDeck,
                phase: 'trump_declaration', // Next phase is trump declaration
                status: 'in_progress'
            };
        } catch (error) {
            console.error('[GameEngine] Start new game error:', error.message);
            throw error;
        }
    }
}

export default GameEngine;   
 /**
     * Complete a round and calculate scores
     * @param {string} gameId - Game ID
     * @param {string} roundId - Round ID
     * @returns {Object} Round completion result
     */
    async completeRound(gameId, roundId) {
        try {
            // Get round information
            const roundResult = await dbConnection.query(`
                SELECT trump_suit, declaring_team_id, round_number 
                FROM game_rounds 
                WHERE round_id = ?
            `, [roundId]);

            if (roundResult.length === 0) {
                throw new Error('Round not found');
            }

            const { trump_suit, declaring_team_id, round_number } = roundResult[0];

            // Calculate tricks won by each team
            const teamTricks = await this.calculateTeamTricks(gameId, roundId);
            const declaringTeamTricks = teamTricks[declaring_team_id] || 0;
            
            // Get the other team ID
            const teams = await this.getGameTeams(gameId);
            const challengingTeam = teams.find(t => t.team_id !== declaring_team_id);
            const challengingTeamTricks = teamTricks[challengingTeam.team_id] || 0;

            // Calculate scores based on Contract Crown rules
            const scores = this.calculateRoundScores(
                declaringTeamTricks, 
                challengingTeamTricks, 
                declaring_team_id, 
                challengingTeam.team_id
            );

            // Update team scores in database
            await this.updateTeamScores(gameId, scores);

            // Mark round as complete
            await dbConnection.query(`
                UPDATE game_rounds 
                SET declaring_team_tricks_won = ?, 
                    challenging_team_tricks_won = ?, 
                    round_completed_at = NOW()
                WHERE round_id = ?
            `, [declaringTeamTricks, challengingTeamTricks, roundId]);

            // Get updated team scores
            const updatedTeams = await this.getGameTeams(gameId);
            const finalScores = {};
            updatedTeams.forEach(team => {
                finalScores[team.team_id] = team.current_score;
            });

            // Check if game is complete (any team reached 52 points)
            const gameComplete = updatedTeams.some(team => team.current_score >= 52);
            let winningTeam = null;

            if (gameComplete) {
                // Find winning team
                winningTeam = updatedTeams.reduce((winner, team) => 
                    team.current_score > (winner?.current_score || 0) ? team : winner
                );

                // Update game status
                await dbConnection.query(`
                    UPDATE games 
                    SET status = 'completed', 
                        completed_at = NOW(), 
                        winning_team_id = ?
                    WHERE game_id = ?
                `, [winningTeam.team_id, gameId]);

                console.log(`[GameEngine] Game ${gameId} completed! Winner: Team ${winningTeam.team_number}`);
            } else {
                // Prepare for next round
                const nextRoundData = await this.prepareNextRound(gameId, roundId);
                
                return {
                    roundId,
                    roundNumber: round_number,
                    roundComplete: true,
                    gameComplete: false,
                    declaringTeamTricks,
                    challengingTeamTricks,
                    scores: finalScores,
                    nextRound: nextRoundData
                };
            }

            console.log(`[GameEngine] Round ${round_number} completed in game ${gameId}`);

            return {
                roundId,
                roundNumber: round_number,
                roundComplete: true,
                gameComplete,
                winningTeam: winningTeam ? {
                    teamId: winningTeam.team_id,
                    teamNumber: winningTeam.team_number,
                    finalScore: winningTeam.current_score
                } : null,
                declaringTeamTricks,
                challengingTeamTricks,
                scores: finalScores
            };
        } catch (error) {
            console.error('[GameEngine] Complete round error:', error.message);
            throw error;
        }
    }

    /**
     * Calculate tricks won by each team in a round
     * @param {string} gameId - Game ID
     * @param {string} roundId - Round ID
     * @returns {Object} Team tricks count
     */
    async calculateTeamTricks(gameId, roundId) {
        try {
            // Get all completed tricks in the round with winners
            const tricksResult = await dbConnection.query(`
                SELECT gt.winning_player_id, gp.team_id
                FROM game_tricks gt
                JOIN game_players gp ON gt.winning_player_id = gp.user_id AND gp.game_id = ?
                WHERE gt.round_id = ? AND gt.completed_at IS NOT NULL
            `, [gameId, roundId]);

            const teamTricks = {};
            
            tricksResult.forEach(trick => {
                const teamId = trick.team_id;
                teamTricks[teamId] = (teamTricks[teamId] || 0) + 1;
            });

            return teamTricks;
        } catch (error) {
            console.error('[GameEngine] Calculate team tricks error:', error.message);
            throw error;
        }
    }

    /**
     * Calculate round scores based on Contract Crown rules
     * @param {number} declaringTeamTricks - Tricks won by declaring team
     * @param {number} challengingTeamTricks - Tricks won by challenging team
     * @param {string} declaringTeamId - Declaring team ID
     * @param {string} challengingTeamId - Challenging team ID
     * @returns {Object} Score updates for each team
     */
    calculateRoundScores(declaringTeamTricks, challengingTeamTricks, declaringTeamId, challengingTeamId) {
        const scores = {};

        // Declaring team scoring rules
        if (declaringTeamTricks >= 5) {
            // Declaring team made their contract
            scores[declaringTeamId] = declaringTeamTricks;
        } else {
            // Declaring team failed their contract
            scores[declaringTeamId] = 0;
        }

        // Challenging team scoring rules
        if (challengingTeamTricks >= 4) {
            // Challenging team gets points for 4+ tricks
            scores[challengingTeamId] = challengingTeamTricks;
        } else {
            // Challenging team gets no points
            scores[challengingTeamId] = 0;
        }

        return scores;
    }

    /**
     * Update team scores in database
     * @param {string} gameId - Game ID
     * @param {Object} scores - Score updates for each team
     */
    async updateTeamScores(gameId, scores) {
        try {
            for (const [teamId, points] of Object.entries(scores)) {
                await dbConnection.query(`
                    UPDATE teams 
                    SET current_score = current_score + ? 
                    WHERE team_id = ? AND game_id = ?
                `, [points, teamId, gameId]);
            }

            console.log(`[GameEngine] Updated team scores for game ${gameId}:`, scores);
        } catch (error) {
            console.error('[GameEngine] Update team scores error:', error.message);
            throw error;
        }
    }

    /**
     * Prepare for the next round
     * @param {string} gameId - Game ID
     * @param {string} currentRoundId - Current round ID
     * @returns {Object} Next round information
     */
    async prepareNextRound(gameId, currentRoundId) {
        try {
            // Get current round info
            const currentRoundResult = await dbConnection.query(`
                SELECT round_number, dealer_user_id, declaring_team_id
                FROM game_rounds 
                WHERE round_id = ?
            `, [currentRoundId]);

            const { round_number, dealer_user_id, declaring_team_id } = currentRoundResult[0];

            // Determine next dealer and trump declarer based on Crown Rule
            const nextRoundInfo = await this.applyTrumpDeclarationRule(
                gameId, 
                currentRoundId, 
                dealer_user_id, 
                declaring_team_id
            );

            // Create next round
            const nextRoundId = await this.createGameRound(
                gameId,
                round_number + 1,
                nextRoundInfo.dealerUserId,
                nextRoundInfo.firstPlayerUserId
            );

            // Deal initial cards for next round
            const dealResult = await this.dealInitialCards(gameId);

            console.log(`[GameEngine] Prepared next round ${round_number + 1} for game ${gameId}`);

            return {
                roundId: nextRoundId,
                roundNumber: round_number + 1,
                dealerUserId: nextRoundInfo.dealerUserId,
                firstPlayerUserId: nextRoundInfo.firstPlayerUserId,
                trumpDeclarerUserId: nextRoundInfo.trumpDeclarerUserId,
                playerHands: dealResult.playerHands,
                remainingDeck: dealResult.remainingDeck
            };
        } catch (error) {
            console.error('[GameEngine] Prepare next round error:', error.message);
            throw error;
        }
    }

    /**
     * Apply Crown Rule for trump declaration privilege
     * @param {string} gameId - Game ID
     * @param {string} roundId - Current round ID
     * @param {string} currentDealerId - Current dealer ID
     * @param {string} declaringTeamId - Current declaring team ID
     * @returns {Object} Next round player assignments
     */
    async applyTrumpDeclarationRule(gameId, roundId, currentDealerId, declaringTeamId) {
        try {
            // Get team tricks to determine if declaring team made contract
            const teamTricks = await this.calculateTeamTricks(gameId, roundId);
            const declaringTeamTricks = teamTricks[declaringTeamId] || 0;

            // Get next dealer (always rotates clockwise)
            const nextDealerInfo = await this.getNextDealer(gameId, currentDealerId);

            let trumpDeclarerUserId;

            if (declaringTeamTricks >= 5) {
                // Declaring team made contract - same player declares trump again
                const currentRoundResult = await dbConnection.query(`
                    SELECT first_player_user_id FROM game_rounds WHERE round_id = ?
                `, [roundId]);
                trumpDeclarerUserId = currentRoundResult[0].first_player_user_id;
            } else {
                // Declaring team failed - trump declaration passes to dealer's left
                trumpDeclarerUserId = nextDealerInfo.firstPlayerUserId;
            }

            return {
                dealerUserId: nextDealerInfo.dealerUserId,
                firstPlayerUserId: nextDealerInfo.firstPlayerUserId,
                trumpDeclarerUserId
            };
        } catch (error) {
            console.error('[GameEngine] Apply trump declaration rule error:', error.message);
            throw error;
        }
    }

    /**
     * Get comprehensive game statistics
     * @param {string} gameId - Game ID
     * @returns {Object} Game statistics
     */
    async getGameStatistics(gameId) {
        try {
            // Get game info
            const gameResult = await dbConnection.query(`
                SELECT status, created_at, started_at, completed_at, winning_team_id
                FROM games WHERE game_id = ?
            `, [gameId]);

            if (gameResult.length === 0) {
                throw new Error('Game not found');
            }

            const game = gameResult[0];

            // Get teams and scores
            const teams = await this.getGameTeams(gameId);

            // Get rounds played
            const roundsResult = await dbConnection.query(`
                SELECT COUNT(*) as total_rounds FROM game_rounds 
                WHERE game_id = ? AND round_completed_at IS NOT NULL
            `, [gameId]);

            // Get player statistics
            const playersResult = await dbConnection.query(`
                SELECT gp.user_id, u.username, gp.team_id, 
                       SUM(gp.tricks_won_current_round) as total_tricks_won
                FROM game_players gp
                JOIN users u ON gp.user_id = u.user_id
                WHERE gp.game_id = ?
                GROUP BY gp.user_id, u.username, gp.team_id
            `, [gameId]);

            return {
                gameId,
                status: game.status,
                duration: game.completed_at ? 
                    new Date(game.completed_at) - new Date(game.started_at) : null,
                totalRounds: roundsResult[0].total_rounds,
                teams: teams.map(team => ({
                    teamId: team.team_id,
                    teamNumber: team.team_number,
                    finalScore: team.current_score,
                    isWinner: team.team_id === game.winning_team_id
                })),
                players: playersResult.map(player => ({
                    userId: player.user_id,
                    username: player.username,
                    teamId: player.team_id,
                    totalTricksWon: player.total_tricks_won || 0
                }))
            };
        } catch (error) {
            console.error('[GameEngine] Get game statistics error:', error.message);
            throw error;
        }
    }
}

export default GameEngine;