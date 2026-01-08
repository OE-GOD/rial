/**
 * Image optimization for faster processing
 */

const sharp = require('sharp');

/**
 * Optimize image for proof generation
 */
async function optimizeForProof(imageBuffer, maxDimension = 512) {
    try {
        const metadata = await sharp(imageBuffer).metadata();
        const { width, height } = metadata;
        
        // Calculate new dimensions maintaining aspect ratio
        let newWidth = width;
        let newHeight = height;
        
        if (width > maxDimension || height > maxDimension) {
            const ratio = Math.min(maxDimension / width, maxDimension / height);
            newWidth = Math.round(width * ratio);
            newHeight = Math.round(height * ratio);
        }
        
        // Resize and optimize
        const optimized = await sharp(imageBuffer)
            .resize(newWidth, newHeight, {
                fit: 'inside',
                withoutEnlargement: true
            })
            .jpeg({ quality: 90 })
            .toBuffer();
        
        console.log(`📐 Optimized: ${width}x${height} → ${newWidth}x${newHeight}`);
        
        return {
            buffer: optimized,
            width: newWidth,
            height: newHeight,
            originalWidth: width,
            originalHeight: height
        };
    } catch (error) {
        console.error('❌ Optimization failed:', error);
        throw error;
    }
}

/**
 * Generate thumbnail
 */
async function generateThumbnail(imageBuffer, size = 200) {
    return sharp(imageBuffer)
        .resize(size, size, {
            fit: 'cover',
            position: 'center'
        })
        .jpeg({ quality: 80 })
        .toBuffer();
}

/**
 * Extract image metadata
 */
async function extractMetadata(imageBuffer) {
    const metadata = await sharp(imageBuffer).metadata();
    return {
        width: metadata.width,
        height: metadata.height,
        format: metadata.format,
        size: metadata.size,
        hasAlpha: metadata.hasAlpha,
        orientation: metadata.orientation
    };
}

module.exports = {
    optimizeForProof,
    generateThumbnail,
    extractMetadata
};

