import { describe, it, expect, beforeEach } from 'vitest';
import GameEngine from '../src/services/GameEngine.js';

describe('GameEngine', () => {
    let gameEngine;

    beforeEach(() => {
        gameEngine = new GameEngine();
    });

    describe('Card Dealing and Shuffle', () => {
        it('should generate a complete 32-card deck', () => {
            const deck = gameEngine.generateDeck();
            
            expect(deck).toHaveLength(32);
            
            // Check all suits are present
            const suits = [...new Set(deck.map(card => card.suit))];
            expect(suits).toHaveLength(4);
            expect(suits).toEqual(expect.arrayContaining(['Hearts', 'Diamonds', 'Clubs', 'Spades']));
            
            // Check all ranks are present (7 through Ace)
            const ranks = [...new Set(deck.map(card => card.rank))];
            expect(ranks).toHaveLength(8);
            expect(ranks).toEqual(expect.arrayContaining(['7', '8', '9', '10', 'J', 'Q', 'K', 'A']));
            
            // Check card values are assigned correctly
            const aceCard = deck.find(card => card.rank === 'A');
            const sevenCard = deck.find(card => card.rank === '7');
            expect(aceCard.value).toBe(14);
            expect(sevenCard.value).toBe(7);
        });

        it('should shuffle deck using Fisher-Yates algorithm', () => {
            const originalDeck = gameEngine.generateDeck();
            const shuffledDeck = gameEngine.shuffleDeck(originalDeck);
            
            expect(shuffledDeck).toHaveLength(32);
            
            // Shuffled deck should contain same cards but likely in different order
            expect(shuffledDeck).toEqual(expect.arrayContaining(originalDeck));
            
            // Very unlikely to be in same order (though theoretically possible)
            const sameOrder = shuffledDeck.every((card, index) => 
                card.suit === originalDeck[index].suit && card.rank === originalDeck[index].rank
            );
            expect(sameOrder).toBe(false);
        });

        it('should validate card values are correctly assigned', () => {
            const deck = gameEngine.generateDeck();
            
            // Test specific card values
            const testCases = [
                { rank: '7', expectedValue: 7 },
                { rank: '8', expectedValue: 8 },
                { rank: '9', expectedValue: 9 },
                { rank: '10', expectedValue: 10 },
                { rank: 'J', expectedValue: 11 },
                { rank: 'Q', expectedValue: 12 },
                { rank: 'K', expectedValue: 13 },
                { rank: 'A', expectedValue: 14 }
            ];

            for (const testCase of testCases) {
                const card = deck.find(c => c.rank === testCase.rank);
                expect(card.value).toBe(testCase.expectedValue);
            }
        });
    });

    describe('Trick-Taking Logic', () => {
        it('should determine trick winner correctly with trump cards', () => {
            const cardsPlayed = [
                { playerId: 'player1', card: { suit: 'Clubs', rank: 'K', value: 13 } },
                { playerId: 'player2', card: { suit: 'Clubs', rank: 'A', value: 14 } },
                { playerId: 'player3', card: { suit: 'Hearts', rank: '7', value: 7 } }, // Trump
                { playerId: 'player4', card: { suit: 'Diamonds', rank: 'A', value: 14 } }
            ];
            
            const winner = gameEngine.determineTrickWinner(cardsPlayed, 'Hearts');
            
            // Trump card should win even though it's lowest value
            expect(winner.winningPlayerId).toBe('player3');
            expect(winner.winningCard.suit).toBe('Hearts');
            expect(winner.winningCard.rank).toBe('7');
        });

        it('should handle suit-following rules without trump', () => {
            const cardsPlayed = [
                { playerId: 'player1', card: { suit: 'Clubs', rank: 'K', value: 13 } },
                { playerId: 'player2', card: { suit: 'Clubs', rank: 'A', value: 14 } },
                { playerId: 'player3', card: { suit: 'Clubs', rank: '7', value: 7 } },
                { playerId: 'player4', card: { suit: 'Clubs', rank: 'Q', value: 12 } }
            ];
            
            const winner = gameEngine.determineTrickWinner(cardsPlayed, 'Hearts');
            
            // Highest card of lead suit should win
            expect(winner.winningPlayerId).toBe('player2');
            expect(winner.winningCard.rank).toBe('A');
        });

        it('should handle multiple trump cards correctly', () => {
            const cardsPlayed = [
                { playerId: 'player1', card: { suit: 'Hearts', rank: '8', value: 8 } }, // Trump
                { playerId: 'player2', card: { suit: 'Clubs', rank: 'A', value: 14 } },
                { playerId: 'player3', card: { suit: 'Hearts', rank: 'K', value: 13 } }, // Higher trump
                { playerId: 'player4', card: { suit: 'Hearts', rank: '7', value: 7 } } // Lower trump
            ];
            
            const winner = gameEngine.determineTrickWinner(cardsPlayed, 'Hearts');
            
            // Highest trump should win
            expect(winner.winningPlayerId).toBe('player3');
            expect(winner.winningCard.rank).toBe('K');
        });

        it('should handle off-suit cards correctly', () => {
            const cardsPlayed = [
                { playerId: 'player1', card: { suit: 'Clubs', rank: 'K', value: 13 } }, // Lead suit
                { playerId: 'player2', card: { suit: 'Diamonds', rank: 'A', value: 14 } }, // Off-suit
                { playerId: 'player3', card: { suit: 'Spades', rank: 'A', value: 14 } }, // Off-suit
                { playerId: 'player4', card: { suit: 'Clubs', rank: '7', value: 7 } } // Lead suit
            ];
            
            const winner = gameEngine.determineTrickWinner(cardsPlayed, 'Hearts');
            
            // Highest card of lead suit should win (not off-suit aces)
            expect(winner.winningPlayerId).toBe('player1');
            expect(winner.winningCard.suit).toBe('Clubs');
            expect(winner.winningCard.rank).toBe('K');
        });

        it('should throw error for incomplete tricks', () => {
            const incompleteCardsPlayed = [
                { playerId: 'player1', card: { suit: 'Clubs', rank: 'K', value: 13 } },
                { playerId: 'player2', card: { suit: 'Clubs', rank: 'A', value: 14 } }
            ];
            
            expect(() => {
                gameEngine.determineTrickWinner(incompleteCardsPlayed, 'Hearts');
            }).toThrow('Trick must have exactly 4 cards to determine winner');
        });
    });

    describe('Scoring System and Crown Rule', () => {
        it('should calculate round scores correctly - declaring team makes contract', () => {
            const teamTricks = {
                declaringTeamTricks: 6,
                challengingTeamTricks: 2,
                declaringTeamId: 'team1'
            };
            
            const scores = gameEngine.calculateRoundScores(teamTricks);
            
            expect(scores.declaringTeamScore).toBe(6);
            expect(scores.challengingTeamScore).toBe(0); // Less than 4 tricks
            expect(scores.declaringTeamMadeContract).toBe(true);
            expect(scores.challengingTeamMadeContract).toBe(false);
        });

        it('should calculate round scores correctly - challenging team makes contract', () => {
            const teamTricks = {
                declaringTeamTricks: 4,
                challengingTeamTricks: 4,
                declaringTeamId: 'team1'
            };
            
            const scores = gameEngine.calculateRoundScores(teamTricks);
            
            expect(scores.declaringTeamScore).toBe(0); // Less than 5 tricks
            expect(scores.challengingTeamScore).toBe(4);
            expect(scores.declaringTeamMadeContract).toBe(false);
            expect(scores.challengingTeamMadeContract).toBe(true);
        });

        it('should calculate round scores correctly - both teams make contract', () => {
            const teamTricks = {
                declaringTeamTricks: 5,
                challengingTeamTricks: 3,
                declaringTeamId: 'team1'
            };
            
            const scores = gameEngine.calculateRoundScores(teamTricks);
            
            expect(scores.declaringTeamScore).toBe(5);
            expect(scores.challengingTeamScore).toBe(0); // Less than 4 tricks
            expect(scores.declaringTeamMadeContract).toBe(true);
            expect(scores.challengingTeamMadeContract).toBe(false);
        });

        it('should calculate round scores correctly - neither team makes contract', () => {
            const teamTricks = {
                declaringTeamTricks: 3,
                challengingTeamTricks: 5,
                declaringTeamId: 'team1'
            };
            
            const scores = gameEngine.calculateRoundScores(teamTricks);
            
            expect(scores.declaringTeamScore).toBe(0); // Less than 5 tricks
            expect(scores.challengingTeamScore).toBe(5); // 5 tricks (more than 4)
            expect(scores.declaringTeamMadeContract).toBe(false);
            expect(scores.challengingTeamMadeContract).toBe(true);
        });

        it('should handle edge case - exactly minimum tricks', () => {
            const teamTricks = {
                declaringTeamTricks: 5, // Exactly minimum for declaring team
                challengingTeamTricks: 3, // Less than minimum for challenging team
                declaringTeamId: 'team1'
            };
            
            const scores = gameEngine.calculateRoundScores(teamTricks);
            
            expect(scores.declaringTeamScore).toBe(5);
            expect(scores.challengingTeamScore).toBe(0);
            expect(scores.declaringTeamMadeContract).toBe(true);
            expect(scores.challengingTeamMadeContract).toBe(false);
        });
    });

    describe('Game Configuration', () => {
        it('should have correct suits defined', () => {
            expect(gameEngine.suits).toEqual(['Hearts', 'Diamonds', 'Clubs', 'Spades']);
        });

        it('should have correct ranks defined', () => {
            expect(gameEngine.ranks).toEqual(['7', '8', '9', '10', 'J', 'Q', 'K', 'A']);
        });

        it('should have correct card values mapping', () => {
            const expectedValues = {
                '7': 7, '8': 8, '9': 9, '10': 10,
                'J': 11, 'Q': 12, 'K': 13, 'A': 14
            };
            
            expect(gameEngine.cardValues).toEqual(expectedValues);
        });
    });

    describe('Deck Integrity', () => {
        it('should generate unique cards in deck', () => {
            const deck = gameEngine.generateDeck();
            
            // Create set of card identifiers
            const cardIds = deck.map(card => `${card.suit}-${card.rank}`);
            const uniqueCardIds = [...new Set(cardIds)];
            
            // Should have no duplicates
            expect(cardIds.length).toBe(uniqueCardIds.length);
            expect(uniqueCardIds.length).toBe(32);
        });

        it('should maintain deck integrity after shuffle', () => {
            const originalDeck = gameEngine.generateDeck();
            const shuffledDeck = gameEngine.shuffleDeck(originalDeck);
            
            // Should have same number of each suit
            for (const suit of gameEngine.suits) {
                const originalSuitCount = originalDeck.filter(card => card.suit === suit).length;
                const shuffledSuitCount = shuffledDeck.filter(card => card.suit === suit).length;
                expect(shuffledSuitCount).toBe(originalSuitCount);
                expect(shuffledSuitCount).toBe(8); // 8 cards per suit
            }
            
            // Should have same number of each rank
            for (const rank of gameEngine.ranks) {
                const originalRankCount = originalDeck.filter(card => card.rank === rank).length;
                const shuffledRankCount = shuffledDeck.filter(card => card.rank === rank).length;
                expect(shuffledRankCount).toBe(originalRankCount);
                expect(shuffledRankCount).toBe(4); // 4 cards per rank
            }
        });

        it('should not modify original deck when shuffling', () => {
            const originalDeck = gameEngine.generateDeck();
            const originalDeckCopy = JSON.parse(JSON.stringify(originalDeck));
            
            gameEngine.shuffleDeck(originalDeck);
            
            // Original deck should remain unchanged
            expect(originalDeck).toEqual(originalDeckCopy);
        });
    });
});