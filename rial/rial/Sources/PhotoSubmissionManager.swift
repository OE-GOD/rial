//
//  PhotoSubmissionManager.swift
//  rial
//
//  Submit verified photos to backend for verification and storage
//

import Foundation
import UIKit

class PhotoSubmissionManager {
    static let shared = PhotoSubmissionManager()
    
    private init() {}
    
    /// Submit verified photo to backend for verification
    func submitForVerification(
        attestedImage: AttestedImage,
        cropInfo: CropInfo? = nil,
        completion: @escaping (Result<VerificationResponse, Error>) -> Void
    ) {
        print("📤 Submitting photo for verification...")
        
        // Get backend URL
        let baseURL = ProverManager.shared.getBackendURL()
        guard let url = URL(string: "\(baseURL)/api/verify-photo") else {
            completion(.failure(NSError(domain: "", code: -1, userInfo: [NSLocalizedDescriptionKey: "Invalid URL"])))
            return
        }
        
        // Prepare multipart request
        let boundary = UUID().uuidString
        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("multipart/form-data; boundary=\(boundary)", forHTTPHeaderField: "Content-Type")
        
        var body = Data()
        
        // Add image data (use the FROZEN data to prevent size changes)
        if let imageData = attestedImage.imageData {
            body.append("--\(boundary)\r\n".data(using: .utf8)!)
            body.append("Content-Disposition: form-data; name=\"image\"; filename=\"photo.jpg\"\r\n".data(using: .utf8)!)
            body.append("Content-Type: image/jpeg\r\n\r\n".data(using: .utf8)!)
            body.append(imageData)
            body.append("\r\n".data(using: .utf8)!)
            
            print("   Image size: \(imageData.count) bytes (frozen)")
        } else {
            completion(.failure(NSError(domain: "", code: -1, userInfo: [NSLocalizedDescriptionKey: "No image data"])))
            return
        }
        
        // Add C2PA claim
        if let claim = attestedImage.c2paClaim,
           let claimData = try? JSONEncoder().encode(claim),
           let claimString = String(data: claimData, encoding: .utf8) {
            body.append("--\(boundary)\r\n".data(using: .utf8)!)
            body.append("Content-Disposition: form-data; name=\"c2paClaim\"\r\n\r\n".data(using: .utf8)!)
            body.append(claimString.data(using: .utf8)!)
            body.append("\r\n".data(using: .utf8)!)
        }
        
        // Add metadata
        if let metadata = attestedImage.proofMetadata,
           let metadataData = try? JSONEncoder().encode(metadata),
           let metadataString = String(data: metadataData, encoding: .utf8) {
            body.append("--\(boundary)\r\n".data(using: .utf8)!)
            body.append("Content-Disposition: form-data; name=\"metadata\"\r\n\r\n".data(using: .utf8)!)
            body.append(metadataString.data(using: .utf8)!)
            body.append("\r\n".data(using: .utf8)!)
        }
        
        // Add crop info if present
        if let cropInfo = cropInfo,
           let cropData = try? JSONEncoder().encode(cropInfo),
           let cropString = String(data: cropData, encoding: .utf8) {
            body.append("--\(boundary)\r\n".data(using: .utf8)!)
            body.append("Content-Disposition: form-data; name=\"cropInfo\"\r\n\r\n".data(using: .utf8)!)
            body.append(cropString.data(using: .utf8)!)
            body.append("\r\n".data(using: .utf8)!)
        }
        
        body.append("--\(boundary)--\r\n".data(using: .utf8)!)
        request.httpBody = body
        
        print("📦 Sending verification request...")
        print("   URL: \(url)")
        print("   Body size: \(body.count) bytes")
        
        // Send request
        URLSession.shared.dataTask(with: request) { data, response, error in
            if let error = error {
                print("❌ Verification submission failed: \(error.localizedDescription)")
                completion(.failure(error))
                return
            }
            
            guard let httpResponse = response as? HTTPURLResponse else {
                completion(.failure(NSError(domain: "", code: -1, userInfo: [NSLocalizedDescriptionKey: "Invalid response"])))
                return
            }
            
            print("✅ Response: \(httpResponse.statusCode)")
            
            guard (200...299).contains(httpResponse.statusCode),
                  let data = data else {
                let message = data.flatMap { String(data: $0, encoding: .utf8) } ?? "Unknown error"
                completion(.failure(NSError(domain: "", code: httpResponse.statusCode, userInfo: [NSLocalizedDescriptionKey: message])))
                return
            }
            
            // Parse response
            do {
                let decoder = JSONDecoder()
                let response = try decoder.decode(VerificationResponse.self, from: data)
                
                print("✅ Verification complete!")
                print("   Verified: \(response.verified)")
                print("   Confidence: \(Int(response.confidence * 100))%")
                print("   Photo ID: \(response.photoId ?? "N/A")")
                
                completion(.success(response))
            } catch {
                print("❌ Failed to parse response: \(error)")
                completion(.failure(error))
            }
        }.resume()
    }
}

struct VerificationResponse: Codable {
    let success: Bool
    let verified: Bool
    let confidence: Double
    let checks: [String: Bool]
    let details: [String: AnyCodable]
    let fraudIndicators: [String]
    let photoId: String?
    let timestamp: String
    let recommendation: String
}

// Helper to decode dynamic JSON
struct AnyCodable: Codable {
    let value: Any
    
    init(from decoder: Decoder) throws {
        let container = try decoder.singleValueContainer()
        if let int = try? container.decode(Int.self) {
            value = int
        } else if let double = try? container.decode(Double.self) {
            value = double
        } else if let string = try? container.decode(String.self) {
            value = string
        } else if let bool = try? container.decode(Bool.self) {
            value = bool
        } else {
            value = ""
        }
    }
    
    func encode(to encoder: Encoder) throws {
        var container = encoder.singleValueContainer()
        if let int = value as? Int {
            try container.encode(int)
        } else if let double = value as? Double {
            try container.encode(double)
        } else if let string = value as? String {
            try container.encode(string)
        } else if let bool = value as? Bool {
            try container.encode(bool)
        }
    }
}

