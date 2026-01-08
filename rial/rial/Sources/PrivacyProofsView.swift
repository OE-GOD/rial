//
//  PrivacyProofsView.swift
//  rial
//
//  Privacy-Preserving Transformation Proofs UI
//  Based on: "Trust Nobody: Privacy-Preserving Proofs for Edited Photos"
//

import SwiftUI
import UIKit

struct PrivacyProofsView: View {
    @Environment(\.presentationMode) var presentationMode
    @EnvironmentObject private var viewModel: ImageCaptureViewModel

    @State private var selectedMode: PrivacyMode = .selectiveReveal
    @State private var isProcessing = false
    @State private var showResult = false
    @State private var resultMessage = ""
    @State private var resultSuccess = false
    @State private var processedImage: UIImage?

    // Selective reveal region
    @State private var revealRegion = CGRect(x: 50, y: 50, width: 200, height: 200)

    // Redaction regions
    @State private var redactionRegions: [RedactionRegionUI] = []
    @State private var selectedRedactionType: RedactionType = .blur

    // Commitment tracking
    @State private var commitmentId: String?
    @State private var hasCommitment = false

    enum PrivacyMode: String, CaseIterable {
        case selectiveReveal = "Selective Reveal"
        case redaction = "Privacy Redaction"
        case transformProof = "Transform + Proof"
    }

