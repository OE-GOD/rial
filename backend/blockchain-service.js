/**
 * Blockchain Service - Polygon Integration
 * 
 * Handles:
 * - Batch attestation submission to Polygon
 * - Smart contract interaction
 * - Gas optimization
 * - Transaction monitoring
 */

const { ethers } = require('ethers');
const crypto = require('crypto');

// Smart contract ABI (only functions we need)
const ATTESTATION_ABI = [
    "function submitBatch(bytes32[] attestationIds, bytes32[] merkleRoots, bytes32[] imageHashes, bytes32[] metadataHashes, address[] devicePublicKeys, address[] owners, bytes32 batchRoot) external",
    "function verifyAttestation(bytes32 attestationId) external view returns (bool exists, tuple(bytes32 merkleRoot, bytes32 imageHash, bytes32 metadataHash, address devicePublicKey, uint256 timestamp, uint256 batchId, bool revealed) attestation, bool isRevealed, string imageURI, string metadataURI)",
    "function revealImage(bytes32 attestationId, string imageURI, string metadataURI) external",
    "function isVerified(bytes32 attestationId) external view returns (bool)",
    "event AttestationCreated(bytes32 indexed attestationId, address indexed owner, uint256 indexed batchId, bytes32 merkleRoot, uint256 timestamp)",
    "event BatchSubmitted(uint256 indexed batchId, uint256 count, bytes32 batchRoot, address submitter)"
];

class BlockchainService {
    constructor() {
        this.provider = null;
        this.wallet = null;
        this.contract = null;
        this.isInitialized = false;
        this.pendingAttestations = [];
    }

    /**
     * Initialize connection to Polygon
     */
    async initialize(rpcUrl, privateKey, contractAddress) {
        try {
            console.log('🔗 Initializing Polygon blockchain connection...');
            
            // Connect to Polygon
            this.provider = new ethers.JsonRpcProvider(rpcUrl);
            
            // Test connection
            const network = await this.provider.getNetwork();
            console.log(`   ✅ Connected to network: ${network.name} (chainId: ${network.chainId})`);
            
            // Create wallet
            this.wallet = new ethers.Wallet(privateKey, this.provider);
            console.log(`   ✅ Wallet address: ${this.wallet.address}`);
            
            // Get wallet balance
            const balance = await this.provider.getBalance(this.wallet.address);
            console.log(`   💰 Balance: ${ethers.formatEther(balance)} MATIC`);
            
            if (balance === 0n) {
                console.log('   ⚠️ WARNING: Wallet has no MATIC! Fund it to submit batches.');
            }
            
            // Connect to smart contract
            if (contractAddress && contractAddress !== '') {
                this.contract = new ethers.Contract(contractAddress, ATTESTATION_ABI, this.wallet);
                console.log(`   ✅ Contract connected: ${contractAddress}`);
            } else {
                console.log('   ⚠️ No contract address provided. Deploy contract first.');
            }
            
            this.isInitialized = true;
            console.log('✅ Blockchain service initialized successfully!\n');
            
            return true;
        } catch (error) {
            console.error('❌ Failed to initialize blockchain service:', error.message);
            this.isInitialized = false;
            return false;
        }
    }

    /**
     * Add attestation to pending batch
     */
    addToBatch(attestationData) {
        if (!this.isInitialized) {
            console.log('⚠️ Blockchain service not initialized. Attestation queued offline.');
        }
        
        this.pendingAttestations.push({
            ...attestationData,
            queuedAt: new Date().toISOString()
        });
        
        console.log(`📦 Added to batch. Pending: ${this.pendingAttestations.length}`);
    }

