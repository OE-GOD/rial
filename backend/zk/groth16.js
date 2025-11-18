const fs = require('fs');
const path = require('path');
const https = require('https');
const { spawn } = require('child_process');
const crypto = require('crypto');
const { groth16 } = require('snarkjs');
const ZKIMGHalo2Wrapper = require('../zk-img-halo2-wrapper');

const BACKEND_ROOT = path.join(__dirname, '..');
const CIRCUITS_DIR = path.join(BACKEND_ROOT, 'circuits');
const ARTIFACTS_ROOT = path.join(__dirname, 'artifacts');
const PROOFS_ROOT = path.join(__dirname, 'proofs');
// For testing, use a smaller PTAU. For production, use a larger one
const PTAU_URL = 'https://storage.googleapis.com/zkevm/ptau/powersOfTau28_hez_final_12.ptau';
const PTAU_PATH = path.join(__dirname, 'pot10_final.ptau');

const compileLocks = new Map();
const verificationKeyCache = new Map();

const CIRCUIT_CONFIG = {
    crop: {
        filename: 'crop.circom',
        component: (params) => {
            const { hOrig, wOrig, hNew, wNew, hStart, wStart } = params;
            return `Crop(${hOrig}, ${wOrig}, ${hNew}, ${wNew}, ${hStart}, ${wStart})`;
        },
        requiredParams: ['hOrig', 'wOrig', 'hNew', 'wNew', 'hStart', 'wStart']
    },
    resize: {
        filename: 'resize.circom',
        component: (params) => {
            const { hOrig, wOrig, hNew, wNew } = params;
            return `Resize(${hOrig}, ${wOrig}, ${hNew}, ${wNew})`;
        },
        requiredParams: ['hOrig', 'wOrig', 'hNew', 'wNew']
    },
    grayscale: {
        filename: 'grayscale.circom',
        component: (params) => {
            const { h, w } = params;
            return `Grayscale(${h}, ${w})`;
        },
        requiredParams: ['h', 'w']
    }
};

function ensureDir(dir) {
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }
}

async function ensurePowersOfTau() {
    if (fs.existsSync(PTAU_PATH)) {
        const stats = fs.statSync(PTAU_PATH);
        if (stats.size > 0) {
            return PTAU_PATH;
        }
    }

    // For now, check if we already generated a test PTAU
    // In production, you would download a proper PTAU file
    console.log(`ℹ️  Using test Powers of Tau file at ${PTAU_PATH}`);
    console.log(`   For production, download a proper PTAU from https://github.com/iden3/snarkjs#7-prepare-phase-2`);
    
    if (!fs.existsSync(PTAU_PATH)) {
        throw new Error(`Powers of Tau file not found at ${PTAU_PATH}. Please generate it first.`);
    }

    return PTAU_PATH;
}

function paramsKey(params) {
    return Object.keys(params)
        .sort()
        .map((key) => `${key}-${params[key]}`)
        .join('_');
}

function sanitizeKey(key) {
    return key.replace(/[^a-zA-Z0-9_=.-]/g, '_');
}

async function runCommand(command, args, options = {}) {
    return new Promise((resolve, reject) => {
        const proc = spawn(command, args, {
            stdio: options.stdio || 'pipe',
            cwd: options.cwd || BACKEND_ROOT,
            env: options.env || process.env
        });

        let stdout = '';
        let stderr = '';
        
        if (proc.stdout) {
            proc.stdout.on('data', (data) => {
                stdout += data.toString();
            });
        }
        
        if (proc.stderr) {
            proc.stderr.on('data', (data) => {
                stderr += data.toString();
            });
        }

        proc.on('error', reject);
        proc.on('exit', (code) => {
            if (code === 0) {
                resolve({ stdout, stderr });
            } else {
                const error = new Error(`${command} ${args.join(' ')} exited with code ${code}\nStderr: ${stderr}`);
                error.stdout = stdout;
                error.stderr = stderr;
                reject(error);
            }
        });
    });
}

function buildMainSource(config, params, targetDir) {
    const templatePath = path.join(CIRCUITS_DIR, config.filename);
    const relativeTemplate = path.relative(targetDir, templatePath).replace(/\\/g, '/');
    const component = config.component(params);

    return `include "${relativeTemplate}";

component main = ${component};
`;
}

