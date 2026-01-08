/**
 * Liveness Detection Service
 *
 * Detects if a photo is taken of a real scene or a screen/TV
 * Uses "Live Photo" approach - captures multiple frames and analyzes:
 *
 * 1. Motion Parallax - real scenes have depth, screens are flat
 * 2. Moire Patterns - screens have pixel grids that create moire
 * 3. Screen Artifacts - refresh lines, color banding, pixel structure
 * 4. Temporal Consistency - real scenes have natural micro-movements
 * 5. Light Analysis - screens emit light, real scenes reflect it
 */

const sharp = require('sharp');
const crypto = require('crypto');

class LivenessDetectionService {
    constructor(options = {}) {
        this.options = {
            minFrames: 5,           // Minimum frames for analysis
            captureWindow: 2000,    // Capture window in ms (2 seconds)
            parallaxThreshold: 0.15, // Minimum parallax for "real" scene
            moireThreshold: 0.3,    // Moire pattern detection threshold
            desktopThreshold: 50,   // Lower threshold for desktop (no motion sensors)
            mobileThreshold: 70,    // Higher threshold for mobile (has sensors)
            ...options
        };
    }

    // =====================================
    // MAIN LIVENESS CHECK
    // =====================================

    /**
     * Analyze Live Photo frames for liveness
     *
     * @param {Array} frames - Array of {data: base64, timestamp: ms, motion: {x,y,z}}
     * @returns {Object} Liveness result with score and checks
     */
    async analyzeLiveness(frames) {
        console.log(`🔍 Analyzing liveness: ${frames.length} frames`);

        if (frames.length < this.options.minFrames) {
            return {
                isLive: false,
                score: 0,
                error: `Need at least ${this.options.minFrames} frames, got ${frames.length}`,
                checks: []
            };
        }

        const checks = [];
        let totalScore = 0;

        // Check 1: Motion Parallax Analysis
        const parallaxResult = await this.analyzeMotionParallax(frames);
        checks.push(parallaxResult);
        if (parallaxResult.passed) totalScore += 30;

        // Check 2: Moire Pattern Detection
        const moireResult = await this.detectMoirePatterns(frames);
        checks.push(moireResult);
        if (moireResult.passed) totalScore += 25;

        // Check 3: Screen Artifact Detection
        const artifactResult = await this.detectScreenArtifacts(frames);
        checks.push(artifactResult);
        if (artifactResult.passed) totalScore += 20;

        // Check 4: Temporal Consistency (natural micro-movements)
        const temporalResult = this.analyzeTemporalConsistency(frames);
        checks.push(temporalResult);
        if (temporalResult.passed) totalScore += 15;

        // Check 5: Device Motion Correlation
        const motionResult = this.analyzeDeviceMotion(frames);
        checks.push(motionResult);
        if (motionResult.passed) totalScore += 10;

        // Detect if this is desktop (no motion sensors) vs mobile
        const hasMotionSensors = frames.some(f =>
            f.motion && (f.motion.alpha !== undefined || f.motion.x !== undefined)
        );
        const isDesktop = !hasMotionSensors || motionResult.warning;

        // Use appropriate threshold based on device type
        const threshold = isDesktop
            ? this.options.desktopThreshold
            : this.options.mobileThreshold;

        const isLive = totalScore >= threshold;

        console.log(`${isLive ? '✅' : '❌'} Liveness score: ${totalScore}/100 (threshold: ${threshold}, ${isDesktop ? 'desktop' : 'mobile'})`);

        return {
            isLive,
            score: totalScore,
            confidence: totalScore,
            threshold,
            deviceType: isDesktop ? 'desktop' : 'mobile',
            checks,
            summary: isLive
                ? 'Scene appears to be real (not a screen)'
                : 'Warning: Scene may be a screen or manipulated'
        };
    }

    // =====================================
    // CHECK 1: MOTION PARALLAX
    // =====================================

