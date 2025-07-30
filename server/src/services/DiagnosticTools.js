/**
 * Diagnostic Tools
 * Advanced diagnostic utilities for troubleshooting lobby issues,
 * connection problems, and state synchronization failures
 */

class DiagnosticTools {
    constructor(socketManager, connectionStatusManager, monitoringService) {
        this.socketManager = socketManager;
        this.connectionStatusManager = connectionStatusManager;
        this.monitoringService = monitoringService;

        // Diagnostic configuration
        this.config = {
            maxDiagnosticHistory: 50,
            connectionTestTimeout: 10000,
            stateValidationTimeout: 5000
        };

        // Diagnostic history
        this.diagnosticHistory = new Map(); // diagnosticId -> diagnostic result
        this.diagnosticCounter = 0;
    }

    /**
     * Run comprehensive lobby diagnostics
     */
    async runLobbyDiagnostics(gameId) {
        const diagnosticId = this.generateDiagnosticId();
        const startTime = Date.now();

        console.log(`[Diagnostics] Starting comprehensive lobby diagnostics for room ${gameId} (ID: ${diagnosticId})`);

        const diagnostic = {
            id: diagnosticId,
            gameId,
            startTime,
            tests: {},
            summary: {},
            recommendations: []
        };

        try {
            // Test 1: Room existence and basic structure
            diagnostic.tests.roomExistence = await this.testRoomExistence(gameId);

            // Test 2: Player connection status
            diagnostic.tests.playerConnections = await this.testPlayerConnections(gameId);

            // Test 3: State consistency
            diagnostic.tests.stateConsistency = await this.testStateConsistency(gameId);

            // Test 4: Websocket health
            diagnostic.tests.websocketHealth = await this.testWebsocketHealth(gameId);

            // Test 5: Database synchronization
            diagnostic.tests.databaseSync = await this.testDatabaseSynchronization(gameId);

            // Test 6: Performance metrics
            diagnostic.tests.performance = await this.testPerformanceMetrics(gameId);

            // Generate summary and recommendations
            diagnostic.summary = this.generateDiagnosticSummary(diagnostic.tests);
            diagnostic.recommendations = this.generateRecommendations(diagnostic.tests);

            diagnostic.endTime = Date.now();
            diagnostic.duration = diagnostic.endTime - diagnostic.startTime;
            diagnostic.status = 'completed';

            console.log(`[Diagnostics] Completed lobby diagnostics for room ${gameId} in ${diagnostic.duration}ms`);

        } catch (error) {
            diagnostic.error = {
                message: error.message,
                stack: error.stack
            };
            diagnostic.status = 'failed';
            diagnostic.endTime = Date.now();
            diagnostic.duration = diagnostic.endTime - diagnostic.startTime;

            console.error(`[Diagnostics] Failed lobby diagnostics for room ${gameId}:`, error);
        }

        // Store diagnostic result
        this.storeDiagnosticResult(diagnosticId, diagnostic);

        return diagnostic;
    }

    /**
     * Test room existence and basic structure
     */
    async testRoomExistence(gameId) {
        const test = {
            name: 'Room Existence',
            status: 'running',
            startTime: Date.now()
        };

        try {
            const room = this.socketManager.gameRooms.get(gameId);

            if (!room) {
                test.status = 'failed';
                test.error = 'Room not found in websocket manager';
                test.severity = 'critical';
            } else {
                test.status = 'passed';
                test.data = {
                    gameId: room.gameId,
                    playerCount: room.players.size,
                    status: room.status,
                    hostId: room.hostId,
                    createdAt: room.createdAt,
                    hasTeams: !!(room.teams && (room.teams.team1.length > 0 || room.teams.team2.length > 0))
                };
            }
        } catch (error) {
            test.status = 'error';
            test.error = error.message;
            test.severity = 'critical';
        }

        test.endTime = Date.now();
        test.duration = test.endTime - test.startTime;
        return test;
    }

