//! Image utilities for ZK-IMG
//!
//! Helper functions for image processing and conversion

use image::{DynamicImage, GenericImageView, Pixel, RgbImage};
use halo2_proofs::pasta::Fp;

/// Convert RGB pixel values to field elements
pub fn rgb_to_field(r: u8, g: u8, b: u8) -> [Fp; 3] {
    [
        Fp::from(r as u64),
        Fp::from(g as u64),
        Fp::from(b as u64),
    ]
}

/// Convert field elements back to RGB values
pub fn field_to_rgb(fields: &[Fp; 3]) -> [u8; 3] {
    [
        (fields[0].get_lower_32() & 0xFF) as u8,
        (fields[1].get_lower_32() & 0xFF) as u8,
        (fields[2].get_lower_32() & 0xFF) as u8,
    ]
}

/// Convert entire image to field element matrix
pub fn image_to_field_matrix(image: &DynamicImage) -> Vec<Vec<[Fp; 3]>> {
    let (width, height) = image.dimensions();
    let mut matrix = Vec::with_capacity(height as usize);

    for y in 0..height {
        let mut row = Vec::with_capacity(width as usize);
        for x in 0..width {
            let pixel = image.get_pixel(x, y);
            let rgb = pixel.to_rgb();
            row.push(rgb_to_field(rgb[0], rgb[1], rgb[2]));
        }
        matrix.push(row);
    }

    matrix
}

/// Convert field element matrix back to image
pub fn field_matrix_to_image(matrix: &[Vec<[Fp; 3]>]) -> DynamicImage {
    if matrix.is_empty() || matrix[0].is_empty() {
        return DynamicImage::new_rgb8(1, 1);
    }

    let height = matrix.len();
    let width = matrix[0].len();
    let mut image = DynamicImage::new_rgb8(width as u32, height as u32);

    for (y, row) in matrix.iter().enumerate() {
        for (x, pixel) in row.iter().enumerate() {
            let rgb = field_to_rgb(pixel);
            image.put_pixel(x as u32, y as u32, image::Rgb(rgb));
        }
    }

    image
}

/// Chunk image into smaller pieces for efficient processing
pub fn chunk_image(image: &DynamicImage, chunk_size: usize) -> Vec<Vec<Vec<[Fp; 3]>>> {
    let matrix = image_to_field_matrix(image);
    let mut chunks = Vec::new();

    for chunk_y in (0..matrix.len()).step_by(chunk_size) {
        for chunk_x in (0..matrix[0].len()).step_by(chunk_size) {
            let end_y = std::cmp::min(chunk_y + chunk_size, matrix.len());
            let end_x = std::cmp::min(chunk_x + chunk_size, matrix[0].len());

            let chunk: Vec<Vec<[Fp; 3]>> = matrix[chunk_y..end_y]
                .iter()
                .map(|row| row[chunk_x..end_x].to_vec())
                .collect();

            chunks.push(chunk);
        }
    }

    chunks
}

/// Calculate image hash using Poseidon-friendly method
pub fn calculate_poseidon_image_hash(image: &DynamicImage, sample_size: usize) -> Vec<u8> {
    let matrix = image_to_field_matrix(image);
    let mut hash_input = Vec::new();

    // Sample pixels for hashing (to keep hash input reasonable)
    let step_y = std::cmp::max(1, matrix.len() / sample_size);
    let step_x = std::cmp::max(1, matrix[0].len() / sample_size);

    for y in (0..matrix.len()).step_by(step_y) {
        for x in (0..matrix[y].len()).step_by(step_x) {
            let pixel = &matrix[y][x];
            // Convert field elements to bytes for hashing
            hash_input.extend_from_slice(&pixel[0].to_bytes());
            hash_input.extend_from_slice(&pixel[1].to_bytes());
            hash_input.extend_from_slice(&pixel[2].to_bytes());
        }
    }

    // Use SHA256 as placeholder for Poseidon hash
    use sha2::{Digest, Sha256};
    let mut hasher = Sha256::new();
    hasher.update(&hash_input);
    hasher.finalize().to_vec()
}

/// Image quality metrics for verification
pub struct ImageMetrics {
    pub width: u32,
    pub height: u32,
    pub total_pixels: u32,
    pub estimated_constraints: usize,
}

impl ImageMetrics {
    pub fn from_image(image: &DynamicImage) -> Self {
        let (width, height) = image.dimensions();
        let total_pixels = width * height;

        // Rough estimate of circuit constraints
        // This is based on the paper's analysis
        let estimated_constraints = (total_pixels * 3) as usize; // RGB channels

        Self {
            width,
            height,
            total_pixels,
            estimated_constraints,
        }
    }

    pub fn report(&self) {
        println!("📊 Image Metrics:");
        println!("   Dimensions: {}x{}", self.width, self.height);
        println!("   Total pixels: {}", self.total_pixels);
        println!("   Estimated constraints: {}", self.estimated_constraints);
        println!("   Circuit size needed: 2^{:.1} rows",
                 (self.estimated_constraints as f64).log2());
    }
}

/// Validate image for ZK processing
pub fn validate_image_for_zk(image: &DynamicImage, max_size: usize) -> Result<(), String> {
    let (width, height) = image.dimensions();
    let total_pixels = (width * height) as usize;

    if total_pixels > max_size {
        return Err(format!(
            "Image too large: {}x{} ({} pixels) exceeds max size {}",
            width, height, total_pixels, max_size
        ));
    }

    if total_pixels == 0 {
        return Err("Image is empty".to_string());
    }

    Ok(())
}
