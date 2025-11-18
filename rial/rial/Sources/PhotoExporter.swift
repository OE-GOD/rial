import SwiftUI
import Photos

class PhotoExporter {
    static let shared = PhotoExporter()
    
    /**
     * Save image to Photos app
     */
    func saveToPhotos(image: UIImage, completion: @escaping (Bool, String) -> Void) {
        // Check permission
        let status = PHPhotoLibrary.authorizationStatus(for: .addOnly)
        
        switch status {
        case .authorized, .limited:
            performSave(image: image, completion: completion)
            
        case .notDetermined:
            PHPhotoLibrary.requestAuthorization(for: .addOnly) { newStatus in
                DispatchQueue.main.async {
                    if newStatus == .authorized || newStatus == .limited {
                        self.performSave(image: image, completion: completion)
                    } else {
                        completion(false, "Photo library access denied")
                    }
                }
            }
            
        case .denied, .restricted:
            completion(false, "Photo library access denied. Enable in Settings.")
            
        @unknown default:
            completion(false, "Unknown permission status")
        }
    }
    
    private func performSave(image: UIImage, completion: @escaping (Bool, String) -> Void) {
        PHPhotoLibrary.shared().performChanges({
            PHAssetChangeRequest.creationRequestForAsset(from: image)
        }) { success, error in
            DispatchQueue.main.async {
                if success {
                    completion(true, "Saved to Photos app!")
                } else {
                    completion(false, error?.localizedDescription ?? "Failed to save")
                }
            }
        }
    }
    
    /**
     * Save image with metadata to Photos
     */
    func saveWithMetadata(image: UIImage, metadata: [String: Any], completion: @escaping (Bool, String) -> Void) {
        let status = PHPhotoLibrary.authorizationStatus(for: .addOnly)
        
        guard status == .authorized || status == .limited else {
            completion(false, "Photo library access required")
            return
        }
        
        PHPhotoLibrary.shared().performChanges({
            let creationRequest = PHAssetChangeRequest.creationRequestForAsset(from: image)
            
            // Add location if available
            if let latString = metadata["latitude"] as? String,
               let lonString = metadata["longitude"] as? String,
               let lat = Double(latString),
               let lon = Double(lonString) {
                creationRequest.location = CLLocation(latitude: lat, longitude: lon)
            }
            
            // Add creation date
            if let timestampString = metadata["timestamp"] as? String,
               let date = ISO8601DateFormatter().date(from: timestampString) {
                creationRequest.creationDate = date
            }
            
        }) { success, error in
            DispatchQueue.main.async {
                if success {
                    completion(true, "Saved to Photos with metadata!")
                } else {
                    completion(false, error?.localizedDescription ?? "Failed to save")
                }
            }
        }
    }
}



