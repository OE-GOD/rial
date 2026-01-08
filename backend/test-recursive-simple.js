#!/usr/bin/env node

const axios = require('axios');
const FormData = require('form-data');
const fs = require('fs').promises;
const sharp = require('sharp');

const API_URL = 'http://localhost:3000';

async function test() {
    console.log('Testing recursive proof system...\n');
    
    // Generate test image
    const imageBuffer = await sharp({
        create: {
            width: 100,
            height: 100,
            channels: 3,
            background: { r: 255, g: 0, b: 0 }
        }
    })
    .jpeg()
    .toBuffer();
    
    console.log('Generated test image:', imageBuffer.length, 'bytes');
    
    // Test base proof
    console.log('\n1. Testing base proof...');
    
    const formData = new FormData();
    formData.append('image', imageBuffer, 'test.jpg');
    formData.append('transformation', JSON.stringify({
        type: 'Crop',
        parameters: { x: 10, y: 10, width: 80, height: 80 }
    }));
    
    try {
        const response = await axios.post(`${API_URL}/prove/recursive`, formData, {
            headers: formData.getHeaders()
        });
        
        console.log('✅ Success!');
        console.log('Chain ID:', response.data.chainId);
        console.log('Depth:', response.data.depth);
        console.log('Proof ID:', response.data.proofId);
        
    } catch (error) {
        console.error('❌ Error:', error.response?.data || error.message);
        
        // Try direct groth16 test
        console.log('\n2. Testing groth16 directly...');
        try {
            const directResponse = await axios.post(`${API_URL}/prove`, formData, {
                headers: formData.getHeaders()
            });
            console.log('Direct groth16 works!', directResponse.data);
        } catch (e) {
            console.error('Direct groth16 also fails:', e.response?.data || e.message);
        }
    }
}

test().catch(console.error);
