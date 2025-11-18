#!/usr/bin/env node

/**
 * Test script for Screen Detection AI Agent
 */

const axios = require('axios');
const FormData = require('form-data');
const fs = require('fs').promises;
const sharp = require('sharp');
const path = require('path');

const API_URL = process.env.API_URL || 'http://localhost:3000';

/**
 * Generate test images
 */
async function generateTestImages() {
    console.log('🎨 Generating test images...\n');

    // 1. Real photo simulation (natural scene)
    const realPhoto = await sharp({
        create: {
            width: 800,
            height: 600,
            channels: 3,
            background: { r: 135, g: 206, b: 235 } // Sky blue
        }
    })
    .composite([
        {
            input: Buffer.from(`<svg width="800" height="600">
                <!-- Sun -->
                <circle cx="100" cy="100" r="50" fill="#FFD700"/>
                <!-- Clouds -->
                <ellipse cx="200" cy="150" rx="80" ry="40" fill="white" opacity="0.8"/>
                <ellipse cx="250" cy="130" rx="60" ry="35" fill="white" opacity="0.8"/>
                <!-- Mountains -->
                <polygon points="0,600 200,300 400,600" fill="#8B4513"/>
                <polygon points="300,600 500,200 700,600" fill="#A0522D"/>
                <!-- Trees -->
                <rect x="150" y="500" width="40" height="100" fill="#654321"/>
                <circle cx="170" cy="480" r="60" fill="#228B22"/>
            </svg>`),
            left: 0,
            top: 0
        }
    ])
    // Add noise to simulate real camera sensor
    .blur(0.5)
    .sharpen()
    .jpeg({ quality: 85 })
    .toBuffer();

    await fs.writeFile('test-real-photo.jpg', realPhoto);

    // 2. Screen photo simulation (with moiré and artifacts)
    const screenPhoto = await sharp({
        create: {
            width: 800,
            height: 600,
            channels: 3,
            background: { r: 20, g: 20, b: 25 } // Dark background
        }
    })
    .composite([
        {
            input: Buffer.from(`<svg width="800" height="600">
                <!-- Screen content -->
                <rect x="50" y="50" width="700" height="500" fill="#1a1a1a" stroke="#333" stroke-width="2"/>
                <text x="400" y="300" font-family="Arial" font-size="48" fill="white" text-anchor="middle">
                    SCREEN DISPLAY
                </text>
                <!-- Pixel grid pattern (subtle) -->
                <defs>
                    <pattern id="pixels" x="0" y="0" width="3" height="3" patternUnits="userSpaceOnUse">
                        <rect x="0" y="0" width="1" height="3" fill="#ff0000" opacity="0.1"/>
                        <rect x="1" y="0" width="1" height="3" fill="#00ff00" opacity="0.1"/>
                        <rect x="2" y="0" width="1" height="3" fill="#0000ff" opacity="0.1"/>
                    </pattern>
                </defs>
                <rect x="50" y="50" width="700" height="500" fill="url(#pixels)"/>
                <!-- Moiré pattern simulation -->
                <defs>
                    <pattern id="moire" x="0" y="0" width="4" height="4" patternUnits="userSpaceOnUse">
                        <line x1="0" y1="0" x2="4" y2="4" stroke="#444" stroke-width="0.5" opacity="0.3"/>
                    </pattern>
                </defs>
                <rect x="50" y="50" width="700" height="500" fill="url(#moire)"/>
            </svg>`),
            left: 0,
            top: 0
        }
    ])
    // Add blue light bias
    .modulate({ lightness: 1.1 })
    .tint({ r: 240, g: 240, b: 255 }) // Slight blue tint
    .jpeg({ quality: 90 })
    .toBuffer();

    await fs.writeFile('test-screen-photo.jpg', screenPhoto);

    // 3. Borderline case - high quality print
    const printPhoto = await sharp({
        create: {
            width: 800,
            height: 600,
            channels: 3,
            background: { r: 255, g: 255, b: 255 }
        }
    })
    .composite([
        {
            input: Buffer.from(`<svg width="800" height="600">
                <rect x="100" y="100" width="600" height="400" fill="white" stroke="black" stroke-width="1"/>
                <text x="400" y="300" font-family="Arial" font-size="36" fill="black" text-anchor="middle">
                    High Quality Print
                </text>
                <circle cx="200" cy="200" r="50" fill="#FF6B6B"/>
                <rect x="500" y="150" width="100" height="100" fill="#4ECDC4"/>
            </svg>`),
            left: 0,
            top: 0
        }
    ])
    .jpeg({ quality: 95 })
    .toBuffer();

    await fs.writeFile('test-print-photo.jpg', printPhoto);

    console.log('✅ Generated test images:');
    console.log('   - test-real-photo.jpg (natural scene)');
    console.log('   - test-screen-photo.jpg (screen with artifacts)');
    console.log('   - test-print-photo.jpg (borderline case)');
}

