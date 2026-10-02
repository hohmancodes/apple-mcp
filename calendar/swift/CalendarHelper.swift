import EventKit
import Foundation

// MARK: - JSON Helpers

func jsonString(_ value: String) -> String {
    // Foundation escapes all JSON control characters, including those in app content.
    let data = try! JSONSerialization.data(withJSONObject: [value])
    let array = String(data: data, encoding: .utf8)!
    return String(array.dropFirst().dropLast())
}

func jsonStringOrNull(_ value: String?) -> String {
    guard let v = value, !v.isEmpty else { return "null" }
    return jsonString(v)
}

func exitWithError(_ message: String) -> Never {
    print("{\"error\":\(jsonString(message))}")
    exit(1)
}

// MARK: - Date Formatting

let iso8601Formatter: ISO8601DateFormatter = {
    let f = ISO8601DateFormatter()
    f.formatOptions = [.withInternetDateTime]
    return f
}()

let displayFormatter: DateFormatter = {
    let f = DateFormatter()
    f.dateFormat = "EEEE, d MMMM yyyy 'at' h:mm:ss a"
    f.locale = Locale(identifier: "en_GB")
    return f
}()

func parseISO(_ string: String) -> Date? {
    // Try standard ISO 8601 first
    if let d = iso8601Formatter.date(from: string) { return d }
    // Try without timezone (local time)
    let local = DateFormatter()
    local.dateFormat = "yyyy-MM-dd'T'HH:mm:ss"
    local.locale = Locale(identifier: "en_US_POSIX")
    return local.date(from: string)
}

// MARK: - EventKit Access

func requestAccess(store: EKEventStore) -> Bool {
    var granted = false
    let semaphore = DispatchSemaphore(value: 0)

    if #available(macOS 14.0, *) {
        store.requestFullAccessToEvents { g, _ in
            granted = g
            semaphore.signal()
        }
    } else {
        store.requestAccess(to: .event) { g, _ in
            granted = g
            semaphore.signal()
        }
    }
    semaphore.wait()
    return granted
}

// MARK: - Event JSON

func eventToJSON(_ event: EKEvent, includeDetails: Bool = false) -> String {
    var fields = [String]()
    fields.append("\"summary\":\(jsonString(event.title ?? ""))")
    fields.append("\"startDate\":\(jsonString(displayFormatter.string(from: event.startDate)))")
    fields.append("\"endDate\":\(jsonString(displayFormatter.string(from: event.endDate)))")
    fields.append("\"location\":\(jsonStringOrNull(event.location))")
    fields.append("\"calendar\":\(jsonString(event.calendar?.title ?? ""))")
    fields.append("\"uid\":\(jsonString(event.eventIdentifier ?? ""))")

    if includeDetails {
        fields.append("\"description\":\(jsonStringOrNull(event.notes))")
        fields.append("\"url\":\(jsonStringOrNull(event.url?.absoluteString))")
        fields.append("\"allDay\":\(event.isAllDay)")
        let alarmStrs: [String] = (event.alarms ?? []).compactMap { alarm in
            guard alarm.absoluteDate == nil else { return nil } // skip absolute-date alarms
            let offsetMinutes = Int(-alarm.relativeOffset / 60)
            return "{\"offsetMinutes\":\(offsetMinutes)}"
        }
        fields.append("\"alerts\":[\(alarmStrs.joined(separator: ","))]")
    }

    return "{\(fields.joined(separator: ","))}"
}

/// Deduplicate events by (title, startDate, endDate) tuple
func deduplicate(_ events: [EKEvent]) -> [EKEvent] {
    var seen = Set<String>()
    var result = [EKEvent]()
    for e in events {
        let key = "\(e.title ?? "")|\(e.startDate.timeIntervalSince1970)|\(e.endDate.timeIntervalSince1970)"
        if seen.insert(key).inserted {
            result.append(e)
        }
    }
    return result
}

/// Normalize smart quotes/apostrophes to ASCII for comparison
func normalizeQuotes(_ s: String) -> String {
    return s
        .replacingOccurrences(of: "\u{2018}", with: "'")  // left single
        .replacingOccurrences(of: "\u{2019}", with: "'")  // right single
        .replacingOccurrences(of: "\u{201C}", with: "\"") // left double
        .replacingOccurrences(of: "\u{201D}", with: "\"") // right double
}

// MARK: - Commands

func listCalendars(store: EKEventStore) {
    let calendars = store.calendars(for: .event)
    let items = calendars.map { cal -> String in
        let desc = cal.source?.title ?? ""
        return "{\"name\":\(jsonString(cal.title)),\"description\":\(jsonString(desc))}"
    }
    print("[\(items.joined(separator: ","))]")
}

