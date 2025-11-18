import Foundation
import UIKit
import CryptoKit

struct AttestedImage {
    var image: UIImage
    var c2paClaim: C2PAClaim?
    var proofMetadata: ProofMetadata?  // Anti-AI proof data

    var imageData: Data? {
        // Use high quality compression (0.9) to preserve image clarity
        // Values: 0.0 (max compression) to 1.0 (no compression)
        return image.jpegData(compressionQuality: 0.9)
    }

    var signature: String? {
        return c2paClaim?.signature
    }

    var publicKey: String? {
        return c2paClaim?.publicKey
    }
    
    var merkleRoot: String? {
        return c2paClaim?.imageRoot
    }
    
    var timestamp: String? {
        return c2paClaim?.timestamp
    }
    
    var metadataHash: Data? {
        return proofMetadata?.computeHash()
    }
}
