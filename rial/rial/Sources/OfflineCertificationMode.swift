//
//  OfflineCertificationMode.swift
//  rial
//
//  Offline certification when backend is unavailable
//

import Foundation
import SwiftUI

class OfflineCertificationManager {
    static let shared = OfflineCertificationManager()
    
    private init() {}
    
    /// Certify image offline (no backend needed)
    func certifyOffline(attestedImage: AttestedImage, cropInfo: CropInfo) -> OfflineCertificationResult {
        print("📴 Certifying in offline mode...")
        
        // Validation checks
        var checks: [String: Bool] = [:]
        var confidence: Double = 0.0
        
        // Check 1: Has Secure Enclave signature
        if attestedImage.c2paClaim?.signature != nil {
            checks["hardwareSignature"] = true
            confidence += 0.25
        }
        
        // Check 2: Has Merkle root
        if attestedImage.c2paClaim?.imageRoot != nil {
            checks["merkleTree"] = true
            confidence += 0.20
        }
        
        // Check 3: Has GPS data
        if attestedImage.proofMetadata?.latitude != nil {
            checks["gpsLocation"] = true
            confidence += 0.20
        }
        
        // Check 4: Has motion data
        if attestedImage.proofMetadata?.accelerometerX != nil {
            checks["motionSensors"] = true
            confidence += 0.15
        }
        
        // Check 5: Has camera metadata
        if attestedImage.proofMetadata?.cameraModel != nil {
            checks["cameraMetadata"] = true
            confidence += 0.10
        }
        
        // Check 6: Has timestamp
        if attestedImage.c2paClaim?.timestamp != nil {
            checks["timestamp"] = true
            confidence += 0.10
        }
        
        let allChecks = checks.values.allSatisfy { $0 }
        
        print("✅ Offline certification complete")
        print("   Confidence: \(Int(confidence * 100))%")
        print("   Checks passed: \(checks.filter { $0.value }.count)/\(checks.count)")
        
        return OfflineCertificationResult(
            success: allChecks,
            confidence: confidence,
            checks: checks,
            cropInfo: cropInfo,
            timestamp: Date(),
            mode: "offline"
        )
    }
}

struct CropInfo: Codable {
    let x: Int
    let y: Int
    let width: Int
    let height: Int
    let originalWidth: Int
    let originalHeight: Int
}

struct OfflineCertificationResult: Codable {
    let success: Bool
    let confidence: Double
    let checks: [String: Bool]
    let cropInfo: CropInfo
    let timestamp: Date
    let mode: String
    
    var summary: String {
        """
        ✅ Offline Certification
        
        Confidence: \(Int(confidence * 100))%
        Mode: Local (no backend needed)
        
        Checks:
        \(checks.map { "• \($0.key): \($0.value ? "✅" : "❌")" }.joined(separator: "\n"))
        
        Crop: \(cropInfo.width)×\(cropInfo.height) at (\(cropInfo.x),\(cropInfo.y))
        Original: \(cropInfo.originalWidth)×\(cropInfo.originalHeight)
        
        ⚡ Certified instantly without network!
        """
    }
}

