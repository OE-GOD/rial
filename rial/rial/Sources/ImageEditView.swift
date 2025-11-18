//
//  ImageEditView.swift
//  rial
//
//  Created by Sofiane Larbi on 2/17/24.
//

import SwiftUI
import UIKit
import Combine
import AVFoundation
import CoreData

struct ImageEditView: View {
    
    @EnvironmentObject private var viewModel: ImageCaptureViewModel
    @Environment(\.presentationMode) var presentation
    @Environment(\.managedObjectContext) private var viewContext
    @State private var evPointLocation: CGPoint = CGPoint()
    @State private var imageFrame = CGRect()
    
    @State private var croppingHeight: CGFloat = 512
    @State private var croppingWidth: CGFloat = 512
    @State private var showAlert = false
    @State private var isLoading = false
    @State private var alertTitle = ""
    @State private var alertMessage = ""
    @State private var retryCount = 0
    @State private var maxRetries = 2
    @State private var showRetryOption = false
    @State private var showSettingsOption = false
    @State private var showConfetti = false
    
    // Size presets
    let sizePresets = [
        (label: "Small", width: CGFloat(256), height: CGFloat(256)),
        (label: "Medium", width: CGFloat(512), height: CGFloat(512)),
        (label: "Large", width: CGFloat(768), height: CGFloat(768)),
        (label: "HD", width: CGFloat(1024), height: CGFloat(1024)),
        (label: "Original", width: CGFloat(300), height: CGFloat(300)),
        (label: "Square", width: CGFloat(600), height: CGFloat(600))
    ]
    
    private func isCurrentSize(_ preset: (label: String, width: CGFloat, height: CGFloat)) -> Bool {
        return Int(croppingWidth) == Int(preset.width) && Int(croppingHeight) == Int(preset.height)
    }
    
