# Monitoring and Diagnostics System

This document describes the comprehensive monitoring and diagnostics system implemented for the websocket lobby synchronization fix.

## Overview

The monitoring system consists of three main components:

1. **MonitoringService** - Comprehensive monitoring of websocket connections, state synchronization, and lobby performance
2. **DiagnosticTools** - Advanced diagnostic utilities for troubleshooting lobby issues and connection problems
3. **PerformanceMonitor** - Specialized monitoring for real-time update latency and system performance

## Features Implemented

### 1. Websocket Connection Health Monitoring

- **Real-time connection tracking** - Monitors all websocket connections with health status
- **Latency measurement** - Tracks ping/pong latency for all connections
- **Error tracking** - Records and categorizes connection errors
- **Connection lifecycle monitoring** - Tracks connection, disconnection, and reconnection events
- **Health scoring** - Provides health scores for individual connections

### 2. State Synchronization Metrics and Logging

- **Reconciliation tracking** - Monitors state reconciliation events and success rates
- **Inconsistency detection** - Tracks and categorizes state inconsistencies
- **Sync event logging** - Detailed logging of all synchronization events
- **Database sync monitoring** - Monitors database synchronization performance
- **Alert generation** - Automatic alerts for high inconsistency rates

### 3. Diagnostic Tools for Troubleshooting

- **Comprehensive lobby diagnostics** - Full diagnostic suite for lobby issues
- **Room existence validation** - Verifies room structure and data integrity
- **Player connection testing** - Tests individual player connections
- **State consistency validation** - Compares websocket vs database state
- **Database synchronization testing** - Validates database connectivity and performance
- **Automated recommendations** - Provides actionable recommendations based on diagnostic results

### 4. Performance Monitoring for Real-time Updates

- **Operation latency tracking** - Measures latency for all lobby operations
- **Broadcast performance monitoring** - Tracks websocket broadcast latency
- **Real-time update measurement** - Monitors ready status, team formation, and game start latency
- **System resource monitoring** - Tracks memory and CPU usage
- **Performance profiling** - Per-room and per-user performance profiles

## API Endpoints

### Monitoring Dashboard
```
GET /api/monitoring/dashboard
```
Returns comprehensive monitoring dashboard with all metrics and alerts.

### Monitoring Metrics Export
```
GET /api/monitoring/metrics
```
Exports raw monitoring metrics for external systems.

### Room Diagnostics
```
GET /api/monitoring/room/:gameId/diagnostics
```
Gets detailed diagnostics for a specific room.

### Comprehensive Lobby Diagnostics
```
POST /api/diagnostics/lobby/:gameId
```
Runs full diagnostic suite for a lobby room.

### Connection Testing
```
POST /api/diagnostics/connection/:userId
```
Tests connection health for a specific user.

### Performance Summary
```
GET /api/performance/summary
```
Gets comprehensive performance metrics and statistics.

### Room Performance Profile
```
GET /api/performance/room/:gameId
```
Gets performance profile for a specific room.

### User Performance Profile
```
GET /api/performance/user/:userId
```
Gets performance profile for a specific user.

## Usage Examples

### Getting Monitoring Dashboard
```javascript
const response = await fetch('/api/monitoring/dashboard');
const data = await response.json();

console.log('Active connections:', data.dashboard.websocketHealth.activeConnections);
console.log('Average latency:', data.dashboard.websocketHealth.averageLatency);
console.log('Active rooms:', data.dashboard.lobbyPerformance.activeRooms);
```

### Running Lobby Diagnostics
```javascript
const response = await fetch('/api/diagnostics/lobby/room123', {
    method: 'POST'
});
const diagnostic = await response.json();

console.log('Diagnostic status:', diagnostic.diagnostic.summary.overallStatus);
console.log('Issues found:', diagnostic.diagnostic.summary.criticalIssues);
console.log('Recommendations:', diagnostic.diagnostic.recommendations);
```

