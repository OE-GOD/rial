/**
 * ZK-IMG API Routes
 *
 * REST API for the ZK-IMG verification system
 * Based on "ZK-IMG: Attested Images via Zero-Knowledge Proofs"
 */

const express = require('express');
const router = express.Router();
const multer = require('multer');
const { getZKIMGService, TRANSFORMATIONS } = require('../services/zk-img');

const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 50 * 1024 * 1024 } // 50MB
});

const zkimg = getZKIMGService();

// =====================================
// POST /api/zkimg/attest - Create attestation
// =====================================

router.post('/attest', upload.single('image'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({
                error: 'missing_image',
                message: 'Image file required'
            });
        }

        const metadata = req.body.metadata ? JSON.parse(req.body.metadata) : {};
        const signature = req.body.signature || '';
        const publicKey = req.body.publicKey || '';

        console.log('[ZK-IMG] Creating attestation...');

        const attestation = await zkimg.createAttestation(
            req.file.buffer,
            metadata,
            signature,
            publicKey
        );

        res.status(201).json({
            success: true,
            attestation: {
                id: attestation.id,
                imageHash: attestation.imageHash,
                merkleRoot: attestation.merkleRoot,
                timestamp: attestation.timestamp,
                status: attestation.status
            }
        });

    } catch (error) {
        console.error('[ZK-IMG] Attestation error:', error);
        res.status(500).json({
            error: 'attestation_failed',
            message: error.message
        });
    }
});

// =====================================
// POST /api/zkimg/transform - Apply transformation with proof
// =====================================

router.post('/transform', upload.single('image'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({
                error: 'missing_image',
                message: 'Image file required'
            });
        }

        const transformation = req.body.transformation
            ? JSON.parse(req.body.transformation)
            : null;

        if (!transformation || !transformation.type) {
            return res.status(400).json({
                error: 'missing_transformation',
                message: 'Transformation object required with type and params'
            });
        }

        const options = {
            revealOutput: req.body.revealOutput !== 'false'
        };

        console.log(`[ZK-IMG] Applying transformation: ${transformation.type}`);

        const result = await zkimg.applyTransformation(
            req.file.buffer,
            transformation,
            options
        );

        // Prepare response
        const response = {
            success: true,
            proof: result.proof,
            publicOutputs: result.publicOutputs
        };

        // Include transformed image if requested
        if (result.outputImage) {
            response.outputImage = result.outputImage.toString('base64');
        }

        res.json(response);

    } catch (error) {
        console.error('[ZK-IMG] Transform error:', error);
        res.status(500).json({
            error: 'transformation_failed',
            message: error.message
        });
    }
});

// =====================================
// POST /api/zkimg/transform-chain - Apply multiple transformations
// =====================================

router.post('/transform-chain', upload.single('image'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({
                error: 'missing_image',
                message: 'Image file required'
            });
        }

        const transformations = req.body.transformations
            ? JSON.parse(req.body.transformations)
            : null;

        if (!transformations || !Array.isArray(transformations)) {
            return res.status(400).json({
                error: 'missing_transformations',
                message: 'Array of transformations required'
            });
        }

        const options = {
            revealFinal: req.body.revealFinal !== 'false',
            revealIntermediate: req.body.revealIntermediate === 'true'
        };

        console.log(`[ZK-IMG] Applying chain of ${transformations.length} transformations`);

        const result = await zkimg.applyTransformationChain(
            req.file.buffer,
            transformations,
            options
        );

        const response = {
            success: true,
            chainProof: {
                chainLength: result.chainProof.chainLength,
                initialHash: result.chainProof.initialHash,
                finalHash: result.chainProof.finalHash,
                proofs: result.chainProof.proofs.map(p => ({
                    transformation: p.transformation,
                    inputHash: p.inputHash,
                    outputHash: p.outputHash
                }))
            },
            transformationCount: result.transformationCount
        };

        if (result.finalImage) {
            response.finalImage = result.finalImage.toString('base64');
        }

        res.json(response);

    } catch (error) {
        console.error('[ZK-IMG] Chain error:', error);
        res.status(500).json({
            error: 'chain_failed',
            message: error.message
        });
    }
});

// =====================================
// POST /api/zkimg/verify - Verify a proof
// =====================================

router.post('/verify', async (req, res) => {
    try {
        const { proof } = req.body;

        if (!proof) {
            return res.status(400).json({
                error: 'missing_proof',
                message: 'Proof object required'
            });
        }

        console.log('[ZK-IMG] Verifying proof...');

        const result = await zkimg.verifyTransformationProof(proof);

        res.json({
            success: true,
            verification: result
        });

    } catch (error) {
        console.error('[ZK-IMG] Verify error:', error);
        res.status(500).json({
            error: 'verification_failed',
            message: error.message
        });
    }
});

// =====================================
// POST /api/zkimg/verify-chain - Verify a chain of proofs
// =====================================

router.post('/verify-chain', async (req, res) => {
    try {
        const { chainProof } = req.body;

        if (!chainProof) {
            return res.status(400).json({
                error: 'missing_chain_proof',
                message: 'Chain proof object required'
            });
        }

        console.log('[ZK-IMG] Verifying chain...');

        const result = await zkimg.verifyChain(chainProof);

        res.json({
            success: true,
            verification: result
        });

    } catch (error) {
        console.error('[ZK-IMG] Chain verify error:', error);
        res.status(500).json({
            error: 'chain_verification_failed',
            message: error.message
        });
    }
});

// =====================================
// POST /api/zkimg/verify-complete - Full verification
// =====================================

router.post('/verify-complete', async (req, res) => {
    try {
        const { attestation, transformationProofs } = req.body;

        if (!attestation) {
            return res.status(400).json({
                error: 'missing_attestation',
                message: 'Attestation object required'
            });
        }

        console.log('[ZK-IMG] Complete verification...');

        const result = await zkimg.verifyComplete(attestation, transformationProofs || []);

        res.json({
            success: result.valid,
            verification: result
        });

    } catch (error) {
        console.error('[ZK-IMG] Complete verify error:', error);
        res.status(500).json({
            error: 'complete_verification_failed',
            message: error.message
        });
    }
});

// =====================================
// GET /api/zkimg/transformations - List supported transformations
// =====================================

router.get('/transformations', (req, res) => {
    res.json({
        success: true,
        transformations: [
            {
                type: 'crop',
                description: 'Crop a rectangular region',
                params: ['x', 'y', 'width', 'height'],
                zkProof: true
            },
            {
                type: 'resize',
                description: 'Resize to new dimensions',
                params: ['width', 'height'],
                zkProof: true
            },
            {
                type: 'grayscale',
                description: 'Convert to grayscale',
                params: [],
                zkProof: true
            },
            {
                type: 'brightness',
                description: 'Adjust brightness',
                params: ['factor'],
                zkProof: false // Hash commitment only
            },
            {
                type: 'contrast',
                description: 'Adjust contrast',
                params: ['factor'],
                zkProof: false
            },
            {
                type: 'rotate',
                description: 'Rotate image',
                params: ['angle'],
                zkProof: false
            }
        ]
    });
});

// =====================================
// GET /api/zkimg/status - Service status
// =====================================

router.get('/status', (req, res) => {
    res.json({
        success: true,
        status: 'operational',
        version: '1.0.0',
        paper: 'ZK-IMG: Attested Images via Zero-Knowledge Proofs',
        authors: 'Kang, Hashimoto, Stoica, Sun (2022)',
        features: {
            attestation: true,
            transformationProofs: true,
            chainedProofs: true,
            hdImages: true,
            privacy: true
        }
    });
});

module.exports = router;
