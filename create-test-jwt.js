/**
 * Create Test JWT Token
 * Generates a real JWT token for testing WebSocket connections
 */

import jwt from 'jsonwebtoken';

function createTestJWT() {
    const secret = process.env.JWT_SECRET || 'your-secret-key';
    
    const payload = {
        userId: 'test-user-' + Date.now(),
        username: 'testuser',
        email: 'test@example.com',
        iat: Math.floor(Date.now() / 1000),
        exp: Math.floor(Date.now() / 1000) + (24 * 60 * 60) // 24 hours from now
    };
    
    const token = jwt.sign(payload, secret);
    
    console.log('Generated JWT Token:');
    console.log(token);
    console.log('\nToken Payload:');
    console.log(JSON.stringify(payload, null, 2));
    console.log('\nTo use this token:');
    console.log('1. Copy the token above');
    console.log('2. Open browser console on your app');
    console.log('3. Run: localStorage.setItem("auth_token", "' + token + '")');
    console.log('4. Run: localStorage.setItem("auth_user", \'' + JSON.stringify({
        id: payload.userId,
        username: payload.username,
        email: payload.email
    }) + '\')');
    console.log('5. Refresh the page');
    
    return token;
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
    createTestJWT();
}

export { createTestJWT };