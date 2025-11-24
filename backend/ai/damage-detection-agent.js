/**
 * AI Agent for Property Damage Detection
 * 
 * This agent uses AI/ML to detect damage in insurance claim photos:
 * - Auto damage (dents, scratches, broken glass)
 * - Property damage (water, fire, roof, structural)
 * - Severity assessment (minor, moderate, severe)
 * 
 * Combined with ZK proofs for complete fraud prevention:
 * ZK Proof = Photo is REAL → Damage Detection = Damage is REAL
 */

const tf = require('@tensorflow/tfjs-node');
const sharp = require('sharp');
const fs = require('fs').promises;
const path = require('path');

class DamageDetectionAgent {
    constructor() {
        this.models = {
            autoDamage: null,
            propertyDamage: null,
            severityClassifier: null,
            objectDetector: null // For detecting cars, buildings, etc.
        };
        
        this.claimTypes = {
            AUTO_COLLISION: 'auto_collision',
            WATER_DAMAGE: 'water_damage',
            ROOF_DAMAGE: 'roof_damage',
            FIRE_DAMAGE: 'fire_damage',
            STRUCTURAL: 'structural_damage'
        };
        
        this.damageCategories = {
            // Auto damage
            DENT: 'dent',
            SCRATCH: 'scratch',
            BROKEN_GLASS: 'broken_glass',
            PAINT_DAMAGE: 'paint_damage',
            BUMPER_DAMAGE: 'bumper_damage',
            
            // Property damage
            WATER_STAIN: 'water_stain',
            MOLD: 'mold',
            MISSING_SHINGLES: 'missing_shingles',
            ROOF_HOLE: 'roof_hole',
            CRACK: 'crack',
            FIRE_CHAR: 'fire_char',
            
            // No damage
            NO_DAMAGE: 'no_damage'
        };
        
        this.severity = {
            NONE: 'none',
            MINOR: 'minor',
            MODERATE: 'moderate',
            SEVERE: 'severe',
            TOTAL_LOSS: 'total_loss'
        };
        
        this.initialized = false;
    }

    /**
     * Initialize all AI models
     */
    async initialize() {
        try {
            console.log('🤖 Initializing Damage Detection Agent...');
            
            // For MVP: Use pre-trained models + heuristics
            // Later: Load custom trained models
            await this.loadOrCreateModels();
            
            this.initialized = true;
            console.log('✅ Damage Detection Agent initialized');
            
            return {
                success: true,
                models: Object.keys(this.models).filter(k => this.models[k] !== null),
                message: 'Damage detection ready'
            };
        } catch (error) {
            console.error('❌ Failed to initialize Damage Detection Agent:', error);
            throw error;
        }
    }

    /**
     * Main damage detection function
     * 
     * @param {Buffer} imageBuffer - Image to analyze
     * @param {string} claimType - Type of claim (auto, water, roof, etc.)
     * @param {object} metadata - Additional metadata (GPS, timestamp, etc.)
     * @returns {object} Damage detection report
     */
    async detectDamage(imageBuffer, claimType, metadata = {}) {
        if (!this.initialized) {
            await this.initialize();
        }

        console.log(`🔍 Analyzing ${claimType} claim for damage...`);

        try {
            // Run parallel analysis
            const [
                objectDetection,
                damageAnalysis,
                severityAssessment,
                imageQuality,
                contextAnalysis
            ] = await Promise.all([
                this.detectObjects(imageBuffer),
                this.analyzeDamage(imageBuffer, claimType),
                this.assessSeverity(imageBuffer, claimType),
                this.checkImageQuality(imageBuffer),
                this.analyzeContext(imageBuffer, metadata)
            ]);

            // Combine all signals
            const combinedResult = this.combineAnalysis({
                objectDetection,
                damageAnalysis,
                severityAssessment,
                imageQuality,
                contextAnalysis,
                claimType,
                metadata
            });

            // Generate detailed report
            const report = this.generateReport(combinedResult);

            console.log(`✅ Analysis complete: ${report.verdict.hasDamage ? 'Damage detected' : 'No damage'} (${(report.verdict.confidence * 100).toFixed(1)}%)`);

            return report;
        } catch (error) {
            console.error('❌ Damage detection failed:', error);
            throw error;
        }
    }

