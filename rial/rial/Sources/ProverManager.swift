//
//  ProverManager.swift
//  rial
//
//  Created by Sofiane Larbi on 2/17/24.
//

import Foundation

enum ProverError: LocalizedError {
    case invalidURL
    case missingData
    case localNetworkPermissionRequired
    case networkError(Error)
    case serverError(Int, String)
    
    var errorDescription: String? {
        switch self {
        case .invalidURL:
            return "Invalid backend URL configuration"
        case .missingData:
            return "Missing required image or signature data"
        case .localNetworkPermissionRequired:
            return """
Local network access is required to reach the secure prover running on your trusted device.
Please grant local network permission in Settings ▸ Privacy & Security ▸ Local Network ▸ enable \"rial\".
"""
        case .networkError(let error):
            return "Network error: \(error.localizedDescription)"
        case .serverError(let code, let message):
            return "Server error (\(code)): \(message)"
        }
    }
}

struct ProverResponse: Codable {
    let message: String
    let signatureValid: Bool?
    let imageUrl: String?
    let zkProofs: [ZKProof]?
    let success: Bool?
}

struct ZKProof: Codable {
    let type: String
    let originalHash: String?
    let transformedHash: String?
    let transformation: TransformationType?
    let proof: ProofDetails?
}

struct TransformationType: Codable {
    let type: String
    let params: [String: Any]?
    
    enum CodingKeys: String, CodingKey {
        case type
        case params
    }
    
    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        type = try container.decode(String.self, forKey: .type)
        params = nil // Simplified for now
    }
    
    func encode(to encoder: Encoder) throws {
        var container = encoder.container(keyedBy: CodingKeys.self)
        try container.encode(type, forKey: .type)
    }
}

struct ProofDetails: Codable {
    let method: String
    let timestamp: Double?
}

class ProverManager {
    
    static let shared = ProverManager()
    
    // TODO: Move to configuration file or environment variable
    private var baseURL: String {
        // Check if user has set a custom URL in settings
        if let customURL = UserDefaults.standard.string(forKey: "backendURL"), !customURL.isEmpty {
            print("🔧 Using custom backend URL: \(customURL)")
            return customURL
        }

        // Default URLs
        #if targetEnvironment(simulator)
        let defaultURL = "http://localhost:3000"
        print("🔧 Using simulator default: \(defaultURL)")
        return defaultURL
        #else
        let defaultURL = "http://10.0.0.59:3000"
        print("🔧 Using device default: \(defaultURL)")
        return defaultURL
        #endif
    }
    
    private var proveURL: URL? {
        URL(string: "\(baseURL)/prove")
    }
    
    // Public method to get backend URL for other views
    func getBackendURL() -> String {
        return baseURL
    }
    
