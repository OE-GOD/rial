#!/usr/bin/env node

/**
 * Quick test script for AI screen detection
 */

const fs = require('fs').promises;
const path = require('path');
const sharp = require('sharp');

async function testScreenDetection() {
    console.log('🤖 Testing AI Screen Detection System\n');

    try {
        // Test with the basic agent first
        const screenDetectionAgent = require('./ai/screen-detection-agent');
        
        // Create test image (simulated screen)
        const screenImage = await sharp({
            create: {
                width: 800,
                height: 600,
                channels: 3,
                background: { r: 20, g: 20, b: 30 }
            }
        })
        .composite([{
            input: Buffer.from(`
                <svg width="800" height="600">
                    <defs>
                        <pattern id="grid" x="0" y="0" width="3" height="3" patternUnits="userSpaceOnUse">
                            <rect x="0" y="0" width="1" height="3" fill="#ff0000" opacity="0.05"/>
                            <rect x="1" y="0" width="1" height="3" fill="#00ff00" opacity="0.05"/>
                            <rect x="2" y="0" width="1" height="3" fill="#0000ff" opacity="0.05"/>
                        </pattern>
                    </defs>
                    <rect width="800" height="600" fill="url(#grid)"/>
                    <rect x="50" y="50" width="700" height="500" fill="#111" stroke="#333" stroke-width="2"/>
                    <text x="400" y="300" font-size="48" fill="white" text-anchor="middle">TEST SCREEN</text>
                </svg>
            `),
            top: 0,
            left: 0
        }])
        .jpeg({ quality: 90 })
        .toBuffer();

        // Create test image (real scene)
        const realImage = await sharp({
            create: {
                width: 800,
                height: 600,
                channels: 3,
                background: { r: 135, g: 206, b: 235 }
            }
        })
        .composite([{
            input: Buffer.from(`
                <svg width="800" height="600">
                    <circle cx="100" cy="100" r="50" fill="#FFD700"/>
                    <ellipse cx="400" cy="500" rx="300" ry="100" fill="#228B22"/>
                    <polygon points="200,400 300,200 400,400" fill="#8B4513"/>
                    <text x="400" y="300" font-size="48" fill="black" text-anchor="middle">REAL SCENE</text>
                </svg>
            `),
            top: 0,
            left: 0
        }])
        .jpeg({ quality: 90 })
        .toBuffer();

        // Test screen image
        console.log('Testing screen image...');
        const screenResult = await screenDetectionAgent.detectScreen(screenImage);
        console.log('Screen Detection Result:');
        console.log(`  Is Screen: ${screenResult.verdict.isScreen}`);
        console.log(`  Confidence: ${(screenResult.verdict.confidence * 100).toFixed(1)}%`);
        console.log(`  Risk: ${screenResult.verdict.risk}`);
        if (screenResult.signals) {
            console.log('  Detected patterns:');
            Object.entries(screenResult.signals).forEach(([signal, data]) => {
                if (data.detected) {
                    console.log(`    - ${signal}: ${data.confidence ? (data.confidence * 100).toFixed(0) + '%' : 'detected'}`);
                }
            });
        }
        console.log('');

        // Test real image
        console.log('Testing real scene image...');
        const realResult = await screenDetectionAgent.detectScreen(realImage);
        console.log('Real Scene Detection Result:');
        console.log(`  Is Screen: ${realResult.verdict.isScreen}`);
        console.log(`  Confidence: ${(realResult.verdict.confidence * 100).toFixed(1)}%`);
        console.log(`  Risk: ${realResult.verdict.risk}`);
        if (realResult.signals) {
            console.log('  Detected patterns:');
            Object.entries(realResult.signals).forEach(([signal, data]) => {
                if (data.detected) {
                    console.log(`    - ${signal}: ${data.confidence ? (data.confidence * 100).toFixed(0) + '%' : 'detected'}`);
                }
            });
        }
        console.log('');

        // Test unified detector if available
        try {
            const unifiedDetector = require('./ai/unified-screen-detector');
            
            // Note: Full initialization requires TensorFlow models
            console.log('Testing Unified Detector (without ML models)...\n');
            
            // Quick test without full initialization
            const quickResult = await unifiedDetector.detect({
                image: screenImage,
                metadata: { testMode: true }
            });
            
            console.log('Unified Detection available but requires full setup.');
            console.log('Run "npm run ai:demo" for complete demonstration.\n');
            
        } catch (error) {
            console.log('Unified Detector requires additional setup.');
            console.log('This is expected if TensorFlow is not installed.\n');
        }

        // Save test images for inspection
        await fs.writeFile(path.join(__dirname, 'test-screen.jpg'), screenImage);
        await fs.writeFile(path.join(__dirname, 'test-real.jpg'), realImage);
        
        console.log('✅ Test completed successfully!');
        console.log('Test images saved: test-screen.jpg, test-real.jpg\n');

        // Summary
        const correct = !realResult.verdict.isScreen && screenResult.verdict.isScreen;
        console.log(`Summary: ${correct ? '✅ Both correctly identified' : '❌ Misclassification detected'}`);

    } catch (error) {
        console.error('❌ Test failed:', error.message);
        console.log('\nThis might be because TensorFlow is not installed.');
        console.log('For full functionality, run: npm install\n');
    }
}

// Run test
testScreenDetection();
