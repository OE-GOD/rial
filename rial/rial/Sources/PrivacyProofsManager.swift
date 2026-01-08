//
//  PrivacyProofsManager.swift
//  rial
//
//  Privacy-Preserving Transformation Proofs
//  Based on: "Trust Nobody: Privacy-Preserving Proofs for Edited Photos"
//  Reference: https://eprint.iacr.org/2024/1074
//

import Foundation
import UIKit

// MARK: - Response Models

struct PrivacyProofCommitment: Codable {
    let merkleRoot: String
    let width: Int
    let height: Int
    let tileSize: Int
    let tilesX: Int
    let tilesY: Int
    let totalTiles: Int
    let merkleTreeDepth: Int
}

struct PrivacyProofCommitmentResponse: Codable {
    let success: Bool
    let message: String?
    let commitmentId: String?
    let commitment: PrivacyProofCommitment?
    let error: String?
}

struct TransformationProof: Codable {
    let type: String
    let version: String
    let paper: String?
    let originalCommitment: PrivacyProofCommitment?
    let transformedCommitment: PrivacyProofCommitment?
    let transformation: TransformationInfo?
    let proof: ProofData?
    let metrics: ProofMetrics?
    let guarantees: ProofGuarantees?
    let timestamp: String?
}

struct TransformationInfo: Codable {
    let type: String
    let params: TransformationParams?
}

struct TransformationParams: Codable {
    let x: Int?
    let y: Int?
    let width: Int?
    let height: Int?
    let factor: Double?
    let sigma: Int?
}

struct ProofData: Codable {
    let proofType: String?
    let valid: Bool?
    let commitment: String?
}

struct ProofMetrics: Codable {
    let provingTime: Int?
    let proofSize: Int?
    let originalTiles: Int?
    let transformedTiles: Int?
}

struct ProofGuarantees: Codable {
    let confidentiality: Bool?
    let authenticity: Bool?
    let efficiency: Bool?
    let fraudDetection: Bool?
}

struct TransformProofResponse: Codable {
    let success: Bool
    let message: String?
    let proof: TransformationProof?
    let transformedImage: TransformedImageInfo?
    let error: String?
}

struct TransformedImageInfo: Codable {
    let size: Int?
}

struct SelectiveRevealResponse: Codable {
    let success: Bool
    let message: String?
    let proof: SelectiveRevealProof?
    let revealedImage: TransformedImageInfo?
    let useCase: UseCaseInfo?
    let error: String?
}

struct SelectiveRevealProof: Codable {
    let type: String
    let version: String
    let revealedRegion: RegionInfo?
    let revealedImage: RevealedImageInfo?
    let original: OriginalInfo?
    let proof: SelectiveProofData?
    let privacy: PrivacyInfo?
    let metrics: ProofMetrics?
    let timestamp: String?
}

struct RegionInfo: Codable {
    let x: Int
    let y: Int
    let width: Int
    let height: Int
    let type: String?
}

struct RevealedImageInfo: Codable {
    let width: Int
    let height: Int
    let commitment: String?
}

struct OriginalInfo: Codable {
    let width: Int
    let height: Int
    let commitment: String?
    let signature: String?
}

struct SelectiveProofData: Codable {
    let revealedTileCount: Int?
    let totalOriginalTiles: Int?
    let revealRatio: String?
    let commitment: String?
}

struct PrivacyInfo: Codable {
    let originalRevealed: Bool?
    let onlyRegionExposed: Bool?
    let restOfImagePrivate: Bool?
    let merkleProofsIncluded: Bool?
    let originalNotIncluded: Bool?
    let onlyRedactedReturned: Bool?
    let unaffectedTilesProven: Bool?
    let redactedRegionsPrivate: Bool?
}

struct UseCaseInfo: Codable {
    let description: String?
    let verification: String?
    let privacy: String?
}

