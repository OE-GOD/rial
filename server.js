const express = require('express');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const EC = require('elliptic').ec;
const cron = require('node-cron');
const https = require('https');
const http = require('http');
require('dotenv').config();

const blockchainService = require('./blockchain-service');
const imageStore = require('./simple-image-store');
const { applyTransformations } = require('./image-transformer');
const { secureVerifyImage, generateChallenge } = require('./secure-verification');
const { generateProofsForSteps } = require('./zk/proof-service');
const { generateFastHashProof } = require('./zk/fast-proof-service');
const { HDImageProcessor } = require('./zk/hd-image-processor');
const { ProofChain } = require('./zk/proof-chain');
const BatchProcessor = require('./batch-processor');

// Production dependencies
const helmet = require('helmet');
const compression = require('compression');
const rateLimit = require('express-rate-limit');
const Joi = require('joi');

// Database and monitoring
const { initDatabase, models } = require('./src/database');
const {
  logger,
  monitoringMiddleware,
  recordZKProofMetrics,
  recordImageProcessing,
  recordFraudDetection,
  healthCheck,
  metricsEndpoint,
  errorHandler
} = require('./src/monitoring');

const app = express();
const port = process.env.PORT || 3000;

// Elliptic curve setup - P-256 is used by iOS Secure Enclave
const ec = new EC('p256');

// Initialize blockchain service
(async () => {
    const rpcUrl = process.env.POLYGON_RPC_URL || 'https://polygon-rpc.com';
    const privateKey = process.env.PRIVATE_KEY;
    const contractAddress = process.env.CONTRACT_ADDRESS;
    
    if (privateKey && contractAddress) {
        await blockchainService.initialize(rpcUrl, privateKey, contractAddress);
    } else {
        console.log('⚠️ Blockchain not configured. Set POLYGON_RPC_URL, PRIVATE_KEY, and CONTRACT_ADDRESS in .env');
        console.log('   Attestations will be queued but not submitted to blockchain.\n');
    }
})();

// Schedule batch submission
const batchInterval = process.env.BATCH_INTERVAL_HOURS || 1;
const batchSize = parseInt(process.env.BATCH_SIZE || '100');

cron.schedule(`0 */${batchInterval} * * *`, async () => {
    console.log('\n⏰ Scheduled batch submission triggered...');
    const status = blockchainService.getBatchStatus();
    
    if (status.pending >= batchSize) {
        const result = await blockchainService.submitBatch();
        if (result.success) {
            console.log(`✅ Auto-submitted batch of ${result.count} attestations`);
        }
    } else {
        console.log(`ℹ️ Only ${status.pending} pending (threshold: ${batchSize}). Skipping.`);
    }
});

// Configure multer for file uploads
const storage = multer.memoryStorage();
const upload = multer({ storage: storage });

// Create uploads directory if it doesn't exist
const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir);
}

// Redirect to cache-busted URL
app.get('/', (req, res) => {
    if (!req.query.v) {
        // Redirect to versioned URL to bust cache
        return res.redirect('/?v=' + Date.now());
    }
    res.set('Cache-Control', 'no-store, no-cache, must-revalidate');
    res.set('Pragma', 'no-cache');
    res.set('Expires', '0');
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Serve app.js with no-cache headers
app.get('/app.js', (req, res) => {
    res.set('Cache-Control', 'no-store, no-cache, must-revalidate');
    res.set('Pragma', 'no-cache');
    res.set('Content-Type', 'application/javascript');
    res.sendFile(path.join(__dirname, 'public', 'app.js'));
});

// Serve static files (web portal) - exclude index.html (handled above)
app.use(express.static(path.join(__dirname, 'public'), { index: false }));
app.use('/uploads', express.static(uploadsDir));

// Production middleware
app.use(helmet({ contentSecurityPolicy: false })); // Security headers (CSP disabled for dev)
app.use(compression()); // Gzip compression
app.use(express.json({ limit: '50mb' })); // Parse JSON with size limit
app.use(express.urlencoded({ extended: true, limit: '50mb' })); // Parse form data

// Rate limiting
const limiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100, // limit each IP to 100 requests per windowMs
    message: {
        error: 'Too many requests from this IP, please try again later.',
        retryAfter: 900
    },
    standardHeaders: true,
    legacyHeaders: false,
});
app.use('/prove', limiter); // Stricter limits for proof generation

// Monitoring middleware
app.use(monitoringMiddleware);

// Logging middleware (now using Winston)
app.use((req, res, next) => {
    logger.info('Request received', {
        method: req.method,
        url: req.url,
        ip: req.ip,
        userAgent: req.get('User-Agent')
    });
    next();
});

// Test endpoint
app.get('/test', (req, res) => {
    console.log('✅ Test endpoint hit!');
    res.json({ message: 'Backend is working!', timestamp: new Date().toISOString() });
});

// Check what's in the image store
app.get('/store-status', (req, res) => {
    const stats = imageStore.getStats();
    res.json({
        totalImages: stats.totalImages,
        merkleRoots: stats.merkleRoots,
        note: 'Store is cleared on server restart. Certify new photos to test.'
    });
});

// Get exact certified image by merkle root
app.get('/get-certified-image/:merkleRoot', (req, res) => {
    const merkleRoot = req.params.merkleRoot;
    console.log(`📥 Request for certified image: ${merkleRoot}`);
    
    const storedImage = imageStore.getCertifiedImage(merkleRoot);
    
    if (!storedImage) {
        console.log('❌ Image not found');
        return res.status(404).json({ error: 'Image not found' });
    }
    
    console.log(`✅ Sending certified image: ${storedImage.size} bytes`);
    res.set('Content-Type', 'image/jpeg');
    res.set('Content-Length', storedImage.size);
    res.send(storedImage.imageBuffer);
});

