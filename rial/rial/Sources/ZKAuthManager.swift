//
//  ZKAuthManager.swift
//  rial
//
//  Zero-Knowledge Proof Authentication
//

import Foundation
import CryptoKit

class ZKAuthManager {
    static let shared = ZKAuthManager()
    
    private init() {}
    
    /// Register user with ZK commitment
    func register(
        username: String,
        password: String,
        completion: @escaping (Result<ZKRegistrationResponse, Error>) -> Void
    ) {
        print("📝 ZK Registration starting...")
        
        DispatchQueue.global(qos: .userInitiated).async {
            // Generate salt
            let salt = UUID().uuidString
            
            // Create commitment: H(password + salt)
            let commitment = self.createCommitment(password: password, salt: salt)
            
            print("   Commitment: \(commitment.prefix(32))...")
            
            // Store salt locally (needed for login)
            UserDefaults.standard.set(salt, forKey: "zk_salt_\(username)")
            
            // Send to backend
            self.sendRegistration(
                username: username,
                commitment: commitment
            ) { result in
                DispatchQueue.main.async {
                    completion(result)
                }
            }
        }
    }
    
    /// Login with zero-knowledge proof
    func login(
        username: String,
        password: String,
        completion: @escaping (Result<ZKLoginResponse, Error>) -> Void
    ) {
        print("🔐 ZK Login starting...")
        
        DispatchQueue.global(qos: .userInitiated).async {
            // Step 1: Get challenge from server
            self.getChallenge(username: username) { challengeResult in
                switch challengeResult {
                case .success(let challengeData):
                    // Step 2: Generate ZK proof
                    guard let salt = UserDefaults.standard.string(forKey: "zk_salt_\(username)") else {
                        DispatchQueue.main.async {
                            completion(.failure(NSError(
                                domain: "ZKAuth",
                                code: -1,
                                userInfo: [NSLocalizedDescriptionKey: "Salt not found. Please register first."]
                            )))
                        }
                        return
                    }
                    
                    let proof = self.generateProof(
                        password: password,
                        salt: salt,
                        challenge: challengeData.challenge
                    )
                    
                    print("   Proof generated: \(proof.proof.prefix(32))...")
                    
                    // Step 3: Verify with server
                    self.verifyProof(
                        challenge: challengeData.challenge,
                        proof: proof
                    ) { verifyResult in
                        DispatchQueue.main.async {
                            completion(verifyResult)
                        }
                    }
                    
                case .failure(let error):
                    DispatchQueue.main.async {
                        completion(.failure(error))
                    }
                }
            }
        }
    }
    
    // MARK: - Private Methods
    
    private func createCommitment(password: String, salt: String) -> String {
        let data = (password + salt).data(using: .utf8)!
        let hash = SHA256.hash(data: data)
        return hash.map { String(format: "%02x", $0) }.joined()
    }
    
    private func getChallenge(username: String, completion: @escaping (Result<ZKChallengeResponse, Error>) -> Void) {
        let baseURL = "https://merchants-technique-prove-joining.trycloudflare.com"
        guard let url = URL(string: "\(baseURL)/api/zk-auth/challenge") else {
            completion(.failure(NSError(domain: "", code: -1, userInfo: [NSLocalizedDescriptionKey: "Invalid URL"])))
            return
        }
        
        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        
        let body = ["username": username]
        request.httpBody = try? JSONEncoder().encode(body)
        
        URLSession.shared.dataTask(with: request) { data, response, error in
            if let error = error {
                completion(.failure(error))
                return
            }
            
            guard let data = data else {
                completion(.failure(NSError(domain: "", code: -1, userInfo: [NSLocalizedDescriptionKey: "No data"])))
                return
            }
            
            do {
                let challengeResponse = try JSONDecoder().decode(ZKChallengeResponse.self, from: data)
                completion(.success(challengeResponse))
            } catch {
                completion(.failure(error))
            }
        }.resume()
    }
    
    private func generateProof(password: String, salt: String, challenge: String) -> ZKAuthProof {
        // Generate ZK proof
        // In production: Use actual ZK-SNARK (Halo2/Groth16)
        
        // Simplified: H(password + salt + challenge)
        let data = (password + salt + challenge).data(using: .utf8)!
        let hash = SHA256.hash(data: data)
        let proof = hash.map { String(format: "%02x", $0) }.joined()
        
        let response = self.createCommitment(password: password, salt: salt + challenge)
        
        return ZKAuthProof(
            proof: proof,
            response: response,
            algorithm: "SHA256-simplified" // In production: "Halo2" or "Groth16"
        )
    }
    
    private func sendRegistration(username: String, commitment: String, completion: @escaping (Result<ZKRegistrationResponse, Error>) -> Void) {
        let baseURL = "https://merchants-technique-prove-joining.trycloudflare.com"
        guard let url = URL(string: "\(baseURL)/api/zk-auth/register") else {
            completion(.failure(NSError(domain: "", code: -1, userInfo: [NSLocalizedDescriptionKey: "Invalid URL"])))
            return
        }
        
        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        
        let body = [
            "username": username,
            "commitment": commitment,
            "publicData": [
                "registeredAt": ISO8601DateFormatter().string(from: Date()),
                "platform": "iOS"
            ]
        ] as [String : Any]
        
        request.httpBody = try? JSONSerialization.data(withJSONObject: body)
        
        URLSession.shared.dataTask(with: request) { data, response, error in
            if let error = error {
                completion(.failure(error))
                return
            }
            
            guard let data = data else {
                completion(.failure(NSError(domain: "", code: -1, userInfo: [NSLocalizedDescriptionKey: "No data"])))
                return
            }
            
            do {
                let regResponse = try JSONDecoder().decode(ZKRegistrationResponse.self, from: data)
                completion(.success(regResponse))
            } catch {
                completion(.failure(error))
            }
        }.resume()
    }
    
    private func verifyProof(challenge: String, proof: ZKAuthProof, completion: @escaping (Result<ZKLoginResponse, Error>) -> Void) {
        let baseURL = "https://merchants-technique-prove-joining.trycloudflare.com"
        guard let url = URL(string: "\(baseURL)/api/zk-auth/verify") else {
            completion(.failure(NSError(domain: "", code: -1, userInfo: [NSLocalizedDescriptionKey: "Invalid URL"])))
            return
        }
        
        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        
        let body = [
            "challenge": challenge,
            "proof": proof.proof,
            "response": proof.response
        ]
        
        request.httpBody = try? JSONEncoder().encode(body)
        
        URLSession.shared.dataTask(with: request) { data, response, error in
            if let error = error {
                completion(.failure(error))
                return
            }
            
            guard let data = data else {
                completion(.failure(NSError(domain: "", code: -1, userInfo: [NSLocalizedDescriptionKey: "No data"])))
                return
            }
            
            do {
                let loginResponse = try JSONDecoder().decode(ZKLoginResponse.self, from: data)
                
                // Store session token
                UserDefaults.standard.set(loginResponse.sessionToken, forKey: "sessionToken")
                
                completion(.success(loginResponse))
            } catch {
                completion(.failure(error))
            }
        }.resume()
    }
}

// MARK: - Data Models

struct ZKRegistrationResponse: Codable {
    let success: Bool
    let userId: String
    let username: String
    let message: String?
}

struct ZKChallengeResponse: Codable {
    let success: Bool
    let challenge: String
    let userCommitment: String?
}

struct ZKAuthProof: Codable {
    let proof: String
    let response: String
    let algorithm: String
}

struct ZKLoginResponse: Codable {
    let success: Bool
    let userId: String
    let username: String
    let sessionToken: String
    let expiresIn: Int
}