async function ensureArtifacts(circuitType, params) {
    const config = CIRCUIT_CONFIG[circuitType];
    if (!config) {
        throw new Error(`Unknown circuit type: ${circuitType}`);
    }

    for (const param of config.requiredParams) {
        if (params[param] === undefined) {
            throw new Error(`Missing required parameter "${param}" for circuit "${circuitType}"`);
        }
    }

    const key = `${circuitType}_${sanitizeKey(paramsKey(params))}`;
    const circuitDir = path.join(ARTIFACTS_ROOT, circuitType, key);
    ensureDir(circuitDir);

    const verificationKeyPath = path.join(circuitDir, 'verification_key.json');
    const wasmPath = path.join(circuitDir, 'circuit.wasm');
    const zkeyPath = path.join(circuitDir, 'circuit_final.zkey');
    const r1csPath = path.join(circuitDir, 'circuit.r1cs');

    if (fs.existsSync(verificationKeyPath) && fs.existsSync(wasmPath) && fs.existsSync(zkeyPath)) {
        return { circuitDir, wasmPath, zkeyPath, verificationKeyPath, r1csPath };
    }

    if (!compileLocks.has(key)) {
        const promise = (async () => {
            await ensurePowersOfTau();

            const mainPath = path.join(circuitDir, 'main.circom');
            const source = buildMainSource(config, params, circuitDir);
            fs.writeFileSync(mainPath, source, 'utf8');

            console.log(`🛠️  Compiling ${circuitType} circuit (${key})`);
            
            // Try to use local circom2 first, then fall back to npx circom
            let circomPath = path.join(BACKEND_ROOT, 'circom2');
            let circomCommand = fs.existsSync(circomPath) ? circomPath : 'npx';
            let circomArgs = fs.existsSync(circomPath) 
                ? [mainPath, '--r1cs', '--wasm', '--sym', '-o', circuitDir]
                : ['circom', mainPath, '--r1cs', '--wasm', '--sym', '-o', circuitDir];
            
            await runCommand(circomCommand, circomArgs);

            const generatedR1cs = path.join(circuitDir, 'main.r1cs');
            const generatedWasmInSubdir = path.join(circuitDir, 'main_js', 'main.wasm');
            const generatedWasmDirect = path.join(circuitDir, 'main.wasm');
            
            // Check both possible locations (old circom vs new circom)
            let wasmSource = null;
            if (fs.existsSync(generatedWasmInSubdir)) {
                wasmSource = generatedWasmInSubdir;
            } else if (fs.existsSync(generatedWasmDirect)) {
                wasmSource = generatedWasmDirect;
            }

            if (!fs.existsSync(generatedR1cs) || !wasmSource) {
                throw new Error('Circom compilation failed to produce artifacts');
            }

            fs.renameSync(generatedR1cs, r1csPath);
            ensureDir(path.dirname(wasmPath));
            fs.renameSync(wasmSource, wasmPath);

            // Remove autogenerated directory if empty
            const mainJsDir = path.join(circuitDir, 'main_js');
            if (fs.existsSync(mainJsDir)) {
                fs.rmSync(mainJsDir, { recursive: true, force: true });
            }

            console.log(`⚙️  Running Groth16 setup for ${circuitType} (${key})`);
            await runCommand('npx', [
                'snarkjs',
                'groth16',
                'setup',
                r1csPath,
                PTAU_PATH,
                zkeyPath
            ]);

            await runCommand('npx', [
                'snarkjs',
                'zkey',
                'export',
                'verificationkey',
                zkeyPath,
                verificationKeyPath
            ]);

            fs.writeFileSync(
                path.join(circuitDir, 'params.json'),
                JSON.stringify({ type: circuitType, params }, null, 2)
            );

            // Cache verification key for fast lookup
            const vKey = JSON.parse(fs.readFileSync(verificationKeyPath, 'utf8'));
            verificationKeyCache.set(verificationKeyPath, vKey);

            console.log(`✅ Circuit ${circuitType} (${key}) ready`);

            return { circuitDir, wasmPath, zkeyPath, verificationKeyPath, r1csPath };
        })()
            .finally(() => {
                compileLocks.delete(key);
            });

        compileLocks.set(key, promise);
    }

    return compileLocks.get(key);
}

function loadVerificationKey(verificationKeyPath) {
    if (verificationKeyCache.has(verificationKeyPath)) {
        return verificationKeyCache.get(verificationKeyPath);
    }

    const data = JSON.parse(fs.readFileSync(verificationKeyPath, 'utf8'));
    verificationKeyCache.set(verificationKeyPath, data);
    return data;
}

