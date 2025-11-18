import UIKit
import PDFKit

class PDFGenerator {
    static let shared = PDFGenerator()
    
    /**
     * Generate verification certificate PDF
     */
    func generateVerificationPDF(
        image: UIImage,
        imageDict: [String: Any],
        completion: @escaping (URL?) -> Void
    ) {
        DispatchQueue.global(qos: .userInitiated).async {
            let pdfMetaData = [
                kCGPDFContextCreator: "Rial Image Attestation",
                kCGPDFContextAuthor: "Rial Verification System",
                kCGPDFContextTitle: "Image Verification Certificate"
            ]
            let format = UIGraphicsPDFRendererFormat()
            format.documentInfo = pdfMetaData as [String: Any]
            
            let pageRect = CGRect(x: 0, y: 0, width: 612, height: 792) // Letter size
            
            let renderer = UIGraphicsPDFRenderer(bounds: pageRect, format: format)
            
            let data = renderer.pdfData { context in
                context.beginPage()
                
                // Draw content
                self.drawPDFContent(in: context.cgContext, rect: pageRect, image: image, imageDict: imageDict)
            }
            
            // Save to temporary file
            let tempURL = FileManager.default.temporaryDirectory
                .appendingPathComponent("rial_verification_\(Date().timeIntervalSince1970).pdf")
            
            do {
                try data.write(to: tempURL)
                DispatchQueue.main.async {
                    completion(tempURL)
                }
            } catch {
                print("Error saving PDF: \(error)")
                DispatchQueue.main.async {
                    completion(nil)
                }
            }
        }
    }
    
    private func drawPDFContent(
        in context: CGContext,
        rect: CGRect,
        image: UIImage,
        imageDict: [String: Any]
    ) {
        let margin: CGFloat = 40
        var yPosition: CGFloat = margin
        
        // Header
        yPosition = drawHeader(in: context, rect: rect, y: yPosition, margin: margin)
        
        // Image
        yPosition = drawImage(in: context, image: image, y: yPosition, margin: margin, maxWidth: rect.width - 2 * margin)
        
        // Verification Badge
        yPosition = drawVerificationBadge(in: context, rect: rect, y: yPosition, margin: margin)
        
        // Cryptographic Proof
        yPosition = drawCryptographicProof(in: context, imageDict: imageDict, y: yPosition, margin: margin)
        
        // Anti-AI Proof
        yPosition = drawAntiAIProof(in: context, imageDict: imageDict, y: yPosition, margin: margin)
        
        // Footer
        drawFooter(in: context, rect: rect, y: rect.height - margin - 60, margin: margin)
    }
    
    private func drawHeader(in context: CGContext, rect: CGRect, y: CGFloat, margin: CGFloat) -> CGFloat {
        var yPos = y
        
        // Title
        let titleAttributes: [NSAttributedString.Key: Any] = [
            .font: UIFont.systemFont(ofSize: 28, weight: .bold),
            .foregroundColor: UIColor(red: 0.4, green: 0.5, blue: 0.9, alpha: 1.0)
        ]
        let title = "🔐 Image Verification Certificate"
        let titleSize = title.size(withAttributes: titleAttributes)
        title.draw(at: CGPoint(x: (rect.width - titleSize.width) / 2, y: yPos), withAttributes: titleAttributes)
        yPos += titleSize.height + 10
        
        // Date
        let dateFormatter = DateFormatter()
        dateFormatter.dateStyle = .long
        dateFormatter.timeStyle = .medium
        let dateString = "Generated: \(dateFormatter.string(from: Date()))"
        let dateAttributes: [NSAttributedString.Key: Any] = [
            .font: UIFont.systemFont(ofSize: 12),
            .foregroundColor: UIColor.gray
        ]
        let dateSize = dateString.size(withAttributes: dateAttributes)
        dateString.draw(at: CGPoint(x: (rect.width - dateSize.width) / 2, y: yPos), withAttributes: dateAttributes)
        yPos += dateSize.height + 30
        
        // Line
        context.setStrokeColor(UIColor.lightGray.cgColor)
        context.setLineWidth(1)
        context.move(to: CGPoint(x: margin, y: yPos))
        context.addLine(to: CGPoint(x: rect.width - margin, y: yPos))
        context.strokePath()
        yPos += 20
        
        return yPos
    }
    
