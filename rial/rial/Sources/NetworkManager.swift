//
//  NetworkManager.swift
//  rial
//
//  Robust network management with retry logic
//

import Foundation

class NetworkManager {
    static let shared = NetworkManager()
    
    private init() {}
    
    /// Make request with automatic retry
    func makeRequest(
        url: URL,
        method: String = "POST",
        body: Data? = nil,
        headers: [String: String] = [:],
        maxRetries: Int = 3,
        completion: @escaping (Result<Data, Error>) -> Void
    ) {
        performRequest(url: url, method: method, body: body, headers: headers, attempt: 1, maxRetries: maxRetries, completion: completion)
    }
    
    private func performRequest(
        url: URL,
        method: String,
        body: Data?,
        headers: [String: String],
        attempt: Int,
        maxRetries: Int,
        completion: @escaping (Result<Data, Error>) -> Void
    ) {
        var request = URLRequest(url: url)
        request.httpMethod = method
        request.httpBody = body
        
        for (key, value) in headers {
            request.setValue(value, forHTTPHeaderField: key)
        }
        
        // Set timeout based on attempt
        request.timeoutInterval = TimeInterval(10 * attempt) // 10s, 20s, 30s
        
        print("🌐 Network request (attempt \(attempt)/\(maxRetries)): \(url)")
        
        URLSession.shared.dataTask(with: request) { data, response, error in
            // Check for errors
            if let error = error {
                print("❌ Request failed (attempt \(attempt)): \(error.localizedDescription)")
                
                // Retry if not max attempts
                if attempt < maxRetries {
                    let delay = Double(attempt) * 1.0 // 1s, 2s, 3s
                    print("⏳ Retrying in \(delay)s...")
                    
                    DispatchQueue.global().asyncAfter(deadline: .now() + delay) {
                        self.performRequest(
                            url: url,
                            method: method,
                            body: body,
                            headers: headers,
                            attempt: attempt + 1,
                            maxRetries: maxRetries,
                            completion: completion
                        )
                    }
                    return
                }
                
                // Max retries reached
                completion(.failure(error))
                return
            }
            
            // Check HTTP status
            if let httpResponse = response as? HTTPURLResponse {
                print("✅ Response: \(httpResponse.statusCode)")
                
                if (200...299).contains(httpResponse.statusCode) {
                    completion(.success(data ?? Data()))
                } else {
                    let error = NSError(
                        domain: "NetworkManager",
                        code: httpResponse.statusCode,
                        userInfo: [NSLocalizedDescriptionKey: "HTTP \(httpResponse.statusCode)"]
                    )
                    completion(.failure(error))
                }
            } else {
                completion(.success(data ?? Data()))
            }
        }.resume()
    }
    
    /// Check backend availability
    func checkBackendHealth(url: String, completion: @escaping (Bool) -> Void) {
        guard let healthURL = URL(string: "\(url)/health") else {
            completion(false)
            return
        }
        
        var request = URLRequest(url: healthURL)
        request.timeoutInterval = 5
        
        URLSession.shared.dataTask(with: request) { data, response, error in
            if let httpResponse = response as? HTTPURLResponse,
               (200...299).contains(httpResponse.statusCode) {
                print("✅ Backend is healthy: \(url)")
                completion(true)
            } else {
                print("❌ Backend unavailable: \(url)")
                completion(false)
            }
        }.resume()
    }
}