    var body: some View {
        ZStack {
            // Gradient Background
            LinearGradient(
                gradient: Gradient(colors: [
                    Color(red: 0.1, green: 0.1, blue: 0.2),
                    Color(red: 0.2, green: 0.1, blue: 0.3)
                ]),
                startPoint: .topLeading,
                endPoint: .bottomTrailing
            )
            .ignoresSafeArea()
            
            VStack(spacing: 0) {
                // Header
                VStack(spacing: 8) {
                    Text("Certify Your Image")
                        .font(.system(size: 28, weight: .bold))
                        .foregroundColor(.white)
                    
                    Text("Adjust the crop area and certify")
                        .font(.system(size: 14))
                        .foregroundColor(.white.opacity(0.7))
                }
                .padding(.top, 20)
                .padding(.bottom, 24)
                
                // Image Preview Card
                VStack(spacing: 16) {
                    // Image with crop overlay
                    ZStack {
                        if let capturedImage = viewModel.capturedImage {
                            Image(uiImage: capturedImage)
                                .resizable()
                                .aspectRatio(contentMode: .fit)
                                .frame(maxHeight: 400)
                                .clipShape(RoundedRectangle(cornerRadius: 16))
                        }
                        
                        ZStack {
                            // Image with crop overlay
                            if let capturedImage = viewModel.capturedImage {
                                GeometryReader { geo in
                                    let imageRect = calculateImageRect(imageSize: capturedImage.size, containerSize: geo.size)

                                    // The actual image
                                    Image(uiImage: capturedImage)
                                        .resizable()
                                        .aspectRatio(contentMode: .fit)
                                        .frame(width: imageRect.width, height: imageRect.height)
                                        .position(x: imageRect.midX, y: imageRect.midY)
                                        .overlay(
                                            // Crop overlay positioned relative to image
                                            CropOverlayView(
                                                imageRect: imageRect,
                                                croppingWidth: $croppingWidth,
                                                croppingHeight: $croppingHeight,
                                                imageSize: capturedImage.size
                                            )
                                        )
                                }
                            }
                        }
                    }
                    .padding()
                    .background(
                        RoundedRectangle(cornerRadius: 20)
                            .fill(Color.white.opacity(0.1))
                            .shadow(color: Color.black.opacity(0.2), radius: 20, x: 0, y: 10)
                    )
                    
                    // Crop Info Card
                    VStack(spacing: 12) {
                        HStack(spacing: 16) {
                            VStack(alignment: .leading, spacing: 4) {
                                Text("Crop Size")
                                    .font(.system(size: 12, weight: .semibold))
                                    .foregroundColor(.white.opacity(0.6))
                                VStack(alignment: .leading, spacing: 2) {
                                Text("\(Int(croppingWidth)) × \(Int(croppingHeight))")
                                    .font(.system(size: 16, weight: .bold))
                                    .foregroundColor(.white)
                                    if let image = viewModel.capturedImage {
                                        let cropX = max(0, Int32((image.size.width - croppingWidth) / 2))
                                        let cropY = max(0, Int32((image.size.height - croppingHeight) / 2))
                                        Text("at (\(cropX), \(cropY))")
                                            .font(.system(size: 11))
                                            .foregroundColor(.white.opacity(0.7))
                                    }
                                }
                                if let image = viewModel.capturedImage,
                                   (croppingWidth > image.size.width || croppingHeight > image.size.height) {
                                    Text("⚠️ Exceeds image size")
                                        .font(.system(size: 11))
                                        .foregroundColor(.red)
                                }
                            }
                            
                            Spacer()
                            
                            Image(systemName: "crop")
                                .font(.system(size: 24))
                                .foregroundColor(.blue.opacity(0.8))
                        }
                        
                        // Size Preset Options
                        ScrollView(.horizontal, showsIndicators: false) {
                            HStack(spacing: 10) {
                                ForEach(sizePresets, id: \.label) { preset in
                                    Button(action: {
                                        withAnimation(.spring()) {
                                            croppingWidth = preset.width
                                            croppingHeight = preset.height
                                        }
                                    }) {
                                        Text(preset.label)
                                            .font(.system(size: 12, weight: .semibold))
                                            .foregroundColor(isCurrentSize(preset) ? .white : .white.opacity(0.7))
                                            .padding(.horizontal, 12)
                                            .padding(.vertical, 6)
                                            .background(
                                                Capsule()
                                                    .fill(isCurrentSize(preset) ? Color.blue : Color.white.opacity(0.2))
                                            )
                                    }
                                }
                            }
                        }
                    }
                    .padding()
                    .background(
                        RoundedRectangle(cornerRadius: 12)
                            .fill(Color.white.opacity(0.1))
                    )
                }
                .padding(.horizontal, 20)
                
                Spacer()
                
                // Action Buttons
                VStack(spacing: 12) {
                    // Certify Button
                    Button(action: certifyImage) {
                        HStack(spacing: 12) {
                            if isLoading {
                                ProgressView()
                                    .progressViewStyle(CircularProgressViewStyle(tint: .white))
                            } else {
                                Image(systemName: "checkmark.seal.fill")
                                    .font(.system(size: 20))
                            }
                            
                            Text(isLoading ? "Certifying..." : "Certify Image")
                                .font(.system(size: 18, weight: .semibold))
                        }
                        .foregroundColor(.white)
                        .frame(maxWidth: .infinity)
                        .frame(height: 56)
                        .background(
                            LinearGradient(
                                gradient: Gradient(colors: isLoading ? 
                                    [Color.gray, Color.gray.opacity(0.8)] :
                                    [Color.blue, Color.purple]
                                ),
                                startPoint: .leading,
                                endPoint: .trailing
                            )
                        )
                        .cornerRadius(16)
                        .shadow(color: isLoading ? Color.clear : Color.blue.opacity(0.5), radius: 15, x: 0, y: 8)
                    }
                    .disabled(isLoading)
                    
                    // Cancel Button
                    Button(action: {
                        presentation.wrappedValue.dismiss()
                    }) {
                        Text("Cancel")
                            .font(.system(size: 16, weight: .medium))
                            .foregroundColor(.white.opacity(0.8))
                            .frame(maxWidth: .infinity)
                            .frame(height: 48)
                            .background(
                                RoundedRectangle(cornerRadius: 12)
                                    .stroke(Color.white.opacity(0.3), lineWidth: 1.5)
                            )
                    }
                    .disabled(isLoading)
                }
                .padding(.horizontal, 20)
                .padding(.bottom, 30)
            }
            
            // Success confetti overlay
            SimpleConfettiView(isShowing: $showConfetti)
            
            .alert(isPresented: $showAlert) {
                if showSettingsOption {
                    return Alert(
                        title: Text(alertTitle),
                        message: Text(alertMessage),
                        primaryButton: .default(Text("Open Settings")) {
                            openAppSettings()
                        },
                        secondaryButton: .cancel(Text("Cancel")) {
                            self.presentation.wrappedValue.dismiss()
                        }
                    )
                } else if showRetryOption {
                    return Alert(
                        title: Text(alertTitle),
                        message: Text(alertMessage),
                        primaryButton: .default(Text("Retry")) {
                            retryCount += 1
                            certifyImage()
                        },
                        secondaryButton: .cancel(Text("Cancel")) {
                            self.presentation.wrappedValue.dismiss()
                        }
                    )
                } else {
                    return Alert(
                        title: Text(alertTitle),
                        message: Text(alertMessage),
                        dismissButton: .default(Text("OK")) {
                            if !isLoading && alertTitle.contains("Success") {
                                self.presentation.wrappedValue.dismiss()
                            }
                        }
                    )
                }
            }
        }
        .navigationBarBackButtonHidden(true)
    }
    
