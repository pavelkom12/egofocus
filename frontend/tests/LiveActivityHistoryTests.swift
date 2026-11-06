import Foundation

@main
enum LiveActivityHistoryTests {
  static func main() throws {
    let initial: [String: Any] = ["schemaVersion": 1, "session": "a", "token": "secret", "accounts": [
      ["id": "a", "revision": 5, "base": ["revision": 3], "transitions": [["id": "first", "at": 10.0, "mode": "unknown"]]],
      ["id": "b", "revision": 1]
    ]]
    var value = initial
    for (i, mode) in ["focus", "rest", "unknown", "focus"].enumerated() {
      value = try EgoHistory.switchMode(value, accountID: "a", mode: mode, now: Double(20 + i), id: UUID().uuidString)
    }
    let accounts = value["accounts"] as! [[String: Any]]
    let history = accounts[0]["transitions"] as! [[String: Any]]
    assert(history.count == 5)
    assert(history.first?["at"] as? Double == 10)
    assert(history.map { $0["mode"] as! String } == ["unknown", "focus", "rest", "unknown", "focus"])
    assert(accounts[0]["revision"] as? Int == 9)
    assert((accounts[0]["base"] as! [String: Int])["revision"] == 3)
    assert(accounts[1]["revision"] as? Int == 1)
    let unchanged = try EgoHistory.switchMode(value, accountID: "a", mode: "focus", now: 30, id: "unused")
    assert(NSDictionary(dictionary: unchanged).isEqual(to: value))
    func rejects(_ db: [String: Any], _ account: String = "a", _ mode: String = "rest", _ time: Double = 40) {
      do {
        _ = try EgoHistory.switchMode(db, accountID: account, mode: mode, now: time, id: "invalid")
        fatalError("Expected rejected mutation")
      } catch {}
    }
    rejects(value, "b")
    rejects(value, "a", "invalid")
    rejects(value, "a", "rest", 23)
    rejects(value, "a", "rest", .nan)
    var loggedOut = value; loggedOut["session"] = NSNull(); rejects(loggedOut)
    var expired = value; expired.removeValue(forKey: "token"); rejects(expired)
    print("Live Activity history: all tests passed")
  }
}