function saveProofToDisk(circuitType, params, proof, publicSignals) {
    ensureDir(PROOFS_ROOT);
    const circuitDir = path.join(PROOFS_ROOT, circuitType);
    ensureDir(circuitDir);

    const timestamp = Date.now();
    const random = crypto.randomBytes(4).toString('hex');
    const key = sanitizeKey(paramsKey(params));
    const baseName = `${timestamp}_${random}_${key}`;
    const proofPath = path.join(circuitDir, `${baseName}_proof.json`);
    const publicSignalsPath = path.join(circuitDir, `${baseName}_public.json`);

    fs.writeFileSync(proofPath, JSON.stringify(proof, null, 2));
    fs.writeFileSync(publicSignalsPath, JSON.stringify(publicSignals, null, 2));

    return { proofPath, publicSignalsPath };
}

async function generateProof(circuitType, params, input, options = {}) {
    // Use Halo2 if requested, otherwise fallback to snarkjs
    if (options.useHalo2 || process.env.USE_HALO2 === 'true') {
        return await generateHalo2Proof(circuitType, params, input, options);
    }

    // Original snarkjs implementation
    const artifacts = await ensureArtifacts(circuitType, params);

    console.log(`🧮 Generating snarkjs proof for ${circuitType}`);
    const { proof, publicSignals } = await groth16.fullProve(
        input,
        artifacts.wasmPath,
        artifacts.zkeyPath
    );

    let saved = null;
    if (options.persist !== false) {
        saved = saveProofToDisk(circuitType, params, proof, publicSignals);
    }

    return {
        proof,
        publicSignals,
        artifacts,
        saved,
        provingSystem: 'snarkjs'
    };
}

// Halo2 proof generation
async function generateHalo2Proof(circuitType, params, input, options = {}) {
    console.log(`🚀 Generating Halo2 proof for ${circuitType}`);

    const halo2 = new ZKIMGHalo2Wrapper();

    // Convert input format for Halo2
    // This is a simplified conversion - real implementation would be more sophisticated
    let imageBuffer = Buffer.alloc(0);
    let transformations = [];

    if (input && input.orig) {
        // Convert Circom input format to image buffer
        // This is a placeholder - real implementation would properly decode
        imageBuffer = Buffer.from(JSON.stringify(input.orig));
    }

    if (circuitType === 'crop' && params.length >= 4) {
        transformations.push({
            type: 'Crop',
            x: params[4] || 0, // hStartNew
            y: params[5] || 0, // wStartNew
            width: params[2], // hNew
            height: params[3]  // wNew
        });
    }

    const halo2Proof = await halo2.generateProof(imageBuffer, transformations);

    // Convert Halo2 format to expected output format
    const result = {
        proof: halo2Proof.proof_bytes,
        publicSignals: halo2Proof.public_inputs,
        artifacts: {
            verificationKeyPath: null, // Halo2 handles this differently
            provingSystem: 'halo2'
        },
        saved: null, // Halo2 handles persistence internally
        provingSystem: 'halo2',
        performance: halo2Proof.performance,
        inputHash: halo2Proof.input_hash,
        outputHash: halo2Proof.output_hash
    };

    console.log(`✅ Halo2 proof generated in ${halo2Proof.performance.generation_time_ms.toFixed(1)}ms`);
    console.log(`📊 Proof size: ${halo2Proof.performance.proof_size_kb.toFixed(1)}KB`);

    return result;
}

async function verifyProof(circuitType, params, proof, publicSignals, options = {}) {
    // Use Halo2 verification if proof was generated with Halo2
    if (options.useHalo2 || options.provingSystem === 'halo2') {
        return await verifyHalo2Proof(circuitType, params, proof, publicSignals);
    }

    // Original snarkjs verification
    const artifacts = await ensureArtifacts(circuitType, params);
    const vKey = loadVerificationKey(artifacts.verificationKeyPath);
    const valid = await groth16.verify(vKey, publicSignals, proof);

    return {
        valid,
        verificationKeyPath: artifacts.verificationKeyPath,
        provingSystem: 'snarkjs'
    };
}

// Halo2 proof verification
async function verifyHalo2Proof(circuitType, params, proof, publicSignals) {
    console.log(`🔍 Verifying Halo2 proof for ${circuitType}`);

    const halo2 = new ZKIMGHalo2Wrapper();
    const valid = await halo2.verifyProof({ proof_bytes: proof, public_inputs: publicSignals }, publicSignals);

    return {
        valid,
        verificationKeyPath: null, // Halo2 handles this differently
        provingSystem: 'halo2'
    };
}

module.exports = {
    ensureArtifacts,
    generateProof,
    verifyProof,
    ensurePowersOfTau,
    constants: {
        PTAU_PATH,
        PTAU_URL,
        ARTIFACTS_ROOT,
        PROOFS_ROOT,
        CIRCUITS_DIR
    }
};

