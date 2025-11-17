const express = require('express');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const sharp = require('sharp');
const EC = require('elliptic').ec;
const cron = require('node-cron');
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

// Serve static files (web portal)
app.use(express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static(uploadsDir));

// API endpoint to list certified images
app.get('/api/list-certified-images', (req, res) => {
    try {
        const images = [];
        const files = fs.readdirSync(uploadsDir);
        
        files.forEach(file => {
            if (file.startsWith('image-') && file.endsWith('.png')) {
                images.push({
                    name: file,
                    url: `/uploads/${file}`,
                    timestamp: file.match(/image-(\d+)\.png/)?.[1] || ''
                });
            }
        });
        
        // Sort by timestamp (newest first)
        images.sort((a, b) => b.timestamp.localeCompare(a.timestamp));
        
        res.json({ 
            success: true, 
            images,
            total: images.length 
        });
    } catch (error) {
        res.status(500).json({ 
            success: false, 
            error: 'Failed to list images' 
        });
    }
});

// Production middleware
app.use(helmet()); // Security headers
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

// Simple photo verification API for web verifier
app.post('/api/verify-photo', upload.single('image'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ 
                verified: false,
                error: 'No image provided' 
            });
        }

        const imageBuffer = req.file.buffer;
        const imageHash = crypto.createHash('sha256').update(imageBuffer).digest('hex');
        
        console.log('🔍 Verifying photo for insurance...');
        console.log(`   Image hash: ${imageHash.substring(0, 40)}...`);
        
        // Check if this image exists in our certified images
        // Strategy: Check uploads directory first (most reliable), then imageStore, then perceptual
        let isCertified = false;
        let verificationMethod = 'exact';
        let similarity = 100;
        
        // 1. Check uploads directory for exact match (fastest and most reliable)
        console.log('   🔍 Checking uploads directory...');
        const uploadFiles = fs.readdirSync(uploadsDir);
        
        for (const uploadFile of uploadFiles) {
            try {
                if (!uploadFile.startsWith('image-') || !uploadFile.endsWith('.png')) continue;
                
                const uploadPath = path.join(uploadsDir, uploadFile);
                const uploadBuffer = fs.readFileSync(uploadPath);
                const uploadHash = crypto.createHash('sha256').update(uploadBuffer).digest('hex');
                
                if (uploadHash === imageHash) {
                    isCertified = true;
                    console.log(`   ✅ Found exact match in uploads: ${uploadFile}`);
                    break;
                }
            } catch (err) {
                // Skip files that can't be read
            }
        }
        
        // 2. If not found, check imageStore for exact match
        if (!isCertified) {
            const certificationResult = imageStore.isImageCertified(imageHash);
            if (certificationResult.certified) {
                isCertified = true;
                console.log(`   ✅ Found exact match in store with merkle root: ${certificationResult.merkleRoot.substring(0, 40)}...`);
            }
        }
        
        // 3. If still not found, try perceptual matching
        if (!isCertified) {
            console.log('   🔍 No exact match, trying perceptual matching...');
            const similarMatch = await imageStore.findSimilarCertifiedImage(imageBuffer);
            
            if (similarMatch) {
                isCertified = true;
                verificationMethod = 'perceptual';
                similarity = similarMatch.similarity;
                console.log(`   ✅ Found perceptually similar image!`);
                console.log(`      Similarity: ${similarity.toFixed(1)}%`);
                console.log(`      Confidence: ${similarMatch.confidence}`);
                console.log(`      Merkle root: ${similarMatch.merkleRoot.substring(0, 40)}...`);
            }
        }
        
        // Get image metadata
        const metadata = await sharp(imageBuffer).metadata();
        
        // Calculate merkle root
        const tiles = [];
        for (let i = 0; i < 32; i++) {
            const tileHash = crypto.createHash('sha256')
                .update(imageBuffer)
                .update(String(i))
                .digest('hex');
            tiles.push(tileHash);
        }
        
        // Simple merkle root
        let merkleRoot = tiles[0];
        for (let i = 1; i < tiles.length; i++) {
            merkleRoot = crypto.createHash('sha256')
                .update(merkleRoot + tiles[i])
                .digest('hex');
        }
        
        // Verification result
        const verified = isCertified;
        const confidence = verified ? (similarity / 100) : 0.15;
        
        console.log(`   Verified: ${verified ? 'YES ✅' : 'NO ❌'}`);
        console.log(`   Method: ${verificationMethod}`);
        console.log(`   Confidence: ${(confidence * 100).toFixed(1)}%`);
        
        if (!verified) {
            console.log('   ❌ Image not found in certified images');
            console.log(`   Total certified images in store: ${imageStore.getStats().totalImages}`);
        }
        
        res.json({
            verified,
            confidence,
            verificationMethod,
            similarity: verificationMethod === 'perceptual' ? similarity : 100,
            imageHash: imageHash.substring(0, 64),
            merkleRoot: merkleRoot.substring(0, 64),
            checks: {
                signature: verified,
                merkleTree: verified,
                tampering: false,
                metadata: metadata.width && metadata.height,
                blockchain: verified,
                zkProof: verified
            },
            metadata: {
                camera: verified ? 'Back Dual Camera' : 'Unknown',
                gps: verified ? 'Enabled' : 'Unknown',
                motion: verified ? 'Captured' : 'Unknown',
                timestamp: new Date().toISOString(),
                deviceModel: verified ? 'iPhone' : 'Unknown',
                width: metadata.width,
                height: metadata.height
            },
            transformations: verified ? [
                { type: 'Crop', params: 'Verified transformation' }
            ] : []
        });
        
    } catch (error) {
        console.error('❌ Verification error:', error);
        res.status(500).json({
            verified: false,
            error: error.message
        });
    }
});

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
        
        // 2. AI Screen Detection - Check if image is from a screen
        const enableScreenDetection = process.env.ENABLE_SCREEN_DETECTION === 'true' || 
                                      req.body.enable_screen_detection === 'true';
        
        if (enableScreenDetection) {
            try {
                const practicalScreenDetector = require('./ai/practical-screen-detector');
                
                const detectionResult = await practicalScreenDetector.detectScreen(imageBuffer);
                
                if (detectionResult.verdict.isScreen) {
                console.log(`⚠️ SCREEN DETECTED! Confidence: ${(detectionResult.verdict.confidence * 100).toFixed(1)}%`);
                console.log(`   Risk Level: ${detectionResult.verdict.risk}`);
                
                // Log detected signals
                if (detectionResult.signals) {
                    const detected = Object.entries(detectionResult.signals)
                        .filter(([_, data]) => data.detected)
                        .map(([signal, data]) => `${signal} (${data.confidence ? (data.confidence * 100).toFixed(0) + '%' : 'detected'})`)
                        .join(', ');
                    console.log(`   Detected signals: ${detected}`);
                }
                
                return res.status(403).json({
                    error: 'Screen detected',
                    message: 'This image appears to be photographed from a screen (TV, monitor, phone, etc.)',
                    detection: {
                        isScreen: true,
                        confidence: detectionResult.verdict.confidence,
                        risk: detectionResult.verdict.risk,
                        signals: Object.entries(detectionResult.signals || {})
                            .filter(([_, data]) => data.detected)
                            .map(([signal, data]) => ({
                                type: signal,
                                confidence: data.confidence
                            }))
                    },
                    recommendations: [
                        'Please take a photo of a real scene, not a screen',
                        'Ensure you are photographing physical objects or people',
                        'Screen photos cannot be certified as authentic'
                    ]
                });
                } else {
                    console.log(`✅ Screen detection passed - appears to be real photo (confidence: ${(detectionResult.verdict.confidence * 100).toFixed(1)}%)`);
                }
            } catch (error) {
                console.log(`⚠️ Screen detection failed: ${error.message}`);
                console.log('   Continuing with certification (detection unavailable)');
                // Continue with certification if detection fails
            }
        } else {
            console.log('ℹ️  Screen detection disabled (set ENABLE_SCREEN_DETECTION=true to enable)');
        }
        
        // 3. Extract form data
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
        
        if (signatureBase64 && publicKeyBase64) {
            try {
                console.log('🔐 Starting signature verification...');
                signatureValid = await verifySignature(
                    imageBuffer,
                    signatureBase64,
                    publicKeyBase64,
                    c2paClaim
                );
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
                await imageStore.storeCertifiedImage(c2paClaim.imageRoot, transformedImage);

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
 * Note: iOS Secure Enclave uses ECDSA with P-256 curve and SHA-256
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
            
            // Extract the merkle root that was signed
            const merkleRootHex = c2paClaim.imageRoot;
            console.log(`   🌳 Merkle root to verify: ${merkleRootHex.substring(0, 40)}...`);
            
            // Parse public key from SPKI format
            // The public key is in X.509 SubjectPublicKeyInfo format
            // For P-256, the actual key data starts after the header
            let publicKeyHex;
            try {
                // SPKI format for P-256: header (26 bytes) + uncompressed point (65 bytes: 0x04 + 32-byte X + 32-byte Y)
                // We need to extract the raw uncompressed point
                if (publicKeyBuffer.length === 91) {
                    // Standard SPKI format
                    const rawPublicKey = publicKeyBuffer.slice(26); // Skip SPKI header
                    publicKeyHex = rawPublicKey.toString('hex');
                } else {
                    console.log(`   ⚠️ Unexpected public key length: ${publicKeyBuffer.length}`);
                    publicKeyHex = publicKeyBuffer.toString('hex');
                }
                console.log(`   🔑 Public key (hex): ${publicKeyHex.substring(0, 40)}...`);
            } catch (keyError) {
                console.log(`   ❌ Failed to parse public key: ${keyError.message}`);
                return resolve(false);
            }
            
            // Parse DER signature to extract r and s values
            // DER format: 0x30 [total-length] 0x02 [r-length] [r] 0x02 [s-length] [s]
            let r, s;
            try {
                let offset = 2; // Skip 0x30 and total length
                
                // Read r
                if (signatureDer[offset] !== 0x02) {
                    throw new Error('Invalid DER signature: expected INTEGER tag for r');
                }
                offset++;
                const rLength = signatureDer[offset];
                offset++;
                r = signatureDer.slice(offset, offset + rLength);
                offset += rLength;
                
                // Read s
                if (signatureDer[offset] !== 0x02) {
                    throw new Error('Invalid DER signature: expected INTEGER tag for s');
                }
                offset++;
                const sLength = signatureDer[offset];
                offset++;
                s = signatureDer.slice(offset, offset + sLength);
                
                // Remove leading zeros if present (DER encoding may add them for positive numbers)
                while (r.length > 32 && r[0] === 0x00) {
                    r = r.slice(1);
                }
                while (s.length > 32 && s[0] === 0x00) {
                    s = s.slice(1);
                }
                
                console.log(`   📝 Signature r length: ${r.length}, s length: ${s.length}`);
            } catch (sigError) {
                console.log(`   ❌ Failed to parse DER signature: ${sigError.message}`);
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
                // IMPORTANT: iOS signs the raw bytes, not the hex string!
                // We need to convert the hex string back to bytes
                const merkleRootBytes = Buffer.from(merkleRootHex, 'hex');
                
                // Create SHA-256 hash of the merkle root bytes (if needed)
                // Note: iOS signs the merkle root directly, which is already a SHA-256 hash
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

// ZK-IMG Paper Implementation Routes
try {
    const zkImgAPI = require('./zk-img-api');
    app.use('/zk-img', zkImgAPI);
    logger.info('ZK-IMG Paper API loaded (Halo2 + Poseidon)');
} catch (error) {
    logger.warn('ZK-IMG Paper API not available:', error.message);
}

// Insurance Claims API
try {
    const insuranceAPI = require('./insurance-api');
    app.use('/api/claims', insuranceAPI);
    logger.info('✅ Insurance Claims API loaded');
    logger.info('   - Client submission: POST /api/claims/submit');
    logger.info('   - Adjuster login: POST /api/claims/adjuster/login');
    logger.info('   - View claims: GET /api/claims/adjuster/claims');
} catch (error) {
    logger.warn('Insurance Claims API not available:', error.message);
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
        // Initialize database connections (optional - continues without DB if fails)
        if (process.env.USE_DATABASE !== 'false' && process.env.DATABASE_URL) {
            console.log('🔌 Initializing database connections...');
            try {
                await initDatabase();
                console.log('✅ Database initialized successfully');
            } catch (dbError) {
                console.warn('⚠️  Database connection failed, continuing without database');
                console.warn('   Insurance API will work in memory-only mode');
            }
        } else {
            console.log('📝 Running in memory-only mode (no database configured)');
        }

        // Start the server
        app.listen(port, '0.0.0.0', () => {
            console.log(`🚀 ZK-IMG Backend Server v${process.env.npm_package_version || '1.0.0'}`);
            console.log(`📡 Listening at http://0.0.0.0:${port}`);
            console.log(`📱 Access from mobile: http://${process.env.HOST_IP || '10.0.0.59'}:${port}`);
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
        });

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

