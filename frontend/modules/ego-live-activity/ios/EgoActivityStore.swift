import ActivityKit
import Foundation
import SQLite3

// LiveActivityIntent runs in the containing app process, so no App Group is needed.
// Read the same JSON row as expo-sqlite; BEGIN IMMEDIATE serializes both writers.
actor EgoActivityStore {
  static let shared = EgoActivityStore()
  private let pathKey = "EgoFocusDatabasePath"

  func configure(path: String) {
    UserDefaults.standard.set(path, forKey: pathKey)
  }

  private func database<T>(_ work: (OpaquePointer) throws -> T) throws -> T {
    guard let path = UserDefaults.standard.string(forKey: pathKey) else {
      throw failure("Сначала откройте EgoFocus.")
    }
    var connection: OpaquePointer?
    guard sqlite3_open_v2(path, &connection, SQLITE_OPEN_READWRITE | SQLITE_OPEN_FULLMUTEX, nil) == SQLITE_OK,
          let db = connection else {
      if let connection { sqlite3_close(connection) }
      throw failure("Не удалось открыть локальную историю.")
    }
    defer { sqlite3_close(db) }
    sqlite3_busy_timeout(db, 5000)
    return try work(db)
  }

  private func failure(_ text: String) -> NSError {
    NSError(domain: "EgoFocus", code: 1, userInfo: [NSLocalizedDescriptionKey: text])
  }
  private func execute(_ sql: String, db: OpaquePointer) throws {
    guard sqlite3_exec(db, sql, nil, nil, nil) == SQLITE_OK else {
      throw failure("Не удалось сохранить историю. Повторите действие.")
    }
  }
  private func read(_ db: OpaquePointer) throws -> [String: Any] {
    var stmt: OpaquePointer?
    guard sqlite3_prepare_v2(db, "SELECT value FROM local_state WHERE id=1", -1, &stmt, nil) == SQLITE_OK else {
      throw failure("Откройте приложение для подготовки данных.")
    }
    defer { sqlite3_finalize(stmt) }
    guard sqlite3_step(stmt) == SQLITE_ROW, let text = sqlite3_column_text(stmt, 0),
          let data = String(cString: text).data(using: .utf8),
          let value = try JSONSerialization.jsonObject(with: data) as? [String: Any],
          (value["schemaVersion"] as? Int) == 1 else {
      throw failure("Локальные данные недоступны.")
    }
    return value
  }

  func change(accountID: String, mode: String) async throws {
    guard ["focus", "rest", "unknown"].contains(mode) else { throw failure("Неизвестное состояние.") }
    try database { db in
      try execute("BEGIN IMMEDIATE", db: db)
      do {
        let original = try read(db)
        let value = try EgoHistory.switchMode(original, accountID: accountID, mode: mode,
          now: floor(Date().timeIntervalSince1970 * 1000), id: UUID().uuidString.lowercased())
        let data = try JSONSerialization.data(withJSONObject: value, options: [.sortedKeys])
        let text = String(decoding: data, as: UTF8.self)
        var stmt: OpaquePointer?
        guard sqlite3_prepare_v2(db, "UPDATE local_state SET value=? WHERE id=1", -1, &stmt, nil) == SQLITE_OK else {
          throw failure("Не удалось подготовить сохранение.")
        }
        defer { sqlite3_finalize(stmt) }
        let transient = unsafeBitCast(-1, to: sqlite3_destructor_type.self)
        guard sqlite3_bind_text(stmt, 1, text, -1, transient) == SQLITE_OK,
              sqlite3_step(stmt) == SQLITE_DONE else { throw failure("Не удалось сохранить состояние.") }
        try execute("COMMIT", db: db)
      } catch {
        try? execute("ROLLBACK", db: db)
        throw error
      }
    }
    try await reconcile(allowStart: false)
    NotificationCenter.default.post(name: .init("EgoActivityChanged"), object: nil)
  }

  func reconcile(allowStart: Bool) async throws {
    let value = try database { try read($0) }
    let accounts = value["accounts"] as? [[String: Any]] ?? []
    let session = value["session"] as? String
    let account = accounts.first { $0["id"] as? String == session }
    guard let session, value["token"] is String, account?["base"] != nil,
          let events = account?["transitions"] as? [[String: Any]],
          let last = events.last, let mode = last["mode"] as? String,
          let at = last["at"] as? Double else {
      for activity in Activity<EgoActivityAttributes>.activities {
        await activity.end(nil, dismissalPolicy: .immediate)
      }
      return
    }
    let content = ActivityContent(state: EgoActivityAttributes.ContentState(mode: mode, startedAt: at / 1000), staleDate: nil)
    var kept: Activity<EgoActivityAttributes>?
    for activity in Activity<EgoActivityAttributes>.activities {
      if activity.attributes.accountID == session && kept == nil && activity.activityState == .active {
        kept = activity
      } else { await activity.end(nil, dismissalPolicy: .immediate) }
    }
    if let kept {
      if kept.content.state != content.state { await kept.update(content) }
    } else if allowStart && ActivityAuthorizationInfo().areActivitiesEnabled {
      _ = try Activity.request(attributes: EgoActivityAttributes(accountID: session), content: content, pushType: nil)
    }
  }
}