### Checking Performance Metrics
```javascript
const response = await fetch('/api/performance/summary');
const performance = await response.json();

console.log('Average latency:', performance.performance.latency.average);
console.log('P95 latency:', performance.performance.latency.p95);
console.log('Error rate:', performance.performance.overview.totalErrors);
```

## Monitoring Configuration

The monitoring system can be configured through environment variables or by modifying the service configurations:

### MonitoringService Configuration
```javascript
{
    metricsRetentionPeriod: 24 * 60 * 60 * 1000, // 24 hours
    performanceSampleSize: 100,
    alertThresholds: {
        connectionFailureRate: 0.05, // 5%
        averageLatency: 1000, // 1 second
        stateInconsistencyRate: 0.1, // 10%
        reconnectionRate: 0.2 // 20%
    }
}
```

### PerformanceMonitor Configuration
```javascript
{
    latencyThresholds: {
        excellent: 50,    // < 50ms
        good: 100,        // < 100ms
        acceptable: 250,  // < 250ms
        poor: 500,        // < 500ms
        critical: 1000    // >= 1000ms
    },
    alertThresholds: {
        averageLatency: 200,
        p95Latency: 500,
        errorRate: 0.05
    }
}
```

## Alert Types

The system generates various types of alerts:

### Connection Alerts
- `HIGH_CONNECTION_FAILURE_RATE` - Connection failure rate exceeds threshold
- `HIGH_AVERAGE_LATENCY` - Average connection latency is too high
- `HIGH_RECONNECTION_RATE` - Too many reconnections occurring

### State Synchronization Alerts
- `HIGH_STATE_INCONSISTENCY_RATE` - State inconsistencies exceed threshold
- `HIGH_FAILURE_RATE` - Reconciliation failure rate is too high
- `HIGH_STALE_CONNECTIONS` - Too many stale connections detected

### Performance Alerts
- `HIGH_P95_LATENCY` - 95th percentile latency exceeds threshold
- `HIGH_ERROR_RATE` - Error rate exceeds acceptable levels

## Diagnostic Test Types

### Room Existence Test
Verifies that the room exists and has proper structure.

### Player Connection Test
Checks the connection status and health of all players in a room.

### State Consistency Test
Compares websocket state with database state to detect inconsistencies.

### Websocket Health Test
Evaluates the health of websocket connections for room players.

### Database Synchronization Test
Tests database connectivity and synchronization performance.

### Performance Metrics Test
Analyzes performance metrics and identifies potential issues.

## Troubleshooting Common Issues

### High Latency
1. Check network conditions
2. Review server resource usage
3. Analyze broadcast patterns
4. Consider connection optimization

### State Inconsistencies
1. Run comprehensive lobby diagnostics
2. Force state reconciliation
3. Check database synchronization
4. Review player connection status

### Connection Issues
1. Test individual player connections
2. Check websocket health metrics
3. Review error logs
4. Analyze reconnection patterns

## Integration with Existing Systems

The monitoring system integrates seamlessly with the existing websocket lobby system:

- **Automatic startup** - Services start automatically with the server
- **Non-intrusive monitoring** - Minimal performance impact on existing operations
- **Real-time data collection** - Continuous monitoring without interrupting gameplay
- **Comprehensive coverage** - Monitors all aspects of the lobby system

## Maintenance

### Regular Tasks
- Monitor dashboard for alerts
- Review diagnostic results for recurring issues
- Analyze performance trends
- Clean up old metrics (automatic)

### Troubleshooting Workflow
1. Check monitoring dashboard for alerts
2. Run comprehensive diagnostics for affected rooms
3. Analyze diagnostic results and recommendations
4. Apply fixes based on recommendations
5. Monitor for improvement

The monitoring system provides comprehensive visibility into the websocket lobby system, enabling proactive issue detection and resolution while maintaining optimal performance.