    private func certifyImage() {
        guard let attestedImage = viewModel.attestedImage else {
            alertTitle = "Error"
            alertMessage = "No image available for certification"
            showAlert = true
            return
        }
        
        isLoading = true
        showSettingsOption = false
        
        // Convert signature and public key from String? to Data?
        // Use flatMap to properly handle nil values instead of converting empty strings
        let signatureData = attestedImage.signature.flatMap { Data(base64Encoded: $0) }
        let publicKeyData = attestedImage.publicKey.flatMap { Data(base64Encoded: $0) }
        
        // Validate that we have signature and public key data
        guard signatureData != nil && publicKeyData != nil else {
            alertTitle = "Error"
            alertMessage = "Missing signature or public key data. Please retake the photo."
            showAlert = true
            isLoading = false
            return
        }
        
        // Convert c2paClaim struct to a JSON String
        var c2paClaimString: String?
        if let claim = attestedImage.c2paClaim {
            let encoder = JSONEncoder()
            if let jsonData = try? encoder.encode(claim) {
                c2paClaimString = String(data: jsonData, encoding: .utf8)
            }
        }
        
        // Get ZK proof setting
        let enableZKProofs = UserDefaults.standard.bool(forKey: "enableZKProofs")
        
        // Calculate centered crop coordinates
        guard let image = viewModel.capturedImage else { return }
        let imageSize = image.size
        
        // Ensure crop doesn't exceed image bounds
        let actualCropWidth = min(croppingWidth, imageSize.width)
        let actualCropHeight = min(croppingHeight, imageSize.height)
        
        let cropX = max(0, Int32((imageSize.width - actualCropWidth) / 2))
        let cropY = max(0, Int32((imageSize.height - actualCropHeight) / 2))
        
        print("🖼️ Image size: \(imageSize.width)x\(imageSize.height)")
        print("✂️ Requested crop: \(Int(croppingWidth))x\(Int(croppingHeight))")
        print("✅ Actual crop: \(Int(actualCropWidth))x\(Int(actualCropHeight)) at (\(cropX),\(cropY))")
        
        // Show warning if crop was adjusted
        if actualCropWidth < croppingWidth || actualCropHeight < croppingHeight {
            print("⚠️ Crop size adjusted to fit within image bounds")
        }
        
        ProverManager.shared.proveImage(
            signature: signatureData,
            image: attestedImage.imageData,
            publicKey: publicKeyData,
            c2paClaim: c2paClaimString,
            croppingHeight: Int32(actualCropHeight),
            croppingWidth: Int32(actualCropWidth),
            croppingX: cropX,
            croppingY: cropY,
            proofMetadata: attestedImage.proofMetadata,  // ✅ Send Anti-AI proof!
            useZKProofs: enableZKProofs
        ) { result in
            DispatchQueue.main.async {
                isLoading = false
                
                switch result {
                case .success(let response):
                    alertTitle = "Success! ✅"
                    alertMessage = response.message
                    if let signatureValid = response.signatureValid {
                        alertMessage += "\nSignature: \(signatureValid ? "Valid" : "Invalid")"
                    }
                    
                    // Show ZK proof info if available
                    if let zkProofs = response.zkProofs, !zkProofs.isEmpty {
                        alertMessage += "\n\n🔐 ZK Proofs: \(zkProofs.count)"
                        for proof in zkProofs {
                            alertMessage += "\n• \(proof.type) (privacy preserved)"
                        }
                    }
                    
                    // Always save certified image to gallery
                    // Check if auto-save is enabled (default is true)
                    let autoSaveEnabled = UserDefaults.standard.object(forKey: "autoSaveToGallery") as? Bool ?? true
                    
                    if autoSaveEnabled {
                        self.saveCertifiedImage(response: response)
                        alertMessage += "\n\n💾 Saving cropped image..."
                    }
                    
                    // Show confetti on success! 🎉
                    showConfetti = true
                    
                    // Haptic celebration
                    UINotificationFeedbackGenerator().notificationOccurred(.success)
                    
                    showAlert = true
                    
                case .failure(let error):
                    showRetryOption = false
                    showSettingsOption = false
                    alertTitle = "Certification Failed"
                    
                    switch error {
                    case .localNetworkPermissionRequired:
                        alertTitle = "Enable Local Network Access"
                        alertMessage = """
To reach your secure prover at \(ProverManager.shared.getBackendURL()), rial needs permission to use the local network.

Please open Settings ▸ Privacy & Security ▸ Local Network, enable access for \"rial\", then return to the app and try again.
"""
                        showSettingsOption = true
                    case .networkError(let underlyingError):
                        if retryCount < maxRetries {
                            alertMessage = "Network error: \(underlyingError.localizedDescription)\n\nWould you like to retry? (Attempt \(retryCount + 1)/\(maxRetries))"
                            showRetryOption = true
                        } else {
                            alertMessage = "Network error: \(underlyingError.localizedDescription)\n\nMax retries reached. Please check your connection and try again later."
                        }
                    default:
                        if retryCount < maxRetries {
                            alertMessage = "\(error.localizedDescription)\n\nWould you like to retry? (Attempt \(retryCount + 1)/\(maxRetries))"
                            showRetryOption = true
                        } else {
                            alertMessage = "\(error.localizedDescription)\n\nMax retries reached. Please check your connection and try again later."
                        }
                    }
                    
                    showAlert = true
                }
            }
        }
    }
    