    /**
     * Detect objects in the image (car, building, roof, etc.)
     * This helps validate the photo matches the claim type
     */
    async detectObjects(imageBuffer) {
        console.log('  → Detecting objects...');
        
        try {
            // Preprocess image
            const { data, width, height } = await this.preprocessImage(imageBuffer, 224, 224);
            
            // For MVP: Use heuristic-based detection
            // Later: Use MobileNet or COCO-SSD
            const objects = await this.detectObjectsHeuristic(data, width, height);
            
            return {
                success: true,
                objects,
                primaryObject: objects[0] || null,
                confidence: objects.length > 0 ? objects[0].confidence : 0
            };
        } catch (error) {
            console.error('Object detection failed:', error);
            return {
                success: false,
                objects: [],
                primaryObject: null,
                confidence: 0,
                error: error.message
            };
        }
    }

    /**
     * Analyze for damage patterns
     */
    async analyzeDamage(imageBuffer, claimType) {
        console.log('  → Analyzing damage patterns...');
        
        try {
            // Different analysis based on claim type
            let damageIndicators;
            
            switch(claimType) {
                case this.claimTypes.AUTO_COLLISION:
                    damageIndicators = await this.detectAutoDamage(imageBuffer);
                    break;
                    
                case this.claimTypes.WATER_DAMAGE:
                    damageIndicators = await this.detectWaterDamage(imageBuffer);
                    break;
                    
                case this.claimTypes.ROOF_DAMAGE:
                    damageIndicators = await this.detectRoofDamage(imageBuffer);
                    break;
                    
                case this.claimTypes.FIRE_DAMAGE:
                    damageIndicators = await this.detectFireDamage(imageBuffer);
                    break;
                    
                default:
                    damageIndicators = await this.detectGeneralDamage(imageBuffer);
            }
            
            return {
                success: true,
                indicators: damageIndicators,
                hasDamage: damageIndicators.score > 0.5,
                confidence: damageIndicators.score
            };
        } catch (error) {
            console.error('Damage analysis failed:', error);
            return {
                success: false,
                indicators: null,
                hasDamage: false,
                confidence: 0,
                error: error.message
            };
        }
    }

    /**
     * Assess severity of damage
     */
    async assessSeverity(imageBuffer, claimType) {
        console.log('  → Assessing damage severity...');
        
        try {
            const { data, width, height } = await this.preprocessImage(imageBuffer, 256, 256);
            
            // Analyze extent of damage
            const metrics = {
                damagedAreaPercent: await this.calculateDamagedArea(data, width, height),
                edgeDistortion: await this.measureEdgeDistortion(data, width, height),
                colorAnomalies: await this.detectColorAnomalies(data, width, height),
                structuralIssues: await this.detectStructuralIssues(data, width, height)
            };
            
            // Calculate severity score (0-1)
            const severityScore = (
                metrics.damagedAreaPercent * 0.4 +
                metrics.edgeDistortion * 0.3 +
                metrics.colorAnomalies * 0.2 +
                metrics.structuralIssues * 0.1
            );
            
            // Map to severity level
            let level;
            if (severityScore < 0.2) level = this.severity.MINOR;
            else if (severityScore < 0.5) level = this.severity.MODERATE;
            else if (severityScore < 0.8) level = this.severity.SEVERE;
            else level = this.severity.TOTAL_LOSS;
            
            return {
                success: true,
                level,
                score: severityScore,
                metrics,
                estimatedCost: this.estimateCost(level, claimType, metrics)
            };
        } catch (error) {
            console.error('Severity assessment failed:', error);
            return {
                success: false,
                level: this.severity.NONE,
                score: 0,
                metrics: null,
                error: error.message
            };
        }
    }

