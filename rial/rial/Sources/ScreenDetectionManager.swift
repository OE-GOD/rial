import Foundation
import UIKit
import CoreImage

/// Manages screen detection to prevent photographing displays
class ScreenDetectionManager: ObservableObject {
    static let shared = ScreenDetectionManager()
    
    @Published var isAnalyzing = false
    @Published var lastDetectionResult: ScreenDetectionResult?
    
    private let proverManager = ProverManager.shared
    
    struct ScreenDetectionResult: Codable {
        let isScreen: Bool
        let confidence: Double
        let risk: String
        let strongIndicators: [String]
        let recommendations: [String]
        let timestamp: Date
        
        var riskLevel: RiskLevel {
            switch risk {
            case "critical": return .critical
            case "high": return .high
            case "medium": return .medium
            default: return .low
            }
        }
        
        enum RiskLevel {
            case low, medium, high, critical
            
            var color: UIColor {
                switch self {
                case .low: return .systemGreen
                case .medium: return .systemOrange
                case .high: return .systemRed
                case .critical: return .systemPurple
                }
            }
            
            var icon: String {
                switch self {
                case .low: return "checkmark.circle.fill"
                case .medium: return "exclamationmark.triangle.fill"
                case .high: return "xmark.octagon.fill"
                case .critical: return "xmark.shield.fill"
                }
            }
        }
    }
    
    /// Pre-analyze image for screen patterns before certification
    func preAnalyzeImage(_ image: UIImage, metadata: [String: Any] = [:]) async throws -> ScreenDetectionResult {
        isAnalyzing = true
        defer { isAnalyzing = false }
        
        // Prepare image data
        guard let imageData = image.jpegData(compressionQuality: 0.8) else {
            throw ScreenDetectionError.imagePreparationFailed
        }
        
        // Enrich metadata with iOS-specific signals
        var enrichedMetadata = metadata
        enrichedMetadata["deviceModel"] = UIDevice.current.model
        enrichedMetadata["screenBrightness"] = UIScreen.main.brightness
        enrichedMetadata["captureTime"] = ISO8601DateFormatter().string(from: Date())
        
        // Add focus distance if available
        if let ciImage = CIImage(image: image),
           let properties = ciImage.properties["{Exif}"] as? [String: Any] {
            enrichedMetadata["focusDistance"] = properties["FocalLength"]
            enrichedMetadata["brightnessValue"] = properties["BrightnessValue"]
            enrichedMetadata["whiteBalance"] = properties["WhiteBalance"]
        }
        
        // Send to AI agent
        let result = try await detectScreen(imageData: imageData, metadata: enrichedMetadata)
        
        // Cache result
        self.lastDetectionResult = result
        
        return result
    }
    
    /// Quick local pre-check for obvious screen patterns
    func quickLocalCheck(_ image: UIImage) -> Bool {
        guard let ciImage = CIImage(image: image) else { return false }
        
        // Check for moiré patterns using Core Image filters
        let moireScore = detectMoirePatterns(ciImage)
        
        // Check for unusual edge sharpness
        let sharpnessScore = analyzeEdgeSharpness(ciImage)
        
        // Check color distribution
        let colorScore = analyzeColorDistribution(ciImage)
        
        // Combined quick check
        let suspicionScore = (moireScore + sharpnessScore + colorScore) / 3.0
        
        return suspicionScore > 0.6
    }
    
    private func detectMoirePatterns(_ image: CIImage) -> Double {
        // Apply edge detection filter
        guard let edgeFilter = CIFilter(name: "CIEdges") else { return 0 }
        edgeFilter.setValue(image, forKey: kCIInputImageKey)
        edgeFilter.setValue(5.0, forKey: kCIInputIntensityKey)
        
        guard let outputImage = edgeFilter.outputImage else { return 0 }
        
        // Analyze for regular patterns
        // In a real implementation, this would use FFT
        // For now, return a simulated score
        return 0.3 // Placeholder
    }
    
    private func analyzeEdgeSharpness(_ image: CIImage) -> Double {
        // Check for unnaturally sharp edges
        guard let sharpnessFilter = CIFilter(name: "CISharpenLuminance") else { return 0 }
        sharpnessFilter.setValue(image, forKey: kCIInputImageKey)
        sharpnessFilter.setValue(2.0, forKey: kCIInputSharpnessKey)
        
        // In production, compare input vs output histograms
        return 0.4 // Placeholder
    }
    
