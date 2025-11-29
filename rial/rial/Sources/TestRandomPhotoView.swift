//
//  TestRandomPhotoView.swift
//  rial
//
//  Import ANY photo from your library and verify it gets rejected
//  because it doesn't have ZK proofs!
//

import SwiftUI
import PhotosUI

struct TestRandomPhotoView: View {
    @Environment(\.dismiss) private var dismiss
    @State private var selectedItem: PhotosPickerItem?
    @State private var selectedImage: UIImage?
    @State private var isVerifying = false
    @State private var verificationResult: PhotoRealityCheck?
    @State private var testedPhotos: [TestedPhoto] = []
    @State private var showCertifiedPicker = false
    @State private var selectedCertifiedPhoto: [String: Any]?
    @State private var testMode: TestMode = .random
    
    enum TestMode {
        case random      // Random photo from library (should FAIL)
        case certified   // Photo from app (should PASS)
    }
    
    var body: some View {
        NavigationView {
            ZStack {
                // Dark background
                Color.black.ignoresSafeArea()
                
                ScrollView {
                    VStack(spacing: 24) {
                        // Header
                        headerSection
                        
                        // Photo picker
                        photoPickerSection
                        
                        // Current photo being tested
                        if let image = selectedImage {
                            currentPhotoSection(image: image)
                        }
                        
                        // Verification result
                        if let result = verificationResult {
                            resultSection(result: result)
                        }
                        
                        // Previously tested photos
                        if !testedPhotos.isEmpty {
                            previousTestsSection
                        }
                        
                        // Explanation
                        explanationSection
                    }
                    .padding()
                }
            }
            .navigationTitle("Test Random Photos")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .navigationBarTrailing) {
                    Button("Done") { dismiss() }
                        .foregroundColor(.white)
                }
            }
            .toolbarBackground(Color.black, for: .navigationBar)
            .toolbarBackground(.visible, for: .navigationBar)
            .toolbarColorScheme(.dark, for: .navigationBar)
            .onChange(of: selectedItem) { newItem in
                loadImage(from: newItem)
            }
            .sheet(isPresented: $showCertifiedPicker) {
                CertifiedPhotoPickerView(
                    selectedImage: $selectedImage,
                    selectedPhotoDict: $selectedCertifiedPhoto
                )
            }
        }
    }
    
    // MARK: - Header
    
    private var headerSection: some View {
        VStack(spacing: 16) {
            ZStack {
                Circle()
                    .fill(testMode == .random ? Color.red.opacity(0.2) : Color.green.opacity(0.2))
                    .frame(width: 80, height: 80)
                
                Image(systemName: testMode == .random ? "photo.badge.exclamationmark" : "checkmark.seal")
                    .font(.system(size: 40))
                    .foregroundColor(testMode == .random ? .red : .green)
            }
            
            Text(testMode == .random ? "Test Random Photo" : "Test App Photo")
                .font(.title2.bold())
                .foregroundColor(.white)
            
            Text(testMode == .random ? 
                 "Pick any photo from your library.\nWatch it get REJECTED!" :
                 "Pick a certified photo from the app.\nWatch it get VERIFIED!")
                .font(.subheadline)
                .foregroundColor(.gray)
                .multilineTextAlignment(.center)
            
            // Mode switcher
            HStack(spacing: 0) {
                Button(action: { 
                    withAnimation { testMode = .random }
                    resetTest()
                }) {
                    Text("Random Photo")
                        .font(.subheadline.bold())
                        .foregroundColor(testMode == .random ? .white : .gray)
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 10)
                        .background(testMode == .random ? Color.red : Color.clear)
                }
                
                Button(action: { 
                    withAnimation { testMode = .certified }
                    resetTest()
                }) {
                    Text("App Photo")
                        .font(.subheadline.bold())
                        .foregroundColor(testMode == .certified ? .white : .gray)
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 10)
                        .background(testMode == .certified ? Color.green : Color.clear)
                }
            }
            .background(Color.white.opacity(0.1))
            .cornerRadius(8)
        }
    }
    
    // MARK: - Photo Picker
    
    private var photoPickerSection: some View {
        Group {
            if testMode == .random {
                // Pick from photo library
                PhotosPicker(selection: $selectedItem, matching: .images) {
                    HStack {
                        Image(systemName: "photo.on.rectangle.angled")
                        Text("Choose Photo from Library")
                    }
                    .fontWeight(.semibold)
                    .foregroundColor(.white)
                    .frame(maxWidth: .infinity)
                    .padding()
                    .background(
                        LinearGradient(
                            colors: [.blue, .purple],
                            startPoint: .leading,
                            endPoint: .trailing
                        )
                    )
                    .cornerRadius(12)
                }
            } else {
                // Pick from certified photos in app
                Button(action: { showCertifiedPicker = true }) {
                    HStack {
                        Image(systemName: "checkmark.seal")
                        Text("Choose from App's Certified Photos")
                    }
                    .fontWeight(.semibold)
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
    }
    
    // MARK: - Current Photo
    
    private func currentPhotoSection(image: UIImage) -> some View {
        VStack(spacing: 16) {
            Text("Selected Photo")
                .font(.headline)
                .foregroundColor(.white)
            
            Image(uiImage: image)
                .resizable()
                .scaledToFit()
                .frame(maxHeight: 250)
                .cornerRadius(12)
                .overlay(
                    RoundedRectangle(cornerRadius: 12)
                        .stroke(Color.gray.opacity(0.3), lineWidth: 1)
                )
            
            if isVerifying {
                HStack {
                    ProgressView()
                        .tint(.white)
                    Text("Checking ZK proofs...")
                        .foregroundColor(.gray)
                }
            } else if verificationResult == nil {
                Button(action: verifyPhoto) {
                    HStack {
                        Image(systemName: "checkmark.shield")
                        Text("Verify This Photo")
                    }
                    .fontWeight(.semibold)
                    .foregroundColor(.white)
                    .frame(maxWidth: .infinity)
                    .padding()
                    .background(Color.orange)
                    .cornerRadius(12)
                }
            }
        }
        .padding()
        .background(Color.white.opacity(0.05))
        .cornerRadius(16)
    }
    
    // MARK: - Result Section
    
    private func resultSection(result: PhotoRealityCheck) -> some View {
        VStack(spacing: 16) {
            // Big result indicator
            ZStack {
                Circle()
                    .fill(result.isReal ? Color.green.opacity(0.2) : Color.red.opacity(0.2))
                    .frame(width: 100, height: 100)
                
                VStack {
                    Text(result.isReal ? "✅" : "❌")
                        .font(.system(size: 50))
                    
                    Text("\(result.confidence)%")
                        .font(.caption.bold())
                        .foregroundColor(result.isReal ? .green : .red)
                }
            }
            
            // Status text
            Text(result.isReal ? "PASSED (Unexpected!)" : "REJECTED!")
                .font(.title.bold())
                .foregroundColor(result.isReal ? .green : .red)
            
            Text(result.isReal ? 
                 "This photo passed verification. This is unexpected for a random photo!" :
                 "This photo does NOT have valid ZK proofs.\nIt cannot be verified as real.")
                .font(.subheadline)
                .foregroundColor(.gray)
                .multilineTextAlignment(.center)
            
            // Details
            VStack(alignment: .leading, spacing: 8) {
                Text("Verification Details:")
                    .font(.caption.bold())
                    .foregroundColor(.white)
                
                ForEach(result.details, id: \.self) { detail in
                    Text(detail)
                        .font(.caption)
                        .foregroundColor(.gray)
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding()
            .background(Color.white.opacity(0.05))
            .cornerRadius(8)
            
            // Try another button
            Button(action: resetTest) {
                HStack {
                    Image(systemName: "arrow.clockwise")
                    Text("Test Another Photo")
                }
                .foregroundColor(.blue)
            }
        }
        .padding()
        .background(
            RoundedRectangle(cornerRadius: 16)
                .fill(result.isReal ? Color.green.opacity(0.1) : Color.red.opacity(0.1))
        )
        .overlay(
            RoundedRectangle(cornerRadius: 16)
                .stroke(result.isReal ? Color.green.opacity(0.3) : Color.red.opacity(0.3), lineWidth: 2)
        )
    }
    
    // MARK: - Previous Tests
    
    private var previousTestsSection: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("Previously Tested Photos")
                .font(.headline)
                .foregroundColor(.white)
            
            ForEach(testedPhotos) { photo in
                HStack(spacing: 12) {
                    Image(uiImage: photo.image)
                        .resizable()
                        .scaledToFill()
                        .frame(width: 50, height: 50)
                        .cornerRadius(8)
                        .clipped()
                    
                    VStack(alignment: .leading) {
                        Text(photo.result.isReal ? "Passed" : "Rejected")
                            .font(.subheadline.bold())
                            .foregroundColor(photo.result.isReal ? .green : .red)
                        
                        Text("\(photo.result.confidence)% confidence")
                            .font(.caption)
                            .foregroundColor(.gray)
                    }
                    
                    Spacer()
                    
                    Text(photo.result.isReal ? "✅" : "❌")
                        .font(.title2)
                }
                .padding()
                .background(Color.white.opacity(0.05))
                .cornerRadius(12)
            }
        }
    }
    
    // MARK: - Explanation
    
    private var explanationSection: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("Why random photos fail:")
                .font(.headline)
                .foregroundColor(.white)
            
            VStack(alignment: .leading, spacing: 8) {
                ExplanationRow(icon: "🌳", text: "No Merkle tree hash of image tiles")
                ExplanationRow(icon: "🔐", text: "No Secure Enclave hardware signature")
                ExplanationRow(icon: "🔑", text: "No cryptographic public key")
                ExplanationRow(icon: "📍", text: "No verified GPS coordinates")
                ExplanationRow(icon: "📱", text: "No motion sensor data")
            }
            
            Text("Only photos taken WITH THIS APP have these proofs embedded!")
                .font(.caption)
                .foregroundColor(.orange)
                .padding(.top, 8)
        }
        .padding()
        .background(Color.blue.opacity(0.1))
        .cornerRadius(16)
    }
    
    // MARK: - Actions
    
    private func loadImage(from item: PhotosPickerItem?) {
        guard let item = item else { return }
        
        // Reset previous result
        verificationResult = nil
        
        item.loadTransferable(type: Data.self) { result in
            switch result {
            case .success(let data):
                if let data = data, let image = UIImage(data: data) {
                    DispatchQueue.main.async {
                        self.selectedImage = image
                    }
                }
            case .failure(let error):
                print("Error loading image: \(error)")
            }
        }
    }
    
    private func verifyPhoto() {
        guard let image = selectedImage else { return }
        
        isVerifying = true
        
        DispatchQueue.global(qos: .userInitiated).async {
            let photoDict: [String: Any]
            
            if self.testMode == .certified, let certifiedPhoto = self.selectedCertifiedPhoto {
                // Use the actual certified photo with its ZK proofs
                photoDict = certifiedPhoto
            } else {
                // Create a photo dict WITHOUT ZK proofs (like any random photo)
                photoDict = [
                    "imageData": image.jpegData(compressionQuality: 0.8) ?? Data(),
                    "source": "Photo Library",
                    "importedAt": ISO8601DateFormatter().string(from: Date())
                    // NO merkleRoot
                    // NO signature
                    // NO publicKey
                    // NO proofMetadata
                ]
            }
            
            // Verify it
            let result = PhotoRealityChecker.shared.isPhotoReal(photoDict)
            
            DispatchQueue.main.async {
                self.verificationResult = result
                self.isVerifying = false
                
                // Add to tested photos
                self.testedPhotos.insert(TestedPhoto(image: image, result: result), at: 0)
                
                // Keep only last 5
                if self.testedPhotos.count > 5 {
                    self.testedPhotos = Array(self.testedPhotos.prefix(5))
                }
                
                // Haptic feedback
                if result.isReal {
                    UINotificationFeedbackGenerator().notificationOccurred(.success)
                } else {
                    UINotificationFeedbackGenerator().notificationOccurred(.error)
                }
            }
        }
    }
    
    private func resetTest() {
        selectedItem = nil
        selectedImage = nil
        selectedCertifiedPhoto = nil
        verificationResult = nil
    }
}

