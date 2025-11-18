/**
 * Unified Screen Detection System
 * 
 * Combines all detection methods into a single, intelligent system:
 * - Visual analysis (basic + ML)
 * - Temporal analysis (video)
 * - Hardware sensors
 * - Behavioral patterns
 * - Cross-validation
 */

const screenDetectionAgent = require('./screen-detection-agent');
const advancedDetector = require('./screen-detection-ml');
const realTimeDetector = require('./real-time-screen-detector');
const hardwareDetector = require('./hardware-screen-detector');
const { logger } = require('../src/monitoring');

class UnifiedScreenDetector {
    constructor() {
        this.config = {
            // Confidence thresholds for different use cases
            thresholds: {
                strict: 0.9,      // For high-security applications
                standard: 0.75,   // Default threshold
                lenient: 0.6      // For user-friendly applications
            },
            
            // Method weights based on reliability
            methodWeights: {
                hardware: 0.35,   // Most reliable when available
                temporal: 0.25,   // Video analysis
                mlVisual: 0.25,   // ML-based visual
                basic: 0.15       // Basic heuristics
            },
            
            // Detection modes
            mode: 'standard', // 'fast', 'standard', 'comprehensive'
            
            // Caching
            cacheResults: true,
            cacheDuration: 300000 // 5 minutes
        };

        this.cache = new Map();
        this.statistics = {
            totalDetections: 0,
            screensDetected: 0,
            falsePositives: 0,
            falseNegatives: 0,
            avgProcessingTime: 0
        };

        this.initialized = false;
    }

    /**
     * Initialize all detection systems
     */
    async initialize() {
        logger.info('Initializing Unified Screen Detection System...');

        try {
            // Initialize all subsystems
            await Promise.all([
                advancedDetector.initialize(),
                screenDetectionAgent.initialize()
            ]);

            this.initialized = true;
            logger.info('✅ Unified Screen Detection System ready');
            
            return true;
        } catch (error) {
            logger.error('Failed to initialize screen detection', { error: error.message });
            return false;
        }
    }

    /**
     * Main unified detection method
     */
    async detect(input) {
        const startTime = Date.now();
        this.statistics.totalDetections++;

        try {
            // Validate and prepare input
            const preparedInput = await this.prepareInput(input);
            
            // Check cache
            if (this.config.cacheResults) {
                const cached = this.checkCache(preparedInput.hash);
                if (cached) {
                    logger.info('Screen detection cache hit', { hash: preparedInput.hash });
                    return cached;
                }
            }

            // Select detection strategy based on mode
            let result;
            switch (this.config.mode) {
                case 'fast':
                    result = await this.fastDetection(preparedInput);
                    break;
                case 'comprehensive':
                    result = await this.comprehensiveDetection(preparedInput);
                    break;
                default:
                    result = await this.standardDetection(preparedInput);
            }

            // Post-process results
            result = await this.postProcessResults(result, preparedInput);

            // Update statistics
            this.updateStatistics(result, Date.now() - startTime);

            // Cache results
            if (this.config.cacheResults) {
                this.cacheResult(preparedInput.hash, result);
            }

            return result;

        } catch (error) {
            logger.error('Unified detection failed', { error: error.message });
            throw error;
        }
    }

    /**
     * Fast detection using only quick methods
     */
    async fastDetection(input) {
        logger.info('Running fast screen detection');

        const results = {
            timestamp: Date.now(),
            mode: 'fast',
            methods: {}
        };

        // Quick visual check
        if (input.image) {
            results.methods.quickVisual = await this.quickVisualCheck(input.image);
        }

        // Quick hardware check if available
        if (input.sensors && this.hasMinimalSensors(input.sensors)) {
            results.methods.quickHardware = await this.quickHardwareCheck(input.sensors);
        }

        // Combine results
        const verdict = this.combineQuickResults(results.methods);
        
        return {
            ...results,
            verdict,
            processingTime: Date.now() - results.timestamp
        };
    }