    /**
     * Test player connection status
     */
    async testPlayerConnections(gameId) {
        const test = {
            name: 'Player Connections',
            status: 'running',
            startTime: Date.now()
        };

        try {
            const room = this.socketManager.gameRooms.get(gameId);
            if (!room) {
                test.status = 'skipped';
                test.reason = 'Room not found';
                test.endTime = Date.now();
                test.duration = test.endTime - test.startTime;
                return test;
            }

            const playerTests = [];
            let connectedCount = 0;
            let healthyCount = 0;
            let issues = [];

            for (const [playerId, player] of room.players) {
                const playerTest = {
                    playerId,
                    username: player.username,
                    isConnected: player.isConnected,
                    socketId: player.socketId,
                    issues: []
                };

                if (player.isConnected) {
                    connectedCount++;

                    // Check if socket actually exists
                    const socket = player.socketId ? this.socketManager.io.sockets.sockets.get(player.socketId) : null;
                    if (!socket) {
                        playerTest.issues.push('Socket not found despite connected status');
                        issues.push(`Player ${player.username} marked as connected but socket not found`);
                    } else {
                        // Check socket health
                        const health = this.connectionStatusManager.getConnectionHealth(player.socketId);
                        if (health) {
                            playerTest.health = health;
                            if (health.isHealthy !== false) {
                                healthyCount++;
                            } else {
                                playerTest.issues.push('Connection health issues detected');
                            }
                        } else {
                            playerTest.issues.push('No health data available');
                        }
                    }
                } else {
                    // Check if player should be cleaned up
                    if (player.disconnectedAt) {
                        const disconnectedTime = Date.now() - new Date(player.disconnectedAt).getTime();
                        if (disconnectedTime > 600000) { // 10 minutes
                            playerTest.issues.push('Player disconnected for too long, should be cleaned up');
                            issues.push(`Player ${player.username} disconnected for ${Math.round(disconnectedTime / 60000)} minutes`);
                        }
                    }
                }

                playerTests.push(playerTest);
            }

            test.status = issues.length === 0 ? 'passed' : 'warning';
            test.data = {
                totalPlayers: room.players.size,
                connectedPlayers: connectedCount,
                healthyPlayers: healthyCount,
                playerTests,
                issues
            };

            if (issues.length > 0) {
                test.severity = 'medium';
            }

        } catch (error) {
            test.status = 'error';
            test.error = error.message;
            test.severity = 'high';
        }

        test.endTime = Date.now();
        test.duration = test.endTime - test.startTime;
        return test;
    }

    /**
     * Test state consistency between websocket and database
     */
    async testStateConsistency(gameId) {
        const test = {
            name: 'State Consistency',
            status: 'running',
            startTime: Date.now()
        };

        try {
            const room = this.socketManager.gameRooms.get(gameId);
            if (!room) {
                test.status = 'skipped';
                test.reason = 'Room not found';
                test.endTime = Date.now();
                test.duration = test.endTime - test.startTime;
                return test;
            }

            // Get database state
            const { default: Room } = await import('../models/Room.js');
            const dbRoom = await Room.findById(gameId);

            if (!dbRoom) {
                test.status = 'failed';
                test.error = 'Room not found in database';
                test.severity = 'critical';
                test.endTime = Date.now();
                test.duration = test.endTime - test.startTime;
                return test;
            }

            const inconsistencies = [];

            // Check host consistency
            if (String(room.hostId) !== String(dbRoom.owner_id)) {
                inconsistencies.push({
                    type: 'host_mismatch',
                    websocket: room.hostId,
                    database: dbRoom.owner_id
                });
            }

            // Check player consistency
            const wsPlayers = new Map(Array.from(room.players.entries()).map(([id, player]) => [String(id), player]));
            const dbPlayers = new Map(dbRoom.players.map(p => [String(p.id), p]));

            // Check for missing players
            for (const [playerId, dbPlayer] of dbPlayers) {
                if (!wsPlayers.has(playerId)) {
                    inconsistencies.push({
                        type: 'player_missing_in_websocket',
                        playerId,
                        player: dbPlayer
                    });
                }
            }

            // Check for extra players
            for (const [playerId, wsPlayer] of wsPlayers) {
                if (!dbPlayers.has(playerId)) {
                    inconsistencies.push({
                        type: 'player_missing_in_database',
                        playerId,
                        player: wsPlayer
                    });
                }
            }

            // Check player data consistency
            for (const [playerId, wsPlayer] of wsPlayers) {
                const dbPlayer = dbPlayers.get(playerId);
                if (dbPlayer) {
                    if (wsPlayer.isReady !== dbPlayer.isReady) {
                        inconsistencies.push({
                            type: 'ready_status_mismatch',
                            playerId,
                            websocket: wsPlayer.isReady,
                            database: dbPlayer.isReady
                        });
                    }

                    if (wsPlayer.teamAssignment !== dbPlayer.teamAssignment) {
                        inconsistencies.push({
                            type: 'team_assignment_mismatch',
                            playerId,
                            websocket: wsPlayer.teamAssignment,
                            database: dbPlayer.teamAssignment
                        });
                    }
                }
            }

            test.status = inconsistencies.length === 0 ? 'passed' : 'failed';
            test.data = {
                websocketPlayers: wsPlayers.size,
                databasePlayers: dbPlayers.size,
                inconsistencies
            };

            if (inconsistencies.length > 0) {
                test.severity = inconsistencies.some(i => i.type.includes('missing')) ? 'high' : 'medium';
            }

        } catch (error) {
            test.status = 'error';
            test.error = error.message;
            test.severity = 'high';
        }

        test.endTime = Date.now();
        test.duration = test.endTime - test.startTime;
        return test;
    }

