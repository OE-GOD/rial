import SwiftUI

// Decodable version of ProofMetadata for display
struct ProofMetadataDisplay: Codable {
    let cameraModel: String?
    let sensorInfo: String?
    let latitude: Double?
    let longitude: Double?
    let altitude: Double?
    let accelerometerX: Double?
    let accelerometerY: Double?
    let accelerometerZ: Double?
    let gyroX: Double?
    let gyroY: Double?
    let gyroZ: Double?
    let deviceModel: String?
    let osVersion: String?
    let appVersion: String?
    let captureTimestamp: String?
}

enum SortOption: String, CaseIterable {
    case newest = "Newest First"
    case oldest = "Oldest First"
    case verified = "Verified Only"
}

struct GalleryView: View {
    @Environment(\.dismiss) private var dismiss
    @State private var certifiedImages: [[String: Any]] = []
    @State private var selectedImageIndex: Int?
    @State private var showingDetail = false
    @State private var searchText = ""
    @State private var sortOption: SortOption = .newest
    @State private var showFilters = false
    @State private var filters = FilterOptions()
    
    private let columns = [
        GridItem(.adaptive(minimum: 100, maximum: 150), spacing: 2)
    ]
    
    var filteredImages: [[String: Any]] {
        var images = certifiedImages
        
        // Apply advanced filters
        images = applyAdvancedFilters(to: images)
        
        // Apply sorting  
        switch sortOption {
        case .newest:
            // Sort with newest first (larger date comes first)
            images = images.sorted { dict1, dict2 in
                let date1 = getDate(from: dict1) ?? Date.distantPast
                let date2 = getDate(from: dict2) ?? Date.distantPast
                return date1 > date2  // Descending order (newest first)
            }
        case .oldest:
            // Sort with oldest first (smaller date comes first)
            images = images.sorted { dict1, dict2 in
                let date1 = getDate(from: dict1) ?? Date.distantPast
                let date2 = getDate(from: dict2) ?? Date.distantPast
                return date1 < date2  // Ascending order (oldest first)
            }
        case .verified:
            // Filter verified only, then sort by newest
            images = images.filter { dict in
                (dict["isVerified"] as? String) == "true"
            }.sorted { dict1, dict2 in
                let date1 = getDate(from: dict1) ?? Date.distantPast
                let date2 = getDate(from: dict2) ?? Date.distantPast
                return date1 > date2
            }
        }
        
        // Apply search filter
        if !searchText.isEmpty {
            images = images.filter { imageDict in
                let dateFormatter = DateFormatter()
                dateFormatter.dateStyle = .medium
                dateFormatter.timeStyle = .short
                
                if let certDateString = imageDict["certificationDate"] as? String,
                   let certDate = ISO8601DateFormatter().date(from: certDateString) {
                    let dateString = dateFormatter.string(from: certDate)
                    return dateString.localizedCaseInsensitiveContains(searchText)
                }
                
                if let timestampString = imageDict["timestamp"] as? String {
                    return timestampString.localizedCaseInsensitiveContains(searchText)
                }
                
                return false
            }
        }
        
        return images
    }
    
    private func applyAdvancedFilters(to images: [[String: Any]]) -> [[String: Any]] {
        var filtered = images
        
        // Date range filter
        switch filters.dateRange {
        case .today:
            filtered = filtered.filter { dict in
                guard let date = getDate(from: dict) else { return false }
                return Calendar.current.isDateInToday(date)
            }
        case .week:
            let weekAgo = Date().addingTimeInterval(-7*24*60*60)
            filtered = filtered.filter { dict in
                guard let date = getDate(from: dict) else { return false }
                return date >= weekAgo
            }
        case .month:
            let monthAgo = Date().addingTimeInterval(-30*24*60*60)
            filtered = filtered.filter { dict in
                guard let date = getDate(from: dict) else { return false }
                return date >= monthAgo
            }
        case .all, .custom:
            break
        }
        
        // GPS filter
        if let hasGPS = filters.hasGPS {
            filtered = filtered.filter { dict in
                let proofHasGPS = hasProofMetadataGPS(dict)
                return proofHasGPS == hasGPS
            }
        }
        
        // Motion filter
        if let hasMotion = filters.hasMotion {
            filtered = filtered.filter { dict in
                let proofHasMotion = hasProofMetadataMotion(dict)
                return proofHasMotion == hasMotion
            }
        }
        
        // Verified filter
        if filters.verifiedOnly {
            filtered = filtered.filter { dict in
                (dict["isVerified"] as? String) == "true"
            }
        }
        
        return filtered
    }
    
