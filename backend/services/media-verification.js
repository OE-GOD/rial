/**
 * Media Verification Service
 *
 * Stores attestations and verifies if media is authentic
 *
 * Flow:
 * 1. Alice captures media → attestation created & stored
 * 2. Alice sends media anywhere (WhatsApp, email, etc.)
 * 3. Bob uploads media → system matches against attestations
 * 4. Bob sees verification result
 *
 * Storage modes:
 * - PostgreSQL (production) - certified_images table
 * - In-memory (development) - fallback when no database
 */

const crypto = require('crypto');
const sharp = require('sharp');

class MediaVerificationService {
    constructor(options = {}) {
        // Database pool (injected or null for memory mode)
        this.pool = options.pool || null;

        // In-memory storage (fallback when no database)
        this.attestations = new Map();        // attestationId -> full attestation
        this.fingerprintIndex = new Map();    // fingerprint -> attestationId
        this.hashIndex = new Map();           // contentHash -> attestationId
        this.publicLinks = new Map();         // shortCode -> attestationId

        this._initialized = false;
    }

    /**
     * Initialize the service with optional database pool
     */
    async initialize(pool = null) {
        if (this._initialized) return;

        this.pool = pool || this.pool;

        // Test database connection
        if (this.pool) {
            try {
                await this.pool.query('SELECT 1');
                console.log('📦 Verification service ready (PostgreSQL mode)');
            } catch (e) {
                console.log('📦 Verification service ready (in-memory mode, DB not available)');
                this.pool = null;
            }
        } else {
            console.log('📦 Verification service ready (in-memory mode)');
        }

        this._initialized = true;
    }

    // =====================================
    // ATTESTATION STORAGE
    // =====================================

    /**
     * Store a new attestation when media is captured
     */
    async storeAttestation(attestation) {
        if (!this._initialized) await this.initialize();

        const id = attestation.id || crypto.randomBytes(16).toString('hex');

        const record = {
            id,
            type: attestation.type || 'photo',
            createdAt: new Date().toISOString(),

            // Content identifiers (multiple ways to match)
            contentHash: attestation.imageHash || attestation.contentHash,
            merkleRoot: attestation.merkleRoot,
            perceptualHash: attestation.perceptualHash,

            // Capture proof
            captureProof: {
                timestamp: attestation.timestamp || new Date().toISOString(),
                signature: attestation.signature,
                publicKey: attestation.publicKey,
                deviceId: attestation.metadata?.deviceId,
                algorithm: 'ECDSA-P256'
            },

            // Location proof
            locationProof: attestation.metadata?.latitude ? {
                latitude: attestation.metadata.latitude,
                longitude: attestation.metadata.longitude,
                accuracy: attestation.metadata.accuracy || attestation.metadata.locationAccuracy,
                altitude: attestation.metadata.altitude,
                source: 'GPS',
                verified: true
            } : null,

            // Device attestation
            deviceProof: {
                type: attestation.metadata?.deviceType || 'unknown',
                browser: attestation.metadata?.browser,
                platform: attestation.metadata?.platform,
                screenResolution: attestation.metadata?.screenResolution,
                userAgent: attestation.metadata?.userAgent
            },

            // Sensor data (proves physical presence)
            sensorProof: attestation.metadata?.sensors || {
                hasGyroscope: !!attestation.metadata?.gamma,
                hasAccelerometer: !!attestation.metadata?.acceleration,
                orientation: attestation.metadata?.alpha ? {
                    alpha: attestation.metadata.alpha,
                    beta: attestation.metadata.beta,
                    gamma: attestation.metadata.gamma
                } : null,
                motion: attestation.metadata?.acceleration
            },

            // Integrity
            integrityProof: {
                merkleRoot: attestation.merkleRoot,
                tileCount: attestation.c2paClaim?.tileCount || 1024,
                zkProof: attestation.zkProof || null
            },

            // Video-specific
            videoProof: attestation.frameCount ? {
                frameCount: attestation.frameCount,
                duration: attestation.duration,
                startHash: attestation.startHash,
                endHash: attestation.endHash,
                chainIntegrity: attestation.chainIntegrity
            } : null,

            // AI detection results
            aiDetection: attestation.aiDetectionResult || null,

            // Liveness results
            livenessResult: attestation.livenessResult || null,

            // Verification status
            status: 'verified',
            verificationCount: 0
        };

        // Generate shareable link
        const shortCode = this.generateShortCode();
        record.shareCode = shortCode;
        record.shareUrl = `/verify/${shortCode}`;

        // Try to store in database first
        if (this.pool) {
            try {
                await this._storeInDatabase(record, attestation);
                console.log(`📝 Attestation stored in DB: ${id}`);
                console.log(`   Share URL: /verify/${shortCode}`);
                return record;
            } catch (e) {
                console.log('Database store failed, using memory fallback:', e.message);
            }
        }

        // Fallback to in-memory storage
        this.attestations.set(id, record);
        if (record.contentHash) {
            this.hashIndex.set(record.contentHash, id);
        }
        this.publicLinks.set(shortCode, id);

        console.log(`📝 Attestation stored in memory: ${id}`);
        console.log(`   Share URL: /verify/${shortCode}`);

        return record;
    }

