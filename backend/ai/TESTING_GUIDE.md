# 🧪 AI Screen Detection - Testing Guide

## Quick Start

### 1. **Simple Demo** (Fastest - No setup required)
```bash
cd backend
node test-ai-simple.js
```
**What it does**: Demonstrates detection on 7 different scenarios (LCD, OLED, phones, real scenes)  
**Time**: 1 second  
**Output**: Accuracy report with detected signals

### 2. **Test with Real Images**
```bash
cd backend
node test-with-real-image.js path/to/your/image.jpg
```
**What it does**: Analyzes any image file for screen characteristics  
**Time**: 1-2 seconds  
**Output**: Detection verdict with confidence and evidence

### 3. **Test with iOS App Photos**
```bash
# Take a photo with your iOS app, then:
cd backend
node test-with-real-image.js ~/path/to/certified-image.jpg
```

## Testing Methods

### Method 1: Quick Capability Demo ⚡

**Best for**: Understanding what the system can do

```bash
node test-ai-simple.js
```

**Output**:
```
✓ 🖥️ 27" LCD Monitor → SCREEN (100% confidence)
✓ 🖥️ 65" OLED TV (8K) → SCREEN (100% confidence) ⭐
✓ 🖥️ iPhone 15 Pro Screen → SCREEN (100% confidence)
✓ ✅ Real Outdoor Scene → REAL (0% confidence)

Results: 6/7 correct (85.7% accuracy)
```

### Method 2: Test Your Own Images 📸

**Best for**: Testing with real photos

```bash
# Test a specific image
node test-with-real-image.js myimage.jpg

# Test multiple images
for img in *.jpg; do
    echo "Testing $img"
    node test-with-real-image.js "$img"
done
```

**Example Output**:
```
🔍 Testing Real Image with AI Screen Detection

📁 Image: photo.jpg
📦 Size: 342.56 KB

Detection Result:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

✅ REAL SCENE
Confidence: 95.3%
Risk Level: low

Detected Signals:
  • naturalDepth (95%)
  • organicTexture (88%)

✅ RECOMMENDATION: ACCEPT
This image appears to be an authentic capture.
```

### Method 3: Full Demo with ML Models 🤖

**Best for**: Complete system testing with trained models

```bash
# Install TensorFlow (one-time)
npm install

# Generate training data (one-time)
npm run ai:generate-data

# Train models (one-time, takes ~10 minutes)
npm run ai:train

# Run comprehensive demo
npm run ai:demo
```

**Output**: Complete test report with:
- Detection results for 8 screen types
- Performance benchmarks
- Confusion matrix
- Detailed evidence analysis
- Saved report files

### Method 4: Integration Test with Backend API 🌐

**Best for**: Testing the full stack

```bash
# Start the backend server
npm start

# In another terminal, test the API
curl -X POST http://localhost:3000/ai/detect-screen \
  -F "image=@test-screen.jpg" \
  | jq '.'
```

**Example Response**:
```json
{
  "verdict": {
    "isScreen": true,
    "confidence": 0.96,
    "risk": "high"
  },
  "signals": {
    "moirePattern": { "detected": true, "confidence": 0.92 },
    "pixelGrid": { "detected": true, "confidence": 0.88 },
    "blueLight": { "detected": true, "confidence": 0.85 }
  },
  "recommendation": "reject"
}
```

### Method 5: iOS App Integration Test 📱

**Best for**: End-to-end testing

1. **Take a photo with your iOS app**
2. **The app sends to backend** (already integrated)
3. **Backend runs AI detection**
4. **App receives result**

Test flow:
```swift
// In your iOS app
let result = await detectScreen(image: capturedImage)

if result.isScreen {
    showAlert("Screen detected! Photo rejected.")
} else {
    proceedWithCertification()
}
```

## Test Scenarios

### ✅ Should Detect as SCREEN

1. **LCD Monitor Photo**
   ```bash
   # Take photo of your computer monitor
   node test-with-real-image.js monitor-photo.jpg
   # Expected: SCREEN DETECTED
   ```

2. **Phone Screen Photo**
   ```bash
   # Take photo of your phone screen
   node test-with-real-image.js phone-screen.jpg
   # Expected: SCREEN DETECTED
   ```

3. **TV Photo**
   ```bash
   # Take photo of your TV
   node test-with-real-image.js tv-photo.jpg
   # Expected: SCREEN DETECTED
   ```

### ✅ Should Detect as REAL

1. **Outdoor Scene**
   ```bash
   # Take photo of nature/outdoors
   node test-with-real-image.js outdoor.jpg
   # Expected: REAL SCENE
   ```

2. **Portrait**
   ```bash
   # Take photo of a person
   node test-with-real-image.js portrait.jpg
   # Expected: REAL SCENE
   ```

3. **Object Photo**
   ```bash
   # Take photo of any physical object
   node test-with-real-image.js object.jpg
   # Expected: REAL SCENE
   ```

## Test Results Interpretation

### High Confidence (>90%)
```
✅ REAL SCENE
Confidence: 95.3%
Risk Level: low
→ Safe to accept
```

