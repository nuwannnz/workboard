// WorkBoard Tauri 2 desktop shell. Renders the same Vite build output as the
// PWA (Principle II): platform-specific code stays isolated here and behind the
// frontend's src/platform/ adapter.
#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .run(tauri::generate_context!())
        .expect("error while running WorkBoard");
}
