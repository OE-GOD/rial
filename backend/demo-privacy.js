const sharp = require('sharp');
const fs = require('fs').promises;
const { hashImagePoseidon } = require('./zk/poseidon');
const { generateFastHashProof } = require('./zk/fast-proof-service');

async function demonstratePrivacy() {
    console.log('🔐 ZK-IMG Privacy Demonstration\n');
    
    // Create an image with sensitive information
    const sensitiveImage = await sharp({
        create: {
            width: 400,
            height: 200,
            channels: 3,
            background: { r: 30, g: 30, b: 30 }
        }
    })
    .composite([{
        input: Buffer.from(
            '<svg width="400" height="200">' +
            '<rect x="10" y="10" width="380" height="60" fill="#ff0000" rx="5"/>' +
            '<text x="200" y="45" font-family="Arial" font-size="24" fill="white" text-anchor="middle">PUBLIC INFO</text>' +
            
            '<rect x="10" y="80" width="380" height="110" fill="#333333" stroke="#666" stroke-width="2" rx="5"/>' +
            '<text x="20" y="110" font-family="monospace" font-size="16" fill="#ff6666">CONFIDENTIAL DATA:</text>' +
            '<text x="20" y="135" font-family="monospace" font-size="14" fill="#aaaaaa">SSN: 123-45-6789</text>' +
            '<text x="20" y="155" font-family="monospace" font-size="14" fill="#aaaaaa">Bank: 4532-XXXX-XXXX-1234</text>' +
            '<text x="20" y="175" font-family="monospace" font-size="14" fill="#aaaaaa">API Key: sk_live_abcd1234...</text>' +
            '</svg>'
        ),
        top: 0,
        left: 0
    }])
    .png()
    .toBuffer();
    
    // Save the sensitive image
    await fs.writeFile('demo-sensitive-full.png', sensitiveImage);
    console.log('1️⃣ Created image with sensitive content:');
    console.log('   ✅ Saved as: demo-sensitive-full.png');
    console.log('   ⚠️  Contains: SSN, Bank info, API keys\n');
    
    // Crop to show only public info
    const publicOnly = await sharp(sensitiveImage)
        .extract({ left: 0, top: 0, width: 400, height: 70 })
        .toBuffer();
    
    await fs.writeFile('demo-public-only.png', publicOnly);
    console.log('2️⃣ Cropped to public region only:');
    console.log('   ✅ Saved as: demo-public-only.png');
    console.log('   ✨ Shows only: PUBLIC INFO banner\n');
    
    // Generate ZK proof
    console.log('3️⃣ Generating Zero-Knowledge Proof...');
    const startTime = Date.now();
    
    const proof = await generateFastHashProof(
        sensitiveImage,
        publicOnly,
        { 
            type: 'Crop', 
            params: { x: 0, y: 0, width: 400, height: 70 } 
        }
    );
    
    const proofTime = Date.now() - startTime;
    
    console.log('   ⏱️  Proof generated in:', proofTime, 'ms');
    console.log('\n4️⃣ What the verifier sees:');
    console.log('   📊 Proof object:');
    console.log('   {');
    console.log('     type: "HashProof",');
    console.log(`     originalHash: "${proof.originalHash.substring(0, 16)}...",`);
    console.log(`     transformedHash: "${proof.transformedHash.substring(0, 16)}...",`);
    console.log('     transformation: { type: "Crop", params: {...} },');
    console.log('     proof: { method: "sha256-hash", timestamp: ... }');
    console.log('   }');
    console.log('\n   🔒 The original sensitive image is NEVER revealed!');
    console.log('   ✅ Only the cropped public region is shared');
    console.log('   ✅ Cryptographic proof ensures authenticity\n');
    
    // Save proof to file
    await fs.writeFile('demo-proof.json', JSON.stringify(proof, null, 2));
    console.log('5️⃣ Proof saved as: demo-proof.json\n');
    
    console.log('🎯 Summary:');
    console.log('   - Original image: Contains sensitive data (SSN, Bank, API keys)');
    console.log('   - Transformed: Only public info revealed');
    console.log('   - Privacy: Original never leaves your device');
    console.log('   - Verification: Cryptographic proof ensures transformation is valid');
    console.log('   - Speed: Proof generated in milliseconds');
}

demonstratePrivacy().catch(console.error);