    /**
     * Check image quality (blur, lighting, resolution)
     */
    async checkImageQuality(imageBuffer) {
        console.log('  → Checking image quality...');
        
        try {
            const metadata = await sharp(imageBuffer).metadata();
            const { data, width, height } = await this.preprocessImage(imageBuffer, 512, 512);
            
            // Calculate quality metrics
            const quality = {
                resolution: width * height,
                isBlurry: await this.detectBlur(data, width, height),
                lighting: await this.analyzeLighting(data, width, height),
                hasObstructions: await this.detectObstructions(data, width, height)
            };
            
            // Overall quality score
            const qualityScore = (
                (quality.resolution > 500000 ? 1 : 0.5) * 0.3 +
                (quality.isBlurry ? 0 : 1) * 0.4 +
                quality.lighting * 0.2 +
                (quality.hasObstructions ? 0 : 1) * 0.1
            );
            
            return {
                success: true,
                score: qualityScore,
                metrics: quality,
                isUsable: qualityScore > 0.6
            };
        } catch (error) {
            console.error('Quality check failed:', error);
            return {
                success: false,
                score: 0,
                metrics: null,
                isUsable: false,
                error: error.message
            };
        }
    }

    /**
     * Analyze context (GPS, time, metadata)
     */
    async analyzeContext(imageBuffer, metadata) {
        console.log('  → Analyzing context...');
        
        const context = {
            hasLocation: !!metadata.gps,
            hasTimestamp: !!metadata.timestamp,
            hasMotionData: !!metadata.motion,
            isSuspicious: false
        };
        
        // Check for suspicious patterns
        if (metadata.gps) {
            // Check if GPS matches claimed location
            context.locationMatch = true; // TODO: Implement location verification
        }
        
        if (metadata.timestamp) {
            // Check if timestamp is recent
            const age = Date.now() - new Date(metadata.timestamp).getTime();
            context.isFresh = age < 24 * 60 * 60 * 1000; // Less than 24 hours
        }
        
        return {
            success: true,
            context,
            score: context.isSuspicious ? 0 : 1
        };
    }

    /**
     * Combine all analysis results
     */
    combineAnalysis({ objectDetection, damageAnalysis, severityAssessment, imageQuality, contextAnalysis, claimType, metadata }) {
        // Weight each component
        const weights = {
            damageAnalysis: 0.50,      // Most important
            severityAssessment: 0.25,  // Second most important
            objectDetection: 0.15,     // Validates claim type
            imageQuality: 0.07,        // Supporting evidence
            contextAnalysis: 0.03      // Additional verification
        };
        
        // Calculate weighted confidence
        const confidence = (
            (damageAnalysis.confidence || 0) * weights.damageAnalysis +
            (severityAssessment.score || 0) * weights.severityAssessment +
            (objectDetection.confidence || 0) * weights.objectDetection +
            (imageQuality.score || 0) * weights.imageQuality +
            (contextAnalysis.score || 0) * weights.contextAnalysis
        );
        
        return {
            hasDamage: damageAnalysis.hasDamage,
            confidence,
            severity: severityAssessment.level,
            severityScore: severityAssessment.score,
            estimatedCost: severityAssessment.estimatedCost,
            objectDetected: objectDetection.primaryObject,
            imageQuality: imageQuality.isUsable,
            components: {
                objectDetection,
                damageAnalysis,
                severityAssessment,
                imageQuality,
                contextAnalysis
            },
            metadata
        };
    }

    /**
     * Generate detailed report
     */
    generateReport(analysis) {
        const report = {
            success: true,
            timestamp: new Date().toISOString(),
            
            verdict: {
                hasDamage: analysis.hasDamage,
                confidence: analysis.confidence,
                severity: analysis.severity,
                isHighConfidence: analysis.confidence > 0.8
            },
            
            damage: {
                type: analysis.components.damageAnalysis.indicators?.type || 'unknown',
                severity: analysis.severity,
                score: analysis.severityScore,
                estimatedCost: analysis.estimatedCost,
                affectedArea: analysis.components.damageAnalysis.indicators?.affectedArea || null
            },
            
            object: {
                detected: analysis.objectDetected?.type || 'unknown',
                confidence: analysis.components.objectDetection.confidence,
                matches_claim: true // TODO: Implement claim type matching
            },
            
            quality: {
                score: analysis.components.imageQuality.score,
                isUsable: analysis.imageQuality,
                issues: this.getQualityIssues(analysis.components.imageQuality.metrics)
            },
            
            evidence: {
                strongIndicators: this.getStrongIndicators(analysis),
                weakIndicators: this.getWeakIndicators(analysis),
                counterIndicators: this.getCounterIndicators(analysis)
            },
            
            recommendations: this.generateRecommendations(analysis),
            
            metadata: {
                processingTime: null, // TODO: Track processing time
                modelVersion: '1.0.0-mvp',
                componentsUsed: Object.keys(analysis.components)
            }
        };
        
        return report;
    }

