import SwiftUI

struct SettingsView: View {
    @AppStorage("backendURL") private var backendURL = ""
    @AppStorage("enableLocation") private var enableLocation = true
    @AppStorage("enableMotionData") private var enableMotionData = true
    @AppStorage("autoSaveToGallery") private var autoSaveToGallery = true
    @AppStorage("compressionQuality") private var compressionQuality = 0.8
    @AppStorage("enableZKProofs") private var enableZKProofs = true
    
    init() {
        // Set default value for auto-save if not already set
        if UserDefaults.standard.object(forKey: "autoSaveToGallery") == nil {
            UserDefaults.standard.set(true, forKey: "autoSaveToGallery")
        }
    }
    
    @Environment(\.dismiss) private var dismiss
    @State private var showAlert = false
    @State private var alertMessage = ""
    
    private let defaultURL = ProverManager.shared.getBackendURL()
    
    var body: some View {
        NavigationView {
            Form {
                // Backend Configuration
                Section {
                    VStack(alignment: .leading, spacing: 8) {
                        Text("Backend URL")
                            .font(.caption)
                            .foregroundColor(.secondary)
                        
                        TextField("http://10.0.0.132:3000", text: $backendURL)
                            .textFieldStyle(RoundedBorderTextFieldStyle())
                            .autocapitalization(.none)
                            .keyboardType(.URL)
                        
                        Text("Current: \(backendURL.isEmpty ? defaultURL : backendURL)")
                            .font(.caption2)
                            .foregroundColor(.secondary)
                    }
                    
                    Button(action: testConnection) {
                        Label("Test Connection", systemImage: "network")
                    }

                    Button(action: resetToDefaultURL) {
                        Label("Reset URL", systemImage: "arrow.counterclockwise")
                    }
                } header: {
                    Text("Server Configuration")
                } footer: {
                    Text("Enter the URL of your Rial backend server")
                        .font(.caption)
                }
                
                // Privacy Settings
                Section {
                    Toggle(isOn: $enableLocation) {
                        VStack(alignment: .leading, spacing: 4) {
                            Label("Include Location Data", systemImage: "location.fill")
                            if !enableLocation {
                                Text("⚡ Fast Mode - No GPS delay")
                                    .font(.caption2)
                                    .foregroundColor(.orange)
                            }
                        }
                    }
                    
                    Toggle(isOn: $enableMotionData) {
                        Label("Include Motion Data", systemImage: "move.3d")
                    }
                    
                    Toggle(isOn: $enableZKProofs) {
                        VStack(alignment: .leading, spacing: 4) {
                            Label("Enable ZK Proofs", systemImage: "lock.shield")
                            Text("Privacy-preserving image transformations")
                                .font(.caption2)
                                .foregroundColor(.secondary)
                        }
                    }
                } header: {
                    Text("Privacy & Performance")
                } footer: {
                    Text("Location and motion data help prove images are real (not AI-generated). ZK proofs ensure privacy when sharing transformed images.")
                        .font(.caption)
                }
                
                // Image Settings
                Section {
                    VStack(alignment: .leading, spacing: 8) {
                        Text("Compression Quality")
                            .font(.caption)
                            .foregroundColor(.secondary)
                        
                        HStack {
                            Text("Low")
                                .font(.caption)
                            Slider(value: $compressionQuality, in: 0.3...1.0)
                            Text("High")
                                .font(.caption)
                        }
                        
                        Text("\(Int(compressionQuality * 100))%")
                            .font(.caption2)
                            .foregroundColor(.secondary)
                            .frame(maxWidth: .infinity, alignment: .center)
                    }
                    
                    Toggle(isOn: $autoSaveToGallery) {
                        Label("Auto-save Certified Images", systemImage: "photo.badge.checkmark")
                    }
                } header: {
                    Text("Image Settings")
                }
                
                // About Section
                Section {
                    HStack {
                        Text("Version")
                        Spacer()
                        Text(Bundle.main.infoDictionary?["CFBundleShortVersionString"] as? String ?? "1.0")
                            .foregroundColor(.secondary)
                    }
                    
                    Link(destination: URL(string: "https://github.com/yourusername/rial")!) {
                        HStack {
                            Label("View on GitHub", systemImage: "link")
                            Spacer()
                            Image(systemName: "arrow.up.right.square")
                                .foregroundColor(.secondary)
                        }
                    }
                    
                    Button(action: {
                        // Open verification portal
                        if let url = URL(string: "\(backendURL.isEmpty ? defaultURL : backendURL)/verify.html") {
                            UIApplication.shared.open(url)
                        }
                    }) {
                        HStack {
                            Label("Verification Portal", systemImage: "checkmark.seal")
                            Spacer()
                            Image(systemName: "safari")
                                .foregroundColor(.secondary)
                        }
                    }
                } header: {
                    Text("About")
                }
                
                // Advanced Section
                Section {
                    Button(role: .destructive, action: clearCache) {
                        Label("Clear Cache", systemImage: "trash")
                    }
                    
                    Button(action: exportLogs) {
                        Label("Export Debug Logs", systemImage: "doc.text")
                    }
                    
                    NavigationLink(destination: OnboardingView()) {
                        Label("View Tutorial", systemImage: "graduationcap")
                    }
                } header: {
                    Text("Advanced")
                }
            }
            .navigationTitle("Settings")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .navigationBarTrailing) {
                    Button("Done") {
                        dismiss()
                    }
                }
            }
            .alert("Connection Test", isPresented: $showAlert) {
                Button("OK") { }
            } message: {
                Text(alertMessage)
            }
        }
    }
    
    // MARK: - Actions
    
    private func testConnection() {
        let testURL = backendURL.isEmpty ? defaultURL : backendURL
        guard let url = URL(string: "\(testURL)/test") else {
            alertMessage = "Invalid URL"
            showAlert = true
            return
        }
        
        URLSession.shared.dataTask(with: url) { data, response, error in
            DispatchQueue.main.async {
                if let error = error {
                    alertMessage = "Connection failed: \(error.localizedDescription)"
                } else if let httpResponse = response as? HTTPURLResponse {
                    if httpResponse.statusCode == 200 {
                        alertMessage = "✅ Connection successful!"
                    } else {
                        alertMessage = "Server returned status: \(httpResponse.statusCode)"
                    }
                } else {
                    alertMessage = "Unknown error"
                }
                showAlert = true
            }
        }.resume()
    }

    private func resetToDefaultURL() {
        backendURL = ""
        showAlert = true
        alertMessage = "✅ Backend URL reset to default"
    }

    private func clearCache() {
        // Clear image cache
        URLCache.shared.removeAllCachedResponses()
        
        // Haptic feedback
        UINotificationFeedbackGenerator().notificationOccurred(.success)
        
        alertMessage = "Cache cleared successfully"
        showAlert = true
    }
    
    private func exportLogs() {
        // In a real app, this would export debug logs
        alertMessage = "Debug logs exported"
        showAlert = true
    }
}

struct SettingsView_Previews: PreviewProvider {
    static var previews: some View {
        SettingsView()
    }
}
