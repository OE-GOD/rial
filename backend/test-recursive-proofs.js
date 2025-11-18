#!/usr/bin/env node

/**
 * Test script for Recursive Proof System
 * 
 * Demonstrates:
 * 1. Creating a base proof for the first transformation
 * 2. Adding recursive proofs for subsequent transformations
 * 3. Verifying the entire proof chain
 * 4. Exporting and importing proof chains
 */

const axios = require('axios');
const FormData = require('form-data');
const fs = require('fs').promises;
const path = require('path');
const sharp = require('sharp');

const API_URL = process.env.API_URL || 'http://localhost:3000';

async function generateTestImage(name = 'test-recursive.jpg') {
    console.log('📸 Generating test image...');
    
    // Create a 512x512 test image with gradient and text
    const width = 512;
    const height = 512;
    
    // Create gradient
    const gradient = Buffer.alloc(width * height * 3);
    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const idx = (y * width + x) * 3;
            gradient[idx] = Math.floor((x / width) * 255);     // R
            gradient[idx + 1] = Math.floor((y / height) * 255); // G
            gradient[idx + 2] = 128;                             // B
        }
    }
    
    // Create image with text overlay
    const image = await sharp(gradient, { 
        raw: { width, height, channels: 3 } 
    })
        .composite([{
            input: Buffer.from(`
                <svg width="${width}" height="${height}">
                    <text x="50%" y="50%" font-family="Arial" font-size="48" 
                          fill="white" stroke="black" stroke-width="2"
                          text-anchor="middle" dominant-baseline="middle">
                        RECURSIVE TEST
                    </text>
                </svg>`),
            top: 0,
            left: 0
        }])
        .jpeg({ quality: 90 })
        .toBuffer();
    
    await fs.writeFile(name, image);
    console.log(`✅ Generated ${name} (${image.length} bytes)`);
    return image;
}

async function createBaseProof(imageBuffer) {
    console.log('\n🔐 Creating base proof (first transformation)...');
    
    const formData = new FormData();
    formData.append('image', imageBuffer, 'test.jpg');
    formData.append('transformation', JSON.stringify({
        type: 'Crop',
        parameters: { x: 50, y: 50, width: 400, height: 400 }
    }));
    
    try {
        const response = await axios.post(`${API_URL}/prove/recursive`, formData, {
            headers: formData.getHeaders(),
            maxContentLength: Infinity,
            maxBodyLength: Infinity
        });
        
        console.log('✅ Base proof created:');
        console.log(`   Chain ID: ${response.data.chainId}`);
        console.log(`   Depth: ${response.data.depth}`);
        console.log(`   Proof ID: ${response.data.proofId}`);
        
        return response.data;
    } catch (error) {
        console.error('❌ Failed to create base proof:', error.response?.data || error.message);
        throw error;
    }
}

async function addRecursiveProof(imageBuffer, previousProofData, transformation) {
    console.log(`\n🔗 Adding recursive proof (${transformation.type})...`);
    
    const formData = new FormData();
    formData.append('image', imageBuffer, 'test.jpg');
    formData.append('chainId', previousProofData.chainId);
    formData.append('transformation', JSON.stringify(transformation));
    
    // Since we're running without a database, we'll use the chain ID approach
    try {
        const response = await axios.post(`${API_URL}/prove/recursive`, formData, {
            headers: formData.getHeaders(),
            maxContentLength: Infinity,
            maxBodyLength: Infinity
        });
        
        console.log('✅ Recursive proof added:');
        console.log(`   Chain ID: ${response.data.chainId}`);
        console.log(`   Depth: ${response.data.depth}`);
        console.log(`   Total transformations: ${response.data.transformations.length}`);
        
        return response.data;
    } catch (error) {
        console.error('❌ Failed to add recursive proof:', error.response?.data || error.message);
        throw error;
    }
}

async function verifyProofChain(proofId) {
    console.log('\n🔍 Verifying proof chain...');
    
    try {
        const response = await axios.post(`${API_URL}/verify/recursive`, {
            proofId: proofId
        });
        
        console.log('✅ Verification result:');
        console.log(`   Valid: ${response.data.valid ? '✅' : '❌'}`);
        console.log(`   Chain depth: ${response.data.depth}`);
        console.log(`   Transformations:`);
        response.data.transformations.forEach((t, i) => {
            console.log(`     ${i + 1}. ${t.type} - ${JSON.stringify(t.parameters)}`);
        });
        
        return response.data;
    } catch (error) {
        console.error('❌ Verification failed:', error.response?.data || error.message);
        throw error;
    }
}

async function exportProofChain(chainId) {
    console.log('\n📦 Exporting proof chain...');
    
    try {
        const response = await axios.get(`${API_URL}/proof/chain/${chainId}`);
        
        console.log('✅ Proof chain exported:');
        console.log(`   Version: ${response.data.version}`);
        console.log(`   Chain ID: ${response.data.chainId}`);
        console.log(`   Depth: ${response.data.depth}`);
        console.log(`   Package size: ${JSON.stringify(response.data).length} bytes`);
        
        // Save to file
        const filename = `proof-chain-${chainId}.json`;
        await fs.writeFile(filename, JSON.stringify(response.data, null, 2));
        console.log(`   Saved to: ${filename}`);
        
        return response.data;
    } catch (error) {
        console.error('❌ Export failed:', error.response?.data || error.message);
        throw error;
    }
}

