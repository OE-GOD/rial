#!/usr/bin/env node
/**
 * Insurance API Test Suite
 * Tests claim submission and adjuster review flow
 */

const axios = require('axios');
const fs = require('fs');
const path = require('path');

const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:3000';

// Colors
const colors = {
    reset: '\x1b[0m',
    green: '\x1b[32m',
    red: '\x1b[31m',
    yellow: '\x1b[33m',
    blue: '\x1b[34m',
    cyan: '\x1b[36m',
};

function log(color, symbol, message) {
    console.log(`${colors[color]}${symbol} ${message}${colors.reset}`);
}

function success(message) { log('green', '✅', message); }
function error(message) { log('red', '❌', message); }
function info(message) { log('cyan', 'ℹ️', message); }
function section(message) {
    console.log();
    log('blue', '🔷', message);
    console.log('━'.repeat(60));
}

// Test data
const testClaim = {
    claimType: "Auto Damage",
    policyNumber: "TEST-12345",
    description: "Rear bumper damage from parking lot collision. Noticeable dent and scratches on driver side rear bumper.",
    estimatedAmount: 1500,
    photos: [
        {
            id: "photo-1",
            imageData: Buffer.from("fake-image-data-1").toString('base64'),
            c2paClaim: JSON.stringify({
                signature: "test-signature-1",
                publicKey: "test-pubkey-1",
                imageRoot: "test-root-1",
                timestamp: new Date().toISOString()
            }),
            metadata: JSON.stringify({
                latitude: 34.0522,
                longitude: -118.2437,
                cameraModel: "iPhone 15 Pro",
                accelerometerX: 0.23,
                accelerometerY: -0.45,
                accelerometerZ: 9.81,
                timestamp: new Date().toISOString()
            }),
            zkProof: null,
            captureDate: new Date().toISOString(),
            verificationStatus: "verified"
        },
        {
            id: "photo-2",
            imageData: Buffer.from("fake-image-data-2").toString('base64'),
            c2paClaim: JSON.stringify({
                signature: "test-signature-2",
                publicKey: "test-pubkey-2",
                imageRoot: "test-root-2",
                timestamp: new Date().toISOString()
            }),
            metadata: JSON.stringify({
                latitude: 34.0522,
                longitude: -118.2437,
                cameraModel: "iPhone 15 Pro",
                accelerometerX: 0.18,
                accelerometerY: -0.52,
                accelerometerZ: 9.78,
                timestamp: new Date().toISOString()
            }),
            zkProof: null,
            captureDate: new Date().toISOString(),
            verificationStatus: "verified"
        }
    ]
};

const testResults = {
    passed: 0,
    failed: 0,
    total: 0
};

let adjusterToken = null;
let testClaimId = null;

// Test functions
async function test1_HealthCheck() {
    section('Test 1: Health Check');
    testResults.total++;
    
    try {
        const response = await axios.get(`${BACKEND_URL}/health`);
        
        if (response.status === 200) {
            success('Backend is healthy');
            testResults.passed++;
            return true;
        } else {
            error('Backend health check failed');
            testResults.failed++;
            return false;
        }
    } catch (err) {
        error(`Health check failed: ${err.message}`);
        error('Make sure backend is running: npm start');
        testResults.failed++;
        return false;
    }
}

async function test2_SubmitClaim() {
    section('Test 2: Submit Insurance Claim');
    testResults.total++;
    
    try {
        info('Submitting test claim...');
        info(`  Type: ${testClaim.claimType}`);
        info(`  Policy: ${testClaim.policyNumber}`);
        info(`  Photos: ${testClaim.photos.length}`);
        
        const response = await axios.post(
            `${BACKEND_URL}/api/claims/submit`,
            testClaim,
            {
                headers: { 'Content-Type': 'application/json' },
                maxContentLength: Infinity,
                maxBodyLength: Infinity
            }
        );
        
        if (response.data.success && response.data.claimId) {
            testClaimId = response.data.claimId;
            success(`Claim submitted successfully`);
            success(`  Claim ID: ${testClaimId}`);
            success(`  Status: ${response.data.status}`);
            success(`  All photos verified: ${response.data.allPhotosVerified}`);
            
            if (response.data.verificationResults) {
                info(`  Verification details:`);
                response.data.verificationResults.forEach((result, idx) => {
                    info(`    Photo ${idx + 1}: ${result.verified ? '✅ Verified' : '❌ Failed'} (${(result.confidence * 100).toFixed(1)}% confidence)`);
                });
            }
            
            testResults.passed++;
            return true;
        } else {
            error('Claim submission failed');
            console.log(response.data);
            testResults.failed++;
            return false;
        }
    } catch (err) {
        error(`Claim submission error: ${err.message}`);
        if (err.response) {
            error(`Response: ${JSON.stringify(err.response.data, null, 2)}`);
        }
        testResults.failed++;
        return false;
    }
}

