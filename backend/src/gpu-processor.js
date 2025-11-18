/**
 * GPU-Accelerated Image Processing for ZK-IMG
 * Uses GPU.js and TensorFlow.js for high-performance image transformations
 */

// GPU modules are optional - gracefully handle if not installed
let GPU;
try {
    GPU = require('gpu.js').GPU;
} catch (e) {
    console.log('gpu.js not available - GPU acceleration disabled');
}

const sharp = require('sharp');
const fs = require('fs').promises;
const path = require('path');

class GPUImageProcessor {
    constructor(options = {}) {
        this.options = {
            mode: options.mode || 'auto', // 'gpu.js', 'tensorflow', 'cpu', 'auto'
            gpuMemory: options.gpuMemory || 512, // MB
            precision: options.precision || 'unsigned', // 'unsigned', 'single'
            ...options
        };

        this.gpu = null;
        this.tf = null;
        this.initialized = false;
        this.capabilities = {
            gpuJs: false,
            tensorflow: false,
            webgl: false,
            fallback: true
        };

        this.init();
    }

    async init() {
        try {
            // Initialize GPU.js
            if (this.options.mode === 'auto' || this.options.mode === 'gpu.js') {
                this.gpu = new GPU({
                    mode: 'gpu',
                    precision: this.options.precision
                });

                // Test GPU functionality
                const testKernel = this.gpu.createKernel(function() {
                    return 1;
                }, { output: [1] });

                testKernel();
                this.capabilities.gpuJs = true;
                console.log('✅ GPU.js initialized successfully');
            }

            // Initialize TensorFlow.js (if available)
            try {
                if (this.options.mode === 'auto' || this.options.mode === 'tensorflow') {
                    const tf = require('@tensorflow/tfjs-node-gpu');
                    await tf.ready();
                    this.tf = tf;
                    this.capabilities.tensorflow = true;
                    console.log('✅ TensorFlow.js GPU initialized successfully');
                }
            } catch (tfError) {
                console.log('⚠️  TensorFlow.js GPU not available, using CPU fallback');
            }

            // Detect WebGL support (for browser-based GPU acceleration)
            if (typeof window !== 'undefined') {
                const canvas = document.createElement('canvas');
                const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
                this.capabilities.webgl = !!gl;
                if (this.capabilities.webgl) {
                    console.log('✅ WebGL available for GPU acceleration');
                }
            }

            this.initialized = true;
            console.log('🚀 GPU Image Processor initialized');

        } catch (error) {
            console.error('❌ GPU initialization failed:', error.message);
            console.log('⚠️  Falling back to CPU processing');
            this.capabilities.fallback = true;
        }
    }

    /**
     * Apply GPU-accelerated image transformations
     */
    async transformImage(imageBuffer, transformations, options = {}) {
        if (!this.initialized) {
            throw new Error('GPU processor not initialized');
        }

        const startTime = Date.now();

        try {
            // Convert image to raw pixel data
            const imageData = await this.bufferToImageData(imageBuffer);
            let result = imageData;

            // Apply transformations
            for (const transform of transformations) {
                result = await this.applyGPUSingleTransform(result, transform, options);
            }

            // Convert back to buffer
            const outputBuffer = await this.imageDataToBuffer(result);

            const processingTime = Date.now() - startTime;

            return {
                buffer: outputBuffer,
                originalSize: imageBuffer.length,
                processedSize: outputBuffer.length,
                processingTime,
                gpuAccelerated: this.isUsingGPU(),
                method: this.getProcessingMethod()
            };

        } catch (error) {
            console.error('❌ GPU processing failed:', error.message);
            // Fallback to CPU processing
            return await this.fallbackProcessing(imageBuffer, transformations);
        }
    }

    /**
     * Apply a single GPU-accelerated transformation
     */
    async applyGPUSingleTransform(imageData, transform, options) {
        const transformType = Object.keys(transform)[0];
        const params = transform[transformType];

        switch (transformType) {
            case 'Grayscale':
                return await this.gpuGrayscale(imageData);
            case 'Blur':
                return await this.gpuBlur(imageData, params);
            case 'Sharpen':
                return await this.gpuSharpen(imageData, params);
            case 'Contrast':
                return await this.gpuContrast(imageData, params);
            case 'Brightness':
                return await this.gpuBrightness(imageData, params);
            case 'EdgeDetect':
                return await this.gpuEdgeDetection(imageData);
            case 'GaussianBlur':
                return await this.gpuGaussianBlur(imageData, params);
            default:
                // Fallback to CPU for unsupported transforms
                return await this.cpuTransform(imageData, transform);
        }
    }

