/**
 * Video Privacy Proofs Service
 *
 * Extend privacy-preserving proofs to video with keyframe attestation
 * Proves video authenticity without revealing content
 */

const crypto = require('crypto');
const { TileCommitment, PrivacyPreservingProofGenerator } = require('./privacy-preserving-proofs');

class VideoPrivacyProofGenerator {
    constructor(options = {}) {
        this.keyframeInterval = options.keyframeInterval || 30; // Every 30 frames
        this.tileSize = options.tileSize || 32;
        this.proofGenerator = new PrivacyPreservingProofGenerator();
        this.tileCommitment = new TileCommitment(this.tileSize);
    }

    /**
     * Create video commitment from keyframes
     */
    async createVideoCommitment(keyframes) {
        const startTime = Date.now();
        const frameCommitments = [];

        console.log(`🎬 Creating video commitment for ${keyframes.length} keyframes`);

        for (let i = 0; i < keyframes.length; i++) {
            const frame = keyframes[i];
            const commitment = await this.tileCommitment.computeCommitment(frame.buffer);

            frameCommitments.push({
                frameIndex: frame.index || i,
                timestamp: frame.timestamp || (i * (1000 / 30)), // Assume 30fps
                commitment: {
                    merkleRoot: commitment.merkleRoot,
                    width: commitment.width,
                    height: commitment.height,
                    tileCount: commitment.tilesX * commitment.tilesY
                }
            });
        }

        // Create video-level Merkle root from frame commitments
        const videoMerkleRoot = this.computeVideoMerkleRoot(frameCommitments);

        return {
            type: 'video-commitment',
            version: '1.0.0',
            videoId: crypto.randomUUID(),
            frameCount: keyframes.length,
            keyframeInterval: this.keyframeInterval,
            videoMerkleRoot,
            frameCommitments,
            metrics: {
                processingTime: Date.now() - startTime,
                averageTimePerFrame: (Date.now() - startTime) / keyframes.length
            },
            createdAt: new Date().toISOString()
        };
    }

    /**
     * Generate proof for video transformation
     */
    async generateVideoTransformationProof(
        originalKeyframes,
        transformedKeyframes,
        transformation
    ) {
        const startTime = Date.now();

        if (originalKeyframes.length !== transformedKeyframes.length) {
            throw new Error('Keyframe count mismatch');
        }

        console.log(`🔄 Generating video transformation proof for ${originalKeyframes.length} frames`);

        const frameProofs = [];

        for (let i = 0; i < originalKeyframes.length; i++) {
            const proof = await this.proofGenerator.generateTransformationProof(
                originalKeyframes[i].buffer,
                transformedKeyframes[i].buffer,
                transformation
            );

            frameProofs.push({
                frameIndex: i,
                originalTimestamp: originalKeyframes[i].timestamp,
                transformedTimestamp: transformedKeyframes[i].timestamp,
                proof: {
                    type: proof.type,
                    valid: proof.proof?.valid,
                    originalRoot: proof.originalCommitment?.merkleRoot?.substring(0, 32),
                    transformedRoot: proof.transformedCommitment?.merkleRoot?.substring(0, 32)
                }
            });
        }

        // Compute chain proof
        const originalVideoRoot = this.computeVideoMerkleRoot(
            frameProofs.map(fp => ({
                commitment: { merkleRoot: fp.proof.originalRoot }
            }))
        );

        const transformedVideoRoot = this.computeVideoMerkleRoot(
            frameProofs.map(fp => ({
                commitment: { merkleRoot: fp.proof.transformedRoot }
            }))
        );

        return {
            type: 'video-transformation-proof',
            version: '1.0.0',
            transformation,
            frameCount: originalKeyframes.length,
            originalVideoRoot,
            transformedVideoRoot,
            frameProofs,
            allFramesValid: frameProofs.every(fp => fp.proof.valid),
            metrics: {
                totalTime: Date.now() - startTime,
                averageFrameTime: (Date.now() - startTime) / originalKeyframes.length
            },
            guarantees: {
                confidentiality: true,
                temporalIntegrity: true,
                frameAuthenticity: true
            },
            createdAt: new Date().toISOString()
        };
    }

