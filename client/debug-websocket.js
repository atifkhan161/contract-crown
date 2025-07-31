/**
 * Debug script for websocket lobby issues
 * Run this in the browser console to diagnose websocket problems
 */

async function debugWebsocketLobby() {
    console.log('🔍 Starting websocket lobby diagnostics...');
    
    try {
        // 1. Check websocket status
        console.log('\n📡 Checking websocket status...');
        const wsStatus = await fetch('/api/websocket/detailed-status');
        const wsData = await wsStatus.json();
        console.log('Websocket Status:', wsData);
        
        // 2. Check monitoring dashboard
        console.log('\n📊 Checking monitoring dashboard...');
        const monitoringResponse = await fetch('/api/monitoring/dashboard');
        const monitoringData = await monitoringResponse.json();
        console.log('Monitoring Dashboard:', monitoringData);
        
        // 3. Check performance metrics
        console.log('\n⚡ Checking performance metrics...');
        const performanceResponse = await fetch('/api/performance/summary');
        const performanceData = await performanceResponse.json();
        console.log('Performance Summary:', performanceData);
        
        // 4. Get current room ID from URL or prompt
        const urlParams = new URLSearchParams(window.location.search);
        const roomId = urlParams.get('roomId') || prompt('Enter room ID to diagnose:');
        
        if (roomId) {
            console.log(`\n🏠 Running diagnostics for room: ${roomId}`);
            
            // 5. Run comprehensive lobby diagnostics
            const diagnosticsResponse = await fetch(`/api/diagnostics/lobby/${roomId}`, {
                method: 'POST'
            });
            const diagnosticsData = await diagnosticsResponse.json();
            console.log('Lobby Diagnostics:', diagnosticsData);
            
            // 6. Check room-specific monitoring
            const roomMonitoringResponse = await fetch(`/api/monitoring/room/${roomId}/diagnostics`);
            const roomMonitoringData = await roomMonitoringResponse.json();
            console.log('Room Monitoring:', roomMonitoringData);
        }
        
        // 7. Summary and recommendations
        console.log('\n📋 DIAGNOSTIC SUMMARY:');
        console.log('='.repeat(50));
        
        const activeConnections = wsData.websocket?.activeConnections || 0;
        const activeRooms = monitoringData.dashboard?.lobbyPerformance?.activeRooms || 0;
        const avgLatency = monitoringData.dashboard?.websocketHealth?.averageLatency || 0;
        const errorRate = monitoringData.dashboard?.websocketHealth?.errorRate || 0;
        
        console.log(`Active Connections: ${activeConnections}`);
        console.log(`Active Rooms: ${activeRooms}`);
        console.log(`Average Latency: ${avgLatency.toFixed(0)}ms`);
        console.log(`Error Rate: ${(errorRate * 100).toFixed(2)}%`);
        
        // Generate recommendations
        const recommendations = [];
        
        if (activeConnections === 0) {
            recommendations.push('❌ No active websocket connections - check server status');
        }
        
        if (avgLatency > 1000) {
            recommendations.push('⚠️ High latency detected - network issues possible');
        }
        
        if (errorRate > 0.05) {
            recommendations.push('⚠️ High error rate - check server logs');
        }
        
        if (activeRooms === 0 && roomId) {
            recommendations.push('❌ No active rooms found - room may not be properly created');
        }
        
        if (recommendations.length === 0) {
            recommendations.push('✅ All basic checks passed - issue may be in specific room logic');
        }
        
        console.log('\n🔧 RECOMMENDATIONS:');
        recommendations.forEach(rec => console.log(rec));
        
        console.log('\n✅ Diagnostics complete!');
        
    } catch (error) {
        console.error('❌ Diagnostic error:', error);
        console.log('\n🔧 FALLBACK CHECKS:');
        console.log('1. Check if server is running');
        console.log('2. Check browser network tab for failed requests');
        console.log('3. Check server console for error messages');
        console.log('4. Try refreshing the page');
    }
}

// Auto-run if this script is loaded
if (typeof window !== 'undefined') {
    console.log('🚀 Websocket lobby diagnostics loaded!');
    console.log('Run debugWebsocketLobby() to start diagnostics');
    
    // Make function globally available
    window.debugWebsocketLobby = debugWebsocketLobby;
}

export { debugWebsocketLobby };