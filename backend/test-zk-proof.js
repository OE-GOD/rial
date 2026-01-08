#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const FormData = require('form-data');
const axios = require('axios');

// Create a simple test image with sharp
const sharp = require('sharp');

async function createTestImage() {
    // Create a 100x100 red image (must be smaller than ZK_MAX_DIMENSION=128)
    const buffer = await sharp({
        create: {
            width: 100,
            height: 100,
            channels: 3,
            background: { r: 255, g: 0, b: 0 }
        }
    })
    .png()
    .toBuffer();
    
    return buffer;
}

async function testZKProof() {
    console.log('🧪 Testing ZK Proof Generation...\n');
    
    try {
        // 1. Create test image
        console.log('1️⃣ Creating test image (100x100 red square)...');
        const imageBuffer = await createTestImage();
        console.log(`   ✅ Created image: ${imageBuffer.length} bytes\n`);
        
        // 2. Create form data with transformations
        const form = new FormData();
        form.append('img_buffer', imageBuffer, {
            filename: 'test.png',
            contentType: 'image/png'
        });
        
        // Add transformations - crop and resize
        const transformations = [
            {
                Crop: {
                    x: 25,
                    y: 25,
                    width: 50,
                    height: 50
                }
            },
            {
                Resize: {
                    width: 25,
                    height: 25
                }
            }
        ];
        
        form.append('transformations', JSON.stringify(transformations));
        
        // Use fast proofs for testing
        form.append('fast_proofs', 'true');
        
        // Add dummy signature data (not important for ZK test)
        form.append('signature', Buffer.from('dummy-signature').toString('base64'));
        form.append('public_key', Buffer.from('dummy-public-key').toString('base64'));
        
        // Add C2PA claim with merkle root
        const c2paClaim = {
            imageRoot: 'abcd1234567890abcd1234567890abcd1234567890abcd1234567890abcd1234',
            timestamp: new Date().toISOString()
        };
        form.append('c2pa_claim', JSON.stringify(c2paClaim));
        
        // 3. Send request
        console.log('2️⃣ Sending request to /prove endpoint...');
        console.log(`   - Transformations: ${JSON.stringify(transformations, null, 2)}\n`);
        
        const response = await axios.post('http://localhost:3000/prove', form, {
            headers: form.getHeaders(),
            timeout: 60000 // 60 second timeout for proof generation
        });
        
        // 4. Check response
        console.log('3️⃣ Response received!');
        console.log(`   - Success: ${response.data.success}`);
        console.log(`   - Image URL: ${response.data.imageUrl}`);
        
        if (response.data.zkProofs) {
            console.log(`\n4️⃣ Zero-Knowledge Proofs Generated:`);
            response.data.zkProofs.forEach((proof, index) => {
                console.log(`\n   Proof ${index + 1}:`);
                console.log(`   - Type: ${proof.type}`);
                console.log(`   - Circuit: ${proof.circuit}`);
                console.log(`   - Parameters: ${JSON.stringify(proof.params)}`);
                console.log(`   - Public Signals: ${proof.publicSignals}`);
                console.log(`   - Proof: ${JSON.stringify(proof.proof).substring(0, 100)}...`);
                console.log(`   - Verification Key Path: ${proof.verificationKeyPath}`);
                if (proof.storedProof) {
                    console.log(`   - Stored at: ${proof.storedProof.proofPath}`);
                }
            });
            
            console.log('\n✅ ZK Proof generation successful!');
            
            // 5. Test verification
            console.log('\n5️⃣ Testing secure verification with ZK proofs...');
            
            // First get a challenge
            const challengeRes = await axios.get('http://localhost:3000/verify/challenge');
            const challenge = challengeRes.data.challenge;
            console.log(`   - Got challenge: ${challenge}`);
            
            // Create verification form
            const verifyForm = new FormData();
            
            // Read the transformed image from disk
            const uploadedImagePath = path.join(__dirname, response.data.imageUrl.replace(/^\//, ''));
            const transformedImage = fs.readFileSync(uploadedImagePath);
            verifyForm.append('image', transformedImage, {
                filename: 'verify.png',
                contentType: 'image/png'
            });
            
            verifyForm.append('merkleRoot', c2paClaim.imageRoot);
            verifyForm.append('publicKey', Buffer.from('dummy-public-key').toString('base64'));
            verifyForm.append('challenge', challenge);
            
            // Create dummy signature for challenge (in real app, iOS would sign this)
            verifyForm.append('challengeSignature', Buffer.from('dummy-challenge-sig').toString('base64'));
            
            // Include the ZK proofs
            verifyForm.append('zkProofs', JSON.stringify(response.data.zkProofs));
            
            try {
                const verifyRes = await axios.post('http://localhost:3000/secure-verify', verifyForm, {
                    headers: verifyForm.getHeaders()
                });
                
                console.log(`\n   Verification Response:`);
                console.log(`   - Verified: ${verifyRes.data.verified}`);
                console.log(`   - ZK Proofs Status: ${verifyRes.data.verificationSteps?.zkProofs}`);
                if (verifyRes.data.zkProofsVerified) {
                    console.log(`   - ZK Proofs Checked: ${verifyRes.data.zkProofsVerified.checked}`);
                    console.log(`   - ZK Proofs Count: ${verifyRes.data.zkProofsVerified.count}`);
                }
            } catch (verifyError) {
                console.log(`   ⚠️  Verification failed (expected - we used dummy signatures)`);
                console.log(`   - Error: ${verifyError.response?.data?.error || verifyError.message}`);
            }
            
        } else {
            console.log('\n❌ No ZK proofs in response!');
        }
        
    } catch (error) {
        console.error('\n❌ Test failed:', error.response?.data || error.message);
        if (error.response?.data?.message) {
            console.error('   Details:', error.response.data.message);
        }
    }
}

// Run the test
testZKProof().then(() => {
    console.log('\n🏁 Test complete!');
}).catch(err => {
    console.error('Fatal error:', err);
    process.exit(1);
});
