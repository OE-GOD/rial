import SwiftUI
import Combine

class ImageCaptureViewModel: ObservableObject {
    @Published var attestedImage: AttestedImage?
    @Published var isCapturing = false
    @Published var captureAnimation = false
    @Published var showFlash = false
    
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
                    Spacer()
                    
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
                        } else {
                            Color.clear
                                .frame(width: 60, height: 60)
                        }
                        
                        Spacer()
                        
                        // Capture Button
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

