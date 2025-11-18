import SwiftUI
import MapKit

struct MapView: View {
    @Environment(\.dismiss) private var dismiss
    @State private var certifiedImages: [[String: Any]] = []
    @State private var region = MKCoordinateRegion(
        center: CLLocationCoordinate2D(latitude: 37.7749, longitude: -122.4194),
        span: MKCoordinateSpan(latitudeDelta: 0.1, longitudeDelta: 0.1)
    )
    @State private var selectedImageIndex: Int?
    @State private var showingDetail = false
    
    var imageLocations: [ImageLocation] {
        var locations: [ImageLocation] = []
        
        for (index, imageDict) in certifiedImages.enumerated() {
            // Try to get GPS from proof metadata
            if let proofMetadataString = imageDict["proofMetadata"] as? String,
               let proofData = proofMetadataString.data(using: .utf8),
               let proofMetadata = try? JSONDecoder().decode(ProofMetadataDisplay.self, from: proofData),
               let lat = proofMetadata.latitude,
               let lon = proofMetadata.longitude {
                
                let location = ImageLocation(
                    index: index,
                    coordinate: CLLocationCoordinate2D(latitude: lat, longitude: lon),
                    timestamp: imageDict["timestamp"] as? String ?? "Unknown"
                )
                locations.append(location)
            }
        }
        
        return locations
    }
    
    var body: some View {
        NavigationView {
            ZStack {
                // Map
                Map(coordinateRegion: $region, annotationItems: imageLocations) { location in
                    MapAnnotation(coordinate: location.coordinate) {
                        Button(action: {
                            selectedImageIndex = location.index
                            showingDetail = true
                            UIImpactFeedbackGenerator(style: .light).impactOccurred()
                        }) {
                            ZStack {
                                Circle()
                                    .fill(Color.blue)
                                    .frame(width: 40, height: 40)
                                    .shadow(radius: 4)
                                
                                Image(systemName: "photo.fill")
                                    .foregroundColor(.white)
                                    .font(.system(size: 16))
                            }
                        }
                    }
                }
                .ignoresSafeArea()
                
                // Info overlay
                VStack {
                    Spacer()
                    
                    if !imageLocations.isEmpty {
                        HStack {
                            Image(systemName: "map.fill")
                                .foregroundColor(.blue)
                            Text("\(imageLocations.count) images with GPS")
                                .font(.caption)
                                .foregroundColor(.secondary)
                        }
                        .padding(.horizontal, 16)
                        .padding(.vertical, 8)
                        .background(
                            Capsule()
                                .fill(Color(UIColor.systemBackground))
                                .shadow(radius: 4)
                        )
                        .padding(.bottom, 20)
                    } else {
                        VStack(spacing: 12) {
                            Image(systemName: "map")
                                .font(.system(size: 50))
                                .foregroundColor(.gray)
                            
                            Text("No GPS Locations")
                                .font(.headline)
                            
                            Text("Enable location in Settings to see images on the map")
                                .font(.caption)
                                .foregroundColor(.secondary)
                                .multilineTextAlignment(.center)
                                .padding(.horizontal)
                        }
                        .padding()
                        .background(
                            RoundedRectangle(cornerRadius: 16)
                                .fill(Color(UIColor.systemBackground))
                                .shadow(radius: 10)
                        )
                        .padding()
                    }
                }
            }
            .navigationTitle("Photo Map")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .navigationBarLeading) {
                    Button("Done") {
                        dismiss()
                    }
                }
                
                ToolbarItem(placement: .navigationBarTrailing) {
                    Button(action: centerOnLocations) {
                        Image(systemName: "location.fill")
                    }
                    .disabled(imageLocations.isEmpty)
                }
            }
            .onAppear {
                loadImages()
                centerOnLocations()
            }
            .sheet(isPresented: $showingDetail) {
                if let selectedIndex = selectedImageIndex,
                   selectedIndex < certifiedImages.count {
                    ImageDetailView(imageDict: certifiedImages[selectedIndex])
                }
            }
        }
    }
    
    private func loadImages() {
        certifiedImages = PersistenceController.shared.getCertifiedImages()
    }
    
    private func centerOnLocations() {
        guard !imageLocations.isEmpty else { return }
        
        // Calculate bounding box
        var minLat = imageLocations[0].coordinate.latitude
        var maxLat = imageLocations[0].coordinate.latitude
        var minLon = imageLocations[0].coordinate.longitude
        var maxLon = imageLocations[0].coordinate.longitude
        
        for location in imageLocations {
            minLat = min(minLat, location.coordinate.latitude)
            maxLat = max(maxLat, location.coordinate.latitude)
            minLon = min(minLon, location.coordinate.longitude)
            maxLon = max(maxLon, location.coordinate.longitude)
        }
        
        let center = CLLocationCoordinate2D(
            latitude: (minLat + maxLat) / 2,
            longitude: (minLon + maxLon) / 2
        )
        
        let span = MKCoordinateSpan(
            latitudeDelta: max(maxLat - minLat, 0.01) * 1.5,
            longitudeDelta: max(maxLon - minLon, 0.01) * 1.5
        )
        
        withAnimation {
            region = MKCoordinateRegion(center: center, span: span)
        }
    }
}

struct ImageLocation: Identifiable {
    let id = UUID()
    let index: Int
    let coordinate: CLLocationCoordinate2D
    let timestamp: String
}

struct MapView_Previews: PreviewProvider {
    static var previews: some View {
        MapView()
    }
}