    var body: some View {
        NavigationView {
            ZStack {
                // Background
                LinearGradient(
                    gradient: Gradient(colors: [
                        Color(red: 0.05, green: 0.1, blue: 0.2),
                        Color(red: 0.15, green: 0.1, blue: 0.25)
                    ]),
                    startPoint: .topLeading,
                    endPoint: .bottomTrailing
                )
                .ignoresSafeArea()

                VStack(spacing: 0) {
                    // Mode Selector
                    modeSelectorView
                        .padding(.horizontal)
                        .padding(.top, 8)

                    // Main Content
                    ScrollView {
                        VStack(spacing: 20) {
                            // Image Preview with Interactive Overlay
                            imagePreviewCard

                            // Mode-specific controls
                            modeControlsCard

                            // Privacy Guarantees Info
                            privacyGuaranteesCard

                            // Action Button
                            actionButton
                        }
                        .padding()
                    }
                }

                // Processing Overlay
                if isProcessing {
                    processingOverlay
                }
            }
            .navigationTitle("Privacy Proofs")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .navigationBarLeading) {
                    Button("Cancel") {
                        presentationMode.wrappedValue.dismiss()
                    }
                    .foregroundColor(.white)
                }
            }
            .alert(isPresented: $showResult) {
                Alert(
                    title: Text(resultSuccess ? "Success" : "Error"),
                    message: Text(resultMessage),
                    dismissButton: .default(Text("OK")) {
                        if resultSuccess {
                            presentationMode.wrappedValue.dismiss()
                        }
                    }
                )
            }
        }
    }

    // MARK: - Mode Selector

    private var modeSelectorView: some View {
        HStack(spacing: 8) {
            ForEach(PrivacyMode.allCases, id: \.self) { mode in
                Button(action: {
                    withAnimation(.spring()) {
                        selectedMode = mode
                    }
                }) {
                    VStack(spacing: 4) {
                        Image(systemName: iconForMode(mode))
                            .font(.system(size: 18))
                        Text(mode.rawValue)
                            .font(.system(size: 10, weight: .medium))
                    }
                    .foregroundColor(selectedMode == mode ? .white : .white.opacity(0.6))
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 12)
                    .background(
                        RoundedRectangle(cornerRadius: 12)
                            .fill(selectedMode == mode ? Color.blue : Color.white.opacity(0.1))
                    )
                }
            }
        }
    }

    private func iconForMode(_ mode: PrivacyMode) -> String {
        switch mode {
        case .selectiveReveal: return "eye.circle"
        case .redaction: return "eye.slash.circle"
        case .transformProof: return "wand.and.stars"
        }
    }

    // MARK: - Image Preview Card

    private var imagePreviewCard: some View {
        VStack(spacing: 12) {
            Text("Image Preview")
                .font(.system(size: 14, weight: .semibold))
                .foregroundColor(.white.opacity(0.7))
                .frame(maxWidth: .infinity, alignment: .leading)

            if let image = viewModel.capturedImage {
                ZStack {
                    Image(uiImage: processedImage ?? image)
                        .resizable()
                        .aspectRatio(contentMode: .fit)
                        .frame(maxHeight: 300)
                        .clipShape(RoundedRectangle(cornerRadius: 12))

                    // Overlay for region selection
                    GeometryReader { geo in
                        let imageFrame = calculateImageFrame(image: image, in: geo.size)

                        if selectedMode == .selectiveReveal {
                            SelectiveRevealOverlay(
                                region: $revealRegion,
                                imageFrame: imageFrame,
                                imageSize: image.size
                            )
                        } else if selectedMode == .redaction {
                            RedactionOverlay(
                                regions: $redactionRegions,
                                imageFrame: imageFrame,
                                imageSize: image.size
                            )
                        }
                    }
                }
                .frame(maxHeight: 300)
            } else {
                RoundedRectangle(cornerRadius: 12)
                    .fill(Color.white.opacity(0.1))
                    .frame(height: 200)
                    .overlay(
                        Text("No image available")
                            .foregroundColor(.white.opacity(0.5))
                    )
            }
        }
        .padding()
        .background(
            RoundedRectangle(cornerRadius: 16)
                .fill(Color.white.opacity(0.1))
        )
    }

    // MARK: - Mode Controls Card

    private var modeControlsCard: some View {
        VStack(spacing: 16) {
            switch selectedMode {
            case .selectiveReveal:
                selectiveRevealControls
            case .redaction:
                redactionControls
            case .transformProof:
                transformProofControls
            }
        }
        .padding()
        .background(
            RoundedRectangle(cornerRadius: 16)
                .fill(Color.white.opacity(0.1))
        )
    }

    private var selectiveRevealControls: some View {
        VStack(alignment: .leading, spacing: 12) {
            Label("Selective Reveal", systemImage: "eye.circle")
                .font(.system(size: 16, weight: .semibold))
                .foregroundColor(.white)

            Text("Share only a portion of your image while proving it came from an authenticated original. The rest remains private.")
                .font(.system(size: 13))
                .foregroundColor(.white.opacity(0.7))

            Divider().background(Color.white.opacity(0.2))

            HStack {
                VStack(alignment: .leading) {
                    Text("Region Size")
                        .font(.system(size: 12, weight: .medium))
                        .foregroundColor(.white.opacity(0.6))
                    Text("\(Int(revealRegion.width)) x \(Int(revealRegion.height))")
                        .font(.system(size: 14, weight: .semibold))
                        .foregroundColor(.white)
                }

                Spacer()

                VStack(alignment: .trailing) {
                    Text("Position")
                        .font(.system(size: 12, weight: .medium))
                        .foregroundColor(.white.opacity(0.6))
                    Text("(\(Int(revealRegion.origin.x)), \(Int(revealRegion.origin.y)))")
                        .font(.system(size: 14, weight: .semibold))
                        .foregroundColor(.white)
                }
            }

            Text("Drag the overlay on the image to select the region to reveal")
                .font(.system(size: 11))
                .foregroundColor(.blue.opacity(0.8))
                .italic()
        }
    }

    private var redactionControls: some View {
        VStack(alignment: .leading, spacing: 12) {
            Label("Privacy Redaction", systemImage: "eye.slash.circle")
                .font(.system(size: 16, weight: .semibold))
                .foregroundColor(.white)

            Text("Blur or black out sensitive areas. Cryptographic proof ensures the rest of the image is untouched.")
                .font(.system(size: 13))
                .foregroundColor(.white.opacity(0.7))

            Divider().background(Color.white.opacity(0.2))

            HStack {
                Text("Redaction Type:")
                    .font(.system(size: 13))
                    .foregroundColor(.white.opacity(0.7))

                Picker("Type", selection: $selectedRedactionType) {
                    Text("Blur").tag(RedactionType.blur)
                    Text("Black").tag(RedactionType.black)
                }
                .pickerStyle(SegmentedPickerStyle())
            }

            HStack {
                Button(action: addRedactionRegion) {
                    Label("Add Region", systemImage: "plus.circle")
                        .font(.system(size: 13, weight: .medium))
                        .foregroundColor(.blue)
                }

                Spacer()

                if !redactionRegions.isEmpty {
                    Button(action: { redactionRegions.removeAll() }) {
                        Label("Clear All", systemImage: "trash")
                            .font(.system(size: 13, weight: .medium))
                            .foregroundColor(.red)
                    }
                }
            }

            if !redactionRegions.isEmpty {
                Text("\(redactionRegions.count) region(s) marked for redaction")
                    .font(.system(size: 12))
                    .foregroundColor(.orange)
            }
        }
    }

    private var transformProofControls: some View {
        VStack(alignment: .leading, spacing: 12) {
            Label("Transform + Proof", systemImage: "wand.and.stars")
                .font(.system(size: 16, weight: .semibold))
                .foregroundColor(.white)

            Text("Apply transformations with cryptographic proof. Verifiers can confirm the result came from an authentic original without seeing it.")
                .font(.system(size: 13))
                .foregroundColor(.white.opacity(0.7))

            Divider().background(Color.white.opacity(0.2))

            // Commitment status
            HStack {
                Image(systemName: hasCommitment ? "checkmark.circle.fill" : "circle")
                    .foregroundColor(hasCommitment ? .green : .gray)
                Text(hasCommitment ? "Commitment created" : "No commitment yet")
                    .font(.system(size: 13))
                    .foregroundColor(.white.opacity(0.7))
            }

            if !hasCommitment {
                Button(action: createCommitment) {
                    HStack {
                        Image(systemName: "lock.shield")
                        Text("Create Commitment")
                    }
                    .font(.system(size: 14, weight: .medium))
                    .foregroundColor(.white)
                    .padding(.horizontal, 16)
                    .padding(.vertical, 10)
                    .background(Color.blue)
                    .cornerRadius(8)
                }
            }
        }
    }

    // MARK: - Privacy Guarantees Card

    private var privacyGuaranteesCard: some View {
        VStack(alignment: .leading, spacing: 12) {
            Label("Privacy Guarantees", systemImage: "shield.checkered")
                .font(.system(size: 14, weight: .semibold))
                .foregroundColor(.white)

            HStack(spacing: 16) {
                guaranteeItem(icon: "eye.slash", text: "Original Hidden")
                guaranteeItem(icon: "checkmark.seal", text: "Verified Authentic")
                guaranteeItem(icon: "bolt", text: "Fast Verification")
            }
        }
        .padding()
        .background(
            RoundedRectangle(cornerRadius: 16)
                .fill(Color.green.opacity(0.15))
                .overlay(
                    RoundedRectangle(cornerRadius: 16)
                        .stroke(Color.green.opacity(0.3), lineWidth: 1)
                )
        )
    }

    private func guaranteeItem(icon: String, text: String) -> some View {
        VStack(spacing: 4) {
            Image(systemName: icon)
                .font(.system(size: 20))
                .foregroundColor(.green)
            Text(text)
                .font(.system(size: 10, weight: .medium))
                .foregroundColor(.white.opacity(0.8))
                .multilineTextAlignment(.center)
        }
        .frame(maxWidth: .infinity)
    }

    // MARK: - Action Button

    private var actionButton: some View {
        Button(action: performAction) {
            HStack(spacing: 12) {
                Image(systemName: actionButtonIcon)
                    .font(.system(size: 18))
                Text(actionButtonText)
                    .font(.system(size: 16, weight: .semibold))
            }
            .foregroundColor(.white)
            .frame(maxWidth: .infinity)
            .frame(height: 54)
            .background(
                LinearGradient(
                    gradient: Gradient(colors: [Color.blue, Color.purple]),
                    startPoint: .leading,
                    endPoint: .trailing
                )
            )
            .cornerRadius(14)
            .shadow(color: Color.blue.opacity(0.4), radius: 10, x: 0, y: 5)
        }
        .disabled(isProcessing || !canPerformAction)
        .opacity(canPerformAction ? 1.0 : 0.5)
    }

    private var actionButtonIcon: String {
        switch selectedMode {
        case .selectiveReveal: return "eye.circle.fill"
        case .redaction: return "wand.and.stars"
        case .transformProof: return "checkmark.seal.fill"
        }
    }

    private var actionButtonText: String {
        switch selectedMode {
        case .selectiveReveal: return "Create Selective Reveal Proof"
        case .redaction: return "Redact & Generate Proof"
        case .transformProof: return "Transform with Proof"
        }
    }

    private var canPerformAction: Bool {
        guard viewModel.capturedImage != nil else { return false }

        switch selectedMode {
        case .selectiveReveal:
            return true
        case .redaction:
            return !redactionRegions.isEmpty
        case .transformProof:
            return hasCommitment
        }
    }

    // MARK: - Processing Overlay

    private var processingOverlay: some View {
        ZStack {
            Color.black.opacity(0.7)
                .ignoresSafeArea()

            VStack(spacing: 20) {
                ProgressView()
                    .progressViewStyle(CircularProgressViewStyle(tint: .white))
                    .scaleEffect(1.5)

                Text("Generating Privacy Proof...")
                    .font(.system(size: 16, weight: .medium))
                    .foregroundColor(.white)

                Text("This may take a few seconds")
                    .font(.system(size: 13))
                    .foregroundColor(.white.opacity(0.7))
            }
            .padding(40)
            .background(
                RoundedRectangle(cornerRadius: 20)
                    .fill(Color.white.opacity(0.1))
            )
        }
    }

    // MARK: - Actions

    private func performAction() {
        guard let image = viewModel.capturedImage else { return }

        isProcessing = true

        switch selectedMode {
        case .selectiveReveal:
            performSelectiveReveal(image: image)
        case .redaction:
            performRedaction(image: image)
        case .transformProof:
            performTransformWithProof(image: image)
        }
    }

    private func performSelectiveReveal(image: UIImage) {
        PrivacyProofsManager.shared.selectiveReveal(
            image: image,
            region: revealRegion
        ) { result in
            isProcessing = false

            switch result {
            case .success(let (response, _)):
                if response.success {
                    resultSuccess = true
                    let ratio = response.proof?.proof?.revealRatio ?? "unknown"
                    resultMessage = """
                    Selective reveal proof created!

                    Only \(ratio) of the image is revealed.
                    The rest remains cryptographically private.

                    Verifiers can confirm this region came from your authenticated original.
                    """
                } else {
                    resultSuccess = false
                    resultMessage = response.error ?? "Failed to create selective reveal proof"
                }
            case .failure(let error):
                resultSuccess = false
                resultMessage = error.localizedDescription
            }

            showResult = true
        }
    }

    private func performRedaction(image: UIImage) {
        let regions = redactionRegions.map { region in
            RedactionRegion(
                x: Int(region.rect.origin.x),
                y: Int(region.rect.origin.y),
                width: Int(region.rect.width),
                height: Int(region.rect.height),
                type: region.type
            )
        }

        PrivacyProofsManager.shared.redactRegions(
            image: image,
            regions: regions
        ) { result in
            isProcessing = false

            switch result {
            case .success(let (response, _)):
                if response.success {
                    resultSuccess = true
                    let preserved = response.redactions?.preservedRatio ?? "unknown"
                    resultMessage = """
                    Redaction proof created!

                    \(response.redactions?.count ?? 0) region(s) redacted.
                    \(preserved) of the image proven untouched.

                    Share the redacted image with cryptographic proof.
                    """
                } else {
                    resultSuccess = false
                    resultMessage = response.error ?? "Failed to create redaction proof"
                }
            case .failure(let error):
                resultSuccess = false
                resultMessage = error.localizedDescription
            }

            showResult = true
        }
    }

    private func performTransformWithProof(image: UIImage) {
        guard let commitmentId = commitmentId else {
            resultSuccess = false
            resultMessage = "No commitment created. Please create a commitment first."
            showResult = true
            isProcessing = false
            return
        }

        // Create a crop transformation using the reveal region as an example
        let transformation = PrivacyTransformation(
            type: .crop,
            params: [
                "x": Int(revealRegion.origin.x),
                "y": Int(revealRegion.origin.y),
                "width": Int(revealRegion.width),
                "height": Int(revealRegion.height)
            ]
        )

        PrivacyProofsManager.shared.applyTransformationWithProof(
            image: image,
            commitmentId: commitmentId,
            transformation: transformation
        ) { result in
            isProcessing = false

            switch result {
            case .success(let (response, _)):
                if response.success {
                    resultSuccess = true
                    let time = response.proof?.metrics?.provingTime ?? 0
                    resultMessage = """
                    Transformation proof created!

                    Type: \(response.proof?.transformation?.type ?? "unknown")
                    Proving time: \(time)ms

                    Anyone can verify this came from an authenticated original - without seeing the original!
                    """
                } else {
                    resultSuccess = false
                    resultMessage = response.error ?? "Failed to create transformation proof"
                }
            case .failure(let error):
                resultSuccess = false
                resultMessage = error.localizedDescription
            }

            showResult = true
        }
    }

    private func createCommitment() {
        guard let image = viewModel.capturedImage else { return }

        isProcessing = true

        PrivacyProofsManager.shared.createCommitment(image: image) { result in
            isProcessing = false

            switch result {
            case .success(let response):
                if response.success, let id = response.commitmentId {
                    commitmentId = id
                    hasCommitment = true
                    resultSuccess = true
                    resultMessage = """
                    Commitment created!

                    Your image is now committed with \(response.commitment?.totalTiles ?? 0) tiles.
                    The image itself is NOT stored on the server.

                    You can now create privacy-preserving transformation proofs.
                    """
                } else {
                    resultSuccess = false
                    resultMessage = response.error ?? "Failed to create commitment"
                }
            case .failure(let error):
                resultSuccess = false
                resultMessage = error.localizedDescription
            }

            showResult = true
        }
    }

    private func addRedactionRegion() {
        let newRegion = RedactionRegionUI(
            rect: CGRect(x: 50, y: 50, width: 100, height: 100),
            type: selectedRedactionType
        )
        redactionRegions.append(newRegion)
    }

    // MARK: - Helper Methods

    private func calculateImageFrame(image: UIImage, in containerSize: CGSize) -> CGRect {
        let imageAspect = image.size.width / image.size.height
        let containerAspect = containerSize.width / containerSize.height

        if imageAspect > containerAspect {
            let height = containerSize.width / imageAspect
            return CGRect(
                x: 0,
                y: (containerSize.height - height) / 2,
                width: containerSize.width,
                height: height
            )
        } else {
            let width = containerSize.height * imageAspect
            return CGRect(
                x: (containerSize.width - width) / 2,
                y: 0,
                width: width,
                height: containerSize.height
            )
        }
    }
}

