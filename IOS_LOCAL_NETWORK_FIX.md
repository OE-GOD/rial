# 🚨 iOS Local Network Permission - CRITICAL FIX

## Problem
Your iPhone is blocking the app from reaching `10.0.0.59:3000` with error:
```
Local network prohibited
```

## ✅ GUARANTEED FIX - Do This Now:

### Step 1: Complete App Deletion
1. **Long-press the rial app** on your iPhone home screen
2. Tap **"Remove App"** → **"Delete App"**
3. **Confirm deletion**

### Step 2: Clean Xcode Build
In Xcode on your Mac:
```bash
# Run these commands:
cd /Users/aungmaw/rial
rm -rf ~/Library/Developer/Xcode/DerivedData/rial-*
```

Or in Xcode menu:
- **Product → Clean Build Folder** (hold Option, click "Clean Build Folder")

### Step 3: Rebuild & Reinstall
1. In Xcode: **Product → Run** (⌘R)
2. Wait for app to install on iPhone
3. **DO NOT OPEN THE APP YET**

### Step 4: Force Permission Reset (CRITICAL)
On your iPhone:
1. Go to **Settings → General → Transfer or Reset iPhone**
2. Tap **"Reset"**
3. Choose **"Reset Location & Privacy"**
4. Enter your passcode
5. Confirm **"Reset Settings"**
6. **Your iPhone will restart** - this is normal

### Step 5: Fresh Launch
1. After iPhone restarts, **open the rial app**
2. You will see **multiple permission prompts**:
   - ✅ **Camera** → Tap "Allow"
   - ✅ **Location** → Tap "Allow While Using App"
   - ✅ **Motion & Fitness** → Tap "Allow"
   - ✅ **Local Network** → Tap "Allow" ← THIS IS THE KEY ONE!

### Step 6: Verify Connection
1. Open **Safari** on your iPhone
2. Navigate to: `http://10.0.0.59:3000/health`
3. You should see JSON response: `{"status":"healthy"...}`
4. If you see this, the network is working!

### Step 7: Test the App
1. Open **rial app**
2. Take a photo
3. Crop and certify
4. Should now work without `-1009` error!

---

## 🔍 Alternative: Check Current Permission State

On your iPhone:
1. **Settings → Privacy & Security → Local Network**
2. Look for **"rial"** in the list
3. If it's there but OFF → **Turn it ON**
4. If it's not in the list at all → You MUST do the reset above

---

## 🎯 Why This Happens

iOS 14+ has a bug where:
- If an app is installed BEFORE `NSLocalNetworkUsageDescription` is added to Info.plist
- iOS never shows the permission prompt
- The only fix is to reset privacy settings

We added the permission keys, but your iPhone cached the old version.

---

## 📱 Expected Result

After the fix, your Xcode console should show:
```
✅ Starting proof generation - Image size: 274861 bytes
🌐 Using backend URL: http://10.0.0.59:3000/prove
✅ Response status: 200
✅ Proof generated successfully
🔐 ZK Proofs generated: 1
```

Instead of:
```
❌ Network error: The Internet connection appears to be offline.
   Error code: -1009
```

---

## 🆘 If Still Not Working

1. **Verify both devices are on same WiFi**:
   - iPhone: Settings → Wi-Fi → Check network name
   - Mac: System Settings → Wi-Fi → Check network name
   - They MUST match exactly

2. **Check Mac firewall**:
   ```bash
   # On Mac terminal:
   sudo /usr/libexec/ApplicationFirewall/socketfilterfw --getglobalstate
   ```
   - If "enabled", temporarily disable it:
   ```bash
   sudo /usr/libexec/ApplicationFirewall/socketfilterfw --setglobalstate off
   ```

3. **Try localhost URL** (if using simulator):
   - In rial app: Settings → Backend URL
   - Change to: `http://localhost:3000`
   - Only works in iOS Simulator, not real device

4. **Use iPhone's hotspot**:
   - Turn on Personal Hotspot on iPhone
   - Connect Mac to iPhone's hotspot
   - Get Mac's new IP: `ifconfig | grep "inet "`
   - Update backend URL in app settings

---

## 🎉 Success Indicators

You'll know it's fixed when:
- ✅ No more "Local network prohibited" in logs
- ✅ Safari on iPhone can load `http://10.0.0.59:3000/health`
- ✅ rial app successfully certifies images
- ✅ You see "✅ Response status: 200" in Xcode console

---

**DO THE RESET NOW - IT'S THE ONLY WAY TO FORCE THE PERMISSION PROMPT!**

