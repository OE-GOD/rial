//
//  CameraViewController.swift
//  rial
//
//  Created by Sofiane Larbi on 2/16/24.
//

import UIKit
import SwiftUI
import AVFoundation

typealias CaptureCompletion = (_ image: AttestedImage?, _ error: Error?)->Void
typealias VideoRecordingCompletion = (_ videoURL: URL?, _ attestation: VideoAttestation?, _ error: Error?) -> Void

// Video Attestation Model
struct VideoAttestation: Codable {
    let id: String
    let mode: String
    let frameCount: Int
    let duration: Double
    let startHash: String
    let endHash: String
    let chainIntegrity: Bool
    let timestamp: Date
    var keyframes: [KeyframeData]?

    struct KeyframeData: Codable {
        let index: Int
        let timestamp: Double
        let hash: String
    }
}

class CameraViewController: UIViewController {
    private var permissionGranted = false // Flag for permission
    private let captureSession = AVCaptureSession()
    private let sessionQueue = DispatchQueue(label: "sessionQueue")
    private var previewLayer = AVCaptureVideoPreviewLayer()
    private let settings = AVCapturePhotoSettings()
    private let photoOutput = AVCapturePhotoOutput()
    private let movieOutput = AVCaptureMovieFileOutput()
    var screenRect: CGRect! = nil // For view dimensions
    var captureCompletion: CaptureCompletion? = nil
    var videoCompletion: VideoRecordingCompletion? = nil

    // Video recording state
    var isRecording = false
    var recordingStartTime: Date?
    private var recordedVideoURL: URL?

    // Store capture device for proof metadata
    private var currentCaptureDevice: AVCaptureDevice?

    // Audio input for video
    private var audioInput: AVCaptureDeviceInput?
    
    override func viewDidLoad() {
        checkPermission()
        
        sessionQueue.async { [unowned self] in
            guard permissionGranted else { return }
            self.setupCaptureSession()
            self.captureSession.startRunning()
        }
    }
    
    override func willTransition(to newCollection: UITraitCollection, with coordinator: UIViewControllerTransitionCoordinator) {
        screenRect = UIScreen.main.bounds
        self.previewLayer.frame = CGRect(x: 0, y: 0, width: screenRect.size.width, height: screenRect.size.height)

        switch UIDevice.current.orientation {
            // Home button on top
            case UIDeviceOrientation.portraitUpsideDown:
                self.previewLayer.connection?.videoOrientation = .portraitUpsideDown
             
            // Home button on right
            case UIDeviceOrientation.landscapeLeft:
                self.previewLayer.connection?.videoOrientation = .landscapeRight
            
            // Home button on left
            case UIDeviceOrientation.landscapeRight:
                self.previewLayer.connection?.videoOrientation = .landscapeLeft
             
            // Home button at bottom
            case UIDeviceOrientation.portrait:
                self.previewLayer.connection?.videoOrientation = .portrait
                
            default:
                break
            }
    }
    
    func checkPermission() {
        switch AVCaptureDevice.authorizationStatus(for: .video) {
            // Permission has been granted before
            case .authorized:
                permissionGranted = true
                
            // Permission has not been requested yet
            case .notDetermined:
                requestPermission()
                    
            default:
                permissionGranted = false
            }
    }
    
    func requestPermission() {
        sessionQueue.suspend()
        AVCaptureDevice.requestAccess(for: .video) { [unowned self] granted in
            self.permissionGranted = granted
            self.sessionQueue.resume()
        }
    }
 