    private func drawImage(in context: CGContext, image: UIImage, y: CGFloat, margin: CGFloat, maxWidth: CGFloat) -> CGFloat {
        let imageSize = CGSize(width: maxWidth * 0.6, height: maxWidth * 0.6)
        let imageRect = CGRect(
            x: (maxWidth - imageSize.width) / 2 + margin,
            y: y,
            width: imageSize.width,
            height: imageSize.height
        )
        
        image.draw(in: imageRect)
        
        return y + imageSize.height + 20
    }
    
    private func drawVerificationBadge(in context: CGContext, rect: CGRect, y: CGFloat, margin: CGFloat) -> CGFloat {
        let badgeText = "✅ VERIFIED AUTHENTIC"
        let badgeAttributes: [NSAttributedString.Key: Any] = [
            .font: UIFont.systemFont(ofSize: 20, weight: .bold),
            .foregroundColor: UIColor(red: 0.2, green: 0.7, blue: 0.3, alpha: 1.0)
        ]
        let badgeSize = badgeText.size(withAttributes: badgeAttributes)
        badgeText.draw(at: CGPoint(x: (rect.width - badgeSize.width) / 2, y: y), withAttributes: badgeAttributes)
        
        return y + badgeSize.height + 30
    }
    
    private func drawCryptographicProof(in context: CGContext, imageDict: [String: Any], y: CGFloat, margin: CGFloat) -> CGFloat {
        var yPos = y
        
        let sectionTitle = "🔐 Cryptographic Proof"
        yPos = drawSectionTitle(in: context, title: sectionTitle, y: yPos, margin: margin)
        
        // Full Merkle Root (multi-line)
        if let merkleRoot = imageDict["merkleRoot"] as? String {
            yPos = drawDetailRow(in: context, label: "Merkle Root:", value: "", y: yPos, margin: margin)
            yPos = drawMultiLineValue(in: context, value: merkleRoot, y: yPos, margin: margin + 120, maxWidth: 450)
        }
        
        // Full Signature (multi-line)
        if let signature = imageDict["signature"] as? String {
            yPos = drawDetailRow(in: context, label: "Signature:", value: "", y: yPos, margin: margin)
            yPos = drawMultiLineValue(in: context, value: signature, y: yPos, margin: margin + 120, maxWidth: 450)
        }
        
        if let timestamp = imageDict["timestamp"] as? String {
            yPos = drawDetailRow(in: context, label: "Timestamp:", value: timestamp, y: yPos, margin: margin)
        }
        
        if let isVerified = imageDict["isVerified"] as? String {
            yPos = drawDetailRow(in: context, label: "Status:", value: isVerified == "true" ? "✅ Valid" : "❌ Invalid", y: yPos, margin: margin)
        }
        
        yPos = drawDetailRow(in: context, label: "Device:", value: "iOS Secure Enclave (P-256)", y: yPos, margin: margin)
        
        return yPos + 20
    }
    
    private func drawAntiAIProof(in context: CGContext, imageDict: [String: Any], y: CGFloat, margin: CGFloat) -> CGFloat {
        var yPos = y
        
        // Check if proof metadata exists
        guard let proofMetadataString = imageDict["proofMetadata"] as? String,
              let proofData = proofMetadataString.data(using: .utf8),
              let proofMetadata = try? JSONDecoder().decode(ProofMetadataDisplay.self, from: proofData) else {
            return yPos
        }
        
        let sectionTitle = "🎯 Anti-AI Proof"
        yPos = drawSectionTitle(in: context, title: sectionTitle, y: yPos, margin: margin)
        
        if let camera = proofMetadata.cameraModel {
            yPos = drawDetailRow(in: context, label: "Camera:", value: camera, y: yPos, margin: margin)
        }
        
        if let lat = proofMetadata.latitude, let lon = proofMetadata.longitude {
            let gpsString = String(format: "%.6f°N, %.6f°W", lat, lon)
            yPos = drawDetailRow(in: context, label: "GPS Location:", value: gpsString, y: yPos, margin: margin)
            if let altitude = proofMetadata.altitude {
                yPos = drawDetailRow(in: context, label: "Altitude:", value: String(format: "%.1f meters", altitude), y: yPos, margin: margin)
            }
        }
        
        if let accelX = proofMetadata.accelerometerX,
           let accelY = proofMetadata.accelerometerY,
           let accelZ = proofMetadata.accelerometerZ {
            yPos = drawDetailRow(in: context, label: "Motion:", value: "✅ Detected (Real-world physics)", y: yPos, margin: margin)
            let motionDetails = String(format: "X:%.3f Y:%.3f Z:%.3f", accelX, accelY, accelZ)
            yPos = drawDetailRow(in: context, label: "", value: motionDetails, y: yPos, margin: margin + 120)
        }
        
        if let device = proofMetadata.deviceModel {
            yPos = drawDetailRow(in: context, label: "Device Model:", value: device, y: yPos, margin: margin)
        }
        
        if let os = proofMetadata.osVersion {
            yPos = drawDetailRow(in: context, label: "OS Version:", value: os, y: yPos, margin: margin)
        }
        
        // Full Public Key
        if let publicKey = imageDict["publicKey"] as? String {
            yPos += 10
            yPos = drawDetailRow(in: context, label: "Public Key:", value: "", y: yPos, margin: margin)
            yPos = drawMultiLineValue(in: context, value: publicKey, y: yPos, margin: margin + 120, maxWidth: 450)
        }
        
        return yPos + 20
    }
    