### Medium Confidence (70-90%)
```
⚠️  SCREEN DETECTED
Confidence: 82.1%
Risk Level: medium
→ Flag for manual review
```

### Low Confidence (<70%)
```
🖥️  SCREEN DETECTED
Confidence: 65.4%
Risk Level: medium
→ Recommend manual review
```

### Critical Risk
```
🖥️  SCREEN DETECTED
Confidence: 98.7%
Risk Level: critical
→ Automatically reject
```

## Benchmarking

### Speed Test
```bash
# Test detection speed
time node test-with-real-image.js test-screen.jpg

# Expected:
# Fast Mode: 0.2-0.3s
# Standard Mode: 0.5-0.7s
```

### Accuracy Test
```bash
# Run the demo which tests 7 scenarios
node test-ai-simple.js

# Expected accuracy: 85%+
```

### Stress Test
```bash
# Test with multiple images
for i in {1..100}; do
    node test-with-real-image.js test-screen.jpg > /dev/null
done

# Monitor memory and CPU usage
```

## Troubleshooting

### Issue: "Cannot find module '@tensorflow/tfjs-node'"
**Solution**: TensorFlow is optional for basic detection
```bash
# Basic detection works without TensorFlow
node test-ai-simple.js

# For full ML features, install TensorFlow
npm install @tensorflow/tfjs-node
```

### Issue: "No existing model found"
**Solution**: This is normal - system uses heuristics
```bash
# Train models for ML-based detection
npm run ai:train
```

### Issue: Low accuracy
**Solution**: 
1. Ensure good lighting when taking photos
2. Use multiple detection signals (sensors + visual)
3. Train models with your specific use case data

### Issue: Slow performance
**Solution**:
```bash
# Use fast mode
node -e "
const detector = require('./ai/unified-screen-detector');
detector.updateConfig({ mode: 'fast' });
"
```

## Advanced Testing

### Custom Test Script
```javascript
const screenDetectionAgent = require('./ai/screen-detection-agent');
const fs = require('fs');

async function testBatch(imageFiles) {
    const results = [];
    
    for (const file of imageFiles) {
        const buffer = fs.readFileSync(file);
        const result = await screenDetectionAgent.detectScreen(buffer);
        
        results.push({
            file,
            isScreen: result.verdict.isScreen,
            confidence: result.verdict.confidence
        });
    }
    
    return results;
}

// Test all images in a directory
const images = fs.readdirSync('./test-images')
    .filter(f => f.endsWith('.jpg'));

testBatch(images).then(results => {
    console.log('Batch Test Results:', results);
});
```

### Performance Profiling
```bash
# Profile with Node.js
node --prof test-with-real-image.js test-screen.jpg
node --prof-process isolate-*.log > profile.txt
```

### Memory Profiling
```bash
# Check memory usage
node --expose-gc --trace-gc test-with-real-image.js test-screen.jpg
```

## Continuous Testing

### Automated Testing
```bash
# Add to your CI/CD pipeline
npm test  # Runs all tests including AI detection

# Or create a test script
cat > test-ai-ci.sh << 'EOF'
#!/bin/bash
set -e

echo "Testing AI Screen Detection..."

# Test 1: Simple demo
node test-ai-simple.js

# Test 2: Real images
for img in test-*.jpg; do
    node test-with-real-image.js "$img"
done

echo "All tests passed!"
EOF

chmod +x test-ai-ci.sh
./test-ai-ci.sh
```

### Monitoring in Production
```javascript
// Log detection results for analysis
const result = await detector.detect(image);

logger.info('Screen detection', {
    isScreen: result.verdict.isScreen,
    confidence: result.verdict.confidence,
    signals: Object.keys(result.signals || {}).filter(
        s => result.signals[s].detected
    )
});
```

## Test Data

### Generate Test Images
```bash
# Generate synthetic test data
npm run ai:generate-data

# Creates:
# - training-data/screens/*.jpg (200 screen images)
# - training-data/real/*.jpg (200 real images)
```

### Use Your Own Data
```bash
# Organize your test images
mkdir -p test-images/screens
mkdir -p test-images/real

# Add your images
cp ~/screen-photos/*.jpg test-images/screens/
cp ~/real-photos/*.jpg test-images/real/

# Test them
for img in test-images/screens/*.jpg; do
    echo "Testing screen: $img"
    node test-with-real-image.js "$img"
done
```

## Next Steps

After testing:

1. **Integrate with iOS app** - Already done! ✅
2. **Set confidence thresholds** - Based on your requirements
3. **Monitor production** - Track false positives/negatives
4. **Collect edge cases** - For model retraining
5. **Fine-tune** - Adjust weights and thresholds

## Summary

**Quick Test**: `node test-ai-simple.js`  
**Real Image Test**: `node test-with-real-image.js image.jpg`  
**Full Demo**: `npm run ai:demo`  
**API Test**: `curl -X POST http://localhost:3000/ai/detect-screen -F "image=@test.jpg"`

**Expected Results**:
- ✅ 85%+ accuracy
- ⚡ Sub-second detection
- 🎯 100% confidence on clear screen photos
- 🛡️ Successfully detects 8K displays

---

**Ready to test!** Start with `node test-ai-simple.js` 🚀
