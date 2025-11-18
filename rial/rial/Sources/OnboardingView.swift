import SwiftUI

struct OnboardingView: View {
    @Environment(\.dismiss) private var dismiss
    @State private var currentPage = 0
    
    var body: some View {
        ZStack {
            // Gradient background
            LinearGradient(
                gradient: Gradient(colors: [
                    Color(red: 0.1, green: 0.1, blue: 0.3),
                    Color(red: 0.2, green: 0.1, blue: 0.4)
                ]),
                startPoint: .topLeading,
                endPoint: .bottomTrailing
            )
            .ignoresSafeArea()
            
            VStack {
                // Page indicator
                HStack(spacing: 8) {
                    ForEach(0..<4) { index in
                        Circle()
                            .fill(currentPage == index ? Color.white : Color.white.opacity(0.3))
                            .frame(width: 8, height: 8)
                    }
                }
                .padding(.top, 20)
                
                TabView(selection: $currentPage) {
                    // Page 1: Welcome
                    OnboardingPage(
                        icon: "checkmark.seal.fill",
                        title: "Welcome to Rial",
                        description: "Prove your photos are real with cryptographic signatures and blockchain technology.",
                        color: .blue
                    )
                    .tag(0)
                    
                    // Page 2: How it works
                    OnboardingPage(
                        icon: "camera.fill",
                        title: "How It Works",
                        description: "Take a photo and we'll create a cryptographic proof using your iPhone's Secure Enclave. This proves it's real and not AI-generated.",
                        color: .purple
                    )
                    .tag(1)
                    
                    // Page 3: Permissions
                    OnboardingPage(
                        icon: "location.fill",
                        title: "Why Permissions?",
                        description: "We need:\n\n📸 Camera - To take photos\n📍 Location - Proves physical presence\n🎯 Motion - Proves real-world physics\n\nThis creates unbreakable proof!",
                        color: .green
                    )
                    .tag(2)
                    
                    // Page 4: Get Started
                    VStack(spacing: 30) {
                        Image(systemName: "star.fill")
                            .font(.system(size: 80))
                            .foregroundColor(.yellow)
                        
                        Text("You're All Set!")
                            .font(.system(size: 32, weight: .bold))
                            .foregroundColor(.white)
                        
                        Text("Start taking cryptographically verified photos that prove they're real!")
                            .font(.body)
                            .foregroundColor(.white.opacity(0.8))
                            .multilineTextAlignment(.center)
                            .padding(.horizontal)
                        
                        Button(action: {
                            markOnboardingComplete()
                            dismiss()
                        }) {
                            Text("Get Started")
                                .font(.headline)
                                .foregroundColor(.white)
                                .frame(maxWidth: .infinity)
                                .padding()
                                .background(
                                    LinearGradient(
                                        gradient: Gradient(colors: [.blue, .purple]),
                                        startPoint: .leading,
                                        endPoint: .trailing
                                    )
                                )
                                .cornerRadius(16)
                                .shadow(radius: 10)
                        }
                        .padding(.horizontal, 40)
                    }
                    .tag(3)
                }
                .tabViewStyle(.page(indexDisplayMode: .never))
                
                // Navigation buttons
                HStack {
                    if currentPage > 0 {
                        Button(action: {
                            withAnimation {
                                currentPage -= 1
                            }
                        }) {
                            Text("Back")
                                .foregroundColor(.white)
                                .padding()
                        }
                    }
                    
                    Spacer()
                    
                    if currentPage < 3 {
                        Button(action: {
                            withAnimation {
                                currentPage += 1
                            }
                        }) {
                            Text("Next")
                                .fontWeight(.semibold)
                                .foregroundColor(.white)
                                .padding(.horizontal, 30)
                                .padding(.vertical, 12)
                                .background(Color.white.opacity(0.2))
                                .cornerRadius(25)
                        }
                    } else {
                        Button(action: {
                            markOnboardingComplete()
                            dismiss()
                        }) {
                            Text("Skip")
                                .foregroundColor(.white.opacity(0.6))
                                .padding()
                        }
                    }
                }
                .padding(.horizontal)
                .padding(.bottom, 20)
            }
        }
        .interactiveDismissDisabled()
    }
    
    private func markOnboardingComplete() {
        UserDefaults.standard.set(true, forKey: "hasSeenOnboarding")
    }
}

struct OnboardingPage: View {
    let icon: String
    let title: String
    let description: String
    let color: Color
    
    var body: some View {
        VStack(spacing: 30) {
            Image(systemName: icon)
                .font(.system(size: 80))
                .foregroundColor(color)
            
            Text(title)
                .font(.system(size: 32, weight: .bold))
                .foregroundColor(.white)
            
            Text(description)
                .font(.body)
                .foregroundColor(.white.opacity(0.8))
                .multilineTextAlignment(.center)
                .padding(.horizontal, 40)
        }
    }
}

struct OnboardingView_Previews: PreviewProvider {
    static var previews: some View {
        OnboardingView()
    }
}



