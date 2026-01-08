//
//  AppAttestManager.swift
//  rial
//
//  Created by Sofiane Larbi on 5/17/24.
//

import Foundation
import DeviceCheck

class AppAttestManager {
    
    static let shared = AppAttestManager();
    
    private var keyId: String?;
    private var attestation: Data?;
    private let service = DCAppAttestService.shared
    
    init() {
        if service.isSupported {
            // Perform key generation and attestation.
            service.generateKey { keyId, error in
                guard error == nil else {
                    self.keyId = nil;
                    return
                }
                self.keyId = keyId!;
            }
        }
    }
    
    func isReady() -> Bool {
        return self.keyId != nil;
    }
    
    func attestKey(hash: Data, callBack: @escaping (Data?) -> Void) {
        if let keyId {
            service.attestKey(keyId, clientDataHash: hash) { attestation, error in
                guard error == nil else {
                    callBack(nil)
                    return
                }
                self.attestation = attestation
                callBack(attestation)
            }
        } else {
            callBack(nil)
        }
    }
    
    func getAttestation() -> Data? {
        return self.attestation;
    }
}
