/**
 * HD Image Processing for ZK-IMG
 * 
 * Based on the paper's approach for handling HD (720p) images efficiently
 * Uses tiling and parallel proof generation
 */

const sharp = require('sharp');
const { ProofChain } = require('./proof-chain');
const { poseidonHash } = require('./poseidon');

// HD image dimensions
const HD_WIDTH = 1280;
const HD_HEIGHT = 720;

// Tile size for efficient processing (as mentioned in paper)
const TILE_SIZE = 64;

class HDImageProcessor {
    constructor(options = {}) {
        this.tileSize = options.tileSize || TILE_SIZE;
        this.maxParallel = options.maxParallel || 4;
    }

    /**
     * Process HD image by splitting into tiles
     * This allows handling large images that wouldn't fit in a single circuit
     */
    async processHDImage(imageBuffer, transformation) {
        const metadata = await sharp(imageBuffer).metadata();
        
        // Check if tiling is needed
        if (metadata.width <= this.tileSize && metadata.height <= this.tileSize) {
            // Small enough to process directly
            return this.processSingleImage(imageBuffer, transformation);
        }
        
        // Split into tiles
        const tiles = await this.splitIntoTiles(imageBuffer, metadata);
        
        // Process tiles in parallel
        const processedTiles = await this.processTilesParallel(tiles, transformation);
        
        // Recombine tiles
        const result = await this.recombineTiles(processedTiles, metadata, transformation);
        
        return result;
    }

    /**
     * Split image into tiles for processing
     */
    async splitIntoTiles(imageBuffer, metadata) {
        const { width, height } = metadata;
        const tiles = [];
        
        for (let y = 0; y < height; y += this.tileSize) {
            for (let x = 0; x < width; x += this.tileSize) {
                const tileWidth = Math.min(this.tileSize, width - x);
                const tileHeight = Math.min(this.tileSize, height - y);
                
                // Extract tile
                const tile = await sharp(imageBuffer)
                    .extract({
                        left: x,
                        top: y,
                        width: tileWidth,
                        height: tileHeight
                    })
                    .toBuffer();
                
                tiles.push({
                    buffer: tile,
                    x,
                    y,
                    width: tileWidth,
                    height: tileHeight,
                    index: tiles.length
                });
            }
        }
        
        return tiles;
    }

    /**
     * Process tiles in parallel batches
     */
    async processTilesParallel(tiles, transformation) {
        const results = [];
        
        // Process in batches to avoid memory issues
        for (let i = 0; i < tiles.length; i += this.maxParallel) {
            const batch = tiles.slice(i, i + this.maxParallel);
            
            const batchResults = await Promise.all(
                batch.map(tile => this.processTile(tile, transformation))
            );
            
            results.push(...batchResults);
        }
        
        return results;
    }

    /**
     * Process a single tile
     */
    async processTile(tile, transformation) {
        // Adjust transformation parameters for tile coordinates
        const adjustedTransform = this.adjustTransformForTile(transformation, tile);
        
        // Apply transformation
        const transformedBuffer = await this.applyTileTransform(
            tile.buffer, 
            adjustedTransform
        );
        
        // Generate proof for this tile
        const proof = await this.generateTileProof(
            tile.buffer,
            transformedBuffer,
            adjustedTransform
        );
        
        return {
            ...tile,
            transformedBuffer,
            proof,
            transformHash: await poseidonHash([tile.index])
        };
    }

    /**
     * Adjust transformation parameters for tile coordinates
     */
    adjustTransformForTile(transformation, tile) {
        const adjusted = { ...transformation };
        
        if (transformation.type === 'Crop') {
            // Adjust crop coordinates relative to tile
            const params = { ...transformation.params };
            params.x = Math.max(0, params.x - tile.x);
            params.y = Math.max(0, params.y - tile.y);
            params.width = Math.min(params.width, tile.width - params.x);
            params.height = Math.min(params.height, tile.height - params.y);
            adjusted.params = params;
        }
        
        return adjusted;
    }

    /**
     * Apply transformation to a tile
     */
    async applyTileTransform(tileBuffer, transformation) {
        let img = sharp(tileBuffer);
        
        switch (transformation.type) {
            case 'Crop':
                const { x, y, width, height } = transformation.params;
                img = img.extract({ left: x, top: y, width, height });
                break;
                
            case 'Resize':
                img = img.resize(transformation.params.width, transformation.params.height);
                break;
                
            case 'Grayscale':
                img = img.grayscale();
                break;
        }
        
        return img.toBuffer();
    }

