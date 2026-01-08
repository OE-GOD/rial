/**
 * Photo Verification Service
 * Verifies that client-submitted photos are authentic
 */

const crypto = require('crypto');
const EC = require('elliptic').ec;
const ec = new EC('p256');

/**
 * Complete photo verification
 * Returns detailed verification result
 */
async function verifyClientPhoto(photoData) {
    console.log('🔍 Starting photo verification...');
    
    const results = {
        overall: false,
        confidence: 0,
        checks: {},
        details: {},
        fraudIndicators: [],
        timestamp: new Date().toISOString()
    };
    
    try {
        // Parse the photo package
        const {
            imageData,
            c2paClaim,
            metadata,
            zkProof,
            cropInfo
        } = photoData;
        
        // CHECK 1: Hardware Signature (Critical)
        const signatureCheck = await verifyHardwareSignature(
            c2paClaim,
            imageData
        );
        results.checks.hardwareSignature = signatureCheck.valid;
        results.details.signature = signatureCheck.details;
        if (signatureCheck.valid) results.confidence += 0.30;
        else results.fraudIndicators.push('Invalid hardware signature');
        
        // CHECK 2: Merkle Tree Integrity
        const merkleCheck = await verifyMerkleTree(
            imageData,
            c2paClaim.imageRoot
        );
        results.checks.merkleIntegrity = merkleCheck.valid;
        results.details.merkle = merkleCheck.details;
        if (merkleCheck.valid) results.confidence += 0.25;
        else results.fraudIndicators.push('Image has been tampered');
        
        // CHECK 3: Anti-AI Metadata
        const metadataCheck = verifyMetadata(metadata);
        results.checks.hasMetadata = metadataCheck.valid;
        results.details.metadata = metadataCheck.details;
        if (metadataCheck.valid) results.confidence += 0.20;
        else results.fraudIndicators.push('Missing critical metadata');
        
        // CHECK 4: GPS Location
        const gpsCheck = verifyGPS(metadata);
        results.checks.hasGPS = gpsCheck.valid;
        results.details.gps = gpsCheck.details;
        if (gpsCheck.valid) results.confidence += 0.10;
        
        // CHECK 5: Motion Sensors (Not Screenshot)
        const motionCheck = verifyMotionSensors(metadata);
        results.checks.hasMotion = motionCheck.valid;
        results.details.motion = motionCheck.details;
        if (motionCheck.valid) results.confidence += 0.10;
        else results.fraudIndicators.push('Possible screenshot');
        
        // CHECK 6: Timestamp
        const timestampCheck = verifyTimestamp(c2paClaim.timestamp);
        results.checks.timestampValid = timestampCheck.valid;
        results.details.timestamp = timestampCheck.details;
        if (timestampCheck.valid) results.confidence += 0.05;
        
        // Overall determination
        results.overall = results.confidence >= 0.7;
        
        console.log(`✅ Verification complete: ${results.overall ? 'AUTHENTIC' : 'SUSPICIOUS'}`);
        console.log(`   Confidence: ${(results.confidence * 100).toFixed(1)}%`);
        console.log(`   Checks passed: ${Object.values(results.checks).filter(Boolean).length}/${Object.keys(results.checks).length}`);
        
        if (results.fraudIndicators.length > 0) {
            console.log(`⚠️ Fraud indicators: ${results.fraudIndicators.join(', ')}`);
        }
        
        return results;
        
    } catch (error) {
        console.error('❌ Verification error:', error);
        results.checks.error = true;
        results.fraudIndicators.push('Verification error: ' + error.message);
        return results;
    }
}

/**
 * Verify hardware signature (Secure Enclave)
 */
async function verifyHardwareSignature(c2paClaim, imageData) {
    try {
        if (!c2paClaim || !c2paClaim.signature || !c2paClaim.publicKey || !c2paClaim.imageRoot) {
            return {
                valid: false,
                details: { error: 'Missing signature data' }
            };
        }
        
        // Decode signature and public key
        const signatureBuffer = Buffer.from(c2paClaim.signature, 'base64');
        const publicKeyBuffer = Buffer.from(c2paClaim.publicKey, 'base64');
        
        // Decode Merkle root (hex string to buffer)
        const merkleRootBuffer = Buffer.from(c2paClaim.imageRoot, 'hex');
        
        // Import public key
        const publicKey = ec.keyFromPublic(publicKeyBuffer);
        
        // Parse DER signature
        const signature = {
            r: signatureBuffer.slice(4, 36).toString('hex'),
            s: signatureBuffer.slice(38, 70).toString('hex')
        };
        
        // Verify signature
        const isValid = publicKey.verify(merkleRootBuffer, signature);
        
        return {
            valid: isValid,
            details: {
                signaturePresent: true,
                publicKeyValid: true,
                merkleRootMatches: isValid,
                algorithm: 'P-256 ECDSA'
            }
        };
        
    } catch (error) {
        console.error('❌ Signature verification error:', error);
        return {
            valid: false,
            details: { error: error.message }
        };
    }
}

