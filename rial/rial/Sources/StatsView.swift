import SwiftUI

struct StatsView: View {
    @Environment(\.dismiss) private var dismiss
    @State private var batchStatus: BatchStatus?
    @State private var isLoading = false
    @State private var showAlert = false
    @State private var alertMessage = ""
    @State private var isSubmitting = false
    
    var body: some View {
        NavigationView {
            ScrollView {
                VStack(spacing: 20) {
                    // Header Card
                    VStack(spacing: 8) {
                        Image(systemName: "chart.bar.fill")
                            .font(.system(size: 50))
                            .foregroundColor(.blue)
                        
                        Text("Certification Stats")
                            .font(.title2)
                            .fontWeight(.bold)
                        
                        Text("Monitor your attestations")
                            .font(.subheadline)
                            .foregroundColor(.secondary)
                    }
                    .padding()
                    
                    // Local Stats
                    VStack(alignment: .leading, spacing: 16) {
                        Text("📱 Local Gallery")
                            .font(.headline)
                        
                        let localCount = PersistenceController.shared.getCertifiedImages().count
                        
                        StatRow(
                            icon: "photo.fill",
                            label: "Certified Images",
                            value: "\(localCount)",
                            color: .blue
                        )
                        
                        StatRow(
                            icon: "checkmark.seal.fill",
                            label: "Verified",
                            value: "\(localCount)",
                            color: .green
                        )
                    }
                    .padding()
                    .background(Color(UIColor.secondarySystemBackground))
                    .cornerRadius(16)
                    .padding(.horizontal)
                    
                    // Blockchain Stats
                    VStack(alignment: .leading, spacing: 16) {
                        HStack {
                            Text("⛓️ Blockchain Status")
                                .font(.headline)
                            
                            Spacer()
                            
                            Button(action: loadBatchStatus) {
                                Image(systemName: "arrow.clockwise")
                                    .font(.system(size: 16))
                            }
                            .disabled(isLoading)
                        }
                        
                        if isLoading {
                            HStack {
                                Spacer()
                                ProgressView()
                                Spacer()
                            }
                            .padding()
                        } else if let status = batchStatus {
                            StatRow(
                                icon: "clock.fill",
                                label: "Pending Attestations",
                                value: "\(status.pending)",
                                color: .orange
                            )
                            
                            StatRow(
                                icon: "cube.fill",
                                label: "Batch Size",
                                value: "\(status.batchSize)",
                                color: .purple
                            )
                            
                            StatRow(
                                icon: "timer.fill",
                                label: "Batch Interval",
                                value: status.batchInterval,
                                color: .indigo
                            )
                            
                            // Manual Submit Button
                            if status.pending > 0 {
                                Button(action: submitBatchManually) {
                                    HStack {
                                        if isSubmitting {
                                            ProgressView()
                                                .progressViewStyle(CircularProgressViewStyle(tint: .white))
                                        } else {
                                            Image(systemName: "arrow.up.circle.fill")
                                        }
                                        Text(isSubmitting ? "Submitting..." : "Submit Batch Now (\(status.pending))")
                                            .fontWeight(.semibold)
                                    }
                                    .frame(maxWidth: .infinity)
                                    .padding()
                                    .background(
                                        LinearGradient(
                                            gradient: Gradient(colors: [.blue, .purple]),
                                            startPoint: .leading,
                                            endPoint: .trailing
                                        )
                                    )
                                    .foregroundColor(.white)
                                    .cornerRadius(12)
                                }
                                .disabled(isSubmitting)
                                .padding(.top, 8)
                            }
                        } else {
                            Text("Tap refresh to load status")
                                .font(.caption)
                                .foregroundColor(.secondary)
                                .frame(maxWidth: .infinity, alignment: .center)
                                .padding()
                        }
                    }
                    .padding()
                    .background(Color(UIColor.secondarySystemBackground))
                    .cornerRadius(16)
                    .padding(.horizontal)
                    
                    // Connection Info
                    VStack(alignment: .leading, spacing: 12) {
                        Text("🌐 Backend Connection")
                            .font(.headline)
                        
                        HStack {
                            Text("URL:")
                                .font(.caption)
                                .foregroundColor(.secondary)
                            
                            Text(ProverManager.shared.getBackendURL())
                                .font(.caption)
                                .lineLimit(1)
                        }
                        
                        HStack {
                            Circle()
                                .fill(Color.green)
                                .frame(width: 8, height: 8)
                            
                            Text("Connected")
                                .font(.caption)
                                .foregroundColor(.secondary)
                        }
                    }
                    .padding()
                    .background(Color(UIColor.secondarySystemBackground))
                    .cornerRadius(16)
                    .padding(.horizontal)
                    
                    Spacer()
                }
                .padding(.top)
            }
            .navigationTitle("Statistics")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .navigationBarTrailing) {
                    Button("Done") {
                        dismiss()
                    }
                }
            }
            .onAppear {
                loadBatchStatus()
            }
            .alert("Batch Submission", isPresented: $showAlert) {
                Button("OK") { }
            } message: {
                Text(alertMessage)
            }
        }
    }
    
    // MARK: - Actions
    
    private func loadBatchStatus() {
        guard !isLoading else { return }
        
        isLoading = true
        
        let backendURL = ProverManager.shared.getBackendURL()
        guard let url = URL(string: "\(backendURL)/blockchain/status") else {
            isLoading = false
            return
        }
        
        URLSession.shared.dataTask(with: url) { data, response, error in
            DispatchQueue.main.async {
                isLoading = false
                
                guard let data = data,
                      let status = try? JSONDecoder().decode(BatchStatus.self, from: data) else {
                    return
                }
                
                self.batchStatus = status
            }
        }.resume()
    }
    
    private func submitBatchManually() {
        guard !isSubmitting else { return }
        
        isSubmitting = true
        
        let backendURL = ProverManager.shared.getBackendURL()
        guard let url = URL(string: "\(backendURL)/blockchain/submit-batch") else {
            isSubmitting = false
            return
        }
        
        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        
        URLSession.shared.dataTask(with: request) { data, response, error in
            DispatchQueue.main.async {
                isSubmitting = false
                
                if let error = error {
                    alertMessage = "Failed: \(error.localizedDescription)"
                    showAlert = true
                    return
                }
                
                guard let data = data,
                      let result = try? JSONDecoder().decode(BatchSubmitResult.self, from: data) else {
                    alertMessage = "Unknown error occurred"
                    showAlert = true
                    return
                }
                
                if result.success {
                    alertMessage = "✅ Successfully submitted \(result.count ?? 0) attestations to blockchain!\n\nTransaction: \(result.transactionHash ?? "pending")"
                    
                    // Haptic feedback
                    UINotificationFeedbackGenerator().notificationOccurred(.success)
                    
                    // Reload status
                    DispatchQueue.main.asyncAfter(deadline: .now() + 1) {
                        self.loadBatchStatus()
                    }
                } else {
                    alertMessage = "Failed: \(result.message ?? "Unknown error")"
                }
                
                showAlert = true
            }
        }.resume()
    }
}

struct StatRow: View {
    let icon: String
    let label: String
    let value: String
    let color: Color
    
    var body: some View {
        HStack(spacing: 16) {
            Image(systemName: icon)
                .font(.system(size: 24))
                .foregroundColor(color)
                .frame(width: 40)
            
            VStack(alignment: .leading, spacing: 4) {
                Text(label)
                    .font(.caption)
                    .foregroundColor(.secondary)
                
                Text(value)
                    .font(.title3)
                    .fontWeight(.semibold)
            }
            
            Spacer()
        }
    }
}

struct BatchStatus: Codable {
    let initialized: Bool
    let pending: Int
    let batchSize: Int
    let batchInterval: String
}

struct BatchSubmitResult: Codable {
    let success: Bool
    let message: String?
    let count: Int?
    let transactionHash: String?
    let blockNumber: Int?
}

struct StatsView_Previews: PreviewProvider {
    static var previews: some View {
        StatsView()
    }
}