    private func hasProofMetadataGPS(_ dict: [String: Any]) -> Bool {
        guard let proofMetadataString = dict["proofMetadata"] as? String,
              let proofData = proofMetadataString.data(using: .utf8),
              let proofMetadata = try? JSONDecoder().decode(ProofMetadataDisplay.self, from: proofData) else {
            return false
        }
        return proofMetadata.latitude != nil && proofMetadata.longitude != nil
    }
    
    private func hasProofMetadataMotion(_ dict: [String: Any]) -> Bool {
        guard let proofMetadataString = dict["proofMetadata"] as? String,
              let proofData = proofMetadataString.data(using: .utf8),
              let proofMetadata = try? JSONDecoder().decode(ProofMetadataDisplay.self, from: proofData) else {
            return false
        }
        return proofMetadata.accelerometerX != nil
    }
    
    private func getDate(from dict: [String: Any]) -> Date? {
        if let certDateString = dict["certificationDate"] as? String {
            return ISO8601DateFormatter().date(from: certDateString)
        }
        return nil
    }
    
    var body: some View {
        NavigationView {
            ScrollView {
                if certifiedImages.isEmpty {
                    EmptyGalleryView()
                        .frame(maxWidth: .infinity, maxHeight: .infinity)
                        .padding(.top, 100)
                } else {
                    // Show count and filter status
                    if filteredImages.count != certifiedImages.count {
                        HStack {
                            Text("\(filteredImages.count) of \(certifiedImages.count) images")
                                .font(.caption)
                                .foregroundColor(.secondary)
                            Spacer()
                        }
                        .padding(.horizontal, 16)
                        .padding(.top, 8)
                    }
                    
                    LazyVGrid(columns: columns, spacing: 2) {
                        ForEach(Array(filteredImages.enumerated()), id: \.offset) { index, imageDict in
                            GalleryItemView(imageDict: imageDict)
                                .onTapGesture {
                                    // Find the correct index in the original certifiedImages array
                                    if let merkleRoot = imageDict["merkleRoot"] as? String,
                                       let originalIndex = certifiedImages.firstIndex(where: { ($0["merkleRoot"] as? String) == merkleRoot }) {
                                        selectedImageIndex = originalIndex
                                        showingDetail = true
                                        UIImpactFeedbackGenerator(style: .light).impactOccurred()
                                    }
                                }
                        }
                    }
                    .padding(.horizontal, 2)
                    .searchable(text: $searchText, prompt: "Search by date")
                }
            }
            .navigationTitle("Certified Images")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .navigationBarLeading) {
                    Button("Done") {
                        dismiss()
                    }
                }
                
                ToolbarItem(placement: .principal) {
                    Menu {
                        ForEach(SortOption.allCases, id: \.self) { option in
                            Button(action: {
                                sortOption = option
                                UIImpactFeedbackGenerator(style: .light).impactOccurred()
                            }) {
                                HStack {
                                    Text(option.rawValue)
                                    if sortOption == option {
                                        Image(systemName: "checkmark")
                                    }
                                }
                            }
                        }
                    } label: {
                        HStack {
                            Text(sortOption.rawValue)
                                .font(.caption)
                            Image(systemName: "chevron.down")
                                .font(.caption)
                        }
                        .foregroundColor(.secondary)
                    }
                }
                
                ToolbarItem(placement: .navigationBarTrailing) {
                    HStack(spacing: 16) {
                        Button(action: {
                            showFilters = true
                        }) {
                            Image(systemName: filters.dateRange != .all || filters.hasGPS != nil || filters.hasMotion != nil || filters.verifiedOnly ? "line.3.horizontal.decrease.circle.fill" : "line.3.horizontal.decrease.circle")
                                .foregroundColor(filters.dateRange != .all || filters.hasGPS != nil || filters.hasMotion != nil || filters.verifiedOnly ? .blue : .primary)
                        }
                        
                        Menu {
                            Button(action: exportAll) {
                                Label("Export All", systemImage: "square.and.arrow.up")
                            }
                            
                            Button(action: deleteAll) {
                                Label("Delete All", systemImage: "trash")
                            }
                            .foregroundColor(.red)
                        } label: {
                            Image(systemName: "ellipsis.circle")
                        }
                    }
                }
            }
            .sheet(isPresented: $showFilters) {
                AdvancedFiltersView(filters: $filters)
            }
            .sheet(isPresented: $showingDetail) {
                if let selectedIndex = selectedImageIndex,
                   selectedIndex < certifiedImages.count {
                    ImageDetailView(imageDict: certifiedImages[selectedIndex])
                }
            }
            .onAppear {
                loadCertifiedImages()
            }
            .refreshable {
                loadCertifiedImages()
            }
        }
    }
    
    private func exportAll() {
        // Implement export functionality
        UINotificationFeedbackGenerator().notificationOccurred(.success)
    }
    
    private func deleteAll() {
        // Implement delete all functionality
        UINotificationFeedbackGenerator().notificationOccurred(.warning)
        PersistenceController.shared.clearCertifiedImages()
        loadCertifiedImages()
    }
    
    private func loadCertifiedImages() {
        certifiedImages = PersistenceController.shared.getCertifiedImages()
        print("🔄 Gallery loaded \(certifiedImages.count) certified images")
    }
}