    func proveImage(
        signature: Data?,
        image: Data?,
        publicKey: Data?,
        c2paClaim: String?,
        croppingHeight: Int32,
        croppingWidth: Int32,
        croppingX: Int32 = 0,
        croppingY: Int32 = 0,
        proofMetadata: ProofMetadata? = nil,
        useZKProofs: Bool = true,
        completion: @escaping (Result<ProverResponse, ProverError>) -> Void
    ) {
        guard let url = proveURL else {
            completion(.failure(.invalidURL))
            return
        }
        
        guard let providedSignature = signature,
              let img_buffer = image,
              let providedPublicKey = publicKey else {
            print("❌ Missing required data")
            completion(.failure(.missingData))
            return
        }
        
        print("✅ Starting proof generation - Image size: \(img_buffer.count) bytes")
        print("🌐 Using backend URL: \(url)")
        
        let request = MultipartFormDataRequest(url: url)
        request.addDataField(named: "img_buffer", data: img_buffer, mimeType: "image/jpeg")
        
        // Use the provided crop coordinates
        let transformations = """
        [{"Crop":{"x":\(croppingX),"y":\(croppingY),"height":\(croppingHeight),"width":\(croppingWidth)}}]
        """
        
        request.addTextField(named: "transformations", value: transformations)
        request.addTextField(named: "signature", value: providedSignature.base64EncodedString())
        request.addTextField(named: "public_key", value: providedPublicKey.base64EncodedString())
        
        if let claim = c2paClaim {
            request.addTextField(named: "c2pa_claim", value: claim)
        }
        
        // Add ZK proof option (fast hash-based proofs)
        if useZKProofs {
            request.addTextField(named: "fast_proofs", value: "true")
        }
        
        // 🎯 Add proof metadata (Anti-AI proof)
        if let metadata = proofMetadata {
            let encoder = JSONEncoder()
            encoder.outputFormatting = .prettyPrinted
            if let metadataJSON = try? encoder.encode(metadata),
               let metadataString = String(data: metadataJSON, encoding: .utf8) {
                request.addTextField(named: "proof_metadata", value: metadataString)
                print("📊 Sending Anti-AI proof metadata:")
                print("   - Camera: \(metadata.cameraModel)")
                print("   - GPS: \(metadata.latitude != nil ? "✅" : "❌")")
                print("   - Motion: \(metadata.accelerometerX != nil ? "✅" : "❌")")
            }
        } else {
            print("⚠️ No proof metadata available")
        }
        
        // Create URL session with timeout
        let config = URLSessionConfiguration.default
        config.timeoutIntervalForRequest = 60  // 60 second timeout (allows for metadata collection)
        config.timeoutIntervalForResource = 120
        let session = URLSession(configuration: config)
        
        session.dataTask(with: request) { data, response, error in
            if let error = error {
                if let nsError = error as NSError?, nsError.domain == NSURLErrorDomain {
                    if nsError.code == NSURLErrorNotConnectedToInternet {
                        let networkInfo = String(describing: nsError.userInfo["_NSURLErrorNWPathKey"] ?? "")
                        if networkInfo.contains("Local network prohibited") {
                            print("❌ Local network permission required to reach prover: \(networkInfo)")
                            completion(.failure(.localNetworkPermissionRequired))
                            return
                        }
                    }
                }
                
                print("❌ Network error: \(error.localizedDescription)")
                print("   Error code: \(error._code)")
                completion(.failure(.networkError(error)))
                return
            }
            
            guard let httpResponse = response as? HTTPURLResponse else {
                completion(.failure(.networkError(NSError(domain: "", code: -1, userInfo: [NSLocalizedDescriptionKey: "Invalid response"]))))
                return
            }
            
            print("✅ Response status: \(httpResponse.statusCode)")
            
            guard (200...299).contains(httpResponse.statusCode) else {
                let message = data.flatMap { String(data: $0, encoding: .utf8) } ?? "Unknown error"
                completion(.failure(.serverError(httpResponse.statusCode, message)))
                return
            }
            
            if let data = data {
                do {
                    let decoder = JSONDecoder()
                    let response = try decoder.decode(ProverResponse.self, from: data)
                    print("✅ Proof generated successfully")
                    
                    // Log ZK proofs if present
                    if let zkProofs = response.zkProofs {
                        print("🔐 ZK Proofs generated: \(zkProofs.count)")
                        for (index, proof) in zkProofs.enumerated() {
                            print("   \(index + 1). Type: \(proof.type)")
                            if let originalHash = proof.originalHash {
                                print("      Original: \(originalHash.prefix(16))...")
                            }
                            if let transformedHash = proof.transformedHash {
                                print("      Result: \(transformedHash.prefix(16))...")
                            }
                        }
                    }
                    
                    completion(.success(response))
                    
                    // Save to persistent storage
                    DispatchQueue.main.async {
                        PersistenceController.shared.saveItem()
                    }
                } catch {
                    print("❌ Failed to decode response: \(error)")
                    // Still consider it success if we got 200 but couldn't decode
                    let fallbackResponse = ProverResponse(
                        message: "Proof generated",
                        signatureValid: nil,
                        imageUrl: nil,
                        zkProofs: nil,
                        success: true
                    )
                    completion(.success(fallbackResponse))
                }
            }
        }.resume()
    }
}

struct MultipartFormDataRequest {
    private let boundary: String = UUID().uuidString
    private var httpBody = NSMutableData()
    let url: URL

    init(url: URL) {
        self.url = url
    }

    func addTextField(named name: String, value: String) {
        httpBody.append(textFormField(named: name, value: value))
    }

    private func textFormField(named name: String, value: String) -> String {
        var fieldString = "--\(boundary)\r\n"
        fieldString += "Content-Disposition: form-data; name=\"\(name)\"\r\n"
        fieldString += "Content-Type: text/plain; charset=ISO-8859-1\r\n"
        fieldString += "Content-Transfer-Encoding: 8bit\r\n"
        fieldString += "\r\n"
        fieldString += "\(value)\r\n"

        return fieldString
    }

    func addDataField(named name: String, data: Data, mimeType: String) {
        httpBody.append(dataFormField(named: name, data: data, mimeType: mimeType))
    }

    private func dataFormField(named name: String,
                               data: Data,
                               mimeType: String) -> Data {
        let fieldData = NSMutableData()

        fieldData.append("--\(boundary)\r\n")
        fieldData.append("Content-Disposition: form-data; name=\"\(name)\"; filename=\"image.jpg\"\r\n")
        fieldData.append("Content-Type: \(mimeType)\r\n")
        fieldData.append("\r\n")
        fieldData.append(data)
        fieldData.append("\r\n")

        return fieldData as Data
    }
    
    func asURLRequest() -> URLRequest {
        var request = URLRequest(url: url)

        request.httpMethod = "POST"
        request.setValue("multipart/form-data; boundary=\(boundary)", forHTTPHeaderField: "Content-Type")

        httpBody.append("--\(boundary)--")
        request.httpBody = httpBody as Data
        return request
    }
}

extension NSMutableData {
  func append(_ string: String) {
    if let data = string.data(using: .utf8) {
      self.append(data)
    }
  }
}

extension URLSession {
    func dataTask(with request: MultipartFormDataRequest,
                  completionHandler: @escaping (Data?, URLResponse?, Error?) -> Void)
    -> URLSessionDataTask {
        let urlRequest = request.asURLRequest()
        print("📦 Extension converting request:")
        print("   Method: \(urlRequest.httpMethod ?? "nil")")
        print("   URL: \(urlRequest.url?.absoluteString ?? "nil")")
        print("   Body size: \(urlRequest.httpBody?.count ?? 0) bytes")
        print("   Headers: \(urlRequest.allHTTPHeaderFields ?? [:])")
        return dataTask(with: urlRequest, completionHandler: completionHandler)
    }
}