    /**
     * Submit batch to Polygon smart contract
     */
    async submitBatch() {
        if (!this.isInitialized || !this.contract) {
            console.log('❌ Cannot submit batch: Blockchain service not initialized or no contract');
            return { success: false, error: 'Not initialized' };
        }

        if (this.pendingAttestations.length === 0) {
            console.log('ℹ️ No pending attestations to submit');
            return { success: true, count: 0 };
        }

        try {
            console.log(`\n🚀 Submitting batch of ${this.pendingAttestations.length} attestations...`);
            
            // Prepare batch data
            const attestationIds = [];
            const merkleRoots = [];
            const imageHashes = [];
            const metadataHashes = [];
            const devicePublicKeys = [];
            const owners = [];
            
            for (const att of this.pendingAttestations) {
                // Generate attestation ID
                const attestationId = this.generateAttestationId(att.imageHash, att.timestamp);
                attestationIds.push(attestationId);
                
                // Add data
                merkleRoots.push(att.merkleRoot);
                imageHashes.push(att.imageHash);
                metadataHashes.push(att.metadataHash);
                devicePublicKeys.push(att.devicePublicKey);
                owners.push(att.owner);
            }
            
            // Compute batch root (Merkle root of all attestation IDs)
            const batchRoot = this.computeBatchRoot(attestationIds);
            
            console.log(`   📋 Batch Root: ${batchRoot}`);
            console.log(`   📊 Count: ${attestationIds.length}`);
            
            // Estimate gas
            const gasEstimate = await this.contract.submitBatch.estimateGas(
                attestationIds,
                merkleRoots,
                imageHashes,
                metadataHashes,
                devicePublicKeys,
                owners,
                batchRoot
            );
            
            const gasPrice = await this.provider.getFeeData();
            const estimatedCost = gasEstimate * (gasPrice.gasPrice || 0n);
            
            console.log(`   ⛽ Estimated gas: ${gasEstimate.toString()}`);
            console.log(`   💰 Estimated cost: ${ethers.formatEther(estimatedCost)} MATIC`);
            
            // Submit transaction
            const tx = await this.contract.submitBatch(
                attestationIds,
                merkleRoots,
                imageHashes,
                metadataHashes,
                devicePublicKeys,
                owners,
                batchRoot,
                {
                    gasLimit: gasEstimate * 120n / 100n // 20% buffer
                }
            );
            
            console.log(`   📤 Transaction sent: ${tx.hash}`);
            console.log(`   ⏳ Waiting for confirmation...`);
            
            // Wait for confirmation
            const receipt = await tx.wait();
            
            if (receipt.status === 1) {
                console.log(`   ✅ Batch submitted successfully!`);
                console.log(`   🔗 Block: ${receipt.blockNumber}`);
                console.log(`   💎 Gas used: ${receipt.gasUsed.toString()}`);
                console.log(`   💰 Actual cost: ${ethers.formatEther(receipt.gasUsed * receipt.gasPrice)} MATIC`);
                
                // Parse events
                const events = receipt.logs
                    .filter(log => log.address.toLowerCase() === this.contract.target.toLowerCase())
                    .map(log => {
                        try {
                            return this.contract.interface.parseLog(log);
                        } catch {
                            return null;
                        }
                    })
                    .filter(e => e !== null);
                
                const batchEvent = events.find(e => e.name === 'BatchSubmitted');
                if (batchEvent) {
                    console.log(`   📦 Batch ID: ${batchEvent.args.batchId.toString()}`);
                }
                
                // Clear pending attestations
                const submittedCount = this.pendingAttestations.length;
                this.pendingAttestations = [];
                
                return {
                    success: true,
                    count: submittedCount,
                    txHash: tx.hash,
                    blockNumber: receipt.blockNumber,
                    gasUsed: receipt.gasUsed.toString(),
                    cost: ethers.formatEther(receipt.gasUsed * receipt.gasPrice),
                    attestationIds: attestationIds.map(id => ethers.hexlify(id))
                };
            } else {
                console.log(`   ❌ Transaction failed`);
                return { success: false, error: 'Transaction reverted' };
            }
            
        } catch (error) {
            console.error('❌ Batch submission failed:', error.message);
            if (error.data) {
                console.error('   Error data:', error.data);
            }
            return { success: false, error: error.message };
        }
    }

