import ActivityKit
import AppIntents
import Foundation

struct EgoActivityAttributes: ActivityAttributes {
  struct ContentState: Codable, Hashable {
    var mode: String
    var startedAt: Double
  }
  var accountID: String
}

struct ChangeEgoMode: LiveActivityIntent {
  static var title: LocalizedStringResource = "Изменить состояние EgoFocus"
  static var openAppWhenRun: Bool = false
  @Parameter(title: "Профиль") var accountID: String
  @Parameter(title: "Состояние") var mode: String
  init() {}
  init(accountID: String, mode: String) {
    self.accountID = accountID
    self.mode = mode
  }
  func perform() async throws -> some IntentResult {
    #if EGO_APP
    try await EgoActivityStore.shared.change(accountID: accountID, mode: mode)
    #else
    throw NSError(domain: "EgoFocus", code: 2, userInfo: [NSLocalizedDescriptionKey: "Откройте EgoFocus и повторите переключение."])
    #endif
    return .result()
  }
}