/**
 * Test screen detection on a single image
 */
async function testSingleDetection(imagePath, metadata = {}) {
    console.log(`\n🔍 Testing: ${path.basename(imagePath)}`);
    
    const formData = new FormData();
    const imageBuffer = await fs.readFile(imagePath);
    formData.append('image', imageBuffer, path.basename(imagePath));
    
    // Add simulated metadata
    const enrichedMetadata = {
        focusDistance: metadata.focusDistance || Math.random() * 5,
        brightnessValue: metadata.brightnessValue || Math.random() * 10,
        flashFired: metadata.flashFired || false,
        whiteBalance: metadata.whiteBalance || 'auto',
        captureTime: new Date().toISOString(),
        ...metadata
    };
    
    formData.append('metadata', JSON.stringify(enrichedMetadata));

    try {
        const response = await axios.post(
            `${API_URL}/ai/detect-screen`,
            formData,
            { headers: formData.getHeaders() }
        );

        const { detection } = response.data;
        
        console.log('\n📊 Detection Results:');
        console.log(`   Verdict: ${detection.verdict.isScreen ? '🖥️ SCREEN DETECTED' : '✅ REAL PHOTO'}`);
        console.log(`   Confidence: ${(detection.verdict.confidence * 100).toFixed(1)}%`);
        console.log(`   Risk Level: ${detection.verdict.risk}`);
        console.log(`   Score: ${detection.verdict.score.toFixed(3)}`);
        
        if (detection.evidence.strongIndicators.length > 0) {
            console.log('\n   🚨 Strong Indicators:');
            detection.evidence.strongIndicators.forEach(ind => {
                console.log(`      - ${ind}`);
            });
        }
        
        if (detection.evidence.weakIndicators.length > 0) {
            console.log('\n   ⚠️  Weak Indicators:');
            detection.evidence.weakIndicators.forEach(ind => {
                console.log(`      - ${ind}`);
            });
        }
        
        console.log('\n   📈 Technical Scores:');
        console.log(`      - Moiré Pattern: ${(detection.technical.moirePattern.score * 100).toFixed(1)}%`);
        console.log(`      - Pixel Pattern: ${(detection.technical.pixelPattern.score * 100).toFixed(1)}%`);
        console.log(`      - Color Profile: ${(detection.technical.colorProfile.score * 100).toFixed(1)}%`);
        console.log(`      - Edge Profile: ${(detection.technical.edgeProfile.score * 100).toFixed(1)}%`);
        console.log(`      - Metadata: ${(detection.technical.metadata.score * 100).toFixed(1)}%`);
        
        console.log('\n   💡 Recommendations:');
        detection.recommendations.forEach(rec => {
            console.log(`      - ${rec}`);
        });

        return detection;

    } catch (error) {
        console.error('❌ Detection failed:', error.response?.data || error.message);
        throw error;
    }
}

/**
 * Test batch detection
 */