async function demonstrateComplexChain() {
    console.log('\n🎯 Demonstrating complex transformation chain...\n');
    
    // Generate test image
    const originalImage = await generateTestImage();
    
    // Transformation sequence
    const transformations = [
        { type: 'Crop', parameters: { x: 50, y: 50, width: 400, height: 400 } },
        { type: 'Resize', parameters: { width: 300, height: 300 } },
        { type: 'Grayscale', parameters: {} },
        { type: 'Brightness', parameters: { adjustment: 1.2 } },
        { type: 'Contrast', parameters: { factor: 1.5 } },
        { type: 'Blur', parameters: { radius: 2 } }
    ];
    
    let currentImage = originalImage;
    let currentProofData = null;
    let chainId = null;
    
    // Apply transformations recursively
    for (let i = 0; i < transformations.length; i++) {
        const transform = transformations[i];
        console.log(`\n=== Step ${i + 1}/${transformations.length}: ${transform.type} ===`);
        
        // Apply transformation to image
        let processedImage = await sharp(currentImage);
        
        switch (transform.type) {
            case 'Crop':
                processedImage = processedImage.extract({
                    left: transform.parameters.x,
                    top: transform.parameters.y,
                    width: transform.parameters.width,
                    height: transform.parameters.height
                });
                break;
            case 'Resize':
                processedImage = processedImage.resize(
                    transform.parameters.width,
                    transform.parameters.height
                );
                break;
            case 'Grayscale':
                processedImage = processedImage.grayscale();
                break;
            case 'Brightness':
                processedImage = processedImage.modulate({ 
                    brightness: transform.parameters.adjustment 
                });
                break;
            case 'Contrast':
                processedImage = processedImage.linear(
                    transform.parameters.factor, 
                    -(128 * (transform.parameters.factor - 1))
                );
                break;
            case 'Blur':
                processedImage = processedImage.blur(transform.parameters.radius);
                break;
        }
        
        currentImage = await processedImage.jpeg({ quality: 90 }).toBuffer();
        
        // Save intermediate result
        const intermediateName = `recursive-step-${i + 1}-${transform.type.toLowerCase()}.jpg`;
        await fs.writeFile(intermediateName, currentImage);
        console.log(`📸 Saved intermediate: ${intermediateName}`);
        
        // Generate proof
        if (i === 0) {
            // Base proof
            const result = await createBaseProof(originalImage);
            currentProofData = result;
            chainId = result.chainId;
        } else {
            // Recursive proof
            const result = await addRecursiveProof(currentImage, currentProofData, transform);
            currentProofData = result;
        }
    }
    
    // Verify the complete chain
    await verifyProofChain(currentProofData.proofId);
    
    // Export the proof chain
    await exportProofChain(chainId);
    
    console.log('\n✅ Complex chain demonstration complete!');
    console.log(`   Final image: recursive-step-${transformations.length}-${transformations[transformations.length-1].type.toLowerCase()}.jpg`);
    console.log(`   Proof chain: proof-chain-${chainId}.json`);
}

async function benchmarkRecursiveProofs() {
    console.log('\n📊 Benchmarking recursive proof performance...\n');
    
    const depths = [1, 5, 10, 20];
    const results = [];
    
    for (const depth of depths) {
        console.log(`\nTesting depth ${depth}...`);
        const start = Date.now();
        
        const image = await generateTestImage(`bench-${depth}.jpg`);
        let proofData = null;
        
        for (let i = 0; i < depth; i++) {
            const transform = {
                type: i % 2 === 0 ? 'Crop' : 'Resize',
                parameters: i % 2 === 0 
                    ? { x: 10, y: 10, width: 480, height: 480 }
                    : { width: 400, height: 400 }
            };
            
            if (i === 0) {
                const result = await createBaseProof(image);
                proofData = result;
            } else {
                const result = await addRecursiveProof(image, proofData, transform);
                proofData = result;
            }
        }
        
        const elapsed = Date.now() - start;
        results.push({ depth, time: elapsed, avgPerProof: elapsed / depth });
        
        console.log(`✅ Depth ${depth}: ${elapsed}ms total, ${Math.round(elapsed/depth)}ms per proof`);
    }
    
    console.log('\n📈 Benchmark Summary:');
    console.table(results);
}

async function main() {
    try {
        // Check if server is running
        try {
            await axios.get(`${API_URL}/health`);
        } catch (error) {
            console.error('❌ Server not running at', API_URL);
            console.log('Please start the server first: npm start');
            process.exit(1);
        }
        
        console.log('🚀 ZK-IMG Recursive Proof System Test\n');
        
        // Run demonstrations
        await demonstrateComplexChain();
        
        // Optional: Run benchmarks
        const runBenchmarks = process.argv.includes('--benchmark');
        if (runBenchmarks) {
            await benchmarkRecursiveProofs();
        }
        
        console.log('\n✅ All tests completed successfully!');
        console.log('\n💡 To run benchmarks, use: node test-recursive-proofs.js --benchmark');
        
    } catch (error) {
        console.error('\n❌ Test failed:', error.message);
        process.exit(1);
    }
}

// Run the tests
main();