    private func saveCertifiedImage(response: ProverResponse) {
        guard let attestedImage = viewModel.attestedImage else { return }
        
        // If we have a transformed image URL, download and save that
        if let imageUrl = response.imageUrl {
            downloadAndSaveTransformedImage(imageUrl: imageUrl, attestedImage: attestedImage, response: response)
        } else {
            // Fallback to original image if no URL
        PersistenceController.shared.saveCertifiedImage(
            attestedImage: attestedImage,
            imageUrl: response.imageUrl,
            isVerified: response.signatureValid ?? false
        )
        
        print("✅ Certified image saved to gallery")
        
        // Haptic feedback for successful save
        UINotificationFeedbackGenerator().notificationOccurred(.success)
    }
}

    private func openAppSettings() {
        guard let settingsURL = URL(string: UIApplication.openSettingsURLString) else {
            return
        }
        if UIApplication.shared.canOpenURL(settingsURL) {
            UIApplication.shared.open(settingsURL, options: [:], completionHandler: nil)
        }
    }

    private func downloadAndSaveTransformedImage(imageUrl: String, attestedImage: AttestedImage, response: ProverResponse) {
        // Construct full URL
        let backendURL = ProverManager.shared.getBackendURL()
        guard let url = URL(string: backendURL + imageUrl) else {
            print("❌ Invalid image URL: \(imageUrl)")
            return
        }
        
        print("📥 Downloading transformed image from: \(url)")
        
        // Download the transformed image
        URLSession.shared.dataTask(with: url) { data, _, error in
            if let error = error {
                print("❌ Failed to download transformed image: \(error)")
                return
            }
            
            guard let imageData = data else {
                print("❌ No image data received")
                return
            }
            
            print("✅ Downloaded transformed image: \(imageData.count) bytes")
            
            // Create UIImage from the downloaded data
            guard let transformedUIImage = UIImage(data: imageData) else {
                print("❌ Failed to create UIImage from downloaded data")
                return
            }
            
            // Create a new attested image with the transformed UIImage
            let transformedAttestedImage = AttestedImage(
                image: transformedUIImage,
                c2paClaim: attestedImage.c2paClaim,
                proofMetadata: attestedImage.proofMetadata
            )
            
            DispatchQueue.main.async {
                // Save the transformed image
                PersistenceController.shared.saveCertifiedImage(
                    attestedImage: transformedAttestedImage,
                    imageUrl: response.imageUrl,
                    isVerified: response.signatureValid ?? false
                )
                
                print("✅ Transformed image saved to gallery")
                
                // Save to iOS photo library if enabled
                UIImageWriteToSavedPhotosAlbum(transformedUIImage, nil, nil, nil)
                print("✅ Also saved to iOS Photos app")
                
                // Haptic feedback for successful save
                UINotificationFeedbackGenerator().notificationOccurred(.success)
            }
        }.resume()
    }

