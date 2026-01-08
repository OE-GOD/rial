/**
 * Batch Privacy Proofs API
 *
 * Endpoints for batch processing and proof export
 */

const express = require('express');
const router = express.Router();
const multer = require('multer');
const { BatchPrivacyProofProcessor } = require('../services/batch-privacy-proofs');
const { ProofChainExporter, ProofChainImporter } = require('../services/proof-export');
const { VideoPrivacyProofGenerator, VideoPrivacyProofVerifier } = require('../services/video-privacy-proofs');

// Configure multer for multiple file uploads
const storage = multer.memoryStorage();
const upload = multer({
    storage,
    limits: { fileSize: 50 * 1024 * 1024, files: 20 } // 50MB per file, max 20 files
});

const batchProcessor = new BatchPrivacyProofProcessor();
const proofExporter = new ProofChainExporter();
const proofImporter = new ProofChainImporter();
const videoProofGenerator = new VideoPrivacyProofGenerator();
const videoProofVerifier = new VideoPrivacyProofVerifier();

// ============================================
// BATCH PROCESSING ENDPOINTS
// ============================================

/**
 * POST /api/batch/commit
 * Create commitments for multiple images
 */
router.post('/commit', upload.array('images', 20), async (req, res) => {
    try {
        if (!req.files || req.files.length === 0) {
            return res.status(400).json({ success: false, error: 'No images provided' });
        }

        const images = req.files.map((file, idx) => ({
            index: idx,
            filename: file.originalname,
            buffer: file.buffer
        }));

        const result = await batchProcessor.batchCommit(images);

        res.json(result);
    } catch (error) {
        console.error('Batch commit error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * POST /api/batch/verify
 * Verify multiple proofs at once
 */
router.post('/verify', express.json({ limit: '10mb' }), async (req, res) => {
    try {
        const { proofs } = req.body;

        if (!proofs || !Array.isArray(proofs)) {
            return res.status(400).json({ success: false, error: 'Proofs array required' });
        }

        const result = await batchProcessor.batchVerify(proofs);

        res.json(result);
    } catch (error) {
        console.error('Batch verify error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * POST /api/batch/selective-reveal
 * Batch selective reveal for multiple images
 */
router.post('/selective-reveal', upload.array('images', 20), async (req, res) => {
    try {
        if (!req.files || req.files.length === 0) {
            return res.status(400).json({ success: false, error: 'No images provided' });
        }

        const regions = JSON.parse(req.body.regions || '[]');

        const items = req.files.map((file, idx) => ({
            index: idx,
            filename: file.originalname,
            imageBuffer: file.buffer,
            region: regions[idx] || { x: 0, y: 0, width: 100, height: 100 }
        }));

        const result = await batchProcessor.batchSelectiveReveal(items);

        res.json(result);
    } catch (error) {
        console.error('Batch selective reveal error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * POST /api/batch/redact
 * Batch redaction for multiple images
 */
router.post('/redact', upload.array('images', 20), async (req, res) => {
    try {
        if (!req.files || req.files.length === 0) {
            return res.status(400).json({ success: false, error: 'No images provided' });
        }

        const regionsPerImage = JSON.parse(req.body.regions || '[]');

        const items = req.files.map((file, idx) => ({
            index: idx,
            filename: file.originalname,
            imageBuffer: file.buffer,
            regions: regionsPerImage[idx] || [{ x: 10, y: 10, width: 50, height: 50, type: 'blur' }]
        }));

        const result = await batchProcessor.batchRedact(items);

        res.json(result);
    } catch (error) {
        console.error('Batch redact error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// ============================================
// PROOF EXPORT ENDPOINTS
// ============================================

/**
 * POST /api/batch/export/json
 * Export proof chain as JSON
 */
router.post('/export/json', express.json(), (req, res) => {
    try {
        const { proofChain, options } = req.body;

        if (!proofChain) {
            return res.status(400).json({ success: false, error: 'Proof chain required' });
        }

        const exported = proofExporter.exportToJSON(proofChain, options || {});

        res.json({
            success: true,
            format: 'json',
            export: exported
        });
    } catch (error) {
        console.error('Export JSON error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * POST /api/batch/export/qr
 * Export proof chain as QR code data
 */
router.post('/export/qr', express.json(), (req, res) => {
    try {
        const { proofChain, options } = req.body;

        if (!proofChain) {
            return res.status(400).json({ success: false, error: 'Proof chain required' });
        }

        const exported = proofExporter.exportToQR(proofChain, options || {});

        res.json({
            success: true,
            format: 'qr',
            export: exported
        });
    } catch (error) {
        console.error('Export QR error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * POST /api/batch/export/url
 * Export proof chain as verification URL
 */
router.post('/export/url', express.json(), (req, res) => {
    try {
        const { proofChain, baseUrl } = req.body;

        if (!proofChain) {
            return res.status(400).json({ success: false, error: 'Proof chain required' });
        }

        const exported = proofExporter.exportToURL(proofChain, baseUrl);

        res.json({
            success: true,
            format: 'url',
            export: exported
        });
    } catch (error) {
        console.error('Export URL error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * POST /api/batch/export/widget
 * Export proof chain as embeddable HTML widget
 */
router.post('/export/widget', express.json(), (req, res) => {
    try {
        const { proofChain } = req.body;

        if (!proofChain) {
            return res.status(400).json({ success: false, error: 'Proof chain required' });
        }

        const exported = proofExporter.exportToWidget(proofChain);

        res.json({
            success: true,
            format: 'widget',
            export: exported
        });
    } catch (error) {
        console.error('Export widget error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * POST /api/batch/export/all
 * Export proof chain in all formats
 */
router.post('/export/all', express.json(), (req, res) => {
    try {
        const { proofChain } = req.body;

        if (!proofChain) {
            return res.status(400).json({ success: false, error: 'Proof chain required' });
        }

        const exported = proofExporter.exportForSharing(proofChain);

        res.json({
            success: true,
            formats: ['json', 'compact', 'qr', 'url', 'widget'],
            exports: exported
        });
    } catch (error) {
        console.error('Export all error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * POST /api/batch/import
 * Import proof chain from exported format
 */
router.post('/import', express.json(), (req, res) => {
    try {
        const { data, format } = req.body;

        if (!data) {
            return res.status(400).json({ success: false, error: 'Data required' });
        }

        let imported;
        switch (format) {
            case 'json':
                imported = proofImporter.importFromJSON(data);
                break;
            case 'compact':
                imported = proofImporter.importFromCompact(data);
                break;
            case 'qr':
                imported = proofImporter.importFromQR(data);
                break;
            default:
                return res.status(400).json({ success: false, error: 'Unknown format' });
        }

        res.json({
            success: true,
            imported
        });
    } catch (error) {
        console.error('Import error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// ============================================
// VIDEO PROOF ENDPOINTS
// ============================================

/**
 * POST /api/batch/video/commit
 * Create commitment for video keyframes
 */
router.post('/video/commit', upload.array('keyframes', 100), async (req, res) => {
    try {
        if (!req.files || req.files.length === 0) {
            return res.status(400).json({ success: false, error: 'No keyframes provided' });
        }

        const keyframes = req.files.map((file, idx) => ({
            index: idx,
            buffer: file.buffer,
            timestamp: idx * (1000 / 30) // Assume 30fps
        }));

        const result = await videoProofGenerator.createVideoCommitment(keyframes);

        res.json({
            success: true,
            ...result
        });
    } catch (error) {
        console.error('Video commit error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * POST /api/batch/video/segment-reveal
 * Generate segment reveal proof for video
 */
router.post('/video/segment-reveal', upload.array('keyframes', 100), async (req, res) => {
    try {
        if (!req.files || req.files.length === 0) {
            return res.status(400).json({ success: false, error: 'No keyframes provided' });
        }

        const { startFrame, endFrame } = req.body;
        const start = parseInt(startFrame) || 0;
        const end = parseInt(endFrame) || req.files.length - 1;

        const keyframes = req.files.map((file, idx) => ({
            index: idx,
            buffer: file.buffer
        }));

        const result = await videoProofGenerator.generateSegmentRevealProof(
            keyframes,
            start,
            end
        );

        res.json({
            success: true,
            ...result
        });
    } catch (error) {
        console.error('Video segment reveal error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * POST /api/batch/video/redact
 * Generate redaction proof for video frames
 */
router.post('/video/redact', upload.array('keyframes', 100), async (req, res) => {
    try {
        if (!req.files || req.files.length === 0) {
            return res.status(400).json({ success: false, error: 'No keyframes provided' });
        }

        const redactedFrames = JSON.parse(req.body.redactedFrames || '[]');
        const redactionType = req.body.redactionType || 'blur';

        const keyframes = req.files.map((file, idx) => ({
            index: idx,
            buffer: file.buffer
        }));

        const result = await videoProofGenerator.generateVideoRedactionProof(
            keyframes,
            redactedFrames,
            redactionType
        );

        res.json({
            success: true,
            ...result
        });
    } catch (error) {
        console.error('Video redact error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * GET /api/batch/status
 * Get batch processing status
 */
router.get('/status', (req, res) => {
    res.json({
        success: true,
        service: 'Batch Privacy Proofs',
        version: '1.0.0',
        capabilities: {
            batchCommit: true,
            batchVerify: true,
            batchSelectiveReveal: true,
            batchRedact: true,
            proofExport: ['json', 'compact', 'qr', 'url', 'widget'],
            videoProofs: true,
            maxImagesPerBatch: 20,
            maxKeyframesPerVideo: 100
        },
        endpoints: {
            batch: {
                commit: 'POST /api/batch/commit',
                verify: 'POST /api/batch/verify',
                selectiveReveal: 'POST /api/batch/selective-reveal',
                redact: 'POST /api/batch/redact'
            },
            export: {
                json: 'POST /api/batch/export/json',
                qr: 'POST /api/batch/export/qr',
                url: 'POST /api/batch/export/url',
                widget: 'POST /api/batch/export/widget',
                all: 'POST /api/batch/export/all'
            },
            import: 'POST /api/batch/import',
            video: {
                commit: 'POST /api/batch/video/commit',
                segmentReveal: 'POST /api/batch/video/segment-reveal',
                redact: 'POST /api/batch/video/redact'
            }
        }
    });
});

module.exports = router;