// MARK: - Redaction Region UI Model

struct RedactionRegionUI: Identifiable {
    let id = UUID()
    var rect: CGRect
    var type: RedactionType
}

// MARK: - Selective Reveal Overlay

struct SelectiveRevealOverlay: View {
    @Binding var region: CGRect
    let imageFrame: CGRect
    let imageSize: CGSize

    @State private var dragOffset = CGSize.zero

    var body: some View {
        ZStack {
            // Dimmed area outside selection
            Rectangle()
                .fill(Color.black.opacity(0.5))
                .mask(
                    Rectangle()
                        .overlay(
                            Rectangle()
                                .frame(width: scaledRegion.width, height: scaledRegion.height)
                                .position(x: scaledRegion.midX, y: scaledRegion.midY)
                                .blendMode(.destinationOut)
                        )
                )

            // Selection border
            Rectangle()
                .stroke(Color.blue, lineWidth: 2)
                .frame(width: scaledRegion.width, height: scaledRegion.height)
                .position(x: scaledRegion.midX, y: scaledRegion.midY)
                .gesture(
                    DragGesture()
                        .onChanged { value in
                            let newX = region.origin.x + value.translation.width / scale
                            let newY = region.origin.y + value.translation.height / scale
                            region.origin.x = max(0, min(newX, imageSize.width - region.width))
                            region.origin.y = max(0, min(newY, imageSize.height - region.height))
                        }
                )

            // Corner handles
            ForEach(0..<4) { corner in
                Circle()
                    .fill(Color.blue)
                    .frame(width: 20, height: 20)
                    .position(cornerPosition(corner))
            }
        }
        .frame(width: imageFrame.width, height: imageFrame.height)
        .position(x: imageFrame.midX, y: imageFrame.midY)
    }

