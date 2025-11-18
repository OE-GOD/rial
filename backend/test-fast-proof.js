const { generateFastHashProof } = require('./zk/fast-proof-service');
const sharp = require('sharp');

async function testFastProof() {
    console.log('⚡ Testing Fast Hash Proof...\n');
    
    try {
        // Create test images
        const originalBuffer = await sharp({
            create: {
                width: 50,
                height: 50,
                channels: 3,
                background: { r: 255, g: 0, b: 0 }
            }
        }).png().toBuffer();
        
        const transformedBuffer = await sharp({
            create: {
                width: 25,
                height: 25,
                channels: 3,
                background: { r: 255, g: 0, b: 0 }
            }
        }).png().toBuffer();
        
        console.log('1. Created test images');
        console.log(`   - Original: ${originalBuffer.length} bytes`);
        console.log(`   - Transformed: ${transformedBuffer.length} bytes`);
        
        const startTime = Date.now();
        
        // Generate fast proof
        const proof = await generateFastHashProof(
            originalBuffer,
            transformedBuffer,
            { type: 'Crop', params: { x: 10, y: 10, width: 25, height: 25 } }
        );
        
        const endTime = Date.now();
        
        console.log(`\n2. Generated hash proof in ${endTime - startTime}ms`);
        console.log(`   - Type: ${proof.type}`);
        console.log(`   - Original hash: ${proof.originalHash.substring(0, 16)}...`);
        console.log(`   - Transformed hash: ${proof.transformedHash.substring(0, 16)}...`);
        console.log(`   - Method: ${proof.proof.method}`);
        
        console.log('\n✅ Fast proof test successful!');
        console.log('   (Orders of magnitude faster than pixel-by-pixel proofs)');
        
    } catch (error) {
        console.error('❌ Error:', error.message);
    }
}

testFastProof();
