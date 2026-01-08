pragma circom 2.0.0;

/*
 * Bilinear resize circuit adapted from Trisha Datta & Dan Boneh's reference implementation.
 *
 * Given an original RGB image and a resized RGB image, prove that each pixel in the resized
 * image is the result of applying bilinear interpolation to the original image.
 *
 * Parameters:
 *   hOrig, wOrig  - dimensions of the original image
 *   hNew,  wNew   - dimensions of the resized image
 *
 * Inputs:
 *   orig          - original RGB pixels  [hOrig][wOrig][3]
 *   new           - resized RGB pixels   [hNew][wNew][3]
 *
 * Constraints:
 *   Uses integer arithmetic consistent with Tensorflow-style bilinear interpolation.
 *   Values are expected to be integers (0-255). The caller is responsible for scaling
 *   if operating on larger ranges.
 */
template Resize(hOrig, wOrig, hNew, wNew) {
    signal input orig[hOrig][wOrig][3];
    signal input new[hNew][wNew][3];
    signal output ok;

    // Pre-compute denominators (compile-time constants).
    var denomW = wNew - 1;
    var denomH = hNew - 1;
    var denom = denomW * denomH;

    for (var i = 0; i < hNew; i++) {
        for (var j = 0; j < wNew; j++) {
            // Map destination pixel to source coordinates using bilinear interpolation.
            var x_l = (wOrig - 1) * j / denomW;
            var y_l = (hOrig - 1) * i / denomH;

            var x_l_scaled = (wOrig - 1) * j;
            var y_l_scaled = (hOrig - 1) * i;

            var x_h = x_l_scaled == denomW * x_l ? x_l : x_l + 1;
            var y_h = y_l_scaled == denomH * y_l ? y_l : y_l + 1;

            var xRatioWeighted = x_l_scaled - denomW * x_l;
            var yRatioWeighted = y_l_scaled - denomH * y_l;

            for (var c = 0; c < 3; c++) {
                var sum =
                    orig[y_l][x_l][c] * (denomW - xRatioWeighted) * (denomH - yRatioWeighted) +
                    orig[y_l][x_h][c] * xRatioWeighted * (denomH - yRatioWeighted) +
                    orig[y_h][x_l][c] * yRatioWeighted * (denomW - xRatioWeighted) +
                    orig[y_h][x_h][c] * xRatioWeighted * yRatioWeighted;

                new[i][j][c] * denom === sum;
            }
        }
    }

    ok <== 1;
}