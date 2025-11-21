/**
 * Photo Verification API
 * Endpoint for insurance companies to verify client photos
 */

const express = require('express');
const router = express.Router();
const multer = require('multer');
const { verifyClientPhoto } = require('../services/photoVerifier');

const upload = multer({ storage: multer.memoryStorage() });

/**
 * POST /api/verify-photo
 * Verify a client-submitted photo
 */
router.post('/verify-photo', upload.single('image'), async (req, res) => {
    try {
        console.log('📥 Received photo verification request');
        
        if (!req.file) {
            return res.status(400).json({
                error: 'No image file provided',
                code: 'MISSING_IMAGE'
            });
        }
        
        // Parse claim data
        const c2paClaim = req.body.c2paClaim ? JSON.parse(req.body.c2paClaim) : null;
        const metadata = req.body.metadata ? JSON.parse(req.body.metadata) : null;
        const zkProof = req.body.zkProof ? JSON.parse(req.body.zkProof) : null;
        const cropInfo = req.body.cropInfo ? JSON.parse(req.body.cropInfo) : null;
        
        console.log('📋 Photo details:');
        console.log(`   Size: ${req.file.size} bytes`);
        console.log(`   Type: ${req.file.mimetype}`);
        console.log(`   Has signature: ${!!c2paClaim?.signature}`);
        console.log(`   Has metadata: ${!!metadata}`);
        
        // Verify the photo
        const verificationResult = await verifyClientPhoto({
            imageData: req.file.buffer,
            c2paClaim,
            metadata,
            zkProof,
            cropInfo
        });
        
        // Store in database (if verification passed)
        if (verificationResult.overall && verificationResult.confidence >= 0.7) {
            const photoId = await storeVerifiedPhoto(req.file.buffer, {
                c2paClaim,
                metadata,
                verificationResult
            });
            
            verificationResult.photoId = photoId;
            console.log(`💾 Verified photo stored: ${photoId}`);
        }
        
        // Return verification result
        res.json({
            success: verificationResult.overall,
            verified: verificationResult.overall,
            confidence: verificationResult.confidence,
            checks: verificationResult.checks,
            details: verificationResult.details,
            fraudIndicators: verificationResult.fraudIndicators,
            photoId: verificationResult.photoId || null,
            timestamp: verificationResult.timestamp,
            recommendation: getRecommendation(verificationResult)
        });
        
    } catch (error) {
        console.error('❌ Verification error:', error);
        res.status(500).json({
            error: 'Verification failed',
            details: error.message
        });
    }
});

/**
 * GET /api/verify-photo/:photoId
 * Get verification details for a stored photo
 */
router.get('/verify-photo/:photoId', async (req, res) => {
    try {
        const { photoId } = req.params;
        
        // Get from database
        const photo = verifiedPhotos.get(photoId);
        
        if (!photo) {
            return res.status(404).json({
                error: 'Photo not found',
                photoId
            });
        }
        
        res.json({
            photoId,
            verified: photo.verificationResult.overall,
            confidence: photo.verificationResult.confidence,
            checks: photo.verificationResult.checks,
            details: photo.verificationResult.details,
            storedAt: photo.storedAt
        });
        
    } catch (error) {
        res.status(500).json({
            error: 'Failed to retrieve photo',
            details: error.message
        });
    }
});

/**
 * POST /api/bulk-verify
 * Verify multiple photos at once
 */
router.post('/bulk-verify', upload.array('images', 20), async (req, res) => {
    try {
        console.log(`📥 Bulk verification: ${req.files.length} photos`);
        
        const results = [];
        
        for (let i = 0; i < req.files.length; i++) {
            const file = req.files[i];
            const claimField = req.body[`c2paClaim_${i}`];
            const metadataField = req.body[`metadata_${i}`];
            
            const c2paClaim = claimField ? JSON.parse(claimField) : null;
            const metadata = metadataField ? JSON.parse(metadataField) : null;
            
            const result = await verifyClientPhoto({
                imageData: file.buffer,
                c2paClaim,
                metadata
            });
            
            results.push({
                index: i,
                filename: file.originalname,
                ...result
            });
        }
        
        const allVerified = results.every(r => r.overall);
        const avgConfidence = results.reduce((sum, r) => sum + r.confidence, 0) / results.length;
        
        res.json({
            success: allVerified,
            totalPhotos: results.length,
            verified: results.filter(r => r.overall).length,
            failed: results.filter(r => !r.overall).length,
            averageConfidence: avgConfidence,
            results
        });
        
    } catch (error) {
        res.status(500).json({
            error: 'Bulk verification failed',
            details: error.message
        });
    }
});

// In-memory storage (replace with database in production)
const verifiedPhotos = new Map();

/**
 * Store verified photo in database
 */
async function storeVerifiedPhoto(imageBuffer, data) {
    const photoId = `PHOTO-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    
    verifiedPhotos.set(photoId, {
        imageData: imageBuffer,
        c2paClaim: data.c2paClaim,
        metadata: data.metadata,
        verificationResult: data.verificationResult,
        storedAt: new Date().toISOString()
    });
    
    return photoId;
}

/**
 * Get recommendation based on verification result
 */
function getRecommendation(result) {
    if (result.confidence >= 0.9) {
        return 'APPROVE - High confidence authentic photo';
    } else if (result.confidence >= 0.7) {
        return 'APPROVE WITH CAUTION - Likely authentic';
    } else if (result.confidence >= 0.5) {
        return 'REVIEW REQUIRED - Some concerns detected';
    } else {
        return 'REJECT - High fraud risk';
    }
}

module.exports = router;

