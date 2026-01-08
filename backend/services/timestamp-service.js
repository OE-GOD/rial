/**
 * Timestamp & Transparency Log Service
 *
 * FREE alternative to blockchain attestation:
 * 1. Server-signed timestamps (cryptographic proof)
 * 2. Append-only transparency log (auditable)
 * 3. PostgreSQL persistence (production) or file fallback (dev)
 *
 * This provides verifiable proof that a photo existed at a specific time
 * without the cost of blockchain transactions.
 */

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

class TimestampService {
    constructor(options = {}) {
        this.options = {
            logDir: options.logDir || path.join(__dirname, '../data/timestamps'),
            ...options
        };

        // Database pool (injected or null for file mode)
        this.pool = options.pool || null;

        // Server signing key
        this.privateKey = null;
        this.publicKey = null;

        // In-memory cache (for fast lookups)
        this.cache = new Map();
        this.logIndex = 0;

        this._initialized = false;
    }

    /**
     * Initialize the service
     */
    async initialize(pool = null) {
        if (this._initialized) return;

        this.pool = pool || this.pool;

        // Ensure log directory exists (for file fallback)
        if (!fs.existsSync(this.options.logDir)) {
            fs.mkdirSync(this.options.logDir, { recursive: true });
        }

        // Load or generate signing keys
        await this._initializeKeys();

        // Load existing log index
        await this._loadLogIndex();

        this._initialized = true;
        console.log(`📋 Timestamp service ready (${this.pool ? 'PostgreSQL' : 'file'} mode, ${this.logIndex} entries)`);
    }

    async _initializeKeys() {
        const keyPath = path.join(this.options.logDir, 'server-key.json');

        // Try loading from database first
        if (this.pool) {
            try {
                const result = await this.pool.query(
                    'SELECT * FROM server_keys WHERE key_type = $1 AND is_active = true ORDER BY created_at DESC LIMIT 1',
                    ['timestamp']
                );

                if (result.rows.length > 0) {
                    this.publicKey = result.rows[0].public_key;
                    // In production, private key should be in HSM or encrypted
                    // For now, load from file as backup
                    if (fs.existsSync(keyPath)) {
                        const keyData = JSON.parse(fs.readFileSync(keyPath, 'utf8'));
                        this.privateKey = keyData.privateKey;
                        console.log('🔑 Loaded timestamp signing key from database');
                        return;
                    }
                }
            } catch (e) {
                console.log('Could not load keys from database:', e.message);
            }
        }

        // Load from file or generate new
        if (fs.existsSync(keyPath)) {
            const keyData = JSON.parse(fs.readFileSync(keyPath, 'utf8'));
            this.privateKey = keyData.privateKey;
            this.publicKey = keyData.publicKey;
            console.log('🔑 Loaded existing timestamp signing key');
        } else {
            // Generate new ECDSA P-256 key pair
            const { privateKey, publicKey } = crypto.generateKeyPairSync('ec', {
                namedCurve: 'P-256',
                publicKeyEncoding: { type: 'spki', format: 'pem' },
                privateKeyEncoding: { type: 'pkcs8', format: 'pem' }
            });

            this.privateKey = privateKey;
            this.publicKey = publicKey;

            // Save keys to file
            fs.writeFileSync(keyPath, JSON.stringify({
                privateKey,
                publicKey,
                createdAt: new Date().toISOString()
            }));

            // Also save public key to database if available
            if (this.pool) {
                try {
                    await this.pool.query(
                        'INSERT INTO server_keys (key_type, public_key, algorithm) VALUES ($1, $2, $3)',
                        ['timestamp', publicKey, 'ECDSA-P256']
                    );
                } catch (e) {
                    console.log('Could not save key to database:', e.message);
                }
            }

            console.log('🔑 Generated new timestamp signing key');
        }
    }

    async _loadLogIndex() {
        if (this.pool) {
            try {
                const result = await this.pool.query(
                    'SELECT COALESCE(MAX(log_index), -1) as max_index FROM timestamp_log'
                );
                this.logIndex = result.rows[0].max_index + 1;
                return;
            } catch (e) {
                console.log('Could not load log index from database:', e.message);
            }
        }

        // Fallback to file
        const logPath = path.join(this.options.logDir, 'log-index.json');
        if (fs.existsSync(logPath)) {
            try {
                const data = JSON.parse(fs.readFileSync(logPath, 'utf8'));
                this.logIndex = data.nextIndex || 0;
            } catch (e) {
                this.logIndex = 0;
            }
        }
    }

    async _saveLogIndex() {
        const logPath = path.join(this.options.logDir, 'log-index.json');
        fs.writeFileSync(logPath, JSON.stringify({ nextIndex: this.logIndex }));
    }

