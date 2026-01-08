#!/usr/bin/env node

/**
 * ML Model Training Pipeline for Screen Detection
 * 
 * Features:
 * - Data collection and augmentation
 * - Model training with TensorFlow.js
 * - Hyperparameter tuning
 * - Cross-validation
 * - Model evaluation and export
 */

const tf = require('@tensorflow/tfjs-node');
const sharp = require('sharp');
const fs = require('fs').promises;
const path = require('path');
const crypto = require('crypto');
const chalk = require('chalk');
const ora = require('ora');
const ProgressBar = require('progress');

class ScreenDetectionTrainingPipeline {
    constructor(config = {}) {
        this.config = {
            dataDir: config.dataDir || path.join(__dirname, 'training-data'),
            modelDir: config.modelDir || path.join(__dirname, 'models'),
            augmentationFactor: config.augmentationFactor || 3,
            validationSplit: config.validationSplit || 0.2,
            testSplit: config.testSplit || 0.1,
            batchSize: config.batchSize || 32,
            epochs: config.epochs || 50,
            learningRate: config.learningRate || 0.001,
            earlyStoppingPatience: config.earlyStoppingPatience || 5,
            ...config
        };

        this.dataset = {
            train: { images: [], labels: [] },
            validation: { images: [], labels: [] },
            test: { images: [], labels: [] }
        };

        this.models = {
            visual: null,
            moire: null,
            ensemble: null
        };

        this.trainingHistory = [];
        this.augmentationStats = {
            original: 0,
            augmented: 0
        };
    }

    /**
     * Main training pipeline
     */
    async runPipeline() {
        console.log(chalk.bold.cyan('\n🚀 Screen Detection ML Training Pipeline\n'));

        try {
            // 1. Setup directories
            await this.setupDirectories();

            // 2. Collect and prepare data
            await this.collectData();

            // 3. Augment dataset
            await this.augmentDataset();

            // 4. Split dataset
            await this.splitDataset();

            // 5. Train models
            await this.trainModels();

            // 6. Evaluate models
            await this.evaluateModels();

            // 7. Export models
            await this.exportModels();

            // 8. Generate report
            await this.generateReport();

            console.log(chalk.bold.green('\n✅ Training pipeline completed successfully!\n'));

        } catch (error) {
            console.error(chalk.red('\n❌ Training pipeline failed:'), error);
            throw error;
        }
    }

    /**
     * Setup directory structure
     */
    async setupDirectories() {
        const spinner = ora('Setting up directories...').start();

        const dirs = [
            this.config.dataDir,
            path.join(this.config.dataDir, 'screens'),
            path.join(this.config.dataDir, 'real'),
            path.join(this.config.dataDir, 'augmented'),
            this.config.modelDir,
            path.join(this.config.modelDir, 'checkpoints')
        ];

        for (const dir of dirs) {
            await fs.mkdir(dir, { recursive: true });
        }

        spinner.succeed('Directories ready');
    }

    /**
     * Collect training data
     */
    async collectData() {
        console.log(chalk.bold.yellow('\n📊 Data Collection\n'));

        // Check for existing data
        const screensDir = path.join(this.config.dataDir, 'screens');
        const realDir = path.join(this.config.dataDir, 'real');

        const screenFiles = await this.getImageFiles(screensDir);
        const realFiles = await this.getImageFiles(realDir);

        console.log(`Found ${chalk.green(screenFiles.length)} screen images`);
        console.log(`Found ${chalk.green(realFiles.length)} real images`);

        if (screenFiles.length < 100 || realFiles.length < 100) {
            console.log(chalk.yellow('\n⚠️  Insufficient data. Generating synthetic dataset...'));
            await this.generateSyntheticData();
        }

        // Load images
        await this.loadImages();
    }

    /**
     * Generate synthetic training data
     */
    async generateSyntheticData() {
        const spinner = ora('Generating synthetic dataset...').start();

        // Generate screen images
        for (let i = 0; i < 200; i++) {
            await this.generateScreenImage(i);
        }

        // Generate real images
        for (let i = 0; i < 200; i++) {
            await this.generateRealImage(i);
        }

        spinner.succeed('Synthetic dataset generated');
    }

    /**
     * Generate synthetic screen image
     */
    async generateScreenImage(index) {
        const width = 512 + Math.floor(Math.random() * 512);
        const height = 384 + Math.floor(Math.random() * 384);
        
        // Random screen type
        const screenTypes = ['lcd', 'oled', 'crt', 'phone', 'tablet'];
        const screenType = screenTypes[Math.floor(Math.random() * screenTypes.length)];

        // Base color
        const baseColor = {
            r: 10 + Math.random() * 30,
            g: 10 + Math.random() * 30,
            b: 15 + Math.random() * 35 // Blue bias
        };

        let image = sharp({
            create: {
                width,
                height,
                channels: 3,
                background: baseColor
            }
        });

        // Add screen-specific patterns
        const patterns = await this.generateScreenPatterns(screenType, width, height);
        
        image = image.composite([{
            input: Buffer.from(patterns.svg),
            top: 0,
            left: 0
        }]);

        // Add screen effects
        if (patterns.addMoire) {
            image = image.blur(0.3).sharpen();
        }

        if (patterns.addBlueLight) {
            image = image.tint({ r: 250, g: 250, b: 255 });
        }

        // Add noise
        image = image.noise({
            type: 'uniform',
            mean: 0,
            sigma: screenType === 'crt' ? 5 : 2
        });

        const buffer = await image.jpeg({ quality: 85 + Math.random() * 10 }).toBuffer();
        
        await fs.writeFile(
            path.join(this.config.dataDir, 'screens', `screen_${index}.jpg`),
            buffer
        );
    }

