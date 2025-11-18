import Foundation
import CoreLocation
import CoreMotion
import AVFoundation
import UIKit
import CryptoKit

/**
 * ProofMetadata - Comprehensive data to prove image is real (not AI-generated)
 *
 * Collects:
 * - Camera hardware info (only real devices have this)
 * - GPS location (optional, proves physical location)
 * - Device movement data (proves real-world physics)
 * - App Attest token (proves genuine app on real device)
 */
struct ProofMetadata: Codable {
    // Camera Information
    let cameraModel: String          // e.g., "iPhone 15 Pro"
    let sensorInfo: String            // Camera sensor details
    let lensAperture: String?        // f-stop value
    let focalLength: String?         // Lens focal length
    let iso: Int?                    // ISO sensitivity
    
    // Location (Optional - user consent required)
    let latitude: Double?
    let longitude: Double?
    let altitude: Double?
    let locationAccuracy: Double?
    let locationTimestamp: String?
    
    // Device Movement (Proves real-world physics)
    let accelerometerX: Double?
    let accelerometerY: Double?
    let accelerometerZ: Double?
    let gyroX: Double?
    let gyroY: Double?
    let gyroZ: Double?
    let movementTimestamp: String?
    
    // App Attestation
    let appAttestToken: String?      // Apple App Attest token
    let deviceModel: String          // e.g., "iPhone15,2"
    let osVersion: String            // e.g., "iOS 17.1"
    let appVersion: String           // App build version
    
    // Capture timestamp
    let captureTimestamp: String     // ISO 8601 format
    
    /**
     * Compute hash of all metadata for on-chain storage
     */
    func computeHash() -> Data {
        let encoder = JSONEncoder()
        encoder.outputFormatting = .sortedKeys
        guard let jsonData = try? encoder.encode(self) else {
            return Data()
        }
        return SHA256.hash(data: jsonData).data
    }
}

/**
 * ProofCollector - Collects all anti-AI proof data
 */
class ProofCollector: NSObject, CLLocationManagerDelegate {
    
    static let shared = ProofCollector()
    
    private let locationManager = CLLocationManager()
    private let motionManager = CMMotionManager()
    
    var locationPermissionGranted = false
    var currentLocation: CLLocation?
    
    private var accelerometerData: CMAccelerometerData?
    private var gyroData: CMGyroData?
    
    private override init() {
        super.init()
        setupLocationManager()
        setupMotionManager()
    }
    
    // MARK: - Setup
    
    private func setupLocationManager() {
        locationManager.delegate = self
        locationManager.desiredAccuracy = kCLLocationAccuracyBest
    }
    
    private func setupMotionManager() {
        if motionManager.isAccelerometerAvailable {
            motionManager.accelerometerUpdateInterval = 0.1
        }
        if motionManager.isGyroAvailable {
            motionManager.gyroUpdateInterval = 0.1
        }
    }
    
    // MARK: - Permission Requests
    
    func requestLocationPermission() {
        locationManager.requestWhenInUseAuthorization()
    }
    
    // MARK: - Data Collection
    
