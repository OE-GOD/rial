/**
 * Simple Image Store for Fraud Detection
 * Stores certified images for byte-by-byte comparison
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// In-memory store (for demo - in production use database)
const imageStore = new Map();
console.log('🗄️ Image store initialized (empty on startup)');

/**
 * Store certified image
 */
function storeCertifiedImage(merkleRoot, imageBuffer) {
    const imageHash = crypto.createHash('sha256').update(imageBuffer).digest('hex');
    
    imageStore.set(merkleRoot, {
        imageHash: imageHash,
        imageBuffer: imageBuffer,
        size: imageBuffer.length,
        storedAt: new Date().toISOString()
    });
    
    console.log(`💾 Stored image: ${merkleRoot.substring(0, 20)}... (${imageBuffer.length} bytes)`);
    console.log(`   Hash: ${imageHash.substring(0, 40)}...`);
    
    return imageHash;
}

/**
 * Verify uploaded image matches certified image
 */
function verifyImage(merkleRoot, uploadedImageBuffer) {
    const stored = imageStore.get(merkleRoot);
    
    if (!stored) {
        console.log(`❌ Merkle root not found in store!`);
        console.log(`   Available roots: ${Array.from(imageStore.keys()).map(k => k.substring(0, 20) + '...').join(', ')}`);
        return {
            success: false,
            error: 'Image not found - merkle root not in system',
            exists: false
        };
    }
    
    // Compute hash of uploaded image
    const uploadedHash = crypto.createHash('sha256').update(uploadedImageBuffer).digest('hex');
    
    // Compare
    const matches = (uploadedHash === stored.imageHash);
    
    console.log(`🔍 Image Verification:`);
    console.log(`   Stored size:   ${stored.size} bytes`);
    console.log(`   Uploaded size: ${uploadedImageBuffer.length} bytes`);
    console.log(`   Stored hash:   ${stored.imageHash.substring(0, 40)}...`);
    console.log(`   Uploaded hash: ${uploadedHash.substring(0, 40)}...`);
    console.log(`   Match: ${matches ? '✅ YES' : '❌ NO (FRAUD!)'}`);
    
    return {
        success: true,
        matches: matches,
        storedHash: stored.imageHash,
        uploadedHash: uploadedHash,
        merkleRoot: merkleRoot
    };
}

/**
 * Get store statistics
 */
function getStats() {
    return {
        totalImages: imageStore.size,
        merkleRoots: Array.from(imageStore.keys()).map(k => k.substring(0, 20) + '...')
    };
}

/**
 * Get certified image by merkle root
 */
function getCertifiedImage(merkleRoot) {
    return imageStore.get(merkleRoot);
}

module.exports = {
    storeCertifiedImage,
    verifyImage,
    getStats,
    getCertifiedImage
};