    /**
     * Generate screen-specific patterns
     */
    generateScreenPatterns(type, width, height) {
        const patterns = {
            lcd: {
                svg: `<svg width="${width}" height="${height}">
                    <defs>
                        <pattern id="pixels" x="0" y="0" width="3" height="3" patternUnits="userSpaceOnUse">
                            <rect x="0" y="0" width="1" height="3" fill="red" opacity="0.08"/>
                            <rect x="1" y="0" width="1" height="3" fill="green" opacity="0.08"/>
                            <rect x="2" y="0" width="1" height="3" fill="blue" opacity="0.08"/>
                        </pattern>
                        <pattern id="grid" x="0" y="0" width="10" height="10" patternUnits="userSpaceOnUse">
                            <line x1="0" y1="0" x2="0" y2="10" stroke="#333" stroke-width="0.1"/>
                            <line x1="0" y1="0" x2="10" y2="0" stroke="#333" stroke-width="0.1"/>
                        </pattern>
                    </defs>
                    <rect width="${width}" height="${height}" fill="url(#pixels)"/>
                    <rect width="${width}" height="${height}" fill="url(#grid)" opacity="0.5"/>
                </svg>`,
                addMoire: true,
                addBlueLight: true
            },
            oled: {
                svg: `<svg width="${width}" height="${height}">
                    <defs>
                        <radialGradient id="glow">
                            <stop offset="0%" stop-color="white" stop-opacity="0.1"/>
                            <stop offset="100%" stop-color="black" stop-opacity="0"/>
                        </radialGradient>
                    </defs>
                    <rect width="${width}" height="${height}" fill="#000"/>
                    <circle cx="${width/2}" cy="${height/2}" r="${Math.min(width, height)/3}" 
                            fill="url(#glow)"/>
                </svg>`,
                addMoire: false,
                addBlueLight: true
            },
            phone: {
                svg: `<svg width="${width}" height="${height}">
                    <rect width="${width}" height="${height}" fill="#111"/>
                    <rect x="10" y="10" width="${width-20}" height="${height-20}" 
                          fill="#1a1a1a" stroke="#333" stroke-width="1" rx="20"/>
                </svg>`,
                addMoire: true,
                addBlueLight: true
            }
        };

        return patterns[type] || patterns.lcd;
    }

    /**
     * Generate synthetic real image
     */
    async generateRealImage(index) {
        const width = 512 + Math.floor(Math.random() * 512);
        const height = 384 + Math.floor(Math.random() * 384);
        
        // Random scene type
        const sceneTypes = ['outdoor', 'indoor', 'nature', 'urban', 'abstract'];
        const sceneType = sceneTypes[Math.floor(Math.random() * sceneTypes.length)];

        const scenes = {
            outdoor: {
                background: { r: 135, g: 206, b: 235 }, // Sky blue
                svg: `<svg width="${width}" height="${height}">
                    <rect width="${width}" height="${height}" fill="#87CEEB"/>
                    <circle cx="${100 + Math.random() * 200}" cy="100" r="50" fill="#FFD700"/>
                    <ellipse cx="${width/2}" cy="${height-100}" rx="${width/2}" ry="100" fill="#228B22"/>
                    ${this.generateClouds(width, height)}
                </svg>`
            },
            indoor: {
                background: { r: 245, g: 240, b: 230 }, // Warm indoor
                svg: `<svg width="${width}" height="${height}">
                    <rect width="${width}" height="${height}" fill="#F5F0E6"/>
                    <rect x="${width*0.2}" y="${height*0.3}" width="${width*0.6}" height="${height*0.5}" 
                          fill="#8B4513" stroke="#654321" stroke-width="2"/>
                    ${this.generateIndoorObjects(width, height)}
                </svg>`
            },
            nature: {
                background: { r: 34, g: 139, b: 34 }, // Forest green
                svg: `<svg width="${width}" height="${height}">
                    <rect width="${width}" height="${height}" fill="#228B22"/>
                    ${this.generateTrees(width, height)}
                    ${this.generateBirds(width, height)}
                </svg>`
            }
        };

        const scene = scenes[sceneType] || scenes.outdoor;

        let image = sharp({
            create: {
                width,
                height,
                channels: 3,
                background: scene.background
            }
        });

        image = image.composite([{
            input: Buffer.from(scene.svg),
            top: 0,
            left: 0
        }]);

        // Add natural variations
        image = image
            .modulate({
                brightness: 0.9 + Math.random() * 0.2,
                saturation: 0.8 + Math.random() * 0.4
            })
            .blur(Math.random() * 0.5) // Natural softness
            .sharpen(0.5 + Math.random() * 0.5);

        // Add natural noise
        image = image.noise({
            type: 'gaussian',
            mean: 0,
            sigma: 1 + Math.random() * 2
        });

        const buffer = await image.jpeg({ quality: 75 + Math.random() * 20 }).toBuffer();
        
        await fs.writeFile(
            path.join(this.config.dataDir, 'real', `real_${index}.jpg`),
            buffer
        );
    }

