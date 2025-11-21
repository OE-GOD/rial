import Foundation
import Combine
import CryptoKit
import UIKit

enum AttestationError: LocalizedError {
    case keyGenerationFailed
    case signingFailed
    case merkleTreeFailed
    case imageProcessingFailed
    
    var errorDescription: String? {
        switch self {
        case .keyGenerationFailed:
            return "Failed to generate or retrieve cryptographic keys"
        case .signingFailed:
            return "Failed to sign image data"
        case .merkleTreeFailed:
            return "Failed to create Merkle tree from image"
        case .imageProcessingFailed:
            return "Failed to process image data"
        }
    }
}

class AuthenticityManager: ObservableObject {
    static let shared = AuthenticityManager()
    
    @Published var isReady: Bool = false
    
    private let secureEnclaveManager = SecureEnclaveManager.shared
    private let appAttestManager = AppAttestManager.shared
    
    private init() {
        setupIfNeeded()
    }
    
    func setupIfNeeded() {
        // Generate Secure Enclave key pair if needed
        secureEnclaveManager.generateAsymmetricKeyPairIfNeeded()
        
        // Check if App Attest is ready
        DispatchQueue.main.async {
            self.isReady = self.appAttestManager.isReady()
            print("✅ AuthenticityManager ready. App Attest: \(self.isReady)")
        }
    }
    
    func attestImage(_ image: AttestedImage, completion: @escaping (Result<AttestedImage, Error>) -> Void) {
        // Perform attestation on background thread
        DispatchQueue.global(qos: .userInitiated).async {
            do {
                // 1. Freeze image data FIRST to ensure consistency
                // This binary data will be:
                // a) Used to generate the Merkle tree
                // b) Signed by Secure Enclave
                // c) Uploaded to the server
                guard let frozenImageData = image.image.jpegData(compressionQuality: 0.9) else {
                    DispatchQueue.main.async {
                        completion(.failure(AttestationError.imageProcessingFailed))
                    }
                    return
                }
                
                // Create a temporary UIImage from the frozen data to ensure tiles match the binary exactly
                guard let frozenImageObj = UIImage(data: frozenImageData) else {
                    DispatchQueue.main.async {
                        completion(.failure(AttestationError.imageProcessingFailed))
                    }
                    return
                }
                
                // 2. Generate Merkle tree from the FROZEN image tiles
                let tiles = frozenImageObj.getTiles(tileSize: CGSize(width: 32, height: 32))
                
                guard !tiles.isEmpty else {
                    DispatchQueue.main.async {
                        completion(.failure(AttestationError.imageProcessingFailed))
                    }
                    return
                }
                
                print("📊 Generated \(tiles.count) tiles from image")
                
                let merkleTree = MerkleTree(dataBlocks: tiles)
                let merkleRoot = merkleTree.getRootHash()
                let merkleRootHex = merkleRoot.map { String(format: "%02x", $0) }.joined()
                
                print("🌳 Merkle root: \(merkleRootHex)")
                
                // 3. Sign the Merkle root with Secure Enclave
                guard let signature = self.secureEnclaveManager.sign(data: merkleRoot) else {
                    DispatchQueue.main.async {
                        completion(.failure(AttestationError.signingFailed))
                    }
                    return
                }
                
                let signatureBase64 = signature.base64EncodedString()
                print("✍️ Image signed: \(signatureBase64.prefix(40))...")
                
                // 4. Get public key
                guard let publicKeyData = try? self.secureEnclaveManager.exportPubKey() else {
                    DispatchQueue.main.async {
                        completion(.failure(AttestationError.keyGenerationFailed))
                    }
                    return
                }
                
                let publicKeyBase64 = publicKeyData.base64EncodedString()
                print("🔑 Public key: \(publicKeyBase64.prefix(40))...")
                
                // 5. Create C2PA claim
                let timestamp = ISO8601DateFormatter().string(from: Date())
                let c2paClaim = C2PAClaim(
                    imageRoot: merkleRootHex,
                    publicKey: publicKeyBase64,
                    signature: signatureBase64,
                    timestamp: timestamp
                )
                
                // 6. Create attested image with claim AND frozen data
                var attestedImage = image
                attestedImage.image = frozenImageObj // Use the re-hydrated image visual
                attestedImage.rawImageData = frozenImageData // Store the exact bytes!
                attestedImage.c2paClaim = c2paClaim
                
                print("✅ Image attestation complete!")
                print("   - Merkle root: \(merkleRootHex.prefix(40))...")
                print("   - Timestamp: \(timestamp)")
                print("   - Tiles: \(tiles.count)")
                print("   - Frozen Size: \(frozenImageData.count) bytes")
                
                DispatchQueue.main.async {
                    completion(.success(attestedImage))
                }
                
            } catch {
                DispatchQueue.main.async {
                    completion(.failure(error))
                }
            }
        }
    }
}
