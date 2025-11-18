/**
 * AI Agent for Detecting Screen Photography
 * 
 * This agent uses multiple ML models and heuristics to detect
 * when someone is taking a photo of a screen/monitor/TV
 * rather than a real-world scene.
 */

// TensorFlow is optional for basic detection
let tf;
try {
    tf = require('@tensorflow/tfjs-node');
} catch (error) {
    console.log('TensorFlow not available - using basic detection only');
}
const sharp = require('sharp');
const fs = require('fs').promises;
const path = require('path');

class ScreenDetectionAgent {
    constructor() {
        this.models = {
            moireDetector: null,
            screenClassifier: null,
            depthAnalyzer: null
        };
        
        this.thresholds = {
            moirePattern: 0.7,
            screenProbability: 0.8,
            flatnessScore: 0.85,
            combined: 0.75
        };
        
        this.initialized = false;
    }

    /**
     * Initialize AI models
     */
    async initialize() {
        try {
            // Load pre-trained models (or create them)
            await this.loadOrCreateModels();
            this.initialized = true;
            console.log('✅ Screen Detection Agent initialized');
        } catch (error) {
            console.error('Failed to initialize Screen Detection Agent:', error);
            throw error;
        }
    }

    /**
     * Main detection function
     */
    async detectScreen(imageBuffer, metadata = {}) {
        if (!this.initialized) {
            await this.initialize();
        }

        console.log('🔍 Analyzing image for screen detection...');

        // Run multiple detection methods in parallel
        const [
            moireAnalysis,
            pixelPatternAnalysis,
            colorAnalysis,
            edgeAnalysis,
            metadataAnalysis
        ] = await Promise.all([
            this.detectMoirePatterns(imageBuffer),
            this.analyzePixelPatterns(imageBuffer),
            this.analyzeColorDistribution(imageBuffer),
            this.analyzeEdgeCharacteristics(imageBuffer),
            this.analyzeMetadata(metadata)
        ]);

        // Combine all signals
        const combinedScore = this.combineSignals({
            moireAnalysis,
            pixelPatternAnalysis,
            colorAnalysis,
            edgeAnalysis,
            metadataAnalysis
        });

        // Generate detailed report
        const report = this.generateReport(combinedScore);

        return report;
    }

    /**
     * Detect Moiré patterns (interference patterns from photographing screens)
     */
    async detectMoirePatterns(imageBuffer) {
        const image = await sharp(imageBuffer)
            .resize(512, 512) // Standardize size
            .grayscale()
            .raw()
            .toBuffer();

        // Perform 2D FFT to detect regular frequency patterns
        const fftResult = await this.performFFT(image, 512, 512);
        
        // Look for specific frequency peaks that indicate screen patterns
        const peaks = this.findFrequencyPeaks(fftResult);
        
        // Calculate moiré score based on regularity of peaks
        const moireScore = this.calculateMoireScore(peaks);

        return {
            score: moireScore,
            detected: moireScore > this.thresholds.moirePattern,
            peaks: peaks.length,
            details: {
                dominantFrequency: peaks[0]?.frequency || 0,
                patternStrength: peaks[0]?.strength || 0,
                regularityScore: this.calculateRegularity(peaks)
            }
        };
    }

    /**
     * Analyze pixel-level patterns
     */
    async analyzePixelPatterns(imageBuffer) {
        const { data, info } = await sharp(imageBuffer)
            .raw()
            .toBuffer({ resolveWithObject: true });

        // Look for RGB subpixel patterns
        const subpixelPattern = this.detectSubpixelLayout(data, info);
        
        // Check for pixel grid alignment
        const gridAlignment = this.checkPixelGridAlignment(data, info);
        
        // Detect LCD/OLED specific artifacts
        const displayArtifacts = this.detectDisplayArtifacts(data, info);

        return {
            score: (subpixelPattern.score + gridAlignment.score + displayArtifacts.score) / 3,
            subpixelDetected: subpixelPattern.detected,
            gridAligned: gridAlignment.aligned,
            artifacts: displayArtifacts.types
        };
    }

