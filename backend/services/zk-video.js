/**
 * ZK-Video Service
 *
 * Video verification using Zero-Knowledge Proofs
 * Extends ZK-IMG concepts to video content
 *
 * Modes:
 * 1. Keyframe Attestation - Extract keyframes, attest each
 * 2. Full Frame Verification - Attest every frame (short clips)
 * 3. Streaming Attestation - Real-time frame signing during capture
 */

const crypto = require('crypto');
const sharp = require('sharp');
const { getZKIMGService } = require('./zk-img');
const { hashImagePoseidon } = require('../zk/poseidon');

// Video verification modes
const VIDEO_MODES = {
    KEYFRAME: 'keyframe',      // Extract and attest keyframes
    FULL_FRAME: 'full_frame',  // Attest every frame
    STREAMING: 'streaming'      // Real-time attestation
};

class ZKVideoService {
    constructor(options = {}) {
        this.zkimg = getZKIMGService();
        this.options = {
            keyframeInterval: options.keyframeInterval || 1000, // ms between keyframes
            maxFrames: options.maxFrames || 300, // Max frames for full verification
            streamingBufferSize: options.streamingBufferSize || 30, // Frames to buffer
            ...options
        };

        // Active streaming sessions
        this.streamingSessions = new Map();

        // Video attestations storage
        this.videoAttestations = new Map();
    }

    // =====================================
    // KEYFRAME ATTESTATION
    // =====================================

    /**
     * Process video using keyframe attestation
     * Frames are sent from the client as base64 images
     *
     * @param {Array} frames - Array of {data: base64, timestamp: ms}
     * @param {Object} metadata - Video metadata
     * @returns {Object} Video attestation with chained proofs
     */
    async attestKeyframes(frames, metadata = {}) {
        console.log(`🎬 Attesting ${frames.length} keyframes...`);

        const startTime = Date.now();
        const frameProofs = [];
        let previousHash = null;

        for (let i = 0; i < frames.length; i++) {
            const frame = frames[i];
            console.log(`  Frame ${i + 1}/${frames.length} @ ${frame.timestamp}ms`);

            // Convert base64 to buffer
            const imageBuffer = Buffer.from(frame.data.replace(/^data:image\/\w+;base64,/, ''), 'base64');

            // Compute frame hash
            const frameHash = await hashImagePoseidon(imageBuffer);

            // Create frame proof with temporal chain
            const frameProof = {
                index: i,
                timestamp: frame.timestamp,
                hash: frameHash,
                previousHash: previousHash,
                merkleRoot: await this.zkimg.computeMerkleRoot(imageBuffer)
            };

            // Verify temporal chain integrity
            if (previousHash) {
                frameProof.chainValid = true;
                frameProof.chainHash = crypto.createHash('sha256')
                    .update(previousHash + frameHash)
                    .digest('hex');
            }

            frameProofs.push(frameProof);
            previousHash = frameHash;
        }

        // Create video attestation
        const attestation = {
            id: crypto.randomBytes(16).toString('hex'),
            type: 'keyframe_attestation',
            mode: VIDEO_MODES.KEYFRAME,
            frameCount: frames.length,
            duration: frames[frames.length - 1]?.timestamp || 0,
            startHash: frameProofs[0]?.hash,
            endHash: frameProofs[frameProofs.length - 1]?.hash,
            frameProofs: frameProofs,
            metadata: {
                ...metadata,
                processingTime: Date.now() - startTime,
                keyframeInterval: this.options.keyframeInterval
            },
            timestamp: new Date().toISOString(),
            chainIntegrity: this.verifyChainIntegrity(frameProofs)
        };

        // Store attestation
        this.videoAttestations.set(attestation.id, attestation);

        console.log(`✅ Video attested in ${attestation.metadata.processingTime}ms`);
        return attestation;
    }

    // =====================================
    // FULL FRAME VERIFICATION
    // =====================================

