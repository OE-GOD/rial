//
//  OfflineProofTestView.swift
//  rial
//
//  Test view for Offline Proof Generation
//

import SwiftUI
import UIKit

struct OfflineProofTestView: View {
    @State private var testResults: [TestResult] = []
    @State private var isRunning = false
    @State private var overallStatus = ""
    @State private var testImage: UIImage?

    var body: some View {
        NavigationView {
            ZStack {
                // Background
                LinearGradient(
                    gradient: Gradient(colors: [
                        Color(red: 0.05, green: 0.1, blue: 0.15),
                        Color(red: 0.1, green: 0.15, blue: 0.25)
                    ]),
                    startPoint: .topLeading,
                    endPoint: .bottomTrailing
                )
                .ignoresSafeArea()

                ScrollView {
                    VStack(spacing: 20) {
                        // Header
                        headerSection

                        // Test Image Preview
                        if let image = testImage {
                            imagePreview(image)
                        }

                        // Run Tests Button
                        runTestsButton

                        // Results
                        if !testResults.isEmpty {
                            resultsSection
                        }

                        // Overall Status
                        if !overallStatus.isEmpty {
                            overallStatusSection
                        }
                    }
                    .padding()
                }
            }
            .navigationTitle("Offline Proof Tests")
            .navigationBarTitleDisplayMode(.inline)
            .onAppear {
                createTestImage()
            }
        }
    }

    // MARK: - UI Components

    private var headerSection: some View {
        VStack(spacing: 8) {
            Image(systemName: "airplane.circle.fill")
                .font(.system(size: 50))
                .foregroundColor(.blue)

            Text("Offline Proof Generator")
                .font(.title2.bold())
                .foregroundColor(.white)

            Text("Test privacy-preserving proofs without network")
                .font(.subheadline)
                .foregroundColor(.white.opacity(0.7))
                .multilineTextAlignment(.center)
        }
        .padding()
    }

    private func imagePreview(_ image: UIImage) -> some View {
        VStack(spacing: 8) {
            Text("Test Image")
                .font(.caption)
                .foregroundColor(.white.opacity(0.6))

            Image(uiImage: image)
                .resizable()
                .aspectRatio(contentMode: .fit)
                .frame(height: 150)
                .clipShape(RoundedRectangle(cornerRadius: 12))
                .overlay(
                    RoundedRectangle(cornerRadius: 12)
                        .stroke(Color.white.opacity(0.3), lineWidth: 1)
                )

            Text("\(Int(image.size.width)) x \(Int(image.size.height)) pixels")
                .font(.caption2)
                .foregroundColor(.white.opacity(0.5))
        }
        .padding()
        .background(
            RoundedRectangle(cornerRadius: 16)
                .fill(Color.white.opacity(0.1))
        )
    }

    private var runTestsButton: some View {
        Button(action: runAllTests) {
            HStack {
                if isRunning {
                    ProgressView()
                        .progressViewStyle(CircularProgressViewStyle(tint: .white))
                } else {
                    Image(systemName: "play.fill")
                }
                Text(isRunning ? "Running Tests..." : "Run All Tests")
                    .fontWeight(.semibold)
            }
            .foregroundColor(.white)
            .frame(maxWidth: .infinity)
            .padding()
            .background(
                LinearGradient(
                    colors: isRunning ? [.gray] : [.blue, .purple],
                    startPoint: .leading,
                    endPoint: .trailing
                )
            )
            .cornerRadius(12)
        }
        .disabled(isRunning)
    }

    private var resultsSection: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("Test Results")
                .font(.headline)
                .foregroundColor(.white)