struct RedactionResponse: Codable {
    let success: Bool
    let message: String?
    let redactions: RedactionDetails?
    let proof: RedactionProof?
    let privacy: PrivacyInfo?
    let dimensions: DimensionInfo?
    let metrics: RedactionMetrics?
    let redactedImage: TransformedImageInfo?
    let useCase: UseCaseInfo?
    let error: String?
}

struct RedactionDetails: Codable {
    let count: Int
    let details: [RedactionDetail]?
    let affectedTileCount: Int?
    let unaffectedTileCount: Int?
    let preservedRatio: String?
}

struct RedactionDetail: Codable {
    let region: RegionInfo
    let type: String
    let sigma: Int?
}

struct RedactionProof: Codable {
    let originalCommitment: String?
    let redactedCommitment: String?
    let allUnaffectedMatch: Bool?
    let commitment: String?
}

struct DimensionInfo: Codable {
    let width: Int
    let height: Int
}

struct RedactionMetrics: Codable {
    let provingTime: Int?
    let totalTiles: Int?
    let affectedTiles: Int?
}

struct FraudCheckResponse: Codable {
    let success: Bool
    let mode: String?
    let fraudDetected: Bool
    let reason: String?
    let checkTime: String?
    let checksPerformed: Int?
    let recommendation: String?
    let error: String?
}

// MARK: - Error Types

enum PrivacyProofError: LocalizedError {
    case invalidURL
    case invalidImage
    case networkError(Error)
    case serverError(Int, String)
    case decodingError(Error)
    case commitmentFailed(String)
    case proofGenerationFailed(String)

    var errorDescription: String? {
        switch self {
        case .invalidURL:
            return "Invalid backend URL"
        case .invalidImage:
            return "Invalid image data"
        case .networkError(let error):
            return "Network error: \(error.localizedDescription)"
        case .serverError(let code, let message):
            return "Server error (\(code)): \(message)"
        case .decodingError(let error):
            return "Failed to decode response: \(error.localizedDescription)"
        case .commitmentFailed(let message):
            return "Commitment failed: \(message)"
        case .proofGenerationFailed(let message):
            return "Proof generation failed: \(message)"
        }
    }
}

// MARK: - Privacy Proofs Manager

class PrivacyProofsManager {
    static let shared = PrivacyProofsManager()

    private var baseURL: String {
        if let customURL = UserDefaults.standard.string(forKey: "backendURL"), !customURL.isEmpty {
            return customURL
        }
        return "https://api.trueshot.app"
    }

    private init() {}

    // MARK: - Create Tile Commitment

    /// Creates a cryptographic commitment to an image without storing it on the server
    /// This is the first step for any privacy-preserving operation
    func createCommitment(
        image: UIImage,
        completion: @escaping (Result<PrivacyProofCommitmentResponse, PrivacyProofError>) -> Void
    ) {
        guard let url = URL(string: "\(baseURL)/api/privacy-proofs/commit") else {
            completion(.failure(.invalidURL))
            return
        }

        guard let imageData = image.jpegData(compressionQuality: 0.9) else {
            completion(.failure(.invalidImage))
            return
        }

        print("🔐 Creating tile commitment for image (\(imageData.count) bytes)")

        let request = createMultipartRequest(url: url, imageData: imageData, fieldName: "image")

        performRequest(request: request) { (result: Result<PrivacyProofCommitmentResponse, PrivacyProofError>) in
            switch result {
            case .success(let response):
                if response.success {
                    print("✅ Commitment created: \(response.commitmentId ?? "unknown")")
                    print("   Merkle root: \(response.commitment?.merkleRoot.prefix(32) ?? "")...")
                    print("   Tiles: \(response.commitment?.totalTiles ?? 0)")
                } else {
                    print("❌ Commitment failed: \(response.error ?? "unknown error")")
                }
                completion(.success(response))
            case .failure(let error):
                print("❌ Commitment error: \(error.localizedDescription)")
                completion(.failure(error))
            }
        }
    }

