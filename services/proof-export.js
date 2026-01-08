/**
 * Proof Chain Export Service
 *
 * Export complete proof chains as shareable JSON, QR codes, or compact formats
 * Enables verification without backend connection
 */

const crypto = require('crypto');
const zlib = require('zlib');

class ProofChainExporter {
    constructor() {
        this.version = '1.0.0';
        this.compressionLevel = 9;
    }

    /**
     * Export proof chain as portable JSON
     */
    exportToJSON(proofChain, options = {}) {
        const exportData = {
            format: 'rial-proof-chain',
            version: this.version,
            exportedAt: new Date().toISOString(),
            exporter: 'Rial Privacy Proofs',

            // Metadata
            metadata: {
                chainId: proofChain.chainId || crypto.randomUUID(),
                imageHash: proofChain.imageHash,
                totalTransformations: proofChain.transformations?.length || 0,
                createdAt: proofChain.createdAt,
                device: proofChain.device || 'unknown'
            },

            // Original commitment (no pixels!)
            originalCommitment: {
                merkleRoot: proofChain.originalCommitment?.merkleRoot,
                dimensions: {
                    width: proofChain.originalCommitment?.width,
                    height: proofChain.originalCommitment?.height
                },
                tileInfo: {
                    tileSize: proofChain.originalCommitment?.tileSize,
                    tilesX: proofChain.originalCommitment?.tilesX,
                    tilesY: proofChain.originalCommitment?.tilesY
                }
            },

            // Transformation chain
            transformations: (proofChain.transformations || []).map((t, idx) => ({
                step: idx + 1,
                type: t.type,
                params: t.params,
                inputCommitment: t.inputCommitment?.merkleRoot?.substring(0, 32) + '...',
                outputCommitment: t.outputCommitment?.merkleRoot?.substring(0, 32) + '...',
                proof: {
                    type: t.proof?.type,
                    valid: t.proof?.valid,
                    commitment: t.proof?.commitment
                },
                timestamp: t.timestamp
            })),

            // Final state
            finalCommitment: {
                merkleRoot: proofChain.finalCommitment?.merkleRoot,
                dimensions: {
                    width: proofChain.finalCommitment?.width,
                    height: proofChain.finalCommitment?.height
                }
            },

            // Verification info
            verification: {
                canVerifyOffline: true,
                requiredData: ['finalImage', 'proofChain'],
                algorithm: 'poseidon-merkle-tile',
                paper: 'https://eprint.iacr.org/2024/1074'
            },

            // Signature for integrity
            signature: this.signExport(proofChain)
        };

        // Include full proofs if requested
        if (options.includeFullProofs) {
            exportData.fullProofs = proofChain.transformations?.map(t => t.proof);
        }

        return exportData;
    }

    /**
     * Export as compact binary format (for QR codes)
     */
    exportToCompact(proofChain) {
        const essential = {
            v: 1, // version
            id: proofChain.chainId?.substring(0, 8),
            or: proofChain.originalCommitment?.merkleRoot?.substring(0, 16),
            fr: proofChain.finalCommitment?.merkleRoot?.substring(0, 16),
            ow: proofChain.originalCommitment?.width,
            oh: proofChain.originalCommitment?.height,
            fw: proofChain.finalCommitment?.width,
            fh: proofChain.finalCommitment?.height,
            tc: proofChain.transformations?.length || 0,
            ts: Date.now(),
            sig: this.signExport(proofChain).substring(0, 16)
        };

        // Compress
        const jsonStr = JSON.stringify(essential);
        const compressed = zlib.deflateSync(jsonStr, { level: this.compressionLevel });

        return {
            format: 'rial-compact',
            data: compressed.toString('base64'),
            size: compressed.length,
            originalSize: jsonStr.length,
            compressionRatio: (jsonStr.length / compressed.length).toFixed(2)
        };
    }

    /**
     * Export as QR code data
     */
    exportToQR(proofChain, options = {}) {
        const compact = this.exportToCompact(proofChain);
        const qrData = `rial://verify/${compact.data}`;

        // Check QR capacity (typical max ~2953 bytes for highest capacity)
        const maxQRBytes = options.maxBytes || 2000;

        if (qrData.length > maxQRBytes) {
            // Split into multiple QR codes
            return this.exportToMultiQR(proofChain, maxQRBytes);
        }

        return {
            format: 'rial-qr',
            type: 'single',
            data: qrData,
            bytes: qrData.length,
            verificationUrl: `https://verify.trueshot.app/?p=${encodeURIComponent(compact.data)}`,
            instructions: 'Scan with Rial app or visit verification URL'
        };
    }

    /**
     * Export to multiple QR codes for large proofs
     */
    exportToMultiQR(proofChain, maxBytes) {
        const fullJSON = JSON.stringify(this.exportToJSON(proofChain));
        const compressed = zlib.deflateSync(fullJSON, { level: this.compressionLevel });
        const base64 = compressed.toString('base64');

        const chunks = [];
        const chunkSize = maxBytes - 50; // Reserve space for header

        for (let i = 0; i < base64.length; i += chunkSize) {
            chunks.push(base64.substring(i, i + chunkSize));
        }

        return {
            format: 'rial-qr-multi',
            type: 'multi',
            totalParts: chunks.length,
            parts: chunks.map((chunk, idx) => ({
                part: idx + 1,
                total: chunks.length,
                data: `rial://verify-part/${idx + 1}/${chunks.length}/${chunk}`,
                bytes: chunk.length
            })),
            instructions: 'Scan all QR codes in order to verify'
        };
    }

