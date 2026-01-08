/**
 * Batch Privacy Proofs Service
 *
 * Process multiple images in parallel with privacy-preserving proofs
 * Optimized for high throughput with worker pool
 */

const { PrivacyPreservingProofGenerator, PrivacyPreservingVerifier } = require('./privacy-preserving-proofs');
const { FastFraudDetector } = require('./advanced-privacy-features');
const crypto = require('crypto');

class BatchPrivacyProofProcessor {
    constructor(options = {}) {
        this.maxConcurrent = options.maxConcurrent || 4;
        this.proofGenerator = new PrivacyPreservingProofGenerator();
        this.verifier = new PrivacyPreservingVerifier();
        this.fraudDetector = new FastFraudDetector();
        this.processingQueue = [];
        this.results = new Map();
    }

    /**
     * Process multiple images with commitments
     */
    async batchCommit(images) {
        const startTime = Date.now();
        const results = [];
        const batchId = crypto.randomUUID();

        console.log(`📦 Starting batch commit for ${images.length} images (batch: ${batchId})`);

        // Process in chunks for memory efficiency
        const chunks = this.chunkArray(images, this.maxConcurrent);

        for (const chunk of chunks) {
            const chunkResults = await Promise.all(
                chunk.map(async (image, idx) => {
                    try {
                        const commitment = await this.proofGenerator.createCommitment(image.buffer);
                        return {
                            index: image.index || idx,
                            filename: image.filename,
                            success: true,
                            commitmentId: crypto.randomUUID(),
                            commitment: {
                                merkleRoot: commitment.merkleRoot,
                                width: commitment.width,
                                height: commitment.height,
                                tileSize: commitment.tileSize,
                                totalTiles: commitment.tilesX * commitment.tilesY
                            }
                        };
                    } catch (error) {
                        return {
                            index: image.index || idx,
                            filename: image.filename,
                            success: false,
                            error: error.message
                        };
                    }
                })
            );
            results.push(...chunkResults);
        }

        const successful = results.filter(r => r.success).length;
        const failed = results.filter(r => !r.success).length;

        return {
            success: true,
            batchId,
            totalImages: images.length,
            successful,
            failed,
            processingTime: Date.now() - startTime,
            throughput: `${(images.length / ((Date.now() - startTime) / 1000)).toFixed(2)} images/sec`,
            results
        };
    }

    /**
     * Batch transform multiple images with proofs
     */
    async batchTransform(items) {
        const startTime = Date.now();
        const results = [];
        const batchId = crypto.randomUUID();

        console.log(`🔄 Starting batch transform for ${items.length} items (batch: ${batchId})`);

        const chunks = this.chunkArray(items, this.maxConcurrent);

        for (const chunk of chunks) {
            const chunkResults = await Promise.all(
                chunk.map(async (item) => {
                    try {
                        const proof = await this.proofGenerator.generateTransformationProof(
                            item.originalBuffer,
                            item.transformedBuffer,
                            item.transformation
                        );
                        return {
                            index: item.index,
                            filename: item.filename,
                            success: true,
                            transformation: item.transformation.type,
                            proof: {
                                type: proof.type,
                                originalRoot: proof.originalCommitment?.merkleRoot?.substring(0, 20) + '...',
                                transformedRoot: proof.transformedCommitment?.merkleRoot?.substring(0, 20) + '...',
                                valid: proof.proof?.valid
                            },
                            metrics: proof.metrics
                        };
                    } catch (error) {
                        return {
                            index: item.index,
                            filename: item.filename,
                            success: false,
                            error: error.message
                        };
                    }
                })
            );
            results.push(...chunkResults);
        }

        const successful = results.filter(r => r.success).length;

        return {
            success: true,
            batchId,
            totalItems: items.length,
            successful,
            failed: items.length - successful,
            processingTime: Date.now() - startTime,
            averageProofTime: `${(Date.now() - startTime) / items.length}ms`,
            results
        };
    }

