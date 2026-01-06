/**
 * Verification Portal API
 *
 * Endpoints for verifying media authenticity
 * Anyone can upload media to check if it's authentic
 */

const express = require('express');
const router = express.Router();
const multer = require('multer');
const { getVerificationService } = require('../services/media-verification');

const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 100 * 1024 * 1024 } // 100MB for video
});

const verifier = getVerificationService();

// =====================================
// POST /api/verify/upload - Verify uploaded media
// =====================================

router.post('/upload', upload.single('media'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({
                success: false,
                error: 'missing_media',
                message: 'Please upload a photo or video to verify'
            });
        }

        console.log(`[Verify] Checking media: ${req.file.originalname} (${req.file.size} bytes)`);

        const result = await verifier.verifyMedia(req.file.buffer, {
            filename: req.file.originalname,
            mimetype: req.file.mimetype
        });

        res.json({
            success: true,
            verification: {
                verified: result.verified,
                confidence: result.confidence,
                checks: result.checks,
                warnings: result.warnings,
                attestation: result.attestation
                    ? verifier.sanitizeAttestation(result.attestation)
                    : null,
                details: {
                    matchType: result.details?.matchType,
                    possibleReasons: result.details?.possibleReasons
                }
            }
        });

    } catch (error) {
        console.error('[Verify] Error:', error);
        res.status(500).json({
            success: false,
            error: 'verification_failed',
            message: error.message
        });
    }
});

// =====================================
// GET /api/verify/link/:code - Verify by share code
// =====================================

router.get('/link/:code', async (req, res) => {
    try {
        const { code } = req.params;

        const result = await verifier.verifyByShareCode(code);

        res.json({
            success: result.verified,
            verification: result
        });

    } catch (error) {
        res.status(500).json({
            success: false,
            error: 'verification_failed',
            message: error.message
        });
    }
});

// =====================================
// POST /api/verify/store - Store new attestation (internal)
// =====================================

router.post('/store', async (req, res) => {
    try {
        const { attestation } = req.body;

        if (!attestation) {
            return res.status(400).json({
                success: false,
                error: 'missing_attestation'
            });
        }

        const record = await verifier.storeAttestation(attestation);

        res.status(201).json({
            success: true,
            attestation: {
                id: record.id,
                shareCode: record.shareCode,
                shareUrl: record.shareUrl
            }
        });

    } catch (error) {
        res.status(500).json({
            success: false,
            error: 'store_failed',
            message: error.message
        });
    }
});

// =====================================
// GET /api/verify/stats - Verification statistics
// =====================================

router.get('/stats', (req, res) => {
    const stats = verifier.getStats();

    res.json({
        success: true,
        stats
    });
});

// =====================================
// GET /api/verify/attestation/:id - Get attestation details
// =====================================

router.get('/attestation/:id', (req, res) => {
    const attestation = verifier.getAttestation(req.params.id);

    if (!attestation) {
        return res.status(404).json({
            success: false,
            error: 'not_found'
        });
    }

    res.json({
        success: true,
        attestation: verifier.sanitizeAttestation(attestation)
    });
});

module.exports = router;
