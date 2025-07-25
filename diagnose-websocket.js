/**
 * WebSocket Connection Diagnostic Tool
 * Helps diagnose WebSocket connection issues
 */

import { io } from 'socket.io-client';
import jwt from 'jsonwebtoken';

class WebSocketDiagnostic {
    constructor() {
        this.results = [];
        this.socket = null;
    }

    log(message, type = 'info') {
        const timestamp = new Date().toISOString();
        const logEntry = { timestamp, message, type };
        this.results.push(logEntry);
        
        const colors = {
            info: '\x1b[36m',    // Cyan
            success: '\x1b[32m', // Green
            warning: '\x1b[33m', // Yellow
            error: '\x1b[31m',   // Red
            reset: '\x1b[0m'     // Reset
        };
        
        console.log(`${colors[type] || colors.info}[${timestamp}] ${message}${colors.reset}`);
    }

    async diagnose() {
        this.log('🔍 Starting WebSocket Connection Diagnostic...', 'info');
        
        // Test 1: Environment Check
        await this.testEnvironment();
        
        // Test 2: JWT Token Generation
        await this.testJWTGeneration();
        
        // Test 3: WebSocket Connection
        await this.testWebSocketConnection();
        
        // Test 4: Authentication Flow
        await this.testAuthentication();
        
        // Test 5: Room Operations
        await this.testRoomOperations();
        
        this.log('✅ Diagnostic complete!', 'success');
        this.generateReport();
    }

    async testEnvironment() {
        this.log('🔧 Testing Environment...', 'info');
        
        try {
            const nodeEnv = process.env.NODE_ENV || 'development';
            const jwtSecret = process.env.JWT_SECRET || 'your-secret-key';
            const allowTestTokens = process.env.ALLOW_TEST_TOKENS || 'false';
            
            this.log(`Node Environment: ${nodeEnv}`, 'info');
            this.log(`JWT Secret configured: ${jwtSecret !== 'your-secret-key' ? 'Yes' : 'No (using default)'}`, 'info');
            this.log(`Test tokens allowed: ${allowTestTokens}`, 'info');
            
            this.log('✅ Environment check passed', 'success');
        } catch (error) {
            this.log(`❌ Environment check failed: ${error.message}`, 'error');
        }
    }

    async testJWTGeneration() {
        this.log('🔑 Testing JWT Token Generation...', 'info');
        
        try {
            const secret = process.env.JWT_SECRET || 'your-secret-key';
            const payload = {
                userId: 'test-user-diagnostic',
                username: 'diagnostic-user',
                email: 'diagnostic@test.com',
                iat: Math.floor(Date.now() / 1000),
                exp: Math.floor(Date.now() / 1000) + (60 * 60) // 1 hour
            };
            
            const token = jwt.sign(payload, secret);
            this.testToken = token;
            
            // Verify the token
            const decoded = jwt.verify(token, secret);
            
            this.log(`✅ JWT token generated and verified successfully`, 'success');
            this.log(`Token payload: ${JSON.stringify(decoded, null, 2)}`, 'info');
            
        } catch (error) {
            this.log(`❌ JWT generation failed: ${error.message}`, 'error');
        }
    }

    async testWebSocketConnection() {
        this.log('🔌 Testing WebSocket Connection...', 'info');
        
        return new Promise((resolve) => {
            try {
                const serverUrl = process.env.SERVER_URL || 'http://localhost:3030';
                
                this.socket = io(serverUrl, {
                    auth: {
                        token: this.testToken
                    },
                    transports: ['websocket', 'polling'],
                    timeout: 10000
                });

                let resolved = false;

                this.socket.on('connect', () => {
                    this.log('✅ WebSocket connected successfully', 'success');
                    this.log(`Socket ID: ${this.socket.id}`, 'info');
                    this.log(`Transport: ${this.socket.io.engine.transport.name}`, 'info');
                    if (!resolved) {
                        resolved = true;
                        resolve();
                    }
                });

                this.socket.on('connect_error', (error) => {
                    this.log(`❌ WebSocket connection error: ${error.message}`, 'error');
                    if (!resolved) {
                        resolved = true;
                        resolve();
                    }
                });

                this.socket.on('auth_error', (error) => {
                    this.log(`❌ WebSocket authentication error: ${JSON.stringify(error)}`, 'error');
                    if (!resolved) {
                        resolved = true;
                        resolve();
                    }
                });

                this.socket.on('disconnect', (reason) => {
                    this.log(`⚠️ WebSocket disconnected: ${reason}`, 'warning');
                });

                // Timeout after 15 seconds
                setTimeout(() => {
                    if (!resolved) {
                        this.log('⏰ WebSocket connection timeout', 'warning');
                        resolved = true;
                        resolve();
                    }
                }, 15000);

            } catch (error) {
                this.log(`❌ WebSocket connection setup failed: ${error.message}`, 'error');
                resolve();
            }
        });
    }

