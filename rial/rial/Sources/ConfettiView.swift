import SwiftUI

struct ConfettiView: View {
    @Binding var isShowing: Bool
    @State private var animate = false
    
    var body: some View {
        ZStack {
            if isShowing {
                ForEach(0..<30, id: \.self) { index in
                    ConfettiPiece(index: index, animate: $animate)
                }
            }
        }
        .onChange(of: isShowing) { newValue in
            if newValue {
                animate = false
                withAnimation(.easeOut(duration: 0.6)) {
                    animate = true
                }
                
                // Auto-hide after animation
                DispatchQueue.main.asyncAfter(deadline: .now() + 2.5) {
                    isShowing = false
                }
            }
        }
        .allowsHitTesting(false)
    }
}

struct ConfettiPiece: View {
    let index: Int
    @Binding var animate: Bool
    
    var randomColor: Color {
        let colors: [Color] = [.blue, .green, .purple, .orange, .pink, .yellow, .red]
        return colors[index % colors.count]
    }
    
    var body: some View {
        Circle()
            .fill(randomColor)
            .frame(width: 10, height: 10)
            .offset(
                x: animate ? CGFloat.random(in: -200...200) : 0,
                y: animate ? CGFloat.random(in: -400...600) : -50
            )
            .opacity(animate ? 0 : 1)
            .rotationEffect(.degrees(animate ? Double.random(in: 0...720) : 0))
            .animation(
                .easeOut(duration: Double.random(in: 1.5...2.5))
                .delay(Double(index) * 0.02),
                value: animate
            )
    }
}

// Simplified confetti for better performance
struct SimpleConfettiView: View {
    @Binding var isShowing: Bool
    @State private var opacity: Double = 1.0
    
    var body: some View {
        ZStack {
            if isShowing {
                Text("🎉")
                    .font(.system(size: 100))
                    .opacity(opacity)
                    .scaleEffect(opacity)
            }
        }
        .onChange(of: isShowing) { newValue in
            if newValue {
                opacity = 1.0
                withAnimation(.easeOut(duration: 1.0)) {
                    opacity = 0
                }
                
                DispatchQueue.main.asyncAfter(deadline: .now() + 1.5) {
                    isShowing = false
                }
            }
        }
        .allowsHitTesting(false)
    }
}



