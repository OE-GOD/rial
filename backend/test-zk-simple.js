#!/usr/bin/env node

const { generateProof, ensurePowersOfTau } = require('./zk/groth16');
const sharp = require('sharp');

async function simpleZKTest() {
    console.log('🧪 Simple ZK Test...\n');
    
    try {
        // Download PTAU if needed
        console.log('1️⃣ Ensuring Powers of Tau...');
        await ensurePowersOfTau();
        console.log('   ✅ PTAU ready\n');
        
        // Create a small test image (10x10 to keep it fast)
        console.log('2️⃣ Creating small test images...');
        const originalBuffer = await sharp({
            create: {
                width: 10,
                height: 10,
                channels: 3,
                background: { r: 255, g: 0, b: 0 }
            }
        }).raw().toBuffer();
        
        // Crop it to 5x5
        const croppedBuffer = await sharp({
            create: {
                width: 10,
                height: 10,
                channels: 3,
                background: { r: 255, g: 0, b: 0 }
            }
        })
        .extract({ left: 2, top: 2, width: 5, height: 5 })
        .raw()
        .toBuffer();
        
        console.log(`   - Original: 10x10 (${originalBuffer.length} bytes)`);
        console.log(`   - Cropped: 5x5 (${croppedBuffer.length} bytes)\n`);
        
        // Convert to matrices
        const origMatrix = [];
        for (let y = 0; y < 10; y++) {
            const row = [];
            for (let x = 0; x < 10; x++) {
                const idx = (y * 10 + x) * 3;
                row.push([
                    originalBuffer[idx],
                    originalBuffer[idx + 1],
                    originalBuffer[idx + 2]
                ]);
            }
            origMatrix.push(row);
        }
        
        const newMatrix = [];
        for (let y = 0; y < 5; y++) {
            const row = [];
            for (let x = 0; x < 5; x++) {
                const idx = (y * 5 + x) * 3;
                row.push([
                    croppedBuffer[idx],
                    croppedBuffer[idx + 1],
                    croppedBuffer[idx + 2]
                ]);
            }
            newMatrix.push(row);
        }
        
        // Generate proof
        console.log('3️⃣ Generating ZK proof for crop...');
        const startTime = Date.now();
        
        const result = await generateProof('crop', {
            hOrig: 10,
            wOrig: 10,
            hNew: 5,
            wNew: 5,
            hStart: 2,
            wStart: 2
        }, {
            orig: origMatrix,
            new: newMatrix
        });
        
        const endTime = Date.now();
        console.log(`   ✅ Proof generated in ${endTime - startTime}ms`);
        console.log(`   - Public signals: ${result.publicSignals}`);
        console.log(`   - Proof keys: ${Object.keys(result.proof).join(', ')}`);
        console.log(`   - Artifacts: ${result.artifacts.verificationKeyPath}`);
        if (result.saved) {
            console.log(`   - Saved to: ${result.saved.proofPath}`);
        }
        
    } catch (error) {
        console.error('❌ Error:', error.message);
        console.error(error.stack);
    }
}

simpleZKTest().then(() => {
    console.log('\n✅ Test complete!');
    process.exit(0);
}).catch(err => {
    console.error('Fatal:', err);
    process.exit(1);
});
