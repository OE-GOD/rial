import SwiftUI

struct FilterOptions {
    var dateRange: DateRangeFilter = .all
    var hasGPS: Bool? = nil // nil = all, true = with GPS, false = without GPS
    var hasMotion: Bool? = nil
    var verifiedOnly: Bool = false
}

enum DateRangeFilter: String, CaseIterable {
    case all = "All Time"
    case today = "Today"
    case week = "Last 7 Days"
    case month = "Last 30 Days"
    case custom = "Custom Range"
}

struct AdvancedFiltersView: View {
    @Binding var filters: FilterOptions
    @Environment(\.dismiss) private var dismiss
    @State private var customStartDate = Date().addingTimeInterval(-7*24*60*60)
    @State private var customEndDate = Date()
    
    var body: some View {
        NavigationView {
            Form {
                // Date Range Section
                Section {
                    Picker("Date Range", selection: $filters.dateRange) {
                        ForEach(DateRangeFilter.allCases, id: \.self) { range in
                            Text(range.rawValue).tag(range)
                        }
                    }
                    
                    if filters.dateRange == .custom {
                        DatePicker("From", selection: $customStartDate, displayedComponents: .date)
                        DatePicker("To", selection: $customEndDate, displayedComponents: .date)
                    }
                } header: {
                    Text("📅 Date Range")
                }
                
                // Location Section
                Section {
                    Picker("GPS Data", selection: Binding(
                        get: { filters.hasGPS == nil ? 0 : (filters.hasGPS == true ? 1 : 2) },
                        set: { filters.hasGPS = $0 == 0 ? nil : ($0 == 1 ? true : false) }
                    )) {
                        Text("All Images").tag(0)
                        Text("With GPS Only").tag(1)
                        Text("Without GPS").tag(2)
                    }
                } header: {
                    Text("📍 Location")
                }
                
                // Proof Strength Section
                Section {
                    Toggle("Verified Signatures Only", isOn: $filters.verifiedOnly)
                    
                    Picker("Motion Data", selection: Binding(
                        get: { filters.hasMotion == nil ? 0 : (filters.hasMotion == true ? 1 : 2) },
                        set: { filters.hasMotion = $0 == 0 ? nil : ($0 == 1 ? true : false) }
                    )) {
                        Text("All Images").tag(0)
                        Text("With Motion Only").tag(1)
                        Text("Without Motion").tag(2)
                    }
                } header: {
                    Text("🎯 Proof Strength")
                } footer: {
                    Text("Filter by anti-AI proof layers")
                }
                
                // Statistics
                Section {
                    let activeFilters = getActiveFilterCount()
                    HStack {
                        Text("Active Filters")
                        Spacer()
                        Text("\(activeFilters)")
                            .foregroundColor(.secondary)
                    }
                } header: {
                    Text("📊 Summary")
                }
                
                // Actions
                Section {
                    Button(action: resetFilters) {
                        HStack {
                            Image(systemName: "arrow.counterclockwise")
                            Text("Reset All Filters")
                        }
                    }
                }
            }
            .navigationTitle("Advanced Filters")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .navigationBarLeading) {
                    Button("Cancel") {
                        dismiss()
                    }
                }
                
                ToolbarItem(placement: .navigationBarTrailing) {
                    Button("Apply") {
                        dismiss()
                    }
                    .fontWeight(.semibold)
                }
            }
        }
    }
    
    private func getActiveFilterCount() -> Int {
        var count = 0
        if filters.dateRange != .all { count += 1 }
        if filters.hasGPS != nil { count += 1 }
        if filters.hasMotion != nil { count += 1 }
        if filters.verifiedOnly { count += 1 }
        return count
    }
    
    private func resetFilters() {
        filters = FilterOptions()
        UINotificationFeedbackGenerator().notificationOccurred(.success)
    }
}