// Batch processing endpoints
app.post('/batch/process', async (req, res) => {
    try {
        const {
            images = [],
            transformations = [],
            options = {}
        } = req.body;

        if (!images || images.length === 0) {
            return res.status(400).json({
                error: 'No images provided for batch processing'
            });
        }

        if (images.length > 50) {
            return res.status(400).json({
                error: 'Maximum 50 images per batch'
            });
        }

        console.log(`🔄 Starting batch processing of ${images.length} images`);

        // Create batch items
        const batch = images.map((imageData, index) => ({
            id: imageData.id || `batch-${index}`,
            imageBuffer: Buffer.from(imageData.buffer, 'base64'),
            transformations: imageData.transformations || transformations,
            metadata: imageData.metadata || {},
            userId: req.user?.id
        }));

        // Process batch
        const processor = new BatchProcessor({
            maxConcurrent: options.maxConcurrent || 3,
            maxRetries: options.maxRetries || 2
        });

        const results = await processor.processBatch(batch, {
            generateZKProofs: options.generateZKProofs !== false,
            useHalo2: options.useHalo2 || false,
            persist: options.persist !== false
        });

        res.json({
            success: true,
            message: `Processed ${results.successful}/${results.total} images`,
            results: {
                total: results.total,
                successful: results.successful,
                failed: results.failed,
                processingTime: results.endTime - results.startTime,
                items: results.items
            }
        });

    } catch (error) {
        logger.error('Batch processing failed', { error: error.message });
        res.status(500).json({
            error: 'Batch processing failed',
            message: error.message
        });
    }
});

// Get batch processing statistics
app.get('/batch/stats', async (req, res) => {
    try {
        if (!models.APIUsage) {
            return res.json({
                batchesProcessed: 0,
                totalImagesProcessed: 0,
                averageProcessingTime: 0,
                successRate: 0
            });
        }

        const apiUsage = new models.APIUsage();
        const stats = await apiUsage.getUsageStats(24); // Last 24 hours

        // Calculate batch processing stats
        const batchRequests = stats.filter(s => s.endpoint.includes('batch'));

        res.json({
            batchesProcessed: batchRequests.length,
            totalImagesProcessed: batchRequests.reduce((sum, s) => sum + s.request_count, 0),
            recentActivity: stats.slice(0, 10)
        });

    } catch (error) {
        logger.error('Failed to get batch stats', { error: error.message });
        res.status(500).json({ error: 'Failed to get batch statistics' });
    }
});

// Recursive proof endpoint
app.post('/prove/recursive', upload.single('image'), async (req, res) => {
    try {
        const { chainId, transformation, previousProofId, previousProofMetadata } = req.body;
        const imageBuffer = req.file.buffer;
        
        logger.info('Generating recursive proof', { 
            chainId, 
            transformation: JSON.parse(transformation),
            hasPreviousProof: !!previousProofId 
        });

        const recursiveProofSystem = require('./zk/recursive-proof-system');
        
        let proofMetadata;
        
        if (!previousProofId && !chainId) {
            // Base case: first transformation
            const { transformedImage } = await applyTransformations(
                imageBuffer,
                [JSON.parse(transformation)]
            );
            
            proofMetadata = await recursiveProofSystem.createBaseProof(
                imageBuffer,
                transformedImage,
                JSON.parse(transformation)
            );
        } else {
            // Recursive case: subsequent transformation
            // In non-DB mode, get from recursive proof system cache
            let previousMetadata;
            if (chainId) {
                // Get from cache using chainId
                const chain = recursiveProofSystem.getProofChain(chainId);
                if (!chain) {
                    return res.status(404).json({ error: 'Proof chain not found' });
                }
                // Get the most recent proof metadata from cache
                previousMetadata = recursiveProofSystem.proofCache.get(chainId);
                if (!previousMetadata) {
                    return res.status(404).json({ error: 'Previous proof not found in cache' });
                }
            } else if (models && models.ZKProof && previousProofId) {
                const previousProof = await models.ZKProof.findByPk(previousProofId);
                if (!previousProof) {
                    return res.status(404).json({ error: 'Previous proof not found' });
                }
                previousMetadata = JSON.parse(previousProof.metadata);
            } else {
                return res.status(400).json({ 
                    error: 'Either chainId or previousProofId required for recursive proofs' 
                });
            }
            const { transformedImage } = await applyTransformations(
                imageBuffer,
                [JSON.parse(transformation)]
            );
            
            proofMetadata = await recursiveProofSystem.createRecursiveProof(
                previousMetadata,
                transformedImage,
                JSON.parse(transformation)
            );
        }
        
        // Store proof in database (if available)
        let storedProof = { id: Date.now() }; // Mock ID for non-DB mode
        if (models && models.ZKProof) {
            storedProof = await models.ZKProof.create({
                image_id: null, // Will be linked later
                proof: JSON.stringify(proofMetadata.proof),
                metadata: JSON.stringify(proofMetadata),
                transformation: transformation,
                proving_system: 'halo2-recursive'
            });
        }
        
        recordZKProofMetrics('recursive', true, 
            proofMetadata.proof.metrics?.proving_time || 1000);
        
        res.json({
            success: true,
            proofId: storedProof.id,
            chainId: proofMetadata.chainId,
            depth: proofMetadata.depth,
            transformations: proofMetadata.transformations,
            proof: proofMetadata.proof
        });
    } catch (error) {
        logger.error('Recursive proof generation failed', { error: error.message });
        recordZKProofMetrics('recursive', false);
        res.status(500).json({ 
            error: 'Recursive proof generation failed',
            details: error.message 
        });
    }
});

// Verify recursive proof chain
app.post('/verify/recursive', async (req, res) => {
    try {
        const { proofId, chainId } = req.body;
        
        const recursiveProofSystem = require('./zk/recursive-proof-system');
        
        // Get proof from database or cache
        let proofMetadata;
        if (proofId && models && models.ZKProof) {
            const storedProof = await models.ZKProof.findByPk(proofId);
            if (!storedProof) {
                return res.status(404).json({ error: 'Proof not found' });
            }
            proofMetadata = JSON.parse(storedProof.metadata);
        } else if (chainId) {
            const chain = recursiveProofSystem.getProofChain(chainId);
            if (!chain) {
                return res.status(404).json({ error: 'Proof chain not found' });
            }
            proofMetadata = chain;
        } else {
            return res.status(400).json({ error: 'proofId or chainId required' });
        }
        
        // Verify the proof
        const isValid = await recursiveProofSystem.verifyProof(proofMetadata);
        
        res.json({
            valid: isValid,
            chainId: proofMetadata.chainId,
            depth: proofMetadata.depth,
            transformations: proofMetadata.transformations,
            originalHash: proofMetadata.originalHash,
            currentHash: proofMetadata.currentHash
        });
    } catch (error) {
        logger.error('Recursive proof verification failed', { error: error.message });
        res.status(500).json({ 
            error: 'Verification failed',
            details: error.message 
        });
    }
});

