/**
 * Privacy-Preserving Transformation Proofs API
 *
 * Based on "Trust Nobody: Privacy-Preserving Proofs for Edited Photos"
 * Paper: https://eprint.iacr.org/2024/1074
 *
 * Endpoints for:
 * - Creating commitments to original images
 * - Generating privacy-preserving proofs
 * - Verifying proofs WITHOUT seeing the original
 * - Managing proof chains
 */

const express = require('express');
const multer = require('multer');
const sharp = require('sharp');
const router = express.Router();

const {
    TileCommitment,
    PrivacyPreservingProofGenerator,
    PrivacyPreservingVerifier,
    PrivacyPreservingProofChain,
    storeCommitment,
    getCommitment,
    storeProofChain,
    getProofChain,
    DEFAULT_TILE_SIZE
} = require('../services/privacy-preserving-proofs');

// Configure multer for file uploads
const storage = multer.memoryStorage();
const upload = multer({
    storage,
    limits: { fileSize: 50 * 1024 * 1024 } // 50MB
});

/**
 * GET /api/privacy-proofs/status
 * Get service status and capabilities
 */
router.get('/status', (req, res) => {
    res.json({
        success: true,
        service: 'Privacy-Preserving Transformation Proofs',
        version: '1.0.0',
        paper: 'Trust Nobody: Privacy-Preserving Proofs for Edited Photos',
        reference: 'https://eprint.iacr.org/2024/1074',

        capabilities: {
            supportedTransformations: [
                'crop',
                'resize',
                'grayscale',
                'blur',
                'brightness',
                'contrast'
            ],
            tileSize: DEFAULT_TILE_SIZE,
            merkleTreeBased: true,
            zkFriendly: true
        },

        guarantees: {
            confidentiality: 'Original image pixels are NEVER revealed',
            efficiency: 'Proofs generated in seconds on standard hardware',
            authenticity: 'Cryptographic proof of valid transformation',
            fraudDetection: 'Invalid proofs are detected and rejected'
        },

        endpoints: {
            commit: 'POST /api/privacy-proofs/commit',
            transform: 'POST /api/privacy-proofs/transform',
            verify: 'POST /api/privacy-proofs/verify',
            chain: 'GET /api/privacy-proofs/chain/:chainId'
        }
    });
});

/**
 * POST /api/privacy-proofs/commit
 * Create a commitment to an original image
 * This is the first step - creates a Merkle root commitment
 *
 * Returns: Commitment ID and Merkle root (NOT the image)
 */
