import SwiftUI
import Combine

enum CaptureMode {
    case photo
    case video
}

class ImageCaptureViewModel: ObservableObject {
    @Published var attestedImage: AttestedImage?
    @Published var isCapturing = false
    @Published var captureAnimation = false
    @Published var showFlash = false

    // Video recording state
    @Published var captureMode: CaptureMode = .photo
    @Published var isRecording = false
    @Published var recordingDuration: TimeInterval = 0
    @Published var videoAttestation: VideoAttestation?
    @Published var recordedVideoURL: URL?

    private var recordingTimer: Timer?

    var capturedImage: UIImage? {
        guard let attested = attestedImage,
              let data = attested.imageData else {
            return nil
        }
        return UIImage(data: data)
    }

    let cameraVC = CameraViewController()
    private let hapticFeedback = UINotificationFeedbackGenerator()

    func captureImage() {
        guard !isCapturing else { return }

        isCapturing = true
        captureAnimation = true
        showFlash = true

        // Haptic feedback
        hapticFeedback.notificationOccurred(.success)

        // Flash animation
        withAnimation(.easeOut(duration: 0.1)) {
            showFlash = true
        }

        DispatchQueue.main.asyncAfter(deadline: .now() + 0.1) { [weak self] in
            self?.showFlash = false
        }

        cameraVC.capturePhoto(captureCompletion: { [weak self] image, error in
            DispatchQueue.main.async {
                self?.attestedImage = image
                self?.isCapturing = false
                self?.captureAnimation = false

                if image != nil {
                    print("Image captured and attested.")
                    // Additional success haptic
                    UIImpactFeedbackGenerator(style: .light).impactOccurred()
                }
            }
        })
    }

    // MARK: - Video Recording

    func toggleRecording() {
        if isRecording {
            stopRecording()
        } else {
            startRecording()
        }
    }

    func startRecording() {
        guard !isRecording else { return }

        isRecording = true
        recordingDuration = 0
        hapticFeedback.notificationOccurred(.success)

        // Start duration timer
        recordingTimer = Timer.scheduledTimer(withTimeInterval: 0.1, repeats: true) { [weak self] _ in
            self?.recordingDuration += 0.1
        }

        cameraVC.startRecording { [weak self] videoURL, attestation, error in
            DispatchQueue.main.async {
                self?.isRecording = false
                self?.recordingTimer?.invalidate()

                if let error = error {
                    print("❌ Video recording error: \(error)")
                    return
                }

                self?.recordedVideoURL = videoURL
                self?.videoAttestation = attestation

                if let attestation = attestation {
                    print("✅ Video certified with attestation: \(attestation.id)")
                    UINotificationFeedbackGenerator().notificationOccurred(.success)
                }
            }
        }
    }

    func stopRecording() {
        guard isRecording else { return }
        cameraVC.stopRecording()
        hapticFeedback.notificationOccurred(.warning)
    }

    func formatDuration(_ duration: TimeInterval) -> String {
        let minutes = Int(duration) / 60
        let seconds = Int(duration) % 60
        let tenths = Int((duration.truncatingRemainder(dividingBy: 1)) * 10)
        return String(format: "%d:%02d.%d", minutes, seconds, tenths)
    }
}

struct ContentView: View {
    @StateObject private var viewModel = ImageCaptureViewModel()
    @State private var path = NavigationPath()
    @State private var showOnboarding = !UserDefaults.standard.bool(forKey: "hasSeenOnboarding")

