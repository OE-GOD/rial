/**
 * Blockchain Attestation Service
 *
 * Supports multiple chains:
 * - Base (Coinbase L2) - RECOMMENDED: ~$0.001 per attestation
 * - Base Sepolia (testnet) - FREE for testing
 * - Polygon - Low cost alternative
 *
 * Features:
 * - Single & batch attestations
 * - On-chain verification
 * - Block explorer links
 */

const { ethers } = require('ethers');
const crypto = require('crypto');

// Contract ABI (matches PhotoAttestation.sol)
const CONTRACT_ABI = [
    "function attest(bytes32 imageHash, bytes32 merkleRoot, bytes32 metadataHash, uint32 flags) external returns (bytes32)",
    "function attestBatch(bytes32[] imageHashes, bytes32[] merkleRoots, bytes32[] metadataHashes, uint32[] flags) external returns (bytes32)",
    "function isAttested(bytes32 imageHash) external view returns (bool exists, bytes32 attestationId)",
    "function getAttestation(bytes32 attestationId) external view returns (tuple(bytes32 imageHash, bytes32 merkleRoot, bytes32 metadataHash, address attester, uint64 timestamp, uint32 flags))",
    "function verify(bytes32 imageHash, bytes32 merkleRoot) external view returns (bool valid, tuple(bytes32 imageHash, bytes32 merkleRoot, bytes32 metadataHash, address attester, uint64 timestamp, uint32 flags))",
    "function totalAttestations() external view returns (uint256)",
    "event AttestationCreated(bytes32 indexed attestationId, bytes32 indexed imageHash, address indexed attester, uint64 timestamp)"
];

// Chain configurations
const CHAINS = {
    'base': {
        name: 'Base',
        chainId: 8453,
        rpcUrl: 'https://mainnet.base.org',
        explorer: 'https://basescan.org',
        currency: 'ETH',
        isTestnet: false
    },
    'base-sepolia': {
        name: 'Base Sepolia',
        chainId: 84532,
        rpcUrl: 'https://sepolia.base.org',
        explorer: 'https://sepolia.basescan.org',
        currency: 'ETH',
        isTestnet: true
    },
    'polygon': {
        name: 'Polygon',
        chainId: 137,
        rpcUrl: 'https://polygon-rpc.com',
        explorer: 'https://polygonscan.com',
        currency: 'MATIC',
        isTestnet: false
    },
    'polygon-amoy': {
        name: 'Polygon Amoy',
        chainId: 80002,
        rpcUrl: 'https://rpc-amoy.polygon.technology',
        explorer: 'https://amoy.polygonscan.com',
        currency: 'MATIC',
        isTestnet: true
    }
};

class BlockchainAttestationService {
    constructor() {
        this.provider = null;
        this.wallet = null;
        this.contract = null;
        this.chain = null;
        this.isInitialized = false;
        this.pendingBatch = [];
        this.batchSize = 10; // Submit batch every 10 attestations
        this.attestationCache = new Map(); // Cache recent attestations
    }

    /**
     * Initialize the blockchain connection
     */
    async initialize(options = {}) {
        const {
            chain = 'base-sepolia', // Default to testnet
            privateKey = process.env.BLOCKCHAIN_PRIVATE_KEY,
            contractAddress = process.env.ATTESTATION_CONTRACT_ADDRESS,
            rpcUrl = null
        } = options;

        try {
            // Get chain config
            this.chain = CHAINS[chain];
            if (!this.chain) {
                throw new Error(`Unknown chain: ${chain}. Available: ${Object.keys(CHAINS).join(', ')}`);
            }

            console.log(`🔗 Connecting to ${this.chain.name}...`);

            // Connect to RPC
            const url = rpcUrl || this.chain.rpcUrl;
            this.provider = new ethers.JsonRpcProvider(url);

            // Verify connection
            const network = await this.provider.getNetwork();
            console.log(`   ✅ Connected to chain ID: ${network.chainId}`);

            // Create wallet if private key provided
            if (privateKey) {
                this.wallet = new ethers.Wallet(privateKey, this.provider);
                const balance = await this.provider.getBalance(this.wallet.address);
                console.log(`   💰 Wallet: ${this.wallet.address}`);
                console.log(`   💎 Balance: ${ethers.formatEther(balance)} ${this.chain.currency}`);

                // Connect to contract if address provided
                if (contractAddress) {
                    this.contract = new ethers.Contract(contractAddress, CONTRACT_ABI, this.wallet);
                    console.log(`   📜 Contract: ${contractAddress}`);

                    // Get total attestations
                    try {
                        const total = await this.contract.totalAttestations();
                        console.log(`   📊 Total attestations: ${total.toString()}`);
                    } catch (e) {
                        console.log(`   ⚠️ Could not read contract (may not be deployed)`);
                    }
                }
            } else {
                console.log(`   ⚠️ No private key - read-only mode`);
            }

            this.isInitialized = true;
            console.log(`✅ Blockchain service ready (${this.chain.name})\n`);

            return { success: true, chain: this.chain.name };

        } catch (error) {
            console.error(`❌ Blockchain init failed: ${error.message}`);
            this.isInitialized = false;
            return { success: false, error: error.message };
        }
    }

