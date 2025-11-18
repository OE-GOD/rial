/**
 * Direct test of ZK-IMG functionality
 */

const sharp = require('sharp');
const fs = require('fs').promises;
const FormData = require('form-data');
const fetch = require('node-fetch');

async function testZKDirect() {
    console.log('🧪 Direct ZK-IMG Test\n');
    
    try {
        // 1. Create test image
        console.log('1️⃣ Creating test image...');
        const image = await sharp({
            create: {
                width: 100,
                height: 100,
                channels: 3,
                background: { r: 255, g: 100, b: 50 }
            }
        })
        .composite([{
            input: Buffer.from(
                '<svg width="100" height="100">' +
                '<text x="50" y="55" font-size="20" text-anchor="middle" fill="white">RIAL</text>' +
                '</svg>'
            )
        }])
        .png()
        .toBuffer();
        
        console.log('   ✅ Created 100x100 test image\n');
        
        // 2. Send to /prove endpoint
        console.log('2️⃣ Sending to /prove endpoint...');
        
        const form = new FormData();
        form.append('image', image, 'test.png');
        form.append('transformations', JSON.stringify([
            { Crop: { x: 25, y: 25, width: 50, height: 50 } }
        ]));
        form.append('fast_proofs', 'true');
        form.append('signature', 'dGVzdC1zaWduYXR1cmU='); // base64 encoded
        form.append('public_key', 'dGVzdC1wdWJsaWMta2V5'); // base64 encoded
        form.append('c2pa_claim', JSON.stringify({
            imageRoot: 'test-root-' + Date.now()
        }));
        
        const response = await fetch('http://localhost:3000/prove', {
            method: 'POST',
            body: form,
            headers: form.getHeaders()
        });
        
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        
        const result = await response.json();
        console.log('   ✅ Response received\n');
        
        // 3. Display results
        console.log('3️⃣ Results:');
        console.log('   Success:', result.success);
        
        if (result.success) {
            console.log('   Image URL:', result.imageUrl);
            console.log('   Blockchain:', result.attestationId ? '✓' : '✗');
            
            if (result.zkProofs && result.zkProofs.length > 0) {
                console.log('\n   📊 ZK Proofs:');
                result.zkProofs.forEach((proof, i) => {
                    console.log(`      ${i + 1}. Type: ${proof.type}`);
                    console.log(`         Original: ${proof.originalHash?.substring(0, 16)}...`);
                    console.log(`         Result:   ${proof.transformedHash?.substring(0, 16)}...`);
                });
            } else {
                console.log('   ZK Proofs: None generated');
            }
        } else {
            console.log('   Error:', result.error || result.message);
        }
        
    } catch (error) {
        console.error('❌ Test failed:', error.message);
    }
}

testZKDirect().catch(console.error);