async function testBatchDetection() {
    console.log('\n\n📦 Testing batch detection...');
    
    const formData = new FormData();
    const images = [
        'test-real-photo.jpg',
        'test-screen-photo.jpg',
        'test-print-photo.jpg'
    ];
    
    for (let i = 0; i < images.length; i++) {
        const imageBuffer = await fs.readFile(images[i]);
        formData.append('images', imageBuffer, images[i]);
        
        // Add metadata for each
        formData.append(`metadata_${i}`, JSON.stringify({
            focusDistance: i === 1 ? 0.5 : 2.0, // Screen is close
            brightnessValue: i === 1 ? 3 : 7,
            flashFired: false
        }));
    }
    
    try {
        const response = await axios.post(
            `${API_URL}/ai/batch-detect`,
            formData,
            { headers: formData.getHeaders() }
        );
        
        console.log('\n📊 Batch Results Summary:');
        console.log(`   Total Images: ${response.data.summary.total}`);
        console.log(`   Screens Detected: ${response.data.summary.screensDetected}`);
        console.log(`   Errors: ${response.data.summary.errors}`);
        
        console.log('\n   Individual Results:');
        response.data.results.forEach(result => {
            const verdict = result.detection?.verdict;
            console.log(`   ${result.filename}: ${
                verdict?.isScreen ? '🖥️ SCREEN' : '✅ REAL'
            } (${(verdict?.confidence * 100 || 0).toFixed(1)}%)`);
        });
        
    } catch (error) {
        console.error('❌ Batch detection failed:', error.response?.data || error.message);
    }
}

/**
 * Test with real-world scenarios
 */
async function testRealWorldScenarios() {
    console.log('\n\n🌍 Testing real-world scenarios...\n');
    
    const scenarios = [
        {
            name: 'Close-up screen photo',
            metadata: {
                focusDistance: 0.3,
                brightnessValue: 2,
                whiteBalance: 'fluorescent',
                indoorShot: true
            }
        },
        {
            name: 'Outdoor real photo',
            metadata: {
                focusDistance: 10,
                brightnessValue: 9,
                whiteBalance: 'daylight',
                gpsHistory: [{lat: 37.7749, lng: -122.4194}]
            }
        },
        {
            name: 'TV in dark room',
            metadata: {
                focusDistance: 2,
                brightnessValue: 1,
                whiteBalance: 'tungsten',
                flashFired: false
            }
        }
    ];
    
    for (const scenario of scenarios) {
        console.log(`📍 Scenario: ${scenario.name}`);
        // You would use actual photos here
        await new Promise(resolve => setTimeout(resolve, 1000));
        console.log('   (Would test with real photo in production)');
    }
}

/**
 * Main test function
 */
async function main() {
    try {
        // Check if server is running
        try {
            await axios.get(`${API_URL}/health`);
        } catch (error) {
            console.error('❌ Server not running at', API_URL);
            console.log('Please start the server first: npm start');
            process.exit(1);
        }
        
        console.log('🤖 Screen Detection AI Agent Test Suite');
        console.log('=' .repeat(50));
        
        // Generate test images
        await generateTestImages();
        
        // Test individual detections
        console.log('\n\n📸 Individual Detection Tests');
        console.log('=' .repeat(50));
        
        await testSingleDetection('test-real-photo.jpg', {
            focusDistance: 5,
            whiteBalance: 'daylight'
        });
        
        await testSingleDetection('test-screen-photo.jpg', {
            focusDistance: 0.5,
            whiteBalance: 'fluorescent'
        });
        
        await testSingleDetection('test-print-photo.jpg', {
            focusDistance: 1.5,
            whiteBalance: 'auto'
        });
        
        // Test batch detection
        await testBatchDetection();
        
        // Test real-world scenarios
        await testRealWorldScenarios();
        
        console.log('\n\n✅ All tests completed!');
        console.log('\n💡 Next steps:');
        console.log('   1. Train the ML model with real screen/photo datasets');
        console.log('   2. Fine-tune detection thresholds based on results');
        console.log('   3. Integrate with main ZK-IMG proof generation');
        console.log('   4. Add to iOS app pre-certification checks');
        
    } catch (error) {
        console.error('\n❌ Test suite failed:', error.message);
        process.exit(1);
    }
}

// Run the tests
main();