            ForEach(testResults) { result in
                testResultRow(result)
            }
        }
        .padding()
        .background(
            RoundedRectangle(cornerRadius: 16)
                .fill(Color.white.opacity(0.1))
        )
    }

    private func testResultRow(_ result: TestResult) -> some View {
        HStack {
            Image(systemName: result.passed ? "checkmark.circle.fill" : "xmark.circle.fill")
                .foregroundColor(result.passed ? .green : .red)

            VStack(alignment: .leading, spacing: 2) {
                Text(result.name)
                    .font(.subheadline)
                    .foregroundColor(.white)

                if let detail = result.detail {
                    Text(detail)
                        .font(.caption)
                        .foregroundColor(.white.opacity(0.6))
                }
            }

            Spacer()

            Text(result.time)
                .font(.caption)
                .foregroundColor(.white.opacity(0.5))
        }
        .padding(.vertical, 4)
    }

    private var overallStatusSection: some View {
        HStack {
            Image(systemName: testResults.allSatisfy({ $0.passed }) ? "checkmark.seal.fill" : "exclamationmark.triangle.fill")
                .font(.title)
                .foregroundColor(testResults.allSatisfy({ $0.passed }) ? .green : .orange)

            Text(overallStatus)
                .font(.headline)
                .foregroundColor(.white)
        }
        .padding()
        .frame(maxWidth: .infinity)
        .background(
            RoundedRectangle(cornerRadius: 12)
                .fill(testResults.allSatisfy({ $0.passed }) ? Color.green.opacity(0.2) : Color.orange.opacity(0.2))
        )
    }

    // MARK: - Test Logic

    private func createTestImage() {
        // Create a simple gradient test image
        let size = CGSize(width: 200, height: 200)
        UIGraphicsBeginImageContextWithOptions(size, false, 1.0)

        guard let context = UIGraphicsGetCurrentContext() else { return }

        // Draw gradient background
        let colors = [UIColor.blue.cgColor, UIColor.purple.cgColor]
        let gradient = CGGradient(colorsSpace: CGColorSpaceCreateDeviceRGB(),
                                  colors: colors as CFArray,
                                  locations: [0, 1])!
        context.drawLinearGradient(gradient,
                                   start: CGPoint(x: 0, y: 0),
                                   end: CGPoint(x: size.width, y: size.height),
                                   options: [])

        // Draw some shapes for visual verification
        context.setFillColor(UIColor.white.withAlphaComponent(0.3).cgColor)
        context.fillEllipse(in: CGRect(x: 50, y: 50, width: 100, height: 100))

        context.setFillColor(UIColor.yellow.withAlphaComponent(0.5).cgColor)
        context.fill(CGRect(x: 20, y: 120, width: 60, height: 60))

        testImage = UIGraphicsGetImageFromCurrentImageContext()
        UIGraphicsEndImageContext()
    }

    private func runAllTests() {
        guard let image = testImage else { return }

        isRunning = true
        testResults = []
        overallStatus = ""

        DispatchQueue.global(qos: .userInitiated).async {
            var results: [TestResult] = []

            // Test 1: Create Commitment
            let test1 = testCreateCommitment(image: image)
            results.append(test1)

            // Test 2: Crop Proof
            let test2 = testCropProof(image: image)
            results.append(test2)

            // Test 3: Selective Reveal
            let test3 = testSelectiveReveal(image: image)
            results.append(test3)

            // Test 4: Verify Proof
            let test4 = testVerifyProof(image: image)
            results.append(test4)

            // Test 5: Performance
            let test5 = testPerformance(image: image)
            results.append(test5)

            DispatchQueue.main.async {
                self.testResults = results
                let passed = results.filter { $0.passed }.count
                self.overallStatus = "\(passed)/\(results.count) tests passed"
                self.isRunning = false
            }
        }
    }

    private func testCreateCommitment(image: UIImage) -> TestResult {
        let start = Date()

        guard let commitment = OfflineProofGenerator.shared.createCommitment(for: image) else {
            return TestResult(
                name: "Create Commitment",
                passed: false,
                detail: "Failed to create commitment",
                time: formatTime(Date().timeIntervalSince(start))
            )
        }

        let elapsed = Date().timeIntervalSince(start)

        return TestResult(
            name: "Create Commitment",
            passed: true,
            detail: "Root: \(commitment.merkleRoot.prefix(16))... | \(commitment.tilesX * commitment.tilesY) tiles",
            time: formatTime(elapsed)
        )
    }

    private func testCropProof(image: UIImage) -> TestResult {
        let start = Date()

        // Create cropped version
        let cropRect = CGRect(x: 50, y: 50, width: 100, height: 100)
        guard let cgImage = image.cgImage,
              let croppedCGImage = cgImage.cropping(to: cropRect) else {
            return TestResult(
                name: "Crop Proof",
                passed: false,
                detail: "Failed to crop image",
                time: formatTime(Date().timeIntervalSince(start))
            )
        }

        let croppedImage = UIImage(cgImage: croppedCGImage)

        guard let proof = OfflineProofGenerator.shared.generateCropProof(
            original: image,
            cropped: croppedImage,
            cropRegion: cropRect
        ) else {
            return TestResult(
                name: "Crop Proof",
                passed: false,
                detail: "Failed to generate proof",
                time: formatTime(Date().timeIntervalSince(start))
            )
        }

        let elapsed = Date().timeIntervalSince(start)

        return TestResult(
            name: "Crop Proof",
            passed: proof.valid,
            detail: "\(proof.tileProofs.count) tile proofs generated",
            time: formatTime(elapsed)
        )
    }

    private func testSelectiveReveal(image: UIImage) -> TestResult {
        let start = Date()

        let revealRegion = CGRect(x: 30, y: 30, width: 80, height: 80)

        guard let proof = OfflineProofGenerator.shared.generateSelectiveRevealProof(
            image: image,
            revealRegion: revealRegion
        ) else {
            return TestResult(
                name: "Selective Reveal",
                passed: false,
                detail: "Failed to generate proof",
                time: formatTime(Date().timeIntervalSince(start))
            )
        }

        let elapsed = Date().timeIntervalSince(start)
        let ratio = String(format: "%.1f%%", proof.privacy.revealRatio * 100)

        return TestResult(
            name: "Selective Reveal",
            passed: true,
            detail: "\(proof.privacy.revealedTiles) tiles revealed (\(ratio))",
            time: formatTime(elapsed)
        )
    }

    private func testVerifyProof(image: UIImage) -> TestResult {
        let start = Date()

        // Generate a crop proof
        let cropRect = CGRect(x: 20, y: 20, width: 80, height: 80)
        guard let cgImage = image.cgImage,
              let croppedCGImage = cgImage.cropping(to: cropRect) else {
            return TestResult(
                name: "Verify Proof",
                passed: false,
                detail: "Failed to create test crop",
                time: formatTime(Date().timeIntervalSince(start))
            )
        }

        let croppedImage = UIImage(cgImage: croppedCGImage)

        guard let proof = OfflineProofGenerator.shared.generateCropProof(
            original: image,
            cropped: croppedImage,
            cropRegion: cropRect
        ) else {
            return TestResult(
                name: "Verify Proof",
                passed: false,
                detail: "Failed to generate proof for verification",
                time: formatTime(Date().timeIntervalSince(start))
            )
        }

        // Verify the proof
        let result = OfflineProofGenerator.shared.verifyProof(proof, croppedImage: croppedImage)

        let elapsed = Date().timeIntervalSince(start)

        return TestResult(
            name: "Verify Proof",
            passed: result.valid,
            detail: result.reason,
            time: formatTime(elapsed)
        )
    }

    private func testPerformance(image: UIImage) -> TestResult {
        let iterations = 5
        var times: [Double] = []

        for _ in 0..<iterations {
            let start = Date()
            _ = OfflineProofGenerator.shared.createCommitment(for: image)
            times.append(Date().timeIntervalSince(start))
        }

        let avgTime = times.reduce(0, +) / Double(times.count)
        let passed = avgTime < 0.5 // Should complete in under 500ms

        return TestResult(
            name: "Performance",
            passed: passed,
            detail: "Avg: \(String(format: "%.0f", avgTime * 1000))ms over \(iterations) iterations",
            time: formatTime(avgTime)
        )
    }

    private func formatTime(_ seconds: Double) -> String {
        if seconds < 0.001 {
            return String(format: "%.2fµs", seconds * 1_000_000)
        } else if seconds < 1 {
            return String(format: "%.1fms", seconds * 1000)
        } else {
            return String(format: "%.2fs", seconds)
        }
    }
}

// MARK: - Test Result Model

struct TestResult: Identifiable {
    let id = UUID()
    let name: String
    let passed: Bool
    let detail: String?
    let time: String
}

// MARK: - Preview

struct OfflineProofTestView_Previews: PreviewProvider {
    static var previews: some View {
        OfflineProofTestView()
    }
}
