import Foundation

struct RunProgress: Codable {
    static let mile = 1609.344
    static let maximumGap: TimeInterval = 20

    struct Point: Codable {
        let latitude: Double
        let longitude: Double
        let time: Date

        func distance(to other: Point) -> Double {
            let rad = Double.pi / 180
            let lat = (other.latitude - latitude) * rad
            let lon = (other.longitude - longitude) * rad
            let h = pow(sin(lat / 2), 2)
                + cos(latitude * rad) * cos(other.latitude * rad) * pow(sin(lon / 2), 2)
            return 12_742_000 * asin(sqrt(min(1, h)))
        }
    }

    struct Split: Codable {
        let mile: Int
        let seconds: TimeInterval
        let totalSeconds: TimeInterval
        let estimated: Bool
    }

    struct Cue {
        var label = ""
        var speech = ""
    }

    var id = UUID().uuidString
    let requestedAt: Date
    let turnMiles: Double
    var voice: Bool
    var startedAt: Date?
    var stoppedAt: Date?
    var interrupted = false
    var meters = 0.0
    var points: [Point] = []
    var splits: [Split] = []
    var lastFix: Date?
    var lastLabel = ""

    var busy: Bool { stoppedAt == nil }

    func elapsed(at now: Date) -> TimeInterval {
        guard let startedAt else { return 0 }
        return max(0, (stoppedAt ?? now).timeIntervalSince(startedAt))
    }

    mutating func add(_ point: Point, accuracy: Double, now: Date) -> Cue? {
        guard busy, accuracy.isFinite, (0...30).contains(accuracy),
              point.time >= requestedAt, now.timeIntervalSince(point.time) <= Self.maximumGap else { return nil }
        if let lastFix, point.time <= lastFix { return nil }

        let gap = lastFix.map { point.time.timeIntervalSince($0) > Self.maximumGap } ?? false
        lastFix = point.time
        if gap { interrupted = true }
        guard let previous = points.last, let startedAt, !gap else {
            if self.startedAt == nil { self.startedAt = point.time }
            points.append(point)
            return nil
        }
        let step = previous.distance(to: point)
        let seconds = point.time.timeIntervalSince(previous.time)
        guard step >= 3, step / seconds <= 8 else { return nil }

        let before = meters
        meters += step
        points.append(point)
        func crossed(_ target: Double) -> Bool { before < target && target <= meters }
        func timeAt(_ target: Double) -> TimeInterval {
            previous.time.timeIntervalSince(startedAt) + seconds * (target - before) / step
        }

        var cue = Cue()
        if crossed(Self.mile / 2) {
            cue = Cue(label: "Half mile · \(Self.clock(timeAt(Self.mile / 2)))", speech: "Half mile.")
        }
        let next = splits.count + 1
        if crossed(Double(next) * Self.mile) {
            let total = timeAt(Double(next) * Self.mile)
            let lap = total - (splits.last?.totalSeconds ?? 0)
            let avg = total / Double(next)
            splits.append(Split(mile: next, seconds: lap, totalSeconds: total, estimated: interrupted))
            cue = Cue(
                label: "Mile \(next) · \(Self.clock(lap))/mi · \(Self.clock(total)) total · \(Self.clock(avg))/mi average",
                speech: "Mile \(next). Mile pace \(Self.spokenTime(lap)) per mile. Total time \(Self.spokenTime(total)). Average pace \(Self.spokenTime(avg)) per mile."
            )
        }
        if turnMiles > 0, crossed(turnMiles * Self.mile) {
            if cue.label.isEmpty { cue.label = "Turnaround reached." }
            cue.speech = "Turn around. " + cue.speech
        }
        guard !cue.speech.isEmpty else { return nil }
        lastLabel = cue.label
        return cue
    }

    static func clock(_ time: TimeInterval) -> String {
        let seconds = max(0, Int(time.rounded()))
        if seconds >= 3600 {
            return String(format: "%d:%02d:%02d", seconds / 3600, seconds % 3600 / 60, seconds % 60)
        }
        return String(format: "%d:%02d", seconds / 60, seconds % 60)
    }

    private static func spokenTime(_ time: TimeInterval) -> String {
        let seconds = max(0, Int(time.rounded()))
        let parts = [(seconds / 3600, "hour"), (seconds % 3600 / 60, "minute"), (seconds % 60, "second")]
        let spoken = parts.filter { $0.0 > 0 }.map { "\($0.0) \($0.1)\($0.0 == 1 ? "" : "s")" }
        return spoken.isEmpty ? "zero seconds" : spoken.joined(separator: " ")
    }
}