    /**
     * Create an attestation on-chain
     */
    async createAttestation(data) {
        const {
            imageHash,
            merkleRoot,
            metadataHash,
            signatureType = 'webcrypto',
            livenessScore = 0,
            aiScore = 0
        } = data;

        // Build flags
        let flags = 0;
        if (signatureType === 'webauthn') flags |= 1;
        if (livenessScore >= 70) flags |= 2;
        if (aiScore >= 60) flags |= 4;

        // If no contract, create off-chain attestation
        if (!this.contract) {
            const attestationId = this._generateAttestationId(imageHash);
            const attestation = {
                id: attestationId,
                imageHash,
                merkleRoot,
                metadataHash,
                flags,
                timestamp: Date.now(),
                chain: this.chain?.name || 'offline',
                onChain: false,
                pending: true
            };

            // Add to pending batch
            this.pendingBatch.push(attestation);
            this.attestationCache.set(imageHash, attestation);

            console.log(`📝 Attestation queued (offline): ${attestationId.substring(0, 16)}...`);

            return {
                success: true,
                attestationId,
                onChain: false,
                pending: true,
                batchPosition: this.pendingBatch.length
            };
        }

        try {
            console.log(`⛓️ Creating on-chain attestation...`);

            // Format hashes as bytes32
            const imageHashBytes = this._toBytes32(imageHash);
            const merkleRootBytes = this._toBytes32(merkleRoot);
            const metadataHashBytes = this._toBytes32(metadataHash);

            // Estimate gas
            const gasEstimate = await this.contract.attest.estimateGas(
                imageHashBytes,
                merkleRootBytes,
                metadataHashBytes,
                flags
            );

            console.log(`   ⛽ Gas estimate: ${gasEstimate.toString()}`);

            // Send transaction
            const tx = await this.contract.attest(
                imageHashBytes,
                merkleRootBytes,
                metadataHashBytes,
                flags,
                { gasLimit: gasEstimate * 120n / 100n }
            );

            console.log(`   📤 TX: ${tx.hash}`);

            // Wait for confirmation
            const receipt = await tx.wait();

            // Parse attestation ID from event
            let attestationId = null;
            for (const log of receipt.logs) {
                try {
                    const parsed = this.contract.interface.parseLog(log);
                    if (parsed && parsed.name === 'AttestationCreated') {
                        attestationId = parsed.args.attestationId;
                        break;
                    }
                } catch (e) {}
            }

            const result = {
                success: true,
                attestationId: attestationId || tx.hash,
                txHash: tx.hash,
                blockNumber: receipt.blockNumber,
                gasUsed: receipt.gasUsed.toString(),
                chain: this.chain.name,
                explorer: `${this.chain.explorer}/tx/${tx.hash}`,
                onChain: true
            };

            // Cache it
            this.attestationCache.set(imageHash, {
                ...result,
                imageHash,
                merkleRoot,
                timestamp: Date.now()
            });

            console.log(`   ✅ Confirmed in block ${receipt.blockNumber}`);
            console.log(`   🔗 ${result.explorer}`);

            return result;

        } catch (error) {
            console.error(`❌ On-chain attestation failed: ${error.message}`);

            // Fall back to pending
            const attestationId = this._generateAttestationId(imageHash);
            this.pendingBatch.push({
                id: attestationId,
                imageHash,
                merkleRoot,
                metadataHash,
                flags,
                timestamp: Date.now(),
                error: error.message
            });

            return {
                success: false,
                error: error.message,
                attestationId,
                pending: true
            };
        }
    }