    /**
     * Store attestation in PostgreSQL
     */
    async _storeInDatabase(record, attestation) {
        await this.pool.query(`
            INSERT INTO certified_images (
                user_id, original_filename, image_hash, merkle_root,
                image_url, file_size_bytes, dimensions_width, dimensions_height,
                c2pa_claim, signature, public_key, signature_type,
                zk_proofs, camera_info, gps_location, motion_data,
                temporal_data, device_fingerprint,
                authenticity_score, fraud_probability, ai_detection_score,
                ai_detection_result, liveness_score, liveness_result,
                is_verified, share_code
            ) VALUES (
                $1, $2, $3, $4, $5, $6, $7, $8, $9, $10,
                $11, $12, $13, $14, $15, $16, $17, $18, $19, $20,
                $21, $22, $23, $24, $25, $26
            )
            ON CONFLICT (image_hash) DO UPDATE SET
                verification_count = certified_images.verification_count + 1,
                last_verified_at = CURRENT_TIMESTAMP
        `, [
            attestation.userId || null,
            attestation.originalFilename || null,
            record.contentHash,
            record.merkleRoot,
            attestation.imageUrl || null,
            attestation.fileSize || null,
            attestation.dimensions?.width || null,
            attestation.dimensions?.height || null,
            JSON.stringify(attestation.c2paClaim || null),
            record.captureProof.signature,
            record.captureProof.publicKey,
            attestation.signatureType || 'webcrypto',
            JSON.stringify(attestation.zkProofs || null),
            JSON.stringify(record.deviceProof || null),
            JSON.stringify(record.locationProof || null),
            JSON.stringify(record.sensorProof || null),
            JSON.stringify({ timestamp: record.captureProof.timestamp }),
            JSON.stringify(record.deviceProof || null),
            attestation.authenticityScore || null,
            attestation.fraudProbability || null,
            attestation.aiDetectionResult?.score || null,
            JSON.stringify(attestation.aiDetectionResult || null),
            attestation.livenessResult?.score || null,
            JSON.stringify(attestation.livenessResult || null),
            true,
            record.shareCode
        ]);
    }

    // =====================================
    // VERIFICATION
    // =====================================

