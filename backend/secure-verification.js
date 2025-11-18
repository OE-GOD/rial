/**
 * Secure Image Verification with Ownership Proof
 * 
 * This prevents replay attacks by requiring cryptographic proof of ownership
 */

const crypto = require('crypto');
const EC = require('elliptic').ec;
const ec = new EC('p256');
const { verifyProof } = require('./zk/groth16');

/**
 * Secure verification that requires:
 * 1. The image matches the merkle root
 * 2. The verifier owns the private key that created it
 * 3. Fresh challenge-response to prevent replay
 */
async function secureVerifyImage(req, res) {
    try {
        const {
            merkleRoot,
            publicKeyBase64,
            challenge,         // Fresh random challenge from verifier
            challengeSignature // Signature of challenge with private key
        } = req.body;
        
        const imageBuffer = req.file?.buffer;
        
        if (!imageBuffer || !merkleRoot || !publicKeyBase64 || !challenge || !challengeSignature) {
            return res.status(400).json({ 
                error: 'Missing required fields',
                required: ['image', 'merkleRoot', 'publicKey', 'challenge', 'challengeSignature']
            });
        }
        
        console.log('\n🔐 SECURE VERIFICATION REQUEST');
        console.log(`   Merkle Root: ${merkleRoot.substring(0, 40)}...`);
        console.log(`   Challenge: ${challenge}`);
        
        // Step 1: Verify image matches merkle root
        const imageVerification = verifyImageIntegrity(merkleRoot, imageBuffer);
        if (!imageVerification.matches) {
            return res.json({
                verified: false,
                step: 'image_verification',
                error: 'Image does not match merkle root',
                details: imageVerification
            });
        }
        
        // Step 2: Verify the public key matches the attestation
        const attestationCheck = await verifyAttestationOwnership(merkleRoot, publicKeyBase64);
        if (!attestationCheck.valid) {
            return res.json({
                verified: false,
                step: 'ownership_verification', 
                error: 'Public key does not match attestation',
                details: attestationCheck
            });
        }
        
        // Step 3: Verify challenge signature (proves current possession of private key)
        const challengeVerification = verifyChallengeSignature(
            challenge,
            challengeSignature,
            publicKeyBase64
        );
        
        if (!challengeVerification.valid) {
            return res.json({
                verified: false,
                step: 'challenge_verification',
                error: 'Invalid challenge signature - cannot prove key ownership',
                details: challengeVerification
            });
        }
        
        // Step 4: Check challenge freshness (prevent replay attacks)
        const challengeFreshness = checkChallengeFreshness(challenge);
        if (!challengeFreshness.fresh) {
            return res.json({
                verified: false,
                step: 'freshness_check',
                error: 'Challenge is stale or reused',
                details: challengeFreshness
            });
        }

        // Step 5: Verify zero-knowledge proofs (optional but recommended)
        let zkVerification = { checked: false, count: 0 };
        const providedProofsRaw = req.body.zkProofs;
        let providedProofs = [];

        if (providedProofsRaw) {
            try {
                providedProofs = typeof providedProofsRaw === 'string'
                    ? JSON.parse(providedProofsRaw)
                    : providedProofsRaw;
            } catch (error) {
                return res.json({
                    verified: false,
                    step: 'zk_verification',
                    error: 'Failed to parse zkProofs payload',
                    details: { parsingError: error.message }
                });
            }
        }

        if (Array.isArray(providedProofs) && providedProofs.length > 0) {
            zkVerification.checked = true;
            zkVerification.count = providedProofs.length;
            zkVerification.results = [];

            for (let i = 0; i < providedProofs.length; i++) {
                const proofData = providedProofs[i];
                if (!proofData || !proofData.circuit || !proofData.params || !proofData.proof || !proofData.publicSignals) {
                    return res.json({
                        verified: false,
                        step: 'zk_verification',
                        error: 'Incomplete proof payload',
                        details: { index: i }
                    });
                }

                try {
                    const result = await verifyProof(
                        proofData.circuit,
                        proofData.params,
                        proofData.proof,
                        proofData.publicSignals
                    );

                    zkVerification.results.push({
                        circuit: proofData.circuit,
                        params: proofData.params,
                        valid: result.valid
                    });

                    if (!result.valid) {
                        return res.json({
                            verified: false,
                            step: 'zk_verification',
                            error: 'Zero-knowledge proof invalid',
                            details: {
                                circuit: proofData.circuit,
                                params: proofData.params
                            }
                        });
                    }
                } catch (error) {
                    return res.json({
                        verified: false,
                        step: 'zk_verification',
                        error: 'Error verifying zero-knowledge proof',
                        details: {
                            circuit: proofData.circuit,
                            params: proofData.params,
                            message: error.message
                        }
                    });
                }
            }
        }
        
        // All checks passed!
        console.log('✅ SECURE VERIFICATION COMPLETE');
        console.log('   - Image matches merkle root ✓');
        console.log('   - Public key matches attestation ✓');
        console.log('   - Challenge signature valid ✓');
        console.log('   - Challenge is fresh ✓');
        
        res.json({
            verified: true,
            secure: true,
            timestamp: new Date().toISOString(),
            verificationSteps: {
                imageIntegrity: true,
                ownershipProof: true,
                challengeResponse: true,
                replayProtection: true,
                zkProofs: zkVerification.checked ? 'verified' : 'not_provided'
            },
            zkProofsVerified: zkVerification,
            message: '✅ Cryptographically verified: You own this certified image!'
        });
        
    } catch (error) {
        console.error('Secure verification error:', error);
        res.status(500).json({ error: error.message });
    }
}

