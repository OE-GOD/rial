#!/usr/bin/env node

/**
 * Interactive Demo: AI Screen Detection System
 * 
 * Demonstrates detection of various screen types:
 * - LCD monitors
 * - OLED TVs
 * - Phone screens
 * - Tablets
 * - E-ink displays
 * - Projections
 * - High-quality prints (edge case)
 */

const unifiedDetector = require('./unified-screen-detector');
const sharp = require('sharp');
const fs = require('fs').promises;
const path = require('path');
const chalk = require('chalk');
const ora = require('ora');
const Table = require('cli-table3');

// Simulated screen characteristics for demo
const SCREEN_TYPES = {
    'LCD_MONITOR': {
        name: '27" LCD Monitor',
        characteristics: {
            moirePattern: 0.85,
            pixelGrid: 0.9,
            refreshRate: 60,
            blueLight: 1.5,
            flatness: 0.98,
            distance: 0.6
        }
    },
    'OLED_TV': {
        name: '65" OLED TV',
        characteristics: {
            moirePattern: 0.7,
            pixelGrid: 0.8,
            refreshRate: 120,
            blueLight: 1.3,
            flatness: 0.99,
            distance: 2.0
        }
    },
    'PHONE_SCREEN': {
        name: 'iPhone 15 Pro',
        characteristics: {
            moirePattern: 0.9,
            pixelGrid: 0.95,
            refreshRate: 120,
            blueLight: 1.6,
            flatness: 0.97,
            distance: 0.3
        }
    },
    'TABLET': {
        name: 'iPad Pro 12.9"',
        characteristics: {
            moirePattern: 0.8,
            pixelGrid: 0.85,
            refreshRate: 120,
            blueLight: 1.4,
            flatness: 0.98,
            distance: 0.5
        }
    },
    'E_INK': {
        name: 'Kindle E-ink Display',
        characteristics: {
            moirePattern: 0.3,
            pixelGrid: 0.4,
            refreshRate: 1,
            blueLight: 1.0,
            flatness: 0.96,
            distance: 0.4
        }
    },
    'PROJECTOR': {
        name: '4K Projector on Wall',
        characteristics: {
            moirePattern: 0.5,
            pixelGrid: 0.2,
            refreshRate: 60,
            blueLight: 1.2,
            flatness: 0.95,
            distance: 3.0
        }
    },
    'PRINT': {
        name: 'High-Quality Photo Print',
        characteristics: {
            moirePattern: 0.1,
            pixelGrid: 0.0,
            refreshRate: 0,
            blueLight: 1.0,
            flatness: 0.94,
            distance: 0.5
        }
    },
    'REAL_SCENE': {
        name: 'Real Outdoor Scene',
        characteristics: {
            moirePattern: 0.0,
            pixelGrid: 0.0,
            refreshRate: 0,
            blueLight: 1.0,
            flatness: 0.2,
            distance: 10.0
        }
    }
};

class ScreenDetectionDemo {
    constructor() {
        this.results = [];
        this.testImages = {};
    }

    async initialize() {
        console.log(chalk.bold.cyan('\n🤖 Screen Detection AI Demo\n'));
        
        const spinner = ora('Initializing AI detection system...').start();
        
        try {
            await unifiedDetector.initialize();
            spinner.succeed('AI detection system initialized');
        } catch (error) {
            spinner.fail('Failed to initialize detection system');
            throw error;
        }

        // Generate test images
        await this.generateTestImages();
    }

    async generateTestImages() {
        const spinner = ora('Generating test images...').start();

        for (const [type, config] of Object.entries(SCREEN_TYPES)) {
            const image = await this.createTestImage(type, config);
            this.testImages[type] = image;
        }

        spinner.succeed('Test images generated');
    }

