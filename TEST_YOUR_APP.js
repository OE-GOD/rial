#!/usr/bin/env node
/**
 * Complete App Health Check
 * Tests backend, database, AI, and all features
 */

const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');

// Colors for output
const colors = {
    reset: '\x1b[0m',
    bright: '\x1b[1m',
    green: '\x1b[32m',
    yellow: '\x1b[33m',
    red: '\x1b[31m',
    cyan: '\x1b[36m',
    blue: '\x1b[34m'
};

function log(message, color = 'reset') {
    console.log(`${colors[color]}${message}${colors.reset}`);
}

function section(title) {
    console.log('\n' + '='.repeat(70));
    log(title, 'bright');
    console.log('='.repeat(70) + '\n');
}

async function checkEndpoint(url, description) {
    return new Promise((resolve) => {
        const urlObj = new URL(url);
        const client = urlObj.protocol === 'https:' ? https : http;
        
        const options = {
            hostname: urlObj.hostname,
            port: urlObj.port || (urlObj.protocol === 'https:' ? 443 : 80),
            path: urlObj.pathname,
            method: 'GET',
            timeout: 5000
        };

        const req = client.request(options, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                if (res.statusCode >= 200 && res.statusCode < 300) {
                    log(`✅ ${description}`, 'green');
                    resolve({ success: true, status: res.statusCode, data });
                } else {
                    log(`⚠️  ${description} (Status: ${res.statusCode})`, 'yellow');
                    resolve({ success: false, status: res.statusCode, data });
                }
            });
        });

        req.on('error', (error) => {
            log(`❌ ${description} - ${error.message}`, 'red');
            resolve({ success: false, error: error.message });
        });

        req.on('timeout', () => {
            req.destroy();
            log(`❌ ${description} - Timeout`, 'red');
            resolve({ success: false, error: 'Timeout' });
        });

        req.end();
    });
}

async function checkBackendHealth() {
    section('1️⃣  CHECKING BACKEND SERVER');
    
    const baseUrl = 'http://localhost:3000';
    
    log('Testing backend endpoints...', 'cyan');
    
    const tests = [
        { url: `${baseUrl}/test`, desc: 'Health check endpoint' },
        { url: `${baseUrl}/store-status`, desc: 'Image store status' },
        { url: `${baseUrl}/blockchain/status`, desc: 'Blockchain status' },
        { url: `${baseUrl}/gpu/capabilities`, desc: 'GPU capabilities' },
    ];
    
    let passed = 0;
    let failed = 0;
    
    for (const test of tests) {
        const result = await checkEndpoint(test.url, test.desc);
        if (result.success) passed++;
        else failed++;
    }
    
    console.log();
    if (failed === tests.length) {
        log('❌ BACKEND NOT RUNNING!', 'red');
        log('\nTo start backend:', 'yellow');
        log('  cd backend', 'cyan');
        log('  npm start', 'cyan');
        return false;
    } else {
        log(`✅ Backend: ${passed}/${tests.length} endpoints working`, 'green');
        return true;
    }
}

async function checkDamageDetection() {
    section('2️⃣  CHECKING AI DAMAGE DETECTION');
    
    log('Checking AI damage detection agent...', 'cyan');
    
    const agentPath = path.join(__dirname, 'backend/ai/damage-detection-agent.js');
    
    if (fs.existsSync(agentPath)) {
        log('✅ Damage detection agent found', 'green');
        
        try {
            const damageAgent = require(agentPath);
            log('✅ Agent can be loaded', 'green');
            
            // Check if initialized
            if (typeof damageAgent.initialize === 'function') {
                log('✅ Initialize function exists', 'green');
            }
            
            if (typeof damageAgent.detectDamage === 'function') {
                log('✅ Detect damage function exists', 'green');
            }
            
            return true;
        } catch (error) {
            log(`❌ Error loading agent: ${error.message}`, 'red');
            return false;
        }
    } else {
        log('❌ Damage detection agent not found', 'red');
        log(`   Expected at: ${agentPath}`, 'yellow');
        return false;
    }
}