router.post('/commit', upload.single('image'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({
                success: false,
                error: 'No image file provided'
            });
        }

        const startTime = Date.now();
        const tileSize = parseInt(req.body.tileSize) || DEFAULT_TILE_SIZE;

        // Create tile-based commitment
        const tileCommitment = new TileCommitment(tileSize);
        const commitment = await tileCommitment.computeCommitment(req.file.buffer);

        // Store commitment (NOT the image)
        const commitmentId = storeCommitment(commitment, {
            filename: req.file.originalname,
            mimeType: req.file.mimetype,
            size: req.file.size
        });

        const processingTime = Date.now() - startTime;

        res.json({
            success: true,
            message: 'Commitment created. Original image NOT stored on server.',

            commitmentId,

            commitment: {
                merkleRoot: commitment.merkleRoot,
                width: commitment.width,
                height: commitment.height,
                tileSize: commitment.tileSize,
                tilesX: commitment.tilesX,
                tilesY: commitment.tilesY,
                totalTiles: commitment.totalTiles,
                merkleTreeDepth: commitment.merkleTreeDepth
            },

            privacy: {
                imageStored: false,
                pixelsRevealed: false,
                onlyCommitmentStored: true
            },

            metrics: {
                processingTime,
                imageSize: req.file.size
            },

            nextStep: 'Use POST /api/privacy-proofs/transform to create proofs for transformations'
        });

    } catch (error) {
        console.error('Commitment error:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

/**
 * POST /api/privacy-proofs/transform
 * Generate a privacy-preserving proof for a transformation
 *
 * Body (multipart/form-data):
 * - original: Original image file (kept private, not stored)
 * - transformed: Transformed image file
 * - transformation: JSON { type: 'crop', params: { left, top, width, height } }
 * - commitmentId: (optional) ID of stored commitment
 *
 * Returns: Privacy-preserving proof (original NOT revealed)
 */
router.post('/transform', upload.fields([
    { name: 'original', maxCount: 1 },
    { name: 'transformed', maxCount: 1 }
]), async (req, res) => {
    try {
        const originalFile = req.files?.original?.[0];
        const transformedFile = req.files?.transformed?.[0];

        if (!originalFile || !transformedFile) {
            return res.status(400).json({
                success: false,
                error: 'Both original and transformed images required'
            });
        }

        // Parse transformation
        let transformation;
        try {
            transformation = JSON.parse(req.body.transformation);
        } catch (e) {
            return res.status(400).json({
                success: false,
                error: 'Invalid transformation JSON'
            });
        }

        // Get or compute commitment to original
        let originalCommitment;
        if (req.body.commitmentId) {
            const stored = getCommitment(req.body.commitmentId);
            if (stored) {
                originalCommitment = stored.commitment;
            }
        }

        if (!originalCommitment) {
            const tileCommitment = new TileCommitment();
            originalCommitment = await tileCommitment.computeCommitment(originalFile.buffer);
        }

        // Generate privacy-preserving proof
        const proofGen = new PrivacyPreservingProofGenerator();
        const proof = await proofGen.generateProof(
            originalFile.buffer,
            transformedFile.buffer,
            transformation,
            originalCommitment
        );

        res.json({
            success: true,
            message: 'Privacy-preserving proof generated. Original image NOT included.',

            proof,

            privacy: {
                originalImageIncluded: false,
                originalPixelsRevealed: false,
                transformedImagePublic: true,
                proofSize: JSON.stringify(proof).length
            },

            verification: {
                message: 'Anyone can verify this proof WITHOUT seeing the original',
                endpoint: 'POST /api/privacy-proofs/verify'
            }
        });

    } catch (error) {
        console.error('Transform proof error:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

/**
 * POST /api/privacy-proofs/verify
 * Verify a privacy-preserving proof
 *
 * NOTE: Does NOT require the original image!
 *
 * Body (multipart/form-data or JSON):
 * - proof: The privacy-preserving proof
 * - transformed: (optional) Transformed image to verify commitment
 */
router.post('/verify', upload.single('transformed'), async (req, res) => {
    try {
        // Parse proof
        let proof;
        if (req.body.proof) {
            try {
                proof = typeof req.body.proof === 'string'
                    ? JSON.parse(req.body.proof)
                    : req.body.proof;
            } catch (e) {
                return res.status(400).json({
                    success: false,
                    error: 'Invalid proof JSON'
                });
            }
        } else {
            return res.status(400).json({
                success: false,
                error: 'Proof required'
            });
        }

        // Verify
        const verifier = new PrivacyPreservingVerifier();
        const result = await verifier.verify(
            proof,
            req.file?.buffer || null
        );

        res.json({
            success: true,
            verified: result.valid,

            result,

            privacy: {
                originalRequired: false,
                originalRevealed: false,
                verifiedWithoutOriginal: true
            },

            proofDetails: {
                type: proof.proof?.proofType,
                transformation: proof.transformation,
                originalCommitment: proof.originalCommitment?.merkleRoot?.substring(0, 32) + '...',
                transformedCommitment: proof.transformedCommitment?.merkleRoot?.substring(0, 32) + '...'
            }
        });

    } catch (error) {
        console.error('Verification error:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

/**
 * POST /api/privacy-proofs/chain/start
 * Start a new proof chain for multiple transformations
 */
router.post('/chain/start', upload.single('image'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({
                success: false,
                error: 'Original image required to start chain'
            });
        }

        // Create commitment
        const tileCommitment = new TileCommitment();
        const commitment = await tileCommitment.computeCommitment(req.file.buffer);

        // Create proof chain
        const chain = new PrivacyPreservingProofChain(commitment);
        storeProofChain(chain.getChain());

        res.json({
            success: true,
            message: 'Proof chain started. Original image NOT stored.',

            chainId: chain.chainId,

            originalCommitment: {
                merkleRoot: commitment.merkleRoot,
                width: commitment.width,
                height: commitment.height
            },

            privacy: {
                originalStored: false,
                chainTracksCommitmentsOnly: true
            },

            nextStep: 'Use POST /api/privacy-proofs/chain/:chainId/add to add transformations'
        });

    } catch (error) {
        console.error('Chain start error:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

/**
 * POST /api/privacy-proofs/chain/:chainId/add
 * Add a transformation to an existing proof chain
 */
router.post('/chain/:chainId/add', upload.fields([
    { name: 'input', maxCount: 1 },
    { name: 'output', maxCount: 1 }
]), async (req, res) => {
    try {
        const { chainId } = req.params;
        const chainData = getProofChain(chainId);

        if (!chainData) {
            return res.status(404).json({
                success: false,
                error: 'Proof chain not found'
            });
        }

        const inputFile = req.files?.input?.[0];
        const outputFile = req.files?.output?.[0];

        if (!inputFile || !outputFile) {
            return res.status(400).json({
                success: false,
                error: 'Both input and output images required'
            });
        }

        let transformation;
        try {
            transformation = JSON.parse(req.body.transformation);
        } catch (e) {
            return res.status(400).json({
                success: false,
                error: 'Invalid transformation JSON'
            });
        }

        // Generate proof
        const proofGen = new PrivacyPreservingProofGenerator();
        const proof = await proofGen.generateProof(
            inputFile.buffer,
            outputFile.buffer,
            transformation
        );

        // Add to chain
        const chain = new PrivacyPreservingProofChain(chainData.originalCommitment);
        chain.chainId = chainId;
        chain.proofs = chainData.proofs || [];
        chain.currentCommitment = chainData.finalCommitment || chainData.originalCommitment.merkleRoot;
        chain.addProof(proof);

        // Update stored chain
        storeProofChain(chain.getChain());

        res.json({
            success: true,
            message: 'Transformation added to proof chain',

            chainId,
            transformationIndex: chain.proofs.length - 1,

            transformation: proof.transformation,

            chainStatus: {
                totalTransformations: chain.proofs.length,
                currentCommitment: chain.currentCommitment.substring(0, 32) + '...'
            }
        });

    } catch (error) {
        console.error('Chain add error:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

/**
 * GET /api/privacy-proofs/chain/:chainId
 * Get a proof chain
 */
router.get('/chain/:chainId', (req, res) => {
    try {
        const { chainId } = req.params;
        const chain = getProofChain(chainId);

        if (!chain) {
            return res.status(404).json({
                success: false,
                error: 'Proof chain not found'
            });
        }

        res.json({
            success: true,
            chain,
            compactProof: new PrivacyPreservingProofChain(chain.originalCommitment).getCompactProof()
        });

    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

/**
 * POST /api/privacy-proofs/chain/:chainId/verify
 * Verify an entire proof chain
 */
router.post('/chain/:chainId/verify', upload.single('finalImage'), async (req, res) => {
    try {
        const { chainId } = req.params;
        const chainData = getProofChain(chainId);

        if (!chainData) {
            return res.status(404).json({
                success: false,
                error: 'Proof chain not found'
            });
        }

        const verifier = new PrivacyPreservingVerifier();
        const results = [];

        // Verify each proof in chain
        for (const proofEntry of chainData.proofs) {
            const fullProof = {
                type: 'privacy-preserving',
                originalCommitment: {
                    merkleRoot: proofEntry.inputCommitment
                },
                transformedCommitment: {
                    merkleRoot: proofEntry.outputCommitment
                },
                transformation: proofEntry.transformation,
                proof: proofEntry.proof
            };

            const result = await verifier.verify(fullProof);
            results.push({
                index: proofEntry.index,
                transformation: proofEntry.transformation.type,
                valid: result.valid
            });
        }

        // Verify final image if provided
        let finalImageValid = true;
        if (req.file) {
            const tileCommitment = new TileCommitment();
            const finalCommitment = await tileCommitment.computeCommitment(req.file.buffer);
            finalImageValid = finalCommitment.merkleRoot === chainData.finalCommitment;
        }

        const allValid = results.every(r => r.valid) && finalImageValid;

        res.json({
            success: true,
            chainId,
            valid: allValid,

            results,

            finalImageVerified: req.file ? finalImageValid : 'not provided',

            privacy: {
                originalRequired: false,
                verifiedWithoutOriginal: true
            }
        });

    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

/**
 * POST /api/privacy-proofs/apply-and-prove
 * Apply transformation AND generate proof in one step
 * Convenience endpoint for common workflows
 */
router.post('/apply-and-prove', upload.single('image'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({
                success: false,
                error: 'Image required'
            });
        }

        let transformation;
        try {
            transformation = JSON.parse(req.body.transformation);
        } catch (e) {
            return res.status(400).json({
                success: false,
                error: 'Invalid transformation JSON'
            });
        }

        const originalBuffer = req.file.buffer;

        // Apply transformation
        let transformedBuffer;
        const sharpInstance = sharp(originalBuffer);

        switch (transformation.type) {
            case 'crop':
                transformedBuffer = await sharpInstance.extract({
                    left: transformation.params.left || 0,
                    top: transformation.params.top || 0,
                    width: transformation.params.width,
                    height: transformation.params.height
                }).toBuffer();
                break;

            case 'resize':
                transformedBuffer = await sharpInstance.resize(
                    transformation.params.width,
                    transformation.params.height,
                    { fit: transformation.params.fit || 'cover' }
                ).toBuffer();
                break;

            case 'grayscale':
                transformedBuffer = await sharpInstance.grayscale().toBuffer();
                break;

            case 'blur':
                transformedBuffer = await sharpInstance.blur(
                    transformation.params.sigma || 1.0
                ).toBuffer();
                break;

            case 'brightness':
                transformedBuffer = await sharpInstance.modulate({
                    brightness: transformation.params.brightness || 1.0
                }).toBuffer();
                break;

            case 'contrast':
                const factor = transformation.params.contrast || 1.0;
                transformedBuffer = await sharpInstance.linear(
                    factor,
                    -(128 * (factor - 1))
                ).toBuffer();
                break;

            default:
                return res.status(400).json({
                    success: false,
                    error: `Unsupported transformation: ${transformation.type}`
                });
        }

        // Generate privacy-preserving proof
        const proofGen = new PrivacyPreservingProofGenerator();
        const proof = await proofGen.generateProof(
            originalBuffer,
            transformedBuffer,
            transformation
        );

        // Return transformed image and proof
        if (req.query.format === 'image') {
            // Return just the image with proof in header
            res.set('Content-Type', 'image/jpeg');
            res.set('X-Privacy-Proof', Buffer.from(JSON.stringify(proof)).toString('base64').substring(0, 1000));
            res.send(transformedBuffer);
        } else {
            res.json({
                success: true,
                message: 'Transformation applied and proof generated',

                transformation: proof.transformation,
                proof,

                transformedImage: {
                    size: transformedBuffer.length,
                    base64: req.query.includeImage === 'true'
                        ? transformedBuffer.toString('base64')
                        : undefined
                },

                privacy: {
                    originalIncluded: false,
                    proofHidesOriginal: true
                }
            });
        }

    } catch (error) {
        console.error('Apply and prove error:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// ============================================================================
// ADVANCED PRIVACY FEATURES
// ============================================================================

const {
    selectiveRevealGenerator,
    regionalRedactor,
    fraudDetector,
    quickFraudCheck,
    deepFraudCheck,
    batchFraudCheck
} = require('../services/advanced-privacy-features');

/**
 * POST /api/privacy-proofs/selective-reveal
 * Generate proof that a revealed region came from authenticated original
 *
 * Use case: Stock photo preview, insurance damage crop, news photo crop
 */
router.post('/selective-reveal', upload.single('image'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({
                success: false,
                error: 'Image required'
            });
        }

        let revealRegion;
        try {
            revealRegion = JSON.parse(req.body.region);
        } catch (e) {
            return res.status(400).json({
                success: false,
                error: 'Invalid region JSON. Expected: { x, y, width, height }'
            });
        }

        // Parse optional signature
        let signature = null;
        if (req.body.signature) {
            try {
                signature = JSON.parse(req.body.signature);
            } catch (e) {
                signature = req.body.signature;
            }
        }

        // Generate selective reveal proof
        const proof = await selectiveRevealGenerator.generateProof(
            req.file.buffer,
            revealRegion,
            signature
        );

        // Extract the revealed region
        const revealedImage = await sharp(req.file.buffer)
            .extract({
                left: revealRegion.x,
                top: revealRegion.y,
                width: revealRegion.width,
                height: revealRegion.height
            })
            .jpeg({ quality: 90 })
            .toBuffer();

        // Return based on format preference
        if (req.query.format === 'image') {
            res.set('Content-Type', 'image/jpeg');
            res.set('X-Selective-Reveal-Proof', Buffer.from(JSON.stringify(proof)).toString('base64').substring(0, 500));
            res.send(revealedImage);
        } else {
            res.json({
                success: true,
                message: 'Selective reveal proof generated',

                proof,

                revealedImage: {
                    size: revealedImage.length,
                    base64: req.query.includeImage === 'true'
                        ? revealedImage.toString('base64')
                        : undefined
                },

                useCase: {
                    description: 'Share the revealed image + proof',
                    verification: 'Verifier can confirm region came from authenticated original',
                    privacy: 'Rest of original image remains private'
                }
            });
        }

    } catch (error) {
        console.error('Selective reveal error:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

/**
 * POST /api/privacy-proofs/selective-reveal/verify
 * Verify a selective reveal proof
 */
router.post('/selective-reveal/verify', upload.single('revealedImage'), async (req, res) => {
    try {
        let proof;
        try {
            proof = JSON.parse(req.body.proof);
        } catch (e) {
            return res.status(400).json({
                success: false,
                error: 'Invalid proof JSON'
            });
        }

        const result = await selectiveRevealGenerator.verifyProof(
            proof,
            req.file?.buffer || null
        );

        res.json({
            success: true,
            verified: result.valid,
            result,

            privacy: {
                originalRequired: false,
                verifiedWithoutOriginal: true
            }
        });

    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

/**
 * POST /api/privacy-proofs/redact
 * Redact regions (blur/black out) with proof that rest is untouched
 *
 * Use case: Hide faces, license plates, sensitive info
 */
router.post('/redact', upload.single('image'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({
                success: false,
                error: 'Image required'
            });
        }

        let regions;
        try {
            regions = JSON.parse(req.body.regions);
        } catch (e) {
            return res.status(400).json({
                success: false,
                error: 'Invalid regions JSON. Expected: [{ x, y, width, height, type: "blur"|"black" }]'
            });
        }

        // Parse options
        const options = {};
        if (req.body.blurSigma) options.blurSigma = parseFloat(req.body.blurSigma);
        if (req.body.blackColor) options.blackColor = req.body.blackColor;

        // Perform redaction with proof
        const result = await regionalRedactor.redactWithProof(
            req.file.buffer,
            regions,
            options
        );

        // Return based on format preference
        if (req.query.format === 'image') {
            res.set('Content-Type', 'image/jpeg');
            res.set('X-Redaction-Proof', Buffer.from(JSON.stringify(result.proof)).toString('base64').substring(0, 500));
            res.send(result.redactedImage);
        } else {
            res.json({
                success: true,
                message: 'Regions redacted with proof',

                redactions: result.redactions,
                proof: result.proof,
                privacy: result.privacy,
                dimensions: result.dimensions,
                metrics: result.metrics,

                redactedImage: {
                    size: result.redactedImage.length,
                    base64: req.query.includeImage === 'true'
                        ? result.redactedImage.toString('base64')
                        : undefined
                },

                useCase: {
                    description: 'Share redacted image + proof',
                    verification: 'Verifier can confirm non-redacted areas are untouched',
                    privacy: 'Redacted content is hidden, rest is proven authentic'
                }
            });
        }

    } catch (error) {
        console.error('Redaction error:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

/**
 * POST /api/privacy-proofs/redact/verify
 * Verify a redaction proof
 */
router.post('/redact/verify', upload.single('redactedImage'), async (req, res) => {
    try {
        let proof;
        try {
            proof = JSON.parse(req.body.proof);
        } catch (e) {
            return res.status(400).json({
                success: false,
                error: 'Invalid proof JSON'
            });
        }

        const result = await regionalRedactor.verifyRedactionProof(
            proof,
            req.file?.buffer || null
        );

        res.json({
            success: true,
            verified: result.valid,
            result,

            privacy: {
                originalRequired: false,
                verifiedWithoutOriginal: true
            }
        });

    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

/**
 * POST /api/privacy-proofs/fraud-check
 * Fast fraud detection - millisecond rejection of invalid proofs
 *
 * Use case: Pre-filter proofs before expensive full verification
 */
router.post('/fraud-check', express.json(), async (req, res) => {
    try {
        const { proof, mode = 'quick' } = req.body;

        if (!proof) {
            return res.status(400).json({
                success: false,
                error: 'Proof required'
            });
        }

        let result;
        if (mode === 'deep') {
            result = deepFraudCheck(proof);
        } else {
            result = quickFraudCheck(proof);
        }

        res.json({
            success: true,
            mode,
            ...result,

            recommendation: result.fraudDetected
                ? 'REJECT - Do not proceed with full verification'
                : 'PROCEED - Proof passed quick checks, run full verification'
        });

    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

/**
 * POST /api/privacy-proofs/fraud-check/batch
 * Batch fraud check - filter multiple proofs quickly
 */
router.post('/fraud-check/batch', express.json(), async (req, res) => {
    try {
        const { proofs } = req.body;

        if (!proofs || !Array.isArray(proofs)) {
            return res.status(400).json({
                success: false,
                error: 'Array of proofs required'
            });
        }

        const result = batchFraudCheck(proofs);

        res.json({
            success: true,
            ...result,

            summary: {
                passed: result.validProofs,
                failed: result.fraudsDetected,
                passRate: ((result.validProofs / result.totalChecked) * 100).toFixed(1) + '%'
            }
        });

    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

/**
 * GET /api/privacy-proofs/features
 * List all available privacy features
 */
router.get('/features', (req, res) => {
    res.json({
        success: true,
        features: [
            {
                name: 'Privacy-Preserving Transformations',
                endpoint: 'POST /api/privacy-proofs/transform',
                description: 'Prove transformation without revealing original'
            },
            {
                name: 'Selective Reveal',
                endpoint: 'POST /api/privacy-proofs/selective-reveal',
                description: 'Prove a region came from authenticated original'
            },
            {
                name: 'Regional Redaction',
                endpoint: 'POST /api/privacy-proofs/redact',
                description: 'Blur/black out regions with proof rest is untouched'
            },
            {
                name: 'Fast Fraud Detection',
                endpoint: 'POST /api/privacy-proofs/fraud-check',
                description: 'Millisecond rejection of invalid proofs'
            },
            {
                name: 'Batch Fraud Check',
                endpoint: 'POST /api/privacy-proofs/fraud-check/batch',
                description: 'Filter multiple proofs quickly'
            },
            {
                name: 'Apply and Prove',
                endpoint: 'POST /api/privacy-proofs/apply-and-prove',
                description: 'Apply transformation and generate proof in one step'
            },
            {
                name: 'Proof Chains',
                endpoint: 'POST /api/privacy-proofs/chain/start',
                description: 'Track multiple transformations with proof chain'
            }
        ],

        guarantees: {
            confidentiality: 'Original image pixels are NEVER revealed',
            authenticity: 'Cryptographic proof of valid transformation',
            efficiency: 'Proofs generated in seconds',
            fraudDetection: 'Invalid proofs detected in milliseconds'
        }
    });
});

module.exports = router;
