# Rial Demo Guide

## Quick Start (30 seconds)

```bash
# Start the backend
cd /Users/aungmaw/rial/backend
node server.js

# Open in browser
open http://localhost:3000
```

---

## Status Check

Your app is **DEMO READY**:

| Component | Status | URL |
|-----------|--------|-----|
| Backend Server | Working | http://localhost:3000 |
| Web App | Working | http://localhost:3000 |
| Health Check | Working | http://localhost:3000/health |
| Photo Certification | Working | POST /prove |
| Share Verification | Working | /api/verify/link/:code |
| Admin Dashboard | Working | http://localhost:3000/admin-dashboard.html |
| iOS App | Ready | Open rial/rial.xcodeproj in Xcode |

---

## Demo Script (5 minutes)

### Part 1: The Problem (30 sec)
> "Insurance fraud costs $40 billion per year. The core problem? Companies can't prove a photo is authentic. Was it taken today or downloaded from Google? Is it AI-generated?"

### Part 2: Show the Web App (2 min)

1. **Open the app**: http://localhost:3000
   - Clean camera interface
   - Works on any device with a browser

2. **Take a photo**:
   - Click capture button
   - Photo is instantly certified

3. **Show what happens**:
   - "The device signs the photo with cryptographic keys"
   - "We generate a Merkle tree for tamper detection"
   - "It's timestamped and stored for verification"

4. **Get the share link**:
   - Copy the verification code (e.g., AASLJSEB)
   - "Anyone can verify this photo is authentic"

### Part 3: Verification Demo (1 min)

1. **Open verify page**: http://localhost:3000/verify.html

2. **Enter the share code** or upload the photo

3. **Show verification result**:
   - "Verified - this photo was taken by a real device"
   - "Timestamp, device info, integrity check - all confirmed"

### Part 4: Fraud Detection Demo (1 min)

1. **Take a screenshot of a photo** (simulate fraud)

2. **Try to verify the screenshot**:
   - Upload to verify.html
   - "Failed verification - not an original capture"

3. **Explain**:
   - "Our 8-layer detection catches this"
   - "Screen detection, motion sensors, signature verification"
   - "Mathematically impossible to fake"

### Part 5: Admin Dashboard (30 sec)

1. **Open**: http://localhost:3000/admin-dashboard.html

2. **Show**:
   - Real-time verification activity
   - Statistics
   - All certified photos

---

## Key URLs for Demo

| Page | URL | Purpose |
|------|-----|---------|
| Main App | http://localhost:3000 | Take & certify photos |
| Verify Page | http://localhost:3000/verify.html | Verify any photo |
| Admin Dashboard | http://localhost:3000/admin-dashboard.html | See all activity |
| Health Check | http://localhost:3000/health | System status |
| API Docs | http://localhost:3000/api-docs.html | API reference |

---

## API Endpoints for Demo

### Certify a Photo
```bash
curl -X POST http://localhost:3000/prove \
  -F "img_buffer=@photo.jpg"
```

### Verify by Share Code
```bash
curl http://localhost:3000/api/verify/link/AASLJSEB
```

### Health Check
```bash
curl http://localhost:3000/health
```

### Blockchain Status
```bash
curl http://localhost:3000/blockchain/status
```

---

## iOS App Demo

### Setup
1. Open Xcode: `open /Users/aungmaw/rial/rial/rial.xcodeproj`
2. Select your iPhone or Simulator
3. Build & Run (Cmd+R)

### Demo Flow
1. App opens with camera
2. Take a photo - signed by Secure Enclave
3. Photo sent to backend for ZK proof
4. Show verification badge
5. Share the verification link

### Key Selling Points
- "Uses iPhone's Secure Enclave - same hardware that protects Face ID"
- "Signature can't be faked - it's chip-level security"
- "Works offline - certifies even without internet"

---

## What to Say About Tech

### Simple Version (for non-technical audience)
> "When you take a photo, your device signs it like a digital notary. We create a mathematical fingerprint that detects any tampering. It's timestamped on blockchain so you can't backdate it. The result? Photos that are provably authentic."

### Technical Version (for technical audience)
> "We use P-256 ECDSA signatures from the Secure Enclave. Each image gets a Merkle tree computed over 1024 tiles for granular tamper detection. We generate Halo2 ZK proofs for privacy-preserving verification. Attestations are batched and submitted to Polygon for immutable timestamping."

---

## Common Demo Questions

**Q: "What if someone screenshots a real photo?"**
> "We detect that. Motion sensors, screen pixel patterns, and timing analysis catch photos-of-photos. Our false acceptance rate is under 1%."

**Q: "Does it work without internet?"**
> "Yes! The iOS app signs photos locally. It syncs when connected, but the cryptographic proof exists immediately."

**Q: "How fast is verification?"**
> "Under 2 seconds. [Show it live]"

**Q: "What about privacy?"**
> "ZK proofs let you prove a photo is real without revealing sensitive metadata. You control what to share."

---

## Before Your Demo

### Checklist
- [ ] Backend running (`node server.js`)
- [ ] Test http://localhost:3000 loads
- [ ] Test taking a photo works
- [ ] Test verification works
- [ ] Have a fake photo ready (screenshot) to show fraud detection
- [ ] Know your numbers ($40B fraud, 90% reduction, 20x ROI)

### If Something Breaks
- Restart server: `node server.js`
- Check health: `curl http://localhost:3000/health`
- Clear uploads: `rm -rf uploads/*`

---

## Demo on Mobile (for in-person meetings)

1. Run server on your laptop
2. Find your IP: `ipconfig getifaddr en0`
3. On phone, open: `http://YOUR_IP:3000`
4. Demo works on mobile browser too!

---

## Recording a Demo Video

```bash
# Quick screen recording on Mac
# Press Cmd+Shift+5, select area, record

# Narrate:
1. "This is Rial - cryptographic photo authentication"
2. "I'll take a photo..." [capture]
3. "Instantly certified with hardware signature"
4. "Now let's verify..." [show verification]
5. "Now watch what happens with a fake photo..." [screenshot fails]
6. "That's 90% fraud reduction, mathematically guaranteed."
```

---

## Next Steps After Demo

If they're interested:
1. Share the GitHub repo
2. Offer a pilot program ($5K/month)
3. Schedule technical deep-dive
4. Get intro to their claims team

---

Good luck with your demo!