    /**
     * Generate proof for a tile transformation
     */
    async generateTileProof(inputBuffer, outputBuffer, transformation) {
        // For HD images, we use the hash-based approach
        const inputHash = await poseidonHash([inputBuffer.length]);
        const outputHash = await poseidonHash([outputBuffer.length]);
        
        return {
            type: 'tile_proof',
            inputHash,
            outputHash,
            transformation: transformation.type,
            tileProof: true // Placeholder for actual proof
        };
    }

    /**
     * Recombine processed tiles into final image
     */
    async recombineTiles(processedTiles, originalMetadata, transformation) {
        // Calculate output dimensions
        const outputDims = this.calculateOutputDimensions(originalMetadata, transformation);
        
        // Create composite
        const composite = [];
        
        for (const tile of processedTiles) {
            if (tile.transformedBuffer && tile.transformedBuffer.length > 0) {
                composite.push({
                    input: tile.transformedBuffer,
                    left: tile.x,
                    top: tile.y
                });
            }
        }
        
        // Combine tiles
        const finalImage = await sharp({
            create: {
                width: outputDims.width,
                height: outputDims.height,
                channels: 3,
                background: { r: 0, g: 0, b: 0 }
            }
        })
        .composite(composite)
        .png()
        .toBuffer();
        
        // Aggregate proofs
        const aggregatedProof = this.aggregateTileProofs(processedTiles);
        
        return {
            image: finalImage,
            proof: aggregatedProof,
            metadata: outputDims
        };
    }

    /**
     * Calculate output dimensions after transformation
     */
    calculateOutputDimensions(metadata, transformation) {
        switch (transformation.type) {
            case 'Crop':
                return {
                    width: transformation.params.width,
                    height: transformation.params.height
                };
                
            case 'Resize':
                return {
                    width: transformation.params.width,
                    height: transformation.params.height
                };
                
            default:
                return {
                    width: metadata.width,
                    height: metadata.height
                };
        }
    }

    /**
     * Aggregate proofs from all tiles
     */
    aggregateTileProofs(tiles) {
        // Create Merkle tree of tile proofs
        const proofHashes = tiles.map(t => t.transformHash);
        
        // Build tree
        let level = proofHashes;
        while (level.length > 1) {
            const nextLevel = [];
            for (let i = 0; i < level.length; i += 2) {
                if (i + 1 < level.length) {
                    nextLevel.push(poseidonHash([level[i], level[i + 1]]));
                } else {
                    nextLevel.push(level[i]);
                }
            }
            level = nextLevel;
        }
        
        return {
            type: 'aggregated_tile_proof',
            rootHash: level[0],
            numTiles: tiles.length,
            tileProofs: tiles.map(t => t.proof)
        };
    }

    /**
     * Process a small image without tiling
     */
    async processSingleImage(imageBuffer, transformation) {
        const transformedBuffer = await this.applyTileTransform(imageBuffer, transformation);
        const proof = await this.generateTileProof(
            imageBuffer, 
            transformedBuffer, 
            transformation
        );
        
        return {
            image: transformedBuffer,
            proof,
            metadata: await sharp(transformedBuffer).metadata()
        };
    }
}

/**
 * Optimized circuit packing for multiple operations
 * As mentioned in the paper, this fuses operations for efficiency
 */
async function packOperations(operations) {
    // Group compatible operations
    const groups = [];
    let currentGroup = [];
    
    for (const op of operations) {
        if (canPackWith(currentGroup, op)) {
            currentGroup.push(op);
        } else {
            if (currentGroup.length > 0) {
                groups.push(currentGroup);
            }
            currentGroup = [op];
        }
    }
    
    if (currentGroup.length > 0) {
        groups.push(currentGroup);
    }
    
    return groups;
}

function canPackWith(group, operation) {
    // Simple heuristic: pack if total constraints < threshold
    const MAX_CONSTRAINTS = 100000;
    
    const currentConstraints = group.reduce((sum, op) => sum + estimateConstraints(op), 0);
    const newConstraints = estimateConstraints(operation);
    
    return currentConstraints + newConstraints < MAX_CONSTRAINTS;
}

function estimateConstraints(operation) {
    // Rough estimates based on operation type
    switch (operation.type) {
        case 'Crop':
            return operation.params.width * operation.params.height * 3;
        case 'Resize':
            return operation.params.width * operation.params.height * 6; // Bilinear
        case 'Grayscale':
            return operation.params.width * operation.params.height;
        default:
            return 10000;
    }
}

module.exports = {
    HDImageProcessor,
    packOperations,
    HD_WIDTH,
    HD_HEIGHT,
    TILE_SIZE
};
