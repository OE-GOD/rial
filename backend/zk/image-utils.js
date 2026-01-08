const sharp = require('sharp');

async function bufferToRaw(buffer, channelsTarget) {
    const image = sharp(buffer);
    if (channelsTarget === 1) {
        image.removeAlpha();
        image.greyscale(); // Use greyscale() instead of toColourspace('b-w')
    } else if (channelsTarget === 3) {
        image.removeAlpha();
        // Don't need to convert to RGB - sharp handles this automatically
    }

    const { data, info } = await image.raw().toBuffer({ resolveWithObject: true });
    return {
        data,
        width: info.width,
        height: info.height,
        channels: info.channels
    };
}

function reshapeRgb({ data, width, height, channels }) {
    if (channels < 3) {
        throw new Error(`Expected at least 3 channels for RGB image, got ${channels}`);
    }

    const matrix = new Array(height);
    for (let y = 0; y < height; y++) {
        const row = new Array(width);
        for (let x = 0; x < width; x++) {
            const idx = (y * width + x) * channels;
            row[x] = [
                data[idx],
                data[idx + 1],
                data[idx + 2]
            ];
        }
        matrix[y] = row;
    }
    return matrix;
}

function reshapeGray({ data, width, height, channels }) {
    if (channels !== 1) {
        throw new Error(`Expected single channel grayscale image, got ${channels}`);
    }

    const matrix = new Array(height);
    for (let y = 0; y < height; y++) {
        const row = new Array(width);
        for (let x = 0; x < width; x++) {
            const idx = y * width + x;
            row[x] = data[idx];
        }
        matrix[y] = row;
    }
    return matrix;
}

async function bufferToRgbMatrix(buffer) {
    const raw = await bufferToRaw(buffer, 3);
    return {
        matrix: reshapeRgb(raw),
        width: raw.width,
        height: raw.height
    };
}

async function bufferToGrayMatrix(buffer) {
    const raw = await bufferToRaw(buffer, 1);
    return {
        matrix: reshapeGray(raw),
        width: raw.width,
        height: raw.height
    };
}

function buildGrayscaleRemainders(originalRgb, grayscale) {
    const height = grayscale.length;
    const width = height > 0 ? grayscale[0].length : 0;
    const negRem = [];
    const posRem = [];

    for (let y = 0; y < height; y++) {
        const negRow = [];
        const posRow = [];
        for (let x = 0; x < width; x++) {
            const [r, g, b] = originalRgb[y][x];
            const gray = grayscale[y][x];
            const weightedSum = 30 * r + 59 * g + 11 * b;
            const target = 100 * gray;
            if (weightedSum >= target) {
                posRow.push(weightedSum - target);
                negRow.push(0);
            } else {
                posRow.push(0);
                negRow.push(target - weightedSum);
            }
        }
        negRem.push(negRow);
        posRem.push(posRow);
    }

    return { negRem, posRem };
}

module.exports = {
    bufferToRgbMatrix,
    bufferToGrayMatrix,
    buildGrayscaleRemainders
};

