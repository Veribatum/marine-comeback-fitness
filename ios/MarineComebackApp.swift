import SwiftUI
import WebKit

@main
struct MarineComebackApp: App {
    var body: some Scene {
        WindowGroup {
            MarineWebView()
                .preferredColorScheme(.dark)
        }
    }
}

private struct MarineWebView: UIViewRepresentable {
    private static let home = URL(string: "https://veribatum.github.io/marine-comeback-fitness/")!

    func makeCoordinator() -> Coordinator { Coordinator() }

    func makeUIView(context: Context) -> WKWebView {
        let config = WKWebViewConfiguration()
        config.limitsNavigationsToAppBoundDomains = true
        config.allowsInlineMediaPlayback = true
        config.userContentController.addScriptMessageHandler(context.coordinator, contentWorld: .page, name: "marineRun")
        let web = WKWebView(frame: .zero, configuration: config)
        web.navigationDelegate = context.coordinator
        web.load(URLRequest(url: Self.home))
        return web
    }

    func updateUIView(_ webView: WKWebView, context: Context) {}

    static func dismantleUIView(_ webView: WKWebView, coordinator: Coordinator) {
        webView.configuration.userContentController.removeScriptMessageHandler(forName: "marineRun", contentWorld: .page)
    }

    @MainActor
    final class Coordinator: NSObject, WKScriptMessageHandlerWithReply, WKNavigationDelegate, WKDownloadDelegate {
        private let tracker = RunTracker()
        private var downloads: [ObjectIdentifier: URL] = [:]

        private func isAppPage(_ url: URL?) -> Bool {
            guard let url, url.scheme == "https", url.host == MarineWebView.home.host,
                  url.port == nil || url.port == 443 else { return false }
            return ["/marine-comeback-fitness", "/marine-comeback-fitness/", "/marine-comeback-fitness/index.html"].contains(url.path)
        }

        func userContentController(_ controller: WKUserContentController, didReceive message: WKScriptMessage,
                                   replyHandler: @escaping (Any?, String?) -> Void) {
            guard message.frameInfo.isMainFrame, isAppPage(message.frameInfo.request.url),
                  let body = message.body as? [String: Any] else {
                replyHandler(nil, "Unsupported request.")
                return
            }
            do {
                replyHandler(try tracker.command(body), nil)
            } catch {
                replyHandler(nil, "Unable to update the run. Try again.")
            }
        }

        func webView(_ webView: WKWebView, decidePolicyFor action: WKNavigationAction,
                     decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
            if action.shouldPerformDownload, isAppPage(action.sourceFrame.request.url) {
                decisionHandler(.download)
            } else if action.targetFrame?.isMainFrame == false {
                decisionHandler(.allow)
            } else if isAppPage(action.request.url) {
                if action.targetFrame == nil {
                    decisionHandler(.cancel)
                    webView.load(action.request)
                } else {
                    decisionHandler(.allow)
                }
            } else {
                decisionHandler(.cancel)
                if action.navigationType == .linkActivated, let url = action.request.url,
                   ["https", "http"].contains(url.scheme ?? "") {
                    UIApplication.shared.open(url)
                }
            }
        }

        func webViewWebContentProcessDidTerminate(_ webView: WKWebView) { webView.reload() }

        func webView(_ webView: WKWebView, navigationAction: WKNavigationAction, didBecome download: WKDownload) {
            download.delegate = self
        }

        func download(_ download: WKDownload, decideDestinationUsing response: URLResponse, suggestedFilename: String,
                      completionHandler: @escaping (URL?) -> Void) {
            let folder = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString, isDirectory: true)
            do {
                try FileManager.default.createDirectory(at: folder, withIntermediateDirectories: true)
                let file = folder.appendingPathComponent(URL(fileURLWithPath: suggestedFilename).lastPathComponent)
                downloads[ObjectIdentifier(download)] = file
                completionHandler(file)
            } catch {
                completionHandler(nil)
            }
        }

        func downloadDidFinish(_ download: WKDownload) {
            guard let file = downloads.removeValue(forKey: ObjectIdentifier(download)) else { return }
            guard let scene = UIApplication.shared.connectedScenes.compactMap({ $0 as? UIWindowScene })
                .first(where: { $0.activationState == .foregroundActive }),
                var root = scene.windows.first(where: { $0.isKeyWindow })?.rootViewController else {
                try? FileManager.default.removeItem(at: file.deletingLastPathComponent())
                return
            }
            while let presented = root.presentedViewController { root = presented }
            let share = UIActivityViewController(activityItems: [file], applicationActivities: nil)
            share.popoverPresentationController?.sourceView = root.view
            share.completionWithItemsHandler = { _, _, _, _ in
                try? FileManager.default.removeItem(at: file.deletingLastPathComponent())
            }
            root.present(share, animated: true)
        }

        func download(_ download: WKDownload, didFailWithError error: Error, resumeData: Data?) {
            if let file = downloads.removeValue(forKey: ObjectIdentifier(download)) {
                try? FileManager.default.removeItem(at: file.deletingLastPathComponent())
            }
        }
    }
}