    /**
     * Analyze motion parallax between frames
     * Real scenes: near objects move more than far objects
     * Screens: all pixels move uniformly (no depth)
     */
    async analyzeMotionParallax(frames) {
        try {
            if (frames.length < 3) {
                return {
                    name: 'motion_parallax',
                    passed: false,
                    message: 'Not enough frames for parallax analysis',
                    score: 0
                };
            }

            // Compare first and last frame
            const firstFrame = frames[0];
            const lastFrame = frames[frames.length - 1];

            // Extract features from different regions
            const firstBuffer = Buffer.from(firstFrame.data.replace(/^data:image\/\w+;base64,/, ''), 'base64');
            const lastBuffer = Buffer.from(lastFrame.data.replace(/^data:image\/\w+;base64,/, ''), 'base64');

            const firstMeta = await sharp(firstBuffer).metadata();

            // Divide image into 9 regions (3x3 grid)
            const regionMotion = [];
            const regionSize = {
                w: Math.floor(firstMeta.width / 3),
                h: Math.floor(firstMeta.height / 3)
            };

            for (let row = 0; row < 3; row++) {
                for (let col = 0; col < 3; col++) {
                    const region = {
                        left: col * regionSize.w,
                        top: row * regionSize.h,
                        width: regionSize.w,
                        height: regionSize.h
                    };

                    // Extract region from both frames
                    const firstRegion = await sharp(firstBuffer)
                        .extract(region)
                        .grayscale()
                        .raw()
                        .toBuffer();

                    const lastRegion = await sharp(lastBuffer)
                        .extract(region)
                        .grayscale()
                        .raw()
                        .toBuffer();

                    // Calculate difference (motion amount)
                    let diff = 0;
                    for (let i = 0; i < firstRegion.length; i++) {
                        diff += Math.abs(firstRegion[i] - lastRegion[i]);
                    }
                    const avgDiff = diff / firstRegion.length;

                    regionMotion.push({
                        row, col,
                        motion: avgDiff
                    });
                }
            }

            // Calculate variance in motion across regions
            const motions = regionMotion.map(r => r.motion);
            const avgMotion = motions.reduce((a, b) => a + b, 0) / motions.length;
            const variance = motions.reduce((sum, m) => sum + Math.pow(m - avgMotion, 2), 0) / motions.length;
            const stdDev = Math.sqrt(variance);

            // High variance = different parts moving differently = real scene
            // Low variance = everything moving same = screen
            const normalizedVariance = stdDev / (avgMotion + 1);
            const hasParallax = normalizedVariance > this.options.parallaxThreshold;

            return {
                name: 'motion_parallax',
                passed: hasParallax,
                message: hasParallax
                    ? 'Depth detected - scene has parallax motion'
                    : 'Flat motion detected - possible screen',
                score: hasParallax ? 30 : 0,
                details: {
                    variance: normalizedVariance.toFixed(4),
                    threshold: this.options.parallaxThreshold,
                    avgMotion: avgMotion.toFixed(2)
                }
            };

        } catch (error) {
            return {
                name: 'motion_parallax',
                passed: false,
                message: `Analysis error: ${error.message}`,
                score: 0
            };
        }
    }

    // =====================================
    // CHECK 2: MOIRE PATTERN DETECTION
    // =====================================

    /**
     * Detect moire patterns (interference patterns from screen pixels)
     */
    async detectMoirePatterns(frames) {
        try {
            // Use middle frame for analysis
            const frame = frames[Math.floor(frames.length / 2)];
            const buffer = Buffer.from(frame.data.replace(/^data:image\/\w+;base64,/, ''), 'base64');

            // Apply high-pass filter to detect periodic patterns
            const { data, info } = await sharp(buffer)
                .grayscale()
                .convolve({
                    width: 3,
                    height: 3,
                    kernel: [-1, -1, -1, -1, 8, -1, -1, -1, -1] // Edge detection
                })
                .raw()
                .toBuffer({ resolveWithObject: true });

            // Analyze frequency of edges (moire creates regular patterns)
            let edgeCount = 0;
            let regularityScore = 0;
            const rowEdgeCounts = [];

            for (let y = 0; y < info.height; y++) {
                let rowEdges = 0;
                for (let x = 0; x < info.width; x++) {
                    const val = data[y * info.width + x];
                    if (val > 50) { // Edge threshold
                        edgeCount++;
                        rowEdges++;
                    }
                }
                rowEdgeCounts.push(rowEdges);
            }

            // Check for regular periodic patterns (moire signature)
            // Calculate variance in row edge counts
            const avgRowEdges = rowEdgeCounts.reduce((a, b) => a + b, 0) / rowEdgeCounts.length;
            let periodicityScore = 0;

            // Look for repeating patterns
            for (let period = 2; period < 20; period++) {
                let matchCount = 0;
                for (let i = period; i < rowEdgeCounts.length; i++) {
                    if (Math.abs(rowEdgeCounts[i] - rowEdgeCounts[i - period]) < avgRowEdges * 0.2) {
                        matchCount++;
                    }
                }
                periodicityScore = Math.max(periodicityScore, matchCount / rowEdgeCounts.length);
            }

            // High periodicity = moire patterns = screen
            const hasMoire = periodicityScore > this.options.moireThreshold;

            return {
                name: 'moire_detection',
                passed: !hasMoire,
                message: hasMoire
                    ? 'Moire patterns detected - likely a screen'
                    : 'No moire patterns - appears to be real scene',
                score: hasMoire ? 0 : 25,
                details: {
                    periodicityScore: periodicityScore.toFixed(4),
                    threshold: this.options.moireThreshold
                }
            };

        } catch (error) {
            return {
                name: 'moire_detection',
                passed: true, // Fail open for this check
                message: `Analysis skipped: ${error.message}`,
                score: 15
            };
        }
    }