    func setupCaptureSession() {
        // Camera input
        guard let videoDevice = AVCaptureDevice.default(.builtInDualCamera,for: .video, position: .back) else {
            print("Can't capture from device")
            return
        }

        // Store for proof metadata collection
        self.currentCaptureDevice = videoDevice

        guard let videoDeviceInput = try? AVCaptureDeviceInput(device: videoDevice) else {
            print("Can't find video input")
            return
        }

        guard captureSession.canAddInput(videoDeviceInput) else {
            print("Can't add input")
            return
        }

        captureSession.addInput(videoDeviceInput)

        // Add photo output
        if captureSession.canAddOutput(photoOutput) {
            captureSession.addOutput(photoOutput)
        }

        // Add video/movie output
        if captureSession.canAddOutput(movieOutput) {
            captureSession.addOutput(movieOutput)
            // Set max duration to 60 seconds
            movieOutput.maxRecordedDuration = CMTime(seconds: 60, preferredTimescale: 600)
            print("📹 Video recording enabled")
        }

        // Add audio input for video recording
        if let audioDevice = AVCaptureDevice.default(for: .audio) {
            do {
                let audioInput = try AVCaptureDeviceInput(device: audioDevice)
                if captureSession.canAddInput(audioInput) {
                    captureSession.addInput(audioInput)
                    self.audioInput = audioInput
                    print("🎤 Audio input added")
                }
            } catch {
                print("⚠️ Could not add audio input: \(error)")
            }
        }

        // Preview layer
        screenRect = UIScreen.main.bounds

        previewLayer = AVCaptureVideoPreviewLayer(session: captureSession)
        previewLayer.frame = CGRect(x: 0, y: 0, width: screenRect.size.width, height: screenRect.size.height)
        previewLayer.videoGravity = AVLayerVideoGravity.resizeAspectFill // Fill screen
        previewLayer.connection?.videoOrientation = .portrait

        // Updates to UI must be on main queue
        DispatchQueue.main.async { [weak self] in
            guard let self = self else { return }
            self.view.layer.addSublayer(self.previewLayer)
        }
    }
    
    func capturePhoto(captureCompletion: @escaping CaptureCompletion) {
        self.captureCompletion = captureCompletion
        let settings = AVCapturePhotoSettings()
        photoOutput.capturePhoto(with: settings, delegate: self)
    }

    // MARK: - Video Recording

    func startRecording(completion: @escaping VideoRecordingCompletion) {
        guard !isRecording else {
            print("⚠️ Already recording")
            return
        }

        self.videoCompletion = completion

        // Create temp file URL for video
        let tempDir = FileManager.default.temporaryDirectory
        let fileName = "rial_video_\(Date().timeIntervalSince1970).mov"
        let fileURL = tempDir.appendingPathComponent(fileName)

        // Remove existing file if any
        try? FileManager.default.removeItem(at: fileURL)

        recordedVideoURL = fileURL
        recordingStartTime = Date()
        isRecording = true

        print("📹 Starting video recording to: \(fileURL)")
        movieOutput.startRecording(to: fileURL, recordingDelegate: self)
    }

    func stopRecording() {
        guard isRecording else {
            print("⚠️ Not currently recording")
            return
        }

        print("📹 Stopping video recording...")
        movieOutput.stopRecording()
    }

    // Extract keyframes from video for ZK attestation
    private func extractKeyframes(from videoURL: URL, completion: @escaping ([[String: Any]]) -> Void) {
        let asset = AVAsset(url: videoURL)
        let duration = CMTimeGetSeconds(asset.duration)

        // Extract keyframes at regular intervals (every 0.5 seconds, max 20 frames)
        let interval = max(0.5, duration / 20.0)
        var keyframes: [[String: Any]] = []

        let imageGenerator = AVAssetImageGenerator(asset: asset)
        imageGenerator.appliesPreferredTrackTransform = true
        imageGenerator.maximumSize = CGSize(width: 256, height: 256) // Small for hashing

        var times: [NSValue] = []
        var currentTime: Double = 0
        while currentTime < duration {
            times.append(NSValue(time: CMTime(seconds: currentTime, preferredTimescale: 600)))
            currentTime += interval
        }

        var extractedCount = 0
        let totalCount = times.count

        imageGenerator.generateCGImagesAsynchronously(forTimes: times) { requestedTime, image, actualTime, result, error in
            if let cgImage = image {
                let uiImage = UIImage(cgImage: cgImage)
                if let imageData = uiImage.jpegData(compressionQuality: 0.5) {
                    let base64Data = imageData.base64EncodedString()
                    let timestampMs = Int(CMTimeGetSeconds(actualTime) * 1000)
                    keyframes.append([
                        "data": base64Data,
                        "timestamp": timestampMs
                    ])
                }
            }

            extractedCount += 1
            if extractedCount == totalCount {
                print("📊 Extracted \(keyframes.count) keyframes from video")
                completion(keyframes)
            }
        }
    }

