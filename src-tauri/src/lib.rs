#[cfg(all(windows, feature = "native-pdf"))]
mod native_pdf;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    #[cfg(all(windows, feature = "native-pdf"))]
    native_pdf::sweep_stale();
    let builder = tauri::Builder::default();
    #[cfg(all(windows, feature = "native-pdf"))]
    let builder = builder.invoke_handler(tauri::generate_handler![native_pdf::save_print_pdf]);
    builder
        .run(tauri::generate_context!())
        .expect("error while running Deepak's Tool");
}