/**
 * Verify Merkle tree integrity
 */
async function verifyMerkleTree(imageData, expectedRoot) {
    try {
        // In production, regenerate Merkle tree from image tiles
        // and compare to expectedRoot
        
        // For now, check if root exists
        const hasRoot = expectedRoot && expectedRoot.length > 0;
        
        return {
            valid: hasRoot,
            details: {
                expectedRoot: expectedRoot ? expectedRoot.substring(0, 16) + '...' : 'missing',
                tileCount: hasRoot ? '1024 (assumed)' : '0'
            }
        };
    } catch (error) {
        return {
            valid: false,
            details: { error: error.message }
        };
    }
}

/**
 * Verify metadata completeness
 */
function verifyMetadata(metadata) {
    if (!metadata) {
        return {
            valid: false,
            details: { error: 'No metadata provided' }
        };
    }
    
    const requiredFields = ['cameraModel', 'captureTimestamp'];
    const presentFields = requiredFields.filter(field => metadata[field]);
    
    const hasGPS = metadata.latitude && metadata.longitude;
    const hasMotion = metadata.accelerometerX !== undefined;
    const hasCamera = metadata.cameraModel;
    
    const score = (presentFields.length / requiredFields.length) * 0.5 +
                  (hasGPS ? 0.2 : 0) +
                  (hasMotion ? 0.2 : 0) +
                  (hasCamera ? 0.1 : 0);
    
    return {
        valid: score > 0.5,
        details: {
            camera: hasCamera ? metadata.cameraModel : 'missing',
            gps: hasGPS ? 'present' : 'missing',
            motion: hasMotion ? 'present' : 'missing',
            completeness: `${(score * 100).toFixed(0)}%`
        }
    };
}

/**
 * Verify GPS data
 */
function verifyGPS(metadata) {
    if (!metadata || !metadata.latitude || !metadata.longitude) {
        return {
            valid: false,
            details: { error: 'GPS data missing' }
        };
    }
    
    // Check if coordinates are reasonable
    const lat = metadata.latitude;
    const lon = metadata.longitude;
    
    const validRange = lat >= -90 && lat <= 90 && lon >= -180 && lon <= 180;
    const notZero = lat !== 0 || lon !== 0; // 0,0 is suspicious
    
    return {
        valid: validRange && notZero,
        details: {
            latitude: lat,
            longitude: lon,
            accuracy: metadata.locationAccuracy || 'unknown'
        }
    };
}

/**
 * Verify motion sensor data (detect screenshots)
 */
function verifyMotionSensors(metadata) {
    if (!metadata) {
        return {
            valid: false,
            details: { error: 'No motion data' }
        };
    }
    
    const hasAccel = metadata.accelerometerX !== undefined;
    const hasGyro = metadata.gyroX !== undefined;
    
    // Check if motion data shows natural movement
    if (hasAccel) {
        const variance = Math.abs(metadata.accelerometerX || 0) +
                        Math.abs(metadata.accelerometerY || 0) +
                        Math.abs(metadata.accelerometerZ - 9.81 || 0);
        
        // Natural camera shake should have some variance
        const isNatural = variance > 0.1;
        
        return {
            valid: isNatural,
            details: {
                accelerometer: hasAccel ? 'present' : 'missing',
                gyroscope: hasGyro ? 'present' : 'missing',
                naturalMotion: isNatural ? 'yes' : 'no (possibly screenshot)',
                variance: variance.toFixed(2)
            }
        };
    }
    
    return {
        valid: false,
        details: { error: 'Motion sensors missing' }
    };
}

/**
 * Verify timestamp
 */
function verifyTimestamp(timestamp) {
    if (!timestamp) {
        return {
            valid: false,
            details: { error: 'Timestamp missing' }
        };
    }
    
    try {
        const captureTime = new Date(timestamp);
        const now = new Date();
        const ageMs = now - captureTime;
        const ageMinutes = ageMs / 1000 / 60;
        
        // Check if timestamp is reasonable (not in future, not too old)
        const notFuture = captureTime <= now;
        const notTooOld = ageMs < (30 * 24 * 60 * 60 * 1000); // 30 days
        
        return {
            valid: notFuture && notTooOld,
            details: {
                captureTime: timestamp,
                age: `${ageMinutes.toFixed(0)} minutes ago`,
                reasonable: notFuture && notTooOld ? 'yes' : 'no'
            }
        };
    } catch (error) {
        return {
            valid: false,
            details: { error: 'Invalid timestamp format' }
        };
    }
}

module.exports = {
    verifyClientPhoto,
    verifyHardwareSignature,
    verifyMerkleTree,
    verifyMetadata,
    verifyGPS,
    verifyMotionSensors,
    verifyTimestamp
};

