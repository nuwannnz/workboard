// WorkBoard Tauri 2 desktop shell. Renders the same Vite build output as the
// PWA (Principle II): platform-specific code stays isolated here and behind the
// frontend's src/platform/ adapter.
#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        // Secure token persistence for the shared auth code's desktop token store
        // (frontend src/platform/tauri.ts).
        .plugin(tauri_plugin_store::Builder::new().build())
        .run(tauri::generate_context!())
        .expect("error while running WorkBoard");
}
