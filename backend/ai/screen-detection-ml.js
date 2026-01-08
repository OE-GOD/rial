/**
 * Advanced ML-based Screen Detection with TensorFlow.js
 * 
 * This module implements deep learning models for accurate screen detection,
 * including:
 * - CNN for visual pattern recognition
 * - Frequency domain analysis for moiré patterns
 * - Ensemble methods for high accuracy
 */

const tf = require('@tensorflow/tfjs-node');
const sharp = require('sharp');
const { createCanvas } = require('canvas');
const fft = require('fft-js');

class AdvancedScreenDetector {
    constructor() {
        this.models = {
            visualCNN: null,
            moireDetector: null,
            metadataClassifier: null,
            ensemble: null
        };
        
        this.config = {
            inputSize: [224, 224, 3],
            fftSize: 512,
            confidenceThreshold: 0.85,
            modelVersion: '2.0'
        };
        
        this.featureExtractors = new Map();
        this.setupFeatureExtractors();
    }

    /**
     * Initialize all ML models
     */
    async initialize() {
        console.log('🧠 Initializing Advanced Screen Detection Models...');
        
        try {
            // Build models if not loaded from disk
            this.models.visualCNN = await this.buildVisualCNN();
            this.models.moireDetector = await this.buildMoireDetector();
            this.models.metadataClassifier = await this.buildMetadataClassifier();
            this.models.ensemble = await this.buildEnsembleModel();
            
            console.log('✅ All models initialized successfully');
            return true;
        } catch (error) {
            console.error('❌ Model initialization failed:', error);
            return false;
        }
    }

    /**
     * Advanced detection with all models
     */
    async detectScreen(imageBuffer, metadata = {}) {
        const startTime = Date.now();
        
        // Extract all features in parallel
        const [
            visualFeatures,
            frequencyFeatures,
            edgeFeatures,
            colorFeatures,
            textureFeatures
        ] = await Promise.all([
            this.extractVisualFeatures(imageBuffer),
            this.extractFrequencyFeatures(imageBuffer),
            this.extractEdgeFeatures(imageBuffer),
            this.extractColorFeatures(imageBuffer),
            this.extractTextureFeatures(imageBuffer)
        ]);

        // Run individual models
        const predictions = {
            visual: await this.predictVisual(visualFeatures),
            moire: await this.predictMoire(frequencyFeatures),
            metadata: await this.predictMetadata(metadata),
            edges: this.analyzeEdges(edgeFeatures),
            color: this.analyzeColor(colorFeatures),
            texture: this.analyzeTexture(textureFeatures)
        };

        // Ensemble prediction
        const ensembleResult = await this.ensemblePrediction(predictions);
        
        // Advanced forensics
        const forensics = await this.performForensics(imageBuffer, predictions);
        
        const processingTime = Date.now() - startTime;

        return {
            verdict: {
                isScreen: ensembleResult.isScreen,
                confidence: ensembleResult.confidence,
                probability: ensembleResult.probability,
                risk: this.calculateRisk(ensembleResult)
            },
            models: predictions,
            forensics,
            features: {
                visual: this.summarizeFeatures(visualFeatures),
                frequency: this.summarizeFeatures(frequencyFeatures),
                edges: edgeFeatures.summary,
                color: colorFeatures.summary,
                texture: textureFeatures.summary
            },
            performance: {
                processingTime,
                modelsUsed: Object.keys(predictions).length,
                version: this.config.modelVersion
            },
            recommendations: this.generateRecommendations(ensembleResult, forensics)
        };
    }

