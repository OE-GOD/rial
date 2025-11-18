const {
    bufferToRgbMatrix,
    bufferToGrayMatrix,
    buildGrayscaleRemainders
} = require('./image-utils');
const { generateProof } = require('./groth16');

const DEFAULT_MAX_DIMENSION = parseInt(process.env.ZK_MAX_DIMENSION || '128', 10);
const PROOF_MAX_DIMENSION = parseInt(process.env.ZK_PROOF_MAX_DIMENSION || '32', 10); // Downsample for faster proofs

function ensureWithinLimit(width, height, type) {
    if (width > DEFAULT_MAX_DIMENSION || height > DEFAULT_MAX_DIMENSION) {
        throw new Error(
            `${type} proof exceeds maximum supported dimensions (${width}x${height}). ` +
            `Set ZK_MAX_DIMENSION to a higher value if you have the proving power.`
        );
    }
}

async function generateProofsForSteps(initialBuffer, steps, options = {}) {
    const proofs = [];
    let previousBuffer = initialBuffer;

    for (const step of steps) {
        const { type, params, afterBuffer } = step;

        if (type === 'Crop') {
            const before = await bufferToRgbMatrix(previousBuffer);
            const after = await bufferToRgbMatrix(afterBuffer);

            ensureWithinLimit(before.width, before.height, 'Crop');
            ensureWithinLimit(after.width, after.height, 'Crop (cropped)');

            const circuitParams = {
                hOrig: before.height,
                wOrig: before.width,
                hNew: after.height,
                wNew: after.width,
                hStart: params?.y ?? 0,
                wStart: params?.x ?? 0
            };

            const witness = {
                orig: before.matrix,
                new: after.matrix
            };

            const result = await generateProof('crop', circuitParams, witness, options);

            proofs.push({
                type,
                circuit: 'crop',
                params: circuitParams,
                proof: result.proof,
                publicSignals: result.publicSignals,
                artifacts: {
                    verificationKey: result.artifacts.verificationKeyPath
                },
                persisted: result.saved
            });
        } else if (type === 'Resize') {
            const before = await bufferToRgbMatrix(previousBuffer);
            const after = await bufferToRgbMatrix(afterBuffer);

            ensureWithinLimit(before.width, before.height, 'Resize');
            ensureWithinLimit(after.width, after.height, 'Resize (resized)');

            const circuitParams = {
                hOrig: before.height,
                wOrig: before.width,
                hNew: after.height,
                wNew: after.width
            };

            const witness = {
                orig: before.matrix,
                new: after.matrix
            };

            const result = await generateProof('resize', circuitParams, witness, options);

            proofs.push({
                type,
                circuit: 'resize',
                params: circuitParams,
                proof: result.proof,
                publicSignals: result.publicSignals,
                artifacts: {
                    verificationKey: result.artifacts.verificationKeyPath
                },
                persisted: result.saved
            });
        } else if (type === 'Grayscale') {
            const before = await bufferToRgbMatrix(previousBuffer);
            const after = await bufferToGrayMatrix(afterBuffer);

            ensureWithinLimit(before.width, before.height, 'Grayscale');

            const circuitParams = {
                h: before.height,
                w: before.width
            };

            const { negRem, posRem } = buildGrayscaleRemainders(before.matrix, after.matrix);

            const witness = {
                orig: before.matrix,
                gray: after.matrix,
                negRem,
                posRem
            };

            const result = await generateProof('grayscale', circuitParams, witness, options);

            proofs.push({
                type,
                circuit: 'grayscale',
                params: circuitParams,
                proof: result.proof,
                publicSignals: result.publicSignals,
                artifacts: {
                    verificationKey: result.artifacts.verificationKeyPath
                },
                persisted: result.saved
            });
        } else {
            console.warn(`⚠️  Unknown transformation type "${type}" - skipping proof generation.`);
        }

        previousBuffer = afterBuffer;
    }

    return proofs;
}

module.exports = {
    generateProofsForSteps
};