    /**
     * Standard detection with balanced accuracy/speed
     */
    async standardDetection(input) {
        logger.info('Running standard screen detection');

        const results = {
            timestamp: Date.now(),
            mode: 'standard',
            methods: {}
        };

        // Run detection methods in parallel where possible
        const detectionPromises = [];

        // Visual detection (basic)
        if (input.image) {
            detectionPromises.push(
                screenDetectionAgent.detectScreen(input.image, input.metadata || {})
                    .then(r => { results.methods.basicVisual = r; })
                    .catch(e => { logger.warn('Basic visual detection failed', { error: e.message }); })
            );
        }

        // Hardware detection
        if (input.sensors && this.hasSufficientSensors(input.sensors)) {
            detectionPromises.push(
                hardwareDetector.detectWithHardware(input.sensors, input.image)
                    .then(r => { results.methods.hardware = r; })
                    .catch(e => { logger.warn('Hardware detection failed', { error: e.message }); })
            );
        }

        // ML visual detection (if initialized)
        if (input.image && advancedDetector.initialized) {
            detectionPromises.push(
                advancedDetector.detectScreen(input.image, input.metadata || {})
                    .then(r => { results.methods.mlVisual = r; })
                    .catch(e => { logger.warn('ML visual detection failed', { error: e.message }); })
            );
        }

        // Wait for all methods to complete
        await Promise.all(detectionPromises);

        // Intelligent result combination
        const verdict = await this.intelligentCombination(results.methods, input);

        return {
            ...results,
            verdict,
            confidence: this.calculateOverallConfidence(results.methods, verdict),
            processingTime: Date.now() - results.timestamp
        };
    }

    /**
     * Comprehensive detection using all available methods
     */
    async comprehensiveDetection(input) {
        logger.info('Running comprehensive screen detection');

        const results = {
            timestamp: Date.now(),
            mode: 'comprehensive',
            methods: {}
        };

        // Standard detection first
        const standardResult = await this.standardDetection(input);
        results.methods = { ...standardResult.methods };

        // Additional comprehensive checks
        
        // Temporal analysis if video frames available
        if (input.frames && input.frames.length > 5) {
            try {
                const temporalResult = await this.temporalAnalysis(input.frames);
                results.methods.temporal = temporalResult;
            } catch (e) {
                logger.warn('Temporal analysis failed', { error: e.message });
            }
        }

        // Deep forensics
        if (input.image) {
            try {
                const forensicsResult = await this.deepForensics(input.image);
                results.methods.forensics = forensicsResult;
            } catch (e) {
                logger.warn('Deep forensics failed', { error: e.message });
            }
        }

        // Cross-validation
        const crossValidation = await this.crossValidateResults(results.methods, input);
        results.crossValidation = crossValidation;

        // Final verdict with all evidence
        const verdict = await this.comprehensiveVerdict(results.methods, crossValidation);

        return {
            ...results,
            verdict,
            confidence: this.calculateComprehensiveConfidence(results, verdict),
            processingTime: Date.now() - results.timestamp
        };
    }

    /**
     * Intelligent combination of detection results
     */
    async intelligentCombination(methods, input) {
        const scores = {};
        const evidence = [];
        
        // Extract scores from each method
        for (const [method, result] of Object.entries(methods)) {
            if (result && result.verdict) {
                scores[method] = {
                    isScreen: result.verdict.isScreen,
                    confidence: result.verdict.confidence || 0.5,
                    score: result.verdict.score || (result.verdict.isScreen ? 1 : 0)
                };
                
                // Collect evidence
                if (result.evidence || result.verdict.evidence) {
                    evidence.push({
                        method,
                        evidence: result.evidence || result.verdict.evidence
                    });
                }
            }
        }

        // Apply method weights
        let weightedScore = 0;
        let totalWeight = 0;
        
        for (const [method, score] of Object.entries(scores)) {
            const weight = this.getMethodWeight(method, input);
            weightedScore += score.score * weight;
            totalWeight += weight;
        }

        const finalScore = totalWeight > 0 ? weightedScore / totalWeight : 0;
        
        // Check for unanimous agreement
        const allAgree = Object.values(scores).every(s => s.isScreen === (finalScore > 0.5));
        const confidenceBoost = allAgree ? 0.1 : 0;

        // Determine risk level
        const risk = this.calculateRiskLevel(finalScore, scores, evidence);

        return {
            isScreen: finalScore > this.config.thresholds[this.config.mode],
            confidence: Math.min(1, this.calculateCombinedConfidence(scores) + confidenceBoost),
            score: finalScore,
            risk,
            agreement: this.calculateMethodAgreement(scores),
            primaryMethod: this.identifyPrimaryMethod(scores),
            evidence: this.consolidateEvidence(evidence)
        };
    }

