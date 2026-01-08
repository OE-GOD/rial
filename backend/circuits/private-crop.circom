pragma circom 2.0.0;

include "../../node_modules/circomlib/circuits/poseidon.circom";

/*
 * Privacy-preserving crop circuit based on ZK-IMG paper
 * 
 * Instead of revealing the original image, we:
 * 1. Hash the original image inside the circuit
 * 2. Prove the crop is valid
 * 3. Hash the output image
 * 
 * This allows verification without revealing either image
 */
template PrivateCrop(hOrig, wOrig, hNew, wNew, hStartNew, wStartNew) {
    // Private inputs
    signal input orig[hOrig][wOrig][3];
    signal input new[hNew][wNew][3];
    
    // Public outputs - only hashes are revealed
    signal output origHash;
    signal output newHash;
    
    // Hash original image
    component origHasher = Poseidon(5);
    // Use first few pixels as representative (simplified)
    origHasher.inputs[0] <== orig[0][0][0];
    origHasher.inputs[1] <== orig[0][0][1];
    origHasher.inputs[2] <== orig[0][0][2];
    origHasher.inputs[3] <== orig[0][1][0];
    origHasher.inputs[4] <== orig[0][1][1];
    origHash <== origHasher.out;
    
    // Verify crop constraints
    for (var i = 0; i < hNew; i++) {
        for (var j = 0; j < wNew; j++) {
            for (var k = 0; k < 3; k++) {
                new[i][j][k] === orig[hStartNew + i][wStartNew + j][k];
            }
        }
    }
    
    // Hash new image
    component newHasher = Poseidon(5);
    newHasher.inputs[0] <== new[0][0][0];
    newHasher.inputs[1] <== new[0][0][1];
    newHasher.inputs[2] <== new[0][0][2];
    newHasher.inputs[3] <== new[0][1][0] * (wNew > 1 ? 1 : 0);
    newHasher.inputs[4] <== new[0][1][1] * (wNew > 1 ? 1 : 0);
    newHash <== newHasher.out;
}

/*
 * Merkle tree based image hashing for larger images
 * Splits image into chunks and builds a tree of hashes
 */
template ImageMerkleHash(h, w, chunkSize) {
    signal input image[h][w][3];
    signal output root;
    
    var numPixels = h * w;
    var numChunks = (numPixels + chunkSize - 1) \ chunkSize;
    
    // First level: hash pixel chunks
    component chunkHashers[numChunks];
    signal chunkHashes[numChunks];
    
    for (var c = 0; c < numChunks; c++) {
        chunkHashers[c] = Poseidon(5);
        
        // Fill chunk with pixels (simplified - just use first 5 values)
        var pixelIdx = c * chunkSize;
        var row = pixelIdx \ w;
        var col = pixelIdx % w;
        
        if (row < h && col < w) {
            chunkHashers[c].inputs[0] <== image[row][col][0];
            chunkHashers[c].inputs[1] <== image[row][col][1];
            chunkHashers[c].inputs[2] <== image[row][col][2];
            chunkHashers[c].inputs[3] <== image[row][(col + 1) % w][0] * (col + 1 < w ? 1 : 0);
            chunkHashers[c].inputs[4] <== image[row][(col + 1) % w][1] * (col + 1 < w ? 1 : 0);
        } else {
            // Padding
            for (var i = 0; i < 5; i++) {
                chunkHashers[c].inputs[i] <== 0;
            }
        }
        
        chunkHashes[c] <== chunkHashers[c].out;
    }
    
    // For simplicity, just hash first two chunks as root
    component rootHasher = Poseidon(2);
    rootHasher.inputs[0] <== chunkHashes[0];
    rootHasher.inputs[1] <== numChunks > 1 ? chunkHashes[1] : 0;
    root <== rootHasher.out;
}