async function test3_CheckClaimStatus() {
    section('Test 3: Check Claim Status');
    testResults.total++;
    
    if (!testClaimId) {
        error('No claim ID available (previous test failed)');
        testResults.failed++;
        return false;
    }
    
    try {
        const response = await axios.get(
            `${BACKEND_URL}/api/claims/${testClaimId}/status`
        );
        
        if (response.data.claimId === testClaimId) {
            success('Claim status retrieved');
            info(`  Claim ID: ${response.data.claimId}`);
            info(`  Status: ${response.data.status}`);
            info(`  Submitted: ${response.data.submittedAt}`);
            
            testResults.passed++;
            return true;
        } else {
            error('Claim status check failed');
            testResults.failed++;
            return false;
        }
    } catch (err) {
        error(`Status check error: ${err.message}`);
        testResults.failed++;
        return false;
    }
}

async function test4_AdjusterLogin() {
    section('Test 4: Adjuster Login');
    testResults.total++;
    
    try {
        const response = await axios.post(
            `${BACKEND_URL}/api/claims/adjuster/login`,
            {
                username: 'test-adjuster',
                password: 'test-password'
            }
        );
        
        if (response.data.success && response.data.sessionToken) {
            adjusterToken = response.data.sessionToken;
            success('Adjuster login successful');
            info(`  Username: ${response.data.username}`);
            info(`  Token: ${adjusterToken.substring(0, 16)}...`);
            
            testResults.passed++;
            return true;
        } else {
            error('Adjuster login failed');
            testResults.failed++;
            return false;
        }
    } catch (err) {
        error(`Login error: ${err.message}`);
        testResults.failed++;
        return false;
    }
}

async function test5_ViewClaims() {
    section('Test 5: View Claims (Adjuster)');
    testResults.total++;
    
    if (!adjusterToken) {
        error('No adjuster token (previous test failed)');
        testResults.failed++;
        return false;
    }
    
    try {
        const response = await axios.get(
            `${BACKEND_URL}/api/claims/adjuster/claims`,
            {
                headers: { 'Authorization': `Bearer ${adjusterToken}` }
            }
        );
        
        if (response.data.claims) {
            success(`Retrieved ${response.data.claims.length} claims`);
            info(`  Total in system: ${response.data.total}`);
            
            if (response.data.claims.length > 0) {
                info(`  Latest claim:`);
                const latest = response.data.claims[0];
                info(`    ID: ${latest.id}`);
                info(`    Type: ${latest.claimType}`);
                info(`    Policy: ${latest.policyNumber}`);
                info(`    Photos: ${latest.photoCount}`);
                info(`    Status: ${latest.status}`);
            }
            
            testResults.passed++;
            return true;
        } else {
            error('Failed to retrieve claims');
            testResults.failed++;
            return false;
        }
    } catch (err) {
        error(`View claims error: ${err.message}`);
        testResults.failed++;
        return false;
    }
}

async function test6_ViewClaimDetail() {
    section('Test 6: View Claim Detail (Adjuster)');
    testResults.total++;
    
    if (!adjusterToken || !testClaimId) {
        error('Missing token or claim ID');
        testResults.failed++;
        return false;
    }
    
    try {
        const response = await axios.get(
            `${BACKEND_URL}/api/claims/adjuster/claims/${testClaimId}`,
            {
                headers: { 'Authorization': `Bearer ${adjusterToken}` }
            }
        );
        
        if (response.data.id === testClaimId) {
            success('Claim details retrieved');
            info(`  Claim ID: ${response.data.id}`);
            info(`  Type: ${response.data.claimType}`);
            info(`  Description: ${response.data.description}`);
            info(`  Photos: ${response.data.photos.length}`);
            info(`  All verified: ${response.data.allPhotosVerified ? '✅ Yes' : '❌ No'}`);
            
            // Show verification details
            response.data.photos.forEach((photo, idx) => {
                info(`  Photo ${idx + 1}:`);
                info(`    Status: ${photo.verificationStatus}`);
                if (photo.verification) {
                    info(`    Verified: ${photo.verification.verified ? '✅' : '❌'}`);
                    info(`    Confidence: ${(photo.verification.confidence * 100).toFixed(1)}%`);
                    if (photo.verification.issues && photo.verification.issues.length > 0) {
                        info(`    Issues: ${photo.verification.issues.join(', ')}`);
                    }
                }
            });
            
            testResults.passed++;
            return true;
        } else {
            error('Failed to get claim details');
            testResults.failed++;
            return false;
        }
    } catch (err) {
        error(`Claim detail error: ${err.message}`);
        testResults.failed++;
        return false;
    }
}

