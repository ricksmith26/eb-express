## Known Issue: Session Persistence After Server Restart

**Problem:** Users are logged out when the server restarts because sessions are stored in memory.

**Current Behavior:**
- Sessions use express-session with in-memory store
- Server restart clears all sessions
- Users must re-authenticate after every deployment

**Solution Options:**
1. Use Redis/Memcached for session storage (recommended for production)
2. Use connect-mongo to store sessions in MongoDB
3. Switch to stateless JWT-only authentication (no sessions)

**To Fix Later:** Configure persistent session store.

