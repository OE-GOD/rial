# 📱 App Store Publishing Checklist

## ✅ Step 1: Apple Developer Account
- [ ] Sign up at https://developer.apple.com/programs/enroll/
- [ ] Pay $99/year fee
- [ ] Wait for approval (24-48 hours)

## ✅ Step 2: App Store Connect Setup
1. Go to https://appstoreconnect.apple.com
2. Click "My Apps" → "+" → "New App"
3. Fill in:
   - **Platform**: iOS
   - **Name**: Rial - Photo Verification
   - **Primary Language**: English
   - **Bundle ID**: com.aungmaw.rial
   - **SKU**: rial-photo-verification-2024

## ✅ Step 3: App Information

### App Name Options:
- "Rial - Photo Verification"
- "Rial: ZK Photo Proof"
- "Rial - Certified Photos"

### Subtitle (30 chars max):
"Zero-Knowledge Photo Proofs"

### Category:
- Primary: **Photo & Video**
- Secondary: **Business**

### Description (4000 chars max):
```
Rial is the world's first photo verification app using Zero-Knowledge cryptographic proofs.

🔐 WHAT MAKES RIAL DIFFERENT?

Every photo you take is:
• Signed by your device's Secure Enclave hardware chip
• Protected by a Merkle tree hash (like blockchain)
• Verified with GPS, camera, and motion data
• Impossible to fake or modify

📸 PERFECT FOR:

• Insurance Claims - Prove damage photos are real
• Real Estate - Verify property condition
• Legal Evidence - Tamper-proof documentation
• Business Audits - Certified visual records
• Construction - Progress documentation

🛡️ HOW IT WORKS:

1. Open Rial and take a photo
2. The app captures anti-AI proof metadata:
   - Camera sensor information
   - GPS coordinates
   - Motion sensor data
   - Device attestation

3. Your photo is split into 1024 tiles
4. A Merkle tree is generated from the tiles
5. The Merkle root is signed by your device's Secure Enclave
6. The cryptographic proof is embedded in the photo

🔍 VERIFICATION:

Anyone can verify your photos are real:
• Check the Merkle root hash
• Verify the hardware signature
• Confirm anti-AI metadata
• Validate the timestamp

❌ WHAT CAN'T PASS VERIFICATION:

• Screenshots
• Downloaded images
• AI-generated photos
• Edited or modified photos
• Photos from other apps

✅ ONLY photos taken with Rial have valid ZK proofs!

🌐 FEATURES:

• Beautiful dark-mode interface
• Gallery of all certified photos
• One-tap verification
• Export proofs as PDF
• Share verification QR codes
• Offline certification mode
• Batch photo verification

Built with privacy in mind. Your photos stay on your device. Only cryptographic proofs are shared for verification.

Download Rial today and start capturing provably authentic photos!
```

### Keywords (100 chars max):
```
photo verification,zero knowledge,proof,authentic,insurance,claims,certified,tamper proof,blockchain
```

### Support URL:
https://github.com/OE-GOD/rial

### Privacy Policy URL:
(You need to create one - see Step 4)

## ✅ Step 4: Privacy Policy

Create a privacy policy page. You can use:
- GitHub Pages
- Your own website
- A free service like termly.io

Sample privacy policy content:
```
RIAL PRIVACY POLICY

Last updated: [DATE]

Rial ("we", "our", or "us") operates the Rial mobile application.

DATA WE COLLECT:
- Photos you take within the app
- GPS location (only when you take photos)
- Device information for cryptographic signatures

DATA STORAGE:
- All photos are stored locally on your device
- Cryptographic proofs may be shared for verification
- We do not store your photos on our servers

DATA SHARING:
- We do not sell your data
- Proofs are only shared when you choose to verify

CONTACT:
[Your email]
```

## ✅ Step 5: Screenshots Required

You need screenshots for:
- iPhone 6.7" (iPhone 15 Pro Max)
- iPhone 6.5" (iPhone 14 Plus)
- iPhone 5.5" (iPhone 8 Plus)
- iPad Pro 12.9"

**Screenshots to capture:**
1. Camera view (taking a photo)
2. Verification complete (with green checkmark)
3. Gallery view (showing certified photos)
4. Proof details view
5. Verification test (showing rejected fake photo)

## ✅ Step 6: Configure Xcode for Release

### In Xcode:
1. Select your project in the navigator
2. Select the "rial" target
3. Go to "Signing & Capabilities"
4. Check "Automatically manage signing"
5. Select your Developer Team

### Build Settings:
- iOS Deployment Target: 16.0
- Build Configuration: Release

## ✅ Step 7: Archive and Upload

### In Xcode:
1. Select "Any iOS Device" as destination
2. Product → Archive
3. Wait for archive to complete
4. Window → Organizer
5. Select the archive → "Distribute App"
6. Choose "App Store Connect"
7. Upload

## ✅ Step 8: Submit for Review

### In App Store Connect:
1. Go to your app
2. Click "+ Version or Platform"
3. Fill in version information
4. Add screenshots
5. Select the uploaded build
6. Answer export compliance questions
7. Submit for Review

### Review Times:
- First submission: 24-48 hours
- Updates: Usually same day

## ⚠️ Common Rejection Reasons

1. **Missing Privacy Policy** - Must have valid URL
2. **Incomplete Metadata** - Fill in ALL fields
3. **Poor Screenshots** - Use high-quality images
4. **Crashes** - Test thoroughly before submitting
5. **Permission Descriptions** - Explain why you need camera/location

### Permission Descriptions (already in Info.plist):
- Camera: "Take photos with cryptographic verification"
- Location: "Embed GPS coordinates in photo proofs"
- Photo Library: "Save and access certified photos"

## 🚀 Ready to Submit?

Once you have:
- [ ] Apple Developer Account
- [ ] Privacy Policy URL
- [ ] All screenshots
- [ ] App description finalized

Then follow steps 6-8 to submit!

---

## 💰 App Store Pricing

### Options:
1. **Free** - Good for user adoption
2. **Paid** ($4.99-$9.99) - One-time purchase
3. **Subscription** ($2.99/month) - Recurring revenue
4. **Freemium** - Free with in-app purchases

### Recommendation:
Start with **Free** to get users, then add premium features later.

---

## 📧 Need Help?

Contact Apple Developer Support:
https://developer.apple.com/contact/











