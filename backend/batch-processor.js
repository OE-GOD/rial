/**
 * ZK-IMG Batch Processing System
 * Process multiple images simultaneously with parallel ZK proof generation
 */

const fs = require('fs').promises;
const path = require('path');
const { applyTransformations } = require('./image-transformer');
const { generateProofsForSteps } = require('./zk/proof-service');
const { models } = require('./src/database');
const { recordZKProofMetrics, recordImageProcessing, recordFraudDetection } = require('./src/monitoring');

class BatchProcessor {
    constructor(options = {}) {
        this.maxConcurrent = options.maxConcurrent || 5; // Process 5 images simultaneously
        this.maxRetries = options.maxRetries || 3;
        this.timeout = options.timeout || 300000; // 5 minutes per image
        this.results = {
            total: 0,
            successful: 0,
            failed: 0,
            skipped: 0,
            startTime: null,
            endTime: null,
            items: []
        };
    }

    /**
     * Process a batch of images
     * @param {Array} batch - Array of batch items
     * @param {Object} options - Processing options
     */
    async processBatch(batch, options = {}) {
        console.log(`🔄 Starting batch processing of ${batch.length} items`);
        console.log(`   Max concurrent: ${this.maxConcurrent}`);
        console.log(`   Timeout per item: ${this.timeout / 1000}s`);

        this.results.startTime = Date.now();
        this.results.total = batch.length;

        try {
            // Process items in chunks for concurrency control
            const chunks = this.chunkArray(batch, this.maxConcurrent);
            let processedCount = 0;

            for (const chunk of chunks) {
                console.log(`📦 Processing chunk ${Math.floor(processedCount / this.maxConcurrent) + 1}/${chunks.length}`);

                // Process chunk concurrently
                const promises = chunk.map((item, index) =>
                    this.processBatchItem(item, processedCount + index, options)
                );

                const results = await Promise.allSettled(promises);

                // Update results
                results.forEach((result, index) => {
                    const itemIndex = processedCount + index;
                    if (result.status === 'fulfilled') {
                        this.results.successful++;
                        this.results.items[itemIndex] = {
                            ...result.value,
                            status: 'completed'
                        };
                    } else {
                        this.results.failed++;
                        this.results.items[itemIndex] = {
                            id: batch[itemIndex].id,
                            error: result.reason.message,
                            status: 'failed'
                        };
                    }
                });

                processedCount += chunk.length;
            }

        } catch (error) {
            console.error('❌ Batch processing failed:', error);
            this.results.error = error.message;
        }

        this.results.endTime = Date.now();
        this.generateBatchReport();

        return this.results;
    }

    /**
     * Process a single batch item with retry logic
     */
    async processBatchItem(item, index, options) {
        const startTime = Date.now();
        let lastError = null;

        for (let attempt = 1; attempt <= this.maxRetries; attempt++) {
            try {
                console.log(`   🔄 Processing item ${index + 1}/${this.results.total} (attempt ${attempt}/${this.maxRetries})`);

                const result = await this.processSingleItem(item, options);

                const processingTime = Date.now() - startTime;

                // Record metrics
                if (result.zkProofs && result.zkProofs.length > 0) {
                    const proof = result.zkProofs[0];
                    await recordZKProofMetrics(
                        proof.provingSystem || 'snarkjs',
                        proof.type || 'unknown',
                        proof.performance?.generation_time_ms || 0,
                        true
                    );
                }

                await recordImageProcessing(
                    result.transformations?.length > 0,
                    result.zkProofs?.length > 0
                );

                return {
                    ...result,
                    processingTime,
                    attempts: attempt
                };

            } catch (error) {
                lastError = error;
                console.warn(`   ⚠️  Attempt ${attempt} failed for item ${index + 1}: ${error.message}`);

                if (attempt < this.maxRetries) {
                    // Wait before retry (exponential backoff)
                    await this.sleep(Math.pow(2, attempt) * 1000);
                }
            }
        }

        // All retries failed
        throw new Error(`Failed after ${this.maxRetries} attempts: ${lastError.message}`);
    }

