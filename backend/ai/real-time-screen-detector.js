/**
 * Real-time Screen Detection with Video Analysis
 * 
 * This module adds temporal analysis capabilities:
 * - Detects refresh rate patterns
 * - Identifies PWM dimming flicker
 * - Analyzes motion consistency
 * - Tracks pixel persistence
 */

const tf = require('@tensorflow/tfjs-node');
const sharp = require('sharp');
const EventEmitter = require('events');

class RealTimeScreenDetector extends EventEmitter {
    constructor() {
        super();
        
        this.config = {
            frameRate: 30,
            bufferSize: 60, // 2 seconds at 30fps
            flickerDetectionThreshold: 0.02,
            refreshRatePatterns: [60, 120, 144, 240], // Common display refresh rates
            temporalWindowSize: 10
        };
        
        this.frameBuffer = [];
        this.analysisResults = [];
        this.isAnalyzing = false;
        
        // Temporal analysis state
        this.temporalFeatures = {
            flickerScore: 0,
            refreshRateEstimate: null,
            motionConsistency: 1.0,
            pixelPersistence: new Map(),
            scanlinePatterns: []
        };
    }

    /**
     * Analyze video stream for screen characteristics
     */
    async analyzeVideoStream(frameGenerator) {
        this.isAnalyzing = true;
        let frameCount = 0;
        
        for await (const frame of frameGenerator) {
            if (!this.isAnalyzing) break;
            
            // Add frame to buffer
            this.addFrameToBuffer(frame);
            frameCount++;
            
            // Perform analysis every N frames
            if (frameCount % this.config.temporalWindowSize === 0) {
                const analysis = await this.analyzeTemporalWindow();
                this.emit('analysis', analysis);
                
                // Early termination if high confidence
                if (analysis.confidence > 0.95 && analysis.isScreen) {
                    this.emit('screenDetected', analysis);
                    break;
                }
            }
        }
        
        return this.generateFinalReport();
    }

    /**
     * Add frame to circular buffer
     */
    addFrameToBuffer(frame) {
        if (this.frameBuffer.length >= this.config.bufferSize) {
            this.frameBuffer.shift();
        }
        
        this.frameBuffer.push({
            data: frame,
            timestamp: Date.now(),
            index: this.frameBuffer.length
        });
    }

    /**
     * Analyze temporal window of frames
     */
    async analyzeTemporalWindow() {
        if (this.frameBuffer.length < this.config.temporalWindowSize) {
            return null;
        }
        
        const window = this.frameBuffer.slice(-this.config.temporalWindowSize);
        
        // Run all temporal analyses in parallel
        const [
            flickerAnalysis,
            refreshRateAnalysis,
            motionAnalysis,
            scanlineAnalysis,
            persistenceAnalysis,
            differenceAnalysis
        ] = await Promise.all([
            this.detectFlicker(window),
            this.detectRefreshRate(window),
            this.analyzeMotionConsistency(window),
            this.detectScanlines(window),
            this.analyzePixelPersistence(window),
            this.analyzeFrameDifferences(window)
        ]);

        // Combine analyses
        const temporalScore = this.combineTemporalScores({
            flickerAnalysis,
            refreshRateAnalysis,
            motionAnalysis,
            scanlineAnalysis,
            persistenceAnalysis,
            differenceAnalysis
        });

        const result = {
            timestamp: Date.now(),
            frameIndices: window.map(f => f.index),
            temporalScore,
            isScreen: temporalScore > 0.7,
            confidence: this.calculateTemporalConfidence(temporalScore),
            details: {
                flicker: flickerAnalysis,
                refreshRate: refreshRateAnalysis,
                motion: motionAnalysis,
                scanlines: scanlineAnalysis,
                persistence: persistenceAnalysis,
                differences: differenceAnalysis
            }
        };

        this.analysisResults.push(result);
        return result;
    }

    /**
     * Detect flicker patterns (PWM dimming, refresh rate)
     */
    async detectFlicker(frames) {
        const brightnesses = await Promise.all(
            frames.map(frame => this.calculateAverageBrightness(frame.data))
        );
        
        // Analyze brightness variations
        const variations = [];
        for (let i = 1; i < brightnesses.length; i++) {
            variations.push(Math.abs(brightnesses[i] - brightnesses[i-1]));
        }
        
        const avgVariation = variations.reduce((a, b) => a + b, 0) / variations.length;
        const maxVariation = Math.max(...variations);
        
        // FFT on brightness values to find periodic patterns
        const frequencies = this.performFFT(brightnesses);
        const dominantFreq = this.findDominantFrequency(frequencies);
        
        // Check for PWM patterns (typically 100-1000Hz)
        const pwmDetected = dominantFreq > 100 && dominantFreq < 1000;
        
        return {
            detected: avgVariation > this.config.flickerDetectionThreshold,
            avgVariation,
            maxVariation,
            dominantFrequency: dominantFreq,
            pwmDetected,
            pattern: this.identifyFlickerPattern(variations)
        };
    }

