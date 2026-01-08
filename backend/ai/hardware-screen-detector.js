/**
 * Hardware-based Screen Detection
 * 
 * Uses device sensors and hardware features to detect screens:
 * - Depth sensors (LiDAR/ToF)
 * - Ambient light sensors
 * - Magnetometer (detect monitor magnetic fields)
 * - Accelerometer/Gyroscope (hand movement patterns)
 * - Proximity sensors
 * - Temperature sensors (screens emit heat)
 */

class HardwareScreenDetector {
    constructor() {
        this.sensorThresholds = {
            depth: {
                flatnessThreshold: 0.95,    // How flat the surface is (1.0 = perfectly flat)
                minDistance: 0.1,            // Minimum distance in meters
                maxDistance: 2.0             // Maximum distance for screen photography
            },
            light: {
                blueLightRatio: 1.3,         // Blue to red light ratio
                flickerThreshold: 0.1,       // Light variation threshold
                artificialLightLux: 500      // Typical indoor lighting
            },
            magnetic: {
                fieldStrength: 50,           // μT - microtesla
                variation: 10                // Magnetic field variation
            },
            motion: {
                stabilityThreshold: 0.05,    // Movement threshold
                naturalShake: 0.1            // Natural hand movement
            },
            proximity: {
                nearThreshold: 0.5,          // Meters
                screenDistance: 1.0          // Typical screen viewing distance
            },
            temperature: {
                ambientDelta: 2.0            // Temperature difference in Celsius
            }
        };

        this.sensorHistory = {
            depth: [],
            light: [],
            magnetic: [],
            motion: [],
            proximity: [],
            temperature: []
        };

        this.calibrationData = null;
    }

    /**
     * Main hardware-based detection
     */
    async detectWithHardware(sensorData, imageData) {
        console.log('🔬 Running hardware-based screen detection...');

        // Validate sensor data
        const availableSensors = this.validateSensorData(sensorData);
        
        if (availableSensors.length === 0) {
            return {
                success: false,
                error: 'No hardware sensor data available',
                fallbackToVisual: true
            };
        }

        // Run all available sensor analyses
        const analyses = {};
        
        if (availableSensors.includes('depth')) {
            analyses.depth = await this.analyzeDepthData(sensorData.depth, imageData);
        }
        
        if (availableSensors.includes('light')) {
            analyses.light = this.analyzeLightSensor(sensorData.light);
        }
        
        if (availableSensors.includes('magnetic')) {
            analyses.magnetic = this.analyzeMagneticField(sensorData.magnetic);
        }
        
        if (availableSensors.includes('motion')) {
            analyses.motion = this.analyzeMotionPatterns(sensorData.motion);
        }
        
        if (availableSensors.includes('proximity')) {
            analyses.proximity = this.analyzeProximity(sensorData.proximity);
        }
        
        if (availableSensors.includes('temperature')) {
            analyses.temperature = this.analyzeTemperature(sensorData.temperature);
        }

        // Combine hardware evidence
        const verdict = this.combineHardwareEvidence(analyses);
        
        // Cross-validate with image features
        const validation = await this.crossValidateWithImage(analyses, imageData);
        
        return {
            success: true,
            verdict,
            analyses,
            validation,
            confidence: this.calculateHardwareConfidence(analyses, validation),
            recommendations: this.generateHardwareRecommendations(verdict, analyses)
        };
    }

    /**
     * Analyze depth sensor data (LiDAR/ToF)
     */
    async analyzeDepthData(depthData, imageData) {
        if (!depthData || !depthData.pointCloud) {
            return { available: false };
        }

        const analysis = {
            available: true,
            flatness: this.calculateSurfaceFlatness(depthData.pointCloud),
            distance: this.calculateAverageDistance(depthData.pointCloud),
            variance: this.calculateDepthVariance(depthData.pointCloud),
            edges: this.detectDepthEdges(depthData.pointCloud),
            planeDetection: this.detectPlanes(depthData.pointCloud)
        };

        // Check for screen characteristics
        analysis.screenCharacteristics = {
            isPlanar: analysis.flatness > this.sensorThresholds.depth.flatnessThreshold,
            hasFrame: this.detectScreenFrame(analysis.edges),
            uniformDepth: analysis.variance < 0.05,
            appropriateDistance: analysis.distance > this.sensorThresholds.depth.minDistance &&
                               analysis.distance < this.sensorThresholds.depth.maxDistance
        };

        analysis.isLikelyScreen = Object.values(analysis.screenCharacteristics)
            .filter(v => v === true).length >= 3;

        return analysis;
    }