/**
 * Verify image matches what was certified
 */
function verifyImageIntegrity(merkleRoot, imageBuffer) {
    const imageStore = require('./simple-image-store');
    const result = imageStore.verifyImage(merkleRoot, imageBuffer);
    return {
        matches: result.matches,
        storedHash: result.storedHash,
        uploadedHash: result.uploadedHash
    };
}

/**
 * Verify the public key matches the blockchain attestation
 */
async function verifyAttestationOwnership(merkleRoot, publicKeyBase64) {
    // In production: Query blockchain for attestation record
    // For now: Check our pending/submitted attestations
    const blockchainService = require('./blockchain-service');
    const pending = blockchainService.getPendingBatch();
    
    // Look for attestation with this merkle root
    const attestation = pending.find(a => 
        a.c2paClaim?.imageRoot === merkleRoot
    );
    
    if (!attestation) {
        return { valid: false, reason: 'No attestation found for this merkle root' };
    }
    
    // Check if public key matches
    const attestationPublicKey = attestation.c2paClaim?.publicKey;
    if (attestationPublicKey !== publicKeyBase64) {
        return { valid: false, reason: 'Public key mismatch' };
    }
    
    return { valid: true };
}

/**
 * Verify the challenge signature to prove key ownership
 */
function verifyChallengeSignature(challenge, signatureBase64, publicKeyBase64) {
    try {
        // Decode inputs
        const publicKeyBuffer = Buffer.from(publicKeyBase64, 'base64');
        const signatureBuffer = Buffer.from(signatureBase64, 'base64');
        
        // Import public key
        const key = ec.keyFromPublic(publicKeyBuffer);
        
        // Hash the challenge
        const challengeHash = crypto.createHash('sha256').update(challenge).digest();
        
        // Verify signature
        const signatureDER = signatureBuffer;
        const isValid = key.verify(challengeHash, signatureDER);
        
        return { 
            valid: isValid,
            challengeHash: challengeHash.toString('hex').substring(0, 20) + '...'
        };
        
    } catch (error) {
        console.error('Challenge verification error:', error);
        return { valid: false, error: error.message };
    }
}

/**
 * Check challenge freshness (prevent replay attacks)
 */
const usedChallenges = new Set();
const CHALLENGE_EXPIRY = 5 * 60 * 1000; // 5 minutes

function checkChallengeFreshness(challenge) {
    // Check if already used
    if (usedChallenges.has(challenge)) {
        return { fresh: false, reason: 'Challenge already used' };
    }
    
    // Check timestamp (if challenge includes timestamp)
    try {
        const parts = challenge.split(':');
        if (parts.length === 2) {
            const timestamp = parseInt(parts[1]);
            const age = Date.now() - timestamp;
            
            if (age > CHALLENGE_EXPIRY) {
                return { fresh: false, reason: 'Challenge expired', age: age };
            }
        }
    } catch (e) {
        // Invalid format
    }
    
    // Mark as used
    usedChallenges.add(challenge);
    
    // Clean old challenges periodically
    if (usedChallenges.size > 1000) {
        usedChallenges.clear();
    }
    
    return { fresh: true };
}

/**
 * Generate verification challenge endpoint
 */
function generateChallenge(req, res) {
    const random = crypto.randomBytes(32).toString('hex');
    const timestamp = Date.now();
    const challenge = `${random}:${timestamp}`;
    
    res.json({
        challenge: challenge,
        expiresIn: CHALLENGE_EXPIRY / 1000, // seconds
        instructions: 'Sign this challenge with your private key'
    });
}

module.exports = {
    secureVerifyImage,
    generateChallenge
};