    // MARK: - Apply Transformation with Proof

    /// Applies a transformation and generates a privacy-preserving proof
    /// The proof can be verified WITHOUT seeing the original image
    func applyTransformationWithProof(
        image: UIImage,
        commitmentId: String,
        transformation: PrivacyTransformation,
        completion: @escaping (Result<(TransformProofResponse, Data?), PrivacyProofError>) -> Void
    ) {
        guard let url = URL(string: "\(baseURL)/api/privacy-proofs/apply-and-prove") else {
            completion(.failure(.invalidURL))
            return
        }

        guard let imageData = image.jpegData(compressionQuality: 0.9) else {
            completion(.failure(.invalidImage))
            return
        }

        print("🔄 Applying \(transformation.type) transformation with proof...")

        var request = createMultipartRequest(url: url, imageData: imageData, fieldName: "image")

        // Add commitment ID
        appendTextField(to: &request, name: "commitmentId", value: commitmentId)

        // Add transformation JSON
        let transformationJSON = transformation.toJSON()
        appendTextField(to: &request, name: "transformation", value: transformationJSON)

        performRequestWithImage(request: request) { result in
            completion(result)
        }
    }

    // MARK: - Selective Reveal

    /// Proves that a cropped region came from an authenticated original
    /// without revealing the rest of the image
    func selectiveReveal(
        image: UIImage,
        region: CGRect,
        completion: @escaping (Result<(SelectiveRevealResponse, Data?), PrivacyProofError>) -> Void
    ) {
        guard let url = URL(string: "\(baseURL)/api/privacy-proofs/selective-reveal") else {
            completion(.failure(.invalidURL))
            return
        }

        guard let imageData = image.jpegData(compressionQuality: 0.9) else {
            completion(.failure(.invalidImage))
            return
        }

        print("👁️ Creating selective reveal proof for region: \(region)")

        var request = createMultipartRequest(url: url, imageData: imageData, fieldName: "image")

        // Add region JSON
        let regionJSON = """
        {"x":\(Int(region.origin.x)),"y":\(Int(region.origin.y)),"width":\(Int(region.width)),"height":\(Int(region.height))}
        """
        appendTextField(to: &request, name: "region", value: regionJSON)

        performRequestWithImage(request: request) { result in
            completion(result)
        }
    }

    // MARK: - Regional Redaction

    /// Blurs or blacks out regions with cryptographic proof that the rest is untouched
    func redactRegions(
        image: UIImage,
        regions: [RedactionRegion],
        completion: @escaping (Result<(RedactionResponse, Data?), PrivacyProofError>) -> Void
    ) {
        guard let url = URL(string: "\(baseURL)/api/privacy-proofs/redact") else {
            completion(.failure(.invalidURL))
            return
        }

        guard let imageData = image.jpegData(compressionQuality: 0.9) else {
            completion(.failure(.invalidImage))
            return
        }

        print("🔒 Redacting \(regions.count) region(s) with proof...")

        var request = createMultipartRequest(url: url, imageData: imageData, fieldName: "image")

        // Add regions JSON
        let regionsJSON = regions.map { $0.toJSON() }.joined(separator: ",")
        appendTextField(to: &request, name: "regions", value: "[\(regionsJSON)]")

        performRequestWithImage(request: request) { result in
            completion(result)
        }
    }

    // MARK: - Fast Fraud Check

    /// Performs sub-millisecond validation of a proof
    func quickFraudCheck(
        proof: TransformationProof,
        completion: @escaping (Result<FraudCheckResponse, PrivacyProofError>) -> Void
    ) {
        guard let url = URL(string: "\(baseURL)/api/privacy-proofs/fraud-check") else {
            completion(.failure(.invalidURL))
            return
        }

        print("⚡ Running fast fraud check...")

        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")

        do {
            let encoder = JSONEncoder()
            let proofData = try encoder.encode(["proof": proof])
            request.httpBody = proofData
        } catch {
            completion(.failure(.decodingError(error)))
            return
        }

        performRequest(request: request, completion: completion)
    }