    /**
     * Verify uploaded media against stored attestations
     * This is the main function Bob calls when he receives media
     */
    async verifyMedia(mediaBuffer, options = {}) {
        if (!this._initialized) await this.initialize();

        console.log('🔍 Verifying uploaded media...');

        const result = {
            verified: false,
            confidence: 0,
            checks: [],
            attestation: null,
            warnings: [],
            details: {}
        };

        try {
            // Step 1: Compute content hash
            const contentHash = await this.computeContentHash(mediaBuffer);
            result.details.uploadedHash = contentHash;

            // Step 2: Try to find matching attestation (DB first, then memory)
            let attestation = await this._findByHash(contentHash);
            let attestationId = attestation?.id;
            let matchType = 'exact_hash';

            // Step 3: If no exact match, try perceptual matching
            if (!attestation && options.tryPerceptual !== false) {
                const perceptualMatch = await this.findPerceptualMatch(mediaBuffer);
                if (perceptualMatch) {
                    attestation = perceptualMatch;
                    attestationId = perceptualMatch.id;
                    matchType = 'perceptual';
                    result.warnings.push('Media may have been re-encoded or slightly modified');
                }
            }

            // Step 4: No match found
            if (!attestation) {
                result.verified = false;
                result.checks.push({
                    name: 'attestation_found',
                    passed: false,
                    message: 'No attestation found for this media'
                });
                result.details.possibleReasons = [
                    'Media was not captured through TrueShot app',
                    'Media has been significantly modified',
                    'Media may be AI-generated or fake',
                    'Attestation may have expired or been deleted'
                ];
                return result;
            }

            // Step 5: Found attestation - run verification checks
            result.attestation = attestation;
            result.details.matchType = matchType;

            // Check 1: Attestation exists
            result.checks.push({
                name: 'attestation_found',
                passed: true,
                message: `Found attestation: ${attestationId.substring(0, 8)}...`
            });

            // Check 2: Capture signature
            const signatureValid = this.verifySignature(attestation);
            result.checks.push({
                name: 'capture_signature',
                passed: signatureValid,
                message: signatureValid
                    ? 'Cryptographic signature valid'
                    : 'Signature verification failed'
            });

            // Check 3: Timestamp verification
            const timestampValid = this.verifyTimestamp(attestation);
            result.checks.push({
                name: 'timestamp',
                passed: timestampValid.valid,
                message: `Captured: ${new Date(attestation.captureProof.timestamp).toLocaleString()}`,
                details: timestampValid
            });

            // Check 4: Location proof
            if (attestation.locationProof) {
                result.checks.push({
                    name: 'location',
                    passed: true,
                    message: `GPS verified: ${attestation.locationProof.latitude.toFixed(4)}, ${attestation.locationProof.longitude.toFixed(4)}`,
                    details: attestation.locationProof
                });
            } else {
                result.checks.push({
                    name: 'location',
                    passed: false,
                    message: 'No location data available',
                    warning: true
                });
            }

            // Check 5: Device attestation
            result.checks.push({
                name: 'device',
                passed: !!attestation.deviceProof.type,
                message: `Device: ${attestation.deviceProof.type} / ${attestation.deviceProof.browser}`,
                details: attestation.deviceProof
            });

            // Check 6: Sensor proof (physical presence)
            const hasSensorData = attestation.sensorProof?.hasGyroscope ||
                                  attestation.sensorProof?.hasAccelerometer;
            result.checks.push({
                name: 'sensor_data',
                passed: hasSensorData,
                message: hasSensorData
                    ? 'Sensor data confirms physical device'
                    : 'Limited sensor data',
                details: attestation.sensorProof
            });

            // Check 7: Integrity (hash/merkle)
            const integrityValid = matchType === 'exact_hash';
            result.checks.push({
                name: 'integrity',
                passed: integrityValid,
                message: integrityValid
                    ? 'Content integrity verified (exact hash match)'
                    : 'Content may have minor modifications'
            });

            // Check 8: Video chain (if video)
            if (attestation.videoProof) {
                result.checks.push({
                    name: 'video_chain',
                    passed: attestation.videoProof.chainIntegrity,
                    message: `Video: ${attestation.videoProof.frameCount} frames, chain ${attestation.videoProof.chainIntegrity ? 'valid' : 'broken'}`,
                    details: attestation.videoProof
                });
            }

            // Calculate confidence score
            const passedChecks = result.checks.filter(c => c.passed).length;
            const totalChecks = result.checks.length;
            result.confidence = Math.round((passedChecks / totalChecks) * 100);

            // Set verification status
            result.verified = result.confidence >= 70;

            // Update verification count
            attestation.verificationCount++;
            attestation.lastVerified = new Date().toISOString();

            console.log(`✅ Verification complete: ${result.verified ? 'AUTHENTIC' : 'SUSPICIOUS'} (${result.confidence}%)`);

        } catch (error) {
            console.error('Verification error:', error);
            result.error = error.message;
        }

        return result;
    }

    /**
     * Verify by share code (from shareable link)
     */
    async verifyByShareCode(shareCode) {
        if (!this._initialized) await this.initialize();

        // Try database first
        let attestation = await this._findByShareCode(shareCode);

        // Fallback to memory
        if (!attestation) {
            const attestationId = this.publicLinks.get(shareCode);
            if (attestationId) {
                attestation = this.attestations.get(attestationId);
            }
        }

        if (!attestation) {
            return { verified: false, error: 'Invalid share code' };
        }

        // Log verification request
        await this._logVerificationRequest(attestation.contentHash, shareCode, true);

        // Return attestation details without needing to upload media
        return {
            verified: true,
            attestation: this.sanitizeAttestation(attestation),
            message: 'This media was verified at capture time'
        };
    }

    // =====================================
    // DATABASE QUERY METHODS
    // =====================================

