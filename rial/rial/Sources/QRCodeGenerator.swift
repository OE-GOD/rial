import SwiftUI
import CoreImage
import CoreImage.CIFilterBuiltins

struct QRCodeGenerator {
    static func generateQRCode(from string: String) -> UIImage? {
        let context = CIContext()
        let filter = CIFilter.qrCodeGenerator()
        
        filter.message = Data(string.utf8)
        filter.correctionLevel = "H"
        
        guard let qrCodeImage = filter.outputImage else { return nil }
        
        // Scale up the QR code
        let transform = CGAffineTransform(scaleX: 10, y: 10)
        let scaledQRCode = qrCodeImage.transformed(by: transform)
        
        // Convert to UIImage
        guard let cgImage = context.createCGImage(scaledQRCode, from: scaledQRCode.extent) else { return nil }
        
        return UIImage(cgImage: cgImage)
    }
    
    static func generateQRCodeWithLogo(from string: String, logo: UIImage? = nil) -> UIImage? {
        guard let qrCode = generateQRCode(from: string) else { return nil }
        
        if let logo = logo {
            return addLogoToQRCode(qrCode: qrCode, logo: logo)
        }
        
        return qrCode
    }
    
    private static func addLogoToQRCode(qrCode: UIImage, logo: UIImage) -> UIImage? {
        let size = qrCode.size
        let logoSize = CGSize(width: size.width * 0.25, height: size.height * 0.25)
        
        UIGraphicsBeginImageContextWithOptions(size, false, 0)
        
        // Draw QR code
        qrCode.draw(in: CGRect(origin: .zero, size: size))
        
        // Add white background for logo
        let logoBackgroundSize = CGSize(width: logoSize.width * 1.2, height: logoSize.height * 1.2)
        let logoBackgroundOrigin = CGPoint(
            x: (size.width - logoBackgroundSize.width) / 2,
            y: (size.height - logoBackgroundSize.height) / 2
        )
        
        let backgroundPath = UIBezierPath(
            roundedRect: CGRect(origin: logoBackgroundOrigin, size: logoBackgroundSize),
            cornerRadius: logoBackgroundSize.width * 0.1
        )
        UIColor.white.setFill()
        backgroundPath.fill()
        
        // Draw logo
        let logoOrigin = CGPoint(
            x: (size.width - logoSize.width) / 2,
            y: (size.height - logoSize.height) / 2
        )
        logo.draw(in: CGRect(origin: logoOrigin, size: logoSize))
        
        let finalImage = UIGraphicsGetImageFromCurrentImageContext()
        UIGraphicsEndImageContext()
        
        return finalImage
    }
}

struct QRCodeView: View {
    let verificationLink: String
    @State private var qrCodeImage: UIImage?
    
    var body: some View {
        VStack(spacing: 20) {
            if let qrCodeImage = qrCodeImage {
                Image(uiImage: qrCodeImage)
                    .interpolation(.none)
                    .resizable()
                    .aspectRatio(1, contentMode: .fit)
                    .frame(maxWidth: 250)
                    .padding()
                    .background(Color.white)
                    .cornerRadius(20)
                    .shadow(radius: 10)
            } else {
                ProgressView()
                    .frame(width: 250, height: 250)
            }
            
            VStack(spacing: 8) {
                Text("Scan to Verify")
                    .font(.headline)
                
                Text(verificationLink)
                    .font(.caption)
                    .foregroundColor(.secondary)
                    .lineLimit(2)
                    .truncationMode(.middle)
                    .padding(.horizontal)
            }
            
            Button(action: shareQRCode) {
                Label("Share QR Code", systemImage: "square.and.arrow.up")
                    .frame(maxWidth: .infinity)
            }
            .buttonStyle(.borderedProminent)
            .padding(.horizontal)
        }
        .padding()
        .onAppear {
            generateQRCode()
        }
    }
    
    private func generateQRCode() {
        DispatchQueue.global(qos: .userInitiated).async {
            let qrCode = QRCodeGenerator.generateQRCode(from: verificationLink)
            DispatchQueue.main.async {
                self.qrCodeImage = qrCode
            }
        }
    }
    
    private func shareQRCode() {
        guard let qrCodeImage = qrCodeImage else { return }
        
        let items: [Any] = [
            qrCodeImage,
            "Verify this image: \(verificationLink)"
        ]
        
        if let windowScene = UIApplication.shared.connectedScenes.first as? UIWindowScene,
           let window = windowScene.windows.first,
           let rootViewController = window.rootViewController {
            let activityController = UIActivityViewController(activityItems: items, applicationActivities: nil)
            rootViewController.present(activityController, animated: true)
        }
        
        UINotificationFeedbackGenerator().notificationOccurred(.success)
    }
}