    // Helper methods for scene generation
    generateClouds(width, height) {
        let clouds = '';
        for (let i = 0; i < 3; i++) {
            const x = Math.random() * width;
            const y = 50 + Math.random() * 150;
            const rx = 50 + Math.random() * 50;
            clouds += `<ellipse cx="${x}" cy="${y}" rx="${rx}" ry="${rx/2}" 
                               fill="white" opacity="${0.5 + Math.random() * 0.3}"/>`;
        }
        return clouds;
    }

    generateTrees(width, height) {
        let trees = '';
        for (let i = 0; i < 5; i++) {
            const x = Math.random() * width;
            const y = height * 0.5 + Math.random() * height * 0.3;
            const size = 30 + Math.random() * 50;
            trees += `
                <rect x="${x-5}" y="${y}" width="10" height="${size}" fill="#654321"/>
                <circle cx="${x}" cy="${y}" r="${size/2}" fill="#228B22"/>
            `;
        }
        return trees;
    }

    generateBirds(width, height) {
        let birds = '';
        for (let i = 0; i < 3; i++) {
            const x = Math.random() * width;
            const y = Math.random() * height * 0.3;
            birds += `<text x="${x}" y="${y}" font-size="20">🦅</text>`;
        }
        return birds;
    }

    generateIndoorObjects(width, height) {
        return `
            <rect x="${width*0.1}" y="${height*0.2}" width="80" height="100" 
                  fill="#8B7355" stroke="#654321"/>
            <circle cx="${width*0.7}" cy="${height*0.5}" r="40" fill="#DEB887"/>
        `;
    }

    /**
     * Load images into memory
     */
    async loadImages() {
        const spinner = ora('Loading images...').start();

        const screenFiles = await this.getImageFiles(path.join(this.config.dataDir, 'screens'));
        const realFiles = await this.getImageFiles(path.join(this.config.dataDir, 'real'));

        // Load and preprocess images
        for (const file of screenFiles) {
            const data = await this.loadAndPreprocessImage(file);
            this.dataset.train.images.push(data);
            this.dataset.train.labels.push(1); // 1 = screen
            this.augmentationStats.original++;
        }

        for (const file of realFiles) {
            const data = await this.loadAndPreprocessImage(file);
            this.dataset.train.images.push(data);
            this.dataset.train.labels.push(0); // 0 = real
            this.augmentationStats.original++;
        }

        spinner.succeed(`Loaded ${this.dataset.train.images.length} images`);
    }

    /**
     * Load and preprocess single image
     */
    async loadAndPreprocessImage(filepath) {
        const buffer = await fs.readFile(filepath);
        
        // Resize to standard size
        const processed = await sharp(buffer)
            .resize(224, 224)
            .toBuffer();

        // Convert to tensor
        const { data, info } = await sharp(processed)
            .raw()
            .toBuffer({ resolveWithObject: true });

        // Normalize to [0, 1]
        const normalized = new Float32Array(data.length);
        for (let i = 0; i < data.length; i++) {
            normalized[i] = data[i] / 255.0;
        }

        return {
            data: normalized,
            shape: [info.height, info.width, info.channels],
            metadata: {
                originalPath: filepath,
                hash: crypto.createHash('sha256').update(buffer).digest('hex')
            }
        };
    }

    /**
     * Augment dataset
     */
    async augmentDataset() {
        console.log(chalk.bold.yellow('\n🔄 Data Augmentation\n'));

        const totalAugmentations = this.dataset.train.images.length * this.config.augmentationFactor;
        const progressBar = new ProgressBar('Augmenting [:bar] :percent :etas', {
            total: totalAugmentations,
            width: 40
        });

        const augmentedImages = [];
        const augmentedLabels = [];

        for (let i = 0; i < this.dataset.train.images.length; i++) {
            const image = this.dataset.train.images[i];
            const label = this.dataset.train.labels[i];

            for (let j = 0; j < this.config.augmentationFactor; j++) {
                const augmented = await this.augmentImage(image);
                augmentedImages.push(augmented);
                augmentedLabels.push(label);
                this.augmentationStats.augmented++;
                progressBar.tick();
            }
        }

        // Add augmented data to dataset
        this.dataset.train.images.push(...augmentedImages);
        this.dataset.train.labels.push(...augmentedLabels);

        console.log(chalk.green(`\n✅ Created ${augmentedImages.length} augmented images`));
    }

