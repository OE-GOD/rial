# ZK Proof Performance Optimization Guide

## Current Performance
- 10x10 image crop: ~169ms
- 50x50 image crop: 30-60 seconds
- 100x100 image: Several minutes

## Optimization Strategies

### 1. **Reduce Image Size Before Proving**
Instead of proving on full resolution, downsample first:
```javascript
// Downsample to max 32x32 for proofs
const proofImage = await sharp(originalImage)
  .resize(32, 32, { fit: 'inside' })
  .toBuffer();
```

### 2. **Batch Processing**
Generate proofs asynchronously in background:
```javascript
// Queue proofs for later
backgroundQueue.add({ imageId, transformations });
```

### 3. **Use Proof Caching**
Cache proofs for common operations:
```javascript
const proofKey = hash({ dims, transforms });
if (proofCache.has(proofKey)) {
  return proofCache.get(proofKey);
}
```

### 4. **Alternative Approaches**

#### Option A: Prove Hash Instead
Instead of proving pixel-by-pixel:
1. Hash the original image
2. Hash the transformed image  
3. Prove only that you know the preimage of both hashes
4. Much faster: O(1) constraints instead of O(pixels)

#### Option B: Sample-Based Proof
Prove only a random sample of pixels:
1. Select random 10% of pixels
2. Prove those match the transformation
3. Statistical security with 90% reduction in time

#### Option C: GPU Acceleration
Use GPU-accelerated provers:
- rapidsnark (C++ with CUDA)
- gnark (Go with GPU support)

### 5. **Different Proof Systems**
Consider faster proof systems:
- **STARK**: No trusted setup, but larger proofs
- **Bulletproofs**: No trusted setup, smaller than STARK
- **PLONK**: Universal trusted setup, faster than Groth16

### 6. **Recursive Proofs**
For multiple transformations:
1. Prove each step produces a valid hash
2. Chain the hashes together
3. Single proof of the hash chain

## Recommended Approach

For production, combine strategies:

1. **Immediate**: Downsample to 32x32 max
2. **Short-term**: Implement hash-based proofs
3. **Long-term**: GPU acceleration + recursive proofs

## Example Implementation

```javascript
// Fast hash-based proof
async function generateFastProof(originalBuffer, transformedBuffer, transformation) {
  // Hash both images
  const originalHash = crypto.createHash('sha256').update(originalBuffer).digest();
  const transformedHash = crypto.createHash('sha256').update(transformedBuffer).digest();
  
  // Prove knowledge of preimages and transformation
  // This is MUCH faster - only 2 hash constraints instead of thousands of pixels
  return await generateHashProof(originalHash, transformedHash, transformation);
}
```

## Performance Targets

With optimizations:
- 32x32 downsample: <100ms
- Hash-based proof: <50ms  
- GPU acceleration: 10x faster
- Recursive proofs: O(log n) instead of O(n)