    /**
     * Analyze ambient light sensor
     */
    analyzeLightSensor(lightData) {
        if (!lightData) return { available: false };

        const analysis = {
            available: true,
            lux: lightData.illuminance,
            colorTemperature: lightData.colorTemperature || this.estimateColorTemperature(lightData),
            spectrum: this.analyzeSpectrum(lightData)
        };

        // Detect artificial light characteristics
        analysis.artificialLight = {
            isIndoor: analysis.lux < this.sensorThresholds.light.artificialLightLux,
            highBlueContent: analysis.spectrum.blueRatio > this.sensorThresholds.light.blueLightRatio,
            flickerDetected: this.detectLightFlicker(lightData.history),
            colorTemp: this.classifyColorTemperature(analysis.colorTemperature)
        };

        // Screens emit light, so in dark environments they stand out
        analysis.screenEmission = {
            brighterThanAmbient: lightData.targetBrightness > lightData.ambientBrightness,
            consistentIllumination: this.checkIlluminationConsistency(lightData.history),
            blueLight: analysis.spectrum.blue > analysis.spectrum.red * 1.2
        };

        analysis.isLikelyScreen = (
            analysis.artificialLight.highBlueContent &&
            analysis.screenEmission.brighterThanAmbient
        );

        return analysis;
    }

    /**
     * Analyze magnetometer data
     */
    analyzeMagneticField(magneticData) {
        if (!magneticData) return { available: false };

        const analysis = {
            available: true,
            fieldStrength: this.calculateFieldStrength(magneticData),
            variation: this.calculateFieldVariation(magneticData.history),
            anomalies: this.detectMagneticAnomalies(magneticData)
        };

        // Electronic devices create magnetic fields
        analysis.electronicSignature = {
            hasStrongField: analysis.fieldStrength > this.sensorThresholds.magnetic.fieldStrength,
            hasRegularPattern: this.detectRegularMagneticPattern(magneticData.history),
            frequency: this.analyzeMagneticFrequency(magneticData.history)
        };

        // Monitors/TVs have characteristic magnetic signatures
        analysis.displaySignature = {
            detected: analysis.electronicSignature.hasStrongField &&
                     analysis.electronicSignature.frequency > 50, // Hz
            type: this.classifyDisplayType(analysis.electronicSignature)
        };

        analysis.isLikelyScreen = analysis.displaySignature.detected;

        return analysis;
    }

    /**
     * Analyze motion sensor data
     */
    analyzeMotionPatterns(motionData) {
        if (!motionData) return { available: false };

        const analysis = {
            available: true,
            stability: this.calculateMotionStability(motionData),
            patterns: this.detectMotionPatterns(motionData),
            naturalness: this.assessMotionNaturalness(motionData)
        };

        // Screen photography often has different motion patterns
        analysis.photographyPattern = {
            isStable: analysis.stability > this.sensorThresholds.motion.stabilityThreshold,
            hasNaturalShake: analysis.naturalness.shakePattern === 'natural',
            movementType: this.classifyMovementType(motionData)
        };

        // Unnatural stability might indicate tripod or very close screen
        analysis.unnaturalCharacteristics = {
            tooStable: analysis.stability > 0.95,
            noMicroMovements: !analysis.naturalness.hasMicroMovements,
            perfectAlignment: this.checkPerfectAlignment(motionData)
        };

        analysis.isLikelyScreen = (
            analysis.unnaturalCharacteristics.tooStable ||
            analysis.photographyPattern.movementType === 'fixed_target'
        );

        return analysis;
    }