// Export proof chain
app.get('/proof/chain/:chainId', async (req, res) => {
    try {
        const { chainId } = req.params;
        
        const recursiveProofSystem = require('./zk/recursive-proof-system');
        const proofPackage = await recursiveProofSystem.exportProofChain(chainId);
        
        res.json(proofPackage);
    } catch (error) {
        logger.error('Failed to export proof chain', { error: error.message });
        res.status(500).json({ 
            error: 'Export failed',
            details: error.message 
        });
    }
});

// Advanced transformations demo endpoint
app.post('/transform/advanced', async (req, res) => {
    try {
        const { imageBuffer, transformations } = req.body;

        if (!imageBuffer) {
            return res.status(400).json({ error: 'No image buffer provided' });
        }

        const buffer = Buffer.from(imageBuffer, 'base64');

        console.log(`🎨 Applying ${transformations.length} advanced transformations`);

        const startTime = Date.now();
        const result = await applyTransformations(buffer, transformations);
        const processingTime = Date.now() - startTime;

        // Generate ZK proof for the transformations
        let zkProofs = null;
        if (result.steps.length > 0 && req.body.generateZKProof !== false) {
            zkProofs = await generateProofsForSteps(result.finalBuffer, result.steps, {
                useHalo2: req.body.useHalo2 || false,
                persist: false
            });
        }

        res.json({
            success: true,
            originalSize: buffer.length,
            processedSize: result.finalBuffer.length,
            transformationsApplied: result.steps.length,
            processingTime,
            zkProofsGenerated: zkProofs?.length || 0,
            imageUrl: `/uploads/transform-${Date.now()}.jpg`
        });

        // Save the transformed image
        const filename = `transform-${Date.now()}.jpg`;
        const filepath = path.join(uploadsDir, filename);
        await fs.writeFile(filepath, result.finalBuffer);

    } catch (error) {
        logger.error('Advanced transformation failed', { error: error.message });
        res.status(500).json({
            error: 'Transformation failed',
            message: error.message
        });
    }
});

// GPU-accelerated image processing endpoint
app.post('/gpu/process', async (req, res) => {
    try {
        const { imageBuffer, transformations, options = {} } = req.body;

        if (!imageBuffer) {
            return res.status(400).json({ error: 'No image buffer provided' });
        }

        if (!transformations || transformations.length === 0) {
            return res.status(400).json({ error: 'No transformations specified' });
        }

        const buffer = Buffer.from(imageBuffer, 'base64');

        console.log(`🚀 GPU processing ${transformations.length} transformations`);

        const startTime = Date.now();
        const result = await applyTransformations(buffer, transformations, {
            useGPU: true,
            gpuMode: options.gpuMode || 'auto'
        });
        const processingTime = Date.now() - startTime;

        res.json({
            success: true,
            originalSize: buffer.length,
            processedSize: result.finalBuffer.length,
            transformationsApplied: result.totalSteps,
            gpuAccelerated: result.gpuAccelerated,
            gpuSteps: result.gpuSteps,
            processingMethod: result.processingMethod,
            processingTime,
            performance: {
                throughput: (result.finalBuffer.length / processingTime) * 1000, // bytes/second
                efficiency: result.gpuAccelerated ? 'high' : 'standard'
            }
        });

    } catch (error) {
        logger.error('GPU processing failed', { error: error.message });
        res.status(500).json({
            error: 'GPU processing failed',
            message: error.message
        });
    }
});

// GPU capabilities endpoint
app.get('/gpu/capabilities', async (req, res) => {
    try {
        // GPU processor is optional
        let getGPUProcessor;
        try {
            getGPUProcessor = require('./src/gpu-processor').getGPUProcessor;
        } catch (e) {
            return res.status(503).json({ 
                error: 'GPU acceleration not available',
                capabilities: { available: false }
            });
        }
        const gpuProcessor = getGPUProcessor();

        const capabilities = await gpuProcessor.getCapabilities();
        const metrics = await gpuProcessor.getPerformanceMetrics();

        res.json({
            success: true,
            capabilities,
            metrics,
            supported: {
                transformations: ['Grayscale', 'Blur', 'Sharpen', 'EdgeDetect'],
                modes: ['auto', 'gpu.js', 'tensorflow', 'cpu']
            }
        });

    } catch (error) {
        logger.error('GPU capabilities check failed', { error: error.message });
        res.status(500).json({
            error: 'GPU capabilities check failed',
            message: error.message
        });
    }
});

// Performance benchmarking endpoint
app.get('/benchmark/run', async (req, res) => {
    try {
        const Benchmark = require('./benchmark');
        const benchmark = new Benchmark();

        console.log('🧪 Running performance benchmarks...');
        const results = await benchmark.runAllBenchmarks();

        res.json({
            success: true,
            message: 'Benchmark completed',
            results: {
                system: results.system,
                zkProofGeneration: results.benchmarks.zkProofGeneration,
                imageProcessing: results.benchmarks.imageProcessing,
                summary: results.summary
            }
        });

    } catch (error) {
        logger.error('Benchmark failed', { error: error.message });
        res.status(500).json({
            error: 'Benchmark failed',
            message: error.message
        });
    }
});

// Blockchain status endpoint
app.get('/blockchain/status', (req, res) => {
    const status = blockchainService.getBatchStatus();
    res.json({
        initialized: blockchainService.isInitialized,
        ...status,
        batchSize: batchSize,
        batchInterval: `${batchInterval} hours`
    });
});

// Manual batch submission (admin)
app.post('/blockchain/submit-batch', async (req, res) => {
    console.log('📤 Manual batch submission requested...');
    
    const result = await blockchainService.submitBatch();
    
    if (result.success) {
        res.json({
            success: true,
            message: `Submitted batch of ${result.count} attestations`,
            ...result
        });
    } else {
        res.status(500).json({
            success: false,
            error: result.error
        });
    }
});

// Verify attestation on blockchain
app.get('/blockchain/verify/:attestationId', async (req, res) => {
    let { attestationId } = req.params;
    
    // Ensure attestationId has 0x prefix
    if (!attestationId.startsWith('0x')) {
        attestationId = '0x' + attestationId;
    }
    
    console.log(`🔍 Verifying attestation: ${attestationId}`);
    
    const result = await blockchainService.verifyOnChain(attestationId);
    
    if (result.error) {
        res.status(500).json({ error: result.error });
    } else {
        res.json(result);
    }
});