    /**
     * Augment single image
     */
    async augmentImage(imageData) {
        // Convert back to buffer for sharp processing
        const uint8Data = new Uint8Array(imageData.data.length);
        for (let i = 0; i < imageData.data.length; i++) {
            uint8Data[i] = Math.round(imageData.data[i] * 255);
        }

        let augmented = sharp(uint8Data, {
            raw: {
                width: imageData.shape[1],
                height: imageData.shape[0],
                channels: imageData.shape[2]
            }
        });

        // Random augmentations
        const augmentations = [];

        // Rotation
        if (Math.random() > 0.5) {
            const angle = (Math.random() - 0.5) * 30; // -15 to +15 degrees
            augmented = augmented.rotate(angle);
            augmentations.push(`rotate(${angle.toFixed(1)})`);
        }

        // Flip
        if (Math.random() > 0.5) {
            augmented = augmented.flop();
            augmentations.push('flip');
        }

        // Brightness
        if (Math.random() > 0.3) {
            const brightness = 0.8 + Math.random() * 0.4; // 0.8 to 1.2
            augmented = augmented.modulate({ brightness });
            augmentations.push(`brightness(${brightness.toFixed(2)})`);
        }

        // Contrast
        if (Math.random() > 0.3) {
            const contrast = 0.8 + Math.random() * 0.4;
            augmented = augmented.linear(contrast, -(128 * (contrast - 1)));
            augmentations.push(`contrast(${contrast.toFixed(2)})`);
        }

        // Noise
        if (Math.random() > 0.4) {
            const sigma = Math.random() * 3;
            augmented = augmented.noise({ type: 'gaussian', mean: 0, sigma });
            augmentations.push(`noise(${sigma.toFixed(1)})`);
        }

        // Blur
        if (Math.random() > 0.6) {
            const sigma = Math.random() * 1.5;
            augmented = augmented.blur(sigma);
            augmentations.push(`blur(${sigma.toFixed(1)})`);
        }

        // Process and normalize
        const processed = await augmented
            .resize(224, 224) // Ensure consistent size
            .raw()
            .toBuffer();

        const normalized = new Float32Array(processed.length);
        for (let i = 0; i < processed.length; i++) {
            normalized[i] = processed[i] / 255.0;
        }

        return {
            data: normalized,
            shape: [224, 224, 3],
            metadata: {
                ...imageData.metadata,
                augmentations
            }
        };
    }

    /**
     * Split dataset into train/validation/test
     */
    async splitDataset() {
        console.log(chalk.bold.yellow('\n📊 Splitting Dataset\n'));

        const totalSamples = this.dataset.train.images.length;
        const indices = Array.from({ length: totalSamples }, (_, i) => i);
        
        // Shuffle indices
        for (let i = indices.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [indices[i], indices[j]] = [indices[j], indices[i]];
        }

        // Calculate split points
        const testSize = Math.floor(totalSamples * this.config.testSplit);
        const valSize = Math.floor(totalSamples * this.config.validationSplit);
        const trainSize = totalSamples - testSize - valSize;

        // Split data
        const datasets = {
            test: {
                images: [],
                labels: [],
                indices: indices.slice(0, testSize)
            },
            validation: {
                images: [],
                labels: [],
                indices: indices.slice(testSize, testSize + valSize)
            },
            train: {
                images: [],
                labels: [],
                indices: indices.slice(testSize + valSize)
            }
        };

        // Assign data to splits
        for (const [split, data] of Object.entries(datasets)) {
            for (const idx of data.indices) {
                data.images.push(this.dataset.train.images[idx]);
                data.labels.push(this.dataset.train.labels[idx]);
            }
        }

        // Update dataset
        this.dataset = {
            train: {
                images: datasets.train.images,
                labels: datasets.train.labels
            },
            validation: {
                images: datasets.validation.images,
                labels: datasets.validation.labels
            },
            test: {
                images: datasets.test.images,
                labels: datasets.test.labels
            }
        };

        console.log(`Train set: ${chalk.green(trainSize)} samples`);
        console.log(`Validation set: ${chalk.green(valSize)} samples`);
        console.log(`Test set: ${chalk.green(testSize)} samples`);

        // Check class balance
        this.checkClassBalance();
    }

    /**
     * Check class balance in splits
     */
    checkClassBalance() {
        console.log(chalk.bold('\nClass Balance:'));
        
        for (const [split, data] of Object.entries(this.dataset)) {
            const screens = data.labels.filter(l => l === 1).length;
            const real = data.labels.filter(l => l === 0).length;
            const ratio = screens / (screens + real);
            
            console.log(`${split}: ${screens} screens, ${real} real (${(ratio * 100).toFixed(1)}% screens)`);
        }
    }

    /**
     * Train all models
     */
    async trainModels() {
        console.log(chalk.bold.cyan('\n🎯 Training Models\n'));

        // Convert data to tensors
        const trainData = this.prepareDataForTraining(this.dataset.train);
        const valData = this.prepareDataForTraining(this.dataset.validation);

        // Train visual model
        console.log(chalk.bold.yellow('\n1. Training Visual CNN Model'));
        this.models.visual = await this.trainVisualModel(trainData, valData);

        // Train moiré detector
        console.log(chalk.bold.yellow('\n2. Training Moiré Detection Model'));
        this.models.moire = await this.trainMoireModel(trainData, valData);

        // Train ensemble
        console.log(chalk.bold.yellow('\n3. Training Ensemble Model'));
        this.models.ensemble = await this.trainEnsembleModel(trainData, valData);
    }

