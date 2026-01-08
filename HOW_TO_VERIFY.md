# 🔍 How to Check if an Image is Real or Fake

This guide explains how to verify image authenticity using the Rial Image Attestation System.

---

## ✅ **Method 1: Use the iOS App (Easiest)**

### Step-by-Step:

1. **Capture an image** in the Rial app
2. **Adjust the crop** as needed
3. **Tap "Certify Image"**
4. **Read the result** in the alert:

```
✅ Success!
Image received and verified
Signature: Valid ✓
```

- **"Signature: Valid"** = ✅ **Image is REAL and AUTHENTIC**
- **"Signature: Invalid"** = ❌ **Image has been TAMPERED WITH**

---

## 🖥️ **Method 2: Check the Backend Server Logs**

### Start the Backend:
```bash
cd backend
node server.js
```

### What to Look For:

When you certify an image, the server prints detailed verification:

#### ✅ **AUTHENTIC Image** (Real):
```
🔐 Starting signature verification...
   🔍 Starting signature verification...
   📏 Signature length: 70 bytes
   📏 Public key length: 91 bytes
   🌳 Merkle root to verify: abc123...
   🔑 Public key (hex): 04a5b2...
   📝 Signature r length: 32, s length: 32
   ✅ Signature verification: VALID
🔐 Signature verification: ✅ VALID
```

#### ❌ **FAKE Image** (Tampered/Forged):
```
🔐 Starting signature verification...
   🔍 Starting signature verification...
   ❌ Signature is empty
   OR
   ❌ Signature verification: INVALID
🔐 Signature verification: ❌ INVALID
```

---

## 🔬 **Method 3: Understanding What Gets Verified**

### The System Checks:

1. **✅ Signature Exists**
   - Real: Has cryptographic signature from Secure Enclave
   - Fake: Missing or empty signature

2. **✅ Public Key Valid**
   - Real: Valid P-256 ECDSA public key (91 bytes in SPKI format)
   - Fake: Missing, wrong format, or invalid key

3. **✅ Merkle Root Present**
   - Real: Has SHA-256 hash tree of image tiles
   - Fake: Missing or doesn't match image content

4. **✅ Cryptographic Verification**
   - Real: Signature mathematically verifies against Merkle root
   - Fake: Signature doesn't match (image was modified)

5. **✅ Timestamp**
   - Real: ISO 8601 timestamp from capture time
   - Fake: Missing or suspicious timestamp

---

## 🧪 **Method 4: Test with Manual Verification**

### Quick Test Script:

```bash
cd backend
node verify-image.js --check image-1762065402914.png
```

This will show you the verification process step-by-step.

---

## 📊 **Method 5: Check the Response JSON**

When the app sends an image, the backend returns JSON:

### ✅ Authentic Image Response:
```json
{
  "success": true,
  "message": "Image received and verified",
  "signatureValid": true,  ← ✅ REAL
  "imageUrl": "/uploads/image-1762065402914.png",
  "c2paClaim": {
    "imageRoot": "abc123...",
    "publicKey": "MFkw...",
    "signature": "MEU...",
    "timestamp": "2025-11-02T10:30:02Z"
  },
  "timestamp": "2025-11-02T10:30:02.123Z"
}
```

### ❌ Fake/Tampered Image Response:
```json
{
  "success": true,
  "message": "Image received and verified",
  "signatureValid": false,  ← ❌ FAKE/TAMPERED
  ...
}
```

---

## 🔑 **What Makes an Image "Real" vs "Fake"?**

### ✅ **REAL (Authentic) Image:**
- Captured directly by the Rial app camera
- Signed immediately with iOS Secure Enclave
- Merkle tree computed from actual pixel data
- Signature mathematically verifiable
- Timestamp proves when it was captured
- **Cannot be forged** without the private key (which never leaves Secure Enclave)

### ❌ **FAKE (Tampered/Forged) Image:**
- Imported from camera roll or other apps
- Missing cryptographic signature
- Invalid or forged signature
- Modified after capture (even 1 pixel change invalidates it)
- Screenshot of a real image (different pixel data)
- Edited in Photoshop/other apps

---

## 🚨 **Warning Signs of Fake Images**

The system will detect:

1. ❌ **No signature** - Image didn't come from the app
2. ❌ **Invalid signature** - Image was modified after signing
3. ❌ **Wrong Merkle root** - Pixel data doesn't match claim
4. ❌ **Empty public key** - No device identity
5. ❌ **Signature format error** - Forged or corrupted signature
6. ❌ **Verification failure** - Mathematical proof doesn't check out

---

## 🎯 **Real-World Example**

### Scenario: Insurance Claim Photo Verification

1. **Policyholder** takes damage photo with Rial app
2. **App** signs image with device's Secure Enclave key
3. **Upload** to insurance company server
4. **Server** verifies:
   ```
   ✅ Signature valid
   ✅ Timestamp: 2025-11-02 14:30:00 UTC
   ✅ Device: iPhone (public key xyz...)
   ✅ Not modified since capture
   ```
5. **Decision**: Claim accepted - photo is provably authentic

If policyholder tried to submit:
- Photo from Google Images → ❌ No signature
- Photoshopped damage → ❌ Merkle root mismatch
- Screenshot of real photo → ❌ Different pixel data

**All would be rejected as FAKE! 🚫**

---

## 📱 **Quick Reference Card**

| Check This | Real Image | Fake Image |
|------------|------------|------------|
| Signature | ✅ Valid ECDSA | ❌ Missing/Invalid |
| Public Key | ✅ 91 bytes SPKI | ❌ Empty/Wrong |
| Merkle Root | ✅ Matches pixels | ❌ Doesn't match |
| Timestamp | ✅ ISO 8601 | ❌ Missing |
| Verification | ✅ `signatureValid: true` | ❌ `signatureValid: false` |
| Source | ✅ Rial camera | ❌ Import/screenshot |
| Modifications | ✅ None after signing | ❌ Edited/cropped wrong |

---

## 💡 **Pro Tips**

1. **Always check `signatureValid` in the response** - this is your truth signal
2. **Watch the server logs** for detailed verification steps
3. **Images captured outside the app won't have signatures** - they'll fail verification
4. **Even tiny edits invalidate signatures** - 1 pixel change = tampered
5. **Timestamp proves when photo was taken** - can't be backdated

---

## 🔐 **Security Guarantees**

With this system, you can **mathematically prove**:
- ✅ Image came from a specific trusted device
- ✅ Image was captured at a specific time
- ✅ Image has NOT been modified since capture
- ✅ Signature cannot be forged (Secure Enclave protection)

**Bottom line: If `signatureValid: true`, the image is REAL! 🎯**

