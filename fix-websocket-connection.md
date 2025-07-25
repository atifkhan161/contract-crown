# Fix WebSocket Connection Issues

## Quick Fix Guide

### Step 1: Set Environment Variables
Create a `.env` file in your server directory:

```bash
NODE_ENV=development
JWT_SECRET=your-secret-key-change-this-in-production
ALLOW_TEST_TOKENS=true
PORT=3000
```

### Step 2: Test WebSocket Connection

#### Option A: Use the Test Page
1. Start your server: `npm start`
2. Open `test-websocket-connection-fixed.html` in your browser
3. Click "Request Real JWT from Server" or "Generate Test Token"
4. Click "Test WebSocket Connection"
5. If successful, try "Open Dashboard"

#### Option B: Use the Diagnostic Tool
```bash
node diagnose-websocket.js
```

### Step 3: Common Issues and Solutions

#### Issue: "Authentication token required"
**Solution**: The server is not accepting test tokens.
- Set `ALLOW_TEST_TOKENS=true` in your `.env` file
- Restart your server
- Use the test auth endpoint to get a real JWT token

#### Issue: "Invalid token format"
**Solution**: The JWT token is malformed.
- Use the "Request Real JWT from Server" option in the test page
- Or generate a proper JWT token using `node create-test-jwt.js`

#### Issue: "Connection timeout"
**Solution**: Server is not responding.
- Check if server is running on the correct port
- Verify firewall settings
- Check server logs for errors

#### Issue: "WebSocket disconnected immediately"
**Solution**: Authentication is failing after connection.
- Check JWT_SECRET matches between client and server
- Verify token is not expired
- Check server logs for authentication errors

### Step 4: Manual Token Creation

If automatic token generation fails, create a token manually:

```javascript
// In browser console:
const testPayload = {
    userId: 'test-user-' + Date.now(),
    username: 'testuser',
    email: 'test@example.com',
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + (24 * 60 * 60)
};

const header = btoa(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
const payload = btoa(JSON.stringify(testPayload));
const testToken = header + '.' + payload + '.test-signature';

localStorage.setItem('auth_token', testToken);
localStorage.setItem('auth_user', JSON.stringify({
    id: testPayload.userId,
    username: testPayload.username,
    email: testPayload.email
}));

// Refresh the page
location.reload();
```

### Step 5: Verify Dashboard and Lobby

1. Open `dashboard.html` - should show "Connected" status
2. Create a room - should redirect to lobby
3. In lobby, ready status should sync in real-time

### Troubleshooting Commands

```bash
# Check if server is running
curl http://localhost:3000/api/health

# Test JWT token generation
curl -X POST http://localhost:3000/api/auth/test-token \
  -H "Content-Type: application/json" \
  -d '{"username":"testuser"}'

# Run full diagnostic
node diagnose-websocket.js

# Check server logs
npm start | grep -E "(WebSocket|Socket|Auth)"
```

### Expected Behavior After Fix

✅ Dashboard shows "Connected" status
✅ Room creation works and redirects to lobby
✅ Lobby shows real-time player status updates
✅ Ready button works and syncs across users
✅ No "Authentication failed" alerts

### Still Having Issues?

1. Check the diagnostic report: `websocket-diagnostic-*.json`
2. Review server console logs for errors
3. Verify all environment variables are set correctly
4. Try the test pages in different browsers
5. Check if antivirus/firewall is blocking WebSocket connections