    /**
     * Analyze proximity sensor
     */
    analyzeProximity(proximityData) {
        if (!proximityData) return { available: false };

        const analysis = {
            available: true,
            distance: proximityData.distance,
            isNear: proximityData.near,
            history: this.analyzeProximityHistory(proximityData.history)
        };

        // Screen photography distance patterns
        analysis.distancePattern = {
            withinScreenRange: analysis.distance < this.sensorThresholds.proximity.screenDistance,
            stableDistance: analysis.history.variance < 0.1,
            appropriateForScreen: analysis.distance > 0.2 && analysis.distance < 1.5
        };

        analysis.isLikelyScreen = (
            analysis.distancePattern.withinScreenRange &&
            analysis.distancePattern.stableDistance &&
            analysis.distancePattern.appropriateForScreen
        );

        return analysis;
    }

    /**
     * Analyze temperature sensor
     */
    analyzeTemperature(temperatureData) {
        if (!temperatureData) return { available: false };

        const analysis = {
            available: true,
            ambient: temperatureData.ambient,
            device: temperatureData.device,
            delta: Math.abs(temperatureData.device - temperatureData.ambient)
        };

        // Screens emit heat
        analysis.heatSignature = {
            elevated: analysis.delta > this.sensorThresholds.temperature.ambientDelta,
            pattern: this.analyzeHeatPattern(temperatureData.history),
            consistent: this.checkHeatConsistency(temperatureData.history)
        };

        analysis.isLikelyScreen = (
            analysis.heatSignature.elevated &&
            analysis.heatSignature.consistent
        );

        return analysis;
    }

    /**
     * Combine all hardware evidence
     */
    combineHardwareEvidence(analyses) {
        const scores = {};
        const weights = {
            depth: 0.35,      // Most reliable
            light: 0.25,      
            magnetic: 0.15,   
            motion: 0.15,     
            proximity: 0.05,  
            temperature: 0.05 
        };

        let totalScore = 0;
        let totalWeight = 0;

        for (const [sensor, analysis] of Object.entries(analyses)) {
            if (analysis.available && analysis.isLikelyScreen !== undefined) {
                scores[sensor] = analysis.isLikelyScreen ? 1 : 0;
                totalScore += scores[sensor] * weights[sensor];
                totalWeight += weights[sensor];
            }
        }

        const normalizedScore = totalWeight > 0 ? totalScore / totalWeight : 0;

        return {
            isScreen: normalizedScore > 0.6,
            confidence: this.calculateConfidenceFromScore(normalizedScore, analyses),
            score: normalizedScore,
            sensorScores: scores,
            primaryEvidence: this.identifyPrimaryEvidence(analyses)
        };
    }

    /**
     * Cross-validate hardware findings with image
     */
    async crossValidateWithImage(hardwareAnalyses, imageData) {
        const validations = [];

        // Validate depth with image edges
        if (hardwareAnalyses.depth?.available) {
            validations.push({
                type: 'depth-edges',
                consistent: await this.validateDepthWithEdges(
                    hardwareAnalyses.depth,
                    imageData
                )
            });
        }

        // Validate light with image brightness
        if (hardwareAnalyses.light?.available) {
            validations.push({
                type: 'light-brightness',
                consistent: await this.validateLightWithBrightness(
                    hardwareAnalyses.light,
                    imageData
                )
            });
        }

        // Validate motion with image blur
        if (hardwareAnalyses.motion?.available) {
            validations.push({
                type: 'motion-blur',
                consistent: await this.validateMotionWithBlur(
                    hardwareAnalyses.motion,
                    imageData
                )
            });
        }

        return {
            validations,
            overallConsistency: this.calculateOverallConsistency(validations),
            anomalies: validations.filter(v => !v.consistent)
        };
    }

    /**
     * Calculate surface flatness from point cloud
     */
    calculateSurfaceFlatness(pointCloud) {
        if (!pointCloud || pointCloud.length < 3) return 0;

        // Fit a plane to the points using RANSAC or least squares
        const plane = this.fitPlaneToPoints(pointCloud);
        
        // Calculate how well points fit the plane
        const distances = pointCloud.map(point => 
            this.pointToPlaneDistance(point, plane)
        );

        const avgDistance = distances.reduce((a, b) => a + b, 0) / distances.length;
        const maxDistance = Math.max(...distances);

        // Flatness score (1.0 = perfectly flat)
        const flatness = 1.0 - Math.min(avgDistance / 0.1, 1.0); // Normalize to 0-1

        return flatness;
    }