    private func analyzeColorDistribution(_ image: CIImage) -> Double {
        // Analyze histogram for screen characteristics
        guard let histogramFilter = CIFilter(name: "CIAreaHistogram") else { return 0 }
        histogramFilter.setValue(image, forKey: kCIInputImageKey)
        histogramFilter.setValue(CIVector(cgRect: image.extent), forKey: "inputExtent")
        histogramFilter.setValue(256, forKey: "inputCount")
        
        // Check for blue light spike common in screens
        // In production, analyze the actual histogram data
        return 0.2 // Placeholder
    }
    
    private func detectScreen(imageData: Data, metadata: [String: Any]) async throws -> ScreenDetectionResult {
        // Use the backend AI agent
        let baseURL = UserDefaults.standard.string(forKey: "backendURL") ?? ProverManager.defaultBackendURL
        let url = URL(string: "\(baseURL)/ai/detect-screen")!
        
        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        
        let boundary = UUID().uuidString
        request.setValue("multipart/form-data; boundary=\(boundary)", forHTTPHeaderField: "Content-Type")
        
        var body = Data()
        
        // Add image
        body.append("--\(boundary)\r\n".data(using: .utf8)!)
        body.append("Content-Disposition: form-data; name=\"image\"; filename=\"image.jpg\"\r\n".data(using: .utf8)!)
        body.append("Content-Type: image/jpeg\r\n\r\n".data(using: .utf8)!)
        body.append(imageData)
        body.append("\r\n".data(using: .utf8)!)
        
        // Add metadata
        if let metadataJSON = try? JSONSerialization.data(withJSONObject: metadata) {
            body.append("--\(boundary)\r\n".data(using: .utf8)!)
            body.append("Content-Disposition: form-data; name=\"metadata\"\r\n\r\n".data(using: .utf8)!)
            body.append(metadataJSON)
            body.append("\r\n".data(using: .utf8)!)
        }
        
        body.append("--\(boundary)--\r\n".data(using: .utf8)!)
        request.httpBody = body
        
        let (data, response) = try await URLSession.shared.data(for: request)
        
        guard let httpResponse = response as? HTTPURLResponse,
              httpResponse.statusCode == 200 else {
            throw ScreenDetectionError.serverError
        }
        
        let result = try JSONDecoder().decode(DetectionResponse.self, from: data)
        
        return ScreenDetectionResult(
            isScreen: result.detection.verdict.isScreen,
            confidence: result.detection.verdict.confidence,
            risk: result.detection.verdict.risk,
            strongIndicators: result.detection.evidence.strongIndicators,
            recommendations: result.detection.recommendations,
            timestamp: Date()
        )
    }
    
    /// Generate user-friendly warning message
    func generateWarningMessage(for result: ScreenDetectionResult) -> String {
        if result.isScreen {
            return """
            ⚠️ Screen Detected
            
            This image appears to be photographed from a screen (TV, monitor, phone).
            
            Confidence: \(Int(result.confidence * 100))%
            Risk Level: \(result.risk.capitalized)
            
            Evidence:
            \(result.strongIndicators.joined(separator: "\n• "))
            
            This image cannot be certified as authentic.
            """
        } else if result.confidence < 0.7 {
            return """
            ⚡ Quick Check Passed
            
            No obvious screen patterns detected.
            Proceeding with certification...
            """
        } else {
            return """
            ✅ Authenticity Check Passed
            
            This appears to be a genuine photograph.
            No screen patterns detected.
            """
        }
    }
}

// MARK: - Supporting Types

extension ScreenDetectionManager {
    enum ScreenDetectionError: LocalizedError {
        case imagePreparationFailed
        case serverError
        case detectionFailed(String)
        
        var errorDescription: String? {
            switch self {
            case .imagePreparationFailed:
                return "Failed to prepare image for analysis"
            case .serverError:
                return "Screen detection service unavailable"
            case .detectionFailed(let reason):
                return "Detection failed: \(reason)"
            }
        }
    }
    
    struct DetectionResponse: Codable {
        let success: Bool
        let detection: Detection
        
        struct Detection: Codable {
            let verdict: Verdict
            let evidence: Evidence
            let recommendations: [String]
            
            struct Verdict: Codable {
                let isScreen: Bool
                let confidence: Double
                let risk: String
                let score: Double
            }
            
            struct Evidence: Codable {
                let strongIndicators: [String]
                let weakIndicators: [String]
                let contraIndicators: [String]
            }
        }
    }
}