// MARK: - Supporting Types

struct TestedPhoto: Identifiable {
    let id = UUID()
    let image: UIImage
    let result: PhotoRealityCheck
}

struct ExplanationRow: View {
    let icon: String
    let text: String
    
    var body: some View {
        HStack(spacing: 8) {
            Text(icon)
            Text(text)
                .font(.caption)
                .foregroundColor(.gray)
        }
    }
}

// MARK: - Certified Photo Picker

struct CertifiedPhotoPickerView: View {
    @Environment(\.dismiss) private var dismiss
    @Binding var selectedImage: UIImage?
    @Binding var selectedPhotoDict: [String: Any]?
    
    @State private var certifiedImages: [[String: Any]] = []
    
    private let columns = [
        GridItem(.adaptive(minimum: 100, maximum: 150), spacing: 8)
    ]
    
    var body: some View {
        NavigationView {
            ZStack {
                Color.black.ignoresSafeArea()
                
                if certifiedImages.isEmpty {
                    VStack(spacing: 16) {
                        Image(systemName: "photo.stack")
                            .font(.system(size: 50))
                            .foregroundColor(.gray)
                        Text("No Certified Photos")
                            .foregroundColor(.gray)
                        Text("Take some photos with the app first!")
                            .font(.caption)
                            .foregroundColor(.gray)
                    }
                } else {
                    ScrollView {
                        VStack(alignment: .leading, spacing: 16) {
                            Text("Select a certified photo to verify")
                                .font(.subheadline)
                                .foregroundColor(.gray)
                                .padding(.horizontal)
                            
                            LazyVGrid(columns: columns, spacing: 8) {
                                ForEach(Array(certifiedImages.enumerated()), id: \.offset) { index, imageDict in
                                    CertifiedPhotoThumbnail(imageDict: imageDict)
                                        .onTapGesture {
                                            selectPhoto(imageDict)
                                        }
                                }
                            }
                            .padding(.horizontal)
                        }
                        .padding(.vertical)
                    }
                }
            }
            .navigationTitle("Your Certified Photos")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .navigationBarTrailing) {
                    Button("Cancel") { dismiss() }
                        .foregroundColor(.white)
                }
            }
            .toolbarBackground(Color.black, for: .navigationBar)
            .toolbarBackground(.visible, for: .navigationBar)
            .toolbarColorScheme(.dark, for: .navigationBar)
            .onAppear {
                loadCertifiedImages()
            }
        }
    }
    
    private func loadCertifiedImages() {
        certifiedImages = UserDefaults.standard.array(forKey: "certifiedImages") as? [[String: Any]] ?? []
    }
    
    private func selectPhoto(_ imageDict: [String: Any]) {
        // Get the image
        if let imageData = imageDict["imageData"] as? Data,
           let image = UIImage(data: imageData) {
            selectedImage = image
            selectedPhotoDict = imageDict
            dismiss()
        } else if let imageDataString = imageDict["imageData"] as? String,
                  let imageData = Data(base64Encoded: imageDataString),
                  let image = UIImage(data: imageData) {
            selectedImage = image
            selectedPhotoDict = imageDict
            dismiss()
        }
    }
}

struct CertifiedPhotoThumbnail: View {
    let imageDict: [String: Any]
    
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
        ZStack(alignment: .bottomTrailing) {
            if let image = image {
                Image(uiImage: image)
                    .resizable()
                    .aspectRatio(contentMode: .fill)
                    .frame(width: 100, height: 100)
                    .clipped()
                    .cornerRadius(8)
            } else {
                RoundedRectangle(cornerRadius: 8)
                    .fill(Color.gray.opacity(0.3))
                    .frame(width: 100, height: 100)
            }
            
            // Verified badge
            Image(systemName: "checkmark.seal.fill")
                .foregroundColor(.green)
                .background(
                    Circle()
                        .fill(Color.black)
                        .frame(width: 20, height: 20)
                )
                .padding(4)
        }
    }
}

#Preview {
    TestRandomPhotoView()
}

