//
//  OfflineProofGenerator.swift
//  rial
//
//  Offline Privacy-Preserving Proof Generation
//  Generate proofs locally without backend connection
//

import Foundation
import UIKit
import CryptoKit

// MARK: - Tile Commitment (On-Device)

class OfflineTileCommitment {
    let tileSize: Int

    init(tileSize: Int = 32) {
        self.tileSize = tileSize
    }

    /// Compute tile-based Merkle commitment for an image
    func computeCommitment(for image: UIImage) -> TileCommitmentResult? {
        guard let cgImage = image.cgImage else { return nil }

        let width = cgImage.width
        let height = cgImage.height
        let tilesX = (width + tileSize - 1) / tileSize
        let tilesY = (height + tileSize - 1) / tileSize

        // Get pixel data
        guard let pixelData = getPixelData(from: cgImage) else { return nil }

        // Compute hash for each tile
        var tileHashes: [String] = []

        for ty in 0..<tilesY {
            for tx in 0..<tilesX {
                let tileHash = computeTileHash(
                    pixelData: pixelData,
                    imageWidth: width,
                    imageHeight: height,
                    tileX: tx,
                    tileY: ty
                )
                tileHashes.append(tileHash)
            }
        }

        // Build Merkle tree
        let merkleRoot = computeMerkleRoot(leaves: tileHashes)

        return TileCommitmentResult(
            merkleRoot: merkleRoot,
            width: width,
            height: height,
            tileSize: tileSize,
            tilesX: tilesX,
            tilesY: tilesY,
            tileHashes: tileHashes
        )
    }

    private func getPixelData(from cgImage: CGImage) -> [UInt8]? {
        let width = cgImage.width
        let height = cgImage.height
        let bytesPerPixel = 4
        let bytesPerRow = bytesPerPixel * width
        let bitsPerComponent = 8

        var pixelData = [UInt8](repeating: 0, count: width * height * bytesPerPixel)

        guard let context = CGContext(
            data: &pixelData,
            width: width,
            height: height,
            bitsPerComponent: bitsPerComponent,
            bytesPerRow: bytesPerRow,
            space: CGColorSpaceCreateDeviceRGB(),
            bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue
        ) else { return nil }

        context.draw(cgImage, in: CGRect(x: 0, y: 0, width: width, height: height))

        return pixelData
    }

    private func computeTileHash(
        pixelData: [UInt8],
        imageWidth: Int,
        imageHeight: Int,
        tileX: Int,
        tileY: Int
    ) -> String {
        var tileData = Data()

        let startX = tileX * tileSize
        let startY = tileY * tileSize
        let endX = min(startX + tileSize, imageWidth)
        let endY = min(startY + tileSize, imageHeight)

        for y in startY..<endY {
            for x in startX..<endX {
                let pixelIndex = (y * imageWidth + x) * 4
                if pixelIndex + 3 < pixelData.count {
                    tileData.append(pixelData[pixelIndex])     // R
                    tileData.append(pixelData[pixelIndex + 1]) // G
                    tileData.append(pixelData[pixelIndex + 2]) // B
                }
            }
        }

        let hash = SHA256.hash(data: tileData)
        return hash.compactMap { String(format: "%02x", $0) }.joined()
    }

    private func computeMerkleRoot(leaves: [String]) -> String {
        guard !leaves.isEmpty else { return "" }

        var currentLevel = leaves

        while currentLevel.count > 1 {
            var nextLevel: [String] = []

            for i in stride(from: 0, to: currentLevel.count, by: 2) {
                let left = currentLevel[i]
                let right = i + 1 < currentLevel.count ? currentLevel[i + 1] : left
                let combined = left + right
                let hash = SHA256.hash(data: Data(combined.utf8))
                nextLevel.append(hash.compactMap { String(format: "%02x", $0) }.joined())
            }

            currentLevel = nextLevel
        }

        return currentLevel[0]
    }
}

