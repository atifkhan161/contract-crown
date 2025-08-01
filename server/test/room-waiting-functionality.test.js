/**
 * Test suite for Room model waiting room functionality
 * Tests the enhanced features added for waiting room implementation
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Room from '../src/models/Room.js';
import User from '../src/models/User.js';
import dbConnection from '../database/connection.js';

describe('Room Waiting Room Functionality', () => {
    let testRoom;
    let testUsers = [];

    beforeEach(async () => {
        // Create test users
        for (let i = 1; i <= 4; i++) {
            const user = await User.create({
                username: `testuser${i}`,
                email: `test${i}@example.com`,
                password: 'testpassword123'
            });
            testUsers.push(user);
        }

        // Create test room
        testRoom = await Room.create({
            name: 'Test Waiting Room',
            maxPlayers: 4,
            isPrivate: false,
            ownerId: testUsers[0].user_id
        });
    });

    afterEach(async () => {
        // Clean up test data
        if (testRoom) {
            await testRoom.delete();
        }
        
        for (const user of testUsers) {
            await User.delete(user.user_id);
        }
        
        testUsers = [];
        testRoom = null;
    });

    describe('Player Connection Status Management', () => {
        it('should set player connection status', async () => {
            const userId = testUsers[0].user_id;
            
            // Set player as disconnected
            await testRoom.setPlayerConnectionStatus(userId, false);
            
            const player = testRoom.players.find(p => p.id === userId);
            expect(player.isConnected).toBe(false);
            expect(testRoom.getConnectedPlayersCount()).toBe(0);
        });

        it('should track connected players count', async () => {
            // Add more players
            await testRoom.addPlayer(testUsers[1].user_id);
            await testRoom.addPlayer(testUsers[2].user_id);
            
            expect(testRoom.getConnectedPlayersCount()).toBe(3);
            
            // Disconnect one player
            await testRoom.setPlayerConnectionStatus(testUsers[1].user_id, false);
            expect(testRoom.getConnectedPlayersCount()).toBe(2);
        });
    });

    describe('Enhanced Ready Status Management', () => {
        it('should validate ready status for connected players only', async () => {
            const userId = testUsers[0].user_id;
            
            // Disconnect player
            await testRoom.setPlayerConnectionStatus(userId, false);
            
            // Try to set ready status for disconnected player
            await expect(testRoom.setPlayerReady(userId, true))
                .rejects.toThrow('Cannot set ready status for disconnected player');
        });

        it('should track ready players count', async () => {
            // Add more players
            await testRoom.addPlayer(testUsers[1].user_id);
            await testRoom.addPlayer(testUsers[2].user_id);
            
            // Set some players ready
            await testRoom.setPlayerReady(testUsers[0].user_id, true);
            await testRoom.setPlayerReady(testUsers[1].user_id, true);
            
            expect(testRoom.getReadyPlayersCount()).toBe(2);
        });

        it('should reset all player ready statuses', async () => {
            // Add players and set them ready
            await testRoom.addPlayer(testUsers[1].user_id);
            await testRoom.setPlayerReady(testUsers[0].user_id, true);
            await testRoom.setPlayerReady(testUsers[1].user_id, true);
            
            expect(testRoom.getReadyPlayersCount()).toBe(2);
            
            // Reset all ready statuses
            await testRoom.resetAllPlayerReadyStatus();
            
            expect(testRoom.getReadyPlayersCount()).toBe(0);
        });
    });

    describe('Enhanced Team Formation', () => {
        it('should form teams for different player counts', async () => {
            // Test with 2 players
            await testRoom.addPlayer(testUsers[1].user_id);
            
            const teams2 = await testRoom.formTeams();
            expect(teams2.team1).toHaveLength(1);
            expect(teams2.team2).toHaveLength(1);
            
            // Add more players for 4-player test
            await testRoom.addPlayer(testUsers[2].user_id);
            await testRoom.addPlayer(testUsers[3].user_id);
            
            const teams4 = await testRoom.formTeams();
            expect(teams4.team1).toHaveLength(2);
            expect(teams4.team2).toHaveLength(2);
        });

        it('should check if teams are formed', async () => {
            await testRoom.addPlayer(testUsers[1].user_id);
            
            expect(testRoom.areTeamsFormed()).toBe(false);
            
            await testRoom.formTeams();
            expect(testRoom.areTeamsFormed()).toBe(true);
        });

        it('should get team balance information', async () => {
            await testRoom.addPlayer(testUsers[1].user_id);
            await testRoom.addPlayer(testUsers[2].user_id);
            await testRoom.formTeams();
            
            const balance = testRoom.getTeamBalance();
            expect(balance.isBalanced).toBe(true);
            expect(balance.totalAssigned).toBe(3);
        });

        it('should clear team assignments', async () => {
            await testRoom.addPlayer(testUsers[1].user_id);
            await testRoom.formTeams();
            
            expect(testRoom.areTeamsFormed()).toBe(true);
            
            await testRoom.clearTeamAssignments();
            expect(testRoom.areTeamsFormed()).toBe(false);
        });
    });

    describe('Game Start Validation', () => {
        it('should provide detailed game start eligibility', async () => {
            const eligibility = testRoom.getGameStartEligibility();
            
            expect(eligibility).toHaveProperty('canStartGame');
            expect(eligibility).toHaveProperty('reason');
            expect(eligibility).toHaveProperty('readyCount');
            expect(eligibility).toHaveProperty('totalConnected');
            expect(eligibility).toHaveProperty('connectedPlayers');
        });

        it('should validate game start conditions', async () => {
            // Not enough players
            let validation = testRoom.validateGameStart();
            expect(validation.isValid).toBe(false);
            expect(validation.errors).toContain('All connected players must be ready to start game');
            
            // Add player and set ready
            await testRoom.addPlayer(testUsers[1].user_id);
            await testRoom.setPlayerReady(testUsers[0].user_id, true);
            await testRoom.setPlayerReady(testUsers[1].user_id, true);
            
            validation = testRoom.validateGameStart();
            expect(validation.isValid).toBe(true);
        });

        it('should prepare room for game start', async () => {
            // Add players and set them ready
            await testRoom.addPlayer(testUsers[1].user_id);
            await testRoom.setPlayerReady(testUsers[0].user_id, true);
            await testRoom.setPlayerReady(testUsers[1].user_id, true);
            
            const preparation = await testRoom.prepareForGameStart();
            
            expect(preparation.success).toBe(true);
            expect(preparation.teams).toBeDefined();
            expect(preparation.players).toHaveLength(2);
            expect(testRoom.status).toBe('playing');
        });
    });

    describe('Host Management', () => {
        it('should check if player is host', async () => {
            expect(testRoom.isPlayerHost(testUsers[0].user_id)).toBe(true);
            expect(testRoom.isPlayerHost(testUsers[1].user_id)).toBe(false);
        });

        it('should transfer host privileges', async () => {
            await testRoom.addPlayer(testUsers[1].user_id);
            
            await testRoom.transferHost(testUsers[1].user_id);
            
            expect(testRoom.isPlayerHost(testUsers[1].user_id)).toBe(true);
            expect(testRoom.isPlayerHost(testUsers[0].user_id)).toBe(false);
        });

        it('should auto-transfer host when host leaves', async () => {
            await testRoom.addPlayer(testUsers[1].user_id);
            await testRoom.addPlayer(testUsers[2].user_id);
            
            const originalHostId = testRoom.owner_id;
            
            // Remove the host
            await testRoom.removePlayer(originalHostId);
            
            // Host should be transferred to remaining connected player
            expect(testRoom.owner_id).not.toBe(originalHostId);
            expect(testRoom.players.some(p => p.id === testRoom.owner_id)).toBe(true);
        });
    });

    describe('Waiting Room State', () => {
        it('should provide comprehensive waiting room state', async () => {
            await testRoom.addPlayer(testUsers[1].user_id);
            await testRoom.setPlayerReady(testUsers[0].user_id, true);
            
            const state = testRoom.getWaitingRoomState();
            
            expect(state).toHaveProperty('roomId');
            expect(state).toHaveProperty('players');
            expect(state).toHaveProperty('teams');
            expect(state).toHaveProperty('gameStartInfo');
            expect(state).toHaveProperty('teamBalance');
            expect(state).toHaveProperty('version');
            expect(state.players).toHaveLength(2);
        });

        it('should provide enhanced API response', async () => {
            await testRoom.addPlayer(testUsers[1].user_id);
            
            const response = testRoom.toApiResponse();
            
            expect(response).toHaveProperty('teams');
            expect(response).toHaveProperty('gameStartInfo');
            expect(response).toHaveProperty('version');
            expect(response).toHaveProperty('connectedPlayersCount');
            expect(response).toHaveProperty('readyPlayersCount');
        });
    });
});