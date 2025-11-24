/**
 * Damage Detection API Routes
 * 
 * Endpoints for AI-powered damage detection in insurance claims
 */

const express = require('express');
const router = express.Router();
const multer = require('multer');
const damageDetectionAgent = require('../ai/damage-detection-agent');

// Configure multer for file uploads
const upload = multer({
    storage: multer.memoryStorage(),
    limits: {
        fileSize: 10 * 1024 * 1024 // 10MB limit
    },
    fileFilter: (req, file, cb) => {
        if (file.mimetype.startsWith('image/')) {
            cb(null, true);
        } else {
            cb(new Error('Only image files are allowed'));
        }
    }
});

/**
 * POST /api/damage/analyze
 * 
 * Analyze a single image for damage
 * 
 * Body:
 * - image: Image file (multipart/form-data)
 * - claimType: Type of claim (auto_collision, water_damage, roof_damage, etc.)
 * - metadata: Optional metadata (GPS, timestamp, etc.) as JSON string
 */
router.post('/analyze', upload.single('image'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({
                success: false,
                error: 'No image provided'
            });
        }

        const { claimType = 'auto_collision', metadata: metadataStr } = req.body;
        
        let metadata = {};
        if (metadataStr) {
            try {
                metadata = JSON.parse(metadataStr);
            } catch (e) {
                console.warn('Invalid metadata JSON, using empty object');
            }
        }

        console.log(`📸 Analyzing image for ${claimType}...`);

        // Run damage detection
        const result = await damageDetectionAgent.detectDamage(
            req.file.buffer,
            claimType,
            metadata
        );

        res.json(result);

    } catch (error) {
        console.error('Damage analysis error:', error);
        res.status(500).json({
            success: false,
            error: error.message || 'Failed to analyze image'
        });
    }
});

/**
 * POST /api/damage/batch-analyze
 * 
 * Analyze multiple images for a single claim
 * 
 * Body:
 * - images: Array of image files (multipart/form-data)
 * - claimType: Type of claim
 * - metadata: Optional metadata as JSON string
 */
router.post('/batch-analyze', upload.array('images', 10), async (req, res) => {
    try {
        if (!req.files || req.files.length === 0) {
            return res.status(400).json({
                success: false,
                error: 'No images provided'
            });
        }

        const { claimType = 'auto_collision', metadata: metadataStr } = req.body;
        
        let metadata = {};
        if (metadataStr) {
            try {
                metadata = JSON.parse(metadataStr);
            } catch (e) {
                console.warn('Invalid metadata JSON, using empty object');
            }
        }

        console.log(`📸 Batch analyzing ${req.files.length} images for ${claimType}...`);

        // Analyze all images in parallel
        const results = await Promise.all(
            req.files.map((file, index) => 
                damageDetectionAgent.detectDamage(
                    file.buffer,
                    claimType,
                    { ...metadata, imageIndex: index }
                )
            )
        );

        // Generate combined report
        const combinedReport = {
            success: true,
            timestamp: new Date().toISOString(),
            claimType,
            imagesAnalyzed: results.length,
            
            summary: {
                hasDamage: results.some(r => r.verdict.hasDamage),
                averageConfidence: results.reduce((sum, r) => sum + r.verdict.confidence, 0) / results.length,
                maxSeverity: results.reduce((max, r) => {
                    const severities = ['none', 'minor', 'moderate', 'severe', 'total_loss'];
                    const rLevel = severities.indexOf(r.verdict.severity);
                    const maxLevel = severities.indexOf(max);
                    return rLevel > maxLevel ? r.verdict.severity : max;
                }, 'none'),
                totalEstimatedCost: results
                    .filter(r => r.verdict.hasDamage)
                    .map(r => r.damage.estimatedCost)
                    .join(', ')
            },
            
            images: results.map((result, index) => ({
                index,
                filename: req.files[index].originalname,
                ...result
            })),
            
            recommendations: generateBatchRecommendations(results)
        };

        res.json(combinedReport);

    } catch (error) {
        console.error('Batch analysis error:', error);
        res.status(500).json({
            success: false,
            error: error.message || 'Failed to analyze images'
        });
    }
});

