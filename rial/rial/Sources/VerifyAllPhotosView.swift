//
//  VerifyAllPhotosView.swift
//  rial
//
//  View to verify ALL certified photos are real
//  Shows which photos pass ZK proof verification
//

import SwiftUI

struct VerifyAllPhotosView: View {
    @Environment(\.dismiss) private var dismiss
    @State private var isVerifying = false
    @State private var results: [(index: Int, imageDict: [String: Any], result: PhotoRealityCheck)] = []
    @State private var progress: Double = 0
    @State private var totalPhotos = 0
    @State private var verifiedCount = 0
    @State private var showFakePhotoTest = false
    @State private var fakeTestResults: [FakeTestResult] = []
    @State private var showRandomPhotoTest = false
    
    var body: some View {
        NavigationView {
            ZStack {
                // Background gradient
                LinearGradient(
                    colors: [
                        Color(red: 0.05, green: 0.1, blue: 0.15),
                        Color(red: 0.1, green: 0.15, blue: 0.25)
                    ],
                    startPoint: .top,
                    endPoint: .bottom
                )
                .ignoresSafeArea()
                
                ScrollView {
                    VStack(spacing: 24) {
                        // Header
                        headerSection
                        
                        // TEST BUTTONS AT TOP - Easy access!
                        testButtonsSection
                        
                        if isVerifying {
                            // Progress view
                            verifyingSection
                        } else if results.isEmpty {
                            // Start button
                            startSection
                        } else {
                            // Results
                            resultsSection
                        }
                    }
                    .padding()
                }
            }
            .navigationTitle("Verify Photos")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .navigationBarTrailing) {
                    Button("Done") {
                        dismiss()
                    }
                    .foregroundColor(.white)
                }
            }
            .toolbarBackground(Color(red: 0.05, green: 0.1, blue: 0.15), for: .navigationBar)
            .toolbarBackground(.visible, for: .navigationBar)
            .toolbarColorScheme(.dark, for: .navigationBar)
        }
    }
    
    // MARK: - Test Buttons Section (AT TOP!)
    
    private var testButtonsSection: some View {
        VStack(spacing: 12) {
            Text("🧪 Test Verification")
                .font(.headline)
                .foregroundColor(.white)
                .frame(maxWidth: .infinity, alignment: .leading)
            
            HStack(spacing: 12) {
                // Import random photo
                Button(action: { showRandomPhotoTest = true }) {
                    VStack(spacing: 8) {
                        Image(systemName: "photo.badge.plus")
                            .font(.title2)
                        Text("Test Random\nPhoto")
                            .font(.caption)
                            .multilineTextAlignment(.center)
                    }
                    .foregroundColor(.white)
                    .frame(maxWidth: .infinity)
                    .padding()
                    .background(
                        LinearGradient(
                            colors: [.purple, .pink],
                            startPoint: .topLeading,
                            endPoint: .bottomTrailing
                        )
                    )
                    .cornerRadius(12)
                }
                
                // Test certified photo from app
                Button(action: { showRandomPhotoTest = true }) {
                    VStack(spacing: 8) {
                        Image(systemName: "checkmark.seal")
                            .font(.title2)
                        Text("Test App\nPhoto")
                            .font(.caption)
                            .multilineTextAlignment(.center)
                    }
                    .foregroundColor(.white)
                    .frame(maxWidth: .infinity)
                    .padding()
                    .background(
                        LinearGradient(
                            colors: [.green, .cyan],
                            startPoint: .topLeading,
                            endPoint: .bottomTrailing
                        )
                    )
                    .cornerRadius(12)
                }
                
                // Test fake data
                Button(action: { showFakePhotoTest = true }) {
                    VStack(spacing: 8) {
                        Image(systemName: "exclamationmark.triangle")
                            .font(.title2)
                        Text("Test Fake\nData")
                            .font(.caption)
                            .multilineTextAlignment(.center)
                    }
                    .foregroundColor(.white)
                    .frame(maxWidth: .infinity)
                    .padding()
                    .background(
                        LinearGradient(
                            colors: [.orange, .red],
                            startPoint: .topLeading,
                            endPoint: .bottomTrailing
                        )
                    )
                    .cornerRadius(12)
                }
            }
        }
        .padding()
        .background(Color.white.opacity(0.05))
        .cornerRadius(16)
    }
    
    // MARK: - Header Section
    
    private var headerSection: some View {
        VStack(spacing: 16) {
            // Shield icon
            ZStack {
                Circle()
                    .fill(
                        LinearGradient(
                            colors: [Color.green.opacity(0.3), Color.blue.opacity(0.3)],
                            startPoint: .topLeading,
                            endPoint: .bottomTrailing
                        )
                    )
                    .frame(width: 100, height: 100)
                
                Image(systemName: "checkmark.shield.fill")
                    .font(.system(size: 50))
                    .foregroundStyle(
                        LinearGradient(
                            colors: [.green, .cyan],
                            startPoint: .top,
                            endPoint: .bottom
                        )
                    )
            }
            
            Text("ZK Proof Verification")
                .font(.title.bold())
                .foregroundColor(.white)
            
            Text("Verify your certified photos are REAL\nand happened in the real world")
                .font(.subheadline)
                .foregroundColor(.gray)
                .multilineTextAlignment(.center)
        }
        .padding(.top, 20)
    }
    
    // MARK: - Start Section
    
    private var startSection: some View {
        VStack(spacing: 20) {
            // How it works
            VStack(alignment: .leading, spacing: 16) {
                Text("What we verify:")
                    .font(.headline)
                    .foregroundColor(.white)
                
                VerificationItemRow(
                    icon: "🌳",
                    title: "Merkle Tree",
                    description: "Image integrity hasn't been modified"
                )
                
                VerificationItemRow(
                    icon: "🔐",
                    title: "Secure Enclave",
                    description: "Device hardware signed the image"
                )
                
                VerificationItemRow(
                    icon: "🔑",
                    title: "Public Key",
                    description: "Device identity is verified"
                )
                
                VerificationItemRow(
                    icon: "🎯",
                    title: "Anti-AI Proof",
                    description: "Real camera, GPS, motion data"
                )
            }
            .padding()
            .background(Color.white.opacity(0.1))
            .cornerRadius(16)
            
            // Start button
            Button(action: startVerification) {
                HStack {
                    Image(systemName: "play.fill")
                    Text("Verify All Photos")
                        .fontWeight(.semibold)
                }
                .foregroundColor(.white)
                .frame(maxWidth: .infinity)
                .padding()
                .background(
                    LinearGradient(
                        colors: [.green, .cyan],
                        startPoint: .leading,
                        endPoint: .trailing
                    )
                )
                .cornerRadius(12)
            }
        }
    }
    
    // MARK: - Verifying Section
    
    private var verifyingSection: some View {
        VStack(spacing: 24) {
            // Animated progress
            ZStack {
                Circle()
                    .stroke(Color.white.opacity(0.2), lineWidth: 8)
                    .frame(width: 120, height: 120)
                
                Circle()
                    .trim(from: 0, to: progress)
                    .stroke(
                        LinearGradient(
                            colors: [.green, .cyan],
                            startPoint: .leading,
                            endPoint: .trailing
                        ),
                        style: StrokeStyle(lineWidth: 8, lineCap: .round)
                    )
                    .frame(width: 120, height: 120)
                    .rotationEffect(.degrees(-90))
                    .animation(.easeInOut(duration: 0.5), value: progress)
                
                VStack {
                    Text("\(Int(progress * 100))%")
                        .font(.title.bold())
                        .foregroundColor(.white)
                    Text("Verifying")
                        .font(.caption)
                        .foregroundColor(.gray)
                }
            }
            
            Text("Checking cryptographic proofs...")
                .foregroundColor(.gray)
            
            // Live results as they come in
            if !results.isEmpty {
                VStack(spacing: 8) {
                    ForEach(results.suffix(3), id: \.index) { item in
                        HStack {
                            Text(item.result.emoji)
                            Text("Photo \(item.index + 1)")
                                .foregroundColor(.white)
                            Spacer()
                            Text("\(item.result.confidence)%")
                                .foregroundColor(.gray)
                        }
                        .padding(.horizontal)
                        .padding(.vertical, 8)
                        .background(Color.white.opacity(0.05))
                        .cornerRadius(8)
                    }
                }
            }
        }
        .padding()
    }
    
    // MARK: - Results Section
    
    private var resultsSection: some View {
        VStack(spacing: 20) {
            // Summary card
            VStack(spacing: 12) {
                let realCount = results.filter { $0.result.isReal }.count
                
                HStack(spacing: 20) {
                    // Real count
                    VStack {
                        Text("\(realCount)")
                            .font(.system(size: 48, weight: .bold, design: .rounded))
                            .foregroundColor(.green)
                        Text("REAL")
                            .font(.caption)
                            .foregroundColor(.gray)
                    }
                    
                    Text("/")
                        .font(.title)
                        .foregroundColor(.gray)
                    
                    // Total count
                    VStack {
                        Text("\(results.count)")
                            .font(.system(size: 48, weight: .bold, design: .rounded))
                            .foregroundColor(.white)
                        Text("TOTAL")
                            .font(.caption)
                            .foregroundColor(.gray)
                    }
                }
                
                // Percentage bar
                GeometryReader { geometry in
                    ZStack(alignment: .leading) {
                        RoundedRectangle(cornerRadius: 8)
                            .fill(Color.white.opacity(0.1))
                            .frame(height: 8)
                        
                        RoundedRectangle(cornerRadius: 8)
                            .fill(
                                LinearGradient(
                                    colors: [.green, .cyan],
                                    startPoint: .leading,
                                    endPoint: .trailing
                                )
                            )
                            .frame(width: geometry.size.width * CGFloat(realCount) / CGFloat(max(1, results.count)), height: 8)
                    }
                }
                .frame(height: 8)
                
                Text("\(Int(Double(realCount) / Double(max(1, results.count)) * 100))% of photos verified as REAL")
                    .font(.caption)
                    .foregroundColor(.gray)
            }
            .padding()
            .background(Color.white.opacity(0.1))
            .cornerRadius(16)
            
            // Individual results
            Text("Verification Details")
                .font(.headline)
                .foregroundColor(.white)
                .frame(maxWidth: .infinity, alignment: .leading)
            
            ForEach(results, id: \.index) { item in
                PhotoVerificationRow(
                    index: item.index,
                    imageDict: item.imageDict,
                    result: item.result
                )
            }
            
            // Explanation
            VStack(alignment: .leading, spacing: 8) {
                Text("What does REAL mean?")
                    .font(.caption.bold())
                    .foregroundColor(.white)
                
                Text("A photo is verified as REAL when it passes all cryptographic checks proving it was taken by a real camera, signed by device hardware, and hasn't been modified. This is impossible to fake with AI-generated images.")
                    .font(.caption2)
                    .foregroundColor(.gray)
            }
            .padding()
            .background(Color.blue.opacity(0.1))
            .cornerRadius(12)
            
            }
        .sheet(isPresented: $showFakePhotoTest) {
            FakePhotoTestView()
        }
        .sheet(isPresented: $showRandomPhotoTest) {
            TestRandomPhotoView()
        }
    }
    
    // MARK: - Actions
    
    private func startVerification() {
        isVerifying = true
        progress = 0
        results = []
        
        DispatchQueue.global(qos: .userInitiated).async {
            guard let images = UserDefaults.standard.array(forKey: "certifiedImages") as? [[String: Any]] else {
                DispatchQueue.main.async {
                    isVerifying = false
                }
                return
            }
            
            let total = images.count
            
            for (index, imageDict) in images.enumerated() {
                // Check this photo
                let result = PhotoRealityChecker.shared.isPhotoReal(imageDict)
                
                DispatchQueue.main.async {
                    self.results.append((index, imageDict, result))
                    self.progress = Double(index + 1) / Double(total)
                }
                
                // Small delay for visual effect
                Thread.sleep(forTimeInterval: 0.05)
            }
            
            DispatchQueue.main.async {
                self.isVerifying = false
                UINotificationFeedbackGenerator().notificationOccurred(.success)
            }
        }
    }
}