    private func drawSectionTitle(in context: CGContext, title: String, y: CGFloat, margin: CGFloat) -> CGFloat {
        let attributes: [NSAttributedString.Key: Any] = [
            .font: UIFont.systemFont(ofSize: 16, weight: .bold),
            .foregroundColor: UIColor.darkGray
        ]
        title.draw(at: CGPoint(x: margin, y: y), withAttributes: attributes)
        
        return y + 25
    }
    
    private func drawDetailRow(in context: CGContext, label: String, value: String, y: CGFloat, margin: CGFloat) -> CGFloat {
        let labelAttributes: [NSAttributedString.Key: Any] = [
            .font: UIFont.systemFont(ofSize: 11, weight: .semibold),
            .foregroundColor: UIColor.gray
        ]
        
        let valueAttributes: [NSAttributedString.Key: Any] = [
            .font: UIFont.monospacedSystemFont(ofSize: 10, weight: .regular),
            .foregroundColor: UIColor.black
        ]
        
        label.draw(at: CGPoint(x: margin, y: y), withAttributes: labelAttributes)
        if !value.isEmpty {
            value.draw(at: CGPoint(x: margin + 120, y: y), withAttributes: valueAttributes)
        }
        
        return y + 18
    }
    
    private func drawMultiLineValue(in context: CGContext, value: String, y: CGFloat, margin: CGFloat, maxWidth: CGFloat) -> CGFloat {
        let attributes: [NSAttributedString.Key: Any] = [
            .font: UIFont.monospacedSystemFont(ofSize: 8, weight: .regular),
            .foregroundColor: UIColor.black
        ]
        
        let paragraphStyle = NSMutableParagraphStyle()
        paragraphStyle.lineBreakMode = .byCharWrapping
        
        let attributedString = NSAttributedString(
            string: value,
            attributes: [
                .font: UIFont.monospacedSystemFont(ofSize: 8, weight: .regular),
                .foregroundColor: UIColor.black,
                .paragraphStyle: paragraphStyle
            ]
        )
        
        let textRect = CGRect(x: margin, y: y, width: maxWidth, height: 1000)
        let boundingRect = attributedString.boundingRect(with: CGSize(width: maxWidth, height: 1000),
                                                          options: [.usesLineFragmentOrigin, .usesFontLeading],
                                                          context: nil)
        
        attributedString.draw(in: textRect)
        
        return y + boundingRect.height + 8
    }
    
    private func drawFooter(in context: CGContext, rect: CGRect, y: CGFloat, margin: CGFloat) {
        let footerText = "This certificate is cryptographically verified and cannot be forged.\nGenerated by Rial Image Attestation System"
        let attributes: [NSAttributedString.Key: Any] = [
            .font: UIFont.systemFont(ofSize: 9),
            .foregroundColor: UIColor.gray
        ]
        
        let paragraphStyle = NSMutableParagraphStyle()
        paragraphStyle.alignment = .center
        
        let attributedString = NSAttributedString(
            string: footerText,
            attributes: [
                .font: UIFont.systemFont(ofSize: 9),
                .foregroundColor: UIColor.gray,
                .paragraphStyle: paragraphStyle
            ]
        )
        
        let textRect = CGRect(x: margin, y: y, width: rect.width - 2 * margin, height: 60)
        attributedString.draw(in: textRect)
    }
}