    /**
     * Analyze color distribution
     */
    async analyzeColorDistribution(imageBuffer) {
        const { data, info } = await sharp(imageBuffer)
            .resize(256, 256) // Smaller for histogram
            .raw()
            .toBuffer({ resolveWithObject: true });

        // Calculate color histogram
        const histogram = this.calculateHistogram(data, info);
        
        // Look for characteristics of screen emission
        const screenCharacteristics = {
            blueSpike: this.detectBlueLightSpike(histogram),
            limitedGamut: this.checkGamutLimitation(histogram),
            artificialWhitePoint: this.detectArtificialWhitePoint(histogram),
            backlitUniformity: this.checkBacklightUniformity(data, info)
        };

        const score = Object.values(screenCharacteristics)
            .filter(v => v === true).length / 4;

        return {
            score,
            characteristics: screenCharacteristics,
            histogram: {
                red: histogram.red.slice(0, 10),
                green: histogram.green.slice(0, 10),
                blue: histogram.blue.slice(0, 10)
            }
        };
    }

    /**
     * Analyze edge characteristics
     */
    async analyzeEdgeCharacteristics(imageBuffer) {
        const edges = await sharp(imageBuffer)
            .resize(512, 512)
            .convolve({
                width: 3,
                height: 3,
                kernel: [-1, -1, -1, -1, 8, -1, -1, -1, -1] // Edge detection kernel
            })
            .grayscale()
            .raw()
            .toBuffer();

        // Screens often have perfectly straight edges (bezels)
        const straightEdges = this.detectStraightEdges(edges, 512, 512);
        
        // Check for unnatural sharpness
        const sharpnessScore = this.calculateSharpnessScore(edges, 512, 512);
        
        // Look for rectangular patterns (screen boundaries)
        const rectangles = this.detectRectangles(edges, 512, 512);

        return {
            score: (straightEdges.score + sharpnessScore + rectangles.score) / 3,
            straightEdgeRatio: straightEdges.ratio,
            unnaturalSharpness: sharpnessScore > 0.8,
            screenBoundaries: rectangles.found
        };
    }

    /**
     * Analyze metadata for screen indicators
     */
    async analyzeMetadata(metadata) {
        const indicators = {
            // Screens are typically photographed at close range
            closeRange: metadata.focusDistance && metadata.focusDistance < 1.0,
            
            // Indoor lighting conditions
            indoorLighting: metadata.brightnessValue && metadata.brightnessValue < 5,
            
            // Lack of GPS movement
            staticLocation: this.checkGPSStaticity(metadata.gpsHistory),
            
            // Consistent accelerometer (no hand shake)
            stableCapture: this.checkAccelerometerStability(metadata.motionData),
            
            // Flash not used (screens are self-lit)
            noFlash: !metadata.flashFired,
            
            // Specific white balance for artificial light
            artificialWB: metadata.whiteBalance === 'fluorescent' || 
                         metadata.whiteBalance === 'tungsten'
        };

        const score = Object.values(indicators)
            .filter(v => v === true).length / Object.keys(indicators).length;

        return {
            score,
            indicators,
            confidence: this.calculateMetadataConfidence(metadata)
        };
    }

    /**
     * Combine all detection signals
     */
    combineSignals(analyses) {
        // Use weighted combination
        const weights = {
            moireAnalysis: 0.25,
            pixelPatternAnalysis: 0.25,
            colorAnalysis: 0.15,
            edgeAnalysis: 0.20,
            metadataAnalysis: 0.15
        };

        let weightedScore = 0;
        let totalWeight = 0;

        for (const [key, analysis] of Object.entries(analyses)) {
            if (analysis && analysis.score !== undefined) {
                weightedScore += analysis.score * weights[key];
                totalWeight += weights[key];
            }
        }

        const finalScore = totalWeight > 0 ? weightedScore / totalWeight : 0;

        return {
            finalScore,
            isScreen: finalScore > this.thresholds.combined,
            confidence: this.calculateConfidence(analyses),
            analyses
        };
    }

    /**
     * Generate detailed detection report
     */
    generateReport(combinedScore) {
        const { finalScore, isScreen, confidence, analyses } = combinedScore;

        const report = {
            timestamp: new Date().toISOString(),
            verdict: {
                isScreen,
                confidence,
                score: finalScore,
                risk: this.calculateRiskLevel(finalScore)
            },
            evidence: {
                strongIndicators: this.extractStrongIndicators(analyses),
                weakIndicators: this.extractWeakIndicators(analyses),
                contraIndicators: this.extractContraIndicators(analyses)
            },
            technical: {
                moirePattern: analyses.moireAnalysis,
                pixelPattern: analyses.pixelPatternAnalysis,
                colorProfile: analyses.colorAnalysis,
                edgeProfile: analyses.edgeAnalysis,
                metadata: analyses.metadataAnalysis
            },
            recommendations: this.generateRecommendations(combinedScore)
        };

        // Add ML model predictions if available
        if (this.models.screenClassifier) {
            report.mlPrediction = {
                probability: combinedScore.mlScore || null,
                modelVersion: '1.0.0'
            };
        }

        return report;
    }