    var body: some View {
        NavigationStack(path: $path) {
            ZStack {
                // Camera Preview
                HostedCameraViewController(viewModel: viewModel)
                    .edgesIgnoringSafeArea(.all)
                
                // Flash overlay
                if viewModel.showFlash {
                    Color.white
                        .opacity(0.7)
                        .ignoresSafeArea()
                        .transition(.opacity)
                        .animation(.easeOut(duration: 0.15), value: viewModel.showFlash)
                }
                
                // UI Overlay
                VStack {
                    // Recording indicator at top
                    if viewModel.isRecording {
                        HStack {
                            Circle()
                                .fill(Color.red)
                                .frame(width: 12, height: 12)
                            Text(viewModel.formatDuration(viewModel.recordingDuration))
                                .font(.system(size: 18, weight: .semibold, design: .monospaced))
                                .foregroundColor(.white)
                        }
                        .padding(.horizontal, 16)
                        .padding(.vertical, 8)
                        .background(Capsule().fill(Color.black.opacity(0.6)))
                        .padding(.top, 60)
                    }

                    Spacer()

                    // Mode selector (Photo / Video)
                    HStack(spacing: 30) {
                        Button(action: {
                            withAnimation(.spring(response: 0.3)) {
                                viewModel.captureMode = .photo
                            }
                            UIImpactFeedbackGenerator(style: .light).impactOccurred()
                        }) {
                            Text("PHOTO")
                                .font(.system(size: 14, weight: .semibold))
                                .foregroundColor(viewModel.captureMode == .photo ? .yellow : .white.opacity(0.6))
                        }

                        Button(action: {
                            withAnimation(.spring(response: 0.3)) {
                                viewModel.captureMode = .video
                            }
                            UIImpactFeedbackGenerator(style: .light).impactOccurred()
                        }) {
                            Text("VIDEO")
                                .font(.system(size: 14, weight: .semibold))
                                .foregroundColor(viewModel.captureMode == .video ? .yellow : .white.opacity(0.6))
                        }
                    }
                    .padding(.bottom, 20)

                    // Bottom controls container
                    HStack(alignment: .bottom, spacing: 0) {
                        // Gallery thumbnail
                        if viewModel.capturedImage != nil {
                            Button(action: {
                                path.append("ImageEditView")
                                UIImpactFeedbackGenerator(style: .light).impactOccurred()
                            }) {
                                ZStack(alignment: .topTrailing) {
                                    Image(uiImage: viewModel.capturedImage ?? UIImage())
                                        .resizable()
                                        .scaledToFill()
                                        .frame(width: 60, height: 60)
                                        .clipShape(RoundedRectangle(cornerRadius: 12))
                                        .overlay(
                                            RoundedRectangle(cornerRadius: 12)
                                                .stroke(Color.white, lineWidth: 2)
                                        )
                                        .shadow(color: .black.opacity(0.3), radius: 8, x: 0, y: 4)
                                }
                            }
                            .transition(.asymmetric(
                                insertion: .scale.combined(with: .opacity),
                                removal: .scale.combined(with: .opacity)
                            ))
                            .animation(.spring(response: 0.4, dampingFraction: 0.8), value: viewModel.capturedImage != nil)
                        } else if viewModel.videoAttestation != nil {
                            // Show video attestation indicator
                            ZStack {
                                RoundedRectangle(cornerRadius: 12)
                                    .fill(Color.red.opacity(0.3))
                                    .frame(width: 60, height: 60)
                                Image(systemName: "video.fill")
                                    .foregroundColor(.white)
                                    .font(.system(size: 24))
                            }
                        } else {
                            Color.clear
                                .frame(width: 60, height: 60)
                        }

                        Spacer()

                        // Capture/Record Button
                        if viewModel.captureMode == .photo {
                            // Photo capture button
                            Button(action: {
                                viewModel.captureImage()
                            }) {
                                ZStack {
                                    Circle()
                                        .fill(Color.white)
                                        .frame(width: 70, height: 70)
                                        .scaleEffect(viewModel.captureAnimation ? 0.9 : 1.0)
                                    Circle()
                                        .stroke(Color.white, lineWidth: 4)
                                        .frame(width: 85, height: 85)
                                        .scaleEffect(viewModel.captureAnimation ? 0.95 : 1.0)
                                }
                            }
                            .animation(.spring(response: 0.3, dampingFraction: 0.6), value: viewModel.captureAnimation)
                            .disabled(viewModel.isCapturing)
                        } else {
                            // Video record button
                            Button(action: {
                                viewModel.toggleRecording()
                            }) {
                                ZStack {
                                    Circle()
                                        .stroke(Color.white, lineWidth: 4)
                                        .frame(width: 85, height: 85)

                                    if viewModel.isRecording {
                                        // Stop button (rounded square)
                                        RoundedRectangle(cornerRadius: 8)
                                            .fill(Color.red)
                                            .frame(width: 35, height: 35)
                                    } else {
                                        // Record button (red circle)
                                        Circle()
                                            .fill(Color.red)
                                            .frame(width: 60, height: 60)
                                    }
                                }
                            }
                            .animation(.spring(response: 0.3, dampingFraction: 0.6), value: viewModel.isRecording)
                        }

                        Spacer()

                        // Settings button
                        Button(action: {
                            path.append("SettingsView")
                            UIImpactFeedbackGenerator(style: .light).impactOccurred()
                        }) {
                            Image(systemName: "gear")
                                .font(.system(size: 24))
                                .foregroundColor(.white)
                                .frame(width: 60, height: 60)
                                .background(
                                    Circle()
                                        .fill(Color.white.opacity(0.2))
                                        .blur(radius: 10)
                                )
                        }
                        .disabled(viewModel.isRecording)
                        .opacity(viewModel.isRecording ? 0.5 : 1.0)
                    }
                    .padding(.horizontal, 20)
                    .padding(.bottom, 40)
                }
                .navigationDestination(for: String.self) { destination in
                    switch destination {
                    case "ImageEditView":
                        ImageEditView()
                            .environmentObject(viewModel)
                    case "SettingsView":
                        SettingsView()
                    case "GalleryView":
                        GalleryView()
                    case "MapView":
                        MapView()
                    case "StatsView":
                        StatsView()
                    case "OnboardingView":
                        OnboardingView()
                    default:
                        Text("Unknown destination")
                    }
                }
            }
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .principal) {
                    Text("Rial")
                        .font(.headline)
                        .foregroundColor(.white)
                }
                
ToolbarItem(placement: .navigationBarTrailing) {
                    Menu {
                        Button(action: {
                            path.append("GalleryView")
                            UIImpactFeedbackGenerator(style: .light).impactOccurred()
                        }) {
                            Label("Gallery", systemImage: "photo.on.rectangle")
                        }
                        
                        Button(action: {
                            path.append("MapView")
                            UIImpactFeedbackGenerator(style: .light).impactOccurred()
                        }) {
                            Label("Photo Map", systemImage: "map.fill")
                        }
                        
                        Button(action: {
                            path.append("StatsView")
                            UIImpactFeedbackGenerator(style: .light).impactOccurred()
                        }) {
                            Label("Statistics", systemImage: "chart.bar.fill")
                        }
                    } label: {
                        Image(systemName: "ellipsis.circle")
                            .foregroundColor(.white)
                    }
                }
            }
            .toolbarBackground(.visible, for: .navigationBar)
            .toolbarBackground(Color.black.opacity(0.3), for: .navigationBar)
            .fullScreenCover(isPresented: $showOnboarding) {
                OnboardingView()
            }
        }
    }
}