    /**
     * Batch verify multiple proofs
     */
    async batchVerify(proofs) {
        const startTime = Date.now();
        const results = [];
        const batchId = crypto.randomUUID();

        console.log(`🔍 Starting batch verify for ${proofs.length} proofs (batch: ${batchId})`);

        // First do quick fraud checks (sub-millisecond)
        const fraudResults = proofs.map((proof, idx) => ({
            index: idx,
            ...this.fraudDetector.quickCheck(proof)
        }));

        const potentiallyValid = fraudResults.filter(r => !r.fraudDetected);
        const definitelyFraud = fraudResults.filter(r => r.fraudDetected);

        // Full verification only for potentially valid proofs
        const chunks = this.chunkArray(potentiallyValid, this.maxConcurrent);

        for (const chunk of chunks) {
            const chunkResults = await Promise.all(
                chunk.map(async (item) => {
                    try {
                        const proof = proofs[item.index];
                        const result = await this.verifier.verify(proof, null);
                        return {
                            index: item.index,
                            success: true,
                            valid: result.valid,
                            confidence: result.confidence,
                            verificationTime: result.verificationTime
                        };
                    } catch (error) {
                        return {
                            index: item.index,
                            success: false,
                            valid: false,
                            error: error.message
                        };
                    }
                })
            );
            results.push(...chunkResults);
        }

        // Add fraud results
        definitelyFraud.forEach(fraud => {
            results.push({
                index: fraud.index,
                success: true,
                valid: false,
                fraudDetected: true,
                reason: fraud.reason,
                quickCheckTime: fraud.checkTime
            });
        });

        // Sort by index
        results.sort((a, b) => a.index - b.index);

        const valid = results.filter(r => r.valid).length;

        return {
            success: true,
            batchId,
            totalProofs: proofs.length,
            valid,
            invalid: proofs.length - valid,
            fraudDetectedQuickly: definitelyFraud.length,
            processingTime: Date.now() - startTime,
            results
        };
    }

    /**
     * Batch selective reveal
     */
    async batchSelectiveReveal(items) {
        const startTime = Date.now();
        const results = [];
        const batchId = crypto.randomUUID();

        console.log(`👁️ Starting batch selective reveal for ${items.length} items`);

        const { SelectiveRevealProofGenerator } = require('./advanced-privacy-features');
        const selectiveReveal = new SelectiveRevealProofGenerator();

        const chunks = this.chunkArray(items, this.maxConcurrent);

        for (const chunk of chunks) {
            const chunkResults = await Promise.all(
                chunk.map(async (item) => {
                    try {
                        const result = await selectiveReveal.generateProof(
                            item.imageBuffer,
                            item.region
                        );
                        return {
                            index: item.index,
                            filename: item.filename,
                            success: true,
                            region: item.region,
                            revealRatio: result.proof?.proof?.revealRatio,
                            proofSize: JSON.stringify(result.proof).length
                        };
                    } catch (error) {
                        return {
                            index: item.index,
                            filename: item.filename,
                            success: false,
                            error: error.message
                        };
                    }
                })
            );
            results.push(...chunkResults);
        }

        return {
            success: true,
            batchId,
            totalItems: items.length,
            successful: results.filter(r => r.success).length,
            processingTime: Date.now() - startTime,
            results
        };
    }

    /**
     * Batch redaction
     */
    async batchRedact(items) {
        const startTime = Date.now();
        const results = [];
        const batchId = crypto.randomUUID();

        console.log(`🔒 Starting batch redaction for ${items.length} items`);

        const { RegionalPrivacyRedactor } = require('./advanced-privacy-features');
        const redactor = new RegionalPrivacyRedactor();

        const chunks = this.chunkArray(items, this.maxConcurrent);

        for (const chunk of chunks) {
            const chunkResults = await Promise.all(
                chunk.map(async (item) => {
                    try {
                        const result = await redactor.redact(
                            item.imageBuffer,
                            item.regions
                        );
                        return {
                            index: item.index,
                            filename: item.filename,
                            success: true,
                            regionsRedacted: item.regions.length,
                            preservedRatio: result.redactions?.preservedRatio
                        };
                    } catch (error) {
                        return {
                            index: item.index,
                            filename: item.filename,
                            success: false,
                            error: error.message
                        };
                    }
                })
            );
            results.push(...chunkResults);
        }

        return {
            success: true,
            batchId,
            totalItems: items.length,
            successful: results.filter(r => r.success).length,
            processingTime: Date.now() - startTime,
            results
        };
    }

    // Helper to chunk array
    chunkArray(array, size) {
        const chunks = [];
        for (let i = 0; i < array.length; i += size) {
            chunks.push(array.slice(i, i + size));
        }
        return chunks;
    }
}

module.exports = { BatchPrivacyProofProcessor };
