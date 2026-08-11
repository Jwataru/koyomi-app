// koyomi のロック画面TODOウィジェット本体（WidgetKit / SwiftUI）。
//
// データはアプリ本体（React Native側）が App Group 経由の共有 UserDefaults に
// JSON文字列として書き込み、そのつどウィジェットの再読み込みを要求する。
// このファイルはその値を読み出して描画するだけで、通信・保存の主体は常にアプリ側。
//
// 重要: appGroupId は app.json (ios.entitlements) / expo-target.config.js の
// 値と必ず一致させること。ずれていると共有ストレージが読めず、常に空表示になる。
import WidgetKit
import SwiftUI

private let appGroupId = "group.com.yourname.koyomi"

struct TodoWidgetItem: Codable, Identifiable {
    let id: String
    let text: String
    let dueDate: String
}

struct TodoWidgetEntry: TimelineEntry {
    let date: Date
    let items: [TodoWidgetItem]
}

struct TodoWidgetProvider: TimelineProvider {
    // ウィジェットギャラリー等でのプレビュー用ダミーデータ
    func placeholder(in context: Context) -> TodoWidgetEntry {
        TodoWidgetEntry(
            date: Date(),
            items: [
                TodoWidgetItem(id: "dummy-1", text: "レシートを整理する", dueDate: ""),
                TodoWidgetItem(id: "dummy-2", text: "母に電話する", dueDate: ""),
            ]
        )
    }

    func getSnapshot(in context: Context, completion: @escaping (TodoWidgetEntry) -> Void) {
        completion(loadEntry())
    }

    func getTimeline(in context: Context, completion: @escaping (Timeline<TodoWidgetEntry>) -> Void) {
        let entry = loadEntry()
        // 時間経過による自動更新はせず、アプリ側から明示的に
        // ExtensionStorage.reloadWidget() が呼ばれたときだけ再読み込みする。
        let timeline = Timeline(entries: [entry], policy: .never)
        completion(timeline)
    }

    private func loadEntry() -> TodoWidgetEntry {
        let defaults = UserDefaults(suiteName: appGroupId)
        var items: [TodoWidgetItem] = []
        if let raw = defaults?.string(forKey: "todos"),
           let data = raw.data(using: .utf8) {
            items = (try? JSONDecoder().decode([TodoWidgetItem].self, from: data)) ?? []
        }
        return TodoWidgetEntry(date: Date(), items: items)
    }
}

struct TodoWidgetView: View {
    var entry: TodoWidgetEntry
    @Environment(\.widgetFamily) private var family

    var body: some View {
        switch family {
        case .accessoryInline:
            // 時計の横などに1行だけ表示するファミリー
            if let first = entry.items.first {
                Text("• \(first.text)")
            } else {
                Text("koyomi")
            }

        case .accessoryRectangular:
            // ロック画面の四角い枠に収まるファミリー（メインで使う想定）
            VStack(alignment: .leading, spacing: 2) {
                if entry.items.isEmpty {
                    Text("TODOはありません")
                        .font(.caption2)
                } else {
                    ForEach(entry.items.prefix(3)) { item in
                        HStack(alignment: .top, spacing: 4) {
                            Text("•")
                            Text(item.text)
                                .lineLimit(1)
                        }
                        .font(.caption2)
                    }
                }
            }

        default:
            Text("koyomi")
        }
    }
}

struct TodoWidget: Widget {
    let kind: String = "TodoWidget"

    var body: some WidgetConfiguration {
        StaticConfiguration(kind: kind, provider: TodoWidgetProvider()) { entry in
            TodoWidgetView(entry: entry)
                .containerBackground(for: .widget) {
                    Color.clear
                }
        }
        .configurationDisplayName("koyomi TODO")
        .description("ロック画面にkoyomiのTODOを表示します。")
        .supportedFamilies([.accessoryRectangular, .accessoryInline])
    }
}

@main
struct TodoWidgetBundle: WidgetBundle {
    var body: some Widget {
        TodoWidget()
    }
}