    /**
     * GPU-accelerated grayscale conversion
     */
    async gpuGrayscale(imageData) {
        if (!this.capabilities.gpuJs) {
            return this.cpuGrayscale(imageData);
        }

        const { width, height, data } = imageData;

        const grayscaleKernel = this.gpu.createKernel(function(pixels) {
            const idx = (this.thread.y * this.constants.width + this.thread.x) * 4;
            const r = pixels[idx];
            const g = pixels[idx + 1];
            const b = pixels[idx + 2];
            // Luminance formula: 0.299*R + 0.587*G + 0.114*B
            const gray = Math.floor(0.299 * r + 0.587 * g + 0.114 * b);
            return [gray, gray, gray, pixels[idx + 3]];
        }, {
            constants: { width },
            output: [width, height],
            pipeline: true
        });

        const result = grayscaleKernel(data);
        return { ...imageData, data: result };
    }

    /**
     * GPU-accelerated blur
     */
    async gpuBlur(imageData, params = {}) {
        if (!this.capabilities.gpuJs) {
            return this.cpuBlur(imageData, params);
        }

        const { width, height, data } = imageData;
        const sigma = params.sigma || 1.5;

        // Simple box blur kernel (can be enhanced to Gaussian)
        const blurKernel = this.gpu.createKernel(function(pixels) {
            const x = this.thread.x;
            const y = this.thread.y;
            const idx = (y * this.constants.width + x) * 4;

            // Simple 3x3 box blur
            let r = 0, g = 0, b = 0, a = pixels[idx + 3];
            let count = 0;

            for (let dy = -1; dy <= 1; dy++) {
                for (let dx = -1; dx <= 1; dx++) {
                    const nx = x + dx;
                    const ny = y + dy;
                    if (nx >= 0 && nx < this.constants.width && ny >= 0 && ny < this.constants.height) {
                        const nidx = (ny * this.constants.width + nx) * 4;
                        r += pixels[nidx];
                        g += pixels[nidx + 1];
                        b += pixels[nidx + 2];
                        count++;
                    }
                }
            }

            return [r / count, g / count, b / count, a];
        }, {
            constants: { width, height },
            output: [width, height],
            pipeline: true
        });

        const result = blurKernel(data);
        return { ...imageData, data: result };
    }

    /**
     * GPU-accelerated sharpening
     */
    async gpuSharpen(imageData, params = {}) {
        if (!this.capabilities.gpuJs) {
            return this.cpuSharpen(imageData, params);
        }

        const { width, height, data } = imageData;

        // Laplacian sharpening kernel
        const sharpenKernel = this.gpu.createKernel(function(pixels) {
            const x = this.thread.x;
            const y = this.thread.y;
            const idx = (y * this.constants.width + x) * 4;

            // Get current pixel
            const r = pixels[idx];
            const g = pixels[idx + 1];
            const b = pixels[idx + 2];
            const a = pixels[idx + 3];

            // Simple sharpening (can be enhanced)
            let sharpR = r * 1.2;
            let sharpG = g * 1.2;
            let sharpB = b * 1.2;

            // Clamp values
            sharpR = Math.min(255, Math.max(0, sharpR));
            sharpG = Math.min(255, Math.max(0, sharpG));
            sharpB = Math.min(255, Math.max(0, sharpB));

            return [sharpR, sharpG, sharpB, a];
        }, {
            constants: { width, height },
            output: [width, height],
            pipeline: true
        });

        const result = sharpenKernel(data);
        return { ...imageData, data: result };
    }

    /**
     * GPU-accelerated edge detection
     */
    async gpuEdgeDetection(imageData) {
        if (!this.capabilities.gpuJs) {
            return this.cpuEdgeDetection(imageData);
        }

        const { width, height, data } = imageData;

        // Sobel edge detection kernel
        const edgeKernel = this.gpu.createKernel(function(pixels) {
            const x = this.thread.x;
            const y = this.thread.y;

            // Convert to grayscale first
            const idx = (y * this.constants.width + x) * 4;
            const gray = 0.299 * pixels[idx] + 0.587 * pixels[idx + 1] + 0.114 * pixels[idx + 2];

            // Sobel operator (simplified)
            let gx = 0, gy = 0;

            // Sample neighboring pixels
            for (let dy = -1; dy <= 1; dy++) {
                for (let dx = -1; dx <= 1; dx++) {
                    const nx = x + dx;
                    const ny = y + dy;
                    if (nx >= 0 && nx < this.constants.width && ny >= 0 && ny < this.constants.height) {
                        const nidx = (ny * this.constants.width + nx) * 4;
                        const ngray = 0.299 * pixels[nidx] + 0.587 * pixels[nidx + 1] + 0.114 * pixels[nidx + 2];

                        // Sobel weights
                        const weightX = dx === 0 ? 0 : dx;
                        const weightY = dy === 0 ? 0 : dy;

                        gx += ngray * weightX;
                        gy += ngray * weightY;
                    }
                }
            }

            const magnitude = Math.sqrt(gx * gx + gy * gy);
            const edge = Math.min(255, magnitude * 2);

            return [edge, edge, edge, 255];
        }, {
            constants: { width, height },
            output: [width, height],
            pipeline: true
        });

        const result = edgeKernel(data);
        return { ...imageData, data: result };
    }