    /**
     * Helper methods
     */

    async performFFT(imageData, width, height) {
        // Simplified FFT for moiré detection
        // In production, use proper FFT library
        const frequencies = [];
        
        // Analyze horizontal and vertical frequencies
        for (let y = 0; y < height; y += 10) {
            const row = imageData.slice(y * width, (y + 1) * width);
            const freq = this.analyzeFrequency(row);
            if (freq.strength > 0.5) frequencies.push(freq);
        }

        return frequencies;
    }

    findFrequencyPeaks(fftResult) {
        // Sort by strength and return top peaks
        return fftResult
            .sort((a, b) => b.strength - a.strength)
            .slice(0, 10);
    }

    calculateMoireScore(peaks) {
        if (peaks.length === 0) return 0;
        
        // Regular spacing indicates screen pattern
        const spacings = [];
        for (let i = 1; i < peaks.length; i++) {
            spacings.push(peaks[i].frequency - peaks[i-1].frequency);
        }
        
        const avgSpacing = spacings.reduce((a, b) => a + b, 0) / spacings.length;
        const variance = spacings.reduce((sum, s) => sum + Math.pow(s - avgSpacing, 2), 0) / spacings.length;
        
        // Low variance means regular pattern (likely screen)
        return 1 - (variance / avgSpacing);
    }

    detectSubpixelLayout(data, info) {
        // Look for RGB stripe patterns common in displays
        let patternMatches = 0;
        const sampleSize = Math.min(1000, data.length / 3);
        
        for (let i = 0; i < sampleSize; i++) {
            const idx = i * 3;
            // Check for regular R-G-B patterns
            if (this.isSubpixelPattern(data, idx, info.width)) {
                patternMatches++;
            }
        }
        
        const score = patternMatches / sampleSize;
        return {
            score,
            detected: score > 0.3,
            patternType: 'RGB stripe' // Could detect other layouts
        };
    }

    calculateRiskLevel(score) {
        if (score < 0.3) return 'low';
        if (score < 0.6) return 'medium';
        if (score < 0.8) return 'high';
        return 'critical';
    }

    generateRecommendations(combinedScore) {
        const recommendations = [];

        if (combinedScore.isScreen) {
            recommendations.push('Image appears to be captured from a screen');
            recommendations.push('Request additional verification or different angle');
            
            if (combinedScore.analyses.moireAnalysis.detected) {
                recommendations.push('Strong moiré patterns detected - likely LCD/LED display');
            }
            
            if (combinedScore.analyses.metadataAnalysis.indicators.closeRange) {
                recommendations.push('Focus distance indicates close-range capture typical of screen photography');
            }
        } else if (combinedScore.finalScore > 0.5) {
            recommendations.push('Some screen-like characteristics detected');
            recommendations.push('Consider manual review or additional checks');
        } else {
            recommendations.push('Image appears to be from a real scene');
        }

        return recommendations;
    }

    /**
     * Training function for ML model
     */
    async trainModel(trainingData) {
        console.log('🎓 Training screen detection model...');
        
        // Define model architecture
        const model = tf.sequential({
            layers: [
                tf.layers.conv2d({
                    inputShape: [128, 128, 3],
                    filters: 32,
                    kernelSize: 3,
                    activation: 'relu'
                }),
                tf.layers.maxPooling2d({ poolSize: 2 }),
                tf.layers.conv2d({
                    filters: 64,
                    kernelSize: 3,
                    activation: 'relu'
                }),
                tf.layers.maxPooling2d({ poolSize: 2 }),
                tf.layers.flatten(),
                tf.layers.dense({ units: 128, activation: 'relu' }),
                tf.layers.dropout({ rate: 0.5 }),
                tf.layers.dense({ units: 1, activation: 'sigmoid' })
            ]
        });

        model.compile({
            optimizer: 'adam',
            loss: 'binaryCrossentropy',
            metrics: ['accuracy']
        });

        // Train the model
        // ... training logic ...

        this.models.screenClassifier = model;
        await this.saveModel(model, 'screen-classifier');
    }

    async saveModel(model, name) {
        const modelPath = path.join(__dirname, 'models', name);
        await model.save(`file://${modelPath}`);
        console.log(`✅ Model saved: ${name}`);
    }