struct GalleryItemView: View {
    let imageDict: [String: Any]
    
    var image: UIImage? {
        // Handle both Data and base64 String formats
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
                    .frame(minWidth: 100, maxWidth: .infinity, minHeight: 100, maxHeight: .infinity)
                    .clipped()
            } else {
                Rectangle()
                    .fill(Color.gray.opacity(0.3))
                    .frame(minWidth: 100, maxWidth: .infinity, minHeight: 100, maxHeight: .infinity)
                    .overlay(
                        Image(systemName: "photo")
                            .foregroundColor(.gray)
                    )
            }
            
            // Verification badge
            Image(systemName: "checkmark.seal.fill")
                .font(.system(size: 16))
                .foregroundColor(.green)
                .background(
                    Circle()
                        .fill(Color.white)
                        .frame(width: 24, height: 24)
                )
                .padding(4)
        }
        .aspectRatio(1, contentMode: .fit)
    }
}

struct EmptyGalleryView: View {
    var body: some View {
        VStack(spacing: 20) {
            Image(systemName: "photo.stack")
                .font(.system(size: 60))
                .foregroundColor(.gray)
            
            Text("No Certified Images")
                .font(.title2)
                .fontWeight(.semibold)
            
            Text("Take a photo and certify it to see it here")
                .font(.body)
                .foregroundColor(.secondary)
                .multilineTextAlignment(.center)
        }
        .padding()
    }
}

struct ImageDetailView: View {
    let imageDict: [String: Any]
    @Environment(\.dismiss) private var dismiss
    @State private var showShareSheet = false
    @State private var shareItems: [Any] = []
    @State private var showQRCode = false
    @State private var showAlert = false
    @State private var alertTitle = ""
    @State private var alertMessage = ""
    
    var image: UIImage? {
        // Handle both Data and base64 String formats
        if let imageData = imageDict["imageData"] as? Data {
            return UIImage(data: imageData)
        } else if let imageDataString = imageDict["imageData"] as? String,
                  let imageData = Data(base64Encoded: imageDataString) {
            return UIImage(data: imageData)
        }
        return nil
    }
    