    async createTestImage(type, config) {
        const width = 800;
        const height = 600;
        
        // Base image
        let image = sharp({
            create: {
                width,
                height,
                channels: 3,
                background: { r: 20, g: 20, b: 25 }
            }
        });

        // Add patterns based on screen type
        const svgOverlay = this.generateSVGPattern(type, config, width, height);
        
        image = image.composite([{
            input: Buffer.from(svgOverlay),
            top: 0,
            left: 0
        }]);

        // Add screen-specific effects
        if (config.characteristics.moirePattern > 0.5) {
            // Add moiré pattern
            image = image.modulate({ brightness: 1 + Math.sin(Date.now() / 1000) * 0.05 });
        }

        if (config.characteristics.blueLight > 1.2) {
            // Add blue tint
            image = image.tint({ r: 240, g: 240, b: 255 });
        }

        const buffer = await image.jpeg({ quality: 90 }).toBuffer();
        
        // Save for inspection
        await fs.writeFile(
            path.join(__dirname, `test-${type.toLowerCase()}.jpg`), 
            buffer
        );

        return buffer;
    }

    generateSVGPattern(type, config, width, height) {
        const patterns = {
            'LCD_MONITOR': `
                <svg width="${width}" height="${height}">
                    <defs>
                        <pattern id="pixels" x="0" y="0" width="3" height="3" patternUnits="userSpaceOnUse">
                            <rect x="0" y="0" width="1" height="3" fill="#ff0000" opacity="0.1"/>
                            <rect x="1" y="0" width="1" height="3" fill="#00ff00" opacity="0.1"/>
                            <rect x="2" y="0" width="1" height="3" fill="#0000ff" opacity="0.1"/>
                        </pattern>
                        <pattern id="moire" x="0" y="0" width="4" height="4" patternUnits="userSpaceOnUse">
                            <line x1="0" y1="0" x2="4" y2="4" stroke="#333" stroke-width="0.5"/>
                        </pattern>
                    </defs>
                    <rect width="${width}" height="${height}" fill="url(#pixels)"/>
                    <rect width="${width}" height="${height}" fill="url(#moire)" opacity="0.3"/>
                    <rect x="50" y="50" width="${width-100}" height="${height-100}" 
                          fill="#1a1a1a" stroke="#444" stroke-width="2"/>
                    <text x="${width/2}" y="${height/2}" font-family="Arial" font-size="36" 
                          fill="white" text-anchor="middle">LCD MONITOR TEST</text>
                </svg>`,
            'OLED_TV': `
                <svg width="${width}" height="${height}">
                    <rect width="${width}" height="${height}" fill="#000000"/>
                    <rect x="20" y="20" width="${width-40}" height="${height-40}" 
                          fill="#0a0a0a" stroke="#222" stroke-width="1"/>
                    <circle cx="${width/2}" cy="${height/2}" r="100" fill="#ffffff" opacity="0.9"/>
                    <text x="${width/2}" y="${height/2}" font-family="Arial" font-size="24" 
                          fill="black" text-anchor="middle">OLED DISPLAY</text>
                </svg>`,
            'REAL_SCENE': `
                <svg width="${width}" height="${height}">
                    <rect width="${width}" height="${height}" fill="#87CEEB"/>
                    <circle cx="100" cy="100" r="50" fill="#FFD700"/>
                    <ellipse cx="200" cy="150" rx="80" ry="40" fill="white" opacity="0.8"/>
                    <polygon points="0,600 200,300 400,600" fill="#8B4513"/>
                    <polygon points="300,600 500,200 700,600" fill="#A0522D"/>
                    <circle cx="170" cy="480" r="60" fill="#228B22"/>
                    <text x="${width/2}" y="${height-50}" font-family="Arial" font-size="24" 
                          fill="black" text-anchor="middle">REAL OUTDOOR SCENE</text>
                </svg>`
        };

        return patterns[type] || patterns['LCD_MONITOR'];
    }

    async runDemo() {
        console.log(chalk.bold.yellow('\n📊 Testing Various Screen Types\n'));

        for (const [type, config] of Object.entries(SCREEN_TYPES)) {
            await this.testScreenType(type, config);
        }

        this.displayResults();
        await this.saveReport();
    }