    // MARK: - Verify Transformation Proof

    /// Verifies a privacy-preserving proof WITHOUT the original image
    func verifyProof(
        proof: TransformationProof,
        transformedImage: UIImage,
        completion: @escaping (Result<Bool, PrivacyProofError>) -> Void
    ) {
        guard let url = URL(string: "\(baseURL)/api/privacy-proofs/verify") else {
            completion(.failure(.invalidURL))
            return
        }

        guard let imageData = transformedImage.jpegData(compressionQuality: 0.9) else {
            completion(.failure(.invalidImage))
            return
        }

        print("🔍 Verifying privacy-preserving proof...")

        var request = createMultipartRequest(url: url, imageData: imageData, fieldName: "image")

        // Add proof JSON
        do {
            let encoder = JSONEncoder()
            let proofData = try encoder.encode(proof)
            if let proofString = String(data: proofData, encoding: .utf8) {
                appendTextField(to: &request, name: "proof", value: proofString)
            }
        } catch {
            completion(.failure(.decodingError(error)))
            return
        }

        struct VerifyResponse: Codable {
            let success: Bool
            let valid: Bool?
            let error: String?
        }

        performRequest(request: request) { (result: Result<VerifyResponse, PrivacyProofError>) in
            switch result {
            case .success(let response):
                completion(.success(response.valid ?? false))
            case .failure(let error):
                completion(.failure(error))
            }
        }
    }

    // MARK: - Helper Methods

    private func createMultipartRequest(url: URL, imageData: Data, fieldName: String) -> (URLRequest, String, NSMutableData) {
        let boundary = UUID().uuidString
        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("multipart/form-data; boundary=\(boundary)", forHTTPHeaderField: "Content-Type")
        request.timeoutInterval = 60

        let body = NSMutableData()

        // Add image field
        body.append("--\(boundary)\r\n".data(using: .utf8)!)
        body.append("Content-Disposition: form-data; name=\"\(fieldName)\"; filename=\"image.jpg\"\r\n".data(using: .utf8)!)
        body.append("Content-Type: image/jpeg\r\n\r\n".data(using: .utf8)!)
        body.append(imageData)
        body.append("\r\n".data(using: .utf8)!)

        return (request, boundary, body)
    }

    private func appendTextField(to request: inout (URLRequest, String, NSMutableData), name: String, value: String) {
        let boundary = request.1
        let body = request.2

        body.append("--\(boundary)\r\n".data(using: .utf8)!)
        body.append("Content-Disposition: form-data; name=\"\(name)\"\r\n".data(using: .utf8)!)
        body.append("Content-Type: text/plain; charset=utf-8\r\n\r\n".data(using: .utf8)!)
        body.append("\(value)\r\n".data(using: .utf8)!)
    }

    private func performRequest<T: Codable>(
        request: URLRequest,
        completion: @escaping (Result<T, PrivacyProofError>) -> Void
    ) {
        URLSession.shared.dataTask(with: request) { data, response, error in
            DispatchQueue.main.async {
                if let error = error {
                    completion(.failure(.networkError(error)))
                    return
                }

                guard let httpResponse = response as? HTTPURLResponse else {
                    completion(.failure(.networkError(NSError(domain: "", code: -1))))
                    return
                }

                guard (200...299).contains(httpResponse.statusCode) else {
                    let message = data.flatMap { String(data: $0, encoding: .utf8) } ?? "Unknown error"
                    completion(.failure(.serverError(httpResponse.statusCode, message)))
                    return
                }

                guard let data = data else {
                    completion(.failure(.serverError(httpResponse.statusCode, "No data")))
                    return
                }

                do {
                    let decoded = try JSONDecoder().decode(T.self, from: data)
                    completion(.success(decoded))
                } catch {
                    completion(.failure(.decodingError(error)))
                }
            }
        }.resume()
    }

