/**
 * State Reconciliation Engine Demonstration
 * Shows how the engine detects and resolves state inconsistencies
 */

import StateReconciliationEngine from '../src/services/StateReconciliationEngine.js';

async function demonstrateStateReconciliation() {
    console.log('=== State Reconciliation Engine Demo ===\n');

    const engine = new StateReconciliationEngine();

    // Simulate websocket state (what clients see)
    const websocketState = {
        gameId: 'demo-room-123',
        hostId: 'user-2', // INCONSISTENT: Different from database
        status: 'waiting',
        players: new Map([
            ['user-1', {
                userId: 'user-1',
                username: 'Alice',
                isReady: false, // INCONSISTENT: Different from database
                teamAssignment: 2, // INCONSISTENT: Different from database
                isConnected: true
            }],
            ['user-2', {
                userId: 'user-2',
                username: 'Bob',
                isReady: true,
                teamAssignment: 2,
                isConnected: false // INCONSISTENT: Different from database
            }]
            // user-3 is MISSING from websocket state
        ])
    };

    // Simulate database state (source of truth)
    const databaseState = {
        room_id: 'demo-room-123',
        owner_id: 'user-1', // Correct host
        status: 'waiting',
        players: [
            {
                id: 'user-1',
                username: 'Alice',
                isReady: true, // Correct ready status
                teamAssignment: 1, // Correct team
                joinedAt: '2024-01-01T10:00:00Z'
            },
            {
                id: 'user-2',
                username: 'Bob',
                isReady: true,
                teamAssignment: 2,
                joinedAt: '2024-01-01T10:01:00Z'
            },
            {
                id: 'user-3',
                username: 'Charlie',
                isReady: false,
                teamAssignment: 1,
                joinedAt: '2024-01-01T10:02:00Z'
            }
        ]
    };

    console.log('1. DETECTING INCONSISTENCIES');
    console.log('=============================');
    
    const inconsistencies = engine.detectStateInconsistencies(
        websocketState, 
        databaseState, 
        'demo-room-123'
    );

    console.log(`Found ${inconsistencies.length} inconsistencies:\n`);
    
    inconsistencies.forEach((inconsistency, index) => {
        console.log(`${index + 1}. ${inconsistency.type.toUpperCase()} (${inconsistency.severity})`);
        console.log(`   Game ID: ${inconsistency.gameId}`);
        if (inconsistency.playerId) {
            console.log(`   Player: ${inconsistency.playerId}`);
        }
        console.log(`   Websocket Value: ${JSON.stringify(inconsistency.websocketValue)}`);
        console.log(`   Database Value: ${JSON.stringify(inconsistency.databaseValue)}`);
        console.log('');
    });

    console.log('2. RESOLVING CONFLICTS');
    console.log('======================');
    
    const resolvedState = await engine.resolveConflicts(
        inconsistencies, 
        databaseState, 
        websocketState
    );

    console.log('Resolved state (database wins for most conflicts):');
    console.log(`- Host ID: ${resolvedState.hostId} (was: ${websocketState.hostId})`);
    console.log(`- Owner ID: ${resolvedState.owner_id}`);
    console.log(`- Status: ${resolvedState.status}`);
    console.log(`- Players: ${resolvedState.players.length}`);
    
    resolvedState.players.forEach(player => {
        const wsPlayer = websocketState.players.get(player.id);
        console.log(`  * ${player.username} (${player.id}):`);
        console.log(`    - Ready: ${player.isReady} ${wsPlayer && wsPlayer.isReady !== player.isReady ? `(was: ${wsPlayer.isReady})` : ''}`);
        console.log(`    - Team: ${player.teamAssignment} ${wsPlayer && wsPlayer.teamAssignment !== player.teamAssignment ? `(was: ${wsPlayer.teamAssignment})` : ''}`);
        console.log(`    - Connected: ${player.isConnected !== undefined ? player.isConnected : 'N/A'} ${wsPlayer ? `(websocket: ${wsPlayer.isConnected})` : '(missing from websocket)'}`);
    });

    console.log('\n3. RECONCILIATION STATISTICS');
    console.log('============================');
    
    // Record the reconciliation
    engine.recordReconciliation('demo-room-123', inconsistencies, resolvedState);
    
    const stats = engine.getReconciliationStats();
    console.log(`Total reconciliations: ${stats.totalReconciliations}`);
    console.log(`Active rooms: ${stats.activeRooms}`);
    console.log(`Average inconsistencies per reconciliation: ${stats.averageInconsistenciesPerReconciliation.toFixed(2)}`);
    console.log('Common inconsistency types:');
    Object.entries(stats.commonInconsistencyTypes).forEach(([type, count]) => {
        console.log(`  - ${type}: ${count}`);
    });

    console.log('\n4. ATOMIC UPDATE SIMULATION');
    console.log('===========================');
    
    console.log('Simulating atomic state update...');
    console.log('- Updates would be applied in a database transaction');
    console.log('- Row-level locking prevents race conditions');
    console.log('- All updates succeed or all fail (atomicity)');
    console.log('- Websocket state is updated after database commit');

    console.log('\n5. PERIODIC RECONCILIATION');
    console.log('==========================');
    
    console.log('Starting periodic reconciliation (every 30 seconds)...');
    const intervalId = engine.schedulePeriodicReconciliation('demo-room-123', 30000);
    console.log('Periodic reconciliation scheduled.');
    console.log('In production, this would:');
    console.log('- Automatically detect drift between websocket and database');
    console.log('- Resolve conflicts without user intervention');
    console.log('- Maintain consistent state across all clients');
    
    // Clean up
    setTimeout(() => {
        clearInterval(intervalId);
        console.log('\nDemo completed. Periodic reconciliation stopped.');
    }, 1000);

    console.log('\n=== Demo Complete ===');
    console.log('The State Reconciliation Engine provides:');
    console.log('✓ Automatic detection of state inconsistencies');
    console.log('✓ Database-as-source-of-truth conflict resolution');
    console.log('✓ Atomic updates to prevent race conditions');
    console.log('✓ Comprehensive statistics and monitoring');
    console.log('✓ Periodic reconciliation for drift prevention');
}

// Run the demonstration
demonstrateStateReconciliation().catch(console.error);

export default demonstrateStateReconciliation;