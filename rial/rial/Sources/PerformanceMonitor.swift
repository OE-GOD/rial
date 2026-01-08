//
//  PerformanceMonitor.swift
//  rial
//
//  Monitor app performance
//

import Foundation

class PerformanceMonitor {
    static let shared = PerformanceMonitor()
    
    private var metrics: [String: [TimeInterval]] = [:]
    
    private init() {}
    
    /// Start timing an operation
    func startTiming(_ operation: String) -> PerformanceTimer {
        return PerformanceTimer(operation: operation, monitor: self)
    }
    
    /// Record timing
    func recordTiming(_ operation: String, duration: TimeInterval) {
        if metrics[operation] == nil {
            metrics[operation] = []
        }
        metrics[operation]?.append(duration)
        
        // Keep only last 100 measurements
        if metrics[operation]!.count > 100 {
            metrics[operation]?.removeFirst()
        }
        
        print("⏱️ \(operation): \(String(format: "%.2f", duration * 1000))ms")
    }
    
    /// Get performance summary
    func getSummary() -> PerformanceSummary {
        var operations: [OperationMetrics] = []
        
        for (operation, timings) in metrics {
            guard !timings.isEmpty else { continue }
            
            let avg = timings.reduce(0, +) / Double(timings.count)
            let min = timings.min() ?? 0
            let max = timings.max() ?? 0
            
            operations.append(OperationMetrics(
                name: operation,
                count: timings.count,
                avgMs: avg * 1000,
                minMs: min * 1000,
                maxMs: max * 1000
            ))
        }
        
        return PerformanceSummary(operations: operations.sorted { $0.avgMs > $1.avgMs })
    }
    
    /// Reset metrics
    func reset() {
        metrics.removeAll()
        print("✅ Performance metrics reset")
    }
}

class PerformanceTimer {
    let operation: String
    let startTime: Date
    let monitor: PerformanceMonitor
    
    init(operation: String, monitor: PerformanceMonitor) {
        self.operation = operation
        self.startTime = Date()
        self.monitor = monitor
    }
    
    func stop() {
        let duration = Date().timeIntervalSince(startTime)
        monitor.recordTiming(operation, duration: duration)
    }
}

struct OperationMetrics {
    let name: String
    let count: Int
    let avgMs: Double
    let minMs: Double
    let maxMs: Double
}

struct PerformanceSummary {
    let operations: [OperationMetrics]
    
    var description: String {
        guard !operations.isEmpty else {
            return "No performance data yet"
        }
        
        var result = "Performance Summary:\n"
        for op in operations {
            result += """
            
            \(op.name):
            • Count: \(op.count)
            • Avg: \(String(format: "%.2f", op.avgMs))ms
            • Min: \(String(format: "%.2f", op.minMs))ms
            • Max: \(String(format: "%.2f", op.maxMs))ms
            """
        }
        return result
    }
}