    async testAuthentication() {
        this.log('🔐 Testing Authentication Flow...', 'info');
        
        if (!this.socket || !this.socket.connected) {
            this.log('❌ Cannot test authentication - WebSocket not connected', 'error');
            return;
        }

        return new Promise((resolve) => {
            let resolved = false;

            this.socket.on('connection-confirmed', (data) => {
                this.log('✅ Authentication confirmed by server', 'success');
                this.log(`Confirmation data: ${JSON.stringify(data)}`, 'info');
                if (!resolved) {
                    resolved = true;
                    resolve();
                }
            });

            // Send a ping to test the connection
            this.socket.emit('ping', { timestamp: new Date().toISOString() });

            this.socket.on('pong', (data) => {
                this.log('✅ Ping/Pong test successful', 'success');
                this.log(`Pong data: ${JSON.stringify(data)}`, 'info');
            });

            setTimeout(() => {
                if (!resolved) {
                    this.log('⏰ Authentication test timeout', 'warning');
                    resolved = true;
                    resolve();
                }
            }, 5000);
        });
    }

    async testRoomOperations() {
        this.log('🏠 Testing Room Operations...', 'info');
        
        if (!this.socket || !this.socket.connected) {
            this.log('❌ Cannot test room operations - WebSocket not connected', 'error');
            return;
        }

        return new Promise((resolve) => {
            let resolved = false;
            const testRoomId = 'diagnostic-room-' + Date.now();

            this.socket.on('room-joined', (data) => {
                this.log('✅ Room join successful', 'success');
                this.log(`Room data: ${JSON.stringify(data)}`, 'info');
                if (!resolved) {
                    resolved = true;
                    resolve();
                }
            });

            this.socket.on('error', (error) => {
                this.log(`❌ Room operation error: ${JSON.stringify(error)}`, 'error');
                if (!resolved) {
                    resolved = true;
                    resolve();
                }
            });

            // Test joining a room
            this.socket.emit('join-game-room', {
                gameId: testRoomId,
                userId: 'test-user-diagnostic',
                username: 'diagnostic-user'
            });

            setTimeout(() => {
                if (!resolved) {
                    this.log('⏰ Room operations test timeout', 'warning');
                    resolved = true;
                    resolve();
                }
            }, 5000);
        });
    }

    generateReport() {
        this.log('📊 Generating Diagnostic Report...', 'info');
        
        const report = {
            timestamp: new Date().toISOString(),
            summary: {
                totalTests: this.results.length,
                errors: this.results.filter(r => r.type === 'error').length,
                warnings: this.results.filter(r => r.type === 'warning').length,
                successes: this.results.filter(r => r.type === 'success').length
            },
            details: this.results,
            recommendations: this.generateRecommendations()
        };

        console.log('\n' + '='.repeat(60));
        console.log('📋 DIAGNOSTIC REPORT');
        console.log('='.repeat(60));
        console.log(`Total Tests: ${report.summary.totalTests}`);
        console.log(`✅ Successes: ${report.summary.successes}`);
        console.log(`⚠️ Warnings: ${report.summary.warnings}`);
        console.log(`❌ Errors: ${report.summary.errors}`);
        
        if (report.recommendations.length > 0) {
            console.log('\n🔧 RECOMMENDATIONS:');
            report.recommendations.forEach((rec, index) => {
                console.log(`${index + 1}. ${rec}`);
            });
        }
        
        console.log('='.repeat(60));
        
        // Save report to file
        const fs = await import('fs');
        const reportPath = `websocket-diagnostic-${Date.now()}.json`;
        fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
        this.log(`📄 Full report saved to: ${reportPath}`, 'info');
    }

    generateRecommendations() {
        const recommendations = [];
        const errors = this.results.filter(r => r.type === 'error');
        const warnings = this.results.filter(r => r.type === 'warning');

        if (errors.some(e => e.message.includes('JWT'))) {
            recommendations.push('Check JWT_SECRET environment variable and ensure it matches between client and server');
        }

        if (errors.some(e => e.message.includes('connection'))) {
            recommendations.push('Verify server is running and accessible on the correct port');
        }

        if (errors.some(e => e.message.includes('auth'))) {
            recommendations.push('Enable ALLOW_TEST_TOKENS=true in development environment');
        }

        if (warnings.some(w => w.message.includes('timeout'))) {
            recommendations.push('Check network connectivity and server response times');
        }

        if (recommendations.length === 0 && errors.length === 0) {
            recommendations.push('WebSocket connection appears to be working correctly!');
        }

        return recommendations;
    }

    cleanup() {
        if (this.socket) {
            this.socket.disconnect();
        }
    }
}

// Run diagnostic if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
    const diagnostic = new WebSocketDiagnostic();
    
    diagnostic.diagnose().then(() => {
        diagnostic.cleanup();
        process.exit(0);
    }).catch((error) => {
        console.error('Diagnostic failed:', error);
        diagnostic.cleanup();
        process.exit(1);
    });
}

export { WebSocketDiagnostic };