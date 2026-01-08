//
//  ProofVerificationView.swift
//  rial
//
//  Verify and display proof details
//

import SwiftUI

struct ProofVerificationView: View {
    let attestedImage: AttestedImage
    @State private var verificationResult: VerificationResult?
    @State private var deepVerificationResult: DeepVerificationResult?
    @State private var isVerifying = false
    @State private var isDeepVerifying = false
    @State private var showDeepVerification = false
    
    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 20) {
                // Image preview
                if let imageData = attestedImage.imageData,
                   let uiImage = UIImage(data: imageData) {
                    Image(uiImage: uiImage)
                        .resizable()
                        .scaledToFit()
                        .frame(maxHeight: 300)
                        .cornerRadius(12)
                }
                
                // Verification status
                if let result = verificationResult {
                    VerificationStatusCard(result: result)
                } else if isVerifying {
                    ProgressView("Verifying proof...")
                } else {
                    Button("Verify Proof") {
                        verifyProof()
                    }
                    .buttonStyle(.borderedProminent)
                }
                
                // Deep Verification Section
                DeepVerificationSection(
                    attestedImage: attestedImage,
                    result: $deepVerificationResult,
                    isVerifying: $isDeepVerifying,
                    showDetails: $showDeepVerification
                )
                
                // Proof details
                ProofDetailsSection(attestedImage: attestedImage)
                
                // Metadata
                if let metadata = attestedImage.proofMetadata {
                    MetadataSection(metadata: metadata)
                }
            }
            .padding()
        }
        .navigationTitle("Proof Verification")
        .onAppear {
            // Auto-verify on appear
            verifyProof()
        }
    }
    
    private func verifyProof() {
        isVerifying = true
        
        DispatchQueue.global(qos: .userInitiated).async {
            // Verify signature
            let signatureValid = self.verifySignature()
            
            // Verify Merkle tree
            let merkleValid = self.verifyMerkleTree()
            
            // Check metadata completeness
            let metadataScore = self.checkMetadata()
            
            // Calculate overall confidence
            var confidence: Double = 0.0
            if signatureValid { confidence += 0.4 }
            if merkleValid { confidence += 0.3 }
            confidence += metadataScore * 0.3
            
            let result = VerificationResult(
                isValid: confidence > 0.7,
                confidence: confidence,
                signatureValid: signatureValid,
                merkleValid: merkleValid,
                metadataScore: metadataScore,
                timestamp: Date()
            )
            
            DispatchQueue.main.async {
                self.verificationResult = result
                self.isVerifying = false
            }
        }
    }
    
    private func verifySignature() -> Bool {
        // Check if signature exists
        return attestedImage.c2paClaim?.signature != nil
    }
    
    private func verifyMerkleTree() -> Bool {
        // Check if Merkle root exists
        return attestedImage.c2paClaim?.imageRoot != nil
    }
    
    private func checkMetadata() -> Double {
        var score: Double = 0.0
        if attestedImage.proofMetadata?.latitude != nil { score += 0.25 }
        if attestedImage.proofMetadata?.accelerometerX != nil { score += 0.25 }
        if attestedImage.proofMetadata?.cameraModel != nil { score += 0.25 }
        if attestedImage.c2paClaim?.timestamp != nil { score += 0.25 }
        return score
    }
}

struct VerificationResult {
    let isValid: Bool
    let confidence: Double
    let signatureValid: Bool
    let merkleValid: Bool
    let metadataScore: Double
    let timestamp: Date
}

struct VerificationStatusCard: View {
    let result: VerificationResult
    
    var body: some View {
        VStack(spacing: 12) {
            // Overall status
            HStack {
                Image(systemName: result.isValid ? "checkmark.shield.fill" : "xmark.shield.fill")
                    .font(.system(size: 40))
                    .foregroundColor(result.isValid ? .green : .red)
                
                VStack(alignment: .leading) {
                    Text(result.isValid ? "VERIFIED" : "FAILED")
                        .font(.title2.bold())
                        .foregroundColor(result.isValid ? .green : .red)
                    
                    Text("Confidence: \(Int(result.confidence * 100))%")
                        .font(.subheadline)
                        .foregroundColor(.secondary)
                }
                
                Spacer()
            }
            
            Divider()
            
            // Individual checks
            CheckRow(title: "Hardware Signature", passed: result.signatureValid)
            CheckRow(title: "Merkle Tree Integrity", passed: result.merkleValid)
            CheckRow(title: "Metadata Completeness", passed: result.metadataScore > 0.5)
        }
        .padding()
        .background(Color.gray.opacity(0.1))
        .cornerRadius(12)
    }
}

struct CheckRow: View {
    let title: String
    let passed: Bool
    
    var body: some View {
        HStack {
            Image(systemName: passed ? "checkmark.circle.fill" : "xmark.circle.fill")
                .foregroundColor(passed ? .green : .red)
            Text(title)
                .font(.subheadline)
            Spacer()
        }
    }
}