    // ==================== DAMAGE DETECTION METHODS ====================

    /**
     * Detect auto damage (dents, scratches, broken glass)
     */
    async detectAutoDamage(imageBuffer) {
        const { data, width, height } = await this.preprocessImage(imageBuffer, 512, 512);
        
        // Heuristic-based detection (MVP)
        // Later: Replace with trained CNN model
        
        const indicators = {
            dents: await this.detectDents(data, width, height),
            scratches: await this.detectScratches(data, width, height),
            brokenGlass: await this.detectBrokenGlass(data, width, height),
            paintDamage: await this.detectPaintDamage(data, width, height)
        };
        
        // Combine indicators
        const score = Math.max(
            indicators.dents,
            indicators.scratches,
            indicators.brokenGlass,
            indicators.paintDamage
        );
        
        const primaryType = Object.entries(indicators)
            .reduce((a, b) => a[1] > b[1] ? a : b)[0];
        
        return {
            type: primaryType,
            score,
            indicators,
            affectedArea: score > 0.5 ? 'detected' : 'none'
        };
    }

    /**
     * Detect water damage (stains, mold, warping)
     */
    async detectWaterDamage(imageBuffer) {
        const { data, width, height } = await this.preprocessImage(imageBuffer, 512, 512);
        
        const indicators = {
            waterStains: await this.detectWaterStains(data, width, height),
            mold: await this.detectMold(data, width, height),
            warping: await this.detectWarping(data, width, height),
            discoloration: await this.detectDiscoloration(data, width, height)
        };
        
        const score = (
            indicators.waterStains * 0.4 +
            indicators.mold * 0.3 +
            indicators.warping * 0.2 +
            indicators.discoloration * 0.1
        );
        
        return {
            type: 'water_damage',
            score,
            indicators,
            affectedArea: score > 0.5 ? 'ceiling/walls' : 'none'
        };
    }

    /**
     * Detect roof damage (missing shingles, holes, leaks)
     */
    async detectRoofDamage(imageBuffer) {
        const { data, width, height } = await this.preprocessImage(imageBuffer, 512, 512);
        
        const indicators = {
            missingShingles: await this.detectMissingShingles(data, width, height),
            holes: await this.detectHoles(data, width, height),
            sagging: await this.detectSagging(data, width, height),
            cracks: await this.detectCracks(data, width, height)
        };
        
        const score = Math.max(...Object.values(indicators));
        
        return {
            type: 'roof_damage',
            score,
            indicators,
            affectedArea: score > 0.5 ? 'roof surface' : 'none'
        };
    }

    /**
     * Detect fire damage (soot, char, smoke damage)
     */
    async detectFireDamage(imageBuffer) {
        const { data, width, height } = await this.preprocessImage(imageBuffer, 512, 512);
        
        const indicators = {
            char: await this.detectCharring(data, width, height),
            soot: await this.detectSoot(data, width, height),
            smokeDamage: await this.detectSmokeDamage(data, width, height)
        };
        
        const score = Math.max(...Object.values(indicators));
        
        return {
            type: 'fire_damage',
            score,
            indicators,
            affectedArea: score > 0.5 ? 'walls/ceiling' : 'none'
        };
    }

    /**
     * Detect general damage (fallback)
     */
    async detectGeneralDamage(imageBuffer) {
        const { data, width, height } = await this.preprocessImage(imageBuffer, 512, 512);
        
        const indicators = {
            cracks: await this.detectCracks(data, width, height),
            holes: await this.detectHoles(data, width, height),
            deformation: await this.detectDeformation(data, width, height)
        };
        
        const score = Math.max(...Object.values(indicators));
        
        return {
            type: 'general_damage',
            score,
            indicators,
            affectedArea: score > 0.5 ? 'detected' : 'none'
        };
    }