    private func performRequest<T: Codable>(
        request: (URLRequest, String, NSMutableData),
        completion: @escaping (Result<T, PrivacyProofError>) -> Void
    ) {
        var urlRequest = request.0
        let boundary = request.1
        let body = request.2

        // Finalize body
        body.append("--\(boundary)--\r\n".data(using: .utf8)!)
        urlRequest.httpBody = body as Data

        performRequest(request: urlRequest, completion: completion)
    }

    private func performRequestWithImage<T: Codable>(
        request: (URLRequest, String, NSMutableData),
        completion: @escaping (Result<(T, Data?), PrivacyProofError>) -> Void
    ) {
        var urlRequest = request.0
        let boundary = request.1
        let body = request.2

        // Finalize body
        body.append("--\(boundary)--\r\n".data(using: .utf8)!)
        urlRequest.httpBody = body as Data

        URLSession.shared.dataTask(with: urlRequest) { data, response, error in
            DispatchQueue.main.async {
                if let error = error {
                    completion(.failure(.networkError(error)))
                    return
                }

                guard let httpResponse = response as? HTTPURLResponse else {
                    completion(.failure(.networkError(NSError(domain: "", code: -1))))
                    return
                }

                guard (200...299).contains(httpResponse.statusCode) else {
                    let message = data.flatMap { String(data: $0, encoding: .utf8) } ?? "Unknown error"
                    completion(.failure(.serverError(httpResponse.statusCode, message)))
                    return
                }

                guard let data = data else {
                    completion(.failure(.serverError(httpResponse.statusCode, "No data")))
                    return
                }

                do {
                    let decoded = try JSONDecoder().decode(T.self, from: data)
                    // For now, return nil for the image data - we'd need to handle multipart response
                    completion(.success((decoded, nil)))
                } catch {
                    completion(.failure(.decodingError(error)))
                }
            }
        }.resume()
    }
}

// MARK: - Transformation Types

enum PrivacyTransformationType: String, Codable {
    case crop
    case resize
    case grayscale
    case blur
    case brightness
    case contrast
}

struct PrivacyTransformation {
    let type: PrivacyTransformationType
    let params: [String: Any]

    func toJSON() -> String {
        var paramsJSON = ""

        switch type {
        case .crop:
            let x = params["x"] as? Int ?? 0
            let y = params["y"] as? Int ?? 0
            let width = params["width"] as? Int ?? 100
            let height = params["height"] as? Int ?? 100
            paramsJSON = "\"x\":\(x),\"y\":\(y),\"width\":\(width),\"height\":\(height)"
        case .resize:
            let width = params["width"] as? Int ?? 100
            let height = params["height"] as? Int ?? 100
            paramsJSON = "\"width\":\(width),\"height\":\(height)"
        case .grayscale:
            paramsJSON = ""
        case .blur:
            let sigma = params["sigma"] as? Int ?? 5
            paramsJSON = "\"sigma\":\(sigma)"
        case .brightness:
            let factor = params["factor"] as? Double ?? 1.0
            paramsJSON = "\"factor\":\(factor)"
        case .contrast:
            let factor = params["factor"] as? Double ?? 1.0
            paramsJSON = "\"factor\":\(factor)"
        }

        if paramsJSON.isEmpty {
            return "{\"type\":\"\(type.rawValue)\",\"params\":{}}"
        }
        return "{\"type\":\"\(type.rawValue)\",\"params\":{\(paramsJSON)}}"
    }
}

// MARK: - Redaction Region

enum RedactionType: String, Codable {
    case blur
    case black
}

struct RedactionRegion {
    let x: Int
    let y: Int
    let width: Int
    let height: Int
    let type: RedactionType

    func toJSON() -> String {
        return "{\"x\":\(x),\"y\":\(y),\"width\":\(width),\"height\":\(height),\"type\":\"\(type.rawValue)\"}"
    }
}