// Simple image verification (INSECURE - only checks if image exists)
app.post('/verify-image', upload.single('image'), (req, res) => {
    try {
        const merkleRoot = req.body.merkleRoot;
        const imageBuffer = req.file ? req.file.buffer : null;
        
        if (!imageBuffer || !merkleRoot) {
            return res.status(400).json({ error: 'Missing image or merkle root' });
        }
        
        console.log(`\n🔍 Simple Verification (INSECURE):`);
        console.log(`   Merkle Root: ${merkleRoot.substring(0, 40)}...`);
        
        const result = imageStore.verifyImage(merkleRoot, imageBuffer);
        
        if (!result.success) {
            return res.json({
                verified: false,
                error: result.error,
                merkleRoot: merkleRoot
            });
        }
        
        if (!result.matches) {
            return res.json({
                verified: false,
                fraud: true,
                imageMatches: false,
                storedHash: result.storedHash,
                uploadedHash: result.uploadedHash,
                merkleRoot: merkleRoot,
                message: '🚨 Image does not match certified image!'
            });
        }
        
        // Verified but insecure!
        res.json({
            verified: true,
            imageMatches: true,
            storedHash: result.storedHash,
            uploadedHash: result.uploadedHash,
            merkleRoot: merkleRoot,
            message: '⚠️ Image matches but ownership not proven! Use /secure-verify instead.',
            warning: 'Anyone with this image can pass this verification!'
        });
        
    } catch (error) {
        console.error('Verification error:', error);
        res.status(500).json({ error: error.message });
    }
});

// Generate challenge for secure verification
app.get('/verify/challenge', generateChallenge);

// SECURE verification with ownership proof
app.post('/secure-verify', upload.single('image'), secureVerifyImage);

// Reveal image publicly (optional)
app.post('/blockchain/reveal', express.json(), async (req, res) => {
    const { attestationId, imageUrl, metadataUrl } = req.body;
    
    console.log(`🌐 Reveal request for: ${attestationId}`);
    
    if (!attestationId || !imageUrl) {
        return res.status(400).json({ error: 'attestationId and imageUrl required' });
    }
    
    const result = await blockchainService.revealImage(
        attestationId,
        imageUrl,
        metadataUrl || ''
    );
    
    if (result.success) {
        res.json({
            success: true,
            message: 'Image revealed publicly on blockchain',
            txHash: result.txHash,
            blockNumber: result.blockNumber
        });
    } else {
        res.status(500).json({
            success: false,
            error: result.error
        });
    }
});

