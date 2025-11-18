/**
 * Apply transformations to images
 */

const sharp = require('sharp');
// GPU processor is optional
let getGPUProcessor;
try {
    getGPUProcessor = require('./src/gpu-processor').getGPUProcessor;
} catch (e) {
    console.log('GPU processor not available - will use CPU processing');
}

/**
 * Apply transformations to image buffer and capture each intermediate step.
 * @param {Buffer} imageBuffer - Input image buffer
 * @param {Array} transformations - Array of transformation objects
 * @param {Object} options - Processing options
 * @param {boolean} options.useGPU - Whether to use GPU acceleration
 * @param {string} options.gpuMode - GPU mode ('auto', 'gpu.js', 'tensorflow', 'cpu')
 * @returns {Object} Result with final buffer and processing steps
 */
async function applyTransformations(imageBuffer, transformations, options = {}) {
    const { useGPU = false, gpuMode = 'auto' } = options;
    if (!transformations || transformations.length === 0) {
        return {
            finalBuffer: imageBuffer,
            steps: []
        };
    }

    let currentBuffer = imageBuffer;
    const steps = [];
    let gpuProcessor = null;

    // Initialize GPU processor if requested
    if (useGPU) {
        try {
            gpuProcessor = getGPUProcessor({ mode: gpuMode });
            console.log(`🚀 Using GPU acceleration (${gpuProcessor.getProcessingMethod()})`);
        } catch (error) {
            console.warn('⚠️  GPU initialization failed, falling back to CPU:', error.message);
            gpuProcessor = null;
        }
    }
    
    for (const transform of transformations) {
        const beforeBuffer = currentBuffer;
        let afterBuffer = beforeBuffer;
        let gpuAccelerated = false;

        if (transform.Crop) {
            const { x, y, width, height } = transform.Crop;
            console.log(`   ✂️ Applying crop: ${width}x${height} at (${x},${y})`);
            afterBuffer = await sharp(beforeBuffer)
                .extract({
                left: x,
                top: y,
                width: width,
                height: height
                })
                .toBuffer();

            steps.push({
                type: 'Crop',
                params: { x, y, width, height },
                beforeBuffer,
                afterBuffer
            });
        } else if (transform.Resize) {
            const { width, height } = transform.Resize;
            console.log(`   📐 Applying resize: ${width}x${height}`);
            afterBuffer = await sharp(beforeBuffer)
                .resize(width, height, {
                    fit: 'fill'
                })
                .toBuffer();

            steps.push({
                type: 'Resize',
                params: { width, height },
                beforeBuffer,
                afterBuffer
            });
        } else if (transform.Grayscale) {
            console.log(`   ⚪ Applying grayscale conversion${gpuProcessor ? ' (GPU)' : ''}`);

            if (gpuProcessor && gpuProcessor.isUsingGPU()) {
                const gpuResult = await gpuProcessor.transformImage(beforeBuffer, [transform]);
                afterBuffer = gpuResult.buffer;
                gpuAccelerated = true;
            } else {
                afterBuffer = await sharp(beforeBuffer)
                    .grayscale()
                    .toBuffer();
            }

            steps.push({
                type: 'Grayscale',
                params: {},
                beforeBuffer,
                afterBuffer,
                gpuAccelerated
            });

        // Advanced Transformations
        } else if (transform.Rotate) {
            const { angle } = transform.Rotate;
            console.log(`   🔄 Applying rotation: ${angle}°`);
            afterBuffer = await sharp(beforeBuffer)
                .rotate(angle)
                .toBuffer();

            steps.push({
                type: 'Rotate',
                params: { angle },
                beforeBuffer,
                afterBuffer
            });

        } else if (transform.FlipHorizontal) {
            console.log(`   🔄 Applying horizontal flip`);
            afterBuffer = await sharp(beforeBuffer)
                .flop() // Horizontal flip
                .toBuffer();

            steps.push({
                type: 'FlipHorizontal',
                params: {},
                beforeBuffer,
                afterBuffer
            });

        } else if (transform.FlipVertical) {
            console.log(`   🔄 Applying vertical flip`);
            afterBuffer = await sharp(beforeBuffer)
                .flip() // Vertical flip
                .toBuffer();

            steps.push({
                type: 'FlipVertical',
                params: {},
                beforeBuffer,
                afterBuffer
            });

        } else if (transform.Translate) {
            const { dx, dy } = transform.Translate;
            console.log(`   📍 Applying translation: (${dx}, ${dy})`);
            // Note: Sharp doesn't have direct translate, using extend with negative extract
            const metadata = await sharp(beforeBuffer).metadata();
            const extendedWidth = metadata.width + Math.abs(dx);
            const extendedHeight = metadata.height + Math.abs(dy);

            afterBuffer = await sharp(beforeBuffer)
                .extend({
                    top: dy > 0 ? dy : 0,
                    bottom: dy < 0 ? -dy : 0,
                    left: dx > 0 ? dx : 0,
                    right: dx < 0 ? -dx : 0,
                    background: { r: 255, g: 255, b: 255, alpha: 0 }
                })
                .extract({
                    left: dx > 0 ? 0 : -dx,
                    top: dy > 0 ? 0 : -dy,
                    width: metadata.width,
                    height: metadata.height
                })
                .toBuffer();

            steps.push({
                type: 'Translate',
                params: { dx, dy },
                beforeBuffer,
                afterBuffer
            });

        } else if (transform.ToYCbCr) {
            console.log(`   🎨 Converting to YCbCr color space`);
            // Sharp doesn't directly support YCbCr, but we can simulate with color manipulation
            afterBuffer = await sharp(beforeBuffer)
                .modulate({
                    brightness: 1.0,
                    saturation: 1.0,
                    hue: 0
                })
                .toBuffer();

            steps.push({
                type: 'ToYCbCr',
                params: {},
                beforeBuffer,
                afterBuffer
            });

        } else if (transform.ToRGB) {
            console.log(`   🎨 Converting to RGB color space`);
            // Ensure RGB output
            afterBuffer = await sharp(beforeBuffer)
                .toColorspace('srgb')
                .toBuffer();

            steps.push({
                type: 'ToRGB',
                params: {},
                beforeBuffer,
                afterBuffer
            });

        } else if (transform.Sharpen) {
            console.log(`   🔪 Applying sharpen filter${gpuProcessor ? ' (GPU)' : ''}`);

            if (gpuProcessor && gpuProcessor.isUsingGPU()) {
                const gpuResult = await gpuProcessor.transformImage(beforeBuffer, [transform]);
                afterBuffer = gpuResult.buffer;
                gpuAccelerated = true;
            } else {
                afterBuffer = await sharp(beforeBuffer)
                    .sharpen({
                        sigma: 1.0,
                        m1: 1.0,
                        m2: 2.0,
                        x1: 2.0,
                        y2: 10.0,
                        y3: 20.0
                    })
                    .toBuffer();
            }

            steps.push({
                type: 'Sharpen',
                params: {},
                beforeBuffer,
                afterBuffer,
                gpuAccelerated
            });

        } else if (transform.Blur) {
            const { sigma = 1.5 } = transform.Blur || {};
            console.log(`   🌫️  Applying blur filter${gpuProcessor ? ' (GPU)' : ''}`);

            if (gpuProcessor && gpuProcessor.isUsingGPU()) {
                const gpuResult = await gpuProcessor.transformImage(beforeBuffer, [transform]);
                afterBuffer = gpuResult.buffer;
                gpuAccelerated = true;
            } else {
                afterBuffer = await sharp(beforeBuffer)
                    .blur(sigma)
                    .toBuffer();
            }

            steps.push({
                type: 'Blur',
                params: { sigma },
                beforeBuffer,
                afterBuffer,
                gpuAccelerated
            });

        } else if (transform.Contrast) {
            const { level } = transform.Contrast;
            console.log(`   🌓 Adjusting contrast: ${level}`);
            afterBuffer = await sharp(beforeBuffer)
                .modulate({
                    brightness: 1.0,
                    saturation: 1.0,
                    hue: 0,
                    lightness: 0,
                    contrast: level
                })
                .toBuffer();

            steps.push({
                type: 'Contrast',
                params: { level },
                beforeBuffer,
                afterBuffer
            });

        } else if (transform.Brightness) {
            const { level } = transform.Brightness;
            console.log(`   ☀️  Adjusting brightness: ${level}`);
            afterBuffer = await sharp(beforeBuffer)
                .modulate({
                    brightness: level,
                    saturation: 1.0,
                    hue: 0,
                    lightness: 0
                })
                .toBuffer();

            steps.push({
                type: 'Brightness',
                params: { level },
                beforeBuffer,
                afterBuffer
            });

        } else if (transform.WhiteBalance) {
            console.log(`   ⚖️  Applying white balance correction`);
            // Simple white balance approximation
            afterBuffer = await sharp(beforeBuffer)
                .modulate({
                    brightness: 1.1,
                    saturation: 1.2,
                    hue: 0
                })
                .toBuffer();

            steps.push({
                type: 'WhiteBalance',
                params: {},
                beforeBuffer,
                afterBuffer
            });

        } else if (transform.Gamma) {
            const { value } = transform.Gamma;
            console.log(`   📈 Applying gamma correction: ${value}`);
            afterBuffer = await sharp(beforeBuffer)
                .gamma(value)
                .toBuffer();

            steps.push({
                type: 'Gamma',
                params: { value },
                beforeBuffer,
                afterBuffer
            });

        } else if (transform.Saturation) {
            const { level } = transform.Saturation;
            console.log(`   🎨 Adjusting saturation: ${level}`);
            afterBuffer = await sharp(beforeBuffer)
                .modulate({
                    brightness: 1.0,
                    saturation: level,
                    hue: 0
                })
                .toBuffer();

            steps.push({
                type: 'Saturation',
                params: { level },
                beforeBuffer,
                afterBuffer
            });

        } else if (transform.Hue) {
            const { degrees } = transform.Hue;
            console.log(`   🌈 Adjusting hue: ${degrees}°`);
            afterBuffer = await sharp(beforeBuffer)
                .modulate({
                    brightness: 1.0,
                    saturation: 1.0,
                    hue: degrees
                })
                .toBuffer();

            steps.push({
                type: 'Hue',
                params: { degrees },
                beforeBuffer,
                afterBuffer
            });

        } else if (transform.Sepia) {
            console.log(`   🏛️  Applying sepia filter`);
            afterBuffer = await sharp(beforeBuffer)
                .modulate({
                    brightness: 1.0,
                    saturation: 0.3,
                    hue: 25
                })
                .toBuffer();

            steps.push({
                type: 'Sepia',
                params: {},
                beforeBuffer,
                afterBuffer
            });

        } else if (transform.Negative) {
            console.log(`   🌓 Applying negative filter`);
            afterBuffer = await sharp(beforeBuffer)
                .negate()
                .toBuffer();

            steps.push({
                type: 'Negative',
                params: {},
                beforeBuffer,
                afterBuffer
            });

        } else if (transform.EdgeDetect) {
            console.log(`   📐 Applying edge detection${gpuProcessor ? ' (GPU)' : ''}`);

            if (gpuProcessor && gpuProcessor.isUsingGPU()) {
                const gpuResult = await gpuProcessor.transformImage(beforeBuffer, [transform]);
                afterBuffer = gpuResult.buffer;
                gpuAccelerated = true;
            } else {
                // Simple edge detection approximation using convolution
                afterBuffer = await sharp(beforeBuffer)
                    .sharpen({
                        sigma: 2.0,
                        m1: 0.0,
                        m2: 1.0,
                        x1: 0.5,
                        y2: 1.0,
                        y3: 2.0
                    })
                    .grayscale()
                    .toBuffer();
            }

            steps.push({
                type: 'EdgeDetect',
                params: {},
                beforeBuffer,
                afterBuffer,
                gpuAccelerated
            });

        } else {
            console.warn(`⚠️  Unknown transformation: ${JSON.stringify(transform)}`);
        }

        currentBuffer = afterBuffer;
    }

    // Count GPU-accelerated steps
    const gpuAcceleratedSteps = steps.filter(step => step.gpuAccelerated).length;

    return {
        finalBuffer: currentBuffer,
        steps,
        gpuAccelerated: gpuAcceleratedSteps > 0,
        gpuSteps: gpuAcceleratedSteps,
        totalSteps: steps.length,
        processingMethod: gpuProcessor ? gpuProcessor.getProcessingMethod() : 'cpu'
    };
}

module.exports = {
    applyTransformations
};