    /**
     * CPU fallback implementations
     */
    async cpuGrayscale(imageData) {
        const { data } = imageData;
        const newData = new Uint8Array(data.length);

        for (let i = 0; i < data.length; i += 4) {
            const r = data[i];
            const g = data[i + 1];
            const b = data[i + 2];
            const a = data[i + 3];
            const gray = Math.floor(0.299 * r + 0.587 * g + 0.114 * b);
            newData[i] = gray;
            newData[i + 1] = gray;
            newData[i + 2] = gray;
            newData[i + 3] = a;
        }

        return { ...imageData, data: newData };
    }

    async cpuBlur(imageData, params = {}) {
        const { width, height, data } = imageData;
        const sigma = params.sigma || 1.5;
        const kernelSize = Math.ceil(sigma * 3);
        const newData = new Uint8Array(data.length);

        for (let y = 0; y < height; y++) {
            for (let x = 0; x < width; x++) {
                let r = 0, g = 0, b = 0, a = 0, count = 0;

                for (let ky = -kernelSize; ky <= kernelSize; ky++) {
                    for (let kx = -kernelSize; kx <= kernelSize; kx++) {
                        const nx = x + kx;
                        const ny = y + ky;

                        if (nx >= 0 && nx < width && ny >= 0 && ny < height) {
                            const idx = (ny * width + nx) * 4;
                            r += data[idx];
                            g += data[idx + 1];
                            b += data[idx + 2];
                            a += data[idx + 3];
                            count++;
                        }
                    }
                }

                const idx = (y * width + x) * 4;
                newData[idx] = r / count;
                newData[idx + 1] = g / count;
                newData[idx + 2] = b / count;
                newData[idx + 3] = a / count;
            }
        }

        return { ...imageData, data: newData };
    }

    async cpuSharpen(imageData, params = {}) {
        // Simple CPU sharpening implementation
        return imageData; // Placeholder
    }

    async cpuEdgeDetection(imageData) {
        // Simple CPU edge detection
        return imageData; // Placeholder
    }

    async cpuTransform(imageData, transform) {
        // Fallback to Sharp for unsupported transforms
        const buffer = await this.imageDataToBuffer(imageData);
        const sharpResult = await sharp(buffer).toBuffer();
        return await this.bufferToImageData(sharpResult);
    }

    /**
     * Fallback to CPU processing if GPU fails
     */
    async fallbackProcessing(imageBuffer, transformations) {
        console.log('⚠️  GPU processing failed, falling back to CPU');
        const { applyTransformations } = require('../image-transformer');
        const result = await applyTransformations(imageBuffer, transformations);

        return {
            buffer: result.finalBuffer,
            originalSize: imageBuffer.length,
            processedSize: result.finalBuffer.length,
            processingTime: 0,
            gpuAccelerated: false,
            method: 'cpu-fallback'
        };
    }

    /**
     * Utility functions
     */
    async bufferToImageData(buffer) {
        const sharpImg = sharp(buffer);
        const metadata = await sharpImg.metadata();
        const rawBuffer = await sharpImg.raw().toBuffer();

        return {
            width: metadata.width,
            height: metadata.height,
            data: new Uint8Array(rawBuffer),
            channels: metadata.channels
        };
    }

    async imageDataToBuffer(imageData) {
        const { width, height, data, channels } = imageData;

        // Ensure we have RGBA data
        let rgbaData = data;
        if (channels === 3) {
            // Convert RGB to RGBA
            rgbaData = new Uint8Array(width * height * 4);
            for (let i = 0, j = 0; i < data.length; i += 3, j += 4) {
                rgbaData[j] = data[i];     // R
                rgbaData[j + 1] = data[i + 1]; // G
                rgbaData[j + 2] = data[i + 2]; // B
                rgbaData[j + 3] = 255;    // A
            }
        }

        return await sharp(rgbaData, {
            raw: { width, height, channels: 4 }
        }).png().toBuffer();
    }

    isUsingGPU() {
        return this.capabilities.gpuJs || this.capabilities.tensorflow;
    }

    getProcessingMethod() {
        if (this.capabilities.gpuJs) return 'gpu.js';
        if (this.capabilities.tensorflow) return 'tensorflow';
        return 'cpu';
    }

    getCapabilities() {
        return { ...this.capabilities };
    }

    async getPerformanceMetrics() {
        return {
            initialized: this.initialized,
            capabilities: this.capabilities,
            processingMethod: this.getProcessingMethod(),
            gpuMemory: this.options.gpuMemory,
            precision: this.options.precision
        };
    }

    // Cleanup resources
    destroy() {
        if (this.gpu) {
            try {
                this.gpu.destroy();
            } catch (error) {
                console.error('Error destroying GPU instance:', error);
            }
        }

        if (this.tf) {
            // TensorFlow cleanup if needed
        }

        this.initialized = false;
        console.log('🧹 GPU processor destroyed');
    }
}

// Export singleton instance
let gpuProcessorInstance = null;

function getGPUProcessor(options = {}) {
    if (!gpuProcessorInstance) {
        gpuProcessorInstance = new GPUImageProcessor(options);
    }
    return gpuProcessorInstance;
}

module.exports = {
    GPUImageProcessor,
    getGPUProcessor
};