    /**
     * Test websocket health for room players
     */
    async testWebsocketHealth(gameId) {
        const test = {
            name: 'Websocket Health',
            status: 'running',
            startTime: Date.now()
        };

        try {
            const room = this.socketManager.gameRooms.get(gameId);
            if (!room) {
                test.status = 'skipped';
                test.reason = 'Room not found';
                test.endTime = Date.now();
                test.duration = test.endTime - test.startTime;
                return test;
            }

            const healthTests = [];
            let healthyConnections = 0;
            let totalConnections = 0;
            const issues = [];

            for (const [playerId, player] of room.players) {
                if (player.isConnected && player.socketId) {
                    totalConnections++;

                    const socket = this.socketManager.io.sockets.sockets.get(player.socketId);
                    const healthTest = {
                        playerId,
                        username: player.username,
                        socketId: player.socketId,
                        connected: !!socket
                    };

                    if (socket) {
                        const health = this.connectionStatusManager.getConnectionHealth(player.socketId);
                        if (health) {
                            healthTest.health = {
                                latency: health.latency,
                                errorCount: health.errorCount,
                                lastPing: health.lastPing,
                                isHealthy: health.isHealthy
                            };

                            if (health.isHealthy !== false) {
                                healthyConnections++;
                            } else {
                                issues.push(`Player ${player.username} has unhealthy connection`);
                            }

                            // Check for high latency
                            if (health.latency && health.latency > 1000) {
                                issues.push(`Player ${player.username} has high latency: ${health.latency}ms`);
                            }

                            // Check for errors
                            if (health.errorCount && health.errorCount > 5) {
                                issues.push(`Player ${player.username} has high error count: ${health.errorCount}`);
                            }
                        } else {
                            issues.push(`No health data available for ${player.username}`);
                        }
                    } else {
                        issues.push(`Socket not found for connected player ${player.username}`);
                    }

                    healthTests.push(healthTest);
                }
            }

            test.status = issues.length === 0 ? 'passed' : 'warning';
            test.data = {
                totalConnections,
                healthyConnections,
                healthRate: totalConnections > 0 ? healthyConnections / totalConnections : 1,
                healthTests,
                issues
            };

            if (issues.length > 0) {
                test.severity = healthyConnections / Math.max(totalConnections, 1) < 0.5 ? 'high' : 'medium';
            }

        } catch (error) {
            test.status = 'error';
            test.error = error.message;
            test.severity = 'high';
        }

        test.endTime = Date.now();
        test.duration = test.endTime - test.startTime;
        return test;
    }