    /**
     * Detect display refresh rate
     */
    async detectRefreshRate(frames) {
        // Calculate frame differences
        const differences = [];
        
        for (let i = 1; i < frames.length; i++) {
            const diff = await this.calculateFrameDifference(
                frames[i-1].data,
                frames[i].data
            );
            differences.push({
                value: diff,
                timeDelta: frames[i].timestamp - frames[i-1].timestamp
            });
        }
        
        // Look for periodic updates matching common refresh rates
        const patterns = this.config.refreshRatePatterns.map(rate => ({
            rate,
            score: this.matchRefreshRatePattern(differences, rate)
        }));
        
        patterns.sort((a, b) => b.score - a.score);
        const bestMatch = patterns[0];
        
        return {
            estimatedRate: bestMatch.score > 0.5 ? bestMatch.rate : null,
            confidence: bestMatch.score,
            patterns: patterns.slice(0, 3),
            inconsistentUpdates: this.detectInconsistentUpdates(differences)
        };
    }

    /**
     * Analyze motion consistency
     */
    async analyzeMotionConsistency(frames) {
        const motionVectors = [];
        
        for (let i = 1; i < frames.length; i++) {
            const vectors = await this.calculateOpticalFlow(
                frames[i-1].data,
                frames[i].data
            );
            motionVectors.push(vectors);
        }
        
        // Natural scenes have varied motion; screens often have uniform motion
        const consistency = this.calculateMotionConsistency(motionVectors);
        const uniformity = this.calculateMotionUniformity(motionVectors);
        
        return {
            consistency,
            uniformity,
            isArtificial: uniformity > 0.8,
            dominantDirection: this.findDominantMotionDirection(motionVectors),
            variance: this.calculateMotionVariance(motionVectors)
        };
    }

    /**
     * Detect scanline patterns
     */
    async detectScanlines(frames) {
        const scanlineScores = await Promise.all(
            frames.map(frame => this.analyzeScanlines(frame.data))
        );
        
        // Aggregate scanline detection across frames
        const avgScore = scanlineScores.reduce((a, b) => a + b.score, 0) / scanlineScores.length;
        const maxScore = Math.max(...scanlineScores.map(s => s.score));
        
        return {
            detected: avgScore > 0.5,
            avgScore,
            maxScore,
            pattern: this.identifyScanlinePattern(scanlineScores),
            orientation: this.detectScanlineOrientation(scanlineScores)
        };
    }

    /**
     * Analyze pixel persistence (screens vs real scenes)
     */
    async analyzePixelPersistence(frames) {
        const persistence = new Map();
        
        // Track how long pixels remain the same value
        for (let i = 1; i < frames.length; i++) {
            const prev = await this.getPixelArray(frames[i-1].data);
            const curr = await this.getPixelArray(frames[i].data);
            
            for (let j = 0; j < prev.length; j += 3) {
                const key = `${j/3}`;
                const prevRGB = [prev[j], prev[j+1], prev[j+2]];
                const currRGB = [curr[j], curr[j+1], curr[j+2]];
                
                if (this.pixelsEqual(prevRGB, currRGB)) {
                    persistence.set(key, (persistence.get(key) || 0) + 1);
                } else {
                    persistence.delete(key);
                }
            }
        }
        
        // Calculate statistics
        const persistenceValues = Array.from(persistence.values());
        const avgPersistence = persistenceValues.length > 0
            ? persistenceValues.reduce((a, b) => a + b, 0) / persistenceValues.length
            : 0;
        
        return {
            avgPersistence,
            maxPersistence: Math.max(...persistenceValues, 0),
            persistentPixelRatio: persistence.size / (prev.length / 3),
            isStatic: avgPersistence > frames.length * 0.8
        };
    }

