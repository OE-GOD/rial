const { applyTransformations } = require('./image-transformer');
const sharp = require('sharp');

async function test() {
    // Create test image
    const imageBuffer = await sharp({
        create: {
            width: 100,
            height: 100,
            channels: 3,
            background: { r: 255, g: 0, b: 0 }
        }
    }).png().toBuffer();
    
    console.log('Original image:', imageBuffer.length, 'bytes');
    
    const transformations = [{
        Crop: {
            x: 10,
            y: 10,
            width: 50,
            height: 50
        }
    }];
    
    const result = await applyTransformations(imageBuffer, transformations);
    console.log('Result:', result);
    console.log('Final buffer:', result.finalBuffer.length, 'bytes');
    console.log('Steps:', result.steps.length);
    if (result.steps.length > 0) {
        console.log('Step 1:', result.steps[0]);
    }
}

test().catch(console.error);