    /**
     * Process a single item
     */
    async processSingleItem(item, options) {
        const {
            id,
            imageBuffer,
            transformations = [],
            metadata = {},
            userId,
            priority = 'normal'
        } = item;

        // Validate input
        if (!imageBuffer || imageBuffer.length === 0) {
            throw new Error('Invalid image buffer');
        }

        // Apply transformations
        console.log(`     🖼️  Applying ${transformations.length} transformations`);
        const transformResult = await applyTransformations(imageBuffer, transformations);

        // Generate ZK proofs if requested
        let zkProofs = null;
        if (options.generateZKProofs !== false && transformResult.steps.length > 0) {
            console.log(`     🔐 Generating ZK proofs for ${transformResult.steps.length} steps`);
            zkProofs = await generateProofsForSteps(transformResult.finalBuffer, transformResult.steps, {
                persist: options.persist !== false,
                useHalo2: options.useHalo2
            });
        }

        // Calculate authenticity score (simplified)
        const authenticityScore = this.calculateAuthenticityScore(transformations, metadata);

        // Detect potential fraud
        const fraudDetected = this.detectFraud(transformations, metadata);
        if (fraudDetected) {
            await recordFraudDetection('batch_processing_anomaly', 0.8);
        }

        // Save to database if available
        let dbRecord = null;
        if (models.CertifiedImages) {
            const certifiedImages = new models.CertifiedImages();
            dbRecord = await certifiedImages.create({
                userId,
                imageHash: this.calculateHash(transformResult.finalBuffer),
                imageUrl: `/uploads/batch-${id}-${Date.now()}.jpg`,
                fileSizeBytes: transformResult.finalBuffer.length,
                dimensions: await this.getImageDimensions(transformResult.finalBuffer),
                c2paClaim: metadata.c2paClaim,
                merkleRoot: metadata.merkleRoot,
                signature: metadata.signature,
                zkProofs,
                provingSystem: options.useHalo2 ? 'halo2' : 'snarkjs',
                proofPerformance: zkProofs?.[0]?.performance,
                cameraInfo: metadata.cameraInfo,
                gpsLocation: metadata.gpsLocation,
                motionData: metadata.motionData,
                temporalData: metadata.temporalData,
                deviceFingerprint: metadata.deviceFingerprint,
                authenticityScore,
                fraudProbability: fraudDetected ? 0.8 : 0.02
            });
        }

        return {
            id,
            originalSize: imageBuffer.length,
            processedSize: transformResult.finalBuffer.length,
            transformations: transformations.length,
            zkProofsCount: zkProofs?.length || 0,
            authenticityScore,
            fraudDetected,
            dbRecord,
            finalBuffer: options.includeBuffer ? transformResult.finalBuffer : undefined
        };
    }

    /**
     * Calculate authenticity score based on transformations and metadata
     */
    calculateAuthenticityScore(transformations, metadata) {
        let score = 0.5; // Base score

        // Real camera metadata increases score
        if (metadata.cameraInfo) score += 0.2;
        if (metadata.gpsLocation) score += 0.1;
        if (metadata.motionData) score += 0.1;
        if (metadata.deviceFingerprint) score += 0.1;

        // Multiple transformations suggest real editing
        if (transformations.length > 1) score += 0.1;
        if (transformations.length > 3) score += 0.1;

        // ZK proofs increase score
        if (metadata.hasZKProofs) score += 0.2;

        return Math.min(1.0, Math.max(0.0, score));
    }

    /**
     * Detect potential fraud patterns
     */
    detectFraud(transformations, metadata) {
        // Simple fraud detection heuristics
        const fraudIndicators = [];

        // Too many identical transformations
        const transformTypes = transformations.map(t => Object.keys(t)[0]);
        const uniqueTransforms = new Set(transformTypes);
        if (uniqueTransforms.size === 1 && transformations.length > 5) {
            fraudIndicators.push('repeated_identical_transforms');
        }

        // Suspicious metadata patterns
        if (metadata.cameraInfo && !metadata.motionData) {
            fraudIndicators.push('camera_without_motion');
        }

        // GPS spoofing indicators
        if (metadata.gpsLocation && metadata.gpsLocation.accuracy > 1000) {
            fraudIndicators.push('low_gps_accuracy');
        }

        return fraudIndicators.length > 0;
    }

    /**
     * Calculate SHA-256 hash of buffer
     */
    calculateHash(buffer) {
        const crypto = require('crypto');
        return crypto.createHash('sha256').update(buffer).digest('hex');
    }

    /**
     * Get image dimensions
     */
    async getImageDimensions(buffer) {
        const sharp = require('sharp');
        const metadata = await sharp(buffer).metadata();
        return {
            width: metadata.width,
            height: metadata.height
        };
    }

    /**
     * Split array into chunks
     */
    chunkArray(array, chunkSize) {
        const chunks = [];
        for (let i = 0; i < array.length; i += chunkSize) {
            chunks.push(array.slice(i, i + chunkSize));
        }
        return chunks;
    }