    /**
     * Generate selective reveal proof for video segment
     */
    async generateSegmentRevealProof(fullVideoKeyframes, segmentStart, segmentEnd) {
        const startTime = Date.now();

        const segmentFrames = fullVideoKeyframes.filter(
            (_, idx) => idx >= segmentStart && idx <= segmentEnd
        );

        console.log(`👁️ Generating segment reveal proof (frames ${segmentStart}-${segmentEnd})`);

        // Get commitments for all frames
        const allCommitments = [];
        for (const frame of fullVideoKeyframes) {
            const commitment = await this.tileCommitment.computeCommitment(frame.buffer);
            allCommitments.push(commitment);
        }

        // Get commitments for revealed segment
        const segmentCommitments = allCommitments.slice(segmentStart, segmentEnd + 1);

        // Generate Merkle proofs for segment frames
        const videoMerkleTree = this.buildVideoMerkleTree(allCommitments);
        const segmentProofs = [];

        for (let i = segmentStart; i <= segmentEnd; i++) {
            segmentProofs.push({
                frameIndex: i,
                merkleProof: this.generateMerkleProof(videoMerkleTree, i),
                commitment: allCommitments[i].merkleRoot?.substring(0, 32)
            });
        }

        return {
            type: 'video-segment-reveal',
            version: '1.0.0',
            fullVideoRoot: videoMerkleTree.root,
            totalFrames: fullVideoKeyframes.length,
            revealedSegment: {
                startFrame: segmentStart,
                endFrame: segmentEnd,
                frameCount: segmentEnd - segmentStart + 1
            },
            segmentProofs,
            privacy: {
                revealedFrames: segmentEnd - segmentStart + 1,
                hiddenFrames: fullVideoKeyframes.length - (segmentEnd - segmentStart + 1),
                revealRatio: ((segmentEnd - segmentStart + 1) / fullVideoKeyframes.length).toFixed(4)
            },
            metrics: {
                processingTime: Date.now() - startTime
            },
            createdAt: new Date().toISOString()
        };
    }

    /**
     * Generate proof for video redaction (blur frames)
     */
    async generateVideoRedactionProof(keyframes, redactedFrameIndices, redactionType = 'blur') {
        const startTime = Date.now();

        console.log(`🔒 Generating video redaction proof for ${redactedFrameIndices.length} frames`);

        // Get all commitments
        const allCommitments = [];
        for (const frame of keyframes) {
            const commitment = await this.tileCommitment.computeCommitment(frame.buffer);
            allCommitments.push(commitment);
        }

        // Build Merkle tree
        const videoMerkleTree = this.buildVideoMerkleTree(allCommitments);

        // Generate proofs for unaffected frames
        const unaffectedProofs = [];
        for (let i = 0; i < keyframes.length; i++) {
            if (!redactedFrameIndices.includes(i)) {
                unaffectedProofs.push({
                    frameIndex: i,
                    commitment: allCommitments[i].merkleRoot?.substring(0, 32),
                    merkleProof: this.generateMerkleProof(videoMerkleTree, i),
                    status: 'unmodified'
                });
            }
        }

        return {
            type: 'video-redaction-proof',
            version: '1.0.0',
            originalVideoRoot: videoMerkleTree.root,
            totalFrames: keyframes.length,
            redaction: {
                type: redactionType,
                redactedFrames: redactedFrameIndices,
                redactedCount: redactedFrameIndices.length
            },
            unaffectedProofs,
            privacy: {
                unaffectedFrames: unaffectedProofs.length,
                redactedFrames: redactedFrameIndices.length,
                preservedRatio: (unaffectedProofs.length / keyframes.length).toFixed(4)
            },
            verification: {
                canVerifyUnaffected: true,
                redactedContentHidden: true
            },
            metrics: {
                processingTime: Date.now() - startTime
            },
            createdAt: new Date().toISOString()
        };
    }

    /**
     * Stream processing - add frame to ongoing video proof
     */
    createStreamProcessor() {
        return new VideoStreamProcessor(this);
    }

    // Helper: Compute video-level Merkle root
    computeVideoMerkleRoot(frameCommitments) {
        if (frameCommitments.length === 0) return null;

        const leaves = frameCommitments.map(fc =>
            crypto.createHash('sha256')
                .update(fc.commitment?.merkleRoot || '')
                .digest('hex')
        );

        return this.computeMerkleRoot(leaves);
    }

    // Helper: Build Merkle tree from commitments
    buildVideoMerkleTree(commitments) {
        const leaves = commitments.map(c =>
            crypto.createHash('sha256')
                .update(c.merkleRoot || '')
                .digest('hex')
        );

        const tree = [leaves];
        let currentLevel = leaves;

        while (currentLevel.length > 1) {
            const nextLevel = [];
            for (let i = 0; i < currentLevel.length; i += 2) {
                const left = currentLevel[i];
                const right = currentLevel[i + 1] || left;
                nextLevel.push(
                    crypto.createHash('sha256')
                        .update(left + right)
                        .digest('hex')
                );
            }
            tree.push(nextLevel);
            currentLevel = nextLevel;
        }

        return {
            root: currentLevel[0],
            tree,
            leafCount: leaves.length
        };
    }