    private func calculateImageRect(imageSize: CGSize, containerSize: CGSize) -> CGRect {
        let imageAspect = imageSize.width / imageSize.height
        let containerAspect = containerSize.width / containerSize.height

        var imageRect: CGRect

        if imageAspect > containerAspect {
            // Image is wider than container - fit by width
            let scaledHeight = containerSize.width / imageAspect
            imageRect = CGRect(
                x: 0,
                y: (containerSize.height - scaledHeight) / 2,
                width: containerSize.width,
                height: scaledHeight
            )
        } else {
            // Image is taller than container - fit by height
            let scaledWidth = containerSize.height * imageAspect
            imageRect = CGRect(
                x: (containerSize.width - scaledWidth) / 2,
                y: 0,
                width: scaledWidth,
                height: containerSize.height
            )
        }

        return imageRect
    }
}

struct CropOverlayView: View {
    let imageRect: CGRect
    @Binding var croppingWidth: CGFloat
    @Binding var croppingHeight: CGFloat
    let imageSize: CGSize

    @State private var cropRect: CGRect = CGRect(x: 0, y: 0, width: 300, height: 300)
    @State private var activeCorner: Corner? = nil
    @State private var dragStartRect = CGRect.zero

    private var isWithinBounds: Bool {
        let imageCropRect = convertScreenCropToImageCrop(cropRect, imageRect, imageSize)
        return imageCropRect.maxX <= imageSize.width && imageCropRect.maxY <= imageSize.height &&
               imageCropRect.minX >= 0 && imageCropRect.minY >= 0
    }
    
