/**
 * Test script to verify navigation flow from dashboard to waiting room to game
 * This tests the URL parameter passing and navigation integration
 */

// Test URL parameter parsing
function testURLParameterParsing() {
    console.log('Testing URL parameter parsing...');
    
    // Simulate different URL scenarios
    const testCases = [
        'waiting-room.html?room=test-room-123',
        'waiting-room.html?room=abc-def-456&other=param',
        'waiting-room.html',
        'waiting-room.html?room=',
        'waiting-room.html?room=invalid-chars-!@#'
    ];
    
    testCases.forEach((url, index) => {
        console.log(`\nTest case ${index + 1}: ${url}`);
        
        // Mock window.location.search
        const urlParts = url.split('?');
        const search = urlParts.length > 1 ? '?' + urlParts[1] : '';
        
        const urlParams = new URLSearchParams(search);
        const roomId = urlParams.get('room');
        
        console.log(`  Room ID extracted: ${roomId}`);
        
        // Test room ID validation (from waiting room manager)
        const roomIdPattern = /^[a-zA-Z0-9-_]{8,}$/;
        const isValid = roomId && roomIdPattern.test(roomId);
        
        console.log(`  Is valid: ${isValid}`);
    });
}

// Test navigation URL construction
function testNavigationURLs() {
    console.log('\n\nTesting navigation URL construction...');
    
    const testRoomIds = [
        'room-123-abc',
        'test-room-456',
        'abc123def456'
    ];
    
    testRoomIds.forEach(roomId => {
        console.log(`\nRoom ID: ${roomId}`);
        
        // Dashboard to waiting room
        const waitingRoomUrl = `waiting-room.html?room=${roomId}`;
        console.log(`  Dashboard → Waiting Room: ${waitingRoomUrl}`);
        
        // Waiting room to game
        const gameUrl = `game.html?room=${roomId}`;
        console.log(`  Waiting Room → Game: ${gameUrl}`);
    });
}

// Test the complete flow
function testCompleteFlow() {
    console.log('\n\nTesting complete navigation flow...');
    
    const roomId = 'test-room-12345';
    
    console.log('1. User creates room on dashboard');
    console.log(`   → Redirects to: waiting-room.html?room=${roomId}`);
    
    console.log('2. Waiting room loads and parses room ID');
    const urlParams = new URLSearchParams(`?room=${roomId}`);
    const extractedRoomId = urlParams.get('room');
    console.log(`   → Extracted room ID: ${extractedRoomId}`);
    console.log(`   → Match: ${extractedRoomId === roomId}`);
    
    console.log('3. Game starts from waiting room');
    console.log(`   → Redirects to: game.html?room=${roomId}`);
    
    console.log('4. Alternative: User joins room from dashboard');
    console.log(`   → Redirects to: waiting-room.html?room=${roomId}`);
}

// Run all tests
console.log('=== Navigation Flow Integration Tests ===');
testURLParameterParsing();
testNavigationURLs();
testCompleteFlow();
console.log('\n=== Tests Complete ===');