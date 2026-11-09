@preconcurrency import AVFoundation
@preconcurrency import CoreLocation
import UIKit

@MainActor
final class RunTracker: NSObject, CLLocationManagerDelegate, AVSpeechSynthesizerDelegate {
    private let location = CLLocationManager()
    private let speech = AVSpeechSynthesizer()
    private let checkpoint: URL
    private var run: RunProgress?
    private var tracking = false
    private var status = ""
    private var lastCheckpoint = Date.distantPast
    private var currentCue: AVSpeechUtterance?

    override init() {
        checkpoint = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
            .appendingPathComponent("active-run.json")
        super.init()
        location.delegate = self
        location.activityType = .fitness
        location.desiredAccuracy = kCLLocationAccuracyBest
        location.distanceFilter = kCLDistanceFilterNone
        location.pausesLocationUpdatesAutomatically = false
        location.showsBackgroundLocationIndicator = true
        speech.delegate = self
        if let data = try? Data(contentsOf: checkpoint), var saved = try? JSONDecoder().decode(RunProgress.self, from: data) {
            if saved.busy {
                saved.stoppedAt = saved.lastFix ?? saved.requestedAt
                saved.interrupted = true
            }
            if saved.meters > 0 {
                run = saved
                status = saved.interrupted ? "GPS was interrupted. Tap Finish & Save." : "Tap Finish & Save to save your run."
            } else {
                try? FileManager.default.removeItem(at: checkpoint)
            }
        }
    }

    func command(_ body: [String: Any]) throws -> [String: Any] {
        switch body["action"] as? String {
        case "status":
            return snapshot()
        case "start":
            if run == nil, UIApplication.shared.applicationState == .active {
                let turn = body["turn"] as? Double ?? 0
                run = RunProgress(requestedAt: Date(), turnMiles: turn.isFinite ? max(0, turn) : 0,
                                  voice: body["voice"] as? Bool ?? true)
                configureLocation()
            }
            return snapshot()
        case "voice":
            run?.voice = body["enabled"] as? Bool ?? true
            if run?.voice == false { stopSpeech() }
            return snapshot()
        case "finish":
            if run?.busy == true { stop(at: Date()) }
            return snapshot(includeResult: true)
        case "saved":
            if let run, !run.busy, run.id == body["id"] as? String {
                if FileManager.default.fileExists(atPath: checkpoint.path) {
                    try FileManager.default.removeItem(at: checkpoint)
                }
                self.run = nil
                status = ""
            }
            return snapshot()
        default:
            throw CocoaError(.featureUnsupported)
        }
    }

    private func configureLocation() {
        guard run?.busy == true else { return }
        switch location.authorizationStatus {
        case .notDetermined:
            status = "Allow location access to start."
            location.requestWhenInUseAuthorization()
        case .authorizedAlways, .authorizedWhenInUse:
            if location.accuracyAuthorization == .reducedAccuracy {
                stop(at: Date(), message: "Turn on Precise Location for Marine Comeback in Settings.")
            } else if !tracking, UIApplication.shared.applicationState != .background {
                tracking = true
                status = "Getting GPS. Wait for “GPS tracking” before moving."
                location.allowsBackgroundLocationUpdates = true
                location.startUpdatingLocation()
            }
        default:
            stop(at: Date(), message: "Allow location access for Marine Comeback in Settings.")
        }
    }

    func locationManagerDidChangeAuthorization(_ manager: CLLocationManager) {
        configureLocation()
    }

    func locationManager(_ manager: CLLocationManager, didUpdateLocations locations: [CLLocation]) {
        guard tracking, var active = run, active.busy else { return }
        let now = Date()
        var latestCue: RunProgress.Cue?
        var cueTime: Date?
        for fix in locations {
            let point = RunProgress.Point(latitude: fix.coordinate.latitude, longitude: fix.coordinate.longitude, time: fix.timestamp)
            if let cue = active.add(point, accuracy: fix.horizontalAccuracy, now: now) {
                latestCue = cue
                cueTime = fix.timestamp
            }
        }
        run = active
        if active.startedAt != nil, now.timeIntervalSince(active.lastFix ?? .distantPast) <= RunProgress.maximumGap {
            status = active.interrupted ? "GPS tracking. Recorded distance may be short." : "GPS tracking. You can lock your iPhone."
        }
        if now.timeIntervalSince(lastCheckpoint) >= 5, active.startedAt != nil { persist() }
        if active.voice, let cue = latestCue, let cueTime, now.timeIntervalSince(cueTime) <= 10 {
            speak(cue.speech)
        }
    }