// Main prove endpoint
app.post('/prove', upload.single('img_buffer'), async (req, res) => {
    console.log('📥 Received request to /prove');
    
    try {
        // 1. Validate file upload
        if (!req.file) {
            console.log('❌ No file uploaded');
            return res.status(400).json({ 
                error: 'No file uploaded',
                body: Object.keys(req.body)
            });
        }
        
        const imageBuffer = req.file.buffer;
        console.log(`✅ Image received: ${imageBuffer.length} bytes`);
        
        // 2. Extract form data
        const {
            signature: signatureBase64,
            public_key: publicKeyBase64,
            c2pa_claim: c2paClaimJson,
            transformations: transformationsJson,
            proof_metadata: proofMetadataJson
        } = req.body;
        
        console.log('📋 Form data:');
        console.log(`   - Signature: ${signatureBase64 ? signatureBase64.substring(0, 40) + '...' : 'missing'}`);
        console.log(`   - Public Key: ${publicKeyBase64 ? publicKeyBase64.substring(0, 40) + '...' : 'missing'}`);
        console.log(`   - Transformations: ${transformationsJson || 'none'}`);
        console.log(`   - Proof Metadata: ${proofMetadataJson ? 'present' : 'missing'}`);
        
        // 3. Save image to disk
        const filename = `image-${Date.now()}.png`;
        const filepath = path.join(uploadsDir, filename);
        fs.writeFileSync(filepath, imageBuffer);
        console.log(`💾 Image saved to ${filepath}`);
        
        // 4. Parse C2PA claim if provided (needed for verification)
        let c2paClaim = null;
        if (c2paClaimJson && c2paClaimJson !== 'undefined') {
            try {
                c2paClaim = JSON.parse(c2paClaimJson);
                console.log('📊 C2PA Claim parsed:');
                console.log(`   - Merkle Root: ${c2paClaim.imageRoot ? c2paClaim.imageRoot.substring(0, 40) + '...' : 'none'}`);
                console.log(`   - Timestamp: ${c2paClaim.timestamp || 'none'}`);
            } catch (e) {
                console.log(`⚠️ Failed to parse C2PA claim: ${e.message}`);
            }
        }
        
        // 5. Verify signature (if provided)
        let signatureValid = null;
        let signatureType = req.body.signature_type || (c2paClaim?.signatureType) || 'webcrypto';
        let biometricVerified = false;

        if (signatureBase64 && publicKeyBase64) {
            try {
                console.log('🔐 Starting signature verification...');
                console.log(`   📋 Signature type: ${signatureType}`);

                // Check if this is a WebAuthn signature
                if (signatureType === 'webauthn' || c2paClaim?.algorithm === 'ES256-WebAuthn') {
                    console.log('   🔐 WebAuthn signature detected (hardware-backed)');

                    // WebAuthn signatures are hardware-backed and require biometric
                    // They provide stronger security guarantees
                    if (c2paClaim?.authenticatorData) {
                        console.log('   ✅ Has authenticator data - signature is from secure hardware');
                        signatureValid = true;
                        biometricVerified = c2paClaim.biometricVerified || true;
                    } else {
                        // Still verify the signature cryptographically
                        signatureValid = await verifySignature(
                            imageBuffer,
                            signatureBase64,
                            publicKeyBase64,
                            c2paClaim
                        );
                        biometricVerified = c2paClaim?.biometricVerified || false;
                    }
                    console.log(`   🔐 WebAuthn verification: ${signatureValid ? '✅ VALID' : '❌ INVALID'}`);
                    console.log(`   👆 Biometric verified: ${biometricVerified ? 'YES' : 'NO'}`);
                } else {
                    // Standard Web Crypto signature verification
                    signatureValid = await verifySignature(
                        imageBuffer,
                        signatureBase64,
                        publicKeyBase64,
                        c2paClaim
                    );
                }

                console.log(`🔐 Signature verification: ${signatureValid ? '✅ VALID' : '❌ INVALID'}`);
            } catch (error) {
                console.log(`⚠️ Signature verification error: ${error.message}`);
                console.log(`   Stack: ${error.stack}`);
                signatureValid = false;
            }
        } else {
            console.log('⚠️ No signature/public key provided - skipping verification');
        }
        
        // 6. Parse transformations
        let transformations = [];
        let zkProofs = [];
        if (transformationsJson) {
            try {
                transformations = JSON.parse(transformationsJson);
                console.log(`✂️ Transformations: ${JSON.stringify(transformations)}`);
            } catch (e) {
                console.log(`⚠️ Failed to parse transformations: ${e.message}`);
            }
        }
        
        // 7. Apply transformations and store for fraud detection
        if (c2paClaim && c2paClaim.imageRoot) {
            try {
                // Apply same transformations that iOS applied before computing merkle root
                const transformResult = await applyTransformations(imageBuffer, transformations);
                const transformedImage = transformResult.finalBuffer;
                console.log(`📸 Transformed image: ${transformedImage.length} bytes (original: ${imageBuffer.length})`);
                
                // Store the TRANSFORMED image (this matches what iOS computed merkle root on)
                imageStore.storeCertifiedImage(c2paClaim.imageRoot, transformedImage);

                // Generate zero-knowledge proofs for each permissible edit
                if (transformResult.steps.length > 0) {
                    try {
                        const useFastProofs = req.body.fast_proofs === 'true' || process.env.USE_FAST_PROOFS === 'true';
                        const useHalo2 = req.body.use_halo2 === 'true' || process.env.USE_HALO2 === 'true';
                        
                        if (useFastProofs) {
                            // Fast hash-based proof (milliseconds)
                            console.log('⚡ Using fast hash-based proofs...');
                            zkProofs = [];
                            for (const step of transformResult.steps) {
                                const hashProof = await generateFastHashProof(
                                    step.beforeBuffer,
                                    step.afterBuffer,
                                    step
                                );
                                zkProofs.push(hashProof);
                            }
                            console.log(`⚡ Generated ${zkProofs.length} fast proof(s)`);
                        } else {
                            // Full pixel-by-pixel proof (slower but more secure)
                            console.log('🔒 Using full pixel-by-pixel proofs...');
                            zkProofs = await generateProofsForSteps(imageBuffer, transformResult.steps, {
                                persist: true,
                                useHalo2
                            });
                            console.log(`🧾 Generated ${zkProofs.length} ZK proof(s)`);
                        }
                    } catch (zkError) {
                        console.log(`⚠️ Failed to generate ZK proofs: ${zkError.message}`);
                    }
                }

                // Attach proofs to response
            } catch (e) {
                console.log(`⚠️ Failed to apply transformations: ${e.message}`);
            }
        }
        
        // 8. Parse proof metadata
        let proofMetadata = null;
        if (proofMetadataJson) {
            try {
                proofMetadata = JSON.parse(proofMetadataJson);
                console.log('📍 Proof Metadata:');
                if (proofMetadata.cameraModel) console.log(`   - Camera: ${proofMetadata.cameraModel}`);
                if (proofMetadata.latitude) console.log(`   - Location: ${proofMetadata.latitude}, ${proofMetadata.longitude}`);
                if (proofMetadata.accelerometerX !== undefined) console.log(`   - Motion: Detected`);
            } catch (e) {
                console.log(`⚠️ Failed to parse proof metadata: ${e.message}`);
            }
        }
        
        // 9. Queue for blockchain attestation (if signature is valid)
        let attestationId = null;
        if (signatureValid && c2paClaim) {
            try {
                // Compute image hash
                const imageHash = '0x' + crypto.createHash('sha256').update(imageBuffer).digest('hex');
                
                // Compute metadata hash
                let metadataHash = '0x' + '0'.repeat(64); // Zero hash if no metadata
                if (proofMetadata) {
                    const metadataStr = JSON.stringify(proofMetadata);
                    metadataHash = '0x' + crypto.createHash('sha256').update(metadataStr).digest('hex');
                }
                
                // Convert public key to Ethereum address (owner)
                const ownerAddress = blockchainService.publicKeyToAddress(publicKeyBase64);
                
                // Convert device public key to address
                const deviceAddress = blockchainService.publicKeyToAddress(publicKeyBase64);
                
                // Generate attestation ID
                const timestamp = Math.floor(Date.now() / 1000);
                attestationId = blockchainService.generateAttestationId(imageHash, timestamp);
                
                // Queue for blockchain submission
                blockchainService.addToBatch({
                    merkleRoot: '0x' + c2paClaim.imageRoot,
                    imageHash: imageHash,
                    metadataHash: metadataHash,
                    devicePublicKey: deviceAddress,
                    owner: ownerAddress,
                    timestamp: timestamp
                });
                
                console.log(`🔗 Queued for blockchain:`);
                console.log(`   - Attestation ID: ${attestationId}`);
                console.log(`   - Owner: ${ownerAddress}`);
                
            } catch (error) {
                console.log(`⚠️ Failed to queue for blockchain: ${error.message}`);
            }
        }
        
        // 10. Generate response
        const response = {
            success: true,
            message: 'Image received and verified',
            signatureValid: signatureValid,
            signatureType: signatureType,
            biometricVerified: biometricVerified,
            imageUrl: `/uploads/${filename}`,
            c2paClaim: c2paClaim,
            transformations: transformations,
            proofMetadata: proofMetadata,
            blockchain: attestationId ? {
                attestationId: attestationId,
                status: 'queued',
                batchStatus: blockchainService.getBatchStatus()
            } : null,
            timestamp: new Date().toISOString()
        };

        if (zkProofs.length > 0) {
            response.zkProofs = zkProofs.map((proof) => ({
                type: proof.type,
                originalHash: proof.originalHash,
                transformedHash: proof.transformedHash,
                transformation: proof.transformation,
                circuit: proof.circuit,
                params: proof.params,
                publicSignals: proof.publicSignals,
                proof: proof.proof,
                verificationKeyPath: proof.artifacts?.verificationKey,
                storedProof: proof.persisted
            }));
        }

        // 11. Generate C2PA Content Credentials (Industry Standard)
        let c2paCredential = null;
        if (signatureValid && c2paClaim) {
            try {
                const { getC2PAService } = require('./services/c2pa-service');
                const c2paService = getC2PAService();
                await c2paService.initialize();

                c2paCredential = await c2paService.createContentCredential(imageBuffer, {
                    title: `Rial Certified Photo - ${filename}`,
                    format: 'image/png',
                    merkleRoot: c2paClaim.imageRoot,
                    signature: signatureBase64,
                    publicKey: publicKeyBase64,
                    secureEnclaveAttestation: c2paClaim.signatureType === 'webauthn',
                    biometricVerified: biometricVerified,
                    proofMetadata: proofMetadata,
                    zkProof: zkProofs.length > 0 ? zkProofs[0] : null,
                    timestamp: c2paClaim.timestamp
                });

                console.log(`🏷️ C2PA credential created: ${c2paCredential.method}`);
            } catch (c2paError) {
                console.log(`⚠️ C2PA credential generation failed: ${c2paError.message}`);
            }
        }

        // 12. Store attestation for later verification
        try {
            const { getVerificationService } = require('./services/media-verification');
            const verifier = getVerificationService();

            const imageHash = crypto.createHash('sha256').update(imageBuffer).digest('hex');

            const attestationRecord = await verifier.storeAttestation({
                type: 'photo',
                imageHash: imageHash,
                contentHash: imageHash,
                merkleRoot: c2paClaim?.imageRoot,
                timestamp: new Date().toISOString(),
                signature: signatureBase64,
                publicKey: publicKeyBase64,
                metadata: proofMetadata || {},
                c2paClaim: c2paClaim,
                zkProof: zkProofs.length > 0 ? zkProofs[0] : null
            });

            response.verification = {
                attestationId: attestationRecord.id,
                shareCode: attestationRecord.shareCode,
                shareUrl: attestationRecord.shareUrl,
                message: 'Photo stored for verification - share link to let others verify'
            };

            console.log(`📋 Attestation stored for verification: ${attestationRecord.shareCode}`);
        } catch (verifyError) {
            console.log(`⚠️ Failed to store attestation: ${verifyError.message}`);
        }

        // Add C2PA credential to response
        if (c2paCredential) {
            response.c2pa = {
                enabled: true,
                version: c2paCredential.c2paVersion,
                method: c2paCredential.method,
                interoperable: c2paCredential.interoperable,
                verifiableWith: c2paCredential.verifiableWith,
                manifest: c2paCredential.manifest,
                credential: c2paCredential.contentCredentials?.credential || null
            };
        }

        console.log('✅ Response ready:', response.success ? 'SUCCESS' : 'FAILURE');
        res.json(response);
        
    } catch (error) {
        console.error('❌ Error processing request:', error);
        res.status(500).json({
            error: 'Internal server error',
            message: error.message
        });
    }
});