    var body: some View {
            ZStack {
            // Dark overlay outside crop area
                Rectangle()
                .fill(Color.black.opacity(0.6))
                    .mask(
                        Rectangle()
                        .frame(width: imageRect.width, height: imageRect.height)
                            .overlay(
                                Rectangle()
                                    .frame(width: cropRect.width, height: cropRect.height)
                                .position(x: cropRect.midX, y: cropRect.midY)
                                    .blendMode(.destinationOut)
                            )
                    )
                    .allowsHitTesting(false)
                
            // Crop rectangle with grid
                ZStack {
                // Rule of thirds grid
                    Path { path in
                        let w = cropRect.width
                        let h = cropRect.height
                        
                        // Vertical lines
                        path.move(to: CGPoint(x: w/3, y: 0))
                        path.addLine(to: CGPoint(x: w/3, y: h))
                        path.move(to: CGPoint(x: 2*w/3, y: 0))
                        path.addLine(to: CGPoint(x: 2*w/3, y: h))
                        
                        // Horizontal lines
                        path.move(to: CGPoint(x: 0, y: h/3))
                        path.addLine(to: CGPoint(x: w, y: h/3))
                        path.move(to: CGPoint(x: 0, y: 2*h/3))
                        path.addLine(to: CGPoint(x: w, y: 2*h/3))
                    }
                .stroke(Color.white.opacity(0.8), lineWidth: 1)
                    
                // Border
                    Rectangle()
                    .stroke(isWithinBounds ? Color.white : Color.red, lineWidth: 3)
                    .frame(width: cropRect.width, height: cropRect.height)
                }
                .frame(width: cropRect.width, height: cropRect.height)
            .position(x: cropRect.midX, y: cropRect.midY)
                .gesture(
                    DragGesture()
                        .onChanged { value in
                            var newRect = cropRect
                            newRect.origin.x = dragStartRect.origin.x + value.translation.width
                            newRect.origin.y = dragStartRect.origin.y + value.translation.height
                            
                        // Keep within image bounds
                        newRect.origin.x = max(imageRect.minX, min(newRect.origin.x, imageRect.maxX - newRect.width))
                        newRect.origin.y = max(imageRect.minY, min(newRect.origin.y, imageRect.maxY - newRect.height))
                            
                            cropRect = newRect
                        updateParentBindings()
                        }
                        .onEnded { _ in
                            dragStartRect = cropRect
                        }
                )
                
            // Corner handles
                ForEach(Corner.allCases, id: \.self) { corner in
                let cornerPosition = getCornerPosition(corner: corner, rect: cropRect)
                    
                    Circle()
                    .fill(Color.white)
                    .frame(width: 24, height: 24)
                    .overlay(
                        Circle()
                            .stroke(Color.blue, lineWidth: 2)
                            .frame(width: 24, height: 24)
                    )
                        .position(cornerPosition)
                        .gesture(
                            DragGesture()
                                .onChanged { value in
                                resizeCrop(corner: corner, translation: value.translation)
                                updateParentBindings()
                            }
                            .onEnded { _ in
                                dragStartRect = cropRect
                            }
                        )
            }

            // Edge handles for better UX
            ForEach(Edge.allCases, id: \.self) { edge in
                let edgePosition = getEdgePosition(edge: edge, rect: cropRect)

                Rectangle()
                    .fill(Color.blue.opacity(0.8))
                    .frame(width: edge == .top || edge == .bottom ? cropRect.width : 20,
                           height: edge == .left || edge == .right ? cropRect.height : 20)
                    .position(edgePosition)
                    .gesture(
                        DragGesture()
                            .onChanged { value in
                                resizeCrop(edge: edge, translation: value.translation)
                                updateParentBindings()
                                }
                                .onEnded { _ in
                                    dragStartRect = cropRect
                                }
                        )
                }
            }
        .frame(width: imageRect.width, height: imageRect.height)
        .position(x: imageRect.midX, y: imageRect.midY)
            .onAppear {
            initializeCropRect()
        }
    }

    private func initializeCropRect() {
        // Initialize with a reasonable default size (80% of image dimensions)
        let defaultWidth = imageRect.width * 0.8
        let defaultHeight = imageRect.height * 0.8

        cropRect = CGRect(
            x: imageRect.midX - defaultWidth/2,
            y: imageRect.midY - defaultHeight/2,
            width: defaultWidth,
            height: defaultHeight
        )
        dragStartRect = cropRect
        updateParentBindings()
    }