    /**
     * Get dynamic method weight based on context
     */
    getMethodWeight(method, input) {
        let baseWeight = this.config.methodWeights[method] || 0.1;
        
        // Adjust weights based on availability and reliability
        switch (method) {
            case 'hardware':
                // Hardware is most reliable when all sensors available
                if (input.sensors && this.hasAllSensors(input.sensors)) {
                    baseWeight *= 1.2;
                }
                break;
                
            case 'mlVisual':
                // ML is reliable when properly trained
                if (advancedDetector.initialized && advancedDetector.modelVersion >= 2) {
                    baseWeight *= 1.1;
                }
                break;
                
            case 'temporal':
                // Temporal is very reliable with enough frames
                if (input.frames && input.frames.length > 30) {
                    baseWeight *= 1.15;
                }
                break;
        }
        
        return baseWeight;
    }

    /**
     * Deep forensics analysis
     */
    async deepForensics(imageBuffer) {
        const forensics = {
            compression: await this.analyzeCompression(imageBuffer),
            metadata: await this.analyzeImageMetadata(imageBuffer),
            pixelStatistics: await this.analyzePixelStatistics(imageBuffer),
            colorAuthenticity: await this.analyzeColorAuthenticity(imageBuffer)
        };

        // Calculate forensic indicators
        const indicators = {
            hasCompressionArtifacts: forensics.compression.artifactScore > 0.7,
            hasMetadataAnomalies: forensics.metadata.anomalyCount > 0,
            hasPixelPatterns: forensics.pixelStatistics.patternScore > 0.6,
            hasColorAnomalies: forensics.colorAuthenticity.anomalyScore > 0.5
        };

        const isLikelyScreen = Object.values(indicators).filter(v => v).length >= 2;

        return {
            verdict: {
                isScreen: isLikelyScreen,
                confidence: this.calculateForensicConfidence(forensics)
            },
            forensics,
            indicators
        };
    }

    /**
     * Cross-validate results between methods
     */
    async crossValidateResults(methods, input) {
        const validations = [];

        // Hardware vs Visual
        if (methods.hardware && methods.mlVisual) {
            validations.push({
                pair: 'hardware-visual',
                agree: methods.hardware.verdict.isScreen === methods.mlVisual.verdict.isScreen,
                confidence: (methods.hardware.verdict.confidence + methods.mlVisual.verdict.confidence) / 2
            });
        }

        // Temporal vs Static
        if (methods.temporal && methods.basicVisual) {
            validations.push({
                pair: 'temporal-static',
                agree: methods.temporal.verdict.isScreen === methods.basicVisual.verdict.isScreen,
                details: this.compareTemporalStatic(methods.temporal, methods.basicVisual)
            });
        }

        // Forensics vs ML
        if (methods.forensics && methods.mlVisual) {
            validations.push({
                pair: 'forensics-ml',
                agree: methods.forensics.verdict.isScreen === methods.mlVisual.verdict.isScreen,
                correlation: this.calculateCorrelation(methods.forensics, methods.mlVisual)
            });
        }

        return {
            validations,
            overallAgreement: this.calculateOverallAgreement(validations),
            conflicts: validations.filter(v => !v.agree),
            reliability: this.assessValidationReliability(validations)
        };
    }

    /**
     * Temporal analysis for video
     */
    async temporalAnalysis(frames) {
        const detector = new realTimeDetector.constructor();
        
        // Create frame generator
        async function* frameGenerator() {
            for (const frame of frames) {
                yield frame;
            }
        }

        // Analyze video stream
        const result = await detector.analyzeVideoStream(frameGenerator());
        
        return {
            verdict: result.verdict,
            temporalEvidence: result.evidence,
            frameCount: result.frameAnalyzed
        };
    }

