// Prototype: save an HTML print view as a PDF with the WebView2 PrintToPdf call (selectable text).
// Compiled only with `--features native-pdf` on Windows. Not used by the shipped flow yet.
use std::sync::{mpsc, Mutex};
use std::time::{Duration, SystemTime, UNIX_EPOCH};
use tauri::{AppHandle, Manager, WebviewUrl, WebviewWindowBuilder};
use webview2_com::Microsoft::Web::WebView2::Win32::{ICoreWebView2PrintSettings, ICoreWebView2_7};
use webview2_com::PrintToPdfCompletedHandler;
use windows::core::{Interface, HSTRING};

fn safe_stem(name: &str) -> String {
    let s: String = name
        .chars()
        .map(|c| if c.is_ascii_alphanumeric() || c == ' ' || c == '-' || c == '_' { c } else { '_' })
        .collect();
    let s = s.trim().to_string();
    let s: String = if s.is_empty() { "document".to_string() } else { s.chars().take(60).collect() };
    let upper = s.to_ascii_uppercase();
    let reserved = ["CON", "PRN", "AUX", "NUL"].contains(&upper.as_str())
        || ((upper.starts_with("COM") || upper.starts_with("LPT")) && upper.len() == 4 && upper.ends_with(|c: char| c.is_ascii_digit()));
    // Windows reserved device names, and names ending in a dot or space, are not safe file names.
    let s = s.trim_end_matches(|c| c == '.' || c == ' ').to_string();
    if reserved || s.is_empty() { format!("pdf-{s}") } else { s }
}

// The document HTML is untrusted. This policy runs first in <head>: no scripts, no network, no frames,
// only inline styles and data: images/fonts.
const CSP: &str = "<meta http-equiv=\"Content-Security-Policy\" content=\"default-src 'none'; script-src 'none'; connect-src 'none'; frame-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'; img-src data:; font-src data:; style-src 'unsafe-inline'\">";

fn with_csp(html: &str) -> String {
    let lower = html.to_ascii_lowercase();
    if let Some(i) = lower.find("<head>") {
        let at = i + "<head>".len();
        return format!("{}{}{}", &html[..at], CSP, &html[at..]);
    }
    format!("<!doctype html><html><head><meta charset=\"utf-8\">{CSP}</head><body>{html}</body></html>")
}

/// Removes the temporary print HTML on every exit path: success, error, timeout, or the command future being dropped.
struct TempFile(std::path::PathBuf);
impl Drop for TempFile {
    fn drop(&mut self) {
        let _ = std::fs::remove_file(&self.0);
    }
}

/// Destroys the hidden print window on every exit path.
struct WinGuard(tauri::WebviewWindow);
impl Drop for WinGuard {
    fn drop(&mut self) {
        let _ = self.0.destroy();
    }
}

/// Deletes print files left behind by an earlier crash or forced quit.
pub fn sweep_stale() {
    if let Ok(rd) = std::fs::read_dir(std::env::temp_dir()) {
        for e in rd.flatten() {
            let n = e.file_name().to_string_lossy().to_string();
            if n.starts_with("deepaks-tool-print-") && n.ends_with(".html") {
                let _ = std::fs::remove_file(e.path());
            }
        }
    }
}