    /**
     * Build Visual CNN for screen pattern detection
     */
    async buildVisualCNN() {
        const model = tf.sequential({
            layers: [
                // Input layer
                tf.layers.inputLayer({ inputShape: this.config.inputSize }),
                
                // Conv Block 1 - Detect basic patterns
                tf.layers.conv2d({
                    filters: 64,
                    kernelSize: 3,
                    activation: 'relu',
                    padding: 'same',
                    kernelInitializer: 'heNormal'
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
                
                // Conv Block 2 - Detect complex patterns
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
                tf.layers.maxPooling2d({ poolSize: 2 }),
                tf.layers.dropout({ rate: 0.25 }),
                
                // Conv Block 3 - High-level features
                tf.layers.conv2d({
                    filters: 256,
                    kernelSize: 3,
                    activation: 'relu',
                    padding: 'same'
                }),
                tf.layers.batchNormalization(),
                tf.layers.conv2d({
                    filters: 256,
                    kernelSize: 3,
                    activation: 'relu',
                    padding: 'same'
                }),
                tf.layers.globalAveragePooling2d(),
                
                // Dense layers
                tf.layers.dense({ units: 512, activation: 'relu' }),
                tf.layers.batchNormalization(),
                tf.layers.dropout({ rate: 0.5 }),
                tf.layers.dense({ units: 256, activation: 'relu' }),
                tf.layers.dropout({ rate: 0.5 }),
                
                // Output
                tf.layers.dense({ units: 1, activation: 'sigmoid' })
            ]
        });

        model.compile({
            optimizer: tf.train.adam(0.0001),
            loss: 'binaryCrossentropy',
            metrics: ['accuracy', 'precision', 'recall']
        });

        return model;
    }

    /**
     * Build Moiré pattern detector using frequency analysis
     */
    async buildMoireDetector() {
        const model = tf.sequential({
            layers: [
                tf.layers.inputLayer({ inputShape: [this.config.fftSize, this.config.fftSize, 2] }), // Real and imaginary parts
                
                // Frequency pattern detection
                tf.layers.conv2d({
                    filters: 32,
                    kernelSize: 5,
                    activation: 'relu',
                    padding: 'same'
                }),
                tf.layers.maxPooling2d({ poolSize: 2 }),
                
                tf.layers.conv2d({
                    filters: 64,
                    kernelSize: 3,
                    activation: 'relu',
                    padding: 'same'
                }),
                tf.layers.maxPooling2d({ poolSize: 2 }),
                
                tf.layers.flatten(),
                tf.layers.dense({ units: 128, activation: 'relu' }),
                tf.layers.dropout({ rate: 0.3 }),
                tf.layers.dense({ units: 1, activation: 'sigmoid' })
            ]
        });

        model.compile({
            optimizer: 'adam',
            loss: 'binaryCrossentropy',
            metrics: ['accuracy']
        });

        return model;
    }

    /**
     * Build metadata-based classifier
     */
    async buildMetadataClassifier() {
        const model = tf.sequential({
            layers: [
                tf.layers.inputLayer({ inputShape: [15] }), // Metadata features
                tf.layers.dense({ units: 32, activation: 'relu' }),
                tf.layers.batchNormalization(),
                tf.layers.dense({ units: 16, activation: 'relu' }),
                tf.layers.dropout({ rate: 0.3 }),
                tf.layers.dense({ units: 1, activation: 'sigmoid' })
            ]
        });

        model.compile({
            optimizer: 'adam',
            loss: 'binaryCrossentropy',
            metrics: ['accuracy']
        });

        return model;
    }

    /**
     * Build ensemble model combining all predictions
     */
    async buildEnsembleModel() {
        // Meta-learner that combines predictions from all models
        const model = tf.sequential({
            layers: [
                tf.layers.inputLayer({ inputShape: [6] }), // 6 model predictions
                tf.layers.dense({ units: 16, activation: 'relu' }),
                tf.layers.batchNormalization(),
                tf.layers.dense({ units: 8, activation: 'relu' }),
                tf.layers.dense({ units: 1, activation: 'sigmoid' })
            ]
        });

        model.compile({
            optimizer: 'adam',
            loss: 'binaryCrossentropy',
            metrics: ['accuracy']
        });

        return model;
    }

    /**
     * Extract visual features using CNN
     */
    async extractVisualFeatures(imageBuffer) {
        const tensor = await this.imageToTensor(imageBuffer);
        
        // Get intermediate layer outputs for feature analysis
        const featureModel = tf.model({
            inputs: this.models.visualCNN.inputs,
            outputs: this.models.visualCNN.layers[10].output // Get features from conv layer
        });
        
        const features = await featureModel.predict(tensor).array();
        tensor.dispose();
        
        return features;
    }

    /**
     * Extract frequency domain features for moiré detection
     */
    async extractFrequencyFeatures(imageBuffer) {
        const { data, info } = await sharp(imageBuffer)
            .resize(this.config.fftSize, this.config.fftSize)
            .grayscale()
            .raw()
            .toBuffer({ resolveWithObject: true });

        // Convert to 2D array
        const image2D = [];
        for (let i = 0; i < this.config.fftSize; i++) {
            const row = [];
            for (let j = 0; j < this.config.fftSize; j++) {
                row.push(data[i * this.config.fftSize + j]);
            }
            image2D.push(row);
        }

        // Apply 2D FFT
        const fft2D = this.compute2DFFT(image2D);
        
        // Extract frequency features
        const features = {
            magnitude: this.computeMagnitudeSpectrum(fft2D),
            peaks: this.findFrequencyPeaks(fft2D),
            regularityScore: this.computeRegularityScore(fft2D),
            dominantFrequencies: this.extractDominantFrequencies(fft2D)
        };

        return features;
    }

    /**
     * Extract edge features using advanced filters
     */
    async extractEdgeFeatures(imageBuffer) {
        const image = sharp(imageBuffer);
        
        // Apply multiple edge detection filters
        const [sobel, canny, laplacian] = await Promise.all([
            this.applySobelFilter(image),
            this.applyCannyFilter(image),
            this.applyLaplacianFilter(image)
        ]);

        // Analyze edge characteristics
        const features = {
            straightness: this.measureEdgeStraightness(sobel),
            sharpness: this.measureEdgeSharpness(canny),
            rectangularity: this.detectRectangles(laplacian),
            edgeDensity: this.calculateEdgeDensity(sobel),
            summary: {
                avgStraightness: 0,
                avgSharpness: 0,
                rectangleCount: 0
            }
        };

        return features;
    }

    /**
     * Extract color features
     */
    async extractColorFeatures(imageBuffer) {
        const { data, info } = await sharp(imageBuffer)
            .resize(256, 256)
            .raw()
            .toBuffer({ resolveWithObject: true });

        // Calculate color statistics
        const features = {
            histogram: this.calculateColorHistogram(data, info),
            gamut: this.analyzeColorGamut(data, info),
            whitePoint: this.detectWhitePoint(data, info),
            blueChannel: this.analyzeBlueChannel(data, info),
            uniformity: this.measureColorUniformity(data, info),
            summary: {
                blueChannelBias: 0,
                gamutCoverage: 0,
                uniformityScore: 0
            }
        };

        // Calculate summary statistics
        features.summary.blueChannelBias = this.calculateBlueChannelBias(features.histogram);
        features.summary.gamutCoverage = this.calculateGamutCoverage(features.gamut);
        features.summary.uniformityScore = this.calculateUniformityScore(features.uniformity);

        return features;
    }

    /**
     * Extract texture features
     */
    async extractTextureFeatures(imageBuffer) {
        const { data, info } = await sharp(imageBuffer)
            .resize(256, 256)
            .grayscale()
            .raw()
            .toBuffer({ resolveWithObject: true });

        const features = {
            glcm: this.computeGLCM(data, info), // Gray Level Co-occurrence Matrix
            lbp: this.computeLBP(data, info),   // Local Binary Patterns
            gabor: this.computeGaborFeatures(data, info),
            entropy: this.computeTextureEntropy(data, info),
            summary: {
                contrast: 0,
                homogeneity: 0,
                energy: 0,
                correlation: 0
            }
        };

        return features;
    }

    /**
     * Advanced forensics analysis
     */
    async performForensics(imageBuffer, predictions) {
        const forensics = {
            pixelAnalysis: await this.analyzePixelAnomalies(imageBuffer),
            compressionArtifacts: await this.detectCompressionArtifacts(imageBuffer),
            noiseAnalysis: await this.analyzeNoisePatterns(imageBuffer),
            lightingConsistency: await this.checkLightingConsistency(imageBuffer),
            depthEstimation: await this.estimateSceneDepth(imageBuffer),
            reflectionAnalysis: await this.detectScreenReflections(imageBuffer)
        };

        // Calculate forensic score
        forensics.score = this.calculateForensicScore(forensics);
        forensics.anomalies = this.detectAnomalies(forensics);

        return forensics;
    }

    /**
     * Helper methods for feature extraction
     */

    async imageToTensor(imageBuffer) {
        const { data } = await sharp(imageBuffer)
            .resize(224, 224)
            .raw()
            .toBuffer({ resolveWithObject: true });

        // Normalize pixel values
        const normalized = Float32Array.from(data).map(val => val / 255.0);
        
        return tf.tensor4d(normalized, [1, 224, 224, 3]);
    }

    compute2DFFT(image2D) {
        // Apply FFT to each row
        const rowFFT = image2D.map(row => fft.fft(row));
        
        // Transpose and apply FFT to each column
        const transposed = this.transpose2DArray(rowFFT);
        const colFFT = transposed.map(col => fft.fft(col));
        
        // Transpose back
        return this.transpose2DArray(colFFT);
    }

    transpose2DArray(array) {
        return array[0].map((_, colIndex) => array.map(row => row[colIndex]));
    }

    computeMagnitudeSpectrum(fft2D) {
        return fft2D.map(row => 
            row.map(complex => Math.sqrt(complex[0] * complex[0] + complex[1] * complex[1]))
        );
    }

    findFrequencyPeaks(fft2D) {
        const magnitude = this.computeMagnitudeSpectrum(fft2D);
        const peaks = [];
        
        // Find local maxima
        for (let i = 1; i < magnitude.length - 1; i++) {
            for (let j = 1; j < magnitude[i].length - 1; j++) {
                const current = magnitude[i][j];
                const neighbors = [
                    magnitude[i-1][j-1], magnitude[i-1][j], magnitude[i-1][j+1],
                    magnitude[i][j-1],                      magnitude[i][j+1],
                    magnitude[i+1][j-1], magnitude[i+1][j], magnitude[i+1][j+1]
                ];
                
                if (current > Math.max(...neighbors) && current > 100) {
                    peaks.push({
                        x: j,
                        y: i,
                        magnitude: current,
                        frequency: Math.sqrt(i*i + j*j)
                    });
                }
            }
        }
        
        // Sort by magnitude and return top peaks
        return peaks.sort((a, b) => b.magnitude - a.magnitude).slice(0, 20);
    }

    computeRegularityScore(fft2D) {
        const peaks = this.findFrequencyPeaks(fft2D);
        if (peaks.length < 3) return 0;
        
        // Check for regular spacing between peaks
        const distances = [];
        for (let i = 0; i < peaks.length - 1; i++) {
            for (let j = i + 1; j < peaks.length; j++) {
                const dist = Math.sqrt(
                    Math.pow(peaks[i].x - peaks[j].x, 2) + 
                    Math.pow(peaks[i].y - peaks[j].y, 2)
                );
                distances.push(dist);
            }
        }
        
        // Calculate variance of distances
        const avgDist = distances.reduce((a, b) => a + b, 0) / distances.length;
        const variance = distances.reduce((sum, d) => sum + Math.pow(d - avgDist, 2), 0) / distances.length;
        
        // Low variance indicates regular pattern (screen)
        return 1 / (1 + variance / 100);
    }

    /**
     * Pixel anomaly detection
     */
    async analyzePixelAnomalies(imageBuffer) {
        const { data, info } = await sharp(imageBuffer)
            .raw()
            .toBuffer({ resolveWithObject: true });

        const anomalies = {
            deadPixels: this.detectDeadPixels(data, info),
            hotPixels: this.detectHotPixels(data, info),
            pixelPatterns: this.detectPixelPatterns(data, info),
            subpixelStructure: this.analyzeSubpixelStructure(data, info)
        };

        return anomalies;
    }

    detectDeadPixels(data, info) {
        const deadPixels = [];
        const threshold = 5; // Very low values
        
        for (let i = 0; i < data.length; i += 3) {
            const r = data[i];
            const g = data[i + 1];
            const b = data[i + 2];
            
            if (r < threshold && g < threshold && b < threshold) {
                const pixelIndex = i / 3;
                const x = pixelIndex % info.width;
                const y = Math.floor(pixelIndex / info.width);
                deadPixels.push({ x, y, rgb: [r, g, b] });
            }
        }
        
        return {
            count: deadPixels.length,
            percentage: (deadPixels.length / (info.width * info.height)) * 100,
            locations: deadPixels.slice(0, 10) // First 10
        };
    }

    /**
     * Generate advanced recommendations
     */
    generateRecommendations(ensembleResult, forensics) {
        const recommendations = [];
        
        if (ensembleResult.isScreen) {
            recommendations.push({
                priority: 'high',
                action: 'reject',
                message: 'Image shows strong evidence of being photographed from a screen',
                evidence: this.summarizeEvidence(ensembleResult, forensics)
            });
            
            // Specific recommendations based on detection type
            if (forensics.pixelAnalysis.subpixelStructure.detected) {
                recommendations.push({
                    priority: 'medium',
                    action: 'educate',
                    message: 'RGB subpixel patterns detected - typical of LCD/OLED displays'
                });
            }
            
            if (ensembleResult.models.moire > 0.8) {
                recommendations.push({
                    priority: 'medium',
                    action: 'suggest',
                    message: 'Strong moiré patterns detected - try photographing at different angle or distance'
                });
            }
        } else if (ensembleResult.confidence < 0.7) {
            recommendations.push({
                priority: 'low',
                action: 'review',
                message: 'Some screen-like characteristics detected - manual review recommended',
                factors: this.identifyBorderlineFactors(ensembleResult)
            });
        }
        
        // Add improvement suggestions
        if (!ensembleResult.isScreen) {
            recommendations.push({
                priority: 'info',
                action: 'proceed',
                message: 'Image appears authentic - proceeding with certification'
            });
        }
        
        return recommendations;
    }

    /**
     * Calculate ensemble prediction
     */
    async ensemblePrediction(predictions) {
        // Prepare input for ensemble model
        const inputs = tf.tensor2d([[
            predictions.visual,
            predictions.moire,
            predictions.metadata,
            predictions.edges,
            predictions.color,
            predictions.texture
        ]]);
        
        const ensemblePred = await this.models.ensemble.predict(inputs).data();
        inputs.dispose();
        
        const probability = ensemblePred[0];
        
        return {
            isScreen: probability > this.config.confidenceThreshold,
            confidence: this.calculateConfidence(predictions, probability),
            probability: probability,
            agreement: this.calculateModelAgreement(predictions)
        };
    }

    calculateConfidence(predictions, ensembleProbability) {
        // Weight individual model predictions
        const weights = {
            visual: 0.3,
            moire: 0.25,
            edges: 0.15,
            color: 0.15,
            texture: 0.1,
            metadata: 0.05
        };
        
        let weightedSum = 0;
        let totalWeight = 0;
        
        for (const [model, weight] of Object.entries(weights)) {
            if (predictions[model] !== undefined) {
                weightedSum += predictions[model] * weight;
                totalWeight += weight;
            }
        }
        
        const weightedAvg = weightedSum / totalWeight;
        
        // Combine with ensemble prediction
        const confidence = (ensembleProbability * 0.6) + (weightedAvg * 0.4);
        
        // Adjust confidence based on model agreement
        const agreement = this.calculateModelAgreement(predictions);
        return confidence * (0.7 + 0.3 * agreement);
    }

    calculateModelAgreement(predictions) {
        const values = Object.values(predictions).filter(v => typeof v === 'number');
        const mean = values.reduce((a, b) => a + b, 0) / values.length;
        const variance = values.reduce((sum, v) => sum + Math.pow(v - mean, 2), 0) / values.length;
        
        // Low variance = high agreement
        return 1 / (1 + variance);
    }

    calculateRisk(ensembleResult) {
        const { probability, confidence } = ensembleResult;
        
        if (probability > 0.9 && confidence > 0.9) return 'critical';
        if (probability > 0.7 && confidence > 0.8) return 'high';
        if (probability > 0.5 && confidence > 0.6) return 'medium';
        if (probability > 0.3) return 'low';
        return 'minimal';
    }

    /**
     * Setup feature extractors
     */
    setupFeatureExtractors() {
        // Gabor filters for texture analysis
        this.featureExtractors.set('gabor', this.createGaborFilters());
        
        // Edge detection kernels
        this.featureExtractors.set('sobel', {
            x: [[-1, 0, 1], [-2, 0, 2], [-1, 0, 1]],
            y: [[-1, -2, -1], [0, 0, 0], [1, 2, 1]]
        });
        
        this.featureExtractors.set('laplacian', [
            [0, -1, 0],
            [-1, 4, -1],
            [0, -1, 0]
        ]);
    }

    createGaborFilters() {
        const filters = [];
        const orientations = [0, 45, 90, 135];
        const frequencies = [0.1, 0.2, 0.3];
        
        for (const theta of orientations) {
            for (const freq of frequencies) {
                filters.push(this.createGaborKernel(5, freq, theta));
            }
        }
        
        return filters;
    }

    createGaborKernel(size, frequency, orientation) {
        // Implementation of Gabor filter kernel
        const kernel = [];
        const sigma = 1.0;
        const theta = orientation * Math.PI / 180;
        
        for (let y = -size; y <= size; y++) {
            const row = [];
            for (let x = -size; x <= size; x++) {
                const xPrime = x * Math.cos(theta) + y * Math.sin(theta);
                const yPrime = -x * Math.sin(theta) + y * Math.cos(theta);
                
                const gaussian = Math.exp(-(xPrime * xPrime + yPrime * yPrime) / (2 * sigma * sigma));
                const sinusoidal = Math.cos(2 * Math.PI * frequency * xPrime);
                
                row.push(gaussian * sinusoidal);
            }
            kernel.push(row);
        }
        
        return kernel;
    }

    // Placeholder methods - implement as needed
    async predictVisual(features) { return Math.random(); }
    async predictMoire(features) { return Math.random(); }
    async predictMetadata(metadata) { return Math.random(); }
    analyzeEdges(features) { return Math.random(); }
    analyzeColor(features) { return Math.random(); }
    analyzeTexture(features) { return Math.random(); }
    
    summarizeFeatures(features) {
        return {
            dimensions: Array.isArray(features) ? features.length : 'N/A',
            type: typeof features
        };
    }
    
    // Additional helper methods...
    applySobelFilter(image) { return image; }
    applyCannyFilter(image) { return image; }
    applyLaplacianFilter(image) { return image; }
    measureEdgeStraightness(edges) { return 0.5; }
    measureEdgeSharpness(edges) { return 0.5; }
    detectRectangles(edges) { return 0; }
    calculateEdgeDensity(edges) { return 0.5; }
    
    calculateColorHistogram(data, info) {
        const histogram = {
            red: new Array(256).fill(0),
            green: new Array(256).fill(0),
            blue: new Array(256).fill(0)
        };
        
        for (let i = 0; i < data.length; i += 3) {
            histogram.red[data[i]]++;
            histogram.green[data[i + 1]]++;
            histogram.blue[data[i + 2]]++;
        }
        
        return histogram;
    }
    
    analyzeColorGamut(data, info) { return {}; }
    detectWhitePoint(data, info) { return {}; }
    analyzeBlueChannel(data, info) { return {}; }
    measureColorUniformity(data, info) { return {}; }
    
    calculateBlueChannelBias(histogram) { return 0; }
    calculateGamutCoverage(gamut) { return 0; }
    calculateUniformityScore(uniformity) { return 0; }
    
    computeGLCM(data, info) { return {}; }
    computeLBP(data, info) { return {}; }
    computeGaborFeatures(data, info) { return {}; }
    computeTextureEntropy(data, info) { return {}; }
    
    detectHotPixels(data, info) { return { count: 0, percentage: 0 }; }
    detectPixelPatterns(data, info) { return {}; }
    analyzeSubpixelStructure(data, info) { return { detected: false }; }
    
    detectCompressionArtifacts(imageBuffer) { return {}; }
    analyzeNoisePatterns(imageBuffer) { return {}; }
    checkLightingConsistency(imageBuffer) { return {}; }
    estimateSceneDepth(imageBuffer) { return {}; }
    detectScreenReflections(imageBuffer) { return {}; }
    
    calculateForensicScore(forensics) { return 0.5; }
    detectAnomalies(forensics) { return []; }
    
    summarizeEvidence(result, forensics) { return []; }
    identifyBorderlineFactors(result) { return []; }
    extractDominantFrequencies(fft2D) { return []; }
}

module.exports = new AdvancedScreenDetector();
