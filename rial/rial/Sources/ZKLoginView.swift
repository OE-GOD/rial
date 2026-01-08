//
//  ZKLoginView.swift
//  rial
//
//  Zero-Knowledge Proof Login Interface
//

import SwiftUI

struct ZKLoginView: View {
    @State private var username: String = ""
    @State private var password: String = ""
    @State private var isLoading = false
    @State private var showAlert = false
    @State private var alertTitle = ""
    @State private var alertMessage = ""
    @State private var isRegistering = false
    @Environment(\.presentationMode) var presentationMode
    
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
            
            VStack(spacing: 30) {
                // Logo/Title
                VStack(spacing: 12) {
                    Image(systemName: "lock.shield.fill")
                        .font(.system(size: 60))
                        .foregroundColor(.blue)
                    
                    Text("Zero-Knowledge Login")
                        .font(.system(size: 28, weight: .bold))
                        .foregroundColor(.white)
                    
                    Text("Your password never leaves your device")
                        .font(.system(size: 14))
                        .foregroundColor(.white.opacity(0.7))
                        .multilineTextAlignment(.center)
                }
                .padding(.bottom, 20)
                
                // Login Form
                VStack(spacing: 16) {
                    // Username
                    TextField("Username", text: $username)
                        .textFieldStyle(RoundedBorderTextFieldStyle())
                        .autocapitalization(.none)
                        .padding(.horizontal, 20)
                    
                    // Password
                    SecureField("Password", text: $password)
                        .textFieldStyle(RoundedBorderTextFieldStyle())
                        .padding(.horizontal, 20)
                    
                    // Login Button
                    Button(action: handleLogin) {
                        HStack {
                            if isLoading {
                                ProgressView()
                                    .progressViewStyle(CircularProgressViewStyle(tint: .white))
                            } else {
                                Image(systemName: "lock.open.fill")
                                Text(isRegistering ? "Register" : "Login with ZK Proof")
                                    .fontWeight(.semibold)
                            }
                        }
                        .frame(maxWidth: .infinity)
                        .padding()
                        .background(
                            LinearGradient(
                                gradient: Gradient(colors: [Color.blue, Color.purple]),
                                startPoint: .leading,
                                endPoint: .trailing
                            )
                        )
                        .foregroundColor(.white)
                        .cornerRadius(12)
                    }
                    .disabled(isLoading || username.isEmpty || password.isEmpty)
                    .padding(.horizontal, 20)
                    
                    // Toggle Register/Login
                    Button(action: {
                        isRegistering.toggle()
                    }) {
                        Text(isRegistering ? "Already have an account? Login" : "New user? Register")
                            .font(.system(size: 14))
                            .foregroundColor(.white.opacity(0.8))
                    }
                }
                
                // Info Card
                VStack(alignment: .leading, spacing: 12) {
                    HStack {
                        Image(systemName: "checkmark.shield.fill")
                            .foregroundColor(.green)
                        Text("Zero-Knowledge Security")
                            .font(.headline)
                            .foregroundColor(.white)
                    }
                    
                    VStack(alignment: .leading, spacing: 8) {
                        InfoRow(icon: "eye.slash.fill", text: "Password never sent to server")
                        InfoRow(icon: "lock.fill", text: "Cryptographic proof only")
                        InfoRow(icon: "shield.fill", text: "Even we can't see your password")
                    }
                }
                .padding()
                .background(Color.white.opacity(0.1))
                .cornerRadius(12)
                .padding(.horizontal, 20)
                
                Spacer()
            }
            .padding(.top, 60)
        }
        .alert(isPresented: $showAlert) {
            Alert(
                title: Text(alertTitle),
                message: Text(alertMessage),
                dismissButton: .default(Text("OK")) {
                    if alertTitle.contains("Success") {
                        presentationMode.wrappedValue.dismiss()
                    }
                }
            )
        }
    }
    
    private func handleLogin() {
        isLoading = true
        
        if isRegistering {
            // Register
            ZKAuthManager.shared.register(
                username: username,
                password: password
            ) { result in
                isLoading = false
                
                switch result {
                case .success(let response):
                    alertTitle = "Success!"
                    alertMessage = """
                    Registered with zero-knowledge proof!
                    
                    User ID: \(response.userId)
                    
                    Your password is secured with cryptographic commitment.
                    Even we can't see it!
                    """
                    showAlert = true
                    
                case .failure(let error):
                    alertTitle = "Registration Failed"
                    alertMessage = error.localizedDescription
                    showAlert = true
                }
            }
        } else {
            // Login
            ZKAuthManager.shared.login(
                username: username,
                password: password
            ) { result in
                isLoading = false
                
                switch result {
                case .success(let response):
                    alertTitle = "Login Successful!"
                    alertMessage = """
                    Authenticated with zero-knowledge proof!
                    
                    Session token: \(response.sessionToken.prefix(20))...
                    Expires in: \(response.expiresIn / 3600) hours
                    
                    Your password was NEVER sent to the server!
                    """
                    showAlert = true
                    
                case .failure(let error):
                    alertTitle = "Login Failed"
                    alertMessage = error.localizedDescription
                    showAlert = true
                }
            }
        }
    }
}

struct InfoRow: View {
    let icon: String
    let text: String
    
    var body: some View {
        HStack(spacing: 8) {
            Image(systemName: icon)
                .font(.system(size: 12))
                .foregroundColor(.green)
            Text(text)
                .font(.system(size: 12))
                .foregroundColor(.white.opacity(0.9))
        }
    }
}

struct ZKLoginView_Previews: PreviewProvider {
    static var previews: some View {
        ZKLoginView()
    }
}