    /**
     * Test database synchronization
     */
    async testDatabaseSynchronization(gameId) {
        const test = {
            name: 'Database Synchronization',
            status: 'running',
            startTime: Date.now()
        };

        try {
            // Test database connectivity
            const dbConnection = (await import('../../database/connection.js')).default;

            // Test basic query
            const [rows] = await dbConnection.execute('SELECT 1 as test');
            if (!rows || rows.length === 0 || rows[0].test !== 1) {
                test.status = 'failed';
                test.error = 'Database connectivity test failed';
                test.severity = 'critical';
                test.endTime = Date.now();
                test.duration = test.endTime - test.startTime;
                return test;
            }

            // Test room data retrieval
            const [roomRows] = await dbConnection.execute(
                'SELECT * FROM rooms WHERE room_id = ?',
                [gameId]
            );

            if (roomRows.length === 0) {
                test.status = 'failed';
                test.error = 'Room not found in database';
                test.severity = 'high';
                test.endTime = Date.now();
                test.duration = test.endTime - test.startTime;
                return test;
            }

            // Test player data retrieval
            const [playerRows] = await dbConnection.execute(
                'SELECT * FROM room_players WHERE room_id = ?',
                [gameId]
            );

            // Test write operation (update room timestamp)
            const updateStart = Date.now();
            await dbConnection.execute(
                'UPDATE rooms SET updated_at = NOW() WHERE room_id = ?',
                [gameId]
            );
            const updateDuration = Date.now() - updateStart;

            test.status = 'passed';
            test.data = {
                roomExists: true,
                playerCount: playerRows.length,
                updateLatency: updateDuration,
                roomData: {
                    status: roomRows[0].status,
                    owner_id: roomRows[0].owner_id,
                    created_at: roomRows[0].created_at,
                    updated_at: roomRows[0].updated_at
                }
            };

            // Check for performance issues
            if (updateDuration > 1000) {
                test.severity = 'medium';
                test.data.issues = [`Database update latency is high: ${updateDuration}ms`];
            }

        } catch (error) {
            test.status = 'error';
            test.error = error.message;
            test.severity = 'high';
        }

        test.endTime = Date.now();
        test.duration = test.endTime - test.startTime;
        return test;
    }

    /**
     * Test performance metrics
     */
    async testPerformanceMetrics(gameId) {
        const test = {
            name: 'Performance Metrics',
            status: 'running',
            startTime: Date.now()
        };

        try {
            if (!this.monitoringService) {
                test.status = 'skipped';
                test.reason = 'Monitoring service not available';
                test.endTime = Date.now();
                test.duration = test.endTime - test.startTime;
                return test;
            }

            const roomDiagnostics = this.monitoringService.getRoomDiagnostics(gameId);
            const dashboardData = this.monitoringService.getDashboardData();

            const issues = [];

            // Check average latency
            if (dashboardData.websocketHealth.averageLatency > 1000) {
                issues.push(`High average latency: ${dashboardData.websocketHealth.averageLatency.toFixed(0)}ms`);
            }

            // Check error rate
            if (dashboardData.websocketHealth.errorRate > 0.05) {
                issues.push(`High error rate: ${(dashboardData.websocketHealth.errorRate * 100).toFixed(2)}%`);
            }

            // Check reconnection rate
            if (dashboardData.websocketHealth.reconnectionRate > 0.2) {
                issues.push(`High reconnection rate: ${(dashboardData.websocketHealth.reconnectionRate * 100).toFixed(2)}%`);
            }

            test.status = issues.length === 0 ? 'passed' : 'warning';
            test.data = {
                roomDiagnostics,
                overallHealth: {
                    averageLatency: dashboardData.websocketHealth.averageLatency,
                    errorRate: dashboardData.websocketHealth.errorRate,
                    reconnectionRate: dashboardData.websocketHealth.reconnectionRate,
                    activeConnections: dashboardData.websocketHealth.activeConnections
                },
                issues
            };

            if (issues.length > 0) {
                test.severity = 'medium';
            }

        } catch (error) {
            test.status = 'error';
            test.error = error.message;
            test.severity = 'medium';
        }

        test.endTime = Date.now();
        test.duration = test.endTime - test.startTime;
        return test;
    }