    async testScreenType(type, config) {
        const spinner = ora(`Testing ${config.name}...`).start();

        try {
            // Prepare input with simulated sensor data
            const input = {
                image: this.testImages[type],
                metadata: {
                    deviceType: config.name,
                    captureTime: new Date().toISOString(),
                    testType: type
                },
                sensors: this.generateSensorData(config.characteristics),
                frames: type !== 'PRINT' && type !== 'REAL_SCENE' ? 
                    await this.generateVideoFrames(type) : undefined
            };

            // Run detection with different modes
            const results = {};

            // Fast mode
            unifiedDetector.updateConfig({ mode: 'fast' });
            const fastStart = Date.now();
            results.fast = await unifiedDetector.detect(input);
            results.fast.time = Date.now() - fastStart;

            // Standard mode
            unifiedDetector.updateConfig({ mode: 'standard' });
            const standardStart = Date.now();
            results.standard = await unifiedDetector.detect(input);
            results.standard.time = Date.now() - standardStart;

            // Comprehensive mode (only for interesting cases)
            if (type === 'E_INK' || type === 'PRINT') {
                unifiedDetector.updateConfig({ mode: 'comprehensive' });
                const comprehensiveStart = Date.now();
                results.comprehensive = await unifiedDetector.detect(input);
                results.comprehensive.time = Date.now() - comprehensiveStart;
            }

            this.results.push({
                type,
                config,
                results
            });

            // Display inline result
            const verdict = results.standard.verdict;
            const icon = verdict.isScreen ? '🖥️' : '✅';
            const color = verdict.isScreen ? 'red' : 'green';
            
            spinner.succeed(
                chalk[color](
                    `${icon} ${config.name}: ${verdict.isScreen ? 'SCREEN' : 'REAL'} ` +
                    `(${Math.round(verdict.confidence * 100)}% confidence)`
                )
            );

        } catch (error) {
            spinner.fail(`Failed to test ${config.name}: ${error.message}`);
        }
    }

    generateSensorData(characteristics) {
        // Simulate realistic sensor data based on screen characteristics
        return {
            depth: {
                pointCloud: this.generatePointCloud(characteristics.flatness),
                distance: characteristics.distance,
                flatness: characteristics.flatness
            },
            light: {
                illuminance: 400 * characteristics.blueLight,
                blueRatio: characteristics.blueLight,
                colorTemperature: characteristics.blueLight > 1.3 ? 6500 : 5000,
                rgb: {
                    r: 200,
                    g: 210,
                    b: 240 * characteristics.blueLight
                }
            },
            motion: {
                acceleration: { x: 0, y: 9.8, z: 0.1 },
                gyroscope: { x: 0, y: 0, z: 0 },
                stability: characteristics.flatness
            },
            magnetic: {
                x: 30 + (characteristics.refreshRate > 0 ? 20 : 0),
                y: 10,
                z: 40,
                history: this.generateMagneticHistory(characteristics.refreshRate)
            },
            proximity: {
                distance: characteristics.distance,
                near: characteristics.distance < 0.5
            },
            temperature: {
                ambient: 22,
                device: 22 + (characteristics.refreshRate > 60 ? 3 : 1)
            }
        };
    }

    generatePointCloud(flatness) {
        // Generate 3D points simulating depth sensor data
        const points = [];
        const variance = (1 - flatness) * 0.1;
        
        for (let i = 0; i < 100; i++) {
            points.push({
                x: Math.random() * 2 - 1,
                y: Math.random() * 2 - 1,
                z: 1 + (Math.random() - 0.5) * variance
            });
        }
        
        return points;
    }

    generateMagneticHistory(refreshRate) {
        const history = [];
        const baseField = 50;
        
        for (let i = 0; i < 20; i++) {
            const variation = refreshRate > 0 ? Math.sin(i * refreshRate / 60) * 10 : 0;
            history.push({
                x: baseField + variation,
                y: 10,
                z: 40,
                timestamp: Date.now() - (20 - i) * 100
            });
        }
        
        return history;
    }