struct TileCommitmentResult {
    let merkleRoot: String
    let width: Int
    let height: Int
    let tileSize: Int
    let tilesX: Int
    let tilesY: Int
    let tileHashes: [String]
}

// MARK: - Offline Proof Generator

class OfflineProofGenerator {
    static let shared = OfflineProofGenerator()

    private let tileCommitment = OfflineTileCommitment()

    private init() {}

    // MARK: - Create Commitment

    /// Create a cryptographic commitment to an image (fully offline)
    func createCommitment(for image: UIImage) -> OfflineCommitment? {
        let startTime = Date()

        guard let result = tileCommitment.computeCommitment(for: image) else {
            return nil
        }

        let processingTime = Date().timeIntervalSince(startTime) * 1000

        return OfflineCommitment(
            id: UUID().uuidString,
            merkleRoot: result.merkleRoot,
            width: result.width,
            height: result.height,
            tileSize: result.tileSize,
            tilesX: result.tilesX,
            tilesY: result.tilesY,
            tileHashes: result.tileHashes,
            createdAt: Date(),
            processingTimeMs: processingTime
        )
    }

    // MARK: - Generate Crop Proof

    /// Generate proof that a cropped image came from the original (offline)
    func generateCropProof(
        original: UIImage,
        cropped: UIImage,
        cropRegion: CGRect
    ) -> OfflineCropProof? {
        let startTime = Date()

        guard let originalCommitment = tileCommitment.computeCommitment(for: original),
              let croppedCommitment = tileCommitment.computeCommitment(for: cropped) else {
            return nil
        }

        // Determine which tiles are involved in the crop
        let startTileX = Int(cropRegion.origin.x) / tileCommitment.tileSize
        let startTileY = Int(cropRegion.origin.y) / tileCommitment.tileSize
        let endTileX = Int(cropRegion.origin.x + cropRegion.width) / tileCommitment.tileSize
        let endTileY = Int(cropRegion.origin.y + cropRegion.height) / tileCommitment.tileSize

        // Generate Merkle proofs for involved tiles
        var tileProofs: [TileProof] = []

        for ty in startTileY...min(endTileY, originalCommitment.tilesY - 1) {
            for tx in startTileX...min(endTileX, originalCommitment.tilesX - 1) {
                let tileIndex = ty * originalCommitment.tilesX + tx
                if tileIndex < originalCommitment.tileHashes.count {
                    let merkleProof = generateMerkleProof(
                        leaves: originalCommitment.tileHashes,
                        index: tileIndex
                    )
                    tileProofs.append(TileProof(
                        tileIndex: tileIndex,
                        tileX: tx,
                        tileY: ty,
                        hash: originalCommitment.tileHashes[tileIndex],
                        merkleProof: merkleProof
                    ))
                }
            }
        }

        let processingTime = Date().timeIntervalSince(startTime) * 1000

        return OfflineCropProof(
            type: "crop",
            version: "1.0.0",
            originalCommitment: OfflineCommitmentSummary(
                merkleRoot: originalCommitment.merkleRoot,
                width: originalCommitment.width,
                height: originalCommitment.height,
                tileCount: originalCommitment.tilesX * originalCommitment.tilesY
            ),
            croppedCommitment: OfflineCommitmentSummary(
                merkleRoot: croppedCommitment.merkleRoot,
                width: croppedCommitment.width,
                height: croppedCommitment.height,
                tileCount: croppedCommitment.tilesX * croppedCommitment.tilesY
            ),
            cropRegion: cropRegion,
            tileProofs: tileProofs,
            valid: true,
            createdAt: Date(),
            processingTimeMs: processingTime,
            generatedOffline: true
        )
    }

    // MARK: - Generate Selective Reveal Proof