    /**
     * Calculate comprehensive confidence
     */
    calculateComprehensiveConfidence(results, verdict) {
        let confidence = verdict.confidence;
        
        // Boost confidence based on cross-validation
        if (results.crossValidation) {
            const agreementBoost = results.crossValidation.overallAgreement * 0.1;
            confidence += agreementBoost;
        }
        
        // Boost for multiple strong indicators
        const strongIndicators = this.countStrongIndicators(results.methods);
        confidence += Math.min(strongIndicators * 0.05, 0.15);
        
        // Penalty for conflicts
        if (results.crossValidation && results.crossValidation.conflicts.length > 0) {
            confidence -= results.crossValidation.conflicts.length * 0.05;
        }
        
        return Math.max(0, Math.min(1, confidence));
    }

    /**
     * Helper methods
     */

    async prepareInput(input) {
        // Standardize input format
        const prepared = {
            image: input.image || input.imageBuffer,
            metadata: input.metadata || {},
            sensors: input.sensors || input.sensorData,
            frames: input.frames || input.videoFrames,
            timestamp: Date.now()
        };

        // Generate hash for caching
        if (prepared.image) {
            const crypto = require('crypto');
            const hash = crypto.createHash('sha256');
            hash.update(prepared.image);
            prepared.hash = hash.digest('hex');
        }

        return prepared;
    }

    checkCache(hash) {
        const cached = this.cache.get(hash);
        if (cached && Date.now() - cached.timestamp < this.config.cacheDuration) {
            return cached.result;
        }
        return null;
    }

    cacheResult(hash, result) {
        this.cache.set(hash, {
            result,
            timestamp: Date.now()
        });
        
        // Clean old cache entries
        if (this.cache.size > 1000) {
            const oldestKey = this.cache.keys().next().value;
            this.cache.delete(oldestKey);
        }
    }

    updateStatistics(result, processingTime) {
        if (result.verdict.isScreen) {
            this.statistics.screensDetected++;
        }
        
        // Update average processing time
        const n = this.statistics.totalDetections;
        this.statistics.avgProcessingTime = 
            (this.statistics.avgProcessingTime * (n - 1) + processingTime) / n;
    }

    hasMinimalSensors(sensors) {
        return sensors && (sensors.depth || sensors.light || sensors.motion);
    }

    hasSufficientSensors(sensors) {
        if (!sensors) return false;
        
        const available = [];
        if (sensors.depth) available.push('depth');
        if (sensors.light) available.push('light');
        if (sensors.motion) available.push('motion');
        if (sensors.magnetic) available.push('magnetic');
        
        return available.length >= 2;
    }

    hasAllSensors(sensors) {
        return sensors && sensors.depth && sensors.light && sensors.motion && 
               sensors.magnetic && sensors.proximity && sensors.temperature;
    }

    async quickVisualCheck(imageBuffer) {
        // Fast moiré detection
        const moireScore = await this.quickMoireCheck(imageBuffer);
        
        // Fast edge detection
        const edgeScore = await this.quickEdgeCheck(imageBuffer);
        
        const isScreen = (moireScore > 0.6 || edgeScore > 0.7);
        
        return {
            verdict: {
                isScreen,
                confidence: isScreen ? 0.7 : 0.3,
                score: Math.max(moireScore, edgeScore)
            }
        };
    }

    async quickHardwareCheck(sensors) {
        // Check most reliable sensors quickly
        const checks = [];
        
        if (sensors.depth && sensors.depth.distance < 2.0) {
            checks.push(sensors.depth.flatness > 0.9);
        }
        
        if (sensors.light && sensors.light.blueRatio > 1.3) {
            checks.push(true);
        }
        
        const isScreen = checks.filter(c => c).length >= 1;
        
        return {
            verdict: {
                isScreen,
                confidence: isScreen ? 0.6 : 0.4
            }
        };
    }

    combineQuickResults(methods) {
        let score = 0;
        let count = 0;
        
        for (const result of Object.values(methods)) {
            if (result && result.verdict) {
                score += result.verdict.isScreen ? 1 : 0;
                count++;
            }
        }
        
        const avgScore = count > 0 ? score / count : 0;
        
        return {
            isScreen: avgScore > 0.5,
            confidence: 0.6, // Lower confidence for quick mode
            score: avgScore
        };
    }

    calculateCombinedConfidence(scores) {
        const confidences = Object.values(scores).map(s => s.confidence);
        if (confidences.length === 0) return 0;
        
        // Weighted average with agreement bonus
        const avg = confidences.reduce((a, b) => a + b, 0) / confidences.length;
        const variance = this.calculateVariance(confidences);
        
        // Low variance (high agreement) boosts confidence
        const agreementMultiplier = 1 + (1 - variance) * 0.2;
        
        return Math.min(1, avg * agreementMultiplier);
    }