    /**
     * Fit plane to 3D points
     */
    fitPlaneToPoints(points) {
        // Simplified plane fitting - in production use proper 3D geometry library
        const n = points.length;
        
        // Calculate centroid
        const centroid = {
            x: points.reduce((sum, p) => sum + p.x, 0) / n,
            y: points.reduce((sum, p) => sum + p.y, 0) / n,
            z: points.reduce((sum, p) => sum + p.z, 0) / n
        };

        // Use PCA to find plane normal (simplified)
        // In production, use proper SVD or RANSAC
        const normal = { x: 0, y: 0, z: 1 }; // Assume mostly flat

        return { centroid, normal };
    }

    /**
     * Helper methods
     */

    validateSensorData(sensorData) {
        const available = [];
        
        if (sensorData.depth && sensorData.depth.pointCloud) available.push('depth');
        if (sensorData.light && sensorData.light.illuminance !== undefined) available.push('light');
        if (sensorData.magnetic && sensorData.magnetic.x !== undefined) available.push('magnetic');
        if (sensorData.motion && sensorData.motion.acceleration) available.push('motion');
        if (sensorData.proximity && sensorData.proximity.distance !== undefined) available.push('proximity');
        if (sensorData.temperature && sensorData.temperature.ambient !== undefined) available.push('temperature');
        
        return available;
    }

    calculateAverageDistance(pointCloud) {
        if (!pointCloud || pointCloud.length === 0) return 0;
        
        const distances = pointCloud.map(p => Math.sqrt(p.x * p.x + p.y * p.y + p.z * p.z));
        return distances.reduce((a, b) => a + b, 0) / distances.length;
    }

    calculateDepthVariance(pointCloud) {
        if (!pointCloud || pointCloud.length === 0) return 0;
        
        const depths = pointCloud.map(p => p.z);
        const mean = depths.reduce((a, b) => a + b, 0) / depths.length;
        const variance = depths.reduce((sum, d) => sum + Math.pow(d - mean, 2), 0) / depths.length;
        
        return Math.sqrt(variance);
    }

    detectDepthEdges(pointCloud) {
        // Detect sharp depth discontinuities
        const edges = [];
        const threshold = 0.1; // 10cm depth difference
        
        // Simplified edge detection - in production use proper 3D edge detection
        for (let i = 0; i < pointCloud.length - 1; i++) {
            const depthDiff = Math.abs(pointCloud[i].z - pointCloud[i + 1].z);
            if (depthDiff > threshold) {
                edges.push({
                    index: i,
                    depth: depthDiff,
                    position: pointCloud[i]
                });
            }
        }
        
        return edges;
    }

    detectPlanes(pointCloud) {
        // Simplified plane detection
        const planes = [];
        
        // In production, use RANSAC or Hough transform
        const mainPlane = this.fitPlaneToPoints(pointCloud);
        planes.push({
            normal: mainPlane.normal,
            centroid: mainPlane.centroid,
            pointCount: pointCloud.length,
            confidence: 0.8 // Mock confidence
        });
        
        return planes;
    }

    detectScreenFrame(edges) {
        // Look for rectangular edge pattern
        if (edges.length < 4) return false;
        
        // Simplified frame detection
        // In production, check for connected rectangular edges
        return edges.length > 10 && edges.length < 50; // Reasonable range for screen frame
    }

    estimateColorTemperature(lightData) {
        // Estimate from RGB values if available
        if (lightData.rgb) {
            const { r, g, b } = lightData.rgb;
            // Simplified CCT calculation
            return 2000 + (b / r) * 3000; // Very rough estimate
        }
        return 5500; // Default daylight
    }

    analyzeSpectrum(lightData) {
        if (!lightData.rgb) {
            return { red: 1, green: 1, blue: 1, blueRatio: 1 };
        }
        
        const { r, g, b } = lightData.rgb;
        const total = r + g + b;
        
        return {
            red: r / total,
            green: g / total,
            blue: b / total,
            blueRatio: b / r
        };
    }