async function checkDamageEndpoints() {
    section('3️⃣  CHECKING DAMAGE DETECTION ENDPOINTS');
    
    log('Testing damage detection API...', 'cyan');
    
    const baseUrl = 'http://localhost:3000';
    
    const result = await checkEndpoint(
        `${baseUrl}/api/damage/status`,
        'Damage detection status endpoint'
    );
    
    if (result.success) {
        try {
            const data = JSON.parse(result.data);
            console.log();
            log('Damage Detection Service:', 'bright');
            log(`  Service: ${data.service || 'Unknown'}`, 'cyan');
            log(`  Status: ${data.status || 'Unknown'}`, 'cyan');
            if (data.models) {
                log(`  Models: ${data.models.length} loaded`, 'cyan');
            }
            return true;
        } catch (e) {
            log('⚠️  Could not parse response', 'yellow');
            return false;
        }
    } else {
        log('\n❌ Damage detection endpoints not available', 'red');
        log('The damage detection routes might not be in server.js', 'yellow');
        return false;
    }
}

async function checkiOSApp() {
    section('4️⃣  CHECKING iOS APP');
    
    log('Checking iOS project...', 'cyan');
    
    const iosProjectPath = path.join(__dirname, 'rial/rial.xcodeproj');
    
    if (fs.existsSync(iosProjectPath)) {
        log('✅ iOS project found', 'green');
        log(`   Path: ${iosProjectPath}`, 'cyan');
        
        // Check key source files
        const sourcesPath = path.join(__dirname, 'rial/rial/Sources');
        if (fs.existsSync(sourcesPath)) {
            const files = fs.readdirSync(sourcesPath);
            log(`✅ ${files.length} Swift source files found`, 'green');
            
            // Check for key files
            const keyFiles = [
                'ContentView.swift',
                'CameraView.swift',
                'GalleryView.swift',
                'PhotoDetailView.swift'
            ];
            
            let foundFiles = 0;
            for (const file of keyFiles) {
                if (files.includes(file)) {
                    foundFiles++;
                }
            }
            
            log(`✅ ${foundFiles}/${keyFiles.length} key view files found`, 'green');
        }
        
        return true;
    } else {
        log('❌ iOS project not found', 'red');
        return false;
    }
}

async function checkDatabase() {
    section('5️⃣  CHECKING DATABASE');
    
    log('Checking database configuration...', 'cyan');
    
    const envPath = path.join(__dirname, 'backend/.env');
    
    if (fs.existsSync(envPath)) {
        const envContent = fs.readFileSync(envPath, 'utf8');
        
        if (envContent.includes('DATABASE_URL') || envContent.includes('POSTGRES')) {
            log('✅ Database configuration found in .env', 'green');
        } else {
            log('⚠️  No database configuration in .env', 'yellow');
        }
        
        if (envContent.includes('OPENAI_API_KEY')) {
            log('✅ OpenAI API key configured', 'green');
        } else {
            log('⚠️  OpenAI API key not configured (needed for GPT-4 Vision)', 'yellow');
        }
        
        return true;
    } else {
        log('⚠️  No .env file found', 'yellow');
        log('   Create backend/.env for configuration', 'cyan');
        return false;
    }
}

async function checkFiles() {
    section('6️⃣  CHECKING PROJECT FILES');
    
    log('Checking key project files...', 'cyan');
    
    const files = [
        { path: 'backend/server.js', desc: 'Backend server' },
        { path: 'backend/ai/damage-detection-agent.js', desc: 'Damage detection AI' },
        { path: 'backend/package.json', desc: 'Backend dependencies' },
        { path: 'rial/rial.xcodeproj', desc: 'iOS project' },
        { path: 'README.md', desc: 'Documentation' }
    ];
    
    let found = 0;
    let missing = 0;
    
    for (const file of files) {
        const fullPath = path.join(__dirname, file.path);
        if (fs.existsSync(fullPath)) {
            log(`✅ ${file.desc}`, 'green');
            found++;
        } else {
            log(`❌ ${file.desc} - Missing`, 'red');
            missing++;
        }
    }
    
    console.log();
    log(`Files: ${found}/${files.length} found`, found === files.length ? 'green' : 'yellow');
    
    return missing === 0;
}