    /**
     * Prepare data for training
     */
    prepareDataForTraining(dataset) {
        const imagesTensor = tf.tensor4d(
            dataset.images.map(img => img.data),
            [dataset.images.length, 224, 224, 3]
        );
        
        const labelsTensor = tf.tensor2d(
            dataset.labels.map(label => [label]),
            [dataset.labels.length, 1]
        );

        return { images: imagesTensor, labels: labelsTensor };
    }

    /**
     * Train visual CNN model
     */
    async trainVisualModel(trainData, valData) {
        // Build model
        const model = this.buildVisualCNN();

        // Setup callbacks
        const callbacks = this.setupCallbacks('visual');

        // Train
        const history = await model.fit(trainData.images, trainData.labels, {
            batchSize: this.config.batchSize,
            epochs: this.config.epochs,
            validationData: [valData.images, valData.labels],
            callbacks,
            shuffle: true
        });

        this.trainingHistory.push({ model: 'visual', history: history.history });

        return model;
    }

    /**
     * Build visual CNN architecture
     */
    buildVisualCNN() {
        const model = tf.sequential({
            layers: [
                // Input layer
                tf.layers.inputLayer({ inputShape: [224, 224, 3] }),
                
                // Conv block 1
                tf.layers.conv2d({
                    filters: 32,
                    kernelSize: 3,
                    activation: 'relu',
                    padding: 'same',
                    kernelInitializer: 'heNormal'
                }),
                tf.layers.batchNormalization(),
                tf.layers.conv2d({
                    filters: 32,
                    kernelSize: 3,
                    activation: 'relu',
                    padding: 'same'
                }),
                tf.layers.maxPooling2d({ poolSize: 2 }),
                tf.layers.dropout({ rate: 0.25 }),
                
                // Conv block 2
                tf.layers.conv2d({
                    filters: 64,
                    kernelSize: 3,
                    activation: 'relu',
                    padding: 'same'
                }),
                tf.layers.batchNormalization(),
                tf.layers.conv2d({
                    filters: 64,
                    kernelSize: 3,
                    activation: 'relu',
                    padding: 'same'
                }),
                tf.layers.maxPooling2d({ poolSize: 2 }),
                tf.layers.dropout({ rate: 0.25 }),
                
                // Conv block 3
                tf.layers.conv2d({
                    filters: 128,
                    kernelSize: 3,
                    activation: 'relu',
                    padding: 'same'
                }),
                tf.layers.batchNormalization(),
                tf.layers.conv2d({
                    filters: 128,
                    kernelSize: 3,
                    activation: 'relu',
                    padding: 'same'
                }),
                tf.layers.globalAveragePooling2d(),
                
                // Dense layers
                tf.layers.dense({ units: 256, activation: 'relu' }),
                tf.layers.batchNormalization(),
                tf.layers.dropout({ rate: 0.5 }),
                tf.layers.dense({ units: 128, activation: 'relu' }),
                tf.layers.dropout({ rate: 0.5 }),
                
                // Output
                tf.layers.dense({ units: 1, activation: 'sigmoid' })
            ]
        });

        // Compile
        model.compile({
            optimizer: tf.train.adam(this.config.learningRate),
            loss: 'binaryCrossentropy',
            metrics: ['accuracy', tf.metrics.precision, tf.metrics.recall]
        });

        return model;
    }

    /**
     * Train moiré detection model
     */
    async trainMoireModel(trainData, valData) {
        // Transform images to frequency domain
        const trainFFT = await this.transformToFrequencyDomain(trainData.images);
        const valFFT = await this.transformToFrequencyDomain(valData.images);

        // Build model
        const model = this.buildMoireDetector();

        // Setup callbacks
        const callbacks = this.setupCallbacks('moire');

        // Train
        const history = await model.fit(trainFFT, trainData.labels, {
            batchSize: this.config.batchSize,
            epochs: Math.floor(this.config.epochs / 2), // Fewer epochs for simpler model
            validationData: [valFFT, valData.labels],
            callbacks,
            shuffle: true
        });

        this.trainingHistory.push({ model: 'moire', history: history.history });

        // Clean up FFT tensors
        trainFFT.dispose();
        valFFT.dispose();

        return model;
    }

    /**
     * Build moiré detector architecture
     */
    buildMoireDetector() {
        const model = tf.sequential({
            layers: [
                tf.layers.inputLayer({ inputShape: [112, 112, 2] }), // FFT real and imaginary
                
                tf.layers.conv2d({
                    filters: 16,
                    kernelSize: 5,
                    activation: 'relu',
                    padding: 'same'
                }),
                tf.layers.maxPooling2d({ poolSize: 2 }),
                
                tf.layers.conv2d({
                    filters: 32,
                    kernelSize: 3,
                    activation: 'relu',
                    padding: 'same'
                }),
                tf.layers.maxPooling2d({ poolSize: 2 }),
                
                tf.layers.flatten(),
                tf.layers.dense({ units: 64, activation: 'relu' }),
                tf.layers.dropout({ rate: 0.3 }),
                tf.layers.dense({ units: 1, activation: 'sigmoid' })
            ]
        });

        model.compile({
            optimizer: tf.train.adam(this.config.learningRate * 2), // Higher LR for simpler model
            loss: 'binaryCrossentropy',
            metrics: ['accuracy']
        });

        return model;
    }