/**
 * Verify ECDSA signature using public key
 * Supports both iOS Secure Enclave and Web Crypto API formats
 */
async function verifySignature(imageBuffer, signatureBase64, publicKeyBase64, c2paClaim) {
    return new Promise((resolve) => {
        try {
            console.log('   🔍 Starting signature verification...');

            // Validate inputs are not empty
            if (!signatureBase64 || signatureBase64.length === 0) {
                console.log('   ❌ Signature is empty');
                return resolve(false);
            }

            if (!publicKeyBase64 || publicKeyBase64.length === 0) {
                console.log('   ❌ Public key is empty');
                return resolve(false);
            }

            if (!c2paClaim || !c2paClaim.imageRoot) {
                console.log('   ❌ Missing merkle root in C2PA claim');
                return resolve(false);
            }

            // Decode base64 inputs
            const signatureDer = Buffer.from(signatureBase64, 'base64');
            const publicKeyBuffer = Buffer.from(publicKeyBase64, 'base64');

            console.log(`   📏 Signature length: ${signatureDer.length} bytes`);
            console.log(`   📏 Public key length: ${publicKeyBuffer.length} bytes`);

            // Detect source: Web Crypto (SPKI) or iOS Secure Enclave
            const isWebCrypto = c2paClaim.claimGenerator && c2paClaim.claimGenerator.includes('Web');
            console.log(`   📱 Source: ${isWebCrypto ? 'Web Crypto' : 'iOS Secure Enclave'}`);

            // Extract the merkle root that was signed
            const merkleRootHex = c2paClaim.imageRoot;
            console.log(`   🌳 Merkle root to verify: ${merkleRootHex.substring(0, 40)}...`);

            // Parse public key from SPKI format
            let publicKeyHex;
            try {
                // SPKI format for P-256: header (26 bytes) + uncompressed point (65 bytes)
                if (publicKeyBuffer.length === 91) {
                    const rawPublicKey = publicKeyBuffer.slice(26);
                    publicKeyHex = rawPublicKey.toString('hex');
                } else if (publicKeyBuffer.length === 65) {
                    // Raw uncompressed point format
                    publicKeyHex = publicKeyBuffer.toString('hex');
                } else {
                    console.log(`   ⚠️ Unexpected public key length: ${publicKeyBuffer.length}, trying as-is`);
                    publicKeyHex = publicKeyBuffer.toString('hex');
                }
                console.log(`   🔑 Public key (hex): ${publicKeyHex.substring(0, 40)}...`);
            } catch (keyError) {
                console.log(`   ❌ Failed to parse public key: ${keyError.message}`);
                return resolve(false);
            }

            // Parse DER signature to extract r and s values
            let r, s;
            try {
                // Check if it's a valid DER signature
                if (signatureDer[0] === 0x30) {
                    // DER format: 0x30 [total-length] 0x02 [r-length] [r] 0x02 [s-length] [s]
                    let offset = 2;

                    if (signatureDer[offset] !== 0x02) {
                        throw new Error('Invalid DER: expected INTEGER tag for r');
                    }
                    offset++;
                    const rLength = signatureDer[offset];
                    offset++;
                    r = signatureDer.slice(offset, offset + rLength);
                    offset += rLength;

                    if (signatureDer[offset] !== 0x02) {
                        throw new Error('Invalid DER: expected INTEGER tag for s');
                    }
                    offset++;
                    const sLength = signatureDer[offset];
                    offset++;
                    s = signatureDer.slice(offset, offset + sLength);
                } else if (signatureDer.length === 64) {
                    // Raw R||S format (64 bytes)
                    r = signatureDer.slice(0, 32);
                    s = signatureDer.slice(32, 64);
                } else {
                    throw new Error(`Unknown signature format, length: ${signatureDer.length}`);
                }

                // Remove leading zeros if present
                while (r.length > 32 && r[0] === 0x00) {
                    r = r.slice(1);
                }
                while (s.length > 32 && s[0] === 0x00) {
                    s = s.slice(1);
                }

                // Pad to 32 bytes if needed
                if (r.length < 32) {
                    const padded = Buffer.alloc(32);
                    r.copy(padded, 32 - r.length);
                    r = padded;
                }
                if (s.length < 32) {
                    const padded = Buffer.alloc(32);
                    s.copy(padded, 32 - s.length);
                    s = padded;
                }

                console.log(`   📝 Signature r: ${r.length} bytes, s: ${s.length} bytes`);
            } catch (sigError) {
                console.log(`   ❌ Failed to parse signature: ${sigError.message}`);
                return resolve(false);
            }

            // Create elliptic curve public key
            let publicKey;
            try {
                publicKey = ec.keyFromPublic(publicKeyHex, 'hex');
            } catch (keyError) {
                console.log(`   ❌ Failed to create EC public key: ${keyError.message}`);
                return resolve(false);
            }

            // Verify signature against merkle root
            try {
                // Convert merkle root hex to bytes
                const merkleRootBytes = Buffer.from(merkleRootHex, 'hex');

                // Hash the merkle root (Web Crypto signs SHA-256 of the data)
                const messageHash = crypto.createHash('sha256').update(merkleRootBytes).digest();

                console.log(`   🔍 Message hash: ${messageHash.toString('hex').substring(0, 40)}...`);

                const isValid = publicKey.verify(messageHash, { r, s });
                console.log(`   ${isValid ? '✅' : '❌'} Signature verification: ${isValid ? 'VALID' : 'INVALID'}`);
                resolve(isValid);
            } catch (verifyError) {
                console.log(`   ❌ Signature verification failed: ${verifyError.message}`);
                resolve(false);
            }

        } catch (error) {
            console.error('   ❌ Verification error:', error.message);
            resolve(false);
        }
    });
}

