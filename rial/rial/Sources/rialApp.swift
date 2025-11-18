import SwiftUI

@main
struct rialApp: App {
    init() {
        // Request location permission for Anti-AI proof
        ProofCollector.shared.requestLocationPermission()
        print("📍 Location permission requested for Anti-AI proof")
    }
    
    var body: some Scene {
        WindowGroup {
            ContentView()
        }
    }
}