    // Submit video to backend for ZK attestation
    private func submitVideoForAttestation(keyframes: [[String: Any]], duration: Double, completion: @escaping (VideoAttestation?) -> Void) {
        let backendURL = ProverManager.shared.getBackendURL()
        guard let url = URL(string: "\(backendURL)/api/zkvideo/attest/keyframes") else {
            print("❌ Invalid backend URL")
            completion(nil)
            return
        }

        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.timeoutInterval = 30

        let payload: [String: Any] = [
            "frames": keyframes,
            "metadata": [
                "source": "ios_app",
                "device": UIDevice.current.model,
                "duration": duration,
                "fps": Double(keyframes.count) / duration
            ]
        ]

        do {
            request.httpBody = try JSONSerialization.data(withJSONObject: payload)
        } catch {
            print("❌ Failed to serialize video payload: \(error)")
            completion(nil)
            return
        }

        print("📤 Submitting video keyframes to backend...")
        URLSession.shared.dataTask(with: request) { data, response, error in
            if let error = error {
                print("❌ Video attestation request failed: \(error)")
                completion(nil)
                return
            }

            guard let data = data else {
                print("❌ No data received from video attestation")
                completion(nil)
                return
            }

            do {
                if let json = try JSONSerialization.jsonObject(with: data) as? [String: Any],
                   let success = json["success"] as? Bool, success,
                   let attestationData = json["attestation"] as? [String: Any] {
                    let attestation = VideoAttestation(
                        id: attestationData["id"] as? String ?? "",
                        mode: attestationData["mode"] as? String ?? "keyframe",
                        frameCount: attestationData["frameCount"] as? Int ?? keyframes.count,
                        duration: attestationData["duration"] as? Double ?? duration,
                        startHash: attestationData["startHash"] as? String ?? "",
                        endHash: attestationData["endHash"] as? String ?? "",
                        chainIntegrity: attestationData["chainIntegrity"] as? Bool ?? false,
                        timestamp: Date(),
                        keyframes: nil
                    )
                    print("✅ Video attestation received: \(attestation.id)")
                    completion(attestation)
                } else {
                    print("❌ Invalid video attestation response")
                    completion(nil)
                }
            } catch {
                print("❌ Failed to parse video attestation: \(error)")
                completion(nil)
            }
        }.resume()
    }
}

// MARK: - Video Recording Delegate
extension CameraViewController: AVCaptureFileOutputRecordingDelegate {
    func fileOutput(_ output: AVCaptureFileOutput, didStartRecordingTo fileURL: URL, from connections: [AVCaptureConnection]) {
        print("📹 Recording started: \(fileURL)")
        DispatchQueue.main.async {
            self.isRecording = true
        }
    }

    func fileOutput(_ output: AVCaptureFileOutput, didFinishRecordingTo outputFileURL: URL, from connections: [AVCaptureConnection], error: Error?) {
        DispatchQueue.main.async {
            self.isRecording = false
        }

        if let error = error {
            print("❌ Recording failed: \(error)")
            videoCompletion?(nil, nil, error)
            return
        }

        let duration = recordingStartTime.map { Date().timeIntervalSince($0) } ?? 0
        print("✅ Recording finished: \(outputFileURL) (duration: \(String(format: "%.1f", duration))s)")

        // Extract keyframes and submit for attestation
        extractKeyframes(from: outputFileURL) { [weak self] keyframes in
            guard !keyframes.isEmpty else {
                print("❌ No keyframes extracted")
                self?.videoCompletion?(outputFileURL, nil, nil)
                return
            }

            self?.submitVideoForAttestation(keyframes: keyframes, duration: duration) { attestation in
                DispatchQueue.main.async {
                    self?.videoCompletion?(outputFileURL, attestation, nil)
                }
            }
        }
    }
}