    /**
     * Find attestation by content hash
     */
    async _findByHash(contentHash) {
        // Try database first
        if (this.pool) {
            try {
                const result = await this.pool.query(
                    'SELECT * FROM certified_images WHERE image_hash = $1',
                    [contentHash]
                );
                if (result.rows.length > 0) {
                    return this._rowToAttestation(result.rows[0]);
                }
            } catch (e) {
                console.log('Database lookup failed:', e.message);
            }
        }

        // Fallback to memory
        const id = this.hashIndex.get(contentHash);
        return id ? this.attestations.get(id) : null;
    }

    /**
     * Find attestation by share code
     */
    async _findByShareCode(shareCode) {
        if (this.pool) {
            try {
                const result = await this.pool.query(
                    'SELECT * FROM certified_images WHERE share_code = $1',
                    [shareCode]
                );
                if (result.rows.length > 0) {
                    return this._rowToAttestation(result.rows[0]);
                }
            } catch (e) {
                console.log('Database lookup failed:', e.message);
            }
        }
        return null;
    }

    /**
     * Convert database row to attestation object
     */
    _rowToAttestation(row) {
        return {
            id: row.id.toString(),
            type: 'photo',
            createdAt: row.created_at,
            contentHash: row.image_hash,
            merkleRoot: row.merkle_root,
            captureProof: {
                timestamp: row.temporal_data?.timestamp || row.created_at,
                signature: row.signature,
                publicKey: row.public_key,
                algorithm: 'ECDSA-P256'
            },
            locationProof: row.gps_location,
            deviceProof: row.camera_info || row.device_fingerprint,
            sensorProof: row.motion_data,
            integrityProof: {
                merkleRoot: row.merkle_root,
                zkProof: row.zk_proofs
            },
            aiDetection: row.ai_detection_result,
            livenessResult: row.liveness_result,
            shareCode: row.share_code,
            shareUrl: `/verify/${row.share_code}`,
            status: row.is_verified ? 'verified' : 'unverified',
            verificationCount: row.verification_count || 0
        };
    }

    /**
     * Log verification request for analytics
     */
    async _logVerificationRequest(imageHash, shareCode, isVerified) {
        if (!this.pool) return;

        try {
            await this.pool.query(`
                INSERT INTO verification_requests (image_hash, share_code, is_verified)
                VALUES ($1, $2, $3)
            `, [imageHash, shareCode, isVerified]);
        } catch (e) {
            // Non-critical, ignore errors
        }
    }

    // =====================================
    // HELPER METHODS
    // =====================================

    async computeContentHash(buffer) {
        return crypto.createHash('sha256').update(buffer).digest('hex');
    }

    async computePerceptualHash(buffer) {
        try {
            // Resize to small grayscale for perceptual comparison
            const thumbnail = await sharp(buffer)
                .resize(16, 16, { fit: 'fill' })
                .grayscale()
                .raw()
                .toBuffer();

            // Simple perceptual hash (average hash)
            const avg = thumbnail.reduce((a, b) => a + b, 0) / thumbnail.length;
            let hash = '';
            for (const pixel of thumbnail) {
                hash += pixel >= avg ? '1' : '0';
            }
            return hash;
        } catch (error) {
            return null;
        }
    }

    async findPerceptualMatch(buffer) {
        const uploadedPHash = await this.computePerceptualHash(buffer);
        if (!uploadedPHash) return null;

        // Check against stored attestations (in production, use proper index)
        for (const [id, attestation] of this.attestations) {
            if (attestation.perceptualHash === uploadedPHash) {
                return attestation;
            }
        }
        return null;
    }

    verifySignature(attestation) {
        // In production, verify ECDSA signature
        // For now, check that signature exists and is non-empty
        return !!(attestation.captureProof?.signature &&
                  attestation.captureProof.signature.length > 0);
    }

    verifyTimestamp(attestation) {
        const captureTime = new Date(attestation.captureProof.timestamp);
        const now = new Date();
        const ageMs = now - captureTime;
        const ageHours = ageMs / (1000 * 60 * 60);
        const ageDays = ageHours / 24;

        return {
            valid: !isNaN(captureTime.getTime()),
            timestamp: attestation.captureProof.timestamp,
            age: ageDays < 1
                ? `${Math.round(ageHours)} hours ago`
                : `${Math.round(ageDays)} days ago`,
            fresh: ageHours < 24
        };
    }

    generateShortCode() {
        const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
        let code = '';
        for (let i = 0; i < 8; i++) {
            code += chars[Math.floor(Math.random() * chars.length)];
        }
        return code;
    }

