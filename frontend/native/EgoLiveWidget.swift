import ActivityKit
import AppIntents
import SwiftUI
import WidgetKit

private let emerald = Color(red: 0.40, green: 0.88, blue: 0.70)
private let lavender = Color(red: 0.67, green: 0.72, blue: 0.87)
private func title(_ mode: String) -> String {
  mode == "focus" ? "Фокус" : mode == "rest" ? "Отдых" : "Нет данных"
}
private func symbol(_ mode: String) -> String {
  mode == "focus" ? "flame.fill" : mode == "rest" ? "cloud.fill" : "minus.circle.fill"
}
private func tint(_ mode: String) -> Color {
  mode == "focus" ? emerald : mode == "rest" ? lavender : Color(red: 0.68, green: 0.75, blue: 0.72)
}

struct ActivityBackground: View {
  let mode: String
  var body: some View {
    ZStack {
      LinearGradient(colors: mode == "rest" ? [Color(red: 0.14, green: 0.20, blue: 0.29), Color(red: 0.06, green: 0.11, blue: 0.17)] : [Color(red: 0.08, green: 0.22, blue: 0.17), Color(red: 0.03, green: 0.09, blue: 0.07)], startPoint: .topLeading, endPoint: .bottomTrailing)
      Canvas { context, size in
        context.scaleBy(x: size.width / 560, y: size.height / 310)
        if mode == "rest" {
          context.fill(Path(ellipseIn: CGRect(x: 409, y: 36, width: 52, height: 52)), with: .color(lavender.opacity(0.12)))
          for (x, y, scale) in [(CGFloat(-25), CGFloat(70), CGFloat(1)), (CGFloat(360), CGFloat(105), CGFloat(1.1))] {
            var cloud = Path()
            cloud.addEllipse(in: CGRect(x: x, y: y, width: 85 * scale, height: 45))
            cloud.addEllipse(in: CGRect(x: x + 45, y: y - 28, width: 85 * scale, height: 70))
            cloud.addEllipse(in: CGRect(x: x + 96, y: y - 5, width: 100 * scale, height: 52))
            context.fill(cloud, with: .color(lavender.opacity(0.12)))
          }
          var hills = Path()
          hills.move(to: CGPoint(x: -30, y: 270))
          hills.addCurve(to: CGPoint(x: 280, y: 280), control1: CGPoint(x: 90, y: 205), control2: CGPoint(x: 120, y: 320))
          hills.addCurve(to: CGPoint(x: 590, y: 275), control1: CGPoint(x: 410, y: 215), control2: CGPoint(x: 470, y: 250))
          hills.addLine(to: CGPoint(x: 590, y: 310)); hills.addLine(to: CGPoint(x: -30, y: 310)); hills.closeSubpath()
          context.fill(hills, with: .color(lavender.opacity(0.08)))
          for (x, y) in [(193.0, 46.0), (344, 65), (301, 34), (91, 181), (492, 175)] {
            context.fill(Path(ellipseIn: CGRect(x: x, y: y, width: 3, height: 3)), with: .color(.white.opacity(0.25)))
          }
        } else if mode == "focus" {
          for (x, y, width) in [(40.0, 120.0, 120.0), (150, 70, 150), (290, 40, 160), (420, 130, 110)] {
            var flame = Path()
            flame.move(to: CGPoint(x: x, y: 330))
            flame.addCurve(to: CGPoint(x: x + width * 0.45, y: y), control1: CGPoint(x: x - 35, y: 220), control2: CGPoint(x: x + width * 0.7, y: 210))
            flame.addCurve(to: CGPoint(x: x + width, y: 330), control1: CGPoint(x: x + width * 0.35, y: y + 100), control2: CGPoint(x: x + width + 70, y: 230))
            flame.closeSubpath()
            context.fill(flame, with: .linearGradient(Gradient(colors: [.orange.opacity(0.03), Color(red: 0.87, green: 0.68, blue: 0.41).opacity(0.28)]), startPoint: CGPoint(x: x, y: y), endPoint: CGPoint(x: x, y: 330)))
          }
        } else {
          let ring = CGRect(x: 185, y: -35, width: 380, height: 380)
          context.stroke(Path(ellipseIn: ring), with: .color(emerald.opacity(0.08)), lineWidth: 28)
          context.fill(Path(roundedRect: CGRect(x: 260, y: 143, width: 230, height: 26), cornerRadius: 13), with: .color(emerald.opacity(0.10)))
        }
      }
    }.clipped()
  }
}

struct ActivityControls: View {
  let accountID: String
  let mode: String
  var body: some View {
    HStack(spacing: 10) {
      action(mode == "unknown" ? "rest" : "unknown")
      action(mode == "focus" ? "rest" : "focus")
    }
  }
  private func action(_ next: String) -> some View {
    Button(intent: ChangeEgoMode(accountID: accountID, mode: next)) {
      Image(systemName: symbol(next))
        .font(.system(size: 20, weight: .medium))
        .foregroundStyle(tint(next))
        .frame(width: 46, height: 46)
        .background(.white.opacity(0.08), in: Circle())
        .overlay(Circle().strokeBorder(.white.opacity(0.12), lineWidth: 1))
    }.buttonStyle(.plain).accessibilityLabel("Перейти: \(title(next))")
  }
}

struct ActivityTimer: View {
  let state: EgoActivityAttributes.ContentState
  var body: some View {
    Text(Date(timeIntervalSince1970: state.startedAt), style: .timer)
      .monospacedDigit().foregroundStyle(.white)
      .minimumScaleFactor(0.6).lineLimit(1)
  }
}

@main
struct EgoLiveWidget: Widget {
  var body: some WidgetConfiguration {
    ActivityConfiguration(for: EgoActivityAttributes.self) { context in
      HStack(spacing: 16) {
        VStack(alignment: .leading, spacing: 7) {
          Label(title(context.state.mode), systemImage: symbol(context.state.mode))
            .font(.system(size: 12, weight: .medium)).foregroundStyle(tint(context.state.mode))
          ActivityTimer(state: context.state).font(.system(size: 38, weight: .light, design: .rounded))
        }
        Spacer(minLength: 0)
        ActivityControls(accountID: context.attributes.accountID, mode: context.state.mode)
      }
      .padding(20)
      .background(ActivityBackground(mode: context.state.mode))
      .activityBackgroundTint(Color(red: 0.03, green: 0.07, blue: 0.06))
      .activitySystemActionForegroundColor(emerald)
      .widgetURL(URL(string: "egofocus://"))
    } dynamicIsland: { context in
      DynamicIsland {
        DynamicIslandExpandedRegion(.leading) {
          Label(title(context.state.mode), systemImage: symbol(context.state.mode))
            .font(.caption).foregroundStyle(tint(context.state.mode))
        }
        DynamicIslandExpandedRegion(.bottom) {
          HStack {
            ActivityTimer(state: context.state).font(.system(size: 30, weight: .light))
            Spacer()
            ActivityControls(accountID: context.attributes.accountID, mode: context.state.mode)
          }.padding(.vertical, 6)
        }
      } compactLeading: {
        Image(systemName: symbol(context.state.mode)).foregroundStyle(tint(context.state.mode))
      } compactTrailing: {
        ActivityTimer(state: context.state).font(.caption2).frame(maxWidth: 70)
      } minimal: {
        Image(systemName: symbol(context.state.mode)).foregroundStyle(tint(context.state.mode))
      }
      .widgetURL(URL(string: "egofocus://"))
      .keylineTint(tint(context.state.mode))
    }
  }
}
