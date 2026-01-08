/**
 * Timestamp & Transparency Log API
 *
 * FREE alternative to blockchain:
 * - Server-signed timestamps with ECDSA
 * - Append-only transparency log
 * - Fully auditable
 */

const express = require('express');
const router = express.Router();
const { getTimestampService } = require('../services/timestamp-service');

// =====================================
// POST /api/timestamp - Create timestamp
// =====================================

router.post('/', async (req, res) => {
    try {
        const {
            imageHash,
            merkleRoot,
            metadataHash,
            publicKey,
            signatureType,
            livenessScore,
            aiScore
        } = req.body;

        if (!imageHash) {
            return res.status(400).json({
                success: false,
                error: 'imageHash required'
            });
        }

        const service = getTimestampService();
        const result = await service.createTimestamp({
            imageHash,
            merkleRoot,
            metadataHash,
            publicKey,
            signatureType,
            livenessScore,
            aiScore
        });

        res.json(result);

    } catch (error) {
        console.error('[Timestamp] Error:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// =====================================
// POST /api/timestamp/verify - Verify timestamp
// =====================================

router.post('/verify', async (req, res) => {
    try {
        const { imageHash } = req.body;

        if (!imageHash) {
            return res.status(400).json({
                success: false,
                error: 'imageHash required'
            });
        }

        const service = getTimestampService();
        const result = await service.verifyTimestamp(imageHash);

        res.json({
            success: true,
            verification: result
        });

    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// =====================================
// GET /api/timestamp/verify/:imageHash - Quick verify
// =====================================

router.get('/verify/:imageHash', async (req, res) => {
    try {
        const { imageHash } = req.params;

        const service = getTimestampService();
        const result = await service.verifyTimestamp(imageHash);

        res.json({
            success: true,
            verification: result
        });

    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// =====================================
// GET /api/timestamp/stats - Get log statistics
// =====================================

router.get('/stats', (req, res) => {
    const service = getTimestampService();
    const stats = service.getStats();

    res.json({
        success: true,
        stats
    });
});

// =====================================
// GET /api/timestamp/log - Get recent log entries
// =====================================

router.get('/log', (req, res) => {
    const limit = parseInt(req.query.limit) || 10;

    const service = getTimestampService();
    const entries = service.getRecentEntries(Math.min(limit, 100));

    res.json({
        success: true,
        entries,
        total: service.getStats().totalEntries
    });
});

// =====================================
// GET /api/timestamp/export - Export full log for auditing
// =====================================

router.get('/export', (req, res) => {
    const service = getTimestampService();
    const log = service.exportLog();

    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename="transparency-log-${Date.now()}.json"`);
    res.json(log);
});

// =====================================
// GET /api/timestamp/public-key - Get server public key
// =====================================

router.get('/public-key', (req, res) => {
    const service = getTimestampService();
    const stats = service.getStats();

    res.json({
        success: true,
        publicKey: stats.serverPublicKey,
        algorithm: 'ECDSA P-256',
        usage: 'Use this key to independently verify any timestamp signature'
    });
});

module.exports = router;