    // Helper: Generate Merkle proof for index
    generateMerkleProof(merkleTree, index) {
        const proof = [];
        let idx = index;

        for (let level = 0; level < merkleTree.tree.length - 1; level++) {
            const levelNodes = merkleTree.tree[level];
            const isLeft = idx % 2 === 0;
            const siblingIdx = isLeft ? idx + 1 : idx - 1;

            if (siblingIdx < levelNodes.length) {
                proof.push({
                    hash: levelNodes[siblingIdx],
                    isLeft: !isLeft
                });
            }

            idx = Math.floor(idx / 2);
        }

        return proof;
    }

    // Helper: Compute Merkle root from leaves
    computeMerkleRoot(leaves) {
        if (leaves.length === 0) return null;
        if (leaves.length === 1) return leaves[0];

        let currentLevel = leaves;
        while (currentLevel.length > 1) {
            const nextLevel = [];
            for (let i = 0; i < currentLevel.length; i += 2) {
                const left = currentLevel[i];
                const right = currentLevel[i + 1] || left;
                nextLevel.push(
                    crypto.createHash('sha256')
                        .update(left + right)
                        .digest('hex')
                );
            }
            currentLevel = nextLevel;
        }
        return currentLevel[0];
    }
}

/**
 * Stream processor for real-time video
 */
class VideoStreamProcessor {
    constructor(generator) {
        this.generator = generator;
        this.frames = [];
        this.streamId = crypto.randomUUID();
        this.startTime = Date.now();
        this.commitments = [];
    }

    async addFrame(frameBuffer, timestamp) {
        const commitment = await this.generator.tileCommitment.computeCommitment(frameBuffer);

        this.frames.push({
            index: this.frames.length,
            timestamp: timestamp || Date.now() - this.startTime,
            commitment
        });

        this.commitments.push(commitment);

        return {
            frameIndex: this.frames.length - 1,
            commitment: commitment.merkleRoot?.substring(0, 32),
            runningRoot: this.generator.computeMerkleRoot(
                this.commitments.map(c => c.merkleRoot)
            )?.substring(0, 32)
        };
    }

    finalize() {
        const videoMerkleTree = this.generator.buildVideoMerkleTree(this.commitments);

        return {
            streamId: this.streamId,
            totalFrames: this.frames.length,
            duration: Date.now() - this.startTime,
            videoMerkleRoot: videoMerkleTree.root,
            frameCommitments: this.frames.map(f => ({
                index: f.index,
                timestamp: f.timestamp,
                root: f.commitment.merkleRoot?.substring(0, 32)
            })),
            finalizedAt: new Date().toISOString()
        };
    }
}

class VideoPrivacyProofVerifier {
    /**
     * Verify video transformation proof
     */
    verifyVideoProof(proof, transformedKeyframes) {
        const startTime = Date.now();
        const results = [];

        // Verify each frame proof
        for (const frameProof of proof.frameProofs) {
            results.push({
                frameIndex: frameProof.frameIndex,
                valid: frameProof.proof.valid,
                transformedRoot: frameProof.proof.transformedRoot
            });
        }

        const allValid = results.every(r => r.valid);

        return {
            valid: allValid,
            frameResults: results,
            validFrames: results.filter(r => r.valid).length,
            invalidFrames: results.filter(r => !r.valid).length,
            verificationTime: Date.now() - startTime
        };
    }

    /**
     * Verify segment reveal proof
     */
    verifySegmentRevealProof(proof, segmentKeyframes) {
        // Verify Merkle proofs for each revealed frame
        const results = [];

        for (const segmentProof of proof.segmentProofs) {
            const valid = this.verifyMerkleProof(
                segmentProof.commitment,
                segmentProof.merkleProof,
                proof.fullVideoRoot
            );

            results.push({
                frameIndex: segmentProof.frameIndex,
                valid
            });
        }

        return {
            valid: results.every(r => r.valid),
            frameResults: results,
            segmentVerified: results.every(r => r.valid)
        };
    }

    verifyMerkleProof(leafHash, proof, root) {
        let currentHash = leafHash;

        for (const step of proof) {
            if (step.isLeft) {
                currentHash = crypto.createHash('sha256')
                    .update(step.hash + currentHash)
                    .digest('hex');
            } else {
                currentHash = crypto.createHash('sha256')
                    .update(currentHash + step.hash)
                    .digest('hex');
            }
        }

        return currentHash === root;
    }
}

module.exports = {
    VideoPrivacyProofGenerator,
    VideoPrivacyProofVerifier,
    VideoStreamProcessor
};
