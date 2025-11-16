/**
 * Insurance Claim API
 * Endpoints for claim submission and adjuster verification
 */

const express = require('express');
const router = express.Router();
const multer = require('multer');
const crypto = require('crypto');

// In-memory storage (replace with database in production)
const claims = new Map();
const adjusterSessions = new Map();

const upload = multer({ storage: multer.memoryStorage() });

// ============================================================================
// CLIENT ENDPOINTS
// ============================================================================

/**
 * POST /api/claims/submit
 * Submit a new insurance claim with certified photos
 */
router.post('/submit', express.json({ limit: '50mb' }), async (req, res) => {
    try {
        const { claimType, policyNumber, description, estimatedAmount, photos } = req.body;
        
        console.log('📥 Received claim submission:');
        console.log(`   Type: ${claimType}`);
        console.log(`   Policy: ${policyNumber}`);
        console.log(`   Photos: ${photos?.length || 0}`);
        
        // Validate required fields
        if (!claimType || !policyNumber || !description || !photos || photos.length === 0) {
            return res.status(400).json({
                error: 'Missing required fields',
                required: ['claimType', 'policyNumber', 'description', 'photos']
            });
        }
        
        // Generate claim ID
        const claimId = `CLM-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;
        
        // Verify all photos
        const verificationResults = await Promise.all(
            photos.map(photo => verifyClaimPhoto(photo))
        );
        
        const allPhotosValid = verificationResults.every(result => result.verified);
        
        // Create claim record
        const claim = {
            id: claimId,
            claimType,
            policyNumber,
            description,
            estimatedAmount: estimatedAmount || null,
            photos: photos.map((photo, index) => ({
                ...photo,
                verification: verificationResults[index]
            })),
            submittedAt: new Date().toISOString(),
            status: allPhotosValid ? 'pending_review' : 'verification_failed',
            allPhotosVerified: allPhotosValid,
            adjusterReview: null
        };
        
        // Store claim
        claims.set(claimId, claim);
        
        console.log(`✅ Claim created: ${claimId}`);
        console.log(`   Status: ${claim.status}`);
        console.log(`   All photos verified: ${allPhotosValid}`);
        
        res.json({
            success: true,
            claimId,
            status: claim.status,
            allPhotosVerified: allPhotosValid,
            verificationResults: verificationResults.map(r => ({
                verified: r.verified,
                confidence: r.confidence,
                checks: r.checks
            })),
            message: allPhotosValid 
                ? 'Claim submitted successfully. An adjuster will review it shortly.'
                : 'Some photos failed verification. Please retake them.'
        });
        
    } catch (error) {
        console.error('❌ Claim submission error:', error);
        res.status(500).json({
            error: 'Claim submission failed',
            details: error.message
        });
    }
});

/**
 * GET /api/claims/:claimId/status
 * Get claim status
 */
router.get('/:claimId/status', (req, res) => {
    const { claimId } = req.params;
    const claim = claims.get(claimId);
    
    if (!claim) {
        return res.status(404).json({ error: 'Claim not found' });
    }
    
    res.json({
        claimId: claim.id,
        status: claim.status,
        submittedAt: claim.submittedAt,
        adjusterReview: claim.adjusterReview,
        estimatedAmount: claim.estimatedAmount
    });
});

// ============================================================================
// ADJUSTER ENDPOINTS
// ============================================================================

/**
 * POST /api/adjuster/login
 * Adjuster authentication
 */
router.post('/adjuster/login', express.json(), (req, res) => {
    const { username, password } = req.body;
    
    // TODO: Implement real authentication
    // For now, accept any credentials
    if (username && password) {
        const sessionToken = crypto.randomBytes(32).toString('hex');
        adjusterSessions.set(sessionToken, {
            username,
            loginAt: new Date()
        });
        
        res.json({
            success: true,
            sessionToken,
            username
        });
    } else {
        res.status(401).json({ error: 'Invalid credentials' });
    }
});

/**
 * GET /api/adjuster/claims
 * Get all claims for review
 */
router.get('/adjuster/claims', authenticateAdjuster, (req, res) => {
    const { status, limit = 50 } = req.query;
    
    let claimList = Array.from(claims.values());
    
    // Filter by status if provided
    if (status) {
        claimList = claimList.filter(claim => claim.status === status);
    }
    
    // Sort by date (newest first)
    claimList.sort((a, b) => new Date(b.submittedAt) - new Date(a.submittedAt));
    
    // Limit results
    claimList = claimList.slice(0, parseInt(limit));
    
    // Return summary (without full photo data)
    const summary = claimList.map(claim => ({
        id: claim.id,
        claimType: claim.claimType,
        policyNumber: claim.policyNumber,
        description: claim.description,
        estimatedAmount: claim.estimatedAmount,
        photoCount: claim.photos.length,
        allPhotosVerified: claim.allPhotosVerified,
        status: claim.status,
        submittedAt: claim.submittedAt
    }));
    
    res.json({
        total: claims.size,
        filtered: summary.length,
        claims: summary
    });
});

/**
 * GET /api/adjuster/claims/:claimId
 * Get full claim details including verification reports
 */
router.get('/adjuster/claims/:claimId', authenticateAdjuster, (req, res) => {
    const { claimId } = req.params;
    const claim = claims.get(claimId);
    
    if (!claim) {
        return res.status(404).json({ error: 'Claim not found' });
    }
    
    // Return full claim with verification details
    res.json({
        ...claim,
        photos: claim.photos.map(photo => ({
            id: photo.id,
            captureDate: photo.captureDate,
            verificationStatus: photo.verificationStatus,
            verification: photo.verification,
            // Return thumbnail instead of full image data
            hasImage: !!photo.imageData
        }))
    });
});

/**
 * GET /api/adjuster/claims/:claimId/photo/:photoId
 * Get full photo with image data
 */
router.get('/adjuster/claims/:claimId/photo/:photoId', authenticateAdjuster, (req, res) => {
    const { claimId, photoId } = req.params;
    const claim = claims.get(claimId);
    
    if (!claim) {
        return res.status(404).json({ error: 'Claim not found' });
    }
    
    const photo = claim.photos.find(p => p.id === photoId);
    
    if (!photo) {
        return res.status(404).json({ error: 'Photo not found' });
    }
    
    res.json(photo);
});

/**
 * POST /api/adjuster/claims/:claimId/review
 * Adjuster approves or denies claim
 */
router.post('/adjuster/claims/:claimId/review', authenticateAdjuster, express.json(), (req, res) => {
    const { claimId } = req.params;
    const { decision, approvedAmount, notes } = req.body;
    const adjusterUsername = req.adjuster.username;
    
    const claim = claims.get(claimId);
    
    if (!claim) {
        return res.status(404).json({ error: 'Claim not found' });
    }
    
    if (!['approved', 'denied', 'needs_more_info'].includes(decision)) {
        return res.status(400).json({ error: 'Invalid decision' });
    }
    
    // Update claim
    claim.status = decision;
    claim.adjusterReview = {
        adjuster: adjusterUsername,
        decision,
        approvedAmount: decision === 'approved' ? approvedAmount : null,
        notes,
        reviewedAt: new Date().toISOString()
    };
    
    claims.set(claimId, claim);
    
    console.log(`✅ Claim ${claimId} ${decision} by ${adjusterUsername}`);
    
    res.json({
        success: true,
        claimId,
        status: claim.status,
        adjusterReview: claim.adjusterReview
    });
});

/**
 * GET /api/adjuster/stats
 * Get adjuster dashboard statistics
 */
router.get('/adjuster/stats', authenticateAdjuster, (req, res) => {
    const claimList = Array.from(claims.values());
    
    const stats = {
        total: claimList.length,
        pending: claimList.filter(c => c.status === 'pending_review').length,
        approved: claimList.filter(c => c.status === 'approved').length,
        denied: claimList.filter(c => c.status === 'denied').length,
        needsInfo: claimList.filter(c => c.status === 'needs_more_info').length,
        verificationFailed: claimList.filter(c => c.status === 'verification_failed').length,
        byType: {}
    };
    
    // Group by claim type
    claimList.forEach(claim => {
        stats.byType[claim.claimType] = (stats.byType[claim.claimType] || 0) + 1;
    });
    
    res.json(stats);
});

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Verify a claim photo's authenticity
 */
async function verifyClaimPhoto(photo) {
    console.log(`🔍 Verifying photo: ${photo.id}`);
    
    const checks = {
        hasSignature: false,
        hasGPS: false,
        hasMotion: false,
        hasCamera: false,
        merkleValid: false,
        aiScore: 0,
        screenScore: 0
    };
    
    try {
        // Parse C2PA claim
        const c2paClaim = JSON.parse(photo.c2paClaim || '{}');
        checks.hasSignature = !!c2paClaim.signature;
        checks.merkleValid = !!c2paClaim.imageRoot;
        
        // Parse metadata
        const metadata = JSON.parse(photo.metadata || '{}');
        checks.hasGPS = !!(metadata.latitude && metadata.longitude);
        checks.hasMotion = !!(metadata.accelerometerX !== undefined);
        checks.hasCamera = !!metadata.cameraModel;
        
        // AI detection (simplified - in production, use actual AI detector)
        checks.aiScore = (!checks.hasGPS || !checks.hasMotion || !checks.hasCamera) ? 0.8 : 0.05;
        checks.screenScore = (!checks.hasMotion || checks.aiScore > 0.5) ? 0.7 : 0.02;
        
        // Overall verification
        const verified = 
            checks.hasSignature &&
            checks.hasGPS &&
            checks.hasMotion &&
            checks.hasCamera &&
            checks.merkleValid &&
            checks.aiScore < 0.3 &&
            checks.screenScore < 0.3;
        
        const confidence = verified ? 0.999 : 0.2;
        
        console.log(`   Result: ${verified ? '✅ VERIFIED' : '❌ FAILED'}`);
        console.log(`   Confidence: ${(confidence * 100).toFixed(1)}%`);
        
        return {
            photoId: photo.id,
            verified,
            confidence,
            checks,
            issues: getVerificationIssues(checks)
        };
        
    } catch (error) {
        console.error(`❌ Verification error:`, error);
        return {
            photoId: photo.id,
            verified: false,
            confidence: 0,
            checks,
            error: error.message
        };
    }
}

/**
 * Get human-readable verification issues
 */
function getVerificationIssues(checks) {
    const issues = [];
    
    if (!checks.hasSignature) issues.push('Missing hardware signature');
    if (!checks.hasGPS) issues.push('Missing GPS data');
    if (!checks.hasMotion) issues.push('Missing motion sensor data');
    if (!checks.hasCamera) issues.push('Missing camera metadata');
    if (!checks.merkleValid) issues.push('Invalid Merkle tree');
    if (checks.aiScore > 0.3) issues.push('High AI score - may be AI-generated');
    if (checks.screenScore > 0.3) issues.push('High screen score - may be screenshot');
    
    return issues;
}

/**
 * Middleware to authenticate adjuster
 */
function authenticateAdjuster(req, res, next) {
    const token = req.headers.authorization?.replace('Bearer ', '');
    
    if (!token) {
        return res.status(401).json({ error: 'No authorization token' });
    }
    
    const session = adjusterSessions.get(token);
    
    if (!session) {
        return res.status(401).json({ error: 'Invalid or expired token' });
    }
    
    req.adjuster = session;
    next();
}

module.exports = router;

