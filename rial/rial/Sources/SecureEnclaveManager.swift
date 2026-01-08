//
//  SecureEnclaveManager.swift
//  rial
//
//  Created by Sofiane Larbi on 2/16/24.
//

import Foundation
import Security

class SecureEnclaveManager {
    
    static let shared = SecureEnclaveManager()
    
    private let kAsymmetricSecAttrKeyType = kSecAttrKeyTypeECSECPrimeRandom
    private let kAsymmetricSecAttrKeySize = 256
    private let tag = "com.proofpix.keys.mykey".data(using: .utf8)!
    
    private var keyQuery: [String: Any] {
        return [kSecClass as String: kSecClassKey,
                kSecAttrApplicationTag as String: tag,
                kSecReturnRef as String: true]
    }
    
    func generateAsymmetricKeyPairIfNeeded() {
        
        // Check if the key pair already exists
        var item: CFTypeRef?
        let status = SecItemCopyMatching(keyQuery as CFDictionary, &item)
        let access = SecAccessControlCreateWithFlags(
            kCFAllocatorDefault,
            kSecAttrAccessibleWhenUnlockedThisDeviceOnly,
            .privateKeyUsage,
            nil)! // Ignore errors.
        
        if status == errSecItemNotFound {
            // Key pair does not exist, create one
            let attributes: NSDictionary = [
                kSecAttrKeyType: kAsymmetricSecAttrKeyType,
                kSecAttrKeySizeInBits: kAsymmetricSecAttrKeySize,
                kSecAttrTokenID: kSecAttrTokenIDSecureEnclave,
                kSecPrivateKeyAttrs: [
                    kSecAttrIsPermanent: true,
                    kSecAttrApplicationTag: tag,
                    kSecAttrAccessControl: access
                ] as [CFString : Any]
            ]
            
            var error: Unmanaged<CFError>?
            guard let privateKey = SecKeyCreateRandomKey(attributes as CFDictionary, &error) else {
                // Handle the error here
                print("Failed to generate key pair: \(error!.takeRetainedValue() as Error)")
                return
            }
            
            // Private key was generated
            print("Private key Was generated: \(privateKey)")
            
            // Retrieving the public key
            guard let publicKey = SecKeyCopyPublicKey(privateKey) else {
                // Handle the error here
                print("Failed to retrieve public key")
                return
            }
            
            print("Public key was retrieved: \(publicKey)")
        } else if status != errSecSuccess {
            // Some other error occurred, handle it
            print("Failed to check if key pair exists")
        } else {
            print("Key pair already exists!")
            guard let publicKey = SecKeyCopyPublicKey(item as! SecKey) else {
                // Handle the error here
                print("Failed to retrieve public key")
                return
            }
            print("Public key was retrieved: \(publicKey)")
        }
    }
    
    func deleteKeyPair() {
        let status = SecItemDelete(keyQuery as CFDictionary)
        
        if status != errSecSuccess {
            // Failed to delete key pair, handle the error
            print("Failed to delete key pair")
        }
    }
    
    func sign(data: Data) -> Data? {
        // Retrieve the private key
        var item: CFTypeRef?
        let status = SecItemCopyMatching(keyQuery as CFDictionary, &item)
        
        guard status == errSecSuccess else {
            print("Failed to retrieve private key")
            return nil
        }
        
        guard let privateKey = item else {
            print("Failed to retrieve private key")
            return nil
        }
        
        // Create the signature
        var error: Unmanaged<CFError>?
        guard let signature = SecKeyCreateSignature(privateKey as! SecKey,
                                                    .ecdsaSignatureMessageX962SHA256,
                                                    data as CFData,
                                                    &error) as Data? else {
            print("Failed to create signature: \(error!.takeRetainedValue() as Error)")
            return nil
        }
        
        return signature
    }
    
    func getPublicKey() -> SecKey? {
        var item: CFTypeRef?
        let status = SecItemCopyMatching(keyQuery as CFDictionary, &item)
        
        guard status == errSecSuccess else {
            print("Failed to retrieve private key for public key retrieval")
            return nil
        }
        
        let privateKey = item as! SecKey
        
        return SecKeyCopyPublicKey(privateKey)
    }
    
    func exportPubKey() throws -> Data? {
        var item: CFTypeRef?
        let status = SecItemCopyMatching(keyQuery as CFDictionary, &item)
        guard status == errSecSuccess else {
            print("Failed to retrieve pub key")
            return nil
        }
        guard let publicKey = SecKeyCopyPublicKey(item as! SecKey) else {
            // Handle the error here
            print("Failed to retrieve public key")
            return nil
        }
        var error: Unmanaged<CFError>?
        guard let data = SecKeyCopyExternalRepresentation(publicKey, &error) as? Data else {
            throw error!.takeRetainedValue() as Error
        }
        return data
    }
}
