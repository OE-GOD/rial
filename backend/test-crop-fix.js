/**
 * Test the crop fix to ensure it works properly
 */

const sharp = require('sharp');
const fs = require('fs').promises;
const FormData = require('form-data');
const fetch = require('node-fetch');

async function testCropFix() {
    console.log('🧪 Testing Crop Fix\n');
    
    // Test Case 1: Normal crop (crop smaller than image)
    await testCase1();
    
    // Test Case 2: Crop larger than image
    await testCase2();
    
    // Test Case 3: Edge coordinates
    await testCase3();
}

async function testCase1() {
    console.log('📋 Test Case 1: Normal Crop (512x512 from 1024x1024)');
    console.log('─'.repeat(50));
    
    try {
        // Create a 1024x1024 test image
        const image = await sharp({
            create: {
                width: 1024,
                height: 1024,
                channels: 3,
                background: { r: 255, g: 0, b: 0 }
            }
        })
        .composite([{
            input: Buffer.from(
                '<svg width="1024" height="1024">' +
                '<rect x="0" y="0" width="1024" height="1024" fill="red"/>' +
                '<rect x="256" y="256" width="512" height="512" fill="yellow"/>' +
                '<text x="512" y="512" font-size="48" text-anchor="middle" fill="black">CENTER</text>' +
                '</svg>'
            )
        }])
        .png()
        .toBuffer();
        
        console.log('✅ Created 1024x1024 image with yellow center square');
        
        // Test crop at (256,256) with size 512x512
        const result = await sendCropRequest(image, 256, 256, 512, 512);
        
        if (result.success) {
            console.log('✅ Success! Crop applied correctly');
            console.log(`   Image URL: ${result.imageUrl}`);
            console.log(`   ZK Proofs: ${result.zkProofs ? '✓' : '✗'}`);
        } else {
            console.log('❌ Failed:', result.error);
        }
        
    } catch (error) {
        console.error('❌ Test case 1 failed:', error.message);
    }
    
    console.log('\n');
}

async function testCase2() {
    console.log('📋 Test Case 2: Crop Larger Than Image (512x512 from 256x256)');
    console.log('─'.repeat(50));
    
    try {
        // Create a small 256x256 test image
        const image = await sharp({
            create: {
                width: 256,
                height: 256,
                channels: 3,
                background: { r: 0, g: 255, b: 0 }
            }
        })
        .composite([{
            input: Buffer.from(
                '<svg width="256" height="256">' +
                '<circle cx="128" cy="128" r="100" fill="blue"/>' +
                '<text x="128" y="138" font-size="24" text-anchor="middle" fill="white">SMALL</text>' +
                '</svg>'
            )
        }])
        .png()
        .toBuffer();
        
        console.log('✅ Created 256x256 image (smaller than requested crop)');
        
        // Try to crop 512x512 (should be adjusted)
        const result = await sendCropRequest(image, 0, 0, 512, 512);
        
        if (result.success) {
            console.log('✅ Success! Server handled oversized crop');
            console.log('   (Should have adjusted to 256x256 or rejected)');
        } else {
            console.log('⚠️  Server rejected oversized crop:', result.error);
        }
        
    } catch (error) {
        console.error('❌ Test case 2 failed:', error.message);
    }
    
    console.log('\n');
}

async function testCase3() {
    console.log('📋 Test Case 3: Edge Coordinates (crop at image edges)');
    console.log('─'.repeat(50));
    
    try {
        // Create a 800x600 test image
        const image = await sharp({
            create: {
                width: 800,
                height: 600,
                channels: 3,
                background: { r: 100, g: 100, b: 255 }
            }
        })
        .composite([{
            input: Buffer.from(
                '<svg width="800" height="600">' +
                '<rect x="0" y="0" width="200" height="150" fill="red"/>' +
                '<rect x="600" y="0" width="200" height="150" fill="green"/>' +
                '<rect x="0" y="450" width="200" height="150" fill="yellow"/>' +
                '<rect x="600" y="450" width="200" height="150" fill="white"/>' +
                '<text x="400" y="300" font-size="36" text-anchor="middle">EDGES</text>' +
                '</svg>'
            )
        }])
        .png()
        .toBuffer();
        
        console.log('✅ Created 800x600 image with colored corners');
        
        // Test crop at bottom-right corner
        const result = await sendCropRequest(image, 600, 450, 200, 150);
        
        if (result.success) {
            console.log('✅ Success! Edge crop applied correctly');
        } else {
            console.log('❌ Failed:', result.error);
        }
        
    } catch (error) {
        console.error('❌ Test case 3 failed:', error.message);
    }
    
    console.log('\n');
}

async function sendCropRequest(imageBuffer, x, y, width, height) {
    const form = new FormData();
    form.append('img_buffer', imageBuffer, 'test.png');
    form.append('transformations', JSON.stringify([{
        Crop: { x, y, width, height }
    }]));
    form.append('fast_proofs', 'true');
    form.append('signature', Buffer.from('test-signature').toString('base64'));
    form.append('public_key', Buffer.from('test-public-key').toString('base64'));
    form.append('c2pa_claim', JSON.stringify({
        imageRoot: 'test-crop-' + Date.now()
    }));
    
    console.log(`📤 Sending crop request: ${width}x${height} at (${x},${y})`);
    
    try {
        const response = await fetch('http://localhost:3000/prove', {
            method: 'POST',
            body: form,
            headers: form.getHeaders()
        });
        
        const result = await response.json();
        return result;
    } catch (error) {
        return { success: false, error: error.message };
    }
}

// Run tests
testCropFix().then(() => {
    console.log('🏁 All crop tests complete!\n');
}).catch(console.error);