    private func resizeCrop(corner: Corner, translation: CGSize) {
        var newRect = dragStartRect
        
        switch corner {
        case .topLeft:
            newRect.origin.x += translation.width
            newRect.origin.y += translation.height
            newRect.size.width -= translation.width
            newRect.size.height -= translation.height
        case .topRight:
            newRect.origin.y += translation.height
            newRect.size.width += translation.width
            newRect.size.height -= translation.height
        case .bottomLeft:
            newRect.origin.x += translation.width
            newRect.size.width -= translation.width
            newRect.size.height += translation.height
        case .bottomRight:
            newRect.size.width += translation.width
            newRect.size.height += translation.height
        }

        // Enforce minimum size and maximum bounds
        let minSize: CGFloat = 50
        newRect.size.width = max(minSize, min(newRect.size.width, imageRect.width))
        newRect.size.height = max(minSize, min(newRect.size.height, imageRect.height))

        // Keep within image bounds
        newRect.origin.x = max(imageRect.minX, min(newRect.origin.x, imageRect.maxX - newRect.width))
        newRect.origin.y = max(imageRect.minY, min(newRect.origin.y, imageRect.maxY - newRect.height))

        cropRect = newRect
    }

    private func resizeCrop(edge: Edge, translation: CGSize) {
        var newRect = dragStartRect

        switch edge {
        case .top:
            newRect.origin.y += translation.height
            newRect.size.height -= translation.height
        case .bottom:
            newRect.size.height += translation.height
        case .left:
            newRect.origin.x += translation.width
            newRect.size.width -= translation.width
        case .right:
            newRect.size.width += translation.width
        }

        // Enforce constraints
        let minSize: CGFloat = 50
        newRect.size.width = max(minSize, min(newRect.size.width, imageRect.width))
        newRect.size.height = max(minSize, min(newRect.size.height, imageRect.height))

        newRect.origin.x = max(imageRect.minX, min(newRect.origin.x, imageRect.maxX - newRect.width))
        newRect.origin.y = max(imageRect.minY, min(newRect.origin.y, imageRect.maxY - newRect.height))

        cropRect = newRect
    }

    private func getCornerPosition(corner: Corner, rect: CGRect) -> CGPoint {
        switch corner {
        case .topLeft: return CGPoint(x: rect.minX, y: rect.minY)
        case .topRight: return CGPoint(x: rect.maxX, y: rect.minY)
        case .bottomLeft: return CGPoint(x: rect.minX, y: rect.maxY)
        case .bottomRight: return CGPoint(x: rect.maxX, y: rect.maxY)
        }
    }

    private func getEdgePosition(edge: Edge, rect: CGRect) -> CGPoint {
        switch edge {
        case .top: return CGPoint(x: rect.midX, y: rect.minY)
        case .bottom: return CGPoint(x: rect.midX, y: rect.maxY)
        case .left: return CGPoint(x: rect.minX, y: rect.midY)
        case .right: return CGPoint(x: rect.maxX, y: rect.midY)
        }
    }

    private func updateParentBindings() {
        // Convert screen crop coordinates to image coordinates for backend
        let imageCropRect = convertScreenCropToImageCrop(cropRect, imageRect, imageSize)
        croppingWidth = imageCropRect.width
        croppingHeight = imageCropRect.height
    }

    private func convertScreenCropToImageCrop(_ screenRect: CGRect, _ imageScreenRect: CGRect, _ actualImageSize: CGSize) -> CGRect {
        // Convert from screen coordinates to actual image coordinates
        let scaleX = actualImageSize.width / imageScreenRect.width
        let scaleY = actualImageSize.height / imageScreenRect.height

        let imageX = (screenRect.minX - imageScreenRect.minX) * scaleX
        let imageY = (screenRect.minY - imageScreenRect.minY) * scaleY
        let imageWidth = screenRect.width * scaleX
        let imageHeight = screenRect.height * scaleY

        return CGRect(x: max(0, imageX), y: max(0, imageY), width: imageWidth, height: imageHeight)
    }
}

enum Corner {
    case topLeft, topRight, bottomLeft, bottomRight

    static var allCases: [Corner] {
        [.topLeft, .topRight, .bottomLeft, .bottomRight]
    }
}

enum Edge {
    case top, bottom, left, right

    static var allCases: [Edge] {
        [.top, .bottom, .left, .right]
    }
}


struct ImageEditView_Previews: PreviewProvider {
    static var previews: some View {
        ImageEditView()
    }
}