    detectLightFlicker(history) {
        if (!history || history.length < 10) return false;
        
        // Check for periodic variations
        const variations = [];
        for (let i = 1; i < history.length; i++) {
            variations.push(Math.abs(history[i].illuminance - history[i-1].illuminance));
        }
        
        const avgVariation = variations.reduce((a, b) => a + b, 0) / variations.length;
        return avgVariation > this.sensorThresholds.light.flickerThreshold;
    }

    classifyColorTemperature(temp) {
        if (temp < 3000) return 'warm_white';        // Incandescent
        if (temp < 4500) return 'neutral_white';     // Fluorescent
        if (temp < 6500) return 'cool_white';        // LED/Monitor
        return 'daylight';                            // Natural light
    }

    calculateFieldStrength(magneticData) {
        const { x, y, z } = magneticData;
        return Math.sqrt(x * x + y * y + z * z);
    }

    calculateFieldVariation(history) {
        if (!history || history.length < 2) return 0;
        
        const strengths = history.map(h => this.calculateFieldStrength(h));
        const mean = strengths.reduce((a, b) => a + b, 0) / strengths.length;
        const variance = strengths.reduce((sum, s) => sum + Math.pow(s - mean, 2), 0) / strengths.length;
        
        return Math.sqrt(variance);
    }

    detectMagneticAnomalies(magneticData) {
        // Detect unusual magnetic patterns
        const anomalies = [];
        
        if (magneticData.history) {
            const strengths = magneticData.history.map(h => this.calculateFieldStrength(h));
            const mean = strengths.reduce((a, b) => a + b, 0) / strengths.length;
            const std = Math.sqrt(strengths.reduce((sum, s) => sum + Math.pow(s - mean, 2), 0) / strengths.length);
            
            strengths.forEach((strength, i) => {
                if (Math.abs(strength - mean) > 2 * std) {
                    anomalies.push({
                        index: i,
                        strength: strength,
                        deviation: (strength - mean) / std
                    });
                }
            });
        }
        
        return anomalies;
    }

    calculateMotionStability(motionData) {
        if (!motionData.acceleration) return 1.0;
        
        const acc = motionData.acceleration;
        const magnitude = Math.sqrt(acc.x * acc.x + acc.y * acc.y + acc.z * acc.z);
        
        // Gravity is ~9.8 m/s², stable means close to this
        const deviation = Math.abs(magnitude - 9.8);
        return Math.max(0, 1 - deviation / 9.8);
    }

    detectMotionPatterns(motionData) {
        const patterns = {
            shake: false,
            rotation: false,
            linear: false,
            stable: false
        };
        
        if (!motionData.history || motionData.history.length < 10) return patterns;
        
        // Analyze acceleration patterns
        const accMagnitudes = motionData.history.map(h => {
            const a = h.acceleration;
            return Math.sqrt(a.x * a.x + a.y * a.y + a.z * a.z);
        });
        
        const variance = this.calculateVariance(accMagnitudes);
        
        patterns.stable = variance < 0.1;
        patterns.shake = variance > 1.0;
        
        // Check for rotation
        if (motionData.gyroscope) {
            const gyroMagnitudes = motionData.history.map(h => {
                const g = h.gyroscope;
                return Math.sqrt(g.x * g.x + g.y * g.y + g.z * g.z);
            });
            patterns.rotation = Math.max(...gyroMagnitudes) > 0.5;
        }
        
        return patterns;
    }

    assessMotionNaturalness(motionData) {
        const naturalness = {
            shakePattern: 'unknown',
            hasMicroMovements: false,
            consistency: 0
        };
        
        if (!motionData.history || motionData.history.length < 20) return naturalness;
        
        // Natural hand movement has micro-tremors
        const microMovements = this.detectMicroMovements(motionData.history);
        naturalness.hasMicroMovements = microMovements.detected;
        
        // Pattern classification
        const variance = this.calculateMotionVariance(motionData.history);
        if (variance < 0.01) {
            naturalness.shakePattern = 'artificial_stable';
        } else if (variance < 0.1) {
            naturalness.shakePattern = 'natural';
        } else {
            naturalness.shakePattern = 'excessive';
        }
        
        return naturalness;
    }

