//
//  ProofExporter.swift
//  rial
//
//  Export and share certified photos with proofs
//

import Foundation
import UIKit

class ProofExporter {
    static let shared = ProofExporter()
    
    private init() {}
    
    /// Export complete proof package
    func exportProofPackage(attestedImage: AttestedImage, offlineResult: OfflineCertificationResult? = nil) -> URL? {
        let package = ProofPackage(
            image: attestedImage.imageData?.base64EncodedString() ?? "",
            c2paClaim: encodeClaim(attestedImage.c2paClaim),
            metadata: encodeMetadata(attestedImage.proofMetadata),
            offlineCertification: offlineResult,
            exportDate: Date(),
            appVersion: Bundle.main.infoDictionary?["CFBundleShortVersionString"] as? String ?? "1.0"
        )
        
        guard let jsonData = try? JSONEncoder().encode(package),
              let jsonString = String(data: jsonData, encoding: .utf8) else {
            return nil
        }
        
        // Save to temporary file
        let filename = "rial-proof-\(Int(Date().timeIntervalSince1970)).json"
        let tempURL = FileManager.default.temporaryDirectory.appendingPathComponent(filename)
        
        do {
            try jsonString.write(to: tempURL, atomically: true, encoding: .utf8)
            print("✅ Proof package exported: \(filename)")
            return tempURL
        } catch {
            print("❌ Export failed: \(error)")
            return nil
        }
    }
    
    /// Generate shareable text
    func generateShareableText(attestedImage: AttestedImage) -> String {
        var text = "📸 Certified Authentic Photo\n\n"
        
        if let claim = attestedImage.c2paClaim {
            text += "🔐 Cryptographically Signed\n"
            text += "Merkle Root: \(String(claim.imageRoot.prefix(16)))...\n"
            text += "Timestamp: \(claim.timestamp)\n\n"
        }
        
        if let metadata = attestedImage.proofMetadata {
            text += "📊 Anti-AI Proof:\n"
            text += "• Camera: \(metadata.cameraModel)\n"
            if let lat = metadata.latitude, let lon = metadata.longitude {
                text += "• Location: \(lat), \(lon)\n"
            }
            if metadata.accelerometerX != nil {
                text += "• Motion sensors: ✅\n"
            }
            text += "\n"
        }
        
        text += "✨ Verified by Rial - Insurance Fraud Prevention\n"
        text += "Learn more: https://github.com/irving4444/rial"
        
        return text
    }
    
    /// Create QR code for proof verification
    func generateVerificationQR(proofId: String) -> UIImage? {
        let verificationURL = "rial://verify/\(proofId)"
        return QRCodeGenerator.generateQRCode(from: verificationURL)
    }
    
    private func encodeClaim(_ claim: C2PAClaim?) -> String {
        guard let claim = claim,
              let data = try? JSONEncoder().encode(claim),
              let string = String(data: data, encoding: .utf8) else {
            return "{}"
        }
        return string
    }
    
    private func encodeMetadata(_ metadata: ProofMetadata?) -> String {
        guard let metadata = metadata,
              let data = try? JSONEncoder().encode(metadata),
              let string = String(data: data, encoding: .utf8) else {
            return "{}"
        }
        return string
    }
}

struct ProofPackage: Codable {
    let image: String // base64
    let c2paClaim: String // JSON
    let metadata: String // JSON
    let offlineCertification: OfflineCertificationResult?
    let exportDate: Date
    let appVersion: String
    let format: String = "rial-proof-v1"
    
    var humanReadableSummary: String {
        """
        Rial Proof Package
        ==================
        
        Format: \(format)
        App Version: \(appVersion)
        Export Date: \(exportDate)
        
        Contains:
        • Certified image
        • Cryptographic signature
        • Anti-AI metadata
        • Verification data
        
        This package can be independently verified by anyone.
        """
    }
}

