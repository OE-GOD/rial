/**
 * ZK-Video API Routes
 *
 * REST API for video verification with Zero-Knowledge Proofs
 */

const express = require('express');
const router = express.Router();
const { getZKVideoService, VIDEO_MODES } = require('../services/zk-video');

const zkvideo = getZKVideoService();

// =====================================
// POST /api/zkvideo/attest/keyframes - Keyframe attestation
// =====================================

router.post('/attest/keyframes', async (req, res) => {
    try {
        const { frames, metadata } = req.body;

        if (!frames || !Array.isArray(frames) || frames.length === 0) {
            return res.status(400).json({
                error: 'missing_frames',
                message: 'Array of frames required (each with data and timestamp)'
            });
        }

        console.log(`[ZK-Video] Keyframe attestation: ${frames.length} frames`);

        const attestation = await zkvideo.attestKeyframes(frames, metadata || {});

        res.status(201).json({
            success: true,
            attestation: {
                id: attestation.id,
                mode: attestation.mode,
                frameCount: attestation.frameCount,
                duration: attestation.duration,
                startHash: attestation.startHash,
                endHash: attestation.endHash,
                chainIntegrity: attestation.chainIntegrity,
                processingTime: attestation.metadata.processingTime,
                timestamp: attestation.timestamp
            }
        });

    } catch (error) {
        console.error('[ZK-Video] Keyframe attestation error:', error);
        res.status(500).json({
            error: 'attestation_failed',
            message: error.message
        });
    }
});

// =====================================
// POST /api/zkvideo/attest/full - Full frame attestation
// =====================================

router.post('/attest/full', async (req, res) => {
    try {
        const { frames, metadata } = req.body;

        if (!frames || !Array.isArray(frames) || frames.length === 0) {
            return res.status(400).json({
                error: 'missing_frames',
                message: 'Array of frames required'
            });
        }

        console.log(`[ZK-Video] Full frame attestation: ${frames.length} frames`);

        const attestation = await zkvideo.attestAllFrames(frames, metadata || {});

        res.status(201).json({
            success: true,
            attestation: {
                id: attestation.id,
                mode: attestation.mode,
                frameCount: attestation.frameCount,
                duration: attestation.duration,
                fps: attestation.fps,
                startHash: attestation.startHash,
                endHash: attestation.endHash,
                chainIntegrity: attestation.chainIntegrity,
                processingTime: attestation.metadata.processingTime,
                timestamp: attestation.timestamp
            }
        });

    } catch (error) {
        console.error('[ZK-Video] Full attestation error:', error);
        res.status(500).json({
            error: 'attestation_failed',
            message: error.message
        });
    }
});

// =====================================
// STREAMING ENDPOINTS
// =====================================

// POST /api/zkvideo/stream/start - Start streaming session
router.post('/stream/start', (req, res) => {
    try {
        const { metadata } = req.body;

        console.log('[ZK-Video] Starting streaming session...');

        const session = zkvideo.startStreamingSession({ metadata });

        res.status(201).json({
            success: true,
            session: {
                sessionId: session.sessionId,
                status: session.status,
                bufferSize: session.bufferSize
            }
        });

    } catch (error) {
        console.error('[ZK-Video] Stream start error:', error);
        res.status(500).json({
            error: 'stream_start_failed',
            message: error.message
        });
    }
});

// POST /api/zkvideo/stream/:sessionId/frame - Add frame to stream
router.post('/stream/:sessionId/frame', async (req, res) => {
    try {
        const { sessionId } = req.params;
        const { frame } = req.body;

        if (!frame || !frame.data) {
            return res.status(400).json({
                error: 'missing_frame',
                message: 'Frame object with data required'
            });
        }

        const result = await zkvideo.addStreamingFrame(sessionId, frame);

        res.json({
            success: true,
            frame: result
        });

    } catch (error) {
        console.error('[ZK-Video] Frame add error:', error);
        res.status(500).json({
            error: 'frame_add_failed',
            message: error.message
        });
    }
});

