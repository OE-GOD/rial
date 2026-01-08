/**
 * Partner API v1
 * REST API for insurance companies and partners to verify photos programmatically
 *
 * Authentication: API Key in header (X-API-Key)
 * Rate Limit: 1000 requests/hour per API key
 */

const express = require('express');
const router = express.Router();
const multer = require('multer');
const crypto = require('crypto');
const { verifyClientPhoto } = require('../services/photoVerifier');

const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 50 * 1024 * 1024 } // 50MB max
});

// =====================================
// In-Memory Storage (Replace with DB in production)
// =====================================

const apiKeys = new Map();
const apiKeyUsage = new Map();
const verifiedPhotos = new Map();
const webhookQueue = [];

// Default test API key for development
apiKeys.set('test_key_12345', {
    id: 'partner_test',
    name: 'Test Partner',
    email: 'test@example.com',
    tier: 'developer',
    rateLimit: 100,
    webhookUrl: null,
    createdAt: new Date().toISOString(),
    active: true
});

// =====================================
// Middleware: API Key Authentication
// =====================================

function authenticateApiKey(req, res, next) {
    const apiKey = req.headers['x-api-key'] || req.query.api_key;

    if (!apiKey) {
        return res.status(401).json({
            error: 'unauthorized',
            message: 'API key required. Include X-API-Key header.',
            docs: '/api/v1/docs'
        });
    }

    const partner = apiKeys.get(apiKey);

    if (!partner || !partner.active) {
        return res.status(401).json({
            error: 'invalid_api_key',
            message: 'Invalid or inactive API key'
        });
    }

    // Rate limiting
    const hour = Math.floor(Date.now() / 3600000);
    const usageKey = `${apiKey}:${hour}`;
    const currentUsage = apiKeyUsage.get(usageKey) || 0;

    if (currentUsage >= partner.rateLimit) {
        return res.status(429).json({
            error: 'rate_limit_exceeded',
            message: `Rate limit of ${partner.rateLimit} requests/hour exceeded`,
            retryAfter: 3600 - (Date.now() % 3600000) / 1000
        });
    }

    apiKeyUsage.set(usageKey, currentUsage + 1);

    // Attach partner to request
    req.partner = partner;
    req.apiKey = apiKey;

    // Add rate limit headers
    res.set('X-RateLimit-Limit', partner.rateLimit);
    res.set('X-RateLimit-Remaining', partner.rateLimit - currentUsage - 1);
    res.set('X-RateLimit-Reset', Math.ceil(Date.now() / 3600000) * 3600);

    next();
}

// =====================================
// GET /api/v1/docs - API Documentation (no auth required)
// =====================================

router.get('/docs', (req, res) => {
    res.redirect('/api-docs.html');
});

// Apply authentication to all routes below
router.use(authenticateApiKey);

// =====================================
// POST /api/v1/photos - Submit photo for verification
// =====================================