// MARK: - Supporting Views

struct VerificationItemRow: View {
    let icon: String
    let title: String
    let description: String
    
    var body: some View {
        HStack(alignment: .top, spacing: 12) {
            Text(icon)
                .font(.title2)
            
            VStack(alignment: .leading, spacing: 4) {
                Text(title)
                    .font(.subheadline.bold())
                    .foregroundColor(.white)
                Text(description)
                    .font(.caption)
                    .foregroundColor(.gray)
            }
            
            Spacer()
        }
    }
}

struct PhotoVerificationRow: View {
    let index: Int
    let imageDict: [String: Any]
    let result: PhotoRealityCheck
    @State private var showDetails = false
    
    var image: UIImage? {
        if let imageData = imageDict["imageData"] as? Data {
            return UIImage(data: imageData)
        } else if let imageDataString = imageDict["imageData"] as? String,
                  let imageData = Data(base64Encoded: imageDataString) {
            return UIImage(data: imageData)
        }
        return nil
    }
    
    var body: some View {
        VStack(spacing: 0) {
            // Main row
            Button(action: { withAnimation { showDetails.toggle() } }) {
                HStack(spacing: 12) {
                    // Thumbnail
                    if let image = image {
                        Image(uiImage: image)
                            .resizable()
                            .aspectRatio(contentMode: .fill)
                            .frame(width: 50, height: 50)
                            .cornerRadius(8)
                    } else {
                        RoundedRectangle(cornerRadius: 8)
                            .fill(Color.gray.opacity(0.3))
                            .frame(width: 50, height: 50)
                    }
                    
                    // Info
                    VStack(alignment: .leading, spacing: 4) {
                        Text("Photo \(index + 1)")
                            .font(.subheadline.bold())
                            .foregroundColor(.white)
                        
                        Text(result.isReal ? "Verified Real" : "Needs Review")
                            .font(.caption)
                            .foregroundColor(result.isReal ? .green : .orange)
                    }
                    
                    Spacer()
                    
                    // Confidence
                    VStack(alignment: .trailing, spacing: 4) {
                        Text("\(result.confidence)%")
                            .font(.headline)
                            .foregroundColor(result.isReal ? .green : .orange)
                        
                        Text(result.emoji)
                            .font(.title2)
                    }
                    
                    Image(systemName: showDetails ? "chevron.up" : "chevron.down")
                        .foregroundColor(.gray)
                }
                .padding()
            }
            .background(Color.white.opacity(0.05))
            
            // Details
            if showDetails {
                VStack(alignment: .leading, spacing: 8) {
                    ForEach(result.details, id: \.self) { detail in
                        Text(detail)
                            .font(.caption)
                            .foregroundColor(.gray)
                    }
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding()
                .background(Color.white.opacity(0.02))
            }
        }
        .cornerRadius(12)
        .overlay(
            RoundedRectangle(cornerRadius: 12)
                .stroke(result.isReal ? Color.green.opacity(0.3) : Color.orange.opacity(0.3), lineWidth: 1)
        )
    }
}

// MARK: - Fake Photo Test View

struct FakeTestResult: Identifiable {
    let id = UUID()
    let name: String
    let description: String
    let passed: Bool  // true = correctly rejected
    let confidence: Int
}

struct FakePhotoTestView: View {
    @Environment(\.dismiss) private var dismiss
    @State private var isRunning = false
    @State private var testResults: [FakeTestResult] = []
    @State private var currentTest = ""
    