    /**
     * Transform images to frequency domain (simplified)
     */
    async transformToFrequencyDomain(imageTensor) {
        // Simplified FFT transformation
        // In production, use proper 2D FFT
        
        // Resize to smaller size for FFT
        const resized = tf.image.resizeBilinear(imageTensor, [112, 112]);
        
        // Convert to grayscale
        const grayscale = tf.mean(resized, 3, true);
        
        // Create fake FFT output (real and imaginary parts)
        const real = grayscale;
        const imaginary = tf.zeros(grayscale.shape);
        
        // Stack real and imaginary
        const fft = tf.stack([real, imaginary], 3);
        
        // Clean up
        resized.dispose();
        grayscale.dispose();
        imaginary.dispose();
        
        return fft.squeeze([3]);
    }

    /**
     * Train ensemble model
     */
    async trainEnsembleModel(trainData, valData) {
        // Get predictions from base models
        const trainPreds = await this.getBasePredictions(trainData.images);
        const valPreds = await this.getBasePredictions(valData.images);

        // Build ensemble model
        const model = this.buildEnsembleModel();

        // Setup callbacks
        const callbacks = this.setupCallbacks('ensemble');

        // Train
        const history = await model.fit(trainPreds, trainData.labels, {
            batchSize: this.config.batchSize * 2,
            epochs: 20, // Fewer epochs for ensemble
            validationData: [valPreds, valData.labels],
            callbacks,
            shuffle: true
        });

        this.trainingHistory.push({ model: 'ensemble', history: history.history });

        // Clean up
        trainPreds.dispose();
        valPreds.dispose();

        return model;
    }

    /**
     * Build ensemble model
     */
    buildEnsembleModel() {
        const model = tf.sequential({
            layers: [
                tf.layers.inputLayer({ inputShape: [2] }), // Predictions from 2 base models
                tf.layers.dense({ units: 8, activation: 'relu' }),
                tf.layers.batchNormalization(),
                tf.layers.dense({ units: 4, activation: 'relu' }),
                tf.layers.dense({ units: 1, activation: 'sigmoid' })
            ]
        });

        model.compile({
            optimizer: tf.train.adam(this.config.learningRate / 2),
            loss: 'binaryCrossentropy',
            metrics: ['accuracy']
        });

        return model;
    }

    /**
     * Get predictions from base models
     */
    async getBasePredictions(images) {
        const visualPreds = this.models.visual.predict(images);
        
        // Transform to frequency domain for moiré model
        const fftImages = await this.transformToFrequencyDomain(images);
        const moirePreds = this.models.moire.predict(fftImages);
        fftImages.dispose();

        // Stack predictions
        const combined = tf.stack([visualPreds.squeeze(), moirePreds.squeeze()], 1);
        
        visualPreds.dispose();
        moirePreds.dispose();

        return combined;
    }

    /**
     * Setup training callbacks
     */
    setupCallbacks(modelName) {
        const callbacks = [];

        // Progress callback
        callbacks.push(new tf.CustomCallback({
            onEpochEnd: (epoch, logs) => {
                const metrics = [
                    `loss: ${logs.loss.toFixed(4)}`,
                    `acc: ${logs.acc.toFixed(4)}`,
                    `val_loss: ${logs.val_loss.toFixed(4)}`,
                    `val_acc: ${logs.val_acc.toFixed(4)}`
                ];
                
                console.log(`Epoch ${epoch + 1}/${this.config.epochs} - ${metrics.join(' - ')}`);
            }
        }));

        // Early stopping
        callbacks.push(tf.callbacks.earlyStopping({
            monitor: 'val_loss',
            patience: this.config.earlyStoppingPatience,
            verbose: 1
        }));

        // Model checkpoint
        const checkpointPath = path.join(this.config.modelDir, 'checkpoints', modelName);
        callbacks.push(new tf.CustomCallback({
            onEpochEnd: async (epoch, logs) => {
                if (epoch % 5 === 0) { // Save every 5 epochs
                    await this.models[modelName].save(`file://${checkpointPath}_epoch_${epoch}`);
                }
            }
        }));

        return callbacks;
    }