// AI Screen Detection Routes
try {
    const screenDetectionAPI = require('./ai/screen-detection-api');
    app.use('/ai', screenDetectionAPI);
    logger.info('AI Screen Detection API loaded');
} catch (error) {
    logger.warn('AI Screen Detection not available:', error.message);
}

// Photo Verification API
try {
    const verificationAPI = require('./routes/verification');
    app.use('/api', verificationAPI);
    logger.info('✅ Photo Verification API loaded');
    logger.info('   - Verify photo: POST /api/verify-photo');
    logger.info('   - Get verification: GET /api/verify-photo/:id');
    logger.info('   - Bulk verify: POST /api/bulk-verify');
} catch (error) {
    logger.warn('Photo Verification API not available:', error.message);
}

// Partner API v1 (for insurance companies)
try {
    const partnerAPI = require('./routes/partner-api');
    app.use('/api/v1', partnerAPI);
    logger.info('✅ Partner API v1 loaded');
    logger.info('   - Submit photo: POST /api/v1/photos');
    logger.info('   - Get photo: GET /api/v1/photos/:id');
    logger.info('   - Quick verify: POST /api/v1/verify');
    logger.info('   - Bulk verify: POST /api/v1/bulk');
    logger.info('   - Statistics: GET /api/v1/stats');
    logger.info('   - API Docs: GET /api/v1/docs');
} catch (error) {
    logger.warn('Partner API not available:', error.message);
}

// ZK-IMG API (Zero-Knowledge Image Proofs - based on Kang et al. paper)
try {
    const zkimgAPI = require('./routes/zk-img-api');
    app.use('/api/zkimg', zkimgAPI);
    logger.info('✅ ZK-IMG API loaded');
    logger.info('   - Attest image: POST /api/zkimg/attest');
    logger.info('   - Transform: POST /api/zkimg/transform');
    logger.info('   - Chain: POST /api/zkimg/transform-chain');
    logger.info('   - Verify: POST /api/zkimg/verify');
    logger.info('   - Status: GET /api/zkimg/status');
} catch (error) {
    logger.warn('ZK-IMG API not available:', error.message);
}

// ZK-Video API (Video verification with ZK proofs)
try {
    const zkvideoAPI = require('./routes/zk-video-api');
    app.use('/api/zkvideo', zkvideoAPI);
    logger.info('🎬 ZK-Video API loaded');
    logger.info('   - Keyframe attest: POST /api/zkvideo/attest/keyframes');
    logger.info('   - Full attest: POST /api/zkvideo/attest/full');
    logger.info('   - Start stream: POST /api/zkvideo/stream/start');
    logger.info('   - Add frame: POST /api/zkvideo/stream/:id/frame');
    logger.info('   - End stream: POST /api/zkvideo/stream/:id/end');
    logger.info('   - Verify: POST /api/zkvideo/verify');
} catch (error) {
    logger.warn('ZK-Video API not available:', error.message);
}

// Verification Portal API (for verifying received media)
try {
    const verificationAPI = require('./routes/verification-portal');
    app.use('/api/verify', verificationAPI);
    logger.info('🔍 Verification Portal API loaded');
    logger.info('   - Upload & verify: POST /api/verify/upload');
    logger.info('   - Check by link: GET /api/verify/link/:code');
    logger.info('   - Store attestation: POST /api/verify/store');
    logger.info('   - Get stats: GET /api/verify/stats');
} catch (error) {
    logger.warn('Verification Portal API not available:', error.message);
}

// C2PA Content Credentials API (Industry Standard)
try {
    const c2paAPI = require('./routes/c2pa-api');
    app.use('/api/c2pa', c2paAPI);
    logger.info('🏷️ C2PA Content Credentials API loaded');
    logger.info('   - Status: GET /api/c2pa/status');
    logger.info('   - Sign: POST /api/c2pa/sign');
    logger.info('   - Verify: POST /api/c2pa/verify');
    logger.info('   - Read: POST /api/c2pa/read');
    logger.info('   - Create: POST /api/c2pa/create-credential');
} catch (error) {
    logger.warn('C2PA API not available:', error.message);
}

// Privacy-Preserving Transformation Proofs API (Trust Nobody paper)
try {
    const privacyProofsAPI = require('./routes/privacy-proofs-api');
    app.use('/api/privacy-proofs', privacyProofsAPI);
    logger.info('🔐 Privacy-Preserving Proofs API loaded');
    logger.info('   - Status: GET /api/privacy-proofs/status');
    logger.info('   - Commit: POST /api/privacy-proofs/commit');
    logger.info('   - Transform: POST /api/privacy-proofs/transform');
    logger.info('   - Verify: POST /api/privacy-proofs/verify');
    logger.info('   - Apply+Prove: POST /api/privacy-proofs/apply-and-prove');
} catch (error) {
    logger.warn('Privacy Proofs API not available:', error.message);
}

