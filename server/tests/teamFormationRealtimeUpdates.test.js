import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createServer } from 'http';
import { Server } from 'socket.io';
import Client from 'socket.io-client';
import SocketManager from '../websocket/socketManager.js';
import dbConnection from '../database/connection.js';

describe('Team Formation Real-time Updates', () => {
    let httpServer;
    let io;
    let socketManager;
    let clientSocket1, clientSocket2, clientSocket3, clientSocket4;
    let gameId;

    beforeEach(async () => {
        // Create HTTP server and Socket.IO instance
        httpServer = createServer();
        io = new Server(httpServer, {
            cors: {
                origin: "*",
                methods: ["GET", "POST"]
            }
        });

        // Initialize socket manager
        socketManager = new SocketManager(io);

        // Start server
        await new Promise((resolve) => {
            httpServer.listen(0, resolve);
        });

        const port = httpServer.address().port;
        gameId = `test-game-${Date.now()}`;

        // Create client connections
        clientSocket1 = new Client(`http://localhost:${port}`, {
            auth: { token: 'mock-jwt-token-1' }
        });
        clientSocket2 = new Client(`http://localhost:${port}`, {
            auth: { token: 'mock-jwt-token-2' }
        });
        clientSocket3 = new Client(`http://localhost:${port}`, {
            auth: { token: 'mock-jwt-token-3' }
        });
        clientSocket4 = new Client(`http://localhost:${port}`, {
            auth: { token: 'mock-jwt-token-4' }
        });

        // Wait for connections
        await Promise.all([
            new Promise(resolve => clientSocket1.on('connect', resolve)),
            new Promise(resolve => clientSocket2.on('connect', resolve)),
            new Promise(resolve => clientSocket3.on('connect', resolve)),
            new Promise(resolve => clientSocket4.on('connect', resolve))
        ]);

        // Mock authentication for all sockets
        clientSocket1.userId = 'user1';
        clientSocket1.username = 'Player1';
        clientSocket2.userId = 'user2';
        clientSocket2.username = 'Player2';
        clientSocket3.userId = 'user3';
        clientSocket3.username = 'Player3';
        clientSocket4.userId = 'user4';
        clientSocket4.username = 'Player4';

        // Have all players join the room
        await Promise.all([
            new Promise(resolve => {
                clientSocket1.emit('join-game-room', { gameId, userId: 'user1', username: 'Player1' });
                clientSocket1.on('room-joined', resolve);
            }),
            new Promise(resolve => {
                clientSocket2.emit('join-game-room', { gameId, userId: 'user2', username: 'Player2' });
                clientSocket2.on('room-joined', resolve);
            }),
            new Promise(resolve => {
                clientSocket3.emit('join-game-room', { gameId, userId: 'user3', username: 'Player3' });
                clientSocket3.on('room-joined', resolve);
            }),
            new Promise(resolve => {
                clientSocket4.emit('join-game-room', { gameId, userId: 'user4', username: 'Player4' });
                clientSocket4.on('room-joined', resolve);
            })
        ]);

        // Clean up database before each test
        try {
            await dbConnection.query('DELETE FROM room_players WHERE room_id = ?', [gameId]);
            await dbConnection.query('DELETE FROM rooms WHERE room_id = ?', [gameId]);
        } catch (error) {
            // Ignore cleanup errors
        }

        // Create room in database
        await dbConnection.query(`
            INSERT INTO rooms (room_id, owner_id, status, created_at) 
            VALUES (?, 'user1', 'waiting', NOW())
        `, [gameId]);

        // Add players to database
        for (let i = 1; i <= 4; i++) {
            await dbConnection.query(`
                INSERT INTO room_players (room_id, user_id, is_ready, team_assignment) 
                VALUES (?, ?, FALSE, NULL)
            `, [gameId, `user${i}`]);
        }
    });

    afterEach(async () => {
        // Clean up database
        try {
            await dbConnection.query('DELETE FROM room_players WHERE room_id = ?', [gameId]);
            await dbConnection.query('DELETE FROM rooms WHERE room_id = ?', [gameId]);
        } catch (error) {
            // Ignore cleanup errors
        }

        // Close client connections
        clientSocket1?.disconnect();
        clientSocket2?.disconnect();
        clientSocket3?.disconnect();
        clientSocket4?.disconnect();

        // Close server
        io?.close();
        httpServer?.close();
    });

    describe('Team Formation Broadcasting', () => {
        it('should broadcast team formation to all players in real-time', async () => {
            const teamFormationPromises = [
                new Promise(resolve => clientSocket2.on('teams-formed', resolve)),
                new Promise(resolve => clientSocket3.on('teams-formed', resolve)),
                new Promise(resolve => clientSocket4.on('teams-formed', resolve))
            ];

            // Host forms teams
            clientSocket1.emit('form-teams', { gameId });

            // Wait for all players to receive team formation event
            const teamEvents = await Promise.all(teamFormationPromises);

            // Verify all events have correct structure
            teamEvents.forEach(event => {
                expect(event.gameId).toBe(gameId);
                expect(event.teams.team1).toHaveLength(2);
                expect(event.teams.team2).toHaveLength(2);
                expect(event.formedBy).toBe('Player1');
                expect(event.players).toHaveLength(4);
                expect(event.timestamp).toBeDefined();
                
                // Verify all players have team assignments
                event.players.forEach(player => {
                    expect(player.teamAssignment).toBeOneOf([1, 2]);
                });
            });
        });

        it('should persist team assignments to database', async () => {
            // Form teams
            await new Promise(resolve => {
                clientSocket1.emit('form-teams', { gameId });
                clientSocket1.on('teams-formed', resolve);
            });

            // Verify database persistence
            const [rows] = await dbConnection.query(`
                SELECT user_id, team_assignment FROM room_players 
                WHERE room_id = ? ORDER BY user_id
            `, [gameId]);

            expect(rows).toHaveLength(4);
            
            // Verify all players have team assignments
            rows.forEach(row => {
                expect(row.team_assignment).toBeOneOf([1, 2]);
            });

            // Verify teams are balanced (2 players each)
            const team1Count = rows.filter(r => r.team_assignment === 1).length;
            const team2Count = rows.filter(r => r.team_assignment === 2).length;
            expect(team1Count).toBe(2);
            expect(team2Count).toBe(2);
        });

        it('should sync websocket state with database state', async () => {
            // Form teams
            const teamEvent = await new Promise(resolve => {
                clientSocket1.emit('form-teams', { gameId });
                clientSocket1.on('teams-formed', resolve);
            });

            // Get websocket room state
            const room = socketManager.gameRooms.get(gameId);
            expect(room).toBeDefined();

            // Verify websocket state matches database
            const [dbRows] = await dbConnection.query(`
                SELECT user_id, team_assignment FROM room_players 
                WHERE room_id = ? ORDER BY user_id
            `, [gameId]);

            // Check each player's team assignment matches
            dbRows.forEach(dbRow => {
                const wsPlayer = room.players.get(dbRow.user_id);
                expect(wsPlayer).toBeDefined();
                expect(wsPlayer.teamAssignment).toBe(dbRow.team_assignment);
            });

            // Verify team structure
            expect(room.teams.team1).toHaveLength(2);
            expect(room.teams.team2).toHaveLength(2);
        });
    });

    describe('Player Reconnection with Team Assignment Restoration', () => {
        it('should restore team assignment when player reconnects', async () => {
            // Form teams first
            await new Promise(resolve => {
                clientSocket1.emit('form-teams', { gameId });
                clientSocket1.on('teams-formed', resolve);
            });

            // Get player 2's team assignment before disconnection
            const [beforeRows] = await dbConnection.query(`
                SELECT team_assignment FROM room_players 
                WHERE room_id = ? AND user_id = 'user2'
            `, [gameId]);
            const originalTeamAssignment = beforeRows[0].team_assignment;

            // Disconnect player 2
            clientSocket2.disconnect();
            await new Promise(resolve => setTimeout(resolve, 100));

            // Reconnect player 2
            clientSocket2 = new Client(`http://localhost:${httpServer.address().port}`, {
                auth: { token: 'mock-jwt-token-2' }
            });
            
            await new Promise(resolve => clientSocket2.on('connect', resolve));
            clientSocket2.userId = 'user2';
            clientSocket2.username = 'Player2';

            // Rejoin room and wait for reconnection event
            const reconnectionEvent = await new Promise(resolve => {
                clientSocket1.on('player-reconnected', resolve);
                clientSocket2.emit('join-game-room', { gameId, userId: 'user2', username: 'Player2' });
            });

            // Verify team assignment was restored
            expect(reconnectionEvent.gameId).toBe(gameId);
            expect(reconnectionEvent.playerId).toBe('user2');
            
            const reconnectedPlayer = reconnectionEvent.players.find(p => p.userId === 'user2');
            expect(reconnectedPlayer.teamAssignment).toBe(originalTeamAssignment);
            
            // Verify teams structure is intact
            expect(reconnectionEvent.teams.team1).toHaveLength(2);
            expect(reconnectionEvent.teams.team2).toHaveLength(2);
        });

        it('should handle multiple player disconnections and reconnections', async () => {
            // Form teams first
            await new Promise(resolve => {
                clientSocket1.emit('form-teams', { gameId });
                clientSocket1.on('teams-formed', resolve);
            });

            // Store original team assignments
            const [originalRows] = await dbConnection.query(`
                SELECT user_id, team_assignment FROM room_players 
                WHERE room_id = ? ORDER BY user_id
            `, [gameId]);
            const originalAssignments = {};
            originalRows.forEach(row => {
                originalAssignments[row.user_id] = row.team_assignment;
            });

            // Disconnect players 2 and 3
            clientSocket2.disconnect();
            clientSocket3.disconnect();
            await new Promise(resolve => setTimeout(resolve, 100));

            // Reconnect both players
            clientSocket2 = new Client(`http://localhost:${httpServer.address().port}`, {
                auth: { token: 'mock-jwt-token-2' }
            });
            clientSocket3 = new Client(`http://localhost:${httpServer.address().port}`, {
                auth: { token: 'mock-jwt-token-3' }
            });

            await Promise.all([
                new Promise(resolve => clientSocket2.on('connect', resolve)),
                new Promise(resolve => clientSocket3.on('connect', resolve))
            ]);

            clientSocket2.userId = 'user2';
            clientSocket2.username = 'Player2';
            clientSocket3.userId = 'user3';
            clientSocket3.username = 'Player3';

            // Rejoin room for both players
            const reconnectionPromises = [
                new Promise(resolve => clientSocket1.on('player-reconnected', resolve)),
                new Promise(resolve => clientSocket4.on('player-reconnected', resolve))
            ];

            clientSocket2.emit('join-game-room', { gameId, userId: 'user2', username: 'Player2' });
            await new Promise(resolve => setTimeout(resolve, 50));
            clientSocket3.emit('join-game-room', { gameId, userId: 'user3', username: 'Player3' });

            // Wait for reconnection events
            const reconnectionEvents = await Promise.all(reconnectionPromises);

            // Verify both players have their original team assignments restored
            reconnectionEvents.forEach(event => {
                const reconnectedPlayer = event.players.find(p => p.userId === event.playerId);
                expect(reconnectedPlayer.teamAssignment).toBe(originalAssignments[event.playerId]);
            });

            // Verify final room state has all players with correct assignments
            const room = socketManager.gameRooms.get(gameId);
            expect(room.teams.team1).toHaveLength(2);
            expect(room.teams.team2).toHaveLength(2);
        });
    });

    describe('Team Formation Error Handling', () => {
        it('should handle database errors gracefully during team formation', async () => {
            // Mock database error
            const originalQuery = dbConnection.query;
            dbConnection.query = vi.fn().mockImplementation((sql, params) => {
                if (sql.includes('UPDATE room_players SET team_assignment')) {
                    throw new Error('Database connection failed');
                }
                return originalQuery.call(dbConnection, sql, params);
            });

            // Attempt to form teams
            const errorPromise = new Promise(resolve => {
                clientSocket1.on('error', resolve);
            });

            clientSocket1.emit('form-teams', { gameId });
            const errorEvent = await errorPromise;

            expect(errorEvent.message).toContain('Failed to persist team assignments');

            // Verify websocket state was reverted
            const room = socketManager.gameRooms.get(gameId);
            expect(room.teams.team1).toHaveLength(0);
            expect(room.teams.team2).toHaveLength(0);
            
            room.players.forEach(player => {
                expect(player.teamAssignment).toBeNull();
            });

            // Restore original query function
            dbConnection.query = originalQuery;
        });

        it('should only allow host to form teams', async () => {
            const errorPromise = new Promise(resolve => {
                clientSocket2.on('error', resolve);
            });

            // Non-host tries to form teams
            clientSocket2.emit('form-teams', { gameId });
            const errorEvent = await errorPromise;

            expect(errorEvent.message).toBe('Only the host can form teams');
        });

        it('should require minimum players for team formation', async () => {
            // Create a new room with only 1 player
            const smallGameId = `small-game-${Date.now()}`;
            
            await dbConnection.query(`
                INSERT INTO rooms (room_id, owner_id, status, created_at) 
                VALUES (?, 'user1', 'waiting', NOW())
            `, [smallGameId]);

            await dbConnection.query(`
                INSERT INTO room_players (room_id, user_id, is_ready, team_assignment) 
                VALUES (?, 'user1', FALSE, NULL)
            `, [smallGameId]);

            // Join small room
            await new Promise(resolve => {
                clientSocket1.emit('join-game-room', { gameId: smallGameId, userId: 'user1', username: 'Player1' });
                clientSocket1.on('room-joined', resolve);
            });

            const errorPromise = new Promise(resolve => {
                clientSocket1.on('error', resolve);
            });

            // Try to form teams with insufficient players
            clientSocket1.emit('form-teams', { gameId: smallGameId });
            const errorEvent = await errorPromise;

            expect(errorEvent.message).toBe('Need at least 2 players to form teams');

            // Cleanup
            await dbConnection.query('DELETE FROM room_players WHERE room_id = ?', [smallGameId]);
            await dbConnection.query('DELETE FROM rooms WHERE room_id = ?', [smallGameId]);
        });
    });

    describe('Team Formation State Consistency', () => {
        it('should maintain consistent state across multiple team formations', async () => {
            // Form teams multiple times
            for (let i = 0; i < 3; i++) {
                await new Promise(resolve => {
                    clientSocket1.emit('form-teams', { gameId });
                    clientSocket1.on('teams-formed', resolve);
                });

                // Verify state consistency after each formation
                const room = socketManager.gameRooms.get(gameId);
                expect(room.teams.team1).toHaveLength(2);
                expect(room.teams.team2).toHaveLength(2);

                // Verify database consistency
                const [dbRows] = await dbConnection.query(`
                    SELECT user_id, team_assignment FROM room_players 
                    WHERE room_id = ? ORDER BY user_id
                `, [gameId]);

                expect(dbRows).toHaveLength(4);
                const team1Count = dbRows.filter(r => r.team_assignment === 1).length;
                const team2Count = dbRows.filter(r => r.team_assignment === 2).length;
                expect(team1Count).toBe(2);
                expect(team2Count).toBe(2);
            }
        });

        it('should handle concurrent team formation requests', async () => {
            // Send multiple concurrent team formation requests
            const promises = [
                new Promise(resolve => {
                    clientSocket1.emit('form-teams', { gameId });
                    clientSocket1.on('teams-formed', resolve);
                }),
                new Promise(resolve => {
                    clientSocket1.emit('form-teams', { gameId });
                    clientSocket1.on('error', resolve);
                })
            ];

            const results = await Promise.all(promises);
            
            // One should succeed, others should be handled gracefully
            const successCount = results.filter(r => r.teams).length;
            expect(successCount).toBeGreaterThanOrEqual(1);

            // Final state should be consistent
            const room = socketManager.gameRooms.get(gameId);
            expect(room.teams.team1).toHaveLength(2);
            expect(room.teams.team2).toHaveLength(2);
        });
    });
});