extension CameraViewController: AVCapturePhotoCaptureDelegate {
    

    func cropImage(_ inputImage: UIImage, toRect cropRect: CGRect) -> UIImage?
    {


        // Scale cropRect to handle images larger than shown-on-screen size
        let cropZone = CGRect(x:cropRect.origin.x * inputImage.scale,
                              y:cropRect.origin.y * inputImage.scale,
                              width:cropRect.size.width * inputImage.scale,
                              height:cropRect.size.height * inputImage.scale)


        // Perform cropping in Core Graphics
        guard let cutImageRef: CGImage = inputImage.cgImage?.cropping(to:cropZone)
        else {
            return nil
        }


        // Return image to UIImage
        let croppedImage: UIImage = UIImage(cgImage: cutImageRef, scale: inputImage.scale, orientation: .up)
        return croppedImage
    }
    
    public func photoOutput(_ output: AVCapturePhotoOutput, didFinishProcessingPhoto photo: AVCapturePhoto, error: Error?) {
        guard let imageData = photo.fileDataRepresentation(),
            let image = UIImage(data: imageData) else {
            print("Image capture failed")
            captureCompletion?(nil, error)
            return
        }
        
        // First, correct the orientation
        let orientedImage = image.correctlyOriented()
        
        // Crop to square from the center
        guard let croppedImage = cropImage(orientedImage, toRect: CGRect(
            x: 0,
            y: orientedImage.size.height / 2 - orientedImage.size.width / 2,
            width: orientedImage.size.width,
            height: orientedImage.size.width
        )) else {
            print("Failed to crop image")
            captureCompletion?(nil, NSError(domain: "CameraViewController", code: -1, userInfo: [NSLocalizedDescriptionKey: "Failed to crop image"]))
            return
        }
        
        // Resize to higher quality (1024x1024)
        guard let cgImage = croppedImage.cgImage,
              let resizedCGImage = cgImage.resize(size: CGSize(width: 1024, height: 1024)) else {
            print("Failed to resize image")
            captureCompletion?(nil, NSError(domain: "CameraViewController", code: -1, userInfo: [NSLocalizedDescriptionKey: "Failed to resize image"]))
            return
        }
        
        // Create final image with upright orientation
        let normalizedImage = UIImage(cgImage: resizedCGImage, scale: 1.0, orientation: .up)
        
        // 🔐 COLLECT ANTI-AI PROOF METADATA
        // Check if metadata collection is enabled
        let enableMetadata = UserDefaults.standard.object(forKey: "enableLocation") as? Bool ?? true
        
        if enableMetadata {
            print("📊 Collecting anti-AI proof metadata (fast mode)...")
            ProofCollector.shared.collectProofMetadata(captureDevice: self.currentCaptureDevice) { proofMetadata in
                print("✅ Proof metadata collected:")
                print("   - Camera: \(proofMetadata.cameraModel)")
                print("   - GPS: \(proofMetadata.latitude != nil ? "Enabled" : "Disabled")")
                print("   - Motion: \(proofMetadata.accelerometerX != nil ? "Captured" : "None")")
                print("   - App Attest: \(proofMetadata.appAttestToken != nil ? "Present" : "None")")
                
                // Create AttestedImage with proof metadata
                var attestedImage = AttestedImage(image: normalizedImage, c2paClaim: nil, proofMetadata: proofMetadata)
                
                // Attest the image with cryptographic signature
                AuthenticityManager.shared.attestImage(attestedImage) { result in
                    switch result {
                    case .success(var attestedImageWithClaim):
                        // Make sure proof metadata is included
                        attestedImageWithClaim.proofMetadata = proofMetadata
                        
                        print("Successfully attested image!")
                        print("Image Root: \(attestedImageWithClaim.c2paClaim?.imageRoot ?? "nil")")
                        print("🎯 With Anti-AI Proof: ✅")
                        
                        // Pass the complete AttestedImage with proof
                        self.captureCompletion?(attestedImageWithClaim, nil)
                        
                    case .failure(let error):
                        print("Attestation failed: \(error)")
                        self.captureCompletion?(nil, error)
                    }
                }
            }
        } else {
            // Fast mode - no metadata collection
            print("⚡ Fast mode - skipping metadata collection")
            var attestedImage = AttestedImage(image: normalizedImage, c2paClaim: nil, proofMetadata: nil)
            
            AuthenticityManager.shared.attestImage(attestedImage) { result in
                switch result {
                case .success(let attestedImageWithClaim):
                    print("Successfully attested image!")
                    print("Image Root: \(attestedImageWithClaim.c2paClaim?.imageRoot ?? "nil")")
                    self.captureCompletion?(attestedImageWithClaim, nil)
                    
                case .failure(let error):
                    print("Attestation failed: \(error)")
                    self.captureCompletion?(nil, error)
                }
            }
        }
    }
}

