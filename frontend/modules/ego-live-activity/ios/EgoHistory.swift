import Foundation

enum EgoHistory {
  static func switchMode(_ value: [String: Any], accountID: String, mode: String, now: Double, id: String) throws -> [String: Any] {
    func fail(_ text: String) -> NSError {
      NSError(domain: "EgoFocus", code: 1, userInfo: [NSLocalizedDescriptionKey: text])
    }
    guard ["focus", "rest", "unknown"].contains(mode) else { throw fail("Неизвестное состояние.") }
    guard value["schemaVersion"] as? Int == 1,
          value["session"] as? String == accountID,
          let token = value["token"] as? String, !token.isEmpty,
          var accounts = value["accounts"] as? [[String: Any]],
          let index = accounts.firstIndex(where: { $0["id"] as? String == accountID }),
          accounts[index]["base"] != nil,
          var events = accounts[index]["transitions"] as? [[String: Any]],
          let last = events.last, let lastAt = last["at"] as? Double else {
      throw fail("Войдите в этот профиль в приложении.")
    }
    guard last["mode"] as? String != mode else { return value }
    guard now.isFinite, now > lastAt else { throw fail("Повторите переключение через секунду.") }
    events.append(["id": id, "at": now, "mode": mode])
    accounts[index]["transitions"] = events
    accounts[index]["revision"] = (accounts[index]["revision"] as? Int ?? 0) + 1
    accounts[index]["updatedAt"] = now
    var updated = value
    updated["accounts"] = accounts
    return updated
  }
}
