#[derive(serde::Serialize)]
struct InitialFile {
    path: String,
    content: String,
}

#[tauri::command]
fn get_initial_file() -> Option<InitialFile> {
    for arg in std::env::args().skip(1) {
        let lower = arg.to_lowercase();
        if lower.ends_with(".md") || lower.ends_with(".markdown") {
            if let Ok(content) = std::fs::read_to_string(&arg) {
                return Some(InitialFile { path: arg, content });
            }
        }
    }
    None
}

#[tauri::command]
fn save_file(path: String, content: String) -> Result<(), String> {
    std::fs::write(&path, content.as_bytes()).map_err(|e| e.to_string())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .invoke_handler(tauri::generate_handler![get_initial_file, save_file])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
