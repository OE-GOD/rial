# 🧪 Backend Testing Guide

## Issue: iOS Request Not Reaching Backend

### Quick Diagnostic Steps:

#### 1. **Check Backend is Running**
In your backend terminal, you should see:
```
🚀 Backend server listening at http://0.0.0.0:3000
📱 Access from iPhone at http://10.0.0.132:3000
```

#### 2. **Test from iPhone Safari**
On your iPhone, open Safari and go to:
```
http://10.0.0.132:3000/test
```

**Expected result:**
```json
{"message":"Backend is working!","timestamp":"2025-11-01T..."}
```

**If this FAILS:**
- ❌ Network connection problem
- ❌ Wrong IP address
- ❌ Firewall blocking
- ❌ Backend not accessible from iPhone

**If this WORKS:**
- ✅ Network is fine
- ✅ Issue is with the app's POST request

#### 3. **Check Backend Logs During Certify**
When you tap "Certify Image" in the app:

**Backend terminal should show:**
```
[2025-11-01T23:56:52.000Z] POST /prove from 10.0.0.117
📥 Received request to /prove
✅ Image received: 199615 bytes
...
```

**If you see NOTHING:**
- ❌ Request not reaching backend
- ❌ Possible iOS network issue
- ❌ Check Info.plist ATS settings

---

## 🔍 Debugging Steps:

### Step 1: Verify Network
```bash
# On your Mac, check what's on port 3000
lsof -i :3000

# Should show node server running
```

### Step 2: Test from iPhone Browser
Navigate to: `http://10.0.0.132:3000/test`

### Step 3: Check Firewall
```bash
# On Mac, check firewall status
sudo /usr/libexec/ApplicationFirewall/socketfilterfw --getglobalstate

# If enabled, make sure Node is allowed
```

### Step 4: Restart Backend Properly
```bash
# Kill any existing process
lsof -ti:3000 | xargs kill -9

# Start fresh
cd /Users/aungmaw/rial/backend
npm start
```

---

## 🚨 Common Issues:

### Issue: "Request timeout"
**Cause:** Backend not responding
**Fix:** 
1. Restart backend
2. Check backend logs
3. Verify IP address is correct

### Issue: "Connection refused"
**Cause:** Backend not running or wrong IP
**Fix:**
1. Verify backend is running (`lsof -i :3000`)
2. Check your Mac's IP hasn't changed
3. Update ProverManager.swift if IP changed

### Issue: Backend shows nothing
**Cause:** Request not reaching server
**Fix:**
1. Test `/test` endpoint in Safari
2. Check Info.plist has correct ATS exception
3. Verify firewall settings

---

## ✅ Expected Flow:

1. iOS: "✅ Starting proof generation"
2. iOS: "📦 Extension converting request"
3. **Backend: "[timestamp] POST /prove from 10.0.0.xxx"**
4. **Backend: "📥 Received request to /prove"**
5. **Backend: "✅ Image received: xxxxx bytes"**
6. **Backend: "🔐 Starting signature verification..."**
7. **Backend: "✅ Response ready: SUCCESS"**
8. iOS: "Callback..."
9. iOS: "✅ Response status: 200"

---

## 📞 What to Check Now:

1. **Is backend terminal showing ANY logs when you certify?**
   - YES → Backend is receiving, check for errors in logs
   - NO → Request not reaching backend, network issue

2. **Can you access http://10.0.0.132:3000/test in iPhone Safari?**
   - YES → Network is fine, app issue
   - NO → Network/firewall problem

Let me know what you see! 🔍