async function showSummary(results) {
    section('📊 TEST SUMMARY');
    
    const total = Object.values(results).length;
    const passed = Object.values(results).filter(v => v === true).length;
    const failed = total - passed;
    
    console.log();
    log('Component Status:', 'bright');
    console.log();
    
    for (const [component, status] of Object.entries(results)) {
        const icon = status ? '✅' : '❌';
        const color = status ? 'green' : 'red';
        log(`  ${icon} ${component}`, color);
    }
    
    console.log();
    console.log('─'.repeat(70));
    
    if (passed === total) {
        log('🎉 ALL SYSTEMS WORKING! Your app is ready!', 'green');
        console.log();
        log('Next steps:', 'bright');
        log('  1. Backend is running at http://localhost:3000', 'cyan');
        log('  2. Open iOS project: open rial/rial.xcodeproj', 'cyan');
        log('  3. Build and run on simulator (⌘R)', 'cyan');
        log('  4. Test photo capture and verification', 'cyan');
    } else {
        log(`⚠️  ${failed}/${total} components need attention`, 'yellow');
        console.log();
        showRecommendations(results);
    }
}

function showRecommendations(results) {
    log('Recommendations:', 'bright');
    console.log();
    
    if (!results.backend) {
        log('❗ Start Backend:', 'yellow');
        log('   cd backend', 'cyan');
        log('   npm install', 'cyan');
        log('   npm start', 'cyan');
        console.log();
    }
    
    if (!results.damageDetection) {
        log('❗ Restore Damage Detection:', 'yellow');
        log('   git restore backend/ai/damage-detection-agent.js', 'cyan');
        console.log();
    }
    
    if (!results.damageEndpoints) {
        log('❗ Damage Detection Endpoints:', 'yellow');
        log('   The damage detection routes need to be added to server.js', 'cyan');
        console.log();
    }
    
    if (!results.database) {
        log('❗ Configure Database:', 'yellow');
        log('   Create backend/.env with DATABASE_URL', 'cyan');
        console.log();
    }
    
    if (results.ios) {
        log('✅ iOS app ready to test:', 'green');
        log('   open rial/rial.xcodeproj', 'cyan');
        console.log();
    }
}

async function runAllTests() {
    console.clear();
    
    log('╔════════════════════════════════════════════════════════════════════╗', 'bright');
    log('║                                                                    ║', 'bright');
    log('║               🧪 RIAL LABS - APP HEALTH CHECK 🧪                  ║', 'bright');
    log('║                                                                    ║', 'bright');
    log('║         Complete test of backend, AI, database, and iOS           ║', 'bright');
    log('║                                                                    ║', 'bright');
    log('╚════════════════════════════════════════════════════════════════════╝', 'bright');
    
    const results = {};
    
    try {
        // Run all tests
        results.backend = await checkBackendHealth();
        await new Promise(r => setTimeout(r, 500));
        
        results.damageDetection = await checkDamageDetection();
        await new Promise(r => setTimeout(r, 500));
        
        results.damageEndpoints = await checkDamageEndpoints();
        await new Promise(r => setTimeout(r, 500));
        
        results.ios = await checkiOSApp();
        await new Promise(r => setTimeout(r, 500));
        
        results.database = await checkDatabase();
        await new Promise(r => setTimeout(r, 500));
        
        results.files = await checkFiles();
        
        // Show summary
        await showSummary(results);
        
    } catch (error) {
        section('❌ ERROR');
        log(`Test failed: ${error.message}`, 'red');
        console.error(error);
        process.exit(1);
    }
}

// Run tests
if (require.main === module) {
    runAllTests().catch(error => {
        console.error('Fatal error:', error);
        process.exit(1);
    });
}

module.exports = { runAllTests };