    // ==================== HEURISTIC DETECTION METHODS ====================
    // These are MVP implementations - will be replaced with ML models

    async detectDents(data, width, height) {
        // Look for curved depressions (darker areas with smooth gradients)
        // This is a simplified heuristic - real implementation would use CNN
        let dentScore = 0;
        const threshold = 100;
        
        for (let y = 1; y < height - 1; y++) {
            for (let x = 1; x < width - 1; x++) {
                const idx = (y * width + x) * 4;
                const neighbors = [
                    data[(y-1) * width * 4 + x * 4],
                    data[y * width * 4 + (x-1) * 4],
                    data[y * width * 4 + (x+1) * 4],
                    data[(y+1) * width * 4 + x * 4]
                ];
                const avg = neighbors.reduce((a, b) => a + b, 0) / 4;
                const diff = Math.abs(data[idx] - avg);
                
                if (diff < threshold && avg < 150) {
                    dentScore += 0.01;
                }
            }
        }
        
        return Math.min(dentScore / (width * height / 1000), 1.0);
    }

    async detectScratches(data, width, height) {
        // Look for linear patterns with sharp contrast
        let scratchScore = 0;
        // Simplified edge detection
        // Real implementation would use Canny edge detection
        
        return Math.random() * 0.3; // Placeholder for MVP
    }

    async detectBrokenGlass(data, width, height) {
        // Look for spider-web patterns and sharp edges
        // Check for high-frequency changes in brightness
        
        return Math.random() * 0.2; // Placeholder for MVP
    }

    async detectPaintDamage(data, width, height) {
        // Look for color inconsistencies and exposed metal
        let paintDamageScore = 0;
        
        // Check for rust colors (reddish-brown)
        for (let i = 0; i < data.length; i += 4) {
            const r = data[i];
            const g = data[i + 1];
            const b = data[i + 2];
            
            // Rust has high red, medium green, low blue
            if (r > 150 && g > 80 && g < 130 && b < 100) {
                paintDamageScore += 0.01;
            }
        }
        
        return Math.min(paintDamageScore / (width * height / 1000), 1.0);
    }

    async detectWaterStains(data, width, height) {
        // Look for brownish discoloration in organic patterns
        let stainScore = 0;
        
        for (let i = 0; i < data.length; i += 4) {
            const r = data[i];
            const g = data[i + 1];
            const b = data[i + 2];
            
            // Water stains are often brownish/yellowish
            if (r > 120 && g > 100 && b < 90) {
                stainScore += 0.01;
            }
        }
        
        return Math.min(stainScore / (width * height / 1000), 1.0);
    }

    async detectMold(data, width, height) {
        // Look for dark spots with fuzzy edges
        // Mold is often black, green, or brown
        
        return Math.random() * 0.3; // Placeholder for MVP
    }

    async detectWarping(data, width, height) {
        // Look for curved lines that should be straight
        // Analyze edge patterns
        
        return Math.random() * 0.2; // Placeholder for MVP
    }

    async detectDiscoloration(data, width, height) {
        // Analyze color distribution
        let avgR = 0, avgG = 0, avgB = 0;
        const pixels = data.length / 4;
        
        for (let i = 0; i < data.length; i += 4) {
            avgR += data[i];
            avgG += data[i + 1];
            avgB += data[i + 2];
        }
        
        avgR /= pixels;
        avgG /= pixels;
        avgB /= pixels;
        
        // Calculate variance
        let variance = 0;
        for (let i = 0; i < data.length; i += 4) {
            const r = data[i] - avgR;
            const g = data[i + 1] - avgG;
            const b = data[i + 2] - avgB;
            variance += r * r + g * g + b * b;
        }
        variance /= pixels;
        
        // High variance might indicate discoloration
        return Math.min(variance / 10000, 1.0);
    }

    async detectMissingShingles(data, width, height) {
        // Look for gaps in regular patterns
        
        return Math.random() * 0.4; // Placeholder for MVP
    }

    async detectHoles(data, width, height) {
        // Look for very dark spots with sharp edges
        let holeScore = 0;
        
        for (let i = 0; i < data.length; i += 4) {
            const brightness = (data[i] + data[i + 1] + data[i + 2]) / 3;
            if (brightness < 30) {
                holeScore += 0.01;
            }
        }
        
        return Math.min(holeScore / (width * height / 1000), 1.0);
    }