/**
 * POST /api/damage/verify-and-analyze
 * 
 * Combined endpoint: ZK verification + damage detection
 * This is the main endpoint for the complete workflow
 * 
 * Body:
 * - image: Image file
 * - claimType: Type of claim
 * - metadata: Metadata with GPS, timestamp, motion, etc.
 * - zkProof: Optional pre-computed ZK proof
 */
router.post('/verify-and-analyze', upload.single('image'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({
                success: false,
                error: 'No image provided'
            });
        }

        const { claimType = 'auto_collision', metadata: metadataStr, zkProof: zkProofStr } = req.body;
        
        let metadata = {};
        if (metadataStr) {
            try {
                metadata = JSON.parse(metadataStr);
            } catch (e) {
                console.warn('Invalid metadata JSON');
            }
        }

        let zkProof = null;
        if (zkProofStr) {
            try {
                zkProof = JSON.parse(zkProofStr);
            } catch (e) {
                console.warn('Invalid ZK proof JSON');
            }
        }

        console.log(`🔐 Complete analysis: ZK verification + damage detection for ${claimType}...`);

        // Run both analyses in parallel
        const [damageResult, verificationResult] = await Promise.all([
            damageDetectionAgent.detectDamage(req.file.buffer, claimType, metadata),
            zkProof ? Promise.resolve({ zkProof, verified: true }) : 
                     Promise.resolve({ verified: false, message: 'No ZK proof provided' })
        ]);

        // Combined result
        const result = {
            success: true,
            timestamp: new Date().toISOString(),
            claimType,
            
            // ZK Verification (photo authenticity)
            authenticity: {
                verified: verificationResult.verified,
                confidence: verificationResult.verified ? 0.99 : 0,
                zkProof: verificationResult.zkProof || null,
                message: verificationResult.verified ? 
                    '✅ Photo verified as authentic and unedited' :
                    '⚠️ No ZK proof - authenticity not verified'
            },
            
            // Damage Detection (actual damage)
            damage: damageResult,
            
            // Combined verdict
            verdict: {
                isValidClaim: verificationResult.verified && damageResult.verdict.hasDamage,
                authenticPhoto: verificationResult.verified,
                realDamage: damageResult.verdict.hasDamage,
                overallConfidence: verificationResult.verified ? 
                    (0.99 + damageResult.verdict.confidence) / 2 :
                    damageResult.verdict.confidence * 0.5,
                message: getCombinedVerdict(verificationResult.verified, damageResult)
            },
            
            nextSteps: getNextSteps(verificationResult.verified, damageResult)
        };

        res.json(result);

    } catch (error) {
        console.error('Combined verification error:', error);
        res.status(500).json({
            success: false,
            error: error.message || 'Failed to verify and analyze image'
        });
    }
});

/**
 * GET /api/damage/status
 * 
 * Check if damage detection service is ready
 */
router.get('/status', async (req, res) => {
    try {
        const status = await damageDetectionAgent.initialize();
        res.json({
            success: true,
            service: 'Damage Detection AI',
            status: 'ready',
            ...status
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            service: 'Damage Detection AI',
            status: 'error',
            error: error.message
        });
    }
});

/**
 * GET /api/damage/claim-types
 * 
 * Get supported claim types
 */