    /**
     * Analyze frame-to-frame differences
     */
    async analyzeFrameDifferences(frames) {
        const differences = [];
        
        for (let i = 1; i < frames.length; i++) {
            const diff = await this.computeFrameDifference(
                frames[i-1].data,
                frames[i].data
            );
            differences.push(diff);
        }
        
        // Statistical analysis of differences
        const stats = {
            mean: this.mean(differences.map(d => d.avgDifference)),
            std: this.standardDeviation(differences.map(d => d.avgDifference)),
            pattern: this.detectDifferencePattern(differences)
        };
        
        return {
            stats,
            isUniform: stats.std < 0.1,
            hasPeriodicPattern: stats.pattern.isPeriodic,
            updateRegions: this.identifyUpdateRegions(differences)
        };
    }

    /**
     * Helper methods
     */

    async calculateAverageBrightness(frameData) {
        const { data } = await sharp(frameData)
            .resize(64, 64) // Downsample for speed
            .grayscale()
            .raw()
            .toBuffer({ resolveWithObject: true });
        
        const sum = data.reduce((a, b) => a + b, 0);
        return sum / data.length / 255;
    }

    async calculateFrameDifference(frame1, frame2) {
        const [data1, data2] = await Promise.all([
            sharp(frame1).resize(128, 128).raw().toBuffer(),
            sharp(frame2).resize(128, 128).raw().toBuffer()
        ]);
        
        let diff = 0;
        for (let i = 0; i < data1.length; i++) {
            diff += Math.abs(data1[i] - data2[i]);
        }
        
        return diff / data1.length / 255;
    }

    performFFT(values) {
        // Simplified FFT - in production use proper FFT library
        const frequencies = [];
        const n = values.length;
        
        for (let k = 0; k < n/2; k++) {
            let real = 0, imag = 0;
            for (let t = 0; t < n; t++) {
                const angle = -2 * Math.PI * k * t / n;
                real += values[t] * Math.cos(angle);
                imag += values[t] * Math.sin(angle);
            }
            frequencies.push({
                frequency: k * this.config.frameRate / n,
                magnitude: Math.sqrt(real * real + imag * imag)
            });
        }
        
        return frequencies;
    }

    findDominantFrequency(frequencies) {
        if (frequencies.length === 0) return 0;
        
        const sorted = frequencies.sort((a, b) => b.magnitude - a.magnitude);
        return sorted[0].frequency;
    }

    identifyFlickerPattern(variations) {
        // Check for regular patterns
        const isRegular = this.isRegularPattern(variations);
        const period = this.findPeriod(variations);
        
        return {
            type: isRegular ? 'periodic' : 'random',
            period: period,
            strength: Math.max(...variations)
        };
    }

    matchRefreshRatePattern(differences, targetRate) {
        // Expected frame interval for target refresh rate
        const expectedInterval = 1000 / targetRate;
        let matches = 0;
        
        for (const diff of differences) {
            const actualInterval = diff.timeDelta;
            const error = Math.abs(actualInterval - expectedInterval) / expectedInterval;
            if (error < 0.1) matches++;
        }
        
        return matches / differences.length;
    }

    async calculateOpticalFlow(frame1, frame2) {
        // Simplified optical flow - in production use proper CV library
        const flow = {
            vectors: [],
            avgMagnitude: 0,
            avgDirection: 0
        };
        
        // Mock implementation
        const gridSize = 16;
        for (let y = 0; y < gridSize; y++) {
            for (let x = 0; x < gridSize; x++) {
                flow.vectors.push({
                    x: x * 16,
                    y: y * 16,
                    dx: (Math.random() - 0.5) * 5,
                    dy: (Math.random() - 0.5) * 5
                });
            }
        }
        
        return flow;
    }

    calculateMotionConsistency(motionVectors) {
        if (motionVectors.length === 0) return 0;
        
        // Compare motion between frames
        let consistency = 0;
        for (let i = 1; i < motionVectors.length; i++) {
            const similarity = this.compareMotionFields(
                motionVectors[i-1],
                motionVectors[i]
            );
            consistency += similarity;
        }
        
        return consistency / (motionVectors.length - 1);
    }

    combineTemporalScores(analyses) {
        const weights = {
            flicker: 0.2,
            refreshRate: 0.25,
            motion: 0.2,
            scanlines: 0.15,
            persistence: 0.1,
            differences: 0.1
        };
        
        let score = 0;
        
        if (analyses.flickerAnalysis.detected) score += weights.flicker;
        if (analyses.refreshRateAnalysis.estimatedRate) score += weights.refreshRate;
        if (analyses.motionAnalysis.isArtificial) score += weights.motion;
        if (analyses.scanlineAnalysis.detected) score += weights.scanlines;
        if (analyses.persistenceAnalysis.isStatic) score += weights.persistence;
        if (analyses.differenceAnalysis.isUniform) score += weights.differences;
        
        return score;
    }