    /**
     * Verify attestation on blockchain
     */
    async verifyOnChain(attestationId) {
        if (!this.isInitialized || !this.contract) {
            return { exists: false, error: 'Not initialized' };
        }

        try {
            const result = await this.contract.verifyAttestation(attestationId);
            
            return {
                exists: result.exists,
                attestation: result.exists ? {
                    merkleRoot: result.attestation.merkleRoot,
                    imageHash: result.attestation.imageHash,
                    metadataHash: result.attestation.metadataHash,
                    devicePublicKey: result.attestation.devicePublicKey,
                    timestamp: Number(result.attestation.timestamp),
                    batchId: Number(result.attestation.batchId),
                    revealed: result.attestation.revealed
                } : null,
                isRevealed: result.isRevealed,
                imageURI: result.imageURI,
                metadataURI: result.metadataURI
            };
        } catch (error) {
            console.error('Error verifying on-chain:', error.message);
            return { exists: false, error: error.message };
        }
    }

    /**
     * Reveal image publicly
     */
    async revealImage(attestationId, imageURI, metadataURI) {
        if (!this.isInitialized || !this.contract) {
            return { success: false, error: 'Not initialized' };
        }

        try {
            const tx = await this.contract.revealImage(attestationId, imageURI, metadataURI);
            const receipt = await tx.wait();
            
            return {
                success: receipt.status === 1,
                txHash: tx.hash,
                blockNumber: receipt.blockNumber
            };
        } catch (error) {
            console.error('Error revealing image:', error.message);
            return { success: false, error: error.message };
        }
    }

    /**
     * Helper: Generate attestation ID
     */
    generateAttestationId(imageHash, timestamp) {
        const imageHashBytes = ethers.getBytes(imageHash);
        const timestampBytes = ethers.toBeArray(BigInt(timestamp));
        const combined = ethers.concat([imageHashBytes, timestampBytes]);
        return ethers.keccak256(combined);
    }

    /**
     * Helper: Compute batch root (Merkle root of attestation IDs)
     */
    computeBatchRoot(attestationIds) {
        if (attestationIds.length === 0) {
            return ethers.ZeroHash;
        }
        
        // Simple hash of all IDs concatenated
        // In production, use proper Merkle tree
        const combined = ethers.concat(attestationIds);
        return ethers.keccak256(combined);
    }

    /**
     * Helper: Convert public key to Ethereum address
     */
    publicKeyToAddress(publicKeyBase64) {
        try {
            const publicKeyBuffer = Buffer.from(publicKeyBase64, 'base64');
            
            // For P-256 SPKI format (91 bytes)
            if (publicKeyBuffer.length === 91) {
                // Extract raw public key (skip 26-byte header)
                const rawPublicKey = publicKeyBuffer.slice(26);
                
                // Hash and take last 20 bytes for address
                const hash = crypto.createHash('sha256').update(rawPublicKey).digest();
                const address = '0x' + hash.slice(-20).toString('hex');
                
                return ethers.getAddress(address); // Checksum address
            }
            
            // Fallback: hash the entire public key
            const hash = crypto.createHash('sha256').update(publicKeyBuffer).digest();
            const address = '0x' + hash.slice(-20).toString('hex');
            return ethers.getAddress(address);
            
        } catch (error) {
            console.error('Error converting public key to address:', error.message);
            return ethers.ZeroAddress;
        }
    }

    /**
     * Get pending batch status
     */
    getBatchStatus() {
        return {
            pending: this.pendingAttestations.length,
            attestations: this.pendingAttestations.map(att => ({
                imageHash: att.imageHash,
                timestamp: att.timestamp,
                queuedAt: att.queuedAt
            }))
        };
    }
}

module.exports = new BlockchainService();

