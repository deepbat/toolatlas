fn main() {
    // Declare the app command so Tauri's access control applies to it: only windows named in a capability that grants
    // "allow-save-print-pdf" may call it. (The command itself is only compiled in with the native-pdf feature.)
    tauri_build::try_build(
        tauri_build::Attributes::new().app_manifest(tauri_build::AppManifest::new().commands(&["save_print_pdf"])),
    )
    .expect("failed to run tauri-build");
}