    calculateTemporalConfidence(score) {
        // Sigmoid function for confidence
        return 1 / (1 + Math.exp(-10 * (score - 0.5)));
    }

    generateFinalReport() {
        const allScores = this.analysisResults.map(r => r.temporalScore);
        const avgScore = this.mean(allScores);
        const maxScore = Math.max(...allScores);
        
        const finalVerdict = {
            isScreen: avgScore > 0.7 || maxScore > 0.85,
            confidence: this.calculateTemporalConfidence(avgScore),
            temporalEvidence: this.summarizeTemporalEvidence(),
            recommendation: this.generateTemporalRecommendation(avgScore, maxScore)
        };
        
        return {
            verdict: finalVerdict,
            frameAnalyzed: this.frameBuffer.length,
            temporalWindows: this.analysisResults.length,
            evidence: this.collectAllEvidence(),
            timeline: this.generateTimeline()
        };
    }

    summarizeTemporalEvidence() {
        const evidence = [];
        
        // Check each type of temporal evidence
        const flickerResults = this.analysisResults.filter(r => r.details.flicker.detected);
        if (flickerResults.length > 0) {
            evidence.push({
                type: 'flicker',
                frequency: flickerResults.length / this.analysisResults.length,
                details: 'Periodic brightness variations detected'
            });
        }
        
        const refreshResults = this.analysisResults.filter(r => r.details.refreshRate.estimatedRate);
        if (refreshResults.length > 0) {
            const rates = refreshResults.map(r => r.details.refreshRate.estimatedRate);
            evidence.push({
                type: 'refreshRate',
                estimatedRate: this.mode(rates),
                confidence: this.mean(refreshResults.map(r => r.details.refreshRate.confidence))
            });
        }
        
        return evidence;
    }

    // Utility functions
    mean(values) {
        return values.reduce((a, b) => a + b, 0) / values.length;
    }
    
    standardDeviation(values) {
        const avg = this.mean(values);
        const squareDiffs = values.map(v => Math.pow(v - avg, 2));
        return Math.sqrt(this.mean(squareDiffs));
    }
    
    mode(values) {
        const counts = {};
        values.forEach(v => counts[v] = (counts[v] || 0) + 1);
        return Object.keys(counts).reduce((a, b) => counts[a] > counts[b] ? a : b);
    }
    
    pixelsEqual(rgb1, rgb2, threshold = 5) {
        return Math.abs(rgb1[0] - rgb2[0]) < threshold &&
               Math.abs(rgb1[1] - rgb2[1]) < threshold &&
               Math.abs(rgb1[2] - rgb2[2]) < threshold;
    }
    
    isRegularPattern(values) {
        // Check if values follow a regular pattern
        if (values.length < 3) return false;
        
        const deltas = [];
        for (let i = 1; i < values.length; i++) {
            deltas.push(values[i] - values[i-1]);
        }
        
        const deltaVariance = this.standardDeviation(deltas);
        return deltaVariance < 0.1;
    }
    
    findPeriod(values) {
        // Find repeating period in values
        for (let period = 2; period < values.length / 2; period++) {
            let matches = true;
            for (let i = 0; i < values.length - period; i++) {
                if (Math.abs(values[i] - values[i + period]) > 0.1) {
                    matches = false;
                    break;
                }
            }
            if (matches) return period;
        }
        return null;
    }
    
    // Placeholder implementations
    async analyzeScanlines(data) { return { score: Math.random() }; }
    identifyScanlinePattern(scores) { return 'horizontal'; }
    detectScanlineOrientation(scores) { return 0; }
    async getPixelArray(data) { return new Uint8Array(100); }
    async computeFrameDifference(f1, f2) { return { avgDifference: Math.random() }; }
    detectDifferencePattern(diffs) { return { isPeriodic: false }; }
    identifyUpdateRegions(diffs) { return []; }
    compareMotionFields(m1, m2) { return 0.8; }
    calculateMotionUniformity(vectors) { return 0.5; }
    findDominantMotionDirection(vectors) { return 0; }
    calculateMotionVariance(vectors) { return 0.1; }
    detectInconsistentUpdates(diffs) { return false; }
    collectAllEvidence() { return []; }
    generateTimeline() { return []; }
    generateTemporalRecommendation(avg, max) { return ''; }
}

module.exports = RealTimeScreenDetector;
