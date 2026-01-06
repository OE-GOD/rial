/**
 * Liveness Detection API
 *
 * Endpoints for Live Photo capture and liveness verification
 */

const express = require('express');
const router = express.Router();
const { getLivenessService } = require('../services/liveness-detection');

const liveness = getLivenessService();

// =====================================
// POST /api/liveness/analyze - Analyze Live Photo frames
// =====================================

router.post('/analyze', async (req, res) => {
    try {
        const { frames } = req.body;

        if (!frames || !Array.isArray(frames) || frames.length === 0) {
            return res.status(400).json({
                success: false,
                error: 'missing_frames',
                message: 'Array of frames required'
            });
        }

        console.log(`[Liveness] Analyzing ${frames.length} frames...`);

        const result = await liveness.analyzeLiveness(frames);

        res.json({
            success: true,
            liveness: result
        });

    } catch (error) {
        console.error('[Liveness] Error:', error);
        res.status(500).json({
            success: false,
            error: 'analysis_failed',
            message: error.message
        });
    }
});

// =====================================
// POST /api/liveness/quick-check - Real-time check during capture
// =====================================

router.post('/quick-check', async (req, res) => {
    try {
        const { frame, previousFrame, motion } = req.body;

        if (!frame) {
            return res.status(400).json({
                success: false,
                error: 'missing_frame'
            });
        }

        const result = await liveness.quickCheck(frame, previousFrame, motion);

        res.json({
            success: true,
            check: result
        });

    } catch (error) {
        res.status(500).json({
            success: false,
            error: 'check_failed',
            message: error.message
        });
    }
});

// =====================================
// GET /api/liveness/requirements - Get capture requirements
// =====================================

router.get('/requirements', (req, res) => {
    res.json({
        success: true,
        requirements: {
            minFrames: 5,
            captureWindowMs: 2000,
            instructions: [
                'Hold your phone steadily but naturally (small movements are OK)',
                'Slowly move around the subject slightly during capture',
                'Ensure good lighting on the subject',
                'Capture will take 2 seconds'
            ],
            checks: [
                { name: 'Motion Parallax', description: 'Verifies depth in scene (screens are flat)' },
                { name: 'Moire Detection', description: 'Detects screen pixel patterns' },
                { name: 'Screen Artifacts', description: 'Checks for display-specific artifacts' },
                { name: 'Temporal Analysis', description: 'Analyzes natural micro-movements' },
                { name: 'Device Motion', description: 'Correlates sensor data with image changes' }
            ]
        }
    });
});

module.exports = router;