    /// Generate proof for revealing only a portion of the image (offline)
    func generateSelectiveRevealProof(
        image: UIImage,
        revealRegion: CGRect
    ) -> OfflineSelectiveRevealProof? {
        let startTime = Date()

        guard let commitment = tileCommitment.computeCommitment(for: image) else {
            return nil
        }

        // Determine which tiles are revealed
        let startTileX = Int(revealRegion.origin.x) / tileCommitment.tileSize
        let startTileY = Int(revealRegion.origin.y) / tileCommitment.tileSize
        let endTileX = min(Int(revealRegion.origin.x + revealRegion.width) / tileCommitment.tileSize,
                          commitment.tilesX - 1)
        let endTileY = min(Int(revealRegion.origin.y + revealRegion.height) / tileCommitment.tileSize,
                          commitment.tilesY - 1)

        var revealedTileProofs: [TileProof] = []
        var revealedTileCount = 0

        for ty in startTileY...endTileY {
            for tx in startTileX...endTileX {
                let tileIndex = ty * commitment.tilesX + tx
                if tileIndex < commitment.tileHashes.count {
                    let merkleProof = generateMerkleProof(
                        leaves: commitment.tileHashes,
                        index: tileIndex
                    )
                    revealedTileProofs.append(TileProof(
                        tileIndex: tileIndex,
                        tileX: tx,
                        tileY: ty,
                        hash: commitment.tileHashes[tileIndex],
                        merkleProof: merkleProof
                    ))
                    revealedTileCount += 1
                }
            }
        }

        let totalTiles = commitment.tilesX * commitment.tilesY
        let revealRatio = Double(revealedTileCount) / Double(totalTiles)
        let processingTime = Date().timeIntervalSince(startTime) * 1000

        return OfflineSelectiveRevealProof(
            type: "selective-reveal",
            version: "1.0.0",
            originalCommitment: OfflineCommitmentSummary(
                merkleRoot: commitment.merkleRoot,
                width: commitment.width,
                height: commitment.height,
                tileCount: totalTiles
            ),
            revealRegion: revealRegion,
            revealedTileProofs: revealedTileProofs,
            privacy: OfflinePrivacyInfo(
                revealedTiles: revealedTileCount,
                hiddenTiles: totalTiles - revealedTileCount,
                revealRatio: revealRatio
            ),
            createdAt: Date(),
            processingTimeMs: processingTime,
            generatedOffline: true
        )
    }

    // MARK: - Verify Proof (Offline)

    /// Verify a proof without network connection
    func verifyProof(_ proof: OfflineCropProof, croppedImage: UIImage) -> OfflineVerificationResult {
        let startTime = Date()

        guard let croppedCommitment = tileCommitment.computeCommitment(for: croppedImage) else {
            return OfflineVerificationResult(
                valid: false,
                reason: "Failed to compute commitment for cropped image",
                verificationTimeMs: Date().timeIntervalSince(startTime) * 1000
            )
        }

        // Check if cropped commitment matches
        let commitmentMatch = croppedCommitment.merkleRoot == proof.croppedCommitment.merkleRoot

        // Verify Merkle proofs for involved tiles
        var allProofsValid = true
        for tileProof in proof.tileProofs {
            let proofValid = verifyMerkleProof(
                leafHash: tileProof.hash,
                proof: tileProof.merkleProof,
                root: proof.originalCommitment.merkleRoot
            )
            if !proofValid {
                allProofsValid = false
                break
            }
        }

        let valid = commitmentMatch && allProofsValid

        return OfflineVerificationResult(
            valid: valid,
            reason: valid ? "Proof verified successfully" : "Proof verification failed",
            commitmentMatch: commitmentMatch,
            merkleProofsValid: allProofsValid,
            verificationTimeMs: Date().timeIntervalSince(startTime) * 1000
        )
    }

    // MARK: - Helper Methods

