/**
 * C2PA (Content Credentials) API Routes
 *
 * Provides REST endpoints for:
 * - Creating C2PA content credentials for images
 * - Verifying C2PA credentials
 * - Reading manifest data from images
 *
 * Industry Standard: https://c2pa.org
 */

const express = require('express');
const multer = require('multer');
const router = express.Router();

const { getC2PAService } = require('../services/c2pa-service');

// Configure multer for file uploads
const storage = multer.memoryStorage();
const upload = multer({
    storage: storage,
    limits: {
        fileSize: 50 * 1024 * 1024 // 50MB limit
    }
});

/**
 * GET /api/c2pa/status
 * Get C2PA service status
 */
router.get('/status', async (req, res) => {
    try {
        const c2paService = getC2PAService();
        await c2paService.initialize();

        const status = c2paService.getStatus();

        res.json({
            success: true,
            service: 'C2PA Content Credentials',
            version: '2.0',
            ...status,
            endpoints: {
                sign: 'POST /api/c2pa/sign',
                verify: 'POST /api/c2pa/verify',
                read: 'POST /api/c2pa/read',
                create: 'POST /api/c2pa/create-credential'
            },
            documentation: 'https://c2pa.org/specifications/specifications/2.2/specs/C2PA_Specification.html'
        });

    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

/**
 * POST /api/c2pa/sign
 * Sign an image with C2PA credentials
 *
 * Body (multipart/form-data):
 * - image: Image file to sign
 * - title: (optional) Title for the credential
 * - metadata: (optional) JSON string with additional metadata
 */
router.post('/sign', upload.single('image'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({
                success: false,
                error: 'No image file provided'
            });
        }

        const c2paService = getC2PAService();
        await c2paService.initialize();

        // Parse optional metadata
        let metadata = {};
        if (req.body.metadata) {
            try {
                metadata = JSON.parse(req.body.metadata);
            } catch (e) {
                // Ignore parse errors
            }
        }

        // Create manifest
        const manifest = c2paService.createManifest({
            title: req.body.title || 'Signed Image',
            format: req.file.mimetype || 'image/jpeg'
        });

        // Add basic action
        c2paService.addActionAssertion(manifest, {
            type: 'c2pa.created',
            when: new Date().toISOString()
        });

        // Add hash binding
        c2paService.addHashAssertion(manifest, req.file.buffer);

        // Add any provided metadata as EXIF
        if (metadata.latitude || metadata.longitude) {
            c2paService.addLocationAssertion(manifest, metadata);
        }

        // Sign the image
        const result = await c2paService.signImage(req.file.buffer, manifest);

        // Return signed image or credential info
        if (result.method === 'c2pa-library') {
            // Send back the signed image with embedded credentials
            res.set('Content-Type', 'image/jpeg');
            res.set('X-C2PA-Signed', 'true');
            res.set('X-C2PA-Method', result.method);
            res.send(result.signedImage);
        } else {
            // Send JSON response with detached credential
            res.json({
                success: true,
                method: result.method,
                message: 'Image signed with detached C2PA credential',
                credential: result.contentCredentials.credential,
                manifest: result.manifest,
                note: 'Store the credential alongside the image for verification'
            });
        }

    } catch (error) {
        console.error('C2PA signing error:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

/**
 * POST /api/c2pa/verify
 * Verify C2PA credentials in an image
 *
 * Body (multipart/form-data):
 * - image: Image file to verify
 * - credential: (optional) Detached credential JSON
 */
router.post('/verify', upload.single('image'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({
                success: false,
                error: 'No image file provided'
            });
        }

        const c2paService = getC2PAService();
        await c2paService.initialize();

        let result;

        // Check for detached credential
        if (req.body.credential) {
            try {
                const credential = JSON.parse(req.body.credential);
                result = await c2paService.verifyDetachedCredential(req.file.buffer, credential);
            } catch (e) {
                return res.status(400).json({
                    success: false,
                    error: 'Invalid credential JSON'
                });
            }
        } else {
            // Verify embedded credentials
            result = await c2paService.verifyImage(req.file.buffer);
        }

        res.json({
            success: true,
            ...result,
            verificationTime: new Date().toISOString()
        });

    } catch (error) {
        console.error('C2PA verification error:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

/**
 * POST /api/c2pa/read
 * Read C2PA manifest from an image (without full verification)
 *
 * Body (multipart/form-data):
 * - image: Image file to read
 */
router.post('/read', upload.single('image'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({
                success: false,
                error: 'No image file provided'
            });
        }

        const c2paService = getC2PAService();
        await c2paService.initialize();

        const result = await c2paService.verifyImage(req.file.buffer);

        if (!result.hasCredentials) {
            return res.json({
                success: true,
                hasCredentials: false,
                message: 'No C2PA credentials found in image'
            });
        }

        res.json({
            success: true,
            hasCredentials: true,
            manifest: result.manifest,
            assertions: result.assertions,
            signatureInfo: result.signatureInfo,
            claimGenerator: result.claimGenerator
        });

    } catch (error) {
        console.error('C2PA read error:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

/**
 * POST /api/c2pa/create-credential
 * Create a complete C2PA content credential for a Rial-certified image
 *
 * Body (multipart/form-data):
 * - image: Image file
 * - rialData: JSON string with Rial certification data
 *   - merkleRoot: Merkle root from Rial certification
 *   - signature: Device signature
 *   - publicKey: Device public key
 *   - proofMetadata: Camera/GPS/motion metadata
 *   - zkProof: Zero-knowledge proof (if any)
 */
router.post('/create-credential', upload.single('image'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({
                success: false,
                error: 'No image file provided'
            });
        }

        const c2paService = getC2PAService();
        await c2paService.initialize();

        // Parse Rial data
        let rialData = {};
        if (req.body.rialData) {
            try {
                rialData = JSON.parse(req.body.rialData);
            } catch (e) {
                return res.status(400).json({
                    success: false,
                    error: 'Invalid rialData JSON'
                });
            }
        }

        // Add any form fields to rialData
        if (req.body.merkleRoot) rialData.merkleRoot = req.body.merkleRoot;
        if (req.body.signature) rialData.signature = req.body.signature;
        if (req.body.publicKey) rialData.publicKey = req.body.publicKey;
        if (req.body.title) rialData.title = req.body.title;

        // Create the complete content credential
        const result = await c2paService.createContentCredential(
            req.file.buffer,
            rialData
        );

        // Return based on signing method
        if (result.method === 'c2pa-library') {
            // Option to return image or JSON
            if (req.query.format === 'image') {
                res.set('Content-Type', 'image/jpeg');
                res.set('X-C2PA-Signed', 'true');
                res.send(result.signedImage);
            } else {
                res.json({
                    success: true,
                    method: result.method,
                    c2paVersion: result.c2paVersion,
                    interoperable: result.interoperable,
                    verifiableWith: result.verifiableWith,
                    manifest: result.manifest,
                    imageSize: result.signedImage.length,
                    message: 'Add ?format=image to get the signed image directly'
                });
            }
        } else {
            res.json({
                success: true,
                method: result.method,
                c2paVersion: result.c2paVersion,
                interoperable: result.interoperable,
                verifiableWith: result.verifiableWith,
                manifest: result.manifest,
                credential: result.contentCredentials.credential,
                note: 'Detached credential - store alongside image for verification'
            });
        }

    } catch (error) {
        console.error('C2PA credential creation error:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

/**
 * GET /api/c2pa/supported-assertions
 * List all supported C2PA assertion types
 */
router.get('/supported-assertions', (req, res) => {
    res.json({
        success: true,
        assertions: [
            {
                label: 'c2pa.actions',
                description: 'Actions taken on the asset (create, edit, etc.)',
                required: true
            },
            {
                label: 'c2pa.hash.data',
                description: 'Hash binding for content integrity',
                required: true
            },
            {
                label: 'stds.exif',
                description: 'EXIF metadata (camera, settings, etc.)',
                required: false
            },
            {
                label: 'c2pa.location.GeoCoordinates',
                description: 'GPS coordinates',
                required: false
            },
            {
                label: 'stds.schema-org.CreativeWork',
                description: 'Authorship and copyright information',
                required: false
            },
            {
                label: 'c2pa.thumbnail.claim',
                description: 'Thumbnail of the asset',
                required: false
            },
            {
                label: 'rial.authenticity',
                description: 'Rial-specific authenticity data (Merkle root, ZK proofs, device attestation)',
                required: false,
                custom: true
            }
        ],
        digitalSourceTypes: [
            {
                value: 'http://cv.iptc.org/newscodes/digitalsourcetype/digitalCapture',
                description: 'Original digital capture (camera)'
            },
            {
                value: 'http://cv.iptc.org/newscodes/digitalsourcetype/trainedAlgorithmicMedia',
                description: 'AI-generated content'
            },
            {
                value: 'http://cv.iptc.org/newscodes/digitalsourcetype/compositeSynthetic',
                description: 'Composite with synthetic elements'
            }
        ]
    });
});

/**
 * GET /api/c2pa/verify-url
 * Verify C2PA credentials from a URL
 *
 * Query params:
 * - url: URL of the image to verify
 */
router.get('/verify-url', async (req, res) => {
    try {
        const { url } = req.query;

        if (!url) {
            return res.status(400).json({
                success: false,
                error: 'URL parameter required'
            });
        }

        // Fetch the image
        const fetch = require('node-fetch');
        const response = await fetch(url);

        if (!response.ok) {
            return res.status(400).json({
                success: false,
                error: `Failed to fetch image: ${response.status}`
            });
        }

        const imageBuffer = Buffer.from(await response.arrayBuffer());

        // Verify
        const c2paService = getC2PAService();
        await c2paService.initialize();

        const result = await c2paService.verifyImage(imageBuffer);

        res.json({
            success: true,
            url: url,
            ...result,
            verificationTime: new Date().toISOString()
        });

    } catch (error) {
        console.error('C2PA URL verification error:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

module.exports = router;
