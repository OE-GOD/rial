/**
 * API endpoints for Screen Detection Agent
 */

const express = require('express');
const router = express.Router();
const multer = require('multer');
const screenDetectionAgent = require('./screen-detection-agent');
const { logger } = require('../src/monitoring');

const upload = multer({ memory: true });

/**
 * Analyze image for screen detection
 */
router.post('/detect-screen', upload.single('image'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: 'No image provided' });
        }

        const imageBuffer = req.file.buffer;
        const metadata = req.body.metadata ? JSON.parse(req.body.metadata) : {};

        logger.info('Screen detection requested', { 
            imageSize: imageBuffer.length,
            hasMetadata: !!metadata
        });

        // Run detection
        const result = await screenDetectionAgent.detectScreen(imageBuffer, metadata);

        // Log suspicious detections
        if (result.verdict.isScreen) {
            logger.warn('Screen detected in image', {
                score: result.verdict.score,
                evidence: result.evidence.strongIndicators
            });
        }

        res.json({
            success: true,
            detection: result
        });

    } catch (error) {
        logger.error('Screen detection failed', { error: error.message });
        res.status(500).json({ 
            error: 'Screen detection failed',
            details: error.message 
        });
    }
});

/**
 * Get detection thresholds and settings
 */
router.get('/detection-settings', (req, res) => {
    res.json({
        thresholds: screenDetectionAgent.thresholds,
        initialized: screenDetectionAgent.initialized,
        models: Object.keys(screenDetectionAgent.models).map(name => ({
            name,
            loaded: !!screenDetectionAgent.models[name]
        }))
    });
});

/**
 * Update detection thresholds
 */
router.put('/detection-settings', async (req, res) => {
    try {
        const { thresholds } = req.body;
        
        if (thresholds) {
            Object.assign(screenDetectionAgent.thresholds, thresholds);
        }

        res.json({
            success: true,
            thresholds: screenDetectionAgent.thresholds
        });

    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

/**
 * Train the model with labeled data
 */
router.post('/train-model', upload.array('images', 100), async (req, res) => {
    try {
        const { labels } = req.body; // Array of 1s (screen) and 0s (real)
        
        if (!req.files || req.files.length === 0) {
            return res.status(400).json({ error: 'No training images provided' });
        }

        logger.info('Model training requested', { 
            samples: req.files.length 
        });

        // Prepare training data
        const trainingData = {
            images: req.files.map(f => f.buffer),
            labels: JSON.parse(labels)
        };

        // Train model (this would be async in production)
        await screenDetectionAgent.trainModel(trainingData);

        res.json({
            success: true,
            message: 'Model training started',
            samples: req.files.length
        });

    } catch (error) {
        logger.error('Model training failed', { error: error.message });
        res.status(500).json({ error: error.message });
    }
});

/**
 * Batch analysis endpoint
 */
router.post('/batch-detect', upload.array('images', 10), async (req, res) => {
    try {
        if (!req.files || req.files.length === 0) {
            return res.status(400).json({ error: 'No images provided' });
        }

        const results = await Promise.all(
            req.files.map(async (file, index) => {
                try {
                    const metadata = req.body[`metadata_${index}`] 
                        ? JSON.parse(req.body[`metadata_${index}`]) 
                        : {};
                    
                    const result = await screenDetectionAgent.detectScreen(
                        file.buffer,
                        metadata
                    );

                    return {
                        index,
                        filename: file.originalname,
                        detection: result
                    };
                } catch (error) {
                    return {
                        index,
                        filename: file.originalname,
                        error: error.message
                    };
                }
            })
        );

        res.json({
            success: true,
            results,
            summary: {
                total: results.length,
                screensDetected: results.filter(r => r.detection?.verdict?.isScreen).length,
                errors: results.filter(r => r.error).length
            }
        });

    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

module.exports = router;
