/**
 * Blockchain Attestation API
 *
 * Endpoints for on-chain photo attestation
 */

const express = require('express');
const router = express.Router();
const { getBlockchainService, CHAINS } = require('../services/blockchain-attestation');

// =====================================
// GET /api/blockchain/status - Get blockchain service status
// =====================================

router.get('/status', (req, res) => {
    const service = getBlockchainService();
    const status = service.getStatus();

    res.json({
        success: true,
        blockchain: status,
        availableChains: Object.keys(CHAINS).map(key => ({
            id: key,
            name: CHAINS[key].name,
            isTestnet: CHAINS[key].isTestnet,
            explorer: CHAINS[key].explorer
        }))
    });
});

// =====================================
// POST /api/blockchain/attest - Create on-chain attestation
// =====================================

router.post('/attest', async (req, res) => {
    try {
        const {
            imageHash,
            merkleRoot,
            metadataHash,
            signatureType,
            livenessScore,
            aiScore
        } = req.body;

        if (!imageHash) {
            return res.status(400).json({
                success: false,
                error: 'imageHash required'
            });
        }

        const service = getBlockchainService();

        // Initialize if not already
        if (!service.isInitialized) {
            await service.initialize({
                chain: process.env.BLOCKCHAIN_CHAIN || 'base-sepolia'
            });
        }

        const result = await service.createAttestation({
            imageHash,
            merkleRoot,
            metadataHash,
            signatureType,
            livenessScore,
            aiScore
        });

        res.json({
            success: result.success,
            attestation: result
        });

    } catch (error) {
        console.error('[Blockchain] Attest error:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// =====================================
// POST /api/blockchain/verify - Verify on-chain attestation
// =====================================

router.post('/verify', async (req, res) => {
    try {
        const { imageHash, merkleRoot } = req.body;

        if (!imageHash) {
            return res.status(400).json({
                success: false,
                error: 'imageHash required'
            });
        }

        const service = getBlockchainService();

        if (!service.isInitialized) {
            await service.initialize({
                chain: process.env.BLOCKCHAIN_CHAIN || 'base-sepolia'
            });
        }

        const result = await service.verifyOnChain(imageHash, merkleRoot);

        res.json({
            success: true,
            verification: result
        });

    } catch (error) {
        console.error('[Blockchain] Verify error:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// =====================================
// GET /api/blockchain/verify/:imageHash - Quick verification
// =====================================

router.get('/verify/:imageHash', async (req, res) => {
    try {
        const { imageHash } = req.params;

        const service = getBlockchainService();

        if (!service.isInitialized) {
            await service.initialize({
                chain: process.env.BLOCKCHAIN_CHAIN || 'base-sepolia'
            });
        }

        const result = await service.verifyOnChain(imageHash);

        res.json({
            success: true,
            verification: result
        });

    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// =====================================
// POST /api/blockchain/batch - Submit pending batch
// =====================================

router.post('/batch', async (req, res) => {
    try {
        const service = getBlockchainService();

        if (!service.isInitialized) {
            return res.status(400).json({
                success: false,
                error: 'Blockchain service not initialized'
            });
        }

        const result = await service.submitBatch();

        res.json({
            success: result.success,
            batch: result
        });

    } catch (error) {
        console.error('[Blockchain] Batch error:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// =====================================
// GET /api/blockchain/pending - Get pending attestations
// =====================================

router.get('/pending', (req, res) => {
    const service = getBlockchainService();
    const status = service.getStatus();

    res.json({
        success: true,
        pending: status.pendingCount,
        chain: status.chain
    });
});

// =====================================
// POST /api/blockchain/initialize - Initialize blockchain connection
// =====================================

router.post('/initialize', async (req, res) => {
    try {
        const { chain, rpcUrl, contractAddress } = req.body;

        const service = getBlockchainService();
        const result = await service.initialize({
            chain: chain || 'base-sepolia',
            rpcUrl,
            contractAddress
        });

        res.json({
            success: result.success,
            ...result
        });

    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// =====================================
// GET /api/blockchain/explorer/:type/:hash - Get explorer URL
// =====================================

router.get('/explorer/:type/:hash', (req, res) => {
    const { type, hash } = req.params;
    const service = getBlockchainService();

    const url = service.getExplorerUrl(hash, type);

    if (url) {
        res.json({ success: true, url });
    } else {
        res.status(400).json({
            success: false,
            error: 'Blockchain not initialized'
        });
    }
});

module.exports = router;
