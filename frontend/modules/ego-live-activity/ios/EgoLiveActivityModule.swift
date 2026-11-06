import ExpoModulesCore
import Foundation
import AppIntents

public struct EgoIntentsPackage: AppIntentsPackage {}

public final class EgoLiveActivityModule: Module {
  private var observer: NSObjectProtocol?
  public func definition() -> ModuleDefinition {
    Name("EgoLiveActivity")
    Events("onChange")
    OnCreate {
      self.observer = NotificationCenter.default.addObserver(forName: .init("EgoActivityChanged"), object: nil, queue: .main) { [weak self] _ in
        self?.sendEvent("onChange", [:])
      }
    }
    OnDestroy {
      if let observer = self.observer { NotificationCenter.default.removeObserver(observer) }
    }
    AsyncFunction("refresh") { (path: String, allowStart: Bool) in
      await EgoActivityStore.shared.configure(path: path)
      try await EgoActivityStore.shared.reconcile(allowStart: allowStart)
    }
  }
}
