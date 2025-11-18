# 📱 Backend URL Configuration for rial App

## ✅ **Correct Backend URL to Use:**

```
http://10.0.0.59:3000
```

---

## 🎯 **How to Set It in the App:**

### **Option 1: App Settings (Recommended)**
1. Open **rial app** on your iPhone
2. Tap **Settings** (gear icon)
3. Find **"Backend URL"** field
4. Enter: `http://10.0.0.59:3000`
5. Tap **Save** or go back

### **Option 2: It's Already the Default!**
The app automatically uses `http://10.0.0.59:3000` when running on a **real device**.

Check the code:
```swift
// ProverManager.swift - lines 90-98
#if targetEnvironment(simulator)
let defaultURL = "http://localhost:3000"
print("🔧 Using simulator default: \(defaultURL)")
return defaultURL
#else
let defaultURL = "http://10.0.0.59:3000"  // ← Already set!
print("🔧 Using device default: \(defaultURL)")
return defaultURL
#endif
```

So you **don't need to change anything** - it's already configured!

---

## 🔍 **Verify Your Setup:**

### **1. Check Your Mac's IP Address:**
```bash
# On your Mac terminal:
ifconfig | grep "inet " | grep -v "127.0.0.1"
```

**Current result:** `10.0.0.59` ✅

### **2. Verify Backend is Running:**
```bash
# On your Mac:
curl http://10.0.0.59:3000/health
```

**Expected:** `{"status":"healthy"...}` ✅

### **3. Test from iPhone:**
Open **Safari** on your iPhone and go to:
```
http://10.0.0.59:3000/health
```

**If you see JSON:** ✅ Network is working!  
**If you see error:** ❌ Local network permission not granted

---

## 📋 **Different Scenarios:**

### **Scenario 1: Using Real iPhone Device**
```
Backend URL: http://10.0.0.59:3000
```
- ✅ Already configured as default
- ✅ Both devices must be on same WiFi
- ✅ Requires Local Network permission

### **Scenario 2: Using iOS Simulator**
```
Backend URL: http://localhost:3000
```
- ✅ Already configured as default
- ✅ No permissions needed
- ✅ Simulator shares Mac's localhost

### **Scenario 3: Mac IP Changed (WiFi change)**
If your Mac's IP changes (different WiFi network):

1. **Find new IP:**
   ```bash
   ifconfig | grep "inet " | grep -v "127.0.0.1"
   ```

2. **Update in app:**
   - Open rial app → Settings
   - Change Backend URL to: `http://NEW_IP:3000`

3. **Update Info.plist:**
   Add the new IP to allowed domains (if needed)

### **Scenario 4: Using iPhone Hotspot**
If you connect Mac to iPhone's Personal Hotspot:

1. **Enable hotspot on iPhone**
2. **Connect Mac to it**
3. **Find Mac's new IP:**
   ```bash
   ifconfig | grep "inet " | grep -v "127.0.0.1"
   ```
4. **Update Backend URL in app** to new IP

---

## 🚨 **Common Mistakes:**

### ❌ **Wrong:**
```
http://localhost:3000           # Only works in simulator
http://127.0.0.1:3000           # Only works in simulator
http://10.0.0.59                # Missing port :3000
https://10.0.0.59:3000          # Using HTTPS (we use HTTP)
10.0.0.59:3000                  # Missing http://
```

### ✅ **Correct:**
```
http://10.0.0.59:3000           # Perfect!
```

---

## 🎯 **Current Status:**

| Component | Status | Value |
|-----------|--------|-------|
| Mac IP | ✅ Working | `10.0.0.59` |
| Backend Port | ✅ Running | `3000` |
| Backend URL | ✅ Configured | `http://10.0.0.59:3000` |
| App Default | ✅ Correct | `http://10.0.0.59:3000` |
| Backend Health | ✅ Healthy | Running |

**Your backend URL is already correct!** 🎉

---

## 🔧 **The Real Problem:**

The URL is fine. The issue is **iOS Local Network Permission**.

You need to:
1. ✅ **Reset Location & Privacy** on iPhone
2. ✅ **Reinstall the app**
3. ✅ **Grant "Local Network" permission** when prompted

See `IOS_LOCAL_NETWORK_FIX.md` for detailed steps.

---

## 📱 **Quick Test:**

1. Open **Safari on iPhone**
2. Go to: `http://10.0.0.59:3000/health`
3. **If you see JSON** → URL is correct, just need permission
4. **If you see error** → Permission not granted yet

---

## 🎊 **Summary:**

**You don't need to change the Backend URL!**

The app is already configured with:
```
http://10.0.0.59:3000
```

The problem is **iOS blocking the connection**, not the URL being wrong.

**Next step:** Grant Local Network permission (see `IOS_LOCAL_NETWORK_FIX.md`)