    private var scale: CGFloat {
        imageFrame.width / imageSize.width
    }

    private var scaledRegion: CGRect {
        CGRect(
            x: region.origin.x * scale + imageFrame.origin.x,
            y: region.origin.y * scale + imageFrame.origin.y,
            width: region.width * scale,
            height: region.height * scale
        )
    }

    private func cornerPosition(_ corner: Int) -> CGPoint {
        switch corner {
        case 0: return CGPoint(x: scaledRegion.minX, y: scaledRegion.minY)
        case 1: return CGPoint(x: scaledRegion.maxX, y: scaledRegion.minY)
        case 2: return CGPoint(x: scaledRegion.minX, y: scaledRegion.maxY)
        default: return CGPoint(x: scaledRegion.maxX, y: scaledRegion.maxY)
        }
    }
}

// MARK: - Redaction Overlay

struct RedactionOverlay: View {
    @Binding var regions: [RedactionRegionUI]
    let imageFrame: CGRect
    let imageSize: CGSize

    var body: some View {
        ZStack {
            ForEach(regions.indices, id: \.self) { index in
                let scaledRect = scaledRegion(regions[index].rect)

                ZStack {
                    Rectangle()
                        .fill(regions[index].type == .blur ? Color.gray.opacity(0.5) : Color.black)
                        .frame(width: scaledRect.width, height: scaledRect.height)

                    Rectangle()
                        .stroke(regions[index].type == .blur ? Color.blue : Color.red, lineWidth: 2)
                        .frame(width: scaledRect.width, height: scaledRect.height)
                }
                .position(x: scaledRect.midX, y: scaledRect.midY)
                .gesture(
                    DragGesture()
                        .onChanged { value in
                            let scale = imageFrame.width / imageSize.width
                            var newRect = regions[index].rect
                            newRect.origin.x += value.translation.width / scale
                            newRect.origin.y += value.translation.height / scale
                            newRect.origin.x = max(0, min(newRect.origin.x, imageSize.width - newRect.width))
                            newRect.origin.y = max(0, min(newRect.origin.y, imageSize.height - newRect.height))
                            regions[index].rect = newRect
                        }
                )
            }
        }
        .frame(width: imageFrame.width, height: imageFrame.height)
        .position(x: imageFrame.midX, y: imageFrame.midY)
    }

    private func scaledRegion(_ rect: CGRect) -> CGRect {
        let scale = imageFrame.width / imageSize.width
        return CGRect(
            x: rect.origin.x * scale + imageFrame.origin.x,
            y: rect.origin.y * scale + imageFrame.origin.y,
            width: rect.width * scale,
            height: rect.height * scale
        )
    }
}

// MARK: - Preview

struct PrivacyProofsView_Previews: PreviewProvider {
    static var previews: some View {
        PrivacyProofsView()
    }
}