    async generateVideoFrames(type) {
        // Generate 10 simulated frames with temporal variations
        const frames = [];
        
        for (let i = 0; i < 10; i++) {
            // Reuse the test image with slight variations
            const frame = await sharp(this.testImages[type])
                .modulate({ 
                    brightness: 1 + Math.sin(i / 2) * 0.02 // Simulate refresh flicker
                })
                .toBuffer();
            
            frames.push(frame);
        }
        
        return frames;
    }

    displayResults() {
        console.log(chalk.bold.cyan('\n📈 Detection Results Summary\n'));

        // Create results table
        const table = new Table({
            head: [
                chalk.bold('Screen Type'),
                chalk.bold('Expected'),
                chalk.bold('Fast Mode'),
                chalk.bold('Standard Mode'),
                chalk.bold('Comprehensive'),
                chalk.bold('Primary Evidence')
            ],
            style: {
                head: [],
                border: []
            }
        });

        for (const result of this.results) {
            const expected = result.type !== 'PRINT' && result.type !== 'REAL_SCENE';
            const fast = result.results.fast.verdict;
            const standard = result.results.standard.verdict;
            const comprehensive = result.results.comprehensive?.verdict;

            const row = [
                result.config.name,
                expected ? chalk.red('Screen') : chalk.green('Real'),
                this.formatVerdict(fast, expected),
                this.formatVerdict(standard, expected),
                comprehensive ? this.formatVerdict(comprehensive, expected) : 'N/A',
                this.getPrimaryEvidence(standard)
            ];

            table.push(row);
        }

        console.log(table.toString());

        // Performance comparison
        this.displayPerformanceStats();

        // Accuracy summary
        this.displayAccuracySummary();
    }

    formatVerdict(verdict, expected) {
        const correct = verdict.isScreen === expected;
        const confidence = Math.round(verdict.confidence * 100);
        const result = verdict.isScreen ? 'Screen' : 'Real';
        
        const text = `${result} (${confidence}%)`;
        
        if (correct) {
            return chalk.green('✓ ' + text);
        } else {
            return chalk.red('✗ ' + text);
        }
    }

    getPrimaryEvidence(verdict) {
        if (!verdict.evidence || !verdict.evidence.strong) return 'None';
        
        const evidence = verdict.evidence.strong[0] || 
                        verdict.evidence.moderate?.[0] || 
                        'Multiple indicators';
        
        return evidence.length > 40 ? evidence.substring(0, 37) + '...' : evidence;
    }

    displayPerformanceStats() {
        console.log(chalk.bold.yellow('\n⚡ Performance Statistics\n'));

        const perfTable = new Table({
            head: [
                chalk.bold('Mode'),
                chalk.bold('Avg Time (ms)'),
                chalk.bold('Min Time (ms)'),
                chalk.bold('Max Time (ms)')
            ]
        });

        ['fast', 'standard', 'comprehensive'].forEach(mode => {
            const times = this.results
                .map(r => r.results[mode]?.time)
                .filter(t => t !== undefined);
            
            if (times.length > 0) {
                perfTable.push([
                    mode.charAt(0).toUpperCase() + mode.slice(1),
                    Math.round(times.reduce((a, b) => a + b) / times.length),
                    Math.min(...times),
                    Math.max(...times)
                ]);
            }
        });

        console.log(perfTable.toString());
    }

