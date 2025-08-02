import { describe, it, expect, beforeEach, vi } from 'vitest';
import BotPlayer from '../src/services/BotPlayer.js';
import BotAI from '../src/services/BotAI.js';

describe('BotAI', () => {
    let bot;
    let botAI;

    beforeEach(() => {
        bot = new BotPlayer({ personality: 'balanced', difficulty: 'medium' });
        botAI = new BotAI(bot);
    });

    describe('analyzeSuitStrength', () => {
        it('should analyze suit strength correctly', () => {
            const hand = [
                { suit: 'Hearts', rank: 'A', value: 14 },
                { suit: 'Hearts', rank: 'K', value: 13 },
                { suit: 'Spades', rank: 'Q', value: 12 },
                { suit: 'Diamonds', rank: '7', value: 7 }
            ];

            const analysis = botAI.analyzeSuitStrength(hand);

            // Hearts should be strongest (2 cards, Ace and King)
            expect(analysis.Hearts.cardCount).toBe(2);
            expect(analysis.Hearts.hasAce).toBe(true);
            expect(analysis.Hearts.hasKing).toBe(true);
            expect(analysis.Hearts.strength).toBeGreaterThan(analysis.Spades.strength);
            expect(analysis.Hearts.strength).toBeGreaterThan(analysis.Diamonds.strength);

            // Spades should have one card
            expect(analysis.Spades.cardCount).toBe(1);
            expect(analysis.Spades.hasHighCards).toBe(true);

            // Clubs should have no cards
            expect(analysis.Clubs.cardCount).toBe(0);
            expect(analysis.Clubs.strength).toBe(0);
        });

        it('should handle empty hand gracefully', () => {
            const analysis = botAI.analyzeSuitStrength([]);
            
            botAI.suits.forEach(suit => {
                expect(analysis[suit].cardCount).toBe(0);
                expect(analysis[suit].strength).toBe(0);
            });
        });
    });

    describe('declareTrump', () => {
        it('should return a valid trump suit', async () => {
            const hand = [
                { suit: 'Hearts', rank: 'A', value: 14 },
                { suit: 'Spades', rank: 'K', value: 13 },
                { suit: 'Diamonds', rank: 'Q', value: 12 },
                { suit: 'Clubs', rank: 'J', value: 11 }
            ];

            // Mock the delay to speed up tests
            vi.spyOn(botAI, 'simulateDecisionDelay').mockResolvedValue();

            const trumpSuit = await botAI.declareTrump(hand);
            
            expect(botAI.suits).toContain(trumpSuit);
        });
    });

    describe('getValidCards', () => {
        it('should return all cards when leading', () => {
            const hand = [
                { suit: 'Hearts', rank: 'A', value: 14 },
                { suit: 'Spades', rank: 'K', value: 13 },
                { suit: 'Diamonds', rank: 'Q', value: 12 }
            ];
            const trickState = { cardsPlayed: [], trumpSuit: 'Hearts' };

            const validCards = botAI.getValidCards(hand, trickState);
            expect(validCards).toEqual(hand);
        });

        it('should return only lead suit cards when must follow suit', () => {
            const hand = [
                { suit: 'Hearts', rank: 'A', value: 14 },
                { suit: 'Hearts', rank: '8', value: 8 },
                { suit: 'Spades', rank: 'K', value: 13 },
                { suit: 'Diamonds', rank: 'Q', value: 12 }
            ];
            const trickState = {
                cardsPlayed: [
                    { playerId: 'player1', card: { suit: 'Hearts', rank: '7', value: 7 } }
                ],
                trumpSuit: 'Spades'
            };

            const validCards = botAI.getValidCards(hand, trickState);
            expect(validCards).toHaveLength(2);
            expect(validCards.every(card => card.suit === 'Hearts')).toBe(true);
        });

        it('should return all cards when cannot follow suit', () => {
            const hand = [
                { suit: 'Spades', rank: 'K', value: 13 },
                { suit: 'Diamonds', rank: 'Q', value: 12 },
                { suit: 'Clubs', rank: 'J', value: 11 }
            ];
            const trickState = {
                cardsPlayed: [
                    { playerId: 'player1', card: { suit: 'Hearts', rank: '7', value: 7 } }
                ],
                trumpSuit: 'Spades'
            };

            const validCards = botAI.getValidCards(hand, trickState);
            expect(validCards).toEqual(hand);
        });
    });

    describe('playCard', () => {
        it('should return a valid card', async () => {
            const gameContext = {
                hand: [
                    { suit: 'Hearts', rank: 'A', value: 14 },
                    { suit: 'Spades', rank: 'K', value: 13 }
                ],
                trickState: {
                    cardsPlayed: [],
                    trumpSuit: 'Hearts'
                },
                gameState: {
                    declaringTeamId: 'team1',
                    challengingTeamId: 'team2'
                }
            };

            // Mock the delay
            vi.spyOn(botAI, 'simulateDecisionDelay').mockResolvedValue();

            const chosenCard = await botAI.playCard(gameContext);
            expect(gameContext.hand).toContainEqual(chosenCard);
        });

        it('should handle single valid card', async () => {
            const gameContext = {
                hand: [
                    { suit: 'Hearts', rank: 'A', value: 14 },
                    { suit: 'Spades', rank: 'K', value: 13 }
                ],
                trickState: {
                    cardsPlayed: [
                        { playerId: 'player1', card: { suit: 'Hearts', rank: '7', value: 7 } }
                    ],
                    trumpSuit: 'Spades'
                },
                gameState: {}
            };

            // Mock the delay
            vi.spyOn(botAI, 'simulateDecisionDelay').mockResolvedValue();

            const chosenCard = await botAI.playCard(gameContext);
            expect(chosenCard.suit).toBe('Hearts'); // Must follow suit
        });
    });
});

describe('BotPlayer Card Play Integration', () => {
    let bot;

    beforeEach(() => {
        bot = new BotPlayer({ personality: 'aggressive' });
    });

    describe('playCard', () => {
        it('should use AI to play card', async () => {
            const hand = [
                { suit: 'Hearts', rank: 'A', value: 14 },
                { suit: 'Spades', rank: 'K', value: 13 }
            ];
            bot.updateHand(hand);

            const gameContext = {
                trickState: {
                    cardsPlayed: [],
                    trumpSuit: 'Hearts'
                },
                gameState: {}
            };

            // Mock the AI delay
            vi.spyOn(bot.ai, 'simulateDecisionDelay').mockResolvedValue();

            const chosenCard = await bot.playCard(gameContext);
            expect(hand).toContainEqual(chosenCard);
        });

        it('should throw error when no cards available', async () => {
            const gameContext = {
                hand: [],
                trickState: { cardsPlayed: [], trumpSuit: 'Hearts' },
                gameState: {}
            };

            await expect(bot.playCard(gameContext)).rejects.toThrow('No cards available to play');
        });
    });
});