    /**
     * Export as verification URL
     */
    exportToURL(proofChain, baseUrl = 'https://verify.trueshot.app') {
        const compact = this.exportToCompact(proofChain);

        return {
            format: 'rial-url',
            url: `${baseUrl}/v/${compact.data}`,
            shortUrl: `${baseUrl}/v/${proofChain.chainId?.substring(0, 8)}`,
            embedCode: `<a href="${baseUrl}/v/${compact.data}">Verify Proof</a>`,
            markdownBadge: `[![Verified](${baseUrl}/badge/${proofChain.chainId?.substring(0, 8)})](${baseUrl}/v/${compact.data})`
        };
    }

    /**
     * Export as embeddable HTML widget
     */
    exportToWidget(proofChain) {
        const compact = this.exportToCompact(proofChain);
        const chainId = proofChain.chainId?.substring(0, 8) || 'unknown';

        const html = `
<!-- Rial Proof Verification Widget -->
<div id="rial-proof-${chainId}" class="rial-proof-widget" style="
    border: 1px solid #e0e0e0;
    border-radius: 8px;
    padding: 12px;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    max-width: 300px;
    background: linear-gradient(135deg, #f5f7fa 0%, #e4e8ec 100%);
">
    <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 8px;">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#10b981" stroke-width="2">
            <path d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/>
        </svg>
        <span style="font-weight: 600; color: #1f2937;">Privacy-Preserved Proof</span>
    </div>
    <div style="font-size: 12px; color: #6b7280; margin-bottom: 8px;">
        <div>Chain: ${chainId}</div>
        <div>Transformations: ${proofChain.transformations?.length || 0}</div>
        <div>Original: ${proofChain.originalCommitment?.width}x${proofChain.originalCommitment?.height}</div>
    </div>
    <a href="https://verify.trueshot.app/v/${compact.data}"
       target="_blank"
       style="
           display: inline-block;
           background: #3b82f6;
           color: white;
           padding: 6px 12px;
           border-radius: 4px;
           text-decoration: none;
           font-size: 12px;
           font-weight: 500;
       ">
        Verify Proof →
    </a>
</div>
<!-- End Rial Widget -->`;

        return {
            format: 'rial-widget',
            html: html.trim(),
            minifiedHtml: html.replace(/\s+/g, ' ').trim(),
            chainId
        };
    }

    /**
     * Export for sharing (combines multiple formats)
     */
    exportForSharing(proofChain) {
        return {
            json: this.exportToJSON(proofChain),
            compact: this.exportToCompact(proofChain),
            qr: this.exportToQR(proofChain),
            url: this.exportToURL(proofChain),
            widget: this.exportToWidget(proofChain)
        };
    }

    /**
     * Sign export for integrity
     */
    signExport(proofChain) {
        const dataToSign = JSON.stringify({
            originalRoot: proofChain.originalCommitment?.merkleRoot,
            finalRoot: proofChain.finalCommitment?.merkleRoot,
            transformationCount: proofChain.transformations?.length || 0
        });

        return crypto
            .createHash('sha256')
            .update(dataToSign)
            .digest('hex');
    }
}

class ProofChainImporter {
    /**
     * Import from JSON
     */
    importFromJSON(jsonData) {
        if (jsonData.format !== 'rial-proof-chain') {
            throw new Error('Invalid proof chain format');
        }

        // Verify signature
        const expectedSig = this.computeSignature(jsonData);
        if (jsonData.signature !== expectedSig) {
            console.warn('⚠️ Signature mismatch - proof may have been tampered');
        }

        return {
            chainId: jsonData.metadata.chainId,
            originalCommitment: {
                merkleRoot: jsonData.originalCommitment.merkleRoot,
                width: jsonData.originalCommitment.dimensions.width,
                height: jsonData.originalCommitment.dimensions.height,
                tileSize: jsonData.originalCommitment.tileInfo.tileSize,
                tilesX: jsonData.originalCommitment.tileInfo.tilesX,
                tilesY: jsonData.originalCommitment.tileInfo.tilesY
            },
            transformations: jsonData.transformations,
            finalCommitment: {
                merkleRoot: jsonData.finalCommitment.merkleRoot,
                width: jsonData.finalCommitment.dimensions.width,
                height: jsonData.finalCommitment.dimensions.height
            },
            verified: jsonData.signature === expectedSig
        };
    }

    /**
     * Import from compact format
     */
    importFromCompact(compactData) {
        const compressed = Buffer.from(compactData, 'base64');
        const jsonStr = zlib.inflateSync(compressed).toString();
        const data = JSON.parse(jsonStr);

        return {
            chainId: data.id,
            originalCommitment: {
                merkleRoot: data.or,
                width: data.ow,
                height: data.oh
            },
            finalCommitment: {
                merkleRoot: data.fr,
                width: data.fw,
                height: data.fh
            },
            transformationCount: data.tc,
            timestamp: data.ts,
            signaturePrefix: data.sig
        };
    }

    /**
     * Import from QR data
     */
    importFromQR(qrData) {
        if (qrData.startsWith('rial://verify/')) {
            const compact = qrData.replace('rial://verify/', '');
            return this.importFromCompact(compact);
        }

        if (qrData.startsWith('rial://verify-part/')) {
            throw new Error('Multi-part QR detected. Scan all parts first.');
        }

        throw new Error('Invalid QR format');
    }

    computeSignature(jsonData) {
        const dataToSign = JSON.stringify({
            originalRoot: jsonData.originalCommitment?.merkleRoot,
            finalRoot: jsonData.finalCommitment?.merkleRoot,
            transformationCount: jsonData.transformations?.length || 0
        });

        return crypto
            .createHash('sha256')
            .update(dataToSign)
            .digest('hex');
    }
}

module.exports = { ProofChainExporter, ProofChainImporter };