    async loadOrCreateModels() {
        // Try to load existing models or create basic ones
        try {
            const modelPath = path.join(__dirname, 'models', 'screen-classifier');
            this.models.screenClassifier = await tf.loadLayersModel(`file://${modelPath}/model.json`);
            console.log('✅ Loaded existing screen classifier model');
        } catch (error) {
            console.log('⚠️ No existing model found, using heuristics only');
        }
    }

    // Stub methods - implement based on needs
    analyzeFrequency(data) {
        return { frequency: Math.random() * 100, strength: Math.random() };
    }

    calculateRegularity(peaks) {
        return peaks.length > 5 ? 0.8 : 0.3;
    }

    isSubpixelPattern(data, idx, width) {
        // Check for RGB subpixel patterns
        return false; // Implement actual logic
    }

    checkPixelGridAlignment(data, info) {
        return { score: 0.5, aligned: false };
    }

    detectDisplayArtifacts(data, info) {
        return { score: 0.3, types: [] };
    }

    calculateHistogram(data, info) {
        const histogram = {
            red: new Array(256).fill(0),
            green: new Array(256).fill(0),
            blue: new Array(256).fill(0)
        };
        
        // Calculate actual histogram
        for (let i = 0; i < data.length; i += 3) {
            histogram.red[data[i]]++;
            histogram.green[data[i + 1]]++;
            histogram.blue[data[i + 2]]++;
        }
        
        return histogram;
    }

    detectBlueLightSpike(histogram) {
        // Screens often have blue light spike
        const blueAvg = histogram.blue.reduce((a, b, i) => a + b * i, 0) / histogram.blue.reduce((a, b) => a + b, 0);
        const redAvg = histogram.red.reduce((a, b, i) => a + b * i, 0) / histogram.red.reduce((a, b) => a + b, 0);
        return blueAvg > redAvg * 1.2;
    }

    checkGamutLimitation(histogram) {
        // Screens have limited color gamut
        return true; // Implement actual logic
    }

    detectArtificialWhitePoint(histogram) {
        // Check for D65 or similar artificial white points
        return false; // Implement actual logic
    }

    checkBacklightUniformity(data, info) {
        // Backlighting creates uniform brightness
        return false; // Implement actual logic
    }

    detectStraightEdges(edges, width, height) {
        return { score: 0.5, ratio: 0.3 };
    }

    calculateSharpnessScore(edges, width, height) {
        return 0.6;
    }

    detectRectangles(edges, width, height) {
        return { score: 0.4, found: [] };
    }

    checkGPSStaticity(gpsHistory) {
        if (!gpsHistory || gpsHistory.length < 2) return true;
        // Check if GPS hasn't moved
        return true;
    }

    checkAccelerometerStability(motionData) {
        if (!motionData) return true;
        // Check for unnatural stability
        return true;
    }

    calculateMetadataConfidence(metadata) {
        const fields = ['focusDistance', 'brightnessValue', 'gpsHistory', 'motionData'];
        const available = fields.filter(f => metadata[f] !== undefined).length;
        return available / fields.length;
    }

    calculateConfidence(analyses) {
        // Calculate overall confidence based on agreement between methods
        const scores = Object.values(analyses).map(a => a.score).filter(s => s !== undefined);
        const avg = scores.reduce((a, b) => a + b, 0) / scores.length;
        const variance = scores.reduce((sum, s) => sum + Math.pow(s - avg, 2), 0) / scores.length;
        
        // Low variance means high confidence
        return 1 - Math.min(variance, 1);
    }

    extractStrongIndicators(analyses) {
        const indicators = [];
        
        if (analyses.moireAnalysis?.detected) {
            indicators.push('Moiré interference patterns detected');
        }
        if (analyses.pixelPatternAnalysis?.subpixelDetected) {
            indicators.push('RGB subpixel layout detected');
        }
        if (analyses.edgeAnalysis?.unnaturalSharpness) {
            indicators.push('Unnaturally sharp edges found');
        }
        
        return indicators;
    }

    extractWeakIndicators(analyses) {
        const indicators = [];
        
        if (analyses.colorAnalysis?.characteristics.blueSpike) {
            indicators.push('Blue light emission spike');
        }
        if (analyses.metadataAnalysis?.indicators.closeRange) {
            indicators.push('Close focus distance');
        }
        
        return indicators;
    }

    extractContraIndicators(analyses) {
        const indicators = [];
        
        if (!analyses.moireAnalysis?.detected) {
            indicators.push('No moiré patterns found');
        }
        if (analyses.metadataAnalysis?.indicators.gpsMovement) {
            indicators.push('GPS movement detected');
        }
        
        return indicators;
    }
}

module.exports = new ScreenDetectionAgent();
