pragma circom 2.0.0;

/*
 * Grayscale conversion circuit adapted from Trisha Datta & Dan Boneh's reference.
 *
 * Parameters:
 *   h, w          - dimensions of the image
 *
 * Inputs:
 *   orig          - original RGB pixels        [h][w][3]
 *   gray          - resulting grayscale pixels [h][w]
 *   negRem        - negative remainder         [h][w] (private)
 *   posRem        - positive remainder         [h][w] (private)
 *
 * The circuit enforces the standard Photoshop grayscale formula:
 *   gray = 0.30R + 0.59G + 0.11B
 *
 * To avoid floating-point arithmetic, values are scaled by 100, and the
 * prover provides remainders (negRem/posRem) to account for rounding.
 */
template Grayscale(h, w) {
    signal input orig[h][w][3];
    signal input gray[h][w];
    signal input negRem[h][w];
    signal input posRem[h][w];
    signal output ok;

    for (var i = 0; i < h; i++) {
        for (var j = 0; j < w; j++) {
            30 * orig[i][j][0] + 59 * orig[i][j][1] + 11 * orig[i][j][2]
                === 100 * gray[i][j] - negRem[i][j] + posRem[i][j];
        }
    }

    ok <== 1;
}