// GET /api/zkvideo/stream/:sessionId/status - Get stream status
router.get('/stream/:sessionId/status', (req, res) => {
    try {
        const { sessionId } = req.params;
        const status = zkvideo.getStreamingStatus(sessionId);

        res.json({
            success: true,
            status
        });

    } catch (error) {
        res.status(500).json({
            error: 'status_failed',
            message: error.message
        });
    }
});

// POST /api/zkvideo/stream/:sessionId/end - End streaming session
router.post('/stream/:sessionId/end', async (req, res) => {
    try {
        const { sessionId } = req.params;

        console.log(`[ZK-Video] Ending streaming session: ${sessionId}`);

        const attestation = await zkvideo.endStreamingSession(sessionId);

        res.json({
            success: true,
            attestation: {
                id: attestation.id,
                mode: attestation.mode,
                sessionId: attestation.sessionId,
                frameCount: attestation.frameCount,
                duration: attestation.duration,
                startHash: attestation.startHash,
                endHash: attestation.endHash,
                stats: attestation.stats,
                chainIntegrity: attestation.chainIntegrity,
                timestamp: attestation.timestamp
            }
        });

    } catch (error) {
        console.error('[ZK-Video] Stream end error:', error);
        res.status(500).json({
            error: 'stream_end_failed',
            message: error.message
        });
    }
});

// =====================================
// VERIFICATION ENDPOINTS
// =====================================

// POST /api/zkvideo/verify - Verify video attestation
router.post('/verify', async (req, res) => {
    try {
        const { attestation } = req.body;

        if (!attestation) {
            return res.status(400).json({
                error: 'missing_attestation',
                message: 'Attestation object required'
            });
        }

        console.log('[ZK-Video] Verifying attestation...');

        const result = await zkvideo.verifyVideoAttestation(attestation);

        res.json({
            success: result.valid,
            verification: result
        });

    } catch (error) {
        console.error('[ZK-Video] Verify error:', error);
        res.status(500).json({
            error: 'verification_failed',
            message: error.message
        });
    }
});

// GET /api/zkvideo/attestation/:id - Get attestation by ID
router.get('/attestation/:id', (req, res) => {
    try {
        const attestation = zkvideo.getAttestation(req.params.id);

        if (!attestation) {
            return res.status(404).json({
                error: 'not_found',
                message: 'Attestation not found'
            });
        }

        res.json({
            success: true,
            attestation
        });

    } catch (error) {
        res.status(500).json({
            error: 'fetch_failed',
            message: error.message
        });
    }
});

// =====================================
// INFO ENDPOINTS
// =====================================

// GET /api/zkvideo/modes - List supported modes
router.get('/modes', (req, res) => {
    res.json({
        success: true,
        modes: [
            {
                type: VIDEO_MODES.KEYFRAME,
                name: 'Keyframe Attestation',
                description: 'Extract and attest keyframes at intervals',
                recommended: true,
                maxFrames: 'Unlimited',
                speed: 'Fast'
            },
            {
                type: VIDEO_MODES.FULL_FRAME,
                name: 'Full Frame Verification',
                description: 'Attest every single frame',
                recommended: false,
                maxFrames: 300,
                speed: 'Slow'
            },
            {
                type: VIDEO_MODES.STREAMING,
                name: 'Streaming Attestation',
                description: 'Real-time frame attestation during capture',
                recommended: true,
                maxFrames: 'Unlimited',
                speed: 'Real-time'
            }
        ]
    });
});

// GET /api/zkvideo/sessions - List active streaming sessions
router.get('/sessions', (req, res) => {
    res.json({
        success: true,
        sessions: zkvideo.getActiveSessions()
    });
});

// GET /api/zkvideo/status - Service status
router.get('/status', (req, res) => {
    res.json({
        success: true,
        status: 'operational',
        version: '1.0.0',
        features: {
            keyframeAttestation: true,
            fullFrameAttestation: true,
            streamingAttestation: true,
            temporalChaining: true,
            verification: true
        },
        activeSessions: zkvideo.getActiveSessions().length
    });
});

module.exports = router;
