//
//  ErrorReporter.swift
//  rial
//
//  Error reporting and crash analytics
//

import Foundation
import UIKit

class ErrorReporter {
    static let shared = ErrorReporter()
    
    private var errorLog: [ErrorRecord] = []
    private let maxErrors = 1000
    
    private init() {}
    
    /// Report error
    func report(error: Error, context: String = "", severity: ErrorSeverity = .error) {
        let record = ErrorRecord(
            error: error,
            context: context,
            severity: severity,
            timestamp: Date(),
            appVersion: Bundle.main.infoDictionary?["CFBundleShortVersionString"] as? String ?? "unknown",
            osVersion: UIDevice.current.systemVersion
        )
        
        errorLog.append(record)
        
        // Keep only recent errors
        if errorLog.count > maxErrors {
            errorLog.removeFirst()
        }
        
        // Log to console
        let icon = severity == .critical ? "🔥" : severity == .error ? "❌" : "⚠️"
        print("\(icon) Error [\(context)]: \(error.localizedDescription)")
        
        // In production, send to analytics service
        if severity == .critical {
            sendToAnalytics(record)
        }
    }
    
    /// Get error summary
    func getSummary() -> ErrorSummary {
        let now = Date()
        let oneHourAgo = now.addingTimeInterval(-3600)
        
        let recentErrors = errorLog.filter { $0.timestamp > oneHourAgo }
        
        var byContext: [String: Int] = [:]
        for error in recentErrors {
            byContext[error.context] = (byContext[error.context] ?? 0) + 1
        }
        
        return ErrorSummary(
            totalErrors: errorLog.count,
            recentErrors: recentErrors.count,
            criticalErrors: errorLog.filter { $0.severity == .critical }.count,
            topContexts: byContext.sorted { $0.value > $1.value }.prefix(5).map { $0 }
        )
    }
    
    /// Clear error log
    func clearLog() {
        errorLog.removeAll()
        print("✅ Error log cleared")
    }
    
    private func sendToAnalytics(_ record: ErrorRecord) {
        // In production, send to Sentry, Firebase, etc.
        print("📊 Sending critical error to analytics...")
    }
}

enum ErrorSeverity: String, Codable {
    case warning
    case error
    case critical
}

struct ErrorRecord: Codable {
    let error: String
    let context: String
    let severity: ErrorSeverity
    let timestamp: Date
    let appVersion: String
    let osVersion: String
    
    init(error: Error, context: String, severity: ErrorSeverity, timestamp: Date, appVersion: String, osVersion: String) {
        self.error = error.localizedDescription
        self.context = context
        self.severity = severity
        self.timestamp = timestamp
        self.appVersion = appVersion
        self.osVersion = osVersion
    }
}

struct ErrorSummary {
    let totalErrors: Int
    let recentErrors: Int
    let criticalErrors: Int
    let topContexts: [(key: String, value: Int)]
    
    var description: String {
        """
        Error Summary:
        • Total: \(totalErrors)
        • Recent (1h): \(recentErrors)
        • Critical: \(criticalErrors)
        
        Top Contexts:
        \(topContexts.map { "• \($0.key): \($0.value)" }.joined(separator: "\n"))
        """
    }
}