#[tauri::command]
pub async fn save_print_pdf(app: AppHandle, window: tauri::WebviewWindow, html: String, name: String) -> Result<String, String> {
    // Test-only trace (this module is behind the native-pdf feature): records which window label reached the command.
    if name.starts_with("from-print-window") {
        let _ = std::fs::write(std::env::temp_dir().join(format!("deepaks-tool-callmarker-{}.txt", window.label())), b"entered");
    }
    // Authorization in code, independent of the CSP and of the capability file: only the main window may call this.
    if window.label() != "main" {
        return Err("save_print_pdf is not available from this window".to_string());
    }
    let dir = app.path().download_dir().map_err(|e| e.to_string())?;
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    let stem = safe_stem(&name);
    let mut out = dir.join(format!("{stem}.pdf"));
    let mut n = 2;
    while out.exists() {
        out = dir.join(format!("{stem} ({n}).pdf"));
        n += 1;
    }
    let stamp = SystemTime::now().duration_since(UNIX_EPOCH).map(|d| d.as_millis()).unwrap_or(0);
    let tmp = std::env::temp_dir().join(format!("deepaks-tool-print-{stamp}.html"));
    std::fs::write(&tmp, with_csp(&html).as_bytes()).map_err(|e| e.to_string())?;
    let _tmp_guard = TempFile(tmp.clone());
    let url = tauri::Url::from_file_path(&tmp).map_err(|_| "Could not build a file URL".to_string())?;

    let (load_tx, load_rx) = mpsc::channel::<()>();
    let load_tx = Mutex::new(load_tx);
    let allowed = url.clone();
    // A second WebView2 in the same app must use the same browser arguments as the main window, or creation fails (0x8007139F).
    let args = app.config().app.windows.first().and_then(|w| w.additional_browser_args.clone());
    let mut builder = WebviewWindowBuilder::new(&app, format!("printview-{stamp}"), WebviewUrl::External(url))
        .title("Print view")
        .on_navigation(move |u| *u == allowed)
        .visible(false)
        .on_page_load(move |_w, p| {
            if matches!(p.event(), tauri::webview::PageLoadEvent::Finished) {
                if let Ok(tx) = load_tx.lock() {
                    let _ = tx.send(());
                }
            }
        })
        ;
    if let Some(a) = args.as_deref() {
        builder = builder.additional_browser_args(a);
    }
    let win = builder.build().map_err(|e| e.to_string())?;

    let out_path = out.clone();
    let test_name = name.clone();
    let result = tauri::async_runtime::spawn_blocking(move || -> Result<(), String> {
        let win = WinGuard(win);
        let win = &win.0;
        load_rx.recv_timeout(Duration::from_secs(30)).map_err(|_| "The print view did not finish loading".to_string())?;
        // Test-only hooks (this whole module is behind the native-pdf feature): hold the window open, or fail on purpose.
        if test_name.starts_with("__test_hold__") {
            std::thread::sleep(Duration::from_millis(9000));
        }
        if test_name.starts_with("__test_fail__") {
            return Err("forced failure for cleanup test".to_string());
        }
        std::thread::sleep(Duration::from_millis(800));
        let (dtx, drx) = mpsc::channel::<Result<(), String>>();
        let path_h = HSTRING::from(out_path.to_string_lossy().as_ref());
        win.with_webview(move |wv| unsafe {
            let r = (|| -> Result<(), String> {
                let core = wv.controller().CoreWebView2().map_err(|e| format!("CoreWebView2: {e:?}"))?;
                let core7: ICoreWebView2_7 = core.cast().map_err(|e| format!("ICoreWebView2_7: {e:?}"))?;
                let dtx2 = dtx.clone();
                let handler = PrintToPdfCompletedHandler::create(Box::new(move |err, ok| {
                    let ok: bool = bool::from(ok);
                    let _ = dtx2.send(if err.is_ok() && ok { Ok(()) } else { Err(format!("PrintToPdf failed: {err:?} ok={ok}")) });
                    Ok(())
                }));
                core7
                    .PrintToPdf(&path_h, None::<&ICoreWebView2PrintSettings>, &handler)
                    .map_err(|e| format!("PrintToPdf call: {e:?}"))
            })();
            if let Err(e) = r {
                let _ = dtx.send(Err(e));
            }
        })
        .map_err(|e| e.to_string())?;
        let res = drx.recv_timeout(Duration::from_secs(60)).map_err(|_| "PrintToPdf timed out".to_string())?;
        res
    })
    .await
    .map_err(|e| e.to_string())?;
    result?;
    Ok(out.to_string_lossy().to_string())
}