func listEvents(store: EKEventStore, from: Date, to: Date, calendarName: String?) {
    var calendars: [EKCalendar]? = nil
    if let name = calendarName {
        let matched = store.calendars(for: .event).filter { $0.title == name }
        if matched.isEmpty {
            exitWithError("Calendar not found: \(name)")
        }
        if matched.count != 1 {
            exitWithError("Calendar name is ambiguous. Give the allowed calendar a unique name.")
        }
        calendars = matched
    }

    let predicate = store.predicateForEvents(withStart: from, end: to, calendars: calendars)
    let events = deduplicate(store.events(matching: predicate))

    let items = events.map { eventToJSON($0) }
    print("[\(items.joined(separator: ","))]")
}

func searchEvents(store: EKEventStore, query: String, calendarName: String?) {
    var calendars: [EKCalendar]? = nil
    if let name = calendarName {
        let matched = store.calendars(for: .event).filter { $0.title == name }
        if matched.isEmpty {
            exitWithError("Calendar not found: \(name)")
        }
        if matched.count != 1 {
            exitWithError("Calendar name is ambiguous. Give the allowed calendar a unique name.")
        }
        calendars = matched
    }

    // Search within a wide range: 1 year back to 2 years forward
    let from = Calendar.current.date(byAdding: .year, value: -1, to: Date())!
    let to = Calendar.current.date(byAdding: .year, value: 2, to: Date())!
    let predicate = store.predicateForEvents(withStart: from, end: to, calendars: calendars)
    let allEvents = store.events(matching: predicate)

    let queryNorm = normalizeQuotes(query.lowercased())
    let matched = deduplicate(allEvents.filter {
        normalizeQuotes(($0.title ?? "").lowercased()).contains(queryNorm)
    })

    let items = matched.map { eventToJSON($0) }
    print("[\(items.joined(separator: ","))]")
}

func getEvent(store: EKEventStore, title: String, calendarName: String?) {
    var calendars: [EKCalendar]? = nil
    if let name = calendarName {
        let matched = store.calendars(for: .event).filter { $0.title == name }
        if matched.isEmpty {
            exitWithError("Calendar not found: \(name)")
        }
        if matched.count != 1 {
            exitWithError("Calendar name is ambiguous. Give the allowed calendar a unique name.")
        }
        calendars = matched
    }

    // Search within a wide range
    let from = Calendar.current.date(byAdding: .year, value: -1, to: Date())!
    let to = Calendar.current.date(byAdding: .year, value: 2, to: Date())!
    let predicate = store.predicateForEvents(withStart: from, end: to, calendars: calendars)
    let allEvents = store.events(matching: predicate)

    let titleNorm = normalizeQuotes(title.lowercased())
    guard let event = allEvents.first(where: { normalizeQuotes(($0.title ?? "").lowercased()) == titleNorm }) else {
        exitWithError("Event not found: \(title)")
    }

    print(eventToJSON(event, includeDetails: true))
}

// MARK: - Main

func printUsage() -> Never {
    fputs("""
    Usage: calendar-helper <command> [options]
    Commands:
      list-calendars
      list-events --from <ISO> --to <ISO> [--calendar <name>]
      search-events --query <text> [--calendar <name>]
      get-event --title <text> [--calendar <name>]
    """, stderr)
    exit(1)
}

func main() {
    let args = CommandLine.arguments
    guard args.count >= 2 else { printUsage() }

    let store = EKEventStore()
    let status = EKEventStore.authorizationStatus(for: .event)

    let hasAccess: Bool
    if #available(macOS 14.0, *) {
        hasAccess = status == .fullAccess
    } else {
        hasAccess = status == .authorized
    }
    if !hasAccess {
        guard requestAccess(store: store) else {
            exitWithError("Calendar access denied. Grant access in System Settings > Privacy & Security > Calendars.")
        }
    }

    let command = args[1]

    func getArg(_ flag: String) -> String? {
        guard let idx = args.firstIndex(of: flag), idx + 1 < args.count else { return nil }
        return args[idx + 1]
    }

    switch command {
    case "list-calendars":
        listCalendars(store: store)

    case "list-events":
        guard let fromStr = getArg("--from"), let toStr = getArg("--to") else {
            exitWithError("list-events requires --from and --to ISO dates")
        }
        guard let fromDate = parseISO(fromStr) else {
            exitWithError("Invalid --from date: \(fromStr)")
        }
        guard let toDate = parseISO(toStr) else {
            exitWithError("Invalid --to date: \(toStr)")
        }
        listEvents(store: store, from: fromDate, to: toDate, calendarName: getArg("--calendar"))

    case "search-events":
        guard let query = getArg("--query") else {
            exitWithError("search-events requires --query")
        }
        searchEvents(store: store, query: query, calendarName: getArg("--calendar"))

    case "get-event":
        guard let title = getArg("--title") else {
            exitWithError("get-event requires --title")
        }
        getEvent(store: store, title: title, calendarName: getArg("--calendar"))

    default:
        printUsage()
    }
}

main()