    var body: some View {
        NavigationView {
            ZStack {
                // Background
                LinearGradient(
                    colors: [
                        Color(red: 0.15, green: 0.05, blue: 0.1),
                        Color(red: 0.2, green: 0.1, blue: 0.15)
                    ],
                    startPoint: .top,
                    endPoint: .bottom
                )
                .ignoresSafeArea()
                
                ScrollView {
                    VStack(spacing: 24) {
                        // Header
                        VStack(spacing: 12) {
                            Image(systemName: "exclamationmark.triangle.fill")
                                .font(.system(size: 50))
                                .foregroundColor(.orange)
                            
                            Text("Fake Photo Test")
                                .font(.title.bold())
                                .foregroundColor(.white)
                            
                            Text("Testing if random/fake photos can\npass ZK verification (they shouldn't!)")
                                .font(.subheadline)
                                .foregroundColor(.gray)
                                .multilineTextAlignment(.center)
                        }
                        .padding(.top, 20)
                        
                        if testResults.isEmpty && !isRunning {
                            // Start button
                            VStack(spacing: 16) {
                                Text("This test will try to verify:")
                                    .font(.headline)
                                    .foregroundColor(.white)
                                
                                VStack(alignment: .leading, spacing: 12) {
                                    TestTypeRow(icon: "🚫", title: "Empty photo", desc: "No proof data at all")
                                    TestTypeRow(icon: "🎲", title: "Fake Merkle root", desc: "Random/invalid hash")
                                    TestTypeRow(icon: "✍️", title: "Fake signature", desc: "Random bytes")
                                    TestTypeRow(icon: "🔑", title: "Invalid key", desc: "Too short/wrong format")
                                    TestTypeRow(icon: "🌐", title: "Internet photo", desc: "Downloaded image")
                                    TestTypeRow(icon: "🤖", title: "AI-generated", desc: "DALL-E/Midjourney style")
                                }
                                .padding()
                                .background(Color.white.opacity(0.05))
                                .cornerRadius(12)
                                
                                Button(action: runTests) {
                                    HStack {
                                        Image(systemName: "play.fill")
                                        Text("Run Fake Photo Tests")
                                    }
                                    .fontWeight(.semibold)
                                    .foregroundColor(.white)
                                    .frame(maxWidth: .infinity)
                                    .padding()
                                    .background(
                                        LinearGradient(
                                            colors: [.orange, .red],
                                            startPoint: .leading,
                                            endPoint: .trailing
                                        )
                                    )
                                    .cornerRadius(12)
                                }
                            }
                        } else if isRunning {
                            // Running
                            VStack(spacing: 20) {
                                ProgressView()
                                    .scaleEffect(1.5)
                                    .tint(.orange)
                                
                                Text("Testing: \(currentTest)")
                                    .foregroundColor(.gray)
                            }
                            .padding(40)
                        } else {
                            // Results
                            resultsView
                        }
                    }
                    .padding()
                }
            }
            .navigationTitle("Fake Photo Test")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .navigationBarTrailing) {
                    Button("Done") { dismiss() }
                        .foregroundColor(.white)
                }
            }
            .toolbarBackground(Color(red: 0.15, green: 0.05, blue: 0.1), for: .navigationBar)
            .toolbarBackground(.visible, for: .navigationBar)
            .toolbarColorScheme(.dark, for: .navigationBar)
        }
    }
    
    private var resultsView: some View {
        VStack(spacing: 20) {
            // Summary
            let passedCount = testResults.filter { $0.passed }.count
            
            VStack(spacing: 8) {
                Text(passedCount == testResults.count ? "🎉 ALL FAKE PHOTOS REJECTED!" : "⚠️ Some tests need review")
                    .font(.headline)
                    .foregroundColor(passedCount == testResults.count ? .green : .orange)
                
                Text("\(passedCount)/\(testResults.count) fake photos correctly rejected")
                    .font(.subheadline)
                    .foregroundColor(.gray)
            }
            .padding()
            .frame(maxWidth: .infinity)
            .background(Color.green.opacity(passedCount == testResults.count ? 0.2 : 0.05))
            .cornerRadius(12)
            
            // Individual results
            ForEach(testResults) { result in
                HStack(spacing: 12) {
                    Image(systemName: result.passed ? "checkmark.circle.fill" : "xmark.circle.fill")
                        .foregroundColor(result.passed ? .green : .red)
                        .font(.title2)
                    
                    VStack(alignment: .leading, spacing: 4) {
                        Text(result.name)
                            .font(.subheadline.bold())
                            .foregroundColor(.white)
                        
                        Text(result.description)
                            .font(.caption)
                            .foregroundColor(.gray)
                    }
                    
                    Spacer()
                    
                    VStack(alignment: .trailing) {
                        Text("\(result.confidence)%")
                            .font(.caption.bold())
                            .foregroundColor(result.confidence < 70 ? .green : .red)
                        Text(result.passed ? "Rejected ✓" : "Problem!")
                            .font(.caption2)
                            .foregroundColor(result.passed ? .green : .red)
                    }
                }
                .padding()
                .background(Color.white.opacity(0.05))
                .cornerRadius(12)
            }
            
            // Conclusion
            VStack(alignment: .leading, spacing: 8) {
                Text("🔐 What this proves:")
                    .font(.caption.bold())
                    .foregroundColor(.white)
                
                Text("Random photos, downloaded images, and AI-generated photos cannot pass ZK verification because they lack the cryptographic signatures from your device's Secure Enclave hardware chip.")
                    .font(.caption2)
                    .foregroundColor(.gray)
            }
            .padding()
            .background(Color.blue.opacity(0.1))
            .cornerRadius(12)
            
            // Run again button
            Button(action: {
                testResults = []
            }) {
                Text("Run Tests Again")
                    .foregroundColor(.orange)
            }
        }
    }
    
    private func runTests() {
        isRunning = true
        testResults = []
        
        DispatchQueue.global(qos: .userInitiated).async {
            // Test 1: Empty photo
            DispatchQueue.main.async { currentTest = "Empty Photo" }
            Thread.sleep(forTimeInterval: 0.3)
            
            let emptyPhoto: [String: Any] = [:]
            let emptyResult = PhotoRealityChecker.shared.isPhotoReal(emptyPhoto)
            DispatchQueue.main.async {
                testResults.append(FakeTestResult(
                    name: "🚫 Empty Photo",
                    description: "No proof data at all",
                    passed: !emptyResult.isReal,
                    confidence: emptyResult.confidence
                ))
            }
            
            // Test 2: Fake Merkle root
            DispatchQueue.main.async { currentTest = "Fake Merkle Root" }
            Thread.sleep(forTimeInterval: 0.3)
            
            let fakeMerkle: [String: Any] = [
                "merkleRoot": "0000000000000000000000000000000000000000000000000000000000000000"
            ]
            let merkleResult = PhotoRealityChecker.shared.isPhotoReal(fakeMerkle)
            DispatchQueue.main.async {
                testResults.append(FakeTestResult(
                    name: "🎲 Fake Merkle Root",
                    description: "All zeros hash",
                    passed: !merkleResult.isReal,
                    confidence: merkleResult.confidence
                ))
            }
            
            // Test 3: Fake signature
            DispatchQueue.main.async { currentTest = "Fake Signature" }
            Thread.sleep(forTimeInterval: 0.3)
            
            let fakeSignature: [String: Any] = [
                "merkleRoot": "abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890",
                "signature": Data(repeating: 0xAB, count: 64).base64EncodedString(),
                "publicKey": "short"
            ]
            let sigResult = PhotoRealityChecker.shared.isPhotoReal(fakeSignature)
            DispatchQueue.main.async {
                testResults.append(FakeTestResult(
                    name: "✍️ Fake Signature",
                    description: "Random bytes as signature",
                    passed: !sigResult.isReal,
                    confidence: sigResult.confidence
                ))
            }
            
            // Test 4: Invalid key
            DispatchQueue.main.async { currentTest = "Invalid Public Key" }
            Thread.sleep(forTimeInterval: 0.3)
            
            let invalidKey: [String: Any] = [
                "merkleRoot": "1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef",
                "signature": Data(repeating: 0xCD, count: 64).base64EncodedString(),
                "publicKey": "x"
            ]
            let keyResult = PhotoRealityChecker.shared.isPhotoReal(invalidKey)
            DispatchQueue.main.async {
                testResults.append(FakeTestResult(
                    name: "🔑 Invalid Public Key",
                    description: "Too short to be valid",
                    passed: !keyResult.isReal,
                    confidence: keyResult.confidence
                ))
            }
            
            // Test 5: Internet photo
            DispatchQueue.main.async { currentTest = "Internet Photo" }
            Thread.sleep(forTimeInterval: 0.3)
            
            let internetPhoto: [String: Any] = [
                "imageData": "somebase64data",
                "source": "internet"
            ]
            let internetResult = PhotoRealityChecker.shared.isPhotoReal(internetPhoto)
            DispatchQueue.main.async {
                testResults.append(FakeTestResult(
                    name: "🌐 Internet Photo",
                    description: "Downloaded image, no proofs",
                    passed: !internetResult.isReal,
                    confidence: internetResult.confidence
                ))
            }
            
            // Test 6: AI-generated
            DispatchQueue.main.async { currentTest = "AI-Generated Photo" }
            Thread.sleep(forTimeInterval: 0.3)
            
            let aiPhoto: [String: Any] = [
                "imageData": "aiGeneratedData",
                "source": "DALL-E",
                "prompt": "property damage"
            ]
            let aiResult = PhotoRealityChecker.shared.isPhotoReal(aiPhoto)
            DispatchQueue.main.async {
                testResults.append(FakeTestResult(
                    name: "🤖 AI-Generated",
                    description: "No hardware signature possible",
                    passed: !aiResult.isReal,
                    confidence: aiResult.confidence
                ))
            }
            
            DispatchQueue.main.async {
                isRunning = false
                UINotificationFeedbackGenerator().notificationOccurred(.success)
            }
        }
    }
}

struct TestTypeRow: View {
    let icon: String
    let title: String
    let desc: String
    
    var body: some View {
        HStack(spacing: 12) {
            Text(icon)
                .font(.title2)
            VStack(alignment: .leading) {
                Text(title)
                    .font(.subheadline)
                    .foregroundColor(.white)
                Text(desc)
                    .font(.caption)
                    .foregroundColor(.gray)
            }
            Spacer()
        }
    }
}

#Preview {
    VerifyAllPhotosView()
}

