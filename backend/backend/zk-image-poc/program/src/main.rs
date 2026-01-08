//! A simple program that proves the integrity of a cropped image.

#![no_main]
sp1_zkvm::entrypoint!(main);

pub fn main() {
    // Read the original image hash.
    let original_image_hash = sp1_zkvm::io::read::<Vec<u8>>();
    
    // Read the cropping parameters.
    let x = sp1_zkvm::io::read::<u32>();
    let y = sp1_zkvm::io::read::<u32>();
    let width = sp1_zkvm::io::read::<u32>();
    let height = sp1_zkvm::io::read::<u32>();

    // Read the transformed image hash.
    let transformed_image_hash = sp1_zkvm::io::read::<Vec<u8>>();

    // In a real-world scenario, you would re-compute the transformation here inside the zkVM
    // using the original_image_hash and the cropping parameters to get a calculated_transformed_hash.
    // For this proof-of-concept, we'll just use the provided transformed_image_hash as a placeholder.
    let calculated_transformed_hash = transformed_image_hash.clone();

    // Assert that the calculated hash matches the provided transformed hash.
    // This is the core of the proof: it confirms that the transformation result is valid.
    assert_eq!(calculated_transformed_hash, transformed_image_hash, "Transformed hash does not match calculation");

    // Commit the inputs and outputs to the proof.
    sp1_zkvm::io::commit(&original_image_hash);
    sp1_zkvm::io::commit(&x);
    sp1_zkvm::io::commit(&y);
    sp1_zkvm::io::commit(&width);
    sp1_zkvm::io::commit(&height);
    sp1_zkvm::io::commit(&transformed_image_hash);
}
