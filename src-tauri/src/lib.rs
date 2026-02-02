mod commands;
mod db;
mod python;

use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tracing_subscriber::fmt::init();

    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .setup(|app| {
            // Initialize database
            let app_data_dir = app.path().app_data_dir()?;
            std::fs::create_dir_all(&app_data_dir)?;
            db::init_db(&app_data_dir)?;
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::get_python_path,
            commands::set_python_path,
            commands::find_python,
            commands::run_script,
            commands::cancel_script,
            commands::save_pipeline,
            commands::load_pipeline,
            commands::list_pipelines,
            commands::delete_pipeline,
            commands::get_example_data_path,
            commands::list_example_datasets,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
