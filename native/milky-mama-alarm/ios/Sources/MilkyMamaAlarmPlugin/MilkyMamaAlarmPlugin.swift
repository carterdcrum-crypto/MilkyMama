import Foundation
import Capacitor

#if canImport(AlarmKit)
import AlarmKit
import SwiftUI
#endif

@objc(MilkyMamaAlarmPlugin)
public class MilkyMamaAlarmPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "MilkyMamaAlarmPlugin"
    public let jsName = "MilkyMamaAlarm"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "isAvailable", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "authorizationStatus", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "requestAuthorization", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "replaceSchedule", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "cancelAll", returnType: CAPPluginReturnPromise)
    ]

    @objc func isAvailable(_ call: CAPPluginCall) {
        #if canImport(AlarmKit)
        if #available(iOS 26.0, *) {
            call.resolve(["available": true, "engine": "AlarmKit"])
        } else {
            call.resolve(["available": false, "engine": "local-notifications"])
        }
        #else
        call.resolve(["available": false, "engine": "local-notifications"])
        #endif
    }

    @objc func authorizationStatus(_ call: CAPPluginCall) {
        #if canImport(AlarmKit)
        if #available(iOS 26.0, *) {
            let state = AlarmManager.shared.authorizationState
            call.resolve(["status": Self.statusName(state)])
            return
        }
        #endif
        call.resolve(["status": "unavailable"])
    }

    @objc func requestAuthorization(_ call: CAPPluginCall) {
        #if canImport(AlarmKit)
        if #available(iOS 26.0, *) {
            Task { @MainActor in
                do {
                    let state = try await AlarmManager.shared.requestAuthorization()
                    call.resolve(["status": Self.statusName(state)])
                } catch {
                    call.reject("Alarm authorization failed", nil, error)
                }
            }
            return
        }
        #endif
        call.resolve(["status": "unavailable"])
    }

    @objc func cancelAll(_ call: CAPPluginCall) {
        #if canImport(AlarmKit)
        if #available(iOS 26.0, *) {
            Task { @MainActor in
                let manager = AlarmManager.shared
                for alarm in manager.alarms {
                    try? manager.cancel(id: alarm.id)
                }
                call.resolve(["ok": true])
            }
            return
        }
        #endif
        call.resolve(["ok": true])
    }

    @objc func replaceSchedule(_ call: CAPPluginCall) {
        #if canImport(AlarmKit)
        if #available(iOS 26.0, *) {
            guard let raw = call.getArray("occurrences", JSObject.self) else {
                call.reject("Missing occurrences")
                return
            }

            let dates = raw.compactMap { item -> Date? in
                if let value = item["fireAt"] as? Double {
                    return Date(timeIntervalSince1970: value / 1000.0)
                }
                if let value = item["fireAt"] as? NSNumber {
                    return Date(timeIntervalSince1970: value.doubleValue / 1000.0)
                }
                return nil
            }
            .filter { $0.timeIntervalSinceNow > 1 }
            .prefix(48)

            Task { @MainActor in
                do {
                    let manager = AlarmManager.shared
                    guard manager.authorizationState == .authorized else {
                        call.reject("Alarm permission is required")
                        return
                    }

                    for alarm in manager.alarms {
                        try? manager.cancel(id: alarm.id)
                    }

                    var scheduled = 0
                    for fireDate in dates {
                        let alert = AlarmPresentation.Alert(title: "Time to Pump")
                        let presentation = AlarmPresentation(alert: alert)
                        let attributes = AlarmAttributes(
                            presentation: presentation,
                            metadata: PumpAlarmMetadata(kind: "pump"),
                            tintColor: .pink
                        )
                        let configuration = AlarmManager.AlarmConfiguration.alarm(
                            schedule: .fixed(fireDate),
                            attributes: attributes,
                            stopIntent: nil,
                            secondaryIntent: nil,
                            sound: .default
                        )
                        _ = try await manager.schedule(id: UUID(), configuration: configuration)
                        scheduled += 1
                    }

                    call.resolve(["ok": true, "scheduled": scheduled])
                } catch {
                    call.reject("Unable to schedule pumping alarms", nil, error)
                }
            }
            return
        }
        #endif
        call.reject("AlarmKit requires iOS 26 or later")
    }

    #if canImport(AlarmKit)
    @available(iOS 26.0, *)
    private static func statusName(_ state: AlarmManager.AuthorizationState) -> String {
        switch state {
        case .authorized: return "authorized"
        case .denied: return "denied"
        case .notDetermined: return "notDetermined"
        @unknown default: return "unknown"
        }
    }
    #endif
}

#if canImport(AlarmKit)
@available(iOS 26.0, *)
private struct PumpAlarmMetadata: AlarmMetadata {
    let kind: String
}
#endif