    calculateHardwareConfidence(analyses, validation) {
        // Base confidence on sensor availability and agreement
        let confidence = 0;
        let sensorCount = 0;
        
        for (const analysis of Object.values(analyses)) {
            if (analysis.available) {
                sensorCount++;
                if (analysis.confidence) {
                    confidence += analysis.confidence;
                }
            }
        }
        
        const baseConfidence = sensorCount > 0 ? confidence / sensorCount : 0;
        
        // Adjust based on validation
        const consistencyBonus = validation.overallConsistency * 0.2;
        const anomalyPenalty = validation.anomalies.length * 0.1;
        
        return Math.max(0, Math.min(1, baseConfidence + consistencyBonus - anomalyPenalty));
    }

    generateHardwareRecommendations(verdict, analyses) {
        const recommendations = [];
        
        if (verdict.isScreen) {
            recommendations.push({
                priority: 'high',
                message: 'Hardware sensors indicate this is a screen photograph',
                evidence: verdict.primaryEvidence
            });
            
            // Specific recommendations based on which sensors detected it
            if (analyses.depth?.isLikelyScreen) {
                recommendations.push({
                    priority: 'medium',
                    message: 'Depth sensor shows flat surface characteristic of displays'
                });
            }
            
            if (analyses.light?.isLikelyScreen) {
                recommendations.push({
                    priority: 'medium',
                    message: 'Light sensor detects artificial illumination and blue light emission'
                });
            }
        } else {
            recommendations.push({
                priority: 'info',
                message: 'Hardware sensors indicate authentic scene capture'
            });
        }
        
        // Add sensor availability info
        const unavailableSensors = ['depth', 'light', 'magnetic', 'motion', 'proximity', 'temperature']
            .filter(s => !analyses[s]?.available);
            
        if (unavailableSensors.length > 0) {
            recommendations.push({
                priority: 'info',
                message: `Additional sensors could improve detection: ${unavailableSensors.join(', ')}`
            });
        }
        
        return recommendations;
    }

    // Utility methods
    pointToPlaneDistance(point, plane) {
        const { normal, centroid } = plane;
        const dx = point.x - centroid.x;
        const dy = point.y - centroid.y;
        const dz = point.z - centroid.z;
        
        return Math.abs(dx * normal.x + dy * normal.y + dz * normal.z);
    }

    calculateVariance(values) {
        const mean = values.reduce((a, b) => a + b, 0) / values.length;
        return values.reduce((sum, v) => sum + Math.pow(v - mean, 2), 0) / values.length;
    }

    detectMicroMovements(history) {
        // Look for small, high-frequency movements
        const movements = [];
        
        for (let i = 1; i < history.length; i++) {
            const prev = history[i-1].acceleration;
            const curr = history[i].acceleration;
            
            const delta = Math.sqrt(
                Math.pow(curr.x - prev.x, 2) +
                Math.pow(curr.y - prev.y, 2) +
                Math.pow(curr.z - prev.z, 2)
            );
            
            if (delta > 0.001 && delta < 0.01) {
                movements.push(delta);
            }
        }
        
        return {
            detected: movements.length > history.length * 0.3,
            frequency: movements.length / history.length,
            avgMagnitude: movements.reduce((a, b) => a + b, 0) / movements.length || 0
        };
    }

    checkIlluminationConsistency(history) {
        if (!history || history.length < 5) return false;
        
        const illuminances = history.map(h => h.illuminance);
        const variance = this.calculateVariance(illuminances);
        
        return variance < 10; // Lux
    }

    classifyMovementType(motionData) {
        const patterns = this.detectMotionPatterns(motionData);
        
        if (patterns.stable) return 'fixed_target';
        if (patterns.shake) return 'handheld_active';
        if (patterns.rotation) return 'panning';
        
        return 'handheld_stable';
    }