    /**
     * Create a signed timestamp for an image
     */
    async createTimestamp(data) {
        if (!this._initialized) await this.initialize();

        const {
            imageHash,
            merkleRoot,
            metadataHash,
            publicKey: devicePublicKey,
            signatureType,
            livenessScore,
            aiScore
        } = data;

        const timestamp = Date.now();
        const isoTimestamp = new Date(timestamp).toISOString();
        const currentIndex = this.logIndex;

        // Get previous hash for chain integrity
        let previousHash = '0'.repeat(64);
        if (currentIndex > 0) {
            previousHash = await this._getPreviousHash(currentIndex - 1);
        }

        // Create the data to sign
        const timestampData = {
            imageHash,
            merkleRoot,
            metadataHash: metadataHash || merkleRoot,
            timestamp,
            isoTimestamp,
            devicePublicKey: devicePublicKey || null,
            signatureType: signatureType || 'unknown',
            flags: {
                webauthn: signatureType === 'webauthn',
                liveness: livenessScore >= 70,
                aiVerified: aiScore >= 60
            },
            logIndex: currentIndex,
            previousHash
        };

        // Create signature over the timestamp data
        const dataToSign = JSON.stringify(timestampData);
        const sign = crypto.createSign('SHA256');
        sign.update(dataToSign);
        const signature = sign.sign(this.privateKey, 'base64');

        // Compute entry hash
        const entryHash = crypto.createHash('sha256')
            .update(`${imageHash}:${timestamp}:${signature}:${previousHash}`)
            .digest('hex');

        // Store in database or file
        const entry = {
            ...timestampData,
            signature,
            entryHash
        };

        await this._storeEntry(entry);

        // Increment log index
        this.logIndex++;
        await this._saveLogIndex();

        // Cache it
        this.cache.set(imageHash, entry);

        console.log(`📝 Timestamp created: ${imageHash.substring(0, 16)}... (entry #${currentIndex})`);

        return {
            success: true,
            timestamp: {
                imageHash,
                timestamp,
                isoTimestamp,
                signature,
                entryHash,
                logIndex: currentIndex,
                previousHash,
                serverPublicKey: this.publicKey.split('\n').slice(1, -1).join('')
            }
        };
    }

    async _storeEntry(entry) {
        if (this.pool) {
            try {
                await this.pool.query(`
                    INSERT INTO timestamp_log (
                        log_index, image_hash, merkle_root, metadata_hash,
                        device_public_key, signature_type,
                        flag_webauthn, flag_liveness, flag_ai_verified,
                        timestamp_ms, timestamp_iso, server_signature,
                        previous_hash, entry_hash
                    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
                `, [
                    entry.logIndex,
                    entry.imageHash,
                    entry.merkleRoot,
                    entry.metadataHash,
                    entry.devicePublicKey,
                    entry.signatureType,
                    entry.flags.webauthn,
                    entry.flags.liveness,
                    entry.flags.aiVerified,
                    entry.timestamp,
                    entry.isoTimestamp,
                    entry.signature,
                    entry.previousHash,
                    entry.entryHash
                ]);
                return;
            } catch (e) {
                console.log('Database store failed, using file fallback:', e.message);
            }
        }

        // File fallback - append to log file
        const logPath = path.join(this.options.logDir, 'transparency-log.jsonl');
        fs.appendFileSync(logPath, JSON.stringify(entry) + '\n');
    }

    async _getPreviousHash(index) {
        if (this.pool) {
            try {
                const result = await this.pool.query(
                    'SELECT entry_hash FROM timestamp_log WHERE log_index = $1',
                    [index]
                );
                if (result.rows.length > 0) {
                    return result.rows[0].entry_hash;
                }
            } catch (e) {
                // Fall through to file
            }
        }

        // File fallback - read last line
        const logPath = path.join(this.options.logDir, 'transparency-log.jsonl');
        if (fs.existsSync(logPath)) {
            const lines = fs.readFileSync(logPath, 'utf8').trim().split('\n');
            if (lines.length > 0) {
                try {
                    const lastEntry = JSON.parse(lines[lines.length - 1]);
                    return lastEntry.entryHash;
                } catch (e) {}
            }
        }

        return '0'.repeat(64);
    }