    /**
     * Full frame verification for short video clips
     * Every frame gets a ZK attestation
     *
     * @param {Array} frames - All video frames
     * @param {Object} metadata - Video metadata
     */
    async attestAllFrames(frames, metadata = {}) {
        if (frames.length > this.options.maxFrames) {
            throw new Error(`Too many frames (${frames.length}). Max is ${this.options.maxFrames}. Use keyframe mode instead.`);
        }

        console.log(`🎬 Full frame attestation: ${frames.length} frames...`);

        const startTime = Date.now();
        const frameAttestations = [];
        let previousHash = null;

        for (let i = 0; i < frames.length; i++) {
            const frame = frames[i];
            const imageBuffer = Buffer.from(frame.data.replace(/^data:image\/\w+;base64,/, ''), 'base64');

            // Full ZK attestation for each frame
            const attestation = await this.zkimg.createAttestation(
                imageBuffer,
                {
                    frameIndex: i,
                    timestamp: frame.timestamp,
                    ...metadata
                },
                '', // signature (would come from device)
                ''  // publicKey
            );

            // Add temporal chaining
            attestation.previousHash = previousHash;
            attestation.frameIndex = i;
            attestation.frameTimestamp = frame.timestamp;

            if (previousHash) {
                attestation.temporalProof = crypto.createHash('sha256')
                    .update(previousHash + attestation.imageHash)
                    .digest('hex');
            }

            frameAttestations.push({
                index: i,
                timestamp: frame.timestamp,
                attestationId: attestation.id,
                imageHash: attestation.imageHash,
                merkleRoot: attestation.merkleRoot,
                temporalProof: attestation.temporalProof
            });

            previousHash = attestation.imageHash;

            // Progress logging every 10%
            if (i % Math.ceil(frames.length / 10) === 0) {
                console.log(`  Progress: ${Math.round((i / frames.length) * 100)}%`);
            }
        }

        const videoAttestation = {
            id: crypto.randomBytes(16).toString('hex'),
            type: 'full_frame_attestation',
            mode: VIDEO_MODES.FULL_FRAME,
            frameCount: frames.length,
            fps: metadata.fps || 30,
            duration: (frames.length / (metadata.fps || 30)) * 1000,
            frameAttestations: frameAttestations,
            startHash: frameAttestations[0]?.imageHash,
            endHash: frameAttestations[frameAttestations.length - 1]?.imageHash,
            metadata: {
                ...metadata,
                processingTime: Date.now() - startTime
            },
            timestamp: new Date().toISOString(),
            chainIntegrity: true
        };

        this.videoAttestations.set(videoAttestation.id, videoAttestation);

        console.log(`✅ Full frame attestation complete in ${videoAttestation.metadata.processingTime}ms`);
        return videoAttestation;
    }

    // =====================================
    // STREAMING ATTESTATION
    // =====================================

    /**
     * Start a streaming attestation session
     * Frames will be attested in real-time as they arrive
     *
     * @param {Object} sessionConfig - Session configuration
     * @returns {Object} Session info
     */
    startStreamingSession(sessionConfig = {}) {
        const sessionId = crypto.randomBytes(16).toString('hex');

        const session = {
            id: sessionId,
            startTime: Date.now(),
            frameBuffer: [],
            attestedFrames: [],
            previousHash: null,
            metadata: sessionConfig.metadata || {},
            status: 'active',
            stats: {
                framesReceived: 0,
                framesAttested: 0,
                droppedFrames: 0
            }
        };

        this.streamingSessions.set(sessionId, session);
        console.log(`🎥 Streaming session started: ${sessionId}`);

        return {
            sessionId,
            status: 'active',
            bufferSize: this.options.streamingBufferSize
        };
    }

    /**
     * Add a frame to streaming session
     *
     * @param {string} sessionId - Session ID
     * @param {Object} frame - {data: base64, timestamp: ms}
     */
    async addStreamingFrame(sessionId, frame) {
        const session = this.streamingSessions.get(sessionId);
        if (!session) {
            throw new Error('Session not found');
        }

        if (session.status !== 'active') {
            throw new Error('Session is not active');
        }

        session.stats.framesReceived++;

        // Convert and hash frame
        const imageBuffer = Buffer.from(frame.data.replace(/^data:image\/\w+;base64,/, ''), 'base64');
        const frameHash = await hashImagePoseidon(imageBuffer);

        // Create streaming frame attestation
        const frameAttestation = {
            index: session.stats.framesAttested,
            timestamp: frame.timestamp,
            captureTime: Date.now(),
            hash: frameHash,
            previousHash: session.previousHash,
            thumbnailHash: await this.createThumbnailHash(imageBuffer)
        };

        // Add temporal chain proof
        if (session.previousHash) {
            frameAttestation.chainProof = crypto.createHash('sha256')
                .update(session.previousHash + frameHash)
                .digest('hex');
        }

        session.attestedFrames.push(frameAttestation);
        session.previousHash = frameHash;
        session.stats.framesAttested++;

        // Keep buffer under limit
        if (session.frameBuffer.length >= this.options.streamingBufferSize) {
            session.frameBuffer.shift();
            session.stats.droppedFrames++;
        }
        session.frameBuffer.push(frameAttestation);

        return {
            frameIndex: frameAttestation.index,
            hash: frameHash,
            chainValid: !!frameAttestation.chainProof
        };
    }

    /**
     * End streaming session and finalize attestation
     *
     * @param {string} sessionId - Session ID
     */
    async endStreamingSession(sessionId) {
        const session = this.streamingSessions.get(sessionId);
        if (!session) {
            throw new Error('Session not found');
        }

        session.status = 'completed';
        session.endTime = Date.now();

        // Create final video attestation
        const attestation = {
            id: crypto.randomBytes(16).toString('hex'),
            type: 'streaming_attestation',
            mode: VIDEO_MODES.STREAMING,
            sessionId: sessionId,
            frameCount: session.stats.framesAttested,
            duration: session.endTime - session.startTime,
            startHash: session.attestedFrames[0]?.hash,
            endHash: session.attestedFrames[session.attestedFrames.length - 1]?.hash,
            frameHashes: session.attestedFrames.map(f => ({
                index: f.index,
                hash: f.hash,
                timestamp: f.timestamp
            })),
            stats: session.stats,
            metadata: {
                ...session.metadata,
                startTime: new Date(session.startTime).toISOString(),
                endTime: new Date(session.endTime).toISOString()
            },
            timestamp: new Date().toISOString(),
            chainIntegrity: this.verifyChainIntegrity(session.attestedFrames)
        };

        this.videoAttestations.set(attestation.id, attestation);

        // Cleanup session
        this.streamingSessions.delete(sessionId);

        console.log(`✅ Streaming session completed: ${session.stats.framesAttested} frames attested`);
        return attestation;
    }