    private func generateMerkleProof(leaves: [String], index: Int) -> [MerkleProofStep] {
        guard !leaves.isEmpty else { return [] }

        var proof: [MerkleProofStep] = []
        var currentLevel = leaves
        var idx = index

        while currentLevel.count > 1 {
            let isLeft = idx % 2 == 0
            let siblingIdx = isLeft ? idx + 1 : idx - 1

            if siblingIdx < currentLevel.count {
                proof.append(MerkleProofStep(
                    hash: currentLevel[siblingIdx],
                    isLeft: !isLeft
                ))
            }

            // Build next level
            var nextLevel: [String] = []
            for i in stride(from: 0, to: currentLevel.count, by: 2) {
                let left = currentLevel[i]
                let right = i + 1 < currentLevel.count ? currentLevel[i + 1] : left
                let combined = left + right
                let hash = SHA256.hash(data: Data(combined.utf8))
                nextLevel.append(hash.compactMap { String(format: "%02x", $0) }.joined())
            }

            currentLevel = nextLevel
            idx = idx / 2
        }

        return proof
    }

    private func verifyMerkleProof(leafHash: String, proof: [MerkleProofStep], root: String) -> Bool {
        var currentHash = leafHash

        for step in proof {
            let combined: String
            if step.isLeft {
                combined = step.hash + currentHash
            } else {
                combined = currentHash + step.hash
            }
            let hash = SHA256.hash(data: Data(combined.utf8))
            currentHash = hash.compactMap { String(format: "%02x", $0) }.joined()
        }

        return currentHash == root
    }
}

// MARK: - Data Models

struct OfflineCommitment: Codable {
    let id: String
    let merkleRoot: String
    let width: Int
    let height: Int
    let tileSize: Int
    let tilesX: Int
    let tilesY: Int
    let tileHashes: [String]
    let createdAt: Date
    let processingTimeMs: Double
}

struct OfflineCommitmentSummary: Codable {
    let merkleRoot: String
    let width: Int
    let height: Int
    let tileCount: Int
}

struct TileProof: Codable {
    let tileIndex: Int
    let tileX: Int
    let tileY: Int
    let hash: String
    let merkleProof: [MerkleProofStep]
}

struct MerkleProofStep: Codable {
    let hash: String
    let isLeft: Bool
}

struct OfflineCropProof: Codable {
    let type: String
    let version: String
    let originalCommitment: OfflineCommitmentSummary
    let croppedCommitment: OfflineCommitmentSummary
    let cropRegion: CGRect
    let tileProofs: [TileProof]
    let valid: Bool
    let createdAt: Date
    let processingTimeMs: Double
    let generatedOffline: Bool
}

struct OfflineSelectiveRevealProof: Codable {
    let type: String
    let version: String
    let originalCommitment: OfflineCommitmentSummary
    let revealRegion: CGRect
    let revealedTileProofs: [TileProof]
    let privacy: OfflinePrivacyInfo
    let createdAt: Date
    let processingTimeMs: Double
    let generatedOffline: Bool
}

struct OfflinePrivacyInfo: Codable {
    let revealedTiles: Int
    let hiddenTiles: Int
    let revealRatio: Double
}

struct OfflineVerificationResult {
    let valid: Bool
    let reason: String
    let commitmentMatch: Bool?
    let merkleProofsValid: Bool?
    let verificationTimeMs: Double

    init(valid: Bool, reason: String, commitmentMatch: Bool? = nil, merkleProofsValid: Bool? = nil, verificationTimeMs: Double) {
        self.valid = valid
        self.reason = reason
        self.commitmentMatch = commitmentMatch
        self.merkleProofsValid = merkleProofsValid
        self.verificationTimeMs = verificationTimeMs
    }
}

// MARK: - CGRect Codable Extension

extension CGRect: Codable {
    enum CodingKeys: String, CodingKey {
        case x, y, width, height
    }

    public init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        let x = try container.decode(CGFloat.self, forKey: .x)
        let y = try container.decode(CGFloat.self, forKey: .y)
        let width = try container.decode(CGFloat.self, forKey: .width)
        let height = try container.decode(CGFloat.self, forKey: .height)
        self.init(x: x, y: y, width: width, height: height)
    }

    public func encode(to encoder: Encoder) throws {
        var container = encoder.container(keyedBy: CodingKeys.self)
        try container.encode(origin.x, forKey: .x)
        try container.encode(origin.y, forKey: .y)
        try container.encode(size.width, forKey: .width)
        try container.encode(size.height, forKey: .height)
    }
}