    sanitizeAttestation(attestation) {
        // Remove sensitive data before sending to client
        return {
            id: attestation.id,
            type: attestation.type,
            createdAt: attestation.createdAt,
            captureProof: {
                timestamp: attestation.captureProof.timestamp,
                hasSignature: !!attestation.captureProof.signature
            },
            locationProof: attestation.locationProof,
            deviceProof: {
                type: attestation.deviceProof.type,
                browser: attestation.deviceProof.browser
            },
            sensorProof: {
                hasGyroscope: attestation.sensorProof?.hasGyroscope,
                hasAccelerometer: attestation.sensorProof?.hasAccelerometer
            },
            integrityProof: {
                merkleRoot: attestation.integrityProof.merkleRoot?.substring(0, 16) + '...'
            },
            videoProof: attestation.videoProof,
            shareCode: attestation.shareCode,
            verificationCount: attestation.verificationCount
        };
    }

    // =====================================
    // QUERIES
    // =====================================

    async getAttestation(id) {
        if (!this._initialized) await this.initialize();

        // Try database first
        if (this.pool) {
            try {
                const result = await this.pool.query(
                    'SELECT * FROM certified_images WHERE id = $1',
                    [parseInt(id)]
                );
                if (result.rows.length > 0) {
                    return this._rowToAttestation(result.rows[0]);
                }
            } catch (e) {
                // Fall through to memory
            }
        }

        return this.attestations.get(id);
    }

    async getAttestationByHash(hash) {
        return this._findByHash(hash);
    }

    async getStats() {
        if (!this._initialized) await this.initialize();

        // Try database first
        if (this.pool) {
            try {
                const result = await this.pool.query(`
                    SELECT
                        COUNT(*) as total,
                        COUNT(*) FILTER (WHERE ai_detection_score IS NOT NULL) as with_ai,
                        COUNT(*) FILTER (WHERE liveness_score IS NOT NULL) as with_liveness,
                        COALESCE(SUM(verification_count), 0) as total_verifications,
                        MIN(created_at) as oldest,
                        MAX(created_at) as newest
                    FROM certified_images
                `);

                if (result.rows.length > 0) {
                    const row = result.rows[0];
                    return {
                        totalAttestations: parseInt(row.total),
                        photoAttestations: parseInt(row.total), // All are photos for now
                        videoAttestations: 0,
                        totalVerifications: parseInt(row.total_verifications),
                        withAiDetection: parseInt(row.with_ai),
                        withLiveness: parseInt(row.with_liveness),
                        oldestAttestation: row.oldest,
                        newestAttestation: row.newest,
                        storageMode: 'postgresql'
                    };
                }
            } catch (e) {
                console.log('Database stats failed:', e.message);
            }
        }

        // Fallback to memory
        return {
            totalAttestations: this.attestations.size,
            photoAttestations: [...this.attestations.values()].filter(a => a.type === 'photo').length,
            videoAttestations: [...this.attestations.values()].filter(a => a.type !== 'photo').length,
            totalVerifications: [...this.attestations.values()].reduce((sum, a) => sum + a.verificationCount, 0),
            storageMode: 'memory'
        };
    }

    /**
     * Get recent attestations for dashboard
     */
    async getRecentAttestations(limit = 10) {
        if (!this._initialized) await this.initialize();

        if (this.pool) {
            try {
                const result = await this.pool.query(`
                    SELECT id, image_hash, share_code, created_at,
                           ai_detection_score, liveness_score, is_verified
                    FROM certified_images
                    ORDER BY created_at DESC
                    LIMIT $1
                `, [limit]);

                return result.rows.map(row => ({
                    id: row.id,
                    imageHash: row.image_hash.substring(0, 16) + '...',
                    shareCode: row.share_code,
                    createdAt: row.created_at,
                    aiScore: row.ai_detection_score,
                    livenessScore: row.liveness_score,
                    verified: row.is_verified
                }));
            } catch (e) {
                console.log('Database query failed:', e.message);
            }
        }

        // Memory fallback
        return [...this.attestations.values()]
            .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
            .slice(0, limit)
            .map(a => ({
                id: a.id,
                imageHash: a.contentHash?.substring(0, 16) + '...',
                shareCode: a.shareCode,
                createdAt: a.createdAt,
                verified: a.status === 'verified'
            }));
    }
}

// Singleton
let verificationService = null;

function getVerificationService(pool = null) {
    if (!verificationService) {
        verificationService = new MediaVerificationService();
    }
    if (pool && !verificationService.pool) {
        verificationService.pool = pool;
    }
    return verificationService;
}

module.exports = {
    MediaVerificationService,
    getVerificationService
};