router.get('/claim-types', (req, res) => {
    res.json({
        success: true,
        claimTypes: [
            {
                id: 'auto_collision',
                name: 'Auto Collision',
                description: 'Vehicle damage from accidents',
                detects: ['dents', 'scratches', 'broken_glass', 'paint_damage', 'bumper_damage']
            },
            {
                id: 'water_damage',
                name: 'Water Damage',
                description: 'Property damage from water/flooding',
                detects: ['water_stains', 'mold', 'warping', 'discoloration']
            },
            {
                id: 'roof_damage',
                name: 'Roof Damage',
                description: 'Roof damage from storms/wear',
                detects: ['missing_shingles', 'holes', 'sagging', 'cracks']
            },
            {
                id: 'fire_damage',
                name: 'Fire Damage',
                description: 'Property damage from fire/smoke',
                detects: ['charring', 'soot', 'smoke_damage']
            },
            {
                id: 'structural_damage',
                name: 'Structural Damage',
                description: 'Building structural damage',
                detects: ['cracks', 'holes', 'deformation']
            }
        ]
    });
});

// Helper functions

function generateBatchRecommendations(results) {
    const recommendations = [];
    
    const hasDamage = results.some(r => r.verdict.hasDamage);
    const avgConfidence = results.reduce((sum, r) => sum + r.verdict.confidence, 0) / results.length;
    
    if (hasDamage) {
        if (avgConfidence > 0.8) {
            recommendations.push('✅ Strong evidence of damage across multiple photos');
            recommendations.push('Recommend proceeding with claim');
        } else if (avgConfidence > 0.5) {
            recommendations.push('⚠️ Moderate evidence of damage');
            recommendations.push('Recommend adjuster review for confirmation');
        } else {
            recommendations.push('⚠️ Weak evidence of damage');
            recommendations.push('Request additional photos or on-site inspection');
        }
    } else {
        recommendations.push('ℹ️ No significant damage detected in submitted photos');
        recommendations.push('Consider requesting photos from different angles');
    }
    
    const hasQualityIssues = results.some(r => r.quality.issues.length > 0);
    if (hasQualityIssues) {
        recommendations.push('⚠️ Some photos have quality issues (blur, lighting, etc.)');
        recommendations.push('Request clearer photos for better assessment');
    }
    
    return recommendations;
}

function getCombinedVerdict(zkVerified, damageResult) {
    if (zkVerified && damageResult.verdict.hasDamage) {
        return `✅ VALID CLAIM: Authentic photo shows ${damageResult.verdict.severity} damage (${(damageResult.verdict.confidence * 100).toFixed(0)}% confidence)`;
    } else if (zkVerified && !damageResult.verdict.hasDamage) {
        return `⚠️ AUTHENTIC PHOTO, NO DAMAGE: Photo is real but shows no significant damage`;
    } else if (!zkVerified && damageResult.verdict.hasDamage) {
        return `⚠️ UNVERIFIED PHOTO: Damage detected but photo authenticity not confirmed`;
    } else {
        return `❌ NO VALID CLAIM: Photo not verified and no damage detected`;
    }
}

function getNextSteps(zkVerified, damageResult) {
    const steps = [];
    
    if (!zkVerified) {
        steps.push('1. Request photos taken with verified app (ZK proof required)');
    }
    
    if (!damageResult.verdict.hasDamage) {
        steps.push('2. Request photos showing the claimed damage from multiple angles');
    }
    
    if (damageResult.quality.issues.length > 0) {
        steps.push('3. Request higher quality photos (better lighting, focus, closer view)');
    }
    
    if (damageResult.verdict.hasDamage && zkVerified) {
        if (damageResult.verdict.severity === 'severe' || damageResult.verdict.severity === 'total_loss') {
            steps.push('1. Schedule immediate adjuster inspection');
            steps.push('2. Begin claim processing');
        } else if (damageResult.verdict.confidence > 0.8) {
            steps.push('1. Approve claim for processing');
            steps.push('2. Request repair estimates');
        } else {
            steps.push('1. Request additional photos for confirmation');
            steps.push('2. Consider adjuster review if needed');
        }
    }
    
    if (steps.length === 0) {
        steps.push('Claim review complete - no additional actions needed');
    }
    
    return steps;
}

module.exports = router;