    displayAccuracySummary() {
        console.log(chalk.bold.magenta('\n🎯 Accuracy Summary\n'));

        let correct = 0;
        let total = 0;

        for (const result of this.results) {
            const expected = result.type !== 'PRINT' && result.type !== 'REAL_SCENE';
            const detected = result.results.standard.verdict.isScreen;
            
            if (detected === expected) correct++;
            total++;
        }

        const accuracy = (correct / total * 100).toFixed(1);
        
        console.log(`Overall Accuracy: ${chalk.bold.green(accuracy + '%')}`);
        console.log(`Correct Detections: ${correct}/${total}`);

        // Edge case performance
        const edgeCases = this.results.filter(r => 
            r.type === 'E_INK' || r.type === 'PRINT' || r.type === 'PROJECTOR'
        );

        if (edgeCases.length > 0) {
            console.log(chalk.bold('\nEdge Case Performance:'));
            edgeCases.forEach(edge => {
                const verdict = edge.results.standard.verdict;
                const expected = edge.type !== 'PRINT';
                const correct = verdict.isScreen === expected;
                
                console.log(`  ${edge.config.name}: ${
                    correct ? chalk.green('✓ Correct') : chalk.red('✗ Incorrect')
                } (${Math.round(verdict.confidence * 100)}% confidence)`);
            });
        }
    }

    async saveReport() {
        const report = {
            timestamp: new Date().toISOString(),
            summary: {
                totalTests: this.results.length,
                accuracy: this.calculateAccuracy(),
                performanceStats: this.getPerformanceStats()
            },
            detailedResults: this.results.map(r => ({
                type: r.type,
                name: r.config.name,
                characteristics: r.config.characteristics,
                detection: {
                    fast: this.summarizeVerdict(r.results.fast),
                    standard: this.summarizeVerdict(r.results.standard),
                    comprehensive: r.results.comprehensive ? 
                        this.summarizeVerdict(r.results.comprehensive) : null
                }
            }))
        };

        const reportPath = path.join(__dirname, 'demo-report.json');
        await fs.writeFile(reportPath, JSON.stringify(report, null, 2));
        
        console.log(chalk.dim(`\n📄 Detailed report saved to: ${reportPath}`));
    }

    calculateAccuracy() {
        let correct = 0;
        let total = 0;

        for (const result of this.results) {
            const expected = result.type !== 'PRINT' && result.type !== 'REAL_SCENE';
            const detected = result.results.standard.verdict.isScreen;
            
            if (detected === expected) correct++;
            total++;
        }

        return (correct / total * 100).toFixed(1);
    }

    getPerformanceStats() {
        const stats = {};

        ['fast', 'standard', 'comprehensive'].forEach(mode => {
            const times = this.results
                .map(r => r.results[mode]?.time)
                .filter(t => t !== undefined);
            
            if (times.length > 0) {
                stats[mode] = {
                    avg: Math.round(times.reduce((a, b) => a + b) / times.length),
                    min: Math.min(...times),
                    max: Math.max(...times)
                };
            }
        });

        return stats;
    }

    summarizeVerdict(result) {
        return {
            isScreen: result.verdict.isScreen,
            confidence: result.verdict.confidence,
            score: result.verdict.score,
            risk: result.verdict.risk,
            primaryMethod: result.verdict.primaryMethod,
            processingTime: result.time,
            topEvidence: result.verdict.evidence?.strong?.slice(0, 3)
        };
    }
}

// Run the demo
async function main() {
    // Check if required packages are installed
    try {
        require('chalk');
        require('ora');
        require('cli-table3');
    } catch (error) {
        console.log('Installing required packages for demo...');
        const { execSync } = require('child_process');
        execSync('npm install chalk ora cli-table3', { stdio: 'inherit' });
    }

    const demo = new ScreenDetectionDemo();
    
    try {
        await demo.initialize();
        await demo.runDemo();
        
        console.log(chalk.bold.green('\n✨ Demo completed successfully!\n'));
        console.log(chalk.dim('Generated test images:'));
        
        const files = await fs.readdir(__dirname);
        files.filter(f => f.startsWith('test-')).forEach(file => {
            console.log(chalk.dim(`  - ${file}`));
        });

    } catch (error) {
        console.error(chalk.red('\n❌ Demo failed:'), error.message);
        process.exit(1);
    }
}

if (require.main === module) {
    main();
}