    /**
     * Generate diagnostic summary
     */
    generateDiagnosticSummary(tests) {
        const summary = {
            totalTests: Object.keys(tests).length,
            passed: 0,
            failed: 0,
            warnings: 0,
            errors: 0,
            skipped: 0,
            overallStatus: 'unknown',
            criticalIssues: [],
            highIssues: [],
            mediumIssues: []
        };

        for (const [testName, test] of Object.entries(tests)) {
            switch (test.status) {
                case 'passed':
                    summary.passed++;
                    break;
                case 'failed':
                    summary.failed++;
                    break;
                case 'warning':
                    summary.warnings++;
                    break;
                case 'error':
                    summary.errors++;
                    break;
                case 'skipped':
                    summary.skipped++;
                    break;
            }

            // Collect issues by severity
            if (test.severity === 'critical') {
                summary.criticalIssues.push({ test: testName, error: test.error });
            } else if (test.severity === 'high') {
                summary.highIssues.push({ test: testName, error: test.error });
            } else if (test.severity === 'medium') {
                summary.mediumIssues.push({ test: testName, error: test.error });
            }
        }

        // Determine overall status
        if (summary.criticalIssues.length > 0 || summary.failed > 0) {
            summary.overallStatus = 'critical';
        } else if (summary.highIssues.length > 0 || summary.errors > 0) {
            summary.overallStatus = 'degraded';
        } else if (summary.mediumIssues.length > 0 || summary.warnings > 0) {
            summary.overallStatus = 'warning';
        } else {
            summary.overallStatus = 'healthy';
        }

        return summary;
    }

    /**
     * Generate recommendations based on test results
     */
    generateRecommendations(tests) {
        const recommendations = [];

        // Room existence recommendations
        if (tests.roomExistence?.status === 'failed') {
            recommendations.push({
                priority: 'critical',
                category: 'room_management',
                issue: 'Room not found',
                recommendation: 'Check if the room was properly created or if it was accidentally deleted. Verify room creation process.',
                action: 'recreate_room'
            });
        }

        // Player connection recommendations
        if (tests.playerConnections?.data?.issues?.length > 0) {
            recommendations.push({
                priority: 'high',
                category: 'connection_management',
                issue: 'Player connection issues detected',
                recommendation: 'Review connection status management and cleanup disconnected players. Consider implementing more aggressive connection health monitoring.',
                action: 'cleanup_connections'
            });
        }

        // State consistency recommendations
        if (tests.stateConsistency?.data?.inconsistencies?.length > 0) {
            const inconsistencies = tests.stateConsistency.data.inconsistencies;
            const hasHostMismatch = inconsistencies.some(i => i.type === 'host_mismatch');
            const hasMissingPlayers = inconsistencies.some(i => i.type.includes('missing'));

            if (hasHostMismatch) {
                recommendations.push({
                    priority: 'high',
                    category: 'state_synchronization',
                    issue: 'Host mismatch between websocket and database',
                    recommendation: 'Force state reconciliation to sync host information. Review host transfer logic.',
                    action: 'force_reconciliation'
                });
            }

            if (hasMissingPlayers) {
                recommendations.push({
                    priority: 'high',
                    category: 'state_synchronization',
                    issue: 'Player data inconsistency between websocket and database',
                    recommendation: 'Run state reconciliation to sync player data. Review player join/leave logic.',
                    action: 'sync_player_data'
                });
            }
        }

        // Websocket health recommendations
        if (tests.websocketHealth?.data?.healthRate < 0.8) {
            recommendations.push({
                priority: 'medium',
                category: 'connection_health',
                issue: 'Low websocket health rate',
                recommendation: 'Investigate connection quality issues. Consider implementing connection recovery mechanisms.',
                action: 'improve_connection_health'
            });
        }

        // Database synchronization recommendations
        if (tests.databaseSync?.data?.updateLatency > 1000) {
            recommendations.push({
                priority: 'medium',
                category: 'database_performance',
                issue: 'High database update latency',
                recommendation: 'Optimize database queries and consider connection pooling improvements.',
                action: 'optimize_database'
            });
        }

        // Performance recommendations
        if (tests.performance?.data?.issues?.length > 0) {
            recommendations.push({
                priority: 'medium',
                category: 'performance',
                issue: 'Performance issues detected',
                recommendation: 'Review system performance metrics and consider scaling or optimization.',
                action: 'performance_optimization'
            });
        }

        return recommendations;
    }

