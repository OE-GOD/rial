/**
 * Zero-Knowledge Authentication API
 */

const express = require('express');
const router = express.Router();
const ZKAuthManager = require('../services/zkAuth');

const zkAuth = new ZKAuthManager();

/**
 * POST /api/zk-auth/register
 * Register user with ZK commitment
 */
router.post('/register', express.json(), async (req, res) => {
    try {
        const { username, commitment, publicData } = req.body;
        
        if (!username || !commitment) {
            return res.status(400).json({
                error: 'Username and commitment required'
            });
        }
        
        console.log('📝 ZK Registration request');
        console.log(`   Username: ${username}`);
        console.log(`   Commitment: ${commitment.substring(0, 32)}...`);
        
        const result = await zkAuth.registerUser(username, commitment, publicData);
        
        res.json({
            success: true,
            userId: result.userId,
            username: result.username,
            message: 'User registered with zero-knowledge proof'
        });
        
    } catch (error) {
        console.error('❌ Registration error:', error.message);
        res.status(400).json({
            error: error.message
        });
    }
});

/**
 * POST /api/zk-auth/challenge
 * Get authentication challenge
 */
router.post('/challenge', express.json(), async (req, res) => {
    try {
        const { username } = req.body;
        
        if (!username) {
            return res.status(400).json({
                error: 'Username required'
            });
        }
        
        console.log('🔐 Challenge request for:', username);
        
        const challengeData = zkAuth.generateChallenge(username);
        
        res.json({
            success: true,
            challenge: challengeData.challenge,
            // Don't send commitment in production (security)
            // Client should have it cached
        });
        
    } catch (error) {
        console.error('❌ Challenge error:', error.message);
        res.status(404).json({
            error: error.message
        });
    }
});

/**
 * POST /api/zk-auth/verify
 * Verify ZK proof and authenticate
 */
router.post('/verify', express.json(), async (req, res) => {
    try {
        const { challenge, proof, response } = req.body;
        
        if (!challenge || !proof || !response) {
            return res.status(400).json({
                error: 'Challenge, proof, and response required'
            });
        }
        
        console.log('🔍 Verifying ZK proof...');
        console.log(`   Challenge: ${challenge.substring(0, 32)}...`);
        
        const result = await zkAuth.verifyZKProof(challenge, proof, response);
        
        console.log(`✅ ZK authentication successful`);
        console.log(`   User: ${result.username}`);
        console.log(`   Session: ${result.sessionToken.substring(0, 32)}...`);
        
        res.json(result);
        
    } catch (error) {
        console.error('❌ Verification error:', error.message);
        res.status(401).json({
            error: error.message,
            code: 'ZK_PROOF_INVALID'
        });
    }
});

/**
 * POST /api/zk-auth/logout
 * Logout and invalidate session
 */
router.post('/logout', express.json(), async (req, res) => {
    const { sessionToken } = req.body;
    
    console.log('👋 Logout request');
    
    // In production: Remove session from Redis/PostgreSQL
    
    res.json({
        success: true,
        message: 'Logged out successfully'
    });
});

/**
 * GET /api/zk-auth/me
 * Get current user info
 */
router.get('/me', (req, res) => {
    const sessionToken = req.headers.authorization?.replace('Bearer ', '');
    
    if (!sessionToken) {
        return res.status(401).json({
            error: 'No session token'
        });
    }
    
    const user = zkAuth.getUserBySession(sessionToken);
    
    res.json({
        userId: user.userId,
        username: user.username,
        role: user.role
    });
});

module.exports = router;

