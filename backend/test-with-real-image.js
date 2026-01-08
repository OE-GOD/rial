#!/usr/bin/env node

/**
 * Test AI Screen Detection with Real Images
 * 
 * Usage:
 *   node test-with-real-image.js path/to/image.jpg
 */

const fs = require('fs');
const path = require('path');
const chalk = require('chalk');

async function testRealImage(imagePath) {
    console.log(chalk.bold.cyan('\n🔍 Testing Real Image with AI Screen Detection\n'));

    // Check if file exists
    if (!fs.existsSync(imagePath)) {
        console.error(chalk.red(`❌ File not found: ${imagePath}`));
        process.exit(1);
    }

    // Load the image
    const imageBuffer = fs.readFileSync(imagePath);
    console.log(chalk.dim(`📁 Image: ${path.basename(imagePath)}`));
    console.log(chalk.dim(`📦 Size: ${(imageBuffer.length / 1024).toFixed(2)} KB\n`));

    try {
        // Load the detection agent
        const screenDetectionAgent = require('./ai/screen-detection-agent');

        console.log(chalk.yellow('🤖 Running AI detection...\n'));

        // Run detection
        const result = await screenDetectionAgent.detectScreen(imageBuffer);

        // Display results
        console.log(chalk.bold('Detection Result:'));
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

        const icon = result.verdict.isScreen ? '🖥️  SCREEN DETECTED' : '✅ REAL SCENE';
        const color = result.verdict.isScreen ? 'red' : 'green';
        
        console.log(chalk.bold[color](`${icon}`));
        console.log(chalk.white(`Confidence: ${(result.verdict.confidence * 100).toFixed(1)}%`));
        console.log(chalk.white(`Risk Level: ${result.verdict.risk}\n`));

        // Show detected signals
        if (result.signals) {
            console.log(chalk.bold('Detected Signals:'));
            let signalCount = 0;
            
            Object.entries(result.signals).forEach(([signal, data]) => {
                if (data.detected) {
                    signalCount++;
                    const conf = data.confidence ? ` (${(data.confidence * 100).toFixed(0)}%)` : '';
                    const val = data.value ? ` [${data.value}]` : '';
                    console.log(chalk.yellow(`  • ${signal}${val}${conf}`));
                }
            });

            if (signalCount === 0) {
                console.log(chalk.dim('  No screen patterns detected'));
            }
            console.log('');
        }

        // Recommendations
        if (result.verdict.isScreen) {
            console.log(chalk.bold.red('⚠️  RECOMMENDATION: REJECT'));
            console.log(chalk.dim('This image appears to be photographed from a screen.'));
            console.log(chalk.dim('It should not be used for authentication.\n'));
        } else {
            console.log(chalk.bold.green('✅ RECOMMENDATION: ACCEPT'));
            console.log(chalk.dim('This image appears to be an authentic capture.'));
            console.log(chalk.dim('It can be used for authentication.\n'));
        }

        // Show evidence if available
        if (result.evidence && result.evidence.strong && result.evidence.strong.length > 0) {
            console.log(chalk.bold('Strong Evidence:'));
            result.evidence.strong.forEach(evidence => {
                console.log(chalk.dim(`  • ${evidence}`));
            });
            console.log('');
        }

    } catch (error) {
        console.error(chalk.red('\n❌ Detection failed:'), error.message);
        console.log(chalk.dim('\nMake sure all dependencies are installed:'));
        console.log(chalk.dim('  npm install\n'));
        process.exit(1);
    }
}

// Get image path from command line
const imagePath = process.argv[2];

if (!imagePath) {
    console.log(chalk.yellow('\n📸 Test AI Screen Detection with Your Images\n'));
    console.log('Usage:');
    console.log(chalk.dim('  node test-with-real-image.js path/to/image.jpg\n'));
    console.log('Examples:');
    console.log(chalk.dim('  node test-with-real-image.js test-screen.jpg'));
    console.log(chalk.dim('  node test-with-real-image.js test-real.jpg'));
    console.log(chalk.dim('  node test-with-real-image.js ~/Downloads/photo.jpg\n'));
    
    // Check if test images exist
    const testImages = ['test-screen.jpg', 'test-real.jpg'];
    const available = testImages.filter(img => fs.existsSync(img));
    
    if (available.length > 0) {
        console.log(chalk.green('Available test images:'));
        available.forEach(img => {
            console.log(chalk.dim(`  • ${img}`));
        });
        console.log('');
    }
    
    process.exit(0);
}

testRealImage(imagePath);