    func locationManager(_ manager: CLLocationManager, didFailWithError error: Error) {
        if (error as? CLError)?.code == .denied {
            stop(at: Date(), message: "Location access stopped. Check Settings.")
        }
    }

    private func stop(at date: Date, message: String? = nil) {
        guard var active = run, active.busy else { return }
        location.stopUpdatingLocation()
        location.allowsBackgroundLocationUpdates = false
        tracking = false
        stopSpeech()
        active.stoppedAt = date
        if message != nil || date.timeIntervalSince(active.lastFix ?? date) > RunProgress.maximumGap {
            active.interrupted = true
        }
        if active.meters > 0 {
            run = active
            status = message ?? "Tap Finish & Save to save your run."
            persist()
        } else {
            run = nil
            status = message ?? "No GPS distance recorded."
            try? FileManager.default.removeItem(at: checkpoint)
        }
    }

    private func persist() {
        guard let run else { return }
        do {
            try FileManager.default.createDirectory(at: checkpoint.deletingLastPathComponent(), withIntermediateDirectories: true)
            try JSONEncoder().encode(run).write(to: checkpoint, options: [.atomic, .completeFileProtectionUntilFirstUserAuthentication])
            lastCheckpoint = Date()
        } catch {
            NSLog("Could not checkpoint the active Marine Comeback run.")
        }
    }

    private func snapshot(includeResult: Bool = false) -> [String: Any] {
        guard let run else { return ["phase": "idle", "status": status] }
        let now = Date()
        let seconds = Int(run.elapsed(at: now))
        let phase = run.busy ? (run.startedAt == nil ? "acquiring" : "running") : "finished"
        let lost = run.busy && now.timeIntervalSince(run.lastFix ?? now) > RunProgress.maximumGap
        var value: [String: Any] = [
            "phase": phase, "id": run.id, "meters": run.meters, "seconds": seconds,
            "voice": run.voice, "turn": run.turnMiles, "split": run.lastLabel,
            "status": lost ? "GPS signal lost. Recorded distance may be short." : status
        ]
        if includeResult, let finished = run.stoppedAt {
            let miles = run.meters / RunProgress.mile
            value["record"] = [
                "nativeRunID": run.id, "distance": miles, "timeSeconds": seconds,
                "time": RunProgress.clock(Double(seconds)), "pace": RunProgress.clock(Double(seconds) / miles) + "/mi",
                "completedAt": ISO8601DateFormatter().string(from: finished), "source": "GPS",
                "gpsInterrupted": run.interrupted,
                "mileSplits": run.splits.map { ["mile": $0.mile, "seconds": $0.seconds, "totalSeconds": $0.totalSeconds, "estimated": $0.estimated] },
                "track": run.points.map { [($0.latitude * 1e6).rounded() / 1e6, ($0.longitude * 1e6).rounded() / 1e6] }
            ] as [String: Any]
        }
        return value
    }

    private func speak(_ text: String) {
        stopSpeech()
        let audio = AVAudioSession.sharedInstance()
        do {
            try audio.setCategory(.playback, mode: .default, options: [.duckOthers])
            try audio.setActive(true)
            let utterance = AVSpeechUtterance(string: text)
            currentCue = utterance
            speech.speak(utterance)
        } catch {
            NSLog("Marine Comeback could not start a spoken cue.")
        }
    }

    private func stopSpeech() {
        guard currentCue != nil else { return }
        currentCue = nil
        speech.stopSpeaking(at: .immediate)
        restoreMusic()
    }

    private func restoreMusic() {
        let audio = AVAudioSession.sharedInstance()
        do {
            try audio.setActive(false, options: [.notifyOthersOnDeactivation])
        } catch {
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.2) { [weak self] in
                guard let self, self.currentCue == nil else { return }
                try? AVAudioSession.sharedInstance().setActive(false, options: [.notifyOthersOnDeactivation])
            }
        }
    }

    nonisolated func speechSynthesizer(_ synthesizer: AVSpeechSynthesizer, didFinish utterance: AVSpeechUtterance) {
        let id = ObjectIdentifier(utterance)
        DispatchQueue.main.async { [weak self] in
            guard let self, let cue = self.currentCue, ObjectIdentifier(cue) == id else { return }
            self.currentCue = nil
            self.restoreMusic()
        }
    }

    nonisolated func speechSynthesizer(_ synthesizer: AVSpeechSynthesizer, didCancel utterance: AVSpeechUtterance) {
        speechSynthesizer(synthesizer, didFinish: utterance)
    }
}