    calculateMethodAgreement(scores) {
        const decisions = Object.values(scores).map(s => s.isScreen);
        if (decisions.length < 2) return 1;
        
        const agreeWithFirst = decisions.filter(d => d === decisions[0]).length;
        return agreeWithFirst / decisions.length;
    }

    identifyPrimaryMethod(scores) {
        let best = null;
        let highestConfidence = 0;
        
        for (const [method, score] of Object.entries(scores)) {
            if (score.confidence > highestConfidence) {
                highestConfidence = score.confidence;
                best = method;
            }
        }
        
        return best;
    }

    consolidateEvidence(evidenceList) {
        const consolidated = {
            strong: [],
            moderate: [],
            weak: []
        };
        
        for (const item of evidenceList) {
            const evidence = item.evidence;
            
            if (evidence.strongIndicators) {
                consolidated.strong.push(...evidence.strongIndicators);
            }
            if (evidence.moderateIndicators) {
                consolidated.moderate.push(...evidence.moderateIndicators);
            }
            if (evidence.weakIndicators) {
                consolidated.weak.push(...evidence.weakIndicators);
            }
        }
        
        // Remove duplicates
        consolidated.strong = [...new Set(consolidated.strong)];
        consolidated.moderate = [...new Set(consolidated.moderate)];
        consolidated.weak = [...new Set(consolidated.weak)];
        
        return consolidated;
    }

    calculateRiskLevel(score, scores, evidence) {
        // Base risk on score
        let risk = 'low';
        if (score > 0.9) risk = 'critical';
        else if (score > 0.75) risk = 'high';
        else if (score > 0.5) risk = 'medium';
        
        // Adjust based on evidence strength
        const strongEvidenceCount = evidence.reduce(
            (count, e) => count + (e.evidence.strongIndicators?.length || 0), 0
        );
        
        if (strongEvidenceCount > 3 && risk === 'medium') {
            risk = 'high';
        }
        
        return risk;
    }

    async postProcessResults(result, input) {
        // Add recommendations
        result.recommendations = this.generateRecommendations(result);
        
        // Add explanation
        result.explanation = this.generateExplanation(result);
        
        // Add metadata
        result.metadata = {
            detectorVersion: '3.0',
            inputType: this.detectInputType(input),
            timestamp: Date.now()
        };
        
        return result;
    }

    generateRecommendations(result) {
        const recommendations = [];
        
        if (result.verdict.isScreen) {
            recommendations.push({
                action: 'reject',
                priority: 'high',
                message: 'This image appears to be photographed from a screen'
            });
            
            // Specific recommendations based on detection method
            if (result.verdict.primaryMethod === 'hardware') {
                recommendations.push({
                    action: 'verify',
                    priority: 'medium',
                    message: 'Hardware sensors confirm screen detection'
                });
            }
        } else if (result.verdict.confidence < 0.7) {
            recommendations.push({
                action: 'review',
                priority: 'medium',
                message: 'Manual review recommended due to inconclusive results'
            });
        }
        
        return recommendations;
    }

    generateExplanation(result) {
        const explanations = [];
        
        // Main verdict
        if (result.verdict.isScreen) {
            explanations.push(`Screen detected with ${Math.round(result.verdict.confidence * 100)}% confidence`);
        } else {
            explanations.push(`Image appears authentic with ${Math.round(result.verdict.confidence * 100)}% confidence`);
        }
        
        // Method explanations
        if (result.methods) {
            for (const [method, data] of Object.entries(result.methods)) {
                if (data && data.verdict && data.verdict.isScreen) {
                    explanations.push(`${method}: ${this.getMethodExplanation(method, data)}`);
                }
            }
        }
        
        return explanations.join('. ');
    }

    getMethodExplanation(method, data) {
        switch (method) {
            case 'hardware':
                return 'Hardware sensors detected flat surface and artificial light';
            case 'mlVisual':
                return 'AI detected screen patterns and pixel structures';
            case 'temporal':
                return 'Video analysis found refresh rate patterns';
            default:
                return 'Visual analysis detected screen characteristics';
        }
    }