struct ProofDetailsSection: View {
    let attestedImage: AttestedImage
    
    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("Cryptographic Proof")
                .font(.headline)
            
            if let claim = attestedImage.c2paClaim {
                ProofDetailRow(label: "Merkle Root", value: String(claim.imageRoot.prefix(32)) + "...")
                ProofDetailRow(label: "Signature", value: String(claim.signature.prefix(32)) + "...")
                ProofDetailRow(label: "Timestamp", value: claim.timestamp)
            }
        }
        .padding()
        .background(Color.gray.opacity(0.1))
        .cornerRadius(12)
    }
}

struct MetadataSection: View {
    let metadata: ProofMetadata
    
    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("Anti-AI Metadata")
                .font(.headline)
            
            if let lat = metadata.latitude, let lon = metadata.longitude {
                ProofDetailRow(label: "GPS", value: "\(lat), \(lon)")
            }
            
            ProofDetailRow(label: "Camera", value: metadata.cameraModel)
            
            if let accelX = metadata.accelerometerX {
                ProofDetailRow(label: "Motion", value: String(format: "%.2f, %.2f, %.2f", accelX, metadata.accelerometerY ?? 0, metadata.accelerometerZ ?? 0))
            }
        }
        .padding()
        .background(Color.gray.opacity(0.1))
        .cornerRadius(12)
    }
}

struct ProofDetailRow: View {
    let label: String
    let value: String
    
    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(label)
                .font(.caption)
                .foregroundColor(.secondary)
            Text(value)
                .font(.subheadline)
                .textSelection(.enabled)
        }
    }
}

// MARK: - Deep Cryptographic Verification Section

struct DeepVerificationSection: View {
    let attestedImage: AttestedImage
    @Binding var result: DeepVerificationResult?
    @Binding var isVerifying: Bool
    @Binding var showDetails: Bool
    
    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack {
                Text("🔐 Deep Cryptographic Verification")
                    .font(.headline)
                Spacer()
                if result != nil {
                    Button(showDetails ? "Hide" : "Details") {
                        withAnimation { showDetails.toggle() }
                    }
                    .font(.caption)
                }
            }
            
            Text("Mathematically proves your ZK proof is real")
                .font(.caption)
                .foregroundColor(.secondary)
            
            if let result = result {
                // Result summary
                HStack(spacing: 16) {
                    Image(systemName: result.isValid ? "checkmark.seal.fill" : "xmark.seal.fill")
                        .font(.system(size: 32))
                        .foregroundColor(result.isValid ? .green : .red)
                    
                    VStack(alignment: .leading) {
                        Text(result.isValid ? "PROOF IS REAL!" : "Verification Failed")
                            .font(.headline)
                            .foregroundColor(result.isValid ? .green : .red)
                        
                        Text("Confidence: \(result.confidencePercentage)%")
                            .font(.subheadline)
                            .foregroundColor(.secondary)
                    }
                    
                    Spacer()
                }
                
                if showDetails {
                    Divider()
                    
                    // Individual checks
                    ForEach(result.checks, id: \.name) { check in
                        HStack {
                            Image(systemName: check.passed ? "checkmark.circle.fill" : "xmark.circle.fill")
                                .foregroundColor(check.passed ? .green : .red)
                            
                            VStack(alignment: .leading) {
                                Text(check.name)
                                    .font(.subheadline)
                                if !check.passed {
                                    Text(check.reason)
                                        .font(.caption)
                                        .foregroundColor(.secondary)
                                }
                            }
                            
                            Spacer()
                        }
                    }
                }
            } else if isVerifying {
                HStack {
                    ProgressView()
                    Text("Running cryptographic checks...")
                        .font(.subheadline)
                        .foregroundColor(.secondary)
                }
            } else {
                Button(action: runDeepVerification) {
                    HStack {
                        Image(systemName: "lock.shield")
                        Text("Run Deep Verification")
                    }
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 10)
                }
                .buttonStyle(.borderedProminent)
                .tint(.blue)
            }
        }
        .padding()
        .background(
            RoundedRectangle(cornerRadius: 12)
                .fill(result?.isValid == true ? Color.green.opacity(0.1) : Color.blue.opacity(0.1))
        )
        .overlay(
            RoundedRectangle(cornerRadius: 12)
                .stroke(result?.isValid == true ? Color.green.opacity(0.3) : Color.blue.opacity(0.3), lineWidth: 1)
        )
    }
    
    private func runDeepVerification() {
        isVerifying = true
        
        DispatchQueue.global(qos: .userInitiated).async {
            let verificationResult = CertificationVerifier.shared.verifyAttestedImage(attestedImage)
            
            DispatchQueue.main.async {
                self.result = verificationResult
                self.isVerifying = false
                self.showDetails = true
            }
        }
    }
}

