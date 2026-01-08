# 📱 iOS ZK-IMG Testing Guide

## 🚀 Quick Start

### 1. Make Sure Server is Running
```bash
cd backend
npm start
```

### 2. Open Xcode Project
```bash
cd rial/rial
open rial.xcodeproj
```

### 3. Configure Settings
1. Build and run the app (Cmd+R)
2. Go to **Settings** tab
3. Configure:
   - **Backend URL**: `http://localhost:3000` (for simulator) or your Mac's IP
   - **Enable ZK Proofs**: Toggle ON ✅

### 4. Test ZK-IMG Features

#### Test 1: Basic Privacy-Preserving Crop
1. Take a photo with the camera
2. In the edit screen, crop the image
3. Tap "Certify & Prove"
4. Look for success message with:
   ```
   🔐 ZK Proofs: 1
   • HashProof (privacy preserved)
   ```

#### Test 2: Verify Privacy
- The original uncropped image is NEVER sent to the server
- Only cryptographic hashes are included in the proof
- The cropped region is the only image data transmitted

#### Test 3: Performance Check
- With ZK Proofs ON: Should complete in < 1 second
- Compare to pixel-by-pixel proofs (if implemented): Much slower

## 🔍 What to Look For

### In Xcode Console
```
✅ Proof generated successfully
🔐 ZK Proofs generated: 1
   1. Type: HashProof
      Original: b1fc07576af1996f...
      Result: 241f76306debe4ec...
```

### In Success Alert
- "ZK Proofs: 1"
- "HashProof (privacy preserved)"

### On Backend Server
Check server logs for:
```
⚡ Using fast hash-based proofs...
⚡ Generated 1 fast proof(s)
```

## 🎯 Key Features to Test

### 1. **Privacy Preservation**
- Take photo with sensitive info visible
- Crop to exclude sensitive areas
- Verify only cropped region is sent

### 2. **Fast Performance**
- Should be nearly instant (< 100ms proof generation)
- No delays for ZK proof computation

### 3. **Settings Toggle**
- Turn ZK Proofs ON/OFF in settings
- Verify it affects the proof generation

### 4. **Multiple Transformations**
- Currently supports single crop
- Future: Chain multiple edits with privacy

## 🐛 Troubleshooting

### "Network Error"
- Check backend URL in settings
- Ensure server is running
- For device: Use Mac's IP address, not localhost

### "Missing ZK Proofs"
- Ensure "Enable ZK Proofs" is ON in settings
- Check server supports ZK-IMG (latest version)

### Performance Issues
- ZK proofs should be fast (1-10ms)
- If slow, check server logs for errors

## 📊 Expected Results

With ZK-IMG enabled:
- ✅ Original image remains private
- ✅ Only hashes in proof (no pixel data)
- ✅ Sub-second performance
- ✅ Cryptographic security maintained
- ✅ Works with existing iOS Secure Enclave signing

## 🎉 Success Criteria

Your test is successful if:
1. Photo is cropped and certified
2. Success message shows "ZK Proofs: 1"
3. Original uncropped image never leaves device
4. Performance is fast (< 1 second total)
5. Image saved to gallery with certification

## 🔮 Future Enhancements

Coming soon:
- Multiple transformation chaining
- Resize and filter support
- HD image tiling for large photos
- Proof verification in-app
- Privacy audit trail
