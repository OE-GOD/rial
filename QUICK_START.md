# 🚀 Quick Start: Checking Image Authenticity

## The 3-Second Answer

After certifying an image in the app, look at the alert:

```
✅ "Signature: Valid"   = IMAGE IS REAL
❌ "Signature: Invalid" = IMAGE IS FAKE
```

**That's it!** The cryptography does all the work for you.

---

## Live Demo (30 seconds)

### 1. Start the Backend
```bash
cd backend
node server.js
```

You'll see:
```
🚀 Backend server listening at http://0.0.0.0:3000
📱 Access from iPhone at http://10.0.0.132:3000
```

### 2. Use the iOS App
1. Open **Rial** app on your iPhone
2. Tap the **camera button** to take a photo
3. Adjust the **crop area** if needed
4. Tap **"Certify Image"** button

### 3. Watch the Magic ✨

**On your Mac (server console):**
```
📥 Received request to /prove
✅ Image received: 331456 bytes
📊 C2PA Claim parsed:
   - Merkle Root: f8a3b2c1d4e5f6a7b8c9d0e1...
   - Timestamp: 2025-11-02T10:30:02.123Z
🔐 Starting signature verification...
   🔍 Starting signature verification...
   📏 Signature length: 70 bytes
   📏 Public key length: 91 bytes
   🌳 Merkle root to verify: f8a3b2c1d4e5f6a7...
   ✅ Signature verification: VALID    ← ✅ REAL!
🔐 Signature verification: ✅ VALID
✅ Response ready: SUCCESS
```

**On your iPhone (app alert):**
```
┌─────────────────────────────┐
│      Success! ✅            │
├─────────────────────────────┤
│ Image received and verified │
│ Signature: Valid ✓          │  ← ✅ REAL!
│                             │
│           [ OK ]            │
└─────────────────────────────┘
```

---

## What It's Checking

Behind the scenes, the system verifies:

1. ✅ **Signature exists** (not empty)
2. ✅ **Public key valid** (P-256 ECDSA format)
3. ✅ **Merkle root matches** (image hasn't changed)
4. ✅ **Cryptographic proof** (ECDSA verification passes)
5. ✅ **Timestamp present** (when photo was taken)

If **ANY** of these fail → `signatureValid: false` → **FAKE!**

---

## Test It Yourself

### Try to Fake an Image:

1. **Take a screenshot** of a certified image
2. Try to **certify the screenshot** in the app
3. **Result**: ❌ Will fail (different pixel data, no signature)

Or:

1. **Import a photo** from your camera roll
2. Try to **certify it**
3. **Result**: ❌ Will fail (no Secure Enclave signature)

**Only photos taken DIRECTLY in the Rial app can be verified!** 🔐

---

## Files Created

I've created these guides for you:

1. **`HOW_TO_VERIFY.md`** - Comprehensive verification guide
2. **`test-verification.js`** - Run demos and tests
3. **`verify-image.js`** - Manual verification tool
4. **`QUICK_START.md`** - This file (quick reference)

---

## Need Help?

Run the test script:
```bash
cd backend
node test-verification.js
```

It shows you:
- What authentic vs fake images look like
- Your uploaded images
- Step-by-step instructions
- Common failure scenarios

---

## The Bottom Line

### ✅ **REAL Images:**
- Come from Rial app camera
- Have valid ECDSA signatures
- Verified by Secure Enclave
- **Cannot be faked!**

### ❌ **FAKE Images:**
- Imported from elsewhere
- Screenshots or edits
- Missing/invalid signatures
- **Automatically detected!**

**Look for `signatureValid: true` → You're good! 🎯**

