pragma circom 2.0.0;

/*
 * Crop circuit adapted from Trisha Datta & Dan Boneh's reference implementation.
 *
 * Given an original RGB image and a cropped RGB image, prove that the cropped image
 * is equal to a rectangular sub-region of the original image.
 *
 * Parameters:
 *   hOrig, wOrig   - dimensions of the original image
 *   hNew,  wNew    - dimensions of the cropped image
 *   hStartNew      - starting row (top) of the crop region within the original image
 *   wStartNew      - starting column (left) of the crop region within the original image
 *
 * Inputs:
 *   orig           - original RGB pixels  [hOrig][wOrig][3]
 *   new            - cropped RGB pixels   [hNew][wNew][3]
 *
 * Constraints:
 *   For every pixel in the cropped image, enforce equality with the corresponding pixel
 *   in the original image offset by (hStartNew, wStartNew).
 */
template Crop(hOrig, wOrig, hNew, wNew, hStartNew, wStartNew) {
    signal input orig[hOrig][wOrig][3];
    signal input new[hNew][wNew][3];
    signal output ok;

    for (var i = 0; i < hNew; i++) {
        for (var j = 0; j < wNew; j++) {
            for (var k = 0; k < 3; k++) {
                new[i][j][k] === orig[hStartNew + i][wStartNew + j][k];
            }
        }
    }

    // Dummy output to keep circuit compatible with snarkjs fullProve
    ok <== 1;
}
