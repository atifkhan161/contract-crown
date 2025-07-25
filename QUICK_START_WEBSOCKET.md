# Quick Start: Fix WebSocket Connection

## 🚀 3-Step Fix

### Step 1: Environment Setup (30 seconds)
Your existing `server/.env` file has been updated with WebSocket support. 
Just verify it contains:
```bash
# Check your server/.env file contains:
ALLOW_TEST_TOKENS=true
JWT_SECRET='contractcrown'
NODE_ENV=development
```
✅ Already configured!

### Step 2: Test Connection (1 minute)
```bash
# Start your server (from server directory)
cd server
npm start

# In another terminal, test WebSocket (from root directory)
cd ..
node diagnose-websocket.js
```

### Step 3: Verify in Browser (1 minute)
1. Open `test-websocket-connection-fixed.html`
2. Click "Request Real JWT from Server"
3. Click "Test WebSocket Connection"
4. Should show "✅ WebSocket connected successfully!"

## ✅ Expected Results

After following these steps:

- **Dashboard**: Shows "Connected" status (not "Disconnected")
- **Room Creation**: Works and auto-redirects to lobby
- **Lobby**: Ready status syncs in real-time between users
- **No Alerts**: No more "Authentication failed" popups

## 🔧 If Still Not Working

### Quick Diagnostics
```bash
# Check if server is running (your server runs on port 3030)
curl http://localhost:3030/api/health

# Test JWT generation
curl -X POST http://localhost:3030/api/auth/test-token \
  -H "Content-Type: application/json" \
  -d '{"username":"testuser"}'

# Full diagnostic
node diagnose-websocket.js
```

### Manual Token Creation
If automatic methods fail, create a token manually in browser console:

```javascript
// Paste this in browser console on your app page:
const serverUrl = window.location.port === '5173' ? 'http://localhost:3030' : '';
fetch(`${serverUrl}/api/auth/test-token`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ username: 'testuser' })
})
.then(r => r.json())
.then(data => {
  localStorage.setItem('auth_token', data.token);
  localStorage.setItem('auth_user', JSON.stringify(data.user));
  location.reload();
});
```

## 📋 Troubleshooting Checklist

- [ ] Server is running on correct port (your setup: 3030)
- [ ] `.env` file exists with `ALLOW_TEST_TOKENS=true`
- [ ] No firewall blocking WebSocket connections
- [ ] Browser console shows no CORS errors
- [ ] JWT_SECRET is set (can be anything in development)

## 🎯 Success Indicators

✅ Dashboard connection status: "Connected"  
✅ Room creation redirects to lobby automatically  
✅ Lobby ready button works and syncs across tabs  
✅ No authentication error alerts  
✅ Real-time updates visible in both dashboard and lobby  

## 📞 Still Need Help?

1. Check `websocket-diagnostic-*.json` report
2. Review `fix-websocket-connection.md` for detailed troubleshooting
3. Verify all files from validation: `node validate-websocket-fixes.js`