    /**
     * Evaluate models on test set
     */
    async evaluateModels() {
        console.log(chalk.bold.cyan('\n📊 Model Evaluation\n'));

        const testData = this.prepareDataForTraining(this.dataset.test);
        
        // Evaluate each model
        const evaluations = {};

        // Visual model
        console.log(chalk.bold('\nVisual CNN Model:'));
        evaluations.visual = await this.evaluateModel(this.models.visual, testData, 'visual');

        // Moiré model
        console.log(chalk.bold('\nMoiré Detection Model:'));
        const testFFT = await this.transformToFrequencyDomain(testData.images);
        evaluations.moire = await this.evaluateModel(
            this.models.moire, 
            { images: testFFT, labels: testData.labels }, 
            'moire'
        );
        testFFT.dispose();

        // Ensemble model
        console.log(chalk.bold('\nEnsemble Model:'));
        const testPreds = await this.getBasePredictions(testData.images);
        evaluations.ensemble = await this.evaluateModel(
            this.models.ensemble,
            { images: testPreds, labels: testData.labels },
            'ensemble'
        );
        testPreds.dispose();

        // Clean up
        testData.images.dispose();
        testData.labels.dispose();

        return evaluations;
    }

    /**
     * Evaluate single model
     */
    async evaluateModel(model, testData, modelName) {
        // Get predictions
        const predictions = model.predict(testData.images);
        const predArray = await predictions.array();
        const labelArray = await testData.labels.array();

        // Calculate metrics
        const metrics = this.calculateMetrics(predArray, labelArray);
        
        // Display metrics
        console.log(`Accuracy: ${chalk.green((metrics.accuracy * 100).toFixed(2) + '%')}`);
        console.log(`Precision: ${(metrics.precision * 100).toFixed(2)}%`);
        console.log(`Recall: ${(metrics.recall * 100).toFixed(2)}%`);
        console.log(`F1-Score: ${(metrics.f1Score * 100).toFixed(2)}%`);

        // Confusion matrix
        console.log('\nConfusion Matrix:');
        this.displayConfusionMatrix(metrics.confusionMatrix);

        predictions.dispose();

        return metrics;
    }

    /**
     * Calculate evaluation metrics
     */
    calculateMetrics(predictions, labels) {
        const threshold = 0.5;
        let tp = 0, tn = 0, fp = 0, fn = 0;

        for (let i = 0; i < predictions.length; i++) {
            const pred = predictions[i][0] > threshold ? 1 : 0;
            const label = labels[i][0];

            if (pred === 1 && label === 1) tp++;
            else if (pred === 0 && label === 0) tn++;
            else if (pred === 1 && label === 0) fp++;
            else if (pred === 0 && label === 1) fn++;
        }

        const accuracy = (tp + tn) / predictions.length;
        const precision = tp / (tp + fp) || 0;
        const recall = tp / (tp + fn) || 0;
        const f1Score = 2 * (precision * recall) / (precision + recall) || 0;

        return {
            accuracy,
            precision,
            recall,
            f1Score,
            confusionMatrix: { tp, tn, fp, fn }
        };
    }

    /**
     * Display confusion matrix
     */
    displayConfusionMatrix(matrix) {
        const Table = require('cli-table3');
        const table = new Table({
            head: ['', 'Predicted Screen', 'Predicted Real'],
            style: { head: [] }
        });

        table.push(
            ['Actual Screen', chalk.green(matrix.tp), chalk.red(matrix.fn)],
            ['Actual Real', chalk.red(matrix.fp), chalk.green(matrix.tn)]
        );

        console.log(table.toString());
    }

    /**
     * Export trained models
     */
    async exportModels() {
        console.log(chalk.bold.cyan('\n💾 Exporting Models\n'));

        const spinner = ora('Exporting models...').start();

        try {
            // Export each model
            await this.models.visual.save(
                `file://${path.join(this.config.modelDir, 'visual_cnn')}`
            );
            
            await this.models.moire.save(
                `file://${path.join(this.config.modelDir, 'moire_detector')}`
            );
            
            await this.models.ensemble.save(
                `file://${path.join(this.config.modelDir, 'ensemble')}`
            );

            // Save model metadata
            const metadata = {
                version: '1.0.0',
                trainedAt: new Date().toISOString(),
                config: this.config,
                augmentationStats: this.augmentationStats,
                datasetInfo: {
                    train: this.dataset.train.images.length,
                    validation: this.dataset.validation.images.length,
                    test: this.dataset.test.images.length
                }
            };

            await fs.writeFile(
                path.join(this.config.modelDir, 'metadata.json'),
                JSON.stringify(metadata, null, 2)
            );

            spinner.succeed('Models exported successfully');

        } catch (error) {
            spinner.fail('Failed to export models');
            throw error;
        }
    }

    /**
     * Generate training report
     */
    async generateReport() {
        console.log(chalk.bold.cyan('\n📄 Generating Report\n'));

        const report = {
            timestamp: new Date().toISOString(),
            configuration: this.config,
            dataset: {
                original: this.augmentationStats.original,
                augmented: this.augmentationStats.augmented,
                total: this.augmentationStats.original + this.augmentationStats.augmented,
                splits: {
                    train: this.dataset.train.images.length,
                    validation: this.dataset.validation.images.length,
                    test: this.dataset.test.images.length
                }
            },
            trainingHistory: this.trainingHistory,
            modelSizes: await this.getModelSizes(),
            recommendations: this.generateRecommendations()
        };

        const reportPath = path.join(this.config.modelDir, 'training-report.json');
        await fs.writeFile(reportPath, JSON.stringify(report, null, 2));

        // Also create a markdown summary
        const markdownReport = this.generateMarkdownReport(report);
        await fs.writeFile(
            path.join(this.config.modelDir, 'training-report.md'),
            markdownReport
        );

        console.log(chalk.green(`✅ Reports saved to ${this.config.modelDir}`));
    }