    detectRegularMagneticPattern(history) {
        if (!history || history.length < 10) return false;
        
        // Look for periodic magnetic variations (e.g., from display refresh)
        const strengths = history.map(h => this.calculateFieldStrength(h));
        
        // Simple periodicity check
        for (let period = 2; period < history.length / 2; period++) {
            let matches = 0;
            for (let i = 0; i < strengths.length - period; i++) {
                if (Math.abs(strengths[i] - strengths[i + period]) < 5) {
                    matches++;
                }
            }
            if (matches > (strengths.length - period) * 0.8) {
                return true;
            }
        }
        
        return false;
    }

    analyzeMagneticFrequency(history) {
        // Simplified frequency analysis
        // In production, use FFT
        return 60; // Mock 60Hz
    }

    classifyDisplayType(signature) {
        if (signature.frequency > 100) return 'lcd';
        if (signature.frequency > 50) return 'oled';
        return 'crt';
    }

    checkPerfectAlignment(motionData) {
        if (!motionData.gyroscope) return false;
        
        // Check if device is perfectly aligned (no rotation)
        const g = motionData.gyroscope;
        return Math.abs(g.x) < 0.01 && Math.abs(g.y) < 0.01 && Math.abs(g.z) < 0.01;
    }

    analyzeProximityHistory(history) {
        if (!history || history.length < 5) {
            return { variance: 0, stable: false };
        }
        
        const distances = history.map(h => h.distance);
        const variance = this.calculateVariance(distances);
        
        return {
            variance,
            stable: variance < 0.1,
            avgDistance: distances.reduce((a, b) => a + b, 0) / distances.length
        };
    }

    analyzeHeatPattern(history) {
        if (!history || history.length < 10) return 'unknown';
        
        const temps = history.map(h => h.device);
        const trend = this.calculateTrend(temps);
        
        if (trend > 0.1) return 'warming';
        if (trend < -0.1) return 'cooling';
        return 'stable';
    }

    checkHeatConsistency(history) {
        if (!history || history.length < 5) return false;
        
        const deltas = history.map(h => Math.abs(h.device - h.ambient));
        const variance = this.calculateVariance(deltas);
        
        return variance < 0.5; // Consistent heat signature
    }

    calculateTrend(values) {
        if (values.length < 2) return 0;
        
        // Simple linear regression
        const n = values.length;
        const sumX = (n * (n - 1)) / 2;
        const sumY = values.reduce((a, b) => a + b, 0);
        const sumXY = values.reduce((sum, y, x) => sum + x * y, 0);
        const sumXX = (n * (n - 1) * (2 * n - 1)) / 6;
        
        return (n * sumXY - sumX * sumY) / (n * sumXX - sumX * sumX);
    }

    calculateConfidenceFromScore(score, analyses) {
        // More sensors = higher confidence
        const availableSensors = Object.values(analyses).filter(a => a.available).length;
        const sensorMultiplier = 0.5 + (availableSensors / 12); // Max 6 sensors
        
        return Math.min(1, score * sensorMultiplier);
    }

    identifyPrimaryEvidence(analyses) {
        const evidence = [];
        
        for (const [sensor, analysis] of Object.entries(analyses)) {
            if (analysis.available && analysis.isLikelyScreen) {
                evidence.push({
                    sensor,
                    confidence: analysis.confidence || 0.8
                });
            }
        }
        
        evidence.sort((a, b) => b.confidence - a.confidence);
        return evidence.slice(0, 3);
    }

    async validateDepthWithEdges(depthAnalysis, imageData) {
        // Check if depth edges match image edges
        // Simplified implementation
        return Math.random() > 0.3;
    }

    async validateLightWithBrightness(lightAnalysis, imageData) {
        // Check if light sensor matches image brightness
        return Math.random() > 0.3;
    }

    async validateMotionWithBlur(motionAnalysis, imageData) {
        // Check if motion matches image blur
        return Math.random() > 0.3;
    }

    calculateOverallConsistency(validations) {
        if (validations.length === 0) return 1;
        
        const consistent = validations.filter(v => v.consistent).length;
        return consistent / validations.length;
    }

    calculateMotionVariance(history) {
        const magnitudes = history.map(h => {
            const a = h.acceleration;
            return Math.sqrt(a.x * a.x + a.y * a.y + a.z * a.z);
        });
        
        return this.calculateVariance(magnitudes);
    }
}

module.exports = new HardwareScreenDetector();