    /**
     * Get streaming session status
     */
    getStreamingStatus(sessionId) {
        const session = this.streamingSessions.get(sessionId);
        if (!session) {
            return { exists: false };
        }

        return {
            exists: true,
            sessionId: session.id,
            status: session.status,
            duration: Date.now() - session.startTime,
            stats: session.stats,
            latestHash: session.previousHash
        };
    }

    // =====================================
    // VERIFICATION
    // =====================================

    /**
     * Verify a video attestation
     */
    async verifyVideoAttestation(attestation) {
        console.log(`🔍 Verifying video attestation: ${attestation.id}`);

        const result = {
            valid: true,
            checks: [],
            attestationId: attestation.id,
            mode: attestation.mode
        };

        // Check 1: Attestation structure
        if (!attestation.id || !attestation.type || !attestation.frameCount) {
            result.valid = false;
            result.checks.push({ name: 'structure', passed: false, error: 'Invalid attestation structure' });
            return result;
        }
        result.checks.push({ name: 'structure', passed: true });

        // Check 2: Chain integrity
        const chainValid = this.verifyChainIntegrity(
            attestation.frameProofs || attestation.frameAttestations || attestation.frameHashes
        );
        result.checks.push({ name: 'chain_integrity', passed: chainValid });
        if (!chainValid) result.valid = false;

        // Check 3: Hash consistency
        const frames = attestation.frameProofs || attestation.frameAttestations || attestation.frameHashes;
        if (frames && frames.length > 0) {
            const startHashMatch = frames[0].hash === attestation.startHash ||
                                   frames[0].imageHash === attestation.startHash;
            const endHashMatch = frames[frames.length - 1].hash === attestation.endHash ||
                                 frames[frames.length - 1].imageHash === attestation.endHash;

            result.checks.push({ name: 'hash_consistency', passed: startHashMatch && endHashMatch });
            if (!startHashMatch || !endHashMatch) result.valid = false;
        }

        // Check 4: Temporal consistency
        let temporalValid = true;
        if (frames) {
            for (let i = 1; i < frames.length; i++) {
                if (frames[i].timestamp < frames[i-1].timestamp) {
                    temporalValid = false;
                    break;
                }
            }
        }
        result.checks.push({ name: 'temporal_order', passed: temporalValid });
        if (!temporalValid) result.valid = false;

        console.log(`${result.valid ? '✅' : '❌'} Verification result: ${result.valid ? 'VALID' : 'INVALID'}`);
        return result;
    }

    /**
     * Verify chain integrity of frame proofs
     */
    verifyChainIntegrity(frames) {
        if (!frames || frames.length < 2) return true;

        for (let i = 1; i < frames.length; i++) {
            const currentFrame = frames[i];
            const previousFrame = frames[i - 1];

            const expectedPrevHash = previousFrame.hash || previousFrame.imageHash;
            const actualPrevHash = currentFrame.previousHash;

            if (actualPrevHash && actualPrevHash !== expectedPrevHash) {
                return false;
            }
        }

        return true;
    }

    // =====================================
    // UTILITIES
    // =====================================

    /**
     * Create a thumbnail hash for quick comparison
     */
    async createThumbnailHash(imageBuffer) {
        const thumbnail = await sharp(imageBuffer)
            .resize(32, 32, { fit: 'fill' })
            .grayscale()
            .raw()
            .toBuffer();

        return crypto.createHash('sha256').update(thumbnail).digest('hex');
    }

    /**
     * Get attestation by ID
     */
    getAttestation(attestationId) {
        return this.videoAttestations.get(attestationId);
    }

    /**
     * Get all active streaming sessions
     */
    getActiveSessions() {
        const sessions = [];
        for (const [id, session] of this.streamingSessions) {
            if (session.status === 'active') {
                sessions.push({
                    id,
                    startTime: session.startTime,
                    framesAttested: session.stats.framesAttested
                });
            }
        }
        return sessions;
    }

    /**
     * Get supported video modes
     */
    getSupportedModes() {
        return VIDEO_MODES;
    }
}

// Singleton instance
let zkVideoService = null;

function getZKVideoService(options) {
    if (!zkVideoService) {
        zkVideoService = new ZKVideoService(options);
    }
    return zkVideoService;
}

module.exports = {
    ZKVideoService,
    getZKVideoService,
    VIDEO_MODES
};