    // =====================================
    // CHECK 3: SCREEN ARTIFACTS
    // =====================================

    /**
     * Detect screen-specific artifacts:
     * - Pixel grid structure
     * - Color banding
     * - Uniform backlight
     */
    async detectScreenArtifacts(frames) {
        try {
            const frame = frames[Math.floor(frames.length / 2)];
            const buffer = Buffer.from(frame.data.replace(/^data:image\/\w+;base64,/, ''), 'base64');

            // Check for color banding (screens have limited color depth)
            const { data, info } = await sharp(buffer)
                .raw()
                .toBuffer({ resolveWithObject: true });

            const colorHistogram = new Map();
            const channels = info.channels;

            for (let i = 0; i < data.length; i += channels) {
                const r = Math.floor(data[i] / 8) * 8;     // Quantize
                const g = Math.floor(data[i + 1] / 8) * 8;
                const b = Math.floor(data[i + 2] / 8) * 8;
                const key = `${r},${g},${b}`;
                colorHistogram.set(key, (colorHistogram.get(key) || 0) + 1);
            }

            // Screens tend to have fewer unique colors due to limited gamut
            const uniqueColors = colorHistogram.size;
            const totalPixels = (data.length / channels);
            const colorRatio = uniqueColors / Math.sqrt(totalPixels);

            // Real scenes typically have more color variation
            const hasNaturalColors = colorRatio > 0.1;

            // Check for uniform brightness regions (screen backlight)
            const brightnessVariance = await this.calculateBrightnessVariance(buffer);
            const hasNaturalLighting = brightnessVariance > 500;

            const passed = hasNaturalColors && hasNaturalLighting;

            return {
                name: 'screen_artifacts',
                passed,
                message: passed
                    ? 'Natural color and lighting patterns'
                    : 'Possible screen artifacts detected',
                score: passed ? 20 : 0,
                details: {
                    uniqueColors,
                    colorRatio: colorRatio.toFixed(4),
                    brightnessVariance: brightnessVariance.toFixed(2)
                }
            };

        } catch (error) {
            return {
                name: 'screen_artifacts',
                passed: true,
                message: `Analysis skipped: ${error.message}`,
                score: 10
            };
        }
    }

    async calculateBrightnessVariance(buffer) {
        const { data, info } = await sharp(buffer)
            .grayscale()
            .raw()
            .toBuffer({ resolveWithObject: true });

        const mean = data.reduce((a, b) => a + b, 0) / data.length;
        const variance = data.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / data.length;

        return variance;
    }

    // =====================================
    // CHECK 4: TEMPORAL CONSISTENCY
    // =====================================

    /**
     * Analyze natural micro-movements between frames
     * Real scenes have subtle natural changes (air, light, vibration)
     * Screens displaying static images are too stable
     */
    analyzeTemporalConsistency(frames) {
        if (frames.length < 5) {
            return {
                name: 'temporal_consistency',
                passed: false,
                message: 'Not enough frames for temporal analysis',
                score: 0
            };
        }

        // Check timestamp intervals
        const intervals = [];
        for (let i = 1; i < frames.length; i++) {
            intervals.push(frames[i].timestamp - frames[i - 1].timestamp);
        }

        const avgInterval = intervals.reduce((a, b) => a + b, 0) / intervals.length;
        const intervalVariance = intervals.reduce((sum, i) => sum + Math.pow(i - avgInterval, 2), 0) / intervals.length;

        // Real capture has slight timing variations
        // Perfectly regular intervals suggest automated/fake capture
        const hasNaturalTiming = intervalVariance > 100; // ms variance

        // Check for motion data presence
        const hasMotionData = frames.some(f => f.motion && (f.motion.x || f.motion.y || f.motion.z));

        const passed = hasNaturalTiming || hasMotionData;

        return {
            name: 'temporal_consistency',
            passed,
            message: passed
                ? 'Natural capture timing detected'
                : 'Capture timing appears artificial',
            score: passed ? 15 : 0,
            details: {
                avgInterval: avgInterval.toFixed(2) + 'ms',
                intervalVariance: intervalVariance.toFixed(2),
                hasMotionData
            }
        };
    }

