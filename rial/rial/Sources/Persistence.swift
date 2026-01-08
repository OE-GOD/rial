//
//  Persistence.swift
//  rial
//
//  Created by Sofiane Larbi on 2/16/24.
//

import CoreData

struct PersistenceController {
    static let shared = PersistenceController()
    
    static var preview: PersistenceController = {
        let result = PersistenceController(inMemory: true)
        let viewContext = result.container.viewContext
        for _ in 0..<10 {
            let newItem = Item(context: viewContext)
            newItem.timestamp = Date()
        }
        do {
            try viewContext.save()
        } catch {
            // Do not use fatalError in a shipping application.
            // Instead, log the error and handle it gracefully.
            let nsError = error as NSError
            print("Unresolved error \(nsError), \(nsError.userInfo)")
        }
        return result
    }()
    
    let container: NSPersistentContainer
    let defaults = UserDefaults.standard
    
    init(inMemory: Bool = false) {
        container = NSPersistentContainer(name: "rial")
        if inMemory {
            container.persistentStoreDescriptions.first!.url = URL(fileURLWithPath: "/dev/null")
        }
        container.loadPersistentStores(completionHandler: { (storeDescription, error) in
            if let error = error as NSError? {
                // Do not use fatalError in a shipping application.
                // Instead, log the error and handle it gracefully.
                print("Unresolved error \(error), \(error.userInfo)")
            }
        })
        container.viewContext.automaticallyMergesChangesFromParent = true
    }
    
    func saveItem() {
        let context = container.viewContext
        let newItem = Item(context: context)
        newItem.timestamp = Date()
        do {
            try context.save()
        } catch {
            let nsError = error as NSError
            fatalError("Unresolved error \(nsError), \(nsError.userInfo)")
        }
    }
    
    func fetchItems() -> [Item] {
        let context = container.viewContext
        let fetchRequest: NSFetchRequest<Item> = Item.fetchRequest()
        do {
            let items = try context.fetch(fetchRequest)
            return items
        } catch {
            let nsError = error as NSError
            fatalError("Unresolved error \(nsError), \(nsError.userInfo)")
        }
    }
    
    func saveAttestation(attestation: Data) {
        defaults.set(attestation, forKey: "attestation")
    }
    
    func saveKeyId(keyId: Data) {
        defaults.set(keyId, forKey: "keyId")
    }
    
    func setAttested() {
        defaults.set(true, forKey: "attested")
    }
    
    func isAttested() -> Bool {
        return defaults.bool(forKey: "attested")
    }
    
    // MARK: - Certified Image Management
    
    func saveCertifiedImage(attestedImage: AttestedImage, imageUrl: String?, isVerified: Bool) {
        // Create a dictionary to store the image data
        var imageDict = [String: String]()  // Changed to [String: String] for UserDefaults compatibility
        
        if let imageData = attestedImage.imageData {
            // Convert Data to base64 string for UserDefaults storage
            imageDict["imageData"] = imageData.base64EncodedString()
            print("📦 Saving image data: \(imageData.count) bytes")
        }
        
        imageDict["merkleRoot"] = attestedImage.merkleRoot ?? "unknown"
        imageDict["signature"] = attestedImage.signature ?? "unknown"
        imageDict["publicKey"] = attestedImage.publicKey ?? "unknown"
        imageDict["timestamp"] = attestedImage.timestamp ?? ISO8601DateFormatter().string(from: Date())
        
        // Convert Date to ISO8601 string
        let dateFormatter = ISO8601DateFormatter()
        imageDict["certificationDate"] = dateFormatter.string(from: Date())
        
        imageDict["imageUrl"] = imageUrl ?? ""
        imageDict["isVerified"] = isVerified ? "true" : "false"
        
        // 🎯 Save Anti-AI Proof Metadata
        if let proofMetadata = attestedImage.proofMetadata {
            let encoder = JSONEncoder()
            if let metadataJSON = try? encoder.encode(proofMetadata),
               let metadataString = String(data: metadataJSON, encoding: .utf8) {
                imageDict["proofMetadata"] = metadataString
                print("🎯 Saving Anti-AI proof metadata")
            }
        }
        
        print("💾 Image dict keys: \(imageDict.keys)")
        
        // Get existing certified images or create new array
        var certifiedImages = getCertifiedImages()
        certifiedImages.append(imageDict)
        
        print("📚 Total certified images: \(certifiedImages.count)")
        
        // Save to UserDefaults
        defaults.set(certifiedImages, forKey: "certifiedImages")
        defaults.synchronize() // Force save
        
        print("✅ Saved to UserDefaults")
    }
    
    func getCertifiedImages() -> [[String: Any]] {
        return defaults.array(forKey: "certifiedImages") as? [[String: Any]] ?? []
    }
    
    func clearCertifiedImages() {
        defaults.removeObject(forKey: "certifiedImages")
    }
}