router.post('/photos', upload.single('image'), async (req, res) => {
    const startTime = Date.now();

    try {
        if (!req.file) {
            return res.status(400).json({
                error: 'missing_image',
                message: 'No image file provided. Use multipart/form-data with field name "image"'
            });
        }

        console.log(`[Partner API] Photo submission from ${req.partner.name}`);

        // Parse optional metadata
        let metadata = {};
        let claimData = {};
        let options = {};

        try {
            if (req.body.metadata) metadata = JSON.parse(req.body.metadata);
            if (req.body.claim) claimData = JSON.parse(req.body.claim);
            if (req.body.options) options = JSON.parse(req.body.options);
        } catch (e) {
            return res.status(400).json({
                error: 'invalid_json',
                message: 'metadata, claim, or options contains invalid JSON'
            });
        }

        // Generate unique photo ID
        const photoId = `PH-${Date.now().toString(36)}-${crypto.randomBytes(4).toString('hex')}`;

        // Compute image hash
        const imageHash = crypto.createHash('sha256').update(req.file.buffer).digest('hex');

        // Perform verification
        const verificationResult = await verifyClientPhoto({
            imageData: req.file.buffer,
            c2paClaim: claimData,
            metadata: metadata
        });

        const processingTime = Date.now() - startTime;

        // Store the result
        const photoRecord = {
            id: photoId,
            partnerId: req.partner.id,
            imageHash: imageHash,
            imageSize: req.file.size,
            mimeType: req.file.mimetype,
            verified: verificationResult.overall,
            confidence: verificationResult.confidence,
            checks: verificationResult.checks,
            fraudIndicators: verificationResult.fraudIndicators || [],
            metadata: metadata,
            processingTimeMs: processingTime,
            createdAt: new Date().toISOString()
        };

        verifiedPhotos.set(photoId, photoRecord);

        // Queue webhook if configured
        if (req.partner.webhookUrl) {
            webhookQueue.push({
                url: req.partner.webhookUrl,
                payload: {
                    event: 'photo.verified',
                    data: photoRecord
                },
                partnerId: req.partner.id,
                createdAt: new Date().toISOString()
            });
        }

        // Return response
        res.status(201).json({
            success: true,
            data: {
                photoId: photoId,
                verified: verificationResult.overall,
                confidence: Math.round(verificationResult.confidence * 100) / 100,
                recommendation: getRecommendation(verificationResult.confidence),
                checks: {
                    signature: verificationResult.checks?.signature || false,
                    merkleRoot: verificationResult.checks?.merkleRoot || false,
                    metadata: verificationResult.checks?.metadata || false,
                    temporal: verificationResult.checks?.temporal || false
                },
                fraudRisk: getFraudRisk(verificationResult),
                processingTimeMs: processingTime
            },
            links: {
                self: `/api/v1/photos/${photoId}`,
                verify: `/api/v1/verify/${photoId}`
            }
        });

    } catch (error) {
        console.error('[Partner API] Error:', error);
        res.status(500).json({
            error: 'verification_failed',
            message: 'Photo verification failed',
            details: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
});

// =====================================
// GET /api/v1/photos/:id - Get photo verification details
// =====================================

router.get('/photos/:id', (req, res) => {
    const photo = verifiedPhotos.get(req.params.id);

    if (!photo) {
        return res.status(404).json({
            error: 'not_found',
            message: 'Photo not found'
        });
    }

    // Only allow access to own photos
    if (photo.partnerId !== req.partner.id && req.partner.tier !== 'admin') {
        return res.status(403).json({
            error: 'forbidden',
            message: 'Access denied to this photo'
        });
    }

    res.json({
        success: true,
        data: photo
    });
});

// =====================================
// GET /api/v1/photos - List verified photos
// =====================================

router.get('/photos', (req, res) => {
    const { limit = 20, offset = 0, verified, since } = req.query;

    let photos = Array.from(verifiedPhotos.values())
        .filter(p => p.partnerId === req.partner.id);

    // Filter by verification status
    if (verified !== undefined) {
        const isVerified = verified === 'true';
        photos = photos.filter(p => p.verified === isVerified);
    }

    // Filter by date
    if (since) {
        const sinceDate = new Date(since);
        photos = photos.filter(p => new Date(p.createdAt) >= sinceDate);
    }

    // Sort by newest first
    photos.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

    // Paginate
    const total = photos.length;
    photos = photos.slice(Number(offset), Number(offset) + Number(limit));

    res.json({
        success: true,
        data: photos,
        pagination: {
            total,
            limit: Number(limit),
            offset: Number(offset),
            hasMore: Number(offset) + photos.length < total
        }
    });
});

// =====================================
// POST /api/v1/verify - Quick verification (no storage)
// =====================================

router.post('/verify', upload.single('image'), async (req, res) => {
    const startTime = Date.now();

    try {
        if (!req.file) {
            return res.status(400).json({
                error: 'missing_image',
                message: 'No image file provided'
            });
        }

        // Parse optional data
        let metadata = {};
        let claimData = {};

        try {
            if (req.body.metadata) metadata = JSON.parse(req.body.metadata);
            if (req.body.claim) claimData = JSON.parse(req.body.claim);
        } catch (e) {
            // Ignore parse errors for quick verify
        }

        const imageHash = crypto.createHash('sha256').update(req.file.buffer).digest('hex');

        const verificationResult = await verifyClientPhoto({
            imageData: req.file.buffer,
            c2paClaim: claimData,
            metadata: metadata
        });

        res.json({
            success: true,
            data: {
                verified: verificationResult.overall,
                confidence: Math.round(verificationResult.confidence * 100) / 100,
                recommendation: getRecommendation(verificationResult.confidence),
                imageHash: imageHash,
                fraudRisk: getFraudRisk(verificationResult),
                processingTimeMs: Date.now() - startTime
            }
        });

    } catch (error) {
        res.status(500).json({
            error: 'verification_failed',
            message: error.message
        });
    }
});

// =====================================
// GET /api/v1/verify/:hash - Verify by image hash
// =====================================

router.get('/verify/:hash', (req, res) => {
    const hash = req.params.hash;

    // Find photo by hash
    const photo = Array.from(verifiedPhotos.values())
        .find(p => p.imageHash === hash);

    if (photo) {
        res.json({
            success: true,
            data: {
                exists: true,
                verified: photo.verified,
                confidence: photo.confidence,
                verifiedAt: photo.createdAt,
                photoId: photo.id
            }
        });
    } else {
        res.json({
            success: true,
            data: {
                exists: false,
                message: 'No verification record found for this image'
            }
        });
    }
});

// =====================================
// POST /api/v1/bulk - Bulk verification
// =====================================

router.post('/bulk', upload.array('images', 50), async (req, res) => {
    const startTime = Date.now();

    try {
        if (!req.files || req.files.length === 0) {
            return res.status(400).json({
                error: 'missing_images',
                message: 'No image files provided'
            });
        }

        console.log(`[Partner API] Bulk verification: ${req.files.length} photos from ${req.partner.name}`);

        const results = [];

        for (let i = 0; i < req.files.length; i++) {
            const file = req.files[i];
            const photoId = `PH-${Date.now().toString(36)}-${crypto.randomBytes(4).toString('hex')}`;
            const imageHash = crypto.createHash('sha256').update(file.buffer).digest('hex');

            try {
                const verificationResult = await verifyClientPhoto({
                    imageData: file.buffer,
                    c2paClaim: {},
                    metadata: {}
                });

                const photoRecord = {
                    id: photoId,
                    partnerId: req.partner.id,
                    imageHash: imageHash,
                    verified: verificationResult.overall,
                    confidence: verificationResult.confidence,
                    createdAt: new Date().toISOString()
                };

                verifiedPhotos.set(photoId, photoRecord);

                results.push({
                    index: i,
                    filename: file.originalname,
                    photoId: photoId,
                    verified: verificationResult.overall,
                    confidence: Math.round(verificationResult.confidence * 100) / 100
                });
            } catch (error) {
                results.push({
                    index: i,
                    filename: file.originalname,
                    error: error.message
                });
            }
        }

        const verified = results.filter(r => r.verified).length;
        const failed = results.filter(r => r.error).length;

        res.json({
            success: true,
            data: {
                total: req.files.length,
                verified: verified,
                unverified: req.files.length - verified - failed,
                failed: failed,
                results: results,
                processingTimeMs: Date.now() - startTime
            }
        });

    } catch (error) {
        res.status(500).json({
            error: 'bulk_verification_failed',
            message: error.message
        });
    }
});

// =====================================
// GET /api/v1/stats - Partner statistics
// =====================================

router.get('/stats', (req, res) => {
    const photos = Array.from(verifiedPhotos.values())
        .filter(p => p.partnerId === req.partner.id);

    const verified = photos.filter(p => p.verified).length;
    const avgConfidence = photos.length > 0
        ? photos.reduce((sum, p) => sum + p.confidence, 0) / photos.length
        : 0;

    // Get usage for current hour
    const hour = Math.floor(Date.now() / 3600000);
    const usageKey = `${req.apiKey}:${hour}`;
    const currentUsage = apiKeyUsage.get(usageKey) || 0;

    res.json({
        success: true,
        data: {
            partner: {
                id: req.partner.id,
                name: req.partner.name,
                tier: req.partner.tier
            },
            photos: {
                total: photos.length,
                verified: verified,
                unverified: photos.length - verified,
                averageConfidence: Math.round(avgConfidence * 100) / 100
            },
            usage: {
                currentHour: currentUsage,
                limit: req.partner.rateLimit,
                remaining: req.partner.rateLimit - currentUsage
            }
        }
    });
});

// =====================================
// Webhook Configuration
// =====================================

router.put('/webhook', express.json(), (req, res) => {
    const { url } = req.body;

    if (!url) {
        return res.status(400).json({
            error: 'missing_url',
            message: 'Webhook URL required'
        });
    }

    // Validate URL
    try {
        new URL(url);
    } catch (e) {
        return res.status(400).json({
            error: 'invalid_url',
            message: 'Invalid webhook URL'
        });
    }

    // Update partner webhook
    const partner = apiKeys.get(req.apiKey);
    partner.webhookUrl = url;
    apiKeys.set(req.apiKey, partner);

    res.json({
        success: true,
        message: 'Webhook URL configured',
        webhookUrl: url
    });
});

router.delete('/webhook', (req, res) => {
    const partner = apiKeys.get(req.apiKey);
    partner.webhookUrl = null;
    apiKeys.set(req.apiKey, partner);

    res.json({
        success: true,
        message: 'Webhook removed'
    });
});

// =====================================
// Helper Functions
// =====================================

function getRecommendation(confidence) {
    if (confidence >= 0.9) return 'APPROVE';
    if (confidence >= 0.7) return 'APPROVE_WITH_REVIEW';
    if (confidence >= 0.5) return 'MANUAL_REVIEW';
    return 'REJECT';
}

function getFraudRisk(result) {
    const indicators = result.fraudIndicators || [];
    if (indicators.length === 0 && result.confidence >= 0.9) return 'LOW';
    if (indicators.length <= 1 && result.confidence >= 0.7) return 'MEDIUM';
    return 'HIGH';
}

// =====================================
// API Key Management (Admin only)
// =====================================

router.post('/keys', express.json(), (req, res) => {
    if (req.partner.tier !== 'admin') {
        return res.status(403).json({
            error: 'forbidden',
            message: 'Admin access required'
        });
    }

    const { name, email, tier = 'standard' } = req.body;

    if (!name || !email) {
        return res.status(400).json({
            error: 'missing_fields',
            message: 'name and email required'
        });
    }

    const newKey = `rp_${tier}_${crypto.randomBytes(16).toString('hex')}`;
    const partnerId = `partner_${crypto.randomBytes(8).toString('hex')}`;

    const rateLimits = {
        developer: 100,
        standard: 1000,
        enterprise: 10000,
        admin: 100000
    };

    apiKeys.set(newKey, {
        id: partnerId,
        name,
        email,
        tier,
        rateLimit: rateLimits[tier] || 1000,
        webhookUrl: null,
        createdAt: new Date().toISOString(),
        active: true
    });

    res.status(201).json({
        success: true,
        data: {
            apiKey: newKey,
            partnerId,
            name,
            tier,
            rateLimit: rateLimits[tier]
        }
    });
});

module.exports = router;

// Export for testing
module.exports.apiKeys = apiKeys;
module.exports.verifiedPhotos = verifiedPhotos;