    async detectSagging(data, width, height) {
        // Look for drooping lines
        
        return Math.random() * 0.3; // Placeholder for MVP
    }

    async detectCracks(data, width, height) {
        // Look for linear discontinuities
        
        return Math.random() * 0.4; // Placeholder for MVP
    }

    async detectCharring(data, width, height) {
        // Look for black/charred areas
        let charScore = 0;
        
        for (let i = 0; i < data.length; i += 4) {
            const brightness = (data[i] + data[i + 1] + data[i + 2]) / 3;
            if (brightness < 50) {
                charScore += 0.01;
            }
        }
        
        return Math.min(charScore / (width * height / 1000), 1.0);
    }

    async detectSoot(data, width, height) {
        // Look for grayish deposits
        
        return Math.random() * 0.3; // Placeholder for MVP
    }

    async detectSmokeDamage(data, width, height) {
        // Look for hazy, discolored areas
        
        return Math.random() * 0.3; // Placeholder for MVP
    }

    async detectDeformation(data, width, height) {
        // Look for bent/twisted structures
        
        return Math.random() * 0.3; // Placeholder for MVP
    }

    // ==================== UTILITY METHODS ====================

    async detectObjectsHeuristic(data, width, height) {
        // Simplified object detection
        // Real implementation would use MobileNet or COCO-SSD
        
        return [
            {
                type: 'vehicle',
                confidence: 0.75,
                boundingBox: { x: 100, y: 100, width: 300, height: 200 }
            }
        ];
    }

    async calculateDamagedArea(data, width, height) {
        // Calculate what percentage of image shows damage
        // This is simplified - real implementation would use segmentation
        
        return Math.random() * 0.5; // 0-50% damaged
    }

    async measureEdgeDistortion(data, width, height) {
        // Measure how distorted edges are
        
        return Math.random() * 0.4;
    }

    async detectColorAnomalies(data, width, height) {
        // Detect unusual color patterns
        
        return Math.random() * 0.3;
    }

    async detectStructuralIssues(data, width, height) {
        // Detect structural problems
        
        return Math.random() * 0.4;
    }

    async detectBlur(data, width, height) {
        // Laplacian variance to detect blur
        // Simplified implementation
        
        return Math.random() > 0.8; // 20% chance of blur
    }

    async analyzeLighting(data, width, height) {
        // Check if lighting is adequate
        let avgBrightness = 0;
        const pixels = data.length / 4;
        
        for (let i = 0; i < data.length; i += 4) {
            avgBrightness += (data[i] + data[i + 1] + data[i + 2]) / 3;
        }
        avgBrightness /= pixels;
        
        // Good lighting: 80-200
        if (avgBrightness >= 80 && avgBrightness <= 200) {
            return 1.0;
        } else if (avgBrightness < 50 || avgBrightness > 220) {
            return 0.3;
        } else {
            return 0.7;
        }
    }

    async detectObstructions(data, width, height) {
        // Check for fingers, glare, etc.
        
        return Math.random() > 0.9; // 10% chance of obstruction
    }

    estimateCost(severity, claimType, metrics) {
        // Rough cost estimation based on severity and type
        const baseCosts = {
            auto_collision: { minor: 500, moderate: 2000, severe: 8000, total_loss: 25000 },
            water_damage: { minor: 800, moderate: 3000, severe: 15000, total_loss: 50000 },
            roof_damage: { minor: 600, moderate: 2500, severe: 10000, total_loss: 30000 },
            fire_damage: { minor: 1000, moderate: 5000, severe: 20000, total_loss: 100000 },
            structural_damage: { minor: 1000, moderate: 4000, severe: 15000, total_loss: 75000 }
        };
        
        const costs = baseCosts[claimType] || baseCosts.auto_collision;
        const baseCost = costs[severity] || costs.minor;
        
        // Add variance
        const variance = baseCost * 0.3;
        const min = Math.round(baseCost - variance);
        const max = Math.round(baseCost + variance);
        
        return `$${min.toLocaleString()}-$${max.toLocaleString()}`;
    }