    /**
     * Verify a timestamp
     */
    async verifyTimestamp(imageHash) {
        if (!this._initialized) await this.initialize();

        // Check cache first
        let entry = this.cache.get(imageHash);

        // Then database
        if (!entry && this.pool) {
            try {
                const result = await this.pool.query(
                    'SELECT * FROM timestamp_log WHERE image_hash = $1',
                    [imageHash]
                );
                if (result.rows.length > 0) {
                    const row = result.rows[0];
                    entry = {
                        imageHash: row.image_hash,
                        merkleRoot: row.merkle_root,
                        metadataHash: row.metadata_hash,
                        timestamp: parseInt(row.timestamp_ms),
                        isoTimestamp: row.timestamp_iso,
                        devicePublicKey: row.device_public_key,
                        signatureType: row.signature_type,
                        flags: {
                            webauthn: row.flag_webauthn,
                            liveness: row.flag_liveness,
                            aiVerified: row.flag_ai_verified
                        },
                        logIndex: row.log_index,
                        signature: row.server_signature,
                        previousHash: row.previous_hash,
                        entryHash: row.entry_hash
                    };
                }
            } catch (e) {
                console.log('Database lookup failed:', e.message);
            }
        }

        if (!entry) {
            return {
                verified: false,
                exists: false,
                message: 'No timestamp found for this image'
            };
        }

        // Verify signature
        const timestampData = {
            imageHash: entry.imageHash,
            merkleRoot: entry.merkleRoot,
            metadataHash: entry.metadataHash,
            timestamp: entry.timestamp,
            isoTimestamp: entry.isoTimestamp,
            devicePublicKey: entry.devicePublicKey,
            signatureType: entry.signatureType,
            flags: entry.flags,
            logIndex: entry.logIndex,
            previousHash: entry.previousHash
        };

        const dataToVerify = JSON.stringify(timestampData);
        const verify = crypto.createVerify('SHA256');
        verify.update(dataToVerify);

        let signatureValid = false;
        try {
            signatureValid = verify.verify(this.publicKey, entry.signature, 'base64');
        } catch (e) {
            signatureValid = false;
        }

        return {
            verified: signatureValid,
            exists: true,
            signatureValid,
            entry: {
                imageHash: entry.imageHash,
                merkleRoot: entry.merkleRoot,
                timestamp: entry.timestamp,
                isoTimestamp: entry.isoTimestamp,
                logIndex: entry.logIndex,
                entryHash: entry.entryHash,
                flags: entry.flags
            },
            message: signatureValid
                ? 'Timestamp verified successfully'
                : 'Signature verification failed'
        };
    }

    /**
     * Get transparency log stats
     */
    async getStats() {
        if (!this._initialized) await this.initialize();

        let totalEntries = this.logIndex;
        let oldestEntry = null;
        let newestEntry = null;

        if (this.pool) {
            try {
                const result = await this.pool.query(`
                    SELECT
                        COUNT(*) as total,
                        MIN(timestamp_iso) as oldest,
                        MAX(timestamp_iso) as newest
                    FROM timestamp_log
                `);
                if (result.rows.length > 0) {
                    totalEntries = parseInt(result.rows[0].total);
                    oldestEntry = result.rows[0].oldest;
                    newestEntry = result.rows[0].newest;
                }
            } catch (e) {}
        }

        return {
            totalEntries,
            oldestEntry,
            newestEntry,
            serverPublicKey: this.publicKey,
            storageMode: this.pool ? 'postgresql' : 'file'
        };
    }

    /**
     * Get recent log entries
     */
    async getRecentEntries(limit = 10) {
        if (!this._initialized) await this.initialize();

        if (this.pool) {
            try {
                const result = await this.pool.query(`
                    SELECT image_hash, timestamp_iso, log_index, entry_hash
                    FROM timestamp_log
                    ORDER BY log_index DESC
                    LIMIT $1
                `, [limit]);

                return result.rows.map(row => ({
                    imageHash: row.image_hash.substring(0, 16) + '...',
                    timestamp: row.timestamp_iso,
                    logIndex: row.log_index,
                    entryHash: row.entry_hash.substring(0, 16) + '...'
                }));
            } catch (e) {}
        }

        return [];
    }

    /**
     * Export full log for external verification
     */
    async exportLog() {
        if (!this._initialized) await this.initialize();

        let entries = [];

        if (this.pool) {
            try {
                const result = await this.pool.query(
                    'SELECT * FROM timestamp_log ORDER BY log_index ASC'
                );
                entries = result.rows;
            } catch (e) {}
        }

        return {
            version: 1,
            serverPublicKey: this.publicKey,
            entries,
            exportedAt: new Date().toISOString()
        };
    }
}

// Singleton
let service = null;

function getTimestampService(pool = null) {
    if (!service) {
        service = new TimestampService();
    }
    if (pool && !service.pool) {
        service.pool = pool;
    }
    return service;
}

module.exports = {
    TimestampService,
    getTimestampService
};