    /**
     * Verify an image on-chain
     */
    async verifyOnChain(imageHash, expectedMerkleRoot = null) {
        if (!this.isInitialized) {
            // Check cache
            if (this.attestationCache.has(imageHash)) {
                const cached = this.attestationCache.get(imageHash);
                return {
                    verified: true,
                    source: 'cache',
                    attestation: cached
                };
            }
            return { verified: false, error: 'Not initialized' };
        }

        try {
            const imageHashBytes = this._toBytes32(imageHash);

            // Check if attested
            const [exists, attestationId] = await this.contract.isAttested(imageHashBytes);

            if (!exists) {
                return {
                    verified: false,
                    exists: false,
                    message: 'No on-chain attestation found'
                };
            }

            // Get full attestation
            const attestation = await this.contract.getAttestation(attestationId);

            // Verify merkle root if provided
            let merkleMatch = true;
            if (expectedMerkleRoot) {
                merkleMatch = attestation.merkleRoot.toLowerCase() ===
                              this._toBytes32(expectedMerkleRoot).toLowerCase();
            }

            // Decode flags
            const flags = Number(attestation.flags);

            return {
                verified: true,
                exists: true,
                merkleMatch,
                attestation: {
                    id: attestationId,
                    imageHash: attestation.imageHash,
                    merkleRoot: attestation.merkleRoot,
                    metadataHash: attestation.metadataHash,
                    attester: attestation.attester,
                    timestamp: Number(attestation.timestamp) * 1000,
                    flags: {
                        webauthn: (flags & 1) !== 0,
                        liveness: (flags & 2) !== 0,
                        aiVerified: (flags & 4) !== 0
                    }
                },
                chain: this.chain.name,
                explorer: `${this.chain.explorer}/address/${this.contract.target}`
            };

        } catch (error) {
            console.error(`Verification error: ${error.message}`);
            return { verified: false, error: error.message };
        }
    }

    /**
     * Submit pending batch to blockchain
     */
    async submitBatch() {
        if (this.pendingBatch.length === 0) {
            return { success: true, count: 0, message: 'No pending attestations' };
        }

        if (!this.contract) {
            return {
                success: false,
                error: 'No contract connected',
                pending: this.pendingBatch.length
            };
        }

        try {
            console.log(`📦 Submitting batch of ${this.pendingBatch.length} attestations...`);

            const imageHashes = [];
            const merkleRoots = [];
            const metadataHashes = [];
            const flags = [];

            for (const att of this.pendingBatch) {
                imageHashes.push(this._toBytes32(att.imageHash));
                merkleRoots.push(this._toBytes32(att.merkleRoot));
                metadataHashes.push(this._toBytes32(att.metadataHash));
                flags.push(att.flags);
            }

            const tx = await this.contract.attestBatch(
                imageHashes,
                merkleRoots,
                metadataHashes,
                flags
            );

            console.log(`   📤 Batch TX: ${tx.hash}`);

            const receipt = await tx.wait();

            const result = {
                success: true,
                count: this.pendingBatch.length,
                txHash: tx.hash,
                blockNumber: receipt.blockNumber,
                gasUsed: receipt.gasUsed.toString(),
                explorer: `${this.chain.explorer}/tx/${tx.hash}`
            };

            // Clear batch
            this.pendingBatch = [];

            console.log(`   ✅ Batch confirmed: ${result.explorer}`);

            return result;

        } catch (error) {
            console.error(`❌ Batch submission failed: ${error.message}`);
            return { success: false, error: error.message };
        }
    }

    /**
     * Get attestation status
     */
    getStatus() {
        return {
            initialized: this.isInitialized,
            chain: this.chain?.name || null,
            chainId: this.chain?.chainId || null,
            isTestnet: this.chain?.isTestnet || false,
            contractAddress: this.contract?.target || null,
            walletAddress: this.wallet?.address || null,
            pendingCount: this.pendingBatch.length,
            cacheSize: this.attestationCache.size,
            explorer: this.chain?.explorer || null
        };
    }

    /**
     * Get explorer URL for an attestation
     */
    getExplorerUrl(txHashOrAddress, type = 'tx') {
        if (!this.chain) return null;
        return `${this.chain.explorer}/${type}/${txHashOrAddress}`;
    }

    // =====================================
    // HELPERS
    // =====================================

    _generateAttestationId(imageHash) {
        const data = `${imageHash}:${Date.now()}:${Math.random()}`;
        return '0x' + crypto.createHash('sha256').update(data).digest('hex');
    }

    _toBytes32(value) {
        if (!value) return ethers.ZeroHash;

        // Already bytes32
        if (value.startsWith('0x') && value.length === 66) {
            return value;
        }

        // Hex string without 0x
        if (/^[a-fA-F0-9]{64}$/.test(value)) {
            return '0x' + value;
        }

        // Hash the value
        const hash = crypto.createHash('sha256').update(value).digest('hex');
        return '0x' + hash;
    }
}

// Singleton instance
let service = null;

function getBlockchainService() {
    if (!service) {
        service = new BlockchainAttestationService();
    }
    return service;
}

module.exports = {
    BlockchainAttestationService,
    getBlockchainService,
    CHAINS
};
