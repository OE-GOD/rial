import Foundation
import UIKit
import CryptoKit

struct AttestedImage {
    var image: UIImage
    var c2paClaim: C2PAClaim?
    var proofMetadata: ProofMetadata?  // Anti-AI proof data
    
    // Store exact binary data used for signing to prevent hash mismatch
    var rawImageData: Data?

    var imageData: Data? {
        // Return frozen data if available (CRITICAL for verification)
        if let data = rawImageData {
            return data
        }
        // Fallback: Use high quality compression (0.9)
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