    var body: some View {
        NavigationView {
            ScrollView {
                VStack(spacing: 20) {
                    // Image
                    if let image = image {
                        Image(uiImage: image)
                            .resizable()
                            .aspectRatio(contentMode: .fit)
                            .cornerRadius(12)
                            .shadow(radius: 10)
                            .padding()
                    }
                    
                    // Metadata Card
                    VStack(alignment: .leading, spacing: 16) {
                        // Verification Status
                        HStack {
                            Image(systemName: "checkmark.seal.fill")
                                .foregroundColor(.green)
                            Text("Cryptographically Verified")
                                .font(.headline)
                            Spacer()
                        }
                        .padding()
                        .background(Color.green.opacity(0.1))
                        .cornerRadius(12)
                        
                        // Cryptographic Details
                        VStack(alignment: .leading, spacing: 12) {
                            Text("🔐 Cryptographic Proof")
                                .font(.caption)
                                .fontWeight(.semibold)
                                .foregroundColor(.secondary)
                            
                            if let certDateString = imageDict["certificationDate"] as? String,
                               let certDate = ISO8601DateFormatter().date(from: certDateString) {
                                DetailRow(label: "Certified", value: formatDate(certDate))
                            }
                            if let merkleRoot = imageDict["merkleRoot"] as? String {
                                DetailRow(
                                    label: "Merkle Root",
                                    value: String(merkleRoot.prefix(16)) + "...",
                                    showCopyButton: true,
                                    fullValue: merkleRoot
                                )
                            }
                            if let signature = imageDict["signature"] as? String {
                                DetailRow(
                                    label: "Signature",
                                    value: String(signature.prefix(16)) + "...",
                                    showCopyButton: true,
                                    fullValue: signature
                                )
                            }
                            if let publicKey = imageDict["publicKey"] as? String {
                                DetailRow(
                                    label: "Public Key",
                                    value: String(publicKey.prefix(16)) + "...",
                                    showCopyButton: true,
                                    fullValue: publicKey
                                )
                            }
                            if let timestamp = imageDict["timestamp"] as? String {
                                DetailRow(label: "Captured", value: String(timestamp.prefix(19)))
                            }
                            if let isVerifiedString = imageDict["isVerified"] as? String {
                                let isVerified = (isVerifiedString == "true")
                                DetailRow(label: "Verified", value: isVerified ? "✅ Valid" : "❌ Invalid")
                            }
                            DetailRow(label: "Device", value: "Secure Enclave")
                        }
                        .padding()
                        .background(Color(UIColor.secondarySystemBackground))
                        .cornerRadius(12)
                        
                        // Anti-AI Proof Details (if available)
                        if let proofMetadataString = imageDict["proofMetadata"] as? String,
                           let proofData = proofMetadataString.data(using: .utf8),
                           let proofMetadata = try? JSONDecoder().decode(ProofMetadataDisplay.self, from: proofData) {
                            
                            VStack(alignment: .leading, spacing: 12) {
                                Text("🎯 Anti-AI Proof")
                                    .font(.caption)
                                    .fontWeight(.semibold)
                                    .foregroundColor(.secondary)
                                
                                DetailRow(label: "Camera", value: proofMetadata.cameraModel ?? "Unknown")
                                
                                if let lat = proofMetadata.latitude, let lon = proofMetadata.longitude {
                                    let gpsString = String(format: "%.6f°, %.6f°", lat, lon)
                                    DetailRow(
                                        label: "Location",
                                        value: String(format: "%.4f°, %.4f°", lat, lon),
                                        showCopyButton: true,
                                        fullValue: gpsString
                                    )
                                }
                                
                                if let accelX = proofMetadata.accelerometerX {
                                    DetailRow(label: "Motion", value: "Detected ✅")
                                }
                                
                                DetailRow(label: "Device", value: proofMetadata.deviceModel ?? "iPhone")
                                DetailRow(label: "OS", value: proofMetadata.osVersion ?? "iOS")
                            }
                            .padding()
                            .background(Color.green.opacity(0.1))
                            .cornerRadius(12)
                        }
                        
                        // Action Buttons
                        VStack(spacing: 12) {
                            Button(action: verifyOnBlockchain) {
                                Label("Verify on Blockchain", systemImage: "link.badge.plus")
                                    .frame(maxWidth: .infinity)
                            }
                            .buttonStyle(.borderedProminent)
                            
                            HStack(spacing: 12) {
                                Button(action: {
                                    showQRCode = true
                                }) {
                                    Label("QR Code", systemImage: "qrcode")
                                        .frame(maxWidth: .infinity)
                                }
                                .buttonStyle(.bordered)
                                
                                Button(action: shareImage) {
                                    Label("Share", systemImage: "square.and.arrow.up")
                                        .frame(maxWidth: .infinity)
                                }
                                .buttonStyle(.bordered)
                            }
                            
                            VStack(spacing: 12) {
                                HStack(spacing: 12) {
                                    Button(action: saveToPhotos) {
                                        Label("Save to Photos", systemImage: "photo.badge.plus")
                                            .frame(maxWidth: .infinity)
                                    }
                                    .buttonStyle(.borderedProminent)
                                    .tint(.green)
                                    
                                    Button(action: saveExactImage) {
                                        Label("Save Exact", systemImage: "doc.badge.arrow.up")
                                            .frame(maxWidth: .infinity)
                                    }
                                    .buttonStyle(.borderedProminent)
                                    .tint(.blue)
                                }
                                
                                HStack(spacing: 12) {
                                    Button(action: copyImageURL) {
                                        Label("Copy URL", systemImage: "link")
                                            .frame(maxWidth: .infinity)
                                    }
                                    .buttonStyle(.borderedProminent)
                                    .tint(.purple)
                                    
                                    Button(action: exportAsPDF) {
                                        Label("Export PDF", systemImage: "doc.fill")
                                            .frame(maxWidth: .infinity)
                                    }
                                    .buttonStyle(.borderedProminent)
                                    .tint(.orange)
                                }
                            }
                        }
                    }
                    .padding()
                }
            }
            .navigationTitle("Image Details")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .principal) {
                    if let certDateString = imageDict["certificationDate"] as? String,
                       let certDate = ISO8601DateFormatter().date(from: certDateString) {
                        Text(formatDate(certDate))
                            .font(.caption)
                            .foregroundColor(.secondary)
                    }
                }
                
                ToolbarItem(placement: .navigationBarTrailing) {
                    Button("Done") {
                        dismiss()
                    }
                }
            }
            .sheet(isPresented: $showShareSheet) {
                if #available(iOS 16.0, *) {
                    ShareSheet(items: shareItems)
                }
            }
            .sheet(isPresented: $showQRCode) {
                if let merkleRoot = imageDict["merkleRoot"] as? String {
                    let backendURL = UserDefaults.standard.string(forKey: "backendURL") ?? ProverManager.shared.getBackendURL()
                    let verificationLink = "\(backendURL)/verify.html?id=\(merkleRoot)"
                    
                    NavigationView {
                        QRCodeView(verificationLink: verificationLink)
                            .navigationTitle("Verification QR Code")
                            .navigationBarTitleDisplayMode(.inline)
                            .toolbar {
                                ToolbarItem(placement: .navigationBarTrailing) {
                                    Button("Done") {
                                        showQRCode = false
                                    }
                                }
                            }
                    }
                }
            }
            .alert(alertTitle, isPresented: $showAlert) {
                Button("OK") { }
            } message: {
                Text(alertMessage)
            }
        }
    }
    
    private func formatDate(_ date: Date) -> String {
        let formatter = DateFormatter()
        formatter.dateStyle = .medium
        formatter.timeStyle = .short
        return formatter.string(from: date)
    }
    
    private func verifyOnBlockchain() {
        // Open blockchain verification URL
        if let merkleRoot = imageDict["merkleRoot"] as? String {
            let backendURL = UserDefaults.standard.string(forKey: "backendURL") ?? ProverManager.shared.getBackendURL()
            if let url = URL(string: "\(backendURL)/verify.html?id=\(merkleRoot)") {
                UIApplication.shared.open(url)
            }
        }
    }
    
    private func shareImage() {
        guard let image = image else { return }
        
        var items: [Any] = [image]
        
        // Add verification link
        if let merkleRoot = imageDict["merkleRoot"] as? String {
            let backendURL = UserDefaults.standard.string(forKey: "backendURL") ?? ProverManager.shared.getBackendURL()
            let verificationLink = "\(backendURL)/verify.html?id=\(merkleRoot)"
            items.append("🔐 This image is cryptographically verified.\n\nMerkle Root: \(merkleRoot)\n\nVerify at: \(verificationLink)")
        }
        
        shareItems = items
        showShareSheet = true
        
        UINotificationFeedbackGenerator().notificationOccurred(.success)
    }
    
    private func saveToPhotos() {
        guard let image = image else { return }
        
        PhotoExporter.shared.saveToPhotos(image: image) { success, message in
            DispatchQueue.main.async {
                if success {
                    alertTitle = "Saved! 📱"
                    alertMessage = message
                    UINotificationFeedbackGenerator().notificationOccurred(.success)
                } else {
                    alertTitle = "Save Failed"
                    alertMessage = message
                    UINotificationFeedbackGenerator().notificationOccurred(.error)
                }
                showAlert = true
            }
        }
    }
    
    private func saveExactImage() {
        guard let merkleRoot = imageDict["merkleRoot"] as? String else {
            alertTitle = "Error"
            alertMessage = "No merkle root found"
            showAlert = true
            return
        }
        
        // Show loading
        alertTitle = "Downloading..."
        alertMessage = "Getting exact certified image"
        showAlert = true
        
        // Get backend URL
        let backendURL = UserDefaults.standard.string(forKey: "backendURL") ?? ProverManager.shared.getBackendURL()
        
        // Download the exact cropped image from backend
        guard let url = URL(string: "\(backendURL)/get-certified-image/\(merkleRoot)") else {
            alertTitle = "Error"
            alertMessage = "Invalid URL"
            showAlert = true
            return
        }
        
        URLSession.shared.dataTask(with: url) { data, response, error in
            DispatchQueue.main.async {
                // Don't dismiss alert yet
                
                if let error = error {
                    self.alertTitle = "Download Failed"
                    self.alertMessage = error.localizedDescription
                    self.showAlert = true
                    return
                }
                
                guard let imageData = data,
                      let httpResponse = response as? HTTPURLResponse,
                      httpResponse.statusCode == 200 else {
                    print("⚠️ Download issue - Status: \((response as? HTTPURLResponse)?.statusCode ?? -1)")
                    print("⚠️ Data size: \(data?.count ?? 0)")
                    // Fallback: Apply crop locally
                    self.showAlert = false
                    self.saveExactImageLocally()
                    return
                }
                
                print("✅ Downloaded certified image: \(imageData.count) bytes")
                
                // Save the exact data
                let tempDir = FileManager.default.temporaryDirectory
                let fileName = "rial-exact-\(Date().timeIntervalSince1970).jpg"
                let fileURL = tempDir.appendingPathComponent(fileName)
                
                do {
                    try imageData.write(to: fileURL)
                    print("✅ Saved to: \(fileURL)")
                    
                    // Hide download alert
                    self.showAlert = false
                    
                    // Small delay to ensure alert dismisses
                    DispatchQueue.main.asyncAfter(deadline: .now() + 0.1) {
                        // Share the exact file
                        self.shareItems = [fileURL]
                        self.showShareSheet = true
                        UINotificationFeedbackGenerator().notificationOccurred(.success)
                    }
                } catch {
                    self.alertTitle = "Save Failed"
                    self.alertMessage = error.localizedDescription
                    self.showAlert = true
                }
            }
        }.resume()
    }
    
    private func copyImageURL() {
        guard let merkleRoot = imageDict["merkleRoot"] as? String else {
            alertTitle = "Error"
            alertMessage = "No merkle root found"
            showAlert = true
            return
        }
        
        let backendURL = UserDefaults.standard.string(forKey: "backendURL") ?? ProverManager.shared.getBackendURL()
        let imageURL = "\(backendURL)/get-certified-image/\(merkleRoot)"
        
        UIPasteboard.general.string = imageURL
        
        alertTitle = "URL Copied! 📋"
        alertMessage = "Open in Safari to download:\n\(imageURL)"
        showAlert = true
        
        UINotificationFeedbackGenerator().notificationOccurred(.success)
    }
    
    private func saveExactImageLocally() {
        guard let image = image else { return }
        
        // Get stored dimensions (default to 512x512, but could be any size)
        // In the future, we could store the actual crop size with the image
        let cropSize = CGSize(width: 512, height: 512)
        
        // Calculate center crop
        let scale = max(cropSize.width / image.size.width, cropSize.height / image.size.height)
        let scaledSize = CGSize(width: image.size.width * scale, height: image.size.height * scale)
        let origin = CGPoint(x: (cropSize.width - scaledSize.width) / 2, y: (cropSize.height - scaledSize.height) / 2)
        
        // Create exact crop
        let renderer = UIGraphicsImageRenderer(size: cropSize)
        let croppedImage = renderer.image { context in
            image.draw(in: CGRect(origin: origin, size: scaledSize))
        }
        
        // Same JPEG quality as backend
        guard let imageData = croppedImage.jpegData(compressionQuality: 0.9) else {
            alertTitle = "Save Failed"
            alertMessage = "Could not process image"
            showAlert = true
            return
        }
        
        // Create temporary file
        let tempDir = FileManager.default.temporaryDirectory
        let fileName = "rial-exact-\(Date().timeIntervalSince1970).jpg"
        let fileURL = tempDir.appendingPathComponent(fileName)
        
        do {
            try imageData.write(to: fileURL)
            
            // Share the exact file
            self.shareItems = [fileURL]
            self.showShareSheet = true
            UINotificationFeedbackGenerator().notificationOccurred(.success)
        } catch {
            alertTitle = "Save Failed"
            alertMessage = error.localizedDescription
            showAlert = true
        }
    }
    
    private func exportAsPDF() {
        guard let image = image else { return }
        
        PDFGenerator.shared.generateVerificationPDF(
            image: image,
            imageDict: imageDict
        ) { pdfURL in
            guard let url = pdfURL else {
                alertTitle = "Export Failed"
                alertMessage = "Could not generate PDF"
                showAlert = true
                return
            }
            
            // Use SwiftUI-compatible sharing
            DispatchQueue.main.async {
                self.shareItems = [url]
                self.showShareSheet = true
                UINotificationFeedbackGenerator().notificationOccurred(.success)
            }
        }
    }
}

