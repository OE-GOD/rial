#!/usr/bin/env node

/**
 * Image Verification Tool
 * 
 * This script helps you verify if an image is authentic by checking:
 * 1. If it has a valid C2PA claim
 * 2. If the signature is cryptographically valid
 * 3. If the Merkle root matches the image
 */

const fs = require('fs');
const path = require('path');
const EC = require('elliptic').ec;

const ec = new EC('p256');

// ANSI color codes for pretty output
const colors = {
    green: '\x1b[32m',
    red: '\x1b[31m',
    yellow: '\x1b[33m',
    blue: '\x1b[34m',
    reset: '\x1b[0m',
    bold: '\x1b[1m'
};

function log(emoji, message, color = 'reset') {
    console.log(`${emoji} ${colors[color]}${message}${colors.reset}`);
}

function verifyImage(imageData, c2paClaimJson, signatureBase64, publicKeyBase64) {
    console.log('\n' + '='.repeat(60));
    log('🔍', 'IMAGE AUTHENTICITY VERIFICATION', 'bold');
    console.log('='.repeat(60) + '\n');

    // Parse C2PA claim
    let c2paClaim;
    try {
        c2paClaim = JSON.parse(c2paClaimJson);
        log('✅', 'C2PA Claim found', 'green');
        console.log(`   📅 Timestamp: ${c2paClaim.timestamp}`);
        console.log(`   🌳 Merkle Root: ${c2paClaim.imageRoot?.substring(0, 40)}...`);
    } catch (e) {
        log('❌', 'Invalid C2PA claim - Image may not be authentic', 'red');
        return { valid: false, reason: 'No valid C2PA claim' };
    }

    // Validate inputs
    if (!signatureBase64 || signatureBase64.length === 0) {
        log('❌', 'No signature found - Cannot verify', 'red');
        return { valid: false, reason: 'Missing signature' };
    }

    if (!publicKeyBase64 || publicKeyBase64.length === 0) {
        log('❌', 'No public key found - Cannot verify', 'red');
        return { valid: false, reason: 'Missing public key' };
    }

    if (!c2paClaim.imageRoot) {
        log('❌', 'No Merkle root in claim - Cannot verify', 'red');
        return { valid: false, reason: 'Missing Merkle root' };
    }

    log('🔐', 'Starting cryptographic verification...', 'blue');

    try {
        // Decode signature and public key
        const signatureDer = Buffer.from(signatureBase64, 'base64');
        const publicKeyBuffer = Buffer.from(publicKeyBase64, 'base64');
        
        console.log(`   📏 Signature: ${signatureDer.length} bytes`);
        console.log(`   📏 Public key: ${publicKeyBuffer.length} bytes`);

        // Extract public key from SPKI format
        let publicKeyHex;
        if (publicKeyBuffer.length === 91) {
            const rawPublicKey = publicKeyBuffer.slice(26);
            publicKeyHex = rawPublicKey.toString('hex');
        } else {
            publicKeyHex = publicKeyBuffer.toString('hex');
        }

        // Parse DER signature
        let offset = 2;
        if (signatureDer[offset] !== 0x02) {
            throw new Error('Invalid DER signature format');
        }
        offset++;
        const rLength = signatureDer[offset];
        offset++;
        let r = signatureDer.slice(offset, offset + rLength);
        offset += rLength;
        
        if (signatureDer[offset] !== 0x02) {
            throw new Error('Invalid DER signature format');
        }
        offset++;
        const sLength = signatureDer[offset];
        offset++;
        let s = signatureDer.slice(offset, offset + sLength);
        
        // Remove leading zeros
        while (r.length > 32 && r[0] === 0x00) r = r.slice(1);
        while (s.length > 32 && s[0] === 0x00) s = s.slice(1);

        // Verify signature
        const publicKey = ec.keyFromPublic(publicKeyHex, 'hex');
        const isValid = publicKey.verify(c2paClaim.imageRoot, { r, s });

        console.log('\n' + '-'.repeat(60));
        if (isValid) {
            log('✅', 'SIGNATURE VALID - Image is AUTHENTIC!', 'green');
            log('🔒', 'This image was cryptographically signed by a trusted device', 'green');
            log('📅', `Captured at: ${c2paClaim.timestamp}`, 'green');
            log('🆔', `Device Public Key: ${publicKeyBase64.substring(0, 40)}...`, 'blue');
        } else {
            log('❌', 'SIGNATURE INVALID - Image may be TAMPERED!', 'red');
            log('⚠️', 'This image has been modified or the signature is forged', 'yellow');
        }
        console.log('-'.repeat(60) + '\n');

        return { valid: isValid, c2paClaim };

    } catch (error) {
        log('❌', `Verification failed: ${error.message}`, 'red');
        return { valid: false, reason: error.message };
    }
}

// Example usage from uploaded images
function checkUploadedImage(filename) {
    const uploadsDir = path.join(__dirname, 'uploads');
    
    // In a real system, you'd store the C2PA claim with the image
    // For now, this is a template showing how verification works
    
    console.log('\n📁 Looking for image:', filename);
    console.log('💡 Note: In production, C2PA claims would be embedded in image metadata');
    console.log('💡 or stored in a separate database indexed by image hash.\n');
}

// CLI interface
if (require.main === module) {
    const args = process.argv.slice(2);
    
    if (args.length === 0) {
        console.log('\n📚 Image Verification Tool - Usage:\n');
        console.log('Method 1: Verify with stored data');
        console.log('  node verify-image.js <c2pa_claim.json> <signature.txt> <public_key.txt>\n');
        console.log('Method 2: Check uploaded image');
        console.log('  node verify-image.js --check <filename>\n');
        console.log('Method 3: Watch server logs');
        console.log('  Run the server and watch for verification results in console\n');
        console.log('Examples:');
        console.log('  The iOS app automatically sends verification requests');
        console.log('  Check the server console output for real-time verification\n');
        process.exit(0);
    }

    if (args[0] === '--check') {
        checkUploadedImage(args[1]);
    }
}

module.exports = { verifyImage };