struct HostedCameraViewController: UIViewControllerRepresentable {
    typealias UIViewControllerType = CameraViewController

    @ObservedObject var viewModel: ImageCaptureViewModel

    func makeUIViewController(context: Context) -> CameraViewController {
        viewModel.cameraVC
    }

    func updateUIViewController(_ uiViewController: CameraViewController, context: Context) { }
}

extension CGImage {
    func resize(size:CGSize) -> CGImage? {
        let width: Int = Int(size.width)
        let height: Int = Int(size.height)

        let bytesPerPixel = self.bitsPerPixel / self.bitsPerComponent
        let destBytesPerRow = width * bytesPerPixel


        guard let colorSpace = self.colorSpace else { return nil }
        guard let context = CGContext(data: nil, width: width, height: height, bitsPerComponent: self.bitsPerComponent, bytesPerRow: destBytesPerRow, space: colorSpace, bitmapInfo: self.alphaInfo.rawValue) else { return nil }

        context.interpolationQuality = .high
        context.draw(self, in: CGRect(x: 0, y: 0, width: width, height: height))

        return context.makeImage()
    }
}

extension UIImage {
    var base64: String? {
        self.jpegData(compressionQuality: 1)?.base64EncodedString()
    }

    func correctlyOriented() -> UIImage {
        if imageOrientation == .up {
            return self
        }

        UIGraphicsBeginImageContextWithOptions(size, false, scale)
        draw(in: CGRect(origin: .zero, size: size))
        let normalizedImage = UIGraphicsGetImageFromCurrentImageContext()!
        UIGraphicsEndImageContext()

        return normalizedImage
    }

    func getTiles(tileSize: CGSize) -> [Data] {
        guard let cgImage = self.cgImage else { return [] }
        
        let imageWidth = cgImage.width
        let imageHeight = cgImage.height
        
        let tileWidth = Int(tileSize.width)
        let tileHeight = Int(tileSize.height)
        
        var tiles = [Data]()
        
        for y in stride(from: 0, to: imageHeight, by: tileHeight) {
            for x in stride(from: 0, to: imageWidth, by: tileWidth) {
                let rect = CGRect(x: x, y: y, width: min(tileWidth, imageWidth - x), height: min(tileHeight, imageHeight - y))
                
                if let croppedCgImage = cgImage.cropping(to: rect) {
                    let tileImage = UIImage(cgImage: croppedCgImage)
                    if let tileData = tileImage.pngData() {
                        tiles.append(tileData)
                    }
                }
            }
        }
        
        return tiles
    }
}