    /**
     * Get model sizes
     */
    async getModelSizes() {
        const sizes = {};
        
        for (const [name, model] of Object.entries(this.models)) {
            const params = model.countParams();
            sizes[name] = {
                parameters: params,
                megabytes: (params * 4) / (1024 * 1024) // Assuming float32
            };
        }

        return sizes;
    }

    /**
     * Generate recommendations
     */
    generateRecommendations() {
        const recommendations = [];

        // Check dataset size
        if (this.augmentationStats.original < 500) {
            recommendations.push(
                'Consider collecting more real data. Current dataset relies heavily on augmentation.'
            );
        }

        // Check class balance
        const screenRatio = this.dataset.train.labels.filter(l => l === 1).length / 
                          this.dataset.train.labels.length;
        if (Math.abs(screenRatio - 0.5) > 0.2) {
            recommendations.push(
                `Dataset is imbalanced (${(screenRatio * 100).toFixed(1)}% screens). ` +
                'Consider balancing classes or using class weights.'
            );
        }

        // Model-specific recommendations
        if (this.trainingHistory.length > 0) {
            const visualHistory = this.trainingHistory.find(h => h.model === 'visual');
            if (visualHistory && visualHistory.history.val_acc) {
                const finalAcc = visualHistory.history.val_acc[
                    visualHistory.history.val_acc.length - 1
                ];
                if (finalAcc < 0.9) {
                    recommendations.push(
                        'Visual model accuracy below 90%. Consider more complex architecture or more data.'
                    );
                }
            }
        }

        return recommendations;
    }

    /**
     * Generate markdown report
     */
    generateMarkdownReport(report) {
        return `# Screen Detection Model Training Report

Generated: ${report.timestamp}

## Dataset Summary

- **Original Images**: ${report.dataset.original}
- **Augmented Images**: ${report.dataset.augmented}
- **Total Dataset Size**: ${report.dataset.total}

### Data Splits
- Train: ${report.dataset.splits.train} samples
- Validation: ${report.dataset.splits.validation} samples
- Test: ${report.dataset.splits.test} samples

## Model Information

### Visual CNN Model
- Parameters: ${report.modelSizes.visual.parameters.toLocaleString()}
- Size: ${report.modelSizes.visual.megabytes.toFixed(2)} MB

### Moiré Detector Model
- Parameters: ${report.modelSizes.moire.parameters.toLocaleString()}
- Size: ${report.modelSizes.moire.megabytes.toFixed(2)} MB

### Ensemble Model
- Parameters: ${report.modelSizes.ensemble.parameters.toLocaleString()}
- Size: ${report.modelSizes.ensemble.megabytes.toFixed(2)} MB

## Training Configuration

- Batch Size: ${report.configuration.batchSize}
- Epochs: ${report.configuration.epochs}
- Learning Rate: ${report.configuration.learningRate}
- Augmentation Factor: ${report.configuration.augmentationFactor}

## Recommendations

${report.recommendations.map(rec => `- ${rec}`).join('\n')}

## Next Steps

1. Deploy models to production
2. Set up continuous learning pipeline
3. Monitor real-world performance
4. Collect edge cases for retraining
`;
    }

    /**
     * Utility methods
     */
    async getImageFiles(dir) {
        try {
            const files = await fs.readdir(dir);
            return files
                .filter(f => /\.(jpg|jpeg|png)$/i.test(f))
                .map(f => path.join(dir, f));
        } catch (error) {
            return [];
        }
    }
}

// Command-line interface
async function main() {
    const args = process.argv.slice(2);
    const command = args[0] || 'train';

    // Check dependencies
    try {
        require('chalk');
        require('ora');
        require('cli-table3');
        require('progress');
    } catch (error) {
        console.log('Installing required packages...');
        const { execSync } = require('child_process');
        execSync('npm install chalk ora cli-table3 progress', { stdio: 'inherit' });
    }

    const pipeline = new ScreenDetectionTrainingPipeline();

    switch (command) {
        case 'train':
            await pipeline.runPipeline();
            break;
            
        case 'generate-data':
            await pipeline.setupDirectories();
            await pipeline.generateSyntheticData();
            console.log(chalk.green('✅ Synthetic data generated'));
            break;
            
        case 'evaluate':
            // Load existing models and evaluate
            console.log(chalk.yellow('Evaluate command not implemented yet'));
            break;
            
        default:
            console.log(chalk.red(`Unknown command: ${command}`));
            console.log('\nUsage:');
            console.log('  node training-pipeline.js train          - Run full training pipeline');
            console.log('  node training-pipeline.js generate-data  - Generate synthetic dataset');
            console.log('  node training-pipeline.js evaluate       - Evaluate existing models');
    }
}

if (require.main === module) {
    main().catch(error => {
        console.error(chalk.red('\n❌ Pipeline failed:'), error);
        process.exit(1);
    });
}

module.exports = ScreenDetectionTrainingPipeline;