struct DetailRow: View {
    let label: String
    let value: String
    var showCopyButton: Bool = false
    var fullValue: String? = nil
    @State private var showCopied = false
    
    var body: some View {
        HStack {
            Text(label)
                .font(.caption)
                .foregroundColor(.secondary)
                .frame(width: 80, alignment: .leading)
            
            Text(value)
                .font(.caption)
                .lineLimit(1)
            
            Spacer()
            
            if showCopyButton {
                Button(action: {
                    UIPasteboard.general.string = fullValue ?? value
                    showCopied = true
                    UINotificationFeedbackGenerator().notificationOccurred(.success)
                    
                    DispatchQueue.main.asyncAfter(deadline: .now() + 1.5) {
                        showCopied = false
                    }
                }) {
                    Image(systemName: showCopied ? "checkmark.circle.fill" : "doc.on.doc")
                        .foregroundColor(showCopied ? .green : .blue)
                        .font(.caption)
                }
                .buttonStyle(.borderless)
            }
        }
    }
}

@available(iOS 16.0, *)
struct ShareSheet: UIViewControllerRepresentable {
    let items: [Any]
    
    func makeUIViewController(context: Context) -> UIActivityViewController {
        UIActivityViewController(activityItems: items, applicationActivities: nil)
    }
    
    func updateUIViewController(_ uiViewController: UIActivityViewController, context: Context) {}
}
