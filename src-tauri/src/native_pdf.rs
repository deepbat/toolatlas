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
    if s.is_empty() { "document".to_string() } else { s.chars().take(60).collect() }
}

#[tauri::command]
pub async fn save_print_pdf(app: AppHandle, html: String, name: String) -> Result<String, String> {
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
    std::fs::write(&tmp, html.as_bytes()).map_err(|e| e.to_string())?;
    let url = tauri::Url::from_file_path(&tmp).map_err(|_| "Could not build a file URL".to_string())?;

    let (load_tx, load_rx) = mpsc::channel::<()>();
    let load_tx = Mutex::new(load_tx);
    let win = WebviewWindowBuilder::new(&app, format!("printview-{stamp}"), WebviewUrl::External(url))
        .title("Print view")
        .visible(false)
        .on_page_load(move |_w, p| {
            if matches!(p.event(), tauri::webview::PageLoadEvent::Finished) {
                if let Ok(tx) = load_tx.lock() {
                    let _ = tx.send(());
                }
            }
        })
        .build()
        .map_err(|e| e.to_string())?;

    let out_path = out.clone();
    let result = tauri::async_runtime::spawn_blocking(move || -> Result<(), String> {
        load_rx.recv_timeout(Duration::from_secs(30)).map_err(|_| "The print view did not finish loading".to_string())?;
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
        let _ = win.destroy();
        res
    })
    .await
    .map_err(|e| e.to_string())?;
    let _ = std::fs::remove_file(&tmp);
    result?;
    Ok(out.to_string_lossy().to_string())
                                 }