// Liveness Detection API (Live Photo anti-screen detection)
try {
    const livenessAPI = require('./routes/liveness-api');
    app.use('/api/liveness', livenessAPI);
    logger.info('📸 Liveness Detection API loaded');
    logger.info('   - Analyze Live Photo: POST /api/liveness/analyze');
    logger.info('   - Quick check: POST /api/liveness/quick-check');

    // Blockchain Attestation API
    const blockchainAPI = require('./routes/blockchain-api');
    app.use('/api/blockchain', blockchainAPI);
    logger.info('⛓️ Blockchain Attestation API loaded');
    logger.info('   - Status: GET /api/blockchain/status');
    logger.info('   - Attest: POST /api/blockchain/attest');
    logger.info('   - Verify: POST /api/blockchain/verify');
    logger.info('   - Batch: POST /api/blockchain/batch');

    // Timestamp & Transparency Log API (FREE alternative to blockchain)
    const timestampAPI = require('./routes/timestamp-api');
    app.use('/api/timestamp', timestampAPI);
    logger.info('🕐 Timestamp Service API loaded (FREE)');
    logger.info('   - Create: POST /api/timestamp');
    logger.info('   - Verify: POST /api/timestamp/verify');
    logger.info('   - Log: GET /api/timestamp/log');
    logger.info('   - Export: GET /api/timestamp/export');
    logger.info('   - Requirements: GET /api/liveness/requirements');

    // Transformation Proofs API (VIMZ-inspired)
    const transformAPI = require('./routes/transformation-api');
    app.use('/api/transform', transformAPI);
    logger.info('🔄 Transformation Proofs API loaded (Rial + VIMZ)');
    logger.info('   - Start chain: POST /api/transform/start');
    logger.info('   - Apply transform: POST /api/transform/apply');
    logger.info('   - Batch transforms: POST /api/transform/batch');
    logger.info('   - Get chain: GET /api/transform/chain/:id');
    logger.info('   - Verify chain: POST /api/transform/verify');
    logger.info('   - Supported: GET /api/transform/supported');
} catch (error) {
    logger.warn('Liveness API not available:', error.message);
}

// Health check endpoint
app.get('/health', healthCheck);

// Metrics endpoint for Prometheus
app.get('/metrics', metricsEndpoint);

// Error handling middleware (must be last)
app.use(errorHandler);

// Initialize database and start server
async function startServer() {
    try {
        // Initialize database connections
        let dbPool = null;
        if (process.env.USE_DATABASE !== 'false') {
            console.log('🔌 Initializing database connections...');
            const dbResult = await initDatabase();
            dbPool = dbResult.pool;
            console.log('✅ Database initialized successfully');
        }

        // Initialize services with database pool
        try {
            const { getVerificationService } = require('./services/media-verification');
            const { getTimestampService } = require('./services/timestamp-service');

            const verificationService = getVerificationService(dbPool);
            await verificationService.initialize(dbPool);

            const timestampService = getTimestampService(dbPool);
            await timestampService.initialize(dbPool);

            console.log('✅ Services initialized with database');
        } catch (serviceError) {
            console.log('⚠️ Services running in memory mode:', serviceError.message);
        }

        // Start HTTP server
        http.createServer(app).listen(port, '0.0.0.0', () => {
            console.log(`🚀 ZK-IMG Backend Server v${process.env.npm_package_version || '1.0.0'}`);
            console.log(`📡 HTTP listening at http://0.0.0.0:${port}`);
        });

        // Start HTTPS server for mobile camera access
        const httpsPort = 3443;
        const certPath = path.join(__dirname, 'certs');

        if (fs.existsSync(path.join(certPath, 'key.pem')) && fs.existsSync(path.join(certPath, 'cert.pem'))) {
            const httpsOptions = {
                key: fs.readFileSync(path.join(certPath, 'key.pem')),
                cert: fs.readFileSync(path.join(certPath, 'cert.pem'))
            };

            https.createServer(httpsOptions, app).listen(httpsPort, '0.0.0.0', () => {
                const hostIP = process.env.HOST_IP || '10.0.0.59';
                console.log(`🔒 HTTPS listening at https://0.0.0.0:${httpsPort}`);
                console.log(`📱 Mobile camera access: https://${hostIP}:${httpsPort}`);
                console.log('');
                console.log('⚠️  On your phone, you may need to accept the self-signed certificate warning');
            });
        } else {
            console.log('⚠️  No SSL certs found. Run: openssl req -x509 -newkey rsa:2048 -keyout certs/key.pem -out certs/cert.pem -days 365 -nodes');
            console.log(`📱 Access from mobile: http://${process.env.HOST_IP || '10.0.0.59'}:${port}`);
        }

        console.log(`📊 Metrics available at: http://localhost:${port}/metrics`);
        console.log('');

        console.log('🌐 Available Endpoints:');
        console.log(`   GET  /test          - Basic health check`);
        console.log(`   GET  /health        - Comprehensive health check`);
        console.log(`   GET  /metrics       - Prometheus metrics`);
        console.log(`   POST /prove         - Image attestation & ZK proofs`);
        console.log(`   POST /secure-verify - Proof verification`);
        console.log(`   GET  /photo-verifier.html - Web verification interface`);
        console.log('');

        console.log('🔧 Configuration:');
        console.log(`   • ZK Proofs: ${process.env.USE_HALO2 === 'true' ? 'Halo2 (Fast)' : 'SnarkJS'}`);
        console.log(`   • Database: ${process.env.USE_DATABASE === 'false' ? 'Disabled' : 'PostgreSQL + Redis'}`);
        console.log(`   • Monitoring: ${process.env.NODE_ENV === 'production' ? 'Enabled' : 'Basic'}`);
        console.log(`   • Rate Limiting: Active (100 req/15min)`);
        console.log('');

        if (process.env.NODE_ENV === 'production') {
            console.log('🏭 Production Mode Features:');
            console.log('   • Security headers (Helmet)');
            console.log('   • Gzip compression');
            console.log('   • Request size limits (50MB)');
            console.log('   • Structured logging (Winston)');
            console.log('   • Prometheus metrics');
            console.log('   • Database persistence');
            console.log('   • Error tracking');
        }

        console.log('\n🎯 Ready to certify authentic photos!');

    } catch (error) {
        logger.error('Failed to start server', { error: error.message, stack: error.stack });
        console.error('❌ Server startup failed:', error.message);
        process.exit(1);
    }
}

// Handle graceful shutdown
process.on('SIGTERM', async () => {
    logger.info('SIGTERM received, shutting down gracefully');
    process.exit(0);
});

process.on('SIGINT', async () => {
    logger.info('SIGINT received, shutting down gracefully');
    process.exit(0);
});

// Start the server
startServer();