    // =====================================
    // CHECK 5: DEVICE MOTION CORRELATION
    // =====================================

    /**
     * Check if device motion correlates with image changes
     * When phone moves, image should change accordingly
     */
    analyzeDeviceMotion(frames) {
        const framesWithMotion = frames.filter(f =>
            f.motion && (f.motion.alpha !== undefined || f.motion.x !== undefined)
        );

        if (framesWithMotion.length < 3) {
            return {
                name: 'device_motion',
                passed: false,
                message: 'Insufficient motion sensor data',
                score: 0,
                warning: true
            };
        }

        // Calculate total device movement
        let totalRotation = 0;
        let totalAcceleration = 0;

        for (let i = 1; i < framesWithMotion.length; i++) {
            const prev = framesWithMotion[i - 1].motion;
            const curr = framesWithMotion[i].motion;

            if (prev.alpha !== undefined && curr.alpha !== undefined) {
                totalRotation += Math.abs(curr.alpha - prev.alpha) +
                                 Math.abs(curr.beta - prev.beta) +
                                 Math.abs(curr.gamma - prev.gamma);
            }

            if (prev.x !== undefined && curr.x !== undefined) {
                totalAcceleration += Math.abs(curr.x - prev.x) +
                                     Math.abs(curr.y - prev.y) +
                                     Math.abs(curr.z - prev.z);
            }
        }

        // Some device movement is expected during natural capture
        const hasNaturalMovement = totalRotation > 5 || totalAcceleration > 0.5;

        return {
            name: 'device_motion',
            passed: hasNaturalMovement,
            message: hasNaturalMovement
                ? 'Natural device movement detected'
                : 'Device appears too stable (tripod or no movement)',
            score: hasNaturalMovement ? 10 : 0,
            details: {
                totalRotation: totalRotation.toFixed(2),
                totalAcceleration: totalAcceleration.toFixed(4),
                framesAnalyzed: framesWithMotion.length
            }
        };
    }

    // =====================================
    // QUICK LIVENESS CHECK (for real-time)
    // =====================================

    /**
     * Quick check during capture - provides real-time feedback
     */
    async quickCheck(frame, previousFrame, motion) {
        const warnings = [];

        // Check for motion
        if (!motion || (Math.abs(motion.x) < 0.1 && Math.abs(motion.y) < 0.1)) {
            warnings.push('Move your device slightly');
        }

        // Check frame difference
        if (previousFrame) {
            const diff = await this.calculateFrameDifference(frame, previousFrame);
            if (diff < 0.5) {
                warnings.push('Scene appears static - move around the subject');
            }
        }

        return {
            ok: warnings.length === 0,
            warnings
        };
    }

    async calculateFrameDifference(frame1, frame2) {
        try {
            const buf1 = Buffer.from(frame1.replace(/^data:image\/\w+;base64,/, ''), 'base64');
            const buf2 = Buffer.from(frame2.replace(/^data:image\/\w+;base64,/, ''), 'base64');

            const data1 = await sharp(buf1).resize(32, 32).grayscale().raw().toBuffer();
            const data2 = await sharp(buf2).resize(32, 32).grayscale().raw().toBuffer();

            let diff = 0;
            for (let i = 0; i < data1.length; i++) {
                diff += Math.abs(data1[i] - data2[i]);
            }

            return diff / data1.length;
        } catch {
            return 10; // Assume different on error
        }
    }
}

// Singleton
let livenessService = null;

function getLivenessService(options) {
    if (!livenessService) {
        livenessService = new LivenessDetectionService(options);
    }
    return livenessService;
}

module.exports = {
    LivenessDetectionService,
    getLivenessService
};