    /**
     * Sleep utility
     */
    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    /**
     * Generate comprehensive batch processing report
     */
    generateBatchReport() {
        const duration = this.results.endTime - this.results.startTime;
        const avgTimePerItem = duration / this.results.total;

        console.log('\n📊 BATCH PROCESSING REPORT');
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        console.log(`Total Items: ${this.results.total}`);
        console.log(`Successful: ${this.results.successful}`);
        console.log(`Failed: ${this.results.failed}`);
        console.log(`Skipped: ${this.results.skipped}`);
        console.log(`Success Rate: ${((this.results.successful / this.results.total) * 100).toFixed(1)}%`);
        console.log(`Total Time: ${(duration / 1000).toFixed(1)}s`);
        console.log(`Average Time per Item: ${avgTimePerItem.toFixed(0)}ms`);
        console.log(`Throughput: ${(this.results.total / (duration / 1000)).toFixed(1)} items/sec`);

        // Performance breakdown
        if (this.results.items.length > 0) {
            const successfulItems = this.results.items.filter(item => item.status === 'completed');

            if (successfulItems.length > 0) {
                const avgTransformations = successfulItems.reduce((sum, item) => sum + item.transformations, 0) / successfulItems.length;
                const avgZKProofs = successfulItems.reduce((sum, item) => sum + item.zkProofsCount, 0) / successfulItems.length;
                const avgAuthenticity = successfulItems.reduce((sum, item) => sum + item.authenticityScore, 0) / successfulItems.length;

                console.log(`\n📈 Average Metrics:`);
                console.log(`   Transformations per Image: ${avgTransformations.toFixed(1)}`);
                console.log(`   ZK Proofs per Image: ${avgZKProofs.toFixed(1)}`);
                console.log(`   Authenticity Score: ${(avgAuthenticity * 100).toFixed(1)}%`);

                const fraudCount = successfulItems.filter(item => item.fraudDetected).length;
                console.log(`   Fraud Detected: ${fraudCount} items (${((fraudCount / successfulItems.length) * 100).toFixed(1)}%)`);
            }
        }

        // Save detailed report
        const reportPath = path.join(__dirname, `batch-report-${Date.now()}.json`);
        fs.writeFile(reportPath, JSON.stringify(this.results, null, 2))
            .then(() => console.log(`\n📄 Detailed report saved: ${reportPath}`))
            .catch(err => console.error('Failed to save report:', err.message));
    }
}

// Export for use in other modules
module.exports = BatchProcessor;

// Example usage and CLI
if (require.main === module) {
    // CLI usage for testing
    const args = process.argv.slice(2);

    if (args.length === 0) {
        console.log('Usage: node batch-processor.js <image-dir> [options]');
        console.log('Options:');
        console.log('  --halo2          Use Halo2 proofs');
        console.log('  --concurrent=N   Max concurrent processing (default: 5)');
        console.log('  --transform      Apply sample transformations');
        process.exit(1);
    }

    const imageDir = args[0];
    const options = {
        useHalo2: args.includes('--halo2'),
        maxConcurrent: args.find(arg => arg.startsWith('--concurrent='))?.split('=')[1] || 5,
        applyTransforms: args.includes('--transform')
    };

    // Create test batch from directory
    fs.readdir(imageDir).then(async (files) => {
        const imageFiles = files.filter(f => f.match(/\.(jpg|jpeg|png)$/i)).slice(0, 10); // Limit to 10 for testing

        const batch = imageFiles.map((filename, index) => ({
            id: `test-${index}`,
            imageBuffer: fs.readFile(path.join(imageDir, filename)),
            transformations: options.applyTransforms ? [
                { Crop: { x: 10, y: 10, width: 100, height: 100 } },
                { Resize: { width: 64, height: 64 } },
                { Grayscale: true }
            ] : [],
            metadata: {
                cameraInfo: { model: 'Test Camera', make: 'Test' },
                gpsLocation: { lat: 37.7749, lng: -122.4194, accuracy: 5 },
                motionData: { accelerometer: [0.1, 0.2, 0.3] }
            }
        }));

        // Resolve all image buffers
        const resolvedBatch = await Promise.all(
            batch.map(async item => ({
                ...item,
                imageBuffer: await item.imageBuffer
            }))
        );

        // Process batch
        const processor = new BatchProcessor({
            maxConcurrent: parseInt(options.maxConcurrent)
        });

        const results = await processor.processBatch(resolvedBatch, {
            generateZKProofs: true,
            useHalo2: options.useHalo2,
            persist: false
        });

        console.log('\n🎉 Batch processing completed!');
        console.log(`Processed ${results.successful}/${results.total} images successfully`);

    }).catch(error => {
        console.error('❌ Batch processing failed:', error.message);
        process.exit(1);
    });
}