    detectInputType(input) {
        const types = [];
        
        if (input.image) types.push('image');
        if (input.sensors) types.push('sensors');
        if (input.frames) types.push('video');
        if (input.metadata) types.push('metadata');
        
        return types;
    }

    // Utility methods
    calculateVariance(values) {
        if (values.length === 0) return 0;
        const mean = values.reduce((a, b) => a + b, 0) / values.length;
        return values.reduce((sum, v) => sum + Math.pow(v - mean, 2), 0) / values.length;
    }

    async quickMoireCheck(imageBuffer) {
        // Simplified moiré check
        // In production, use actual FFT
        return Math.random() * 0.5; // Mock score
    }

    async quickEdgeCheck(imageBuffer) {
        // Simplified edge check
        return Math.random() * 0.5; // Mock score
    }

    async analyzeCompression(imageBuffer) {
        return {
            artifactScore: Math.random(),
            blockiness: Math.random(),
            quality: 85
        };
    }

    async analyzeImageMetadata(imageBuffer) {
        return {
            anomalyCount: Math.floor(Math.random() * 3),
            software: 'unknown',
            modified: false
        };
    }

    async analyzePixelStatistics(imageBuffer) {
        return {
            patternScore: Math.random(),
            uniformity: Math.random(),
            noise: Math.random()
        };
    }

    async analyzeColorAuthenticity(imageBuffer) {
        return {
            anomalyScore: Math.random(),
            gamutViolations: 0,
            whiteBalance: 'auto'
        };
    }

    calculateForensicConfidence(forensics) {
        return Math.random() * 0.3 + 0.5; // Mock confidence
    }

    compareTemporalStatic(temporal, static) {
        return {
            consistent: Math.random() > 0.3,
            discrepancy: Math.random()
        };
    }

    calculateCorrelation(forensics, ml) {
        return Math.random() * 2 - 1; // Mock correlation
    }

    calculateOverallAgreement(validations) {
        if (validations.length === 0) return 1;
        const agreements = validations.filter(v => v.agree).length;
        return agreements / validations.length;
    }

    assessValidationReliability(validations) {
        // Higher confidence validations are more reliable
        const avgConfidence = validations.reduce((sum, v) => sum + (v.confidence || 0.5), 0) / validations.length;
        return avgConfidence;
    }

    countStrongIndicators(methods) {
        let count = 0;
        
        for (const method of Object.values(methods)) {
            if (method && method.evidence && method.evidence.strongIndicators) {
                count += method.evidence.strongIndicators.length;
            }
        }
        
        return count;
    }

    async comprehensiveVerdict(methods, crossValidation) {
        // Use all evidence for final verdict
        const allScores = [];
        
        for (const method of Object.values(methods)) {
            if (method && method.verdict) {
                allScores.push({
                    score: method.verdict.score || (method.verdict.isScreen ? 1 : 0),
                    confidence: method.verdict.confidence || 0.5,
                    weight: 1
                });
            }
        }
        
        // Adjust weights based on cross-validation
        if (crossValidation && crossValidation.conflicts.length > 0) {
            // Reduce weight of conflicting methods
            // Implementation depends on specific conflict resolution strategy
        }
        
        // Calculate weighted average
        let weightedSum = 0;
        let weightSum = 0;
        
        for (const item of allScores) {
            weightedSum += item.score * item.confidence * item.weight;
            weightSum += item.confidence * item.weight;
        }
        
        const finalScore = weightSum > 0 ? weightedSum / weightSum : 0;
        
        return {
            isScreen: finalScore > this.config.thresholds.strict,
            confidence: this.calculateComprehensiveConfidence({ methods }, { confidence: 0.8 }),
            score: finalScore,
            risk: this.calculateRiskLevel(finalScore, {}, [])
        };
    }

    /**
     * Get detection statistics
     */
    getStatistics() {
        return {
            ...this.statistics,
            cacheSize: this.cache.size,
            initialized: this.initialized,
            config: this.config
        };
    }

    /**
     * Update configuration
     */
    updateConfig(updates) {
        this.config = { ...this.config, ...updates };
        logger.info('Screen detection config updated', { config: this.config });
    }
}

// Export singleton instance
module.exports = new UnifiedScreenDetector();