    /**
     * Collect comprehensive proof metadata at time of photo capture
     * Fast collection with 500ms timeout for motion sensors
     */
    func collectProofMetadata(
        captureDevice: AVCaptureDevice?,
        completion: @escaping (ProofMetadata) -> Void
    ) {
        // Start collecting motion data
        startMotionUpdates()
        
        // Wait briefly for motion sensors to collect data (max 500ms)
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.5) { [weak self] in
            guard let self = self else { return }
            
            // Collect camera info (instant)
            let cameraInfo = self.collectCameraInfo(device: captureDevice)
            
            // Collect location (instant - uses cached location)
            let locationInfo = self.collectLocationInfo()
            
            // Collect motion data (should have data by now)
            let motionInfo = self.collectMotionInfo()
            
            // Collect device/app info (instant)
            let deviceInfo = self.collectDeviceInfo()
            
            // Get App Attest token (instant - if available)
            let attestToken = AppAttestManager.shared.getAttestation()?.base64EncodedString()
            
            let metadata = ProofMetadata(
                // Camera
                cameraModel: cameraInfo.model,
                sensorInfo: cameraInfo.sensor,
                lensAperture: cameraInfo.aperture,
                focalLength: cameraInfo.focalLength,
                iso: cameraInfo.iso,
                
                // Location
                latitude: locationInfo.latitude,
                longitude: locationInfo.longitude,
                altitude: locationInfo.altitude,
                locationAccuracy: locationInfo.accuracy,
                locationTimestamp: locationInfo.timestamp,
                
                // Motion
                accelerometerX: motionInfo.accelX,
                accelerometerY: motionInfo.accelY,
                accelerometerZ: motionInfo.accelZ,
                gyroX: motionInfo.gyroX,
                gyroY: motionInfo.gyroY,
                gyroZ: motionInfo.gyroZ,
                movementTimestamp: motionInfo.timestamp,
                
                // App/Device
                appAttestToken: attestToken,
                deviceModel: deviceInfo.model,
                osVersion: deviceInfo.osVersion,
                appVersion: deviceInfo.appVersion,
                
                // Timestamp
                captureTimestamp: ISO8601DateFormatter().string(from: Date())
            )
            
            self.stopMotionUpdates()
            completion(metadata)
        }
    }
    
    // MARK: - Private Helpers
    
    private func collectCameraInfo(device: AVCaptureDevice?) -> (
        model: String,
        sensor: String,
        aperture: String?,
        focalLength: String?,
        iso: Int?
    ) {
        guard let device = device else {
            return (
                model: UIDevice.current.model,
                sensor: "Unknown",
                aperture: nil,
                focalLength: nil,
                iso: nil
            )
        }
        
        let model = device.localizedName
        let sensor = "\(device.deviceType.rawValue)"
        
        // Get lens info if available
        var aperture: String?
        var focalLength: String?
        if #available(iOS 13.0, *) {
            if let lensApertureValue = device.lensAperture as? Float {
                aperture = String(format: "f/%.1f", lensApertureValue)
            }
        }
        
        // Note: ISO and other EXIF data collected during actual capture
        
        return (
            model: model,
            sensor: sensor,
            aperture: aperture,
            focalLength: focalLength,
            iso: nil // Will be set during capture
        )
    }
    
    private func collectLocationInfo() -> (
        latitude: Double?,
        longitude: Double?,
        altitude: Double?,
        accuracy: Double?,
        timestamp: String?
    ) {
        guard locationPermissionGranted,
              let location = currentLocation else {
            return (nil, nil, nil, nil, nil)
        }
        
        return (
            latitude: location.coordinate.latitude,
            longitude: location.coordinate.longitude,
            altitude: location.altitude,
            accuracy: location.horizontalAccuracy,
            timestamp: ISO8601DateFormatter().string(from: location.timestamp)
        )
    }
    
    private func collectMotionInfo() -> (
        accelX: Double?,
        accelY: Double?,
        accelZ: Double?,
        gyroX: Double?,
        gyroY: Double?,
        gyroZ: Double?,
        timestamp: String?
    ) {
        let accelX = accelerometerData?.acceleration.x
        let accelY = accelerometerData?.acceleration.y
        let accelZ = accelerometerData?.acceleration.z
        
        let gyroX = gyroData?.rotationRate.x
        let gyroY = gyroData?.rotationRate.y
        let gyroZ = gyroData?.rotationRate.z
        
        let timestamp = accelerometerData != nil ? ISO8601DateFormatter().string(from: Date()) : nil
        
        return (accelX, accelY, accelZ, gyroX, gyroY, gyroZ, timestamp)
    }
    
    private func collectDeviceInfo() -> (
        model: String,
        osVersion: String,
        appVersion: String
    ) {
        var systemInfo = utsname()
        uname(&systemInfo)
        let modelCode = withUnsafePointer(to: &systemInfo.machine) {
            $0.withMemoryRebound(to: CChar.self, capacity: 1) {
                ptr in String(validatingUTF8: ptr)
            }
        }
        
        let osVersion = "\(UIDevice.current.systemName) \(UIDevice.current.systemVersion)"
        let appVersion = Bundle.main.infoDictionary?["CFBundleShortVersionString"] as? String ?? "1.0"
        
        return (
            model: modelCode ?? UIDevice.current.model,
            osVersion: osVersion,
            appVersion: appVersion
        )
    }
    
    private func startMotionUpdates() {
        if motionManager.isAccelerometerAvailable {
            motionManager.startAccelerometerUpdates(to: .main) { [weak self] data, error in
                guard error == nil else { return }
                self?.accelerometerData = data
            }
        }
        
        if motionManager.isGyroAvailable {
            motionManager.startGyroUpdates(to: .main) { [weak self] data, error in
                guard error == nil else { return }
                self?.gyroData = data
            }
        }
    }
    
    private func stopMotionUpdates() {
        motionManager.stopAccelerometerUpdates()
        motionManager.stopGyroUpdates()
    }
    
    // MARK: - CLLocationManagerDelegate
    
    func locationManagerDidChangeAuthorization(_ manager: CLLocationManager) {
        switch manager.authorizationStatus {
        case .authorizedWhenInUse, .authorizedAlways:
            locationPermissionGranted = true
            locationManager.startUpdatingLocation()
        case .denied, .restricted:
            locationPermissionGranted = false
        case .notDetermined:
            break
        @unknown default:
            break
        }
    }
    
    func locationManager(_ manager: CLLocationManager, didUpdateLocations locations: [CLLocation]) {
        currentLocation = locations.last
    }
    
    func locationManager(_ manager: CLLocationManager, didFailWithError error: Error) {
        print("Location error: \(error.localizedDescription)")
    }
}

// MARK: - SHA256 Extension

import CryptoKit

extension SHA256.Digest {
    var data: Data {
        Data(self)
    }
}