    /**
     * Run connection test for a specific player
     */
    async runConnectionTest(userId) {
        const diagnosticId = this.generateDiagnosticId();
        const startTime = Date.now();

        const diagnostic = {
            id: diagnosticId,
            userId,
            type: 'connection_test',
            startTime,
            tests: {}
        };

        try {
            // Test socket existence
            const socketId = this.socketManager.userSockets.get(userId);
            diagnostic.tests.socketExists = {
                status: socketId ? 'passed' : 'failed',
                socketId,
                timestamp: Date.now()
            };

            if (socketId) {
                // Test socket connectivity
                const socket = this.socketManager.io.sockets.sockets.get(socketId);
                diagnostic.tests.socketConnected = {
                    status: socket?.connected ? 'passed' : 'failed',
                    connected: socket?.connected,
                    timestamp: Date.now()
                };

                if (socket?.connected) {
                    // Test ping/pong
                    const pingTest = await this.testSocketPing(socket);
                    diagnostic.tests.pingTest = pingTest;

                    // Get health data
                    const health = this.connectionStatusManager.getConnectionHealth(socketId);
                    diagnostic.tests.healthCheck = {
                        status: health ? 'passed' : 'warning',
                        health,
                        timestamp: Date.now()
                    };
                }
            }

            diagnostic.status = 'completed';

        } catch (error) {
            diagnostic.error = error.message;
            diagnostic.status = 'failed';
        }

        diagnostic.endTime = Date.now();
        diagnostic.duration = diagnostic.endTime - diagnostic.startTime;

        this.storeDiagnosticResult(diagnosticId, diagnostic);
        return diagnostic;
    }

    /**
     * Test socket ping/pong
     */
    async testSocketPing(socket) {
        return new Promise((resolve) => {
            const startTime = Date.now();
            const timeout = setTimeout(() => {
                resolve({
                    status: 'failed',
                    error: 'Ping timeout',
                    duration: Date.now() - startTime
                });
            }, this.config.connectionTestTimeout);

            socket.emit('ping-test', { timestamp: startTime });

            socket.once('pong-test', (data) => {
                clearTimeout(timeout);
                const latency = Date.now() - startTime;
                resolve({
                    status: 'passed',
                    latency,
                    duration: Date.now() - startTime,
                    data
                });
            });
        });
    }

    /**
     * Generate unique diagnostic ID
     */
    generateDiagnosticId() {
        return `diag_${Date.now()}_${++this.diagnosticCounter}`;
    }

    /**
     * Store diagnostic result
     */
    storeDiagnosticResult(diagnosticId, diagnostic) {
        this.diagnosticHistory.set(diagnosticId, diagnostic);

        // Limit history size
        if (this.diagnosticHistory.size > this.config.maxDiagnosticHistory) {
            const oldestKey = this.diagnosticHistory.keys().next().value;
            this.diagnosticHistory.delete(oldestKey);
        }
    }

    /**
     * Get diagnostic result by ID
     */
    getDiagnosticResult(diagnosticId) {
        return this.diagnosticHistory.get(diagnosticId);
    }

    /**
     * Get all diagnostic results
     */
    getAllDiagnosticResults() {
        return Array.from(this.diagnosticHistory.values());
    }

    /**
     * Clear diagnostic history
     */
    clearDiagnosticHistory() {
        this.diagnosticHistory.clear();
        console.log('[Diagnostics] Diagnostic history cleared');
    }

    /**
     * Get diagnostic summary
     */
    getDiagnosticSummary() {
        const results = Array.from(this.diagnosticHistory.values());
        const recent = results.filter(r => r.startTime > Date.now() - 3600000); // Last hour

        return {
            total: results.length,
            recent: recent.length,
            completed: results.filter(r => r.status === 'completed').length,
            failed: results.filter(r => r.status === 'failed').length,
            averageDuration: results.length > 0
                ? results.reduce((sum, r) => sum + (r.duration || 0), 0) / results.length
                : 0,
            recentResults: recent.slice(-10) // Last 10 recent results
        };
    }
}

export default DiagnosticTools;