async function test7_ApproveClaim() {
    section('Test 7: Approve Claim (Adjuster)');
    testResults.total++;
    
    if (!adjusterToken || !testClaimId) {
        error('Missing token or claim ID');
        testResults.failed++;
        return false;
    }
    
    try {
        const response = await axios.post(
            `${BACKEND_URL}/api/claims/adjuster/claims/${testClaimId}/review`,
            {
                decision: 'approved',
                approvedAmount: 1500,
                notes: 'All photos verified. Damage is legitimate. Approved for repair.'
            },
            {
                headers: { 
                    'Authorization': `Bearer ${adjusterToken}`,
                    'Content-Type': 'application/json'
                }
            }
        );
        
        if (response.data.success) {
            success('Claim approved');
            info(`  Claim ID: ${response.data.claimId}`);
            info(`  Status: ${response.data.status}`);
            info(`  Approved amount: $${response.data.adjusterReview.approvedAmount}`);
            info(`  Adjuster: ${response.data.adjusterReview.adjuster}`);
            
            testResults.passed++;
            return true;
        } else {
            error('Claim approval failed');
            testResults.failed++;
            return false;
        }
    } catch (err) {
        error(`Approval error: ${err.message}`);
        testResults.failed++;
        return false;
    }
}

async function test8_GetStats() {
    section('Test 8: Get Dashboard Stats');
    testResults.total++;
    
    if (!adjusterToken) {
        error('No adjuster token');
        testResults.failed++;
        return false;
    }
    
    try {
        const response = await axios.get(
            `${BACKEND_URL}/api/claims/adjuster/stats`,
            {
                headers: { 'Authorization': `Bearer ${adjusterToken}` }
            }
        );
        
        success('Dashboard stats retrieved');
        info(`  Total claims: ${response.data.total}`);
        info(`  Pending: ${response.data.pending}`);
        info(`  Approved: ${response.data.approved}`);
        info(`  Denied: ${response.data.denied}`);
        info(`  Needs info: ${response.data.needsInfo}`);
        info(`  Verification failed: ${response.data.verificationFailed}`);
        
        if (response.data.byType) {
            info(`  By type:`);
            Object.entries(response.data.byType).forEach(([type, count]) => {
                info(`    ${type}: ${count}`);
            });
        }
        
        testResults.passed++;
        return true;
    } catch (err) {
        error(`Stats error: ${err.message}`);
        testResults.failed++;
        return false;
    }
}

// Main test runner
async function runTests() {
    console.log();
    console.log('═'.repeat(60));
    log('cyan', '🧪', 'Insurance API Test Suite');
    console.log('═'.repeat(60));
    console.log();
    info(`Testing backend: ${BACKEND_URL}`);
    console.log();
    
    // Run all tests
    await test1_HealthCheck();
    await test2_SubmitClaim();
    await test3_CheckClaimStatus();
    await test4_AdjusterLogin();
    await test5_ViewClaims();
    await test6_ViewClaimDetail();
    await test7_ApproveClaim();
    await test8_GetStats();
    
    // Summary
    section('Test Summary');
    console.log();
    
    const passRate = (testResults.passed / testResults.total * 100).toFixed(1);
    
    if (testResults.passed === testResults.total) {
        success(`All ${testResults.total} tests passed! 🎉`);
    } else {
        log('yellow', '⚠️', `${testResults.passed}/${testResults.total} tests passed (${passRate}%)`);
    }
    
    console.log();
    console.log('═'.repeat(60));
    
    if (testResults.passed === testResults.total) {
        success('✅ READY FOR PRODUCTION DEPLOYMENT! 🚀');
    } else {
        error('❌ Fix failing tests before deploying');
    }
    
    console.log('═'.repeat(60));
    console.log();
    
    process.exit(testResults.failed > 0 ? 1 : 0);
}

// Run tests
runTests().catch(err => {
    error(`Test suite failed: ${err.message}`);
    console.error(err);
    process.exit(1);
});