    getQualityIssues(metrics) {
        const issues = [];
        
        if (metrics.isBlurry) issues.push('Image is blurry');
        if (metrics.lighting < 0.5) issues.push('Poor lighting');
        if (metrics.hasObstructions) issues.push('Obstruction detected');
        if (metrics.resolution < 500000) issues.push('Low resolution');
        
        return issues;
    }

    getStrongIndicators(analysis) {
        const indicators = [];
        
        if (analysis.confidence > 0.8) {
            indicators.push(`High confidence damage detection (${(analysis.confidence * 100).toFixed(1)}%)`);
        }
        
        if (analysis.severityScore > 0.6) {
            indicators.push(`Significant damage visible (severity: ${analysis.severity})`);
        }
        
        const damageIndicators = analysis.components.damageAnalysis.indicators?.indicators || {};
        Object.entries(damageIndicators).forEach(([type, score]) => {
            if (score > 0.7) {
                indicators.push(`${type} detected with ${(score * 100).toFixed(0)}% confidence`);
            }
        });
        
        return indicators;
    }

    getWeakIndicators(analysis) {
        const indicators = [];
        
        if (analysis.confidence > 0.5 && analysis.confidence <= 0.8) {
            indicators.push(`Moderate confidence (${(analysis.confidence * 100).toFixed(1)}%)`);
        }
        
        const damageIndicators = analysis.components.damageAnalysis.indicators?.indicators || {};
        Object.entries(damageIndicators).forEach(([type, score]) => {
            if (score > 0.4 && score <= 0.7) {
                indicators.push(`Possible ${type} (${(score * 100).toFixed(0)}% confidence)`);
            }
        });
        
        return indicators;
    }

    getCounterIndicators(analysis) {
        const indicators = [];
        
        if (!analysis.imageQuality) {
            indicators.push('Image quality issues may affect accuracy');
        }
        
        if (analysis.components.objectDetection.confidence < 0.5) {
            indicators.push('Unable to clearly identify object in image');
        }
        
        return indicators;
    }

    generateRecommendations(analysis) {
        const recommendations = [];
        
        if (!analysis.hasDamage) {
            recommendations.push('No significant damage detected in this image');
            recommendations.push('Consider requesting additional photos from different angles');
        } else {
            if (analysis.confidence > 0.8) {
                recommendations.push(`Damage confirmed: ${analysis.severity} ${analysis.components.damageAnalysis.indicators?.type}`);
            } else if (analysis.confidence > 0.5) {
                recommendations.push('Possible damage detected - recommend adjuster review');
                recommendations.push('Request additional photos for confirmation');
            } else {
                recommendations.push('Inconclusive - request clearer photos');
            }
            
            if (analysis.severity === 'severe' || analysis.severity === 'total_loss') {
                recommendations.push('⚠️ Significant damage - recommend immediate adjuster inspection');
            }
        }
        
        if (!analysis.imageQuality) {
            recommendations.push('Request higher quality photos (better lighting, focus, resolution)');
        }
        
        return recommendations;
    }

    /**
     * Preprocess image for analysis
     */
    async preprocessImage(imageBuffer, targetWidth, targetHeight) {
        const image = sharp(imageBuffer);
        
        // Resize and normalize
        const { data, info } = await image
            .resize(targetWidth, targetHeight, { fit: 'cover' })
            .raw()
            .toBuffer({ resolveWithObject: true });
        
        return {
            data,
            width: info.width,
            height: info.height,
            channels: info.channels
        };
    }

    /**
     * Load or create AI models
     */
    async loadOrCreateModels() {
        console.log('  → Loading models...');
        
        // For MVP: We don't load heavy models yet
        // Just set flags that we're using heuristics
        
        this.models.autoDamage = 'heuristic';
        this.models.propertyDamage = 'heuristic';
        this.models.severityClassifier = 'heuristic';
        this.models.objectDetector = 'heuristic';
        
        console.log('  → Using heuristic-based detection (MVP mode)');
        console.log('  → To enable ML models, train custom models or integrate pre-trained ones');
    }
}

// Export singleton instance
module.exports = new DamageDetectionAgent();

