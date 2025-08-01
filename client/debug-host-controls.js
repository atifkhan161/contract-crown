/**
 * Debug script to check host controls visibility
 * Run this in the browser console on the waiting room page
 */

function debugHostControls() {
    console.log('=== HOST CONTROLS DEBUG ===');
    
    // Check if elements exist
    const hostControls = document.getElementById('host-controls');
    const startGameBtn = document.getElementById('start-game-btn');
    
    console.log('Host controls element:', hostControls);
    console.log('Start game button element:', startGameBtn);
    
    if (hostControls) {
        console.log('Host controls classes:', hostControls.classList.toString());
        console.log('Host controls display style:', getComputedStyle(hostControls).display);
        console.log('Host controls visibility:', getComputedStyle(hostControls).visibility);
        console.log('Host controls opacity:', getComputedStyle(hostControls).opacity);
        
        // Check if hidden class is applied
        console.log('Has hidden class:', hostControls.classList.contains('hidden'));
        
        // Try to show it manually
        console.log('Attempting to show host controls...');
        hostControls.classList.remove('hidden');
        console.log('After removing hidden class:', hostControls.classList.toString());
    }
    
    if (startGameBtn) {
        console.log('Start button disabled:', startGameBtn.disabled);
        console.log('Start button classes:', startGameBtn.classList.toString());
        console.log('Start button display:', getComputedStyle(startGameBtn).display);
    }
    
    // Check if user is detected as host
    console.log('=== HOST STATUS DEBUG ===');
    
    // Try to access the waiting room manager instance
    if (window.waitingRoomManager) {
        console.log('Waiting room manager found');
        console.log('Is host:', window.waitingRoomManager.isHost);
        console.log('Current user:', window.waitingRoomManager.currentUser);
        console.log('Room data:', window.waitingRoomManager.roomData);
        console.log('Room owner:', window.waitingRoomManager.roomData?.owner);
    } else {
        console.log('Waiting room manager not found on window object');
    }
    
    console.log('=== END DEBUG ===');
}

// Run the debug function
debugHostControls();

// Also expose it globally for manual testing
window.debugHostControls = debugHostControls;