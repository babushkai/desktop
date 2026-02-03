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
            // Clean up any orphaned servers from previous crash
            commands::cleanup_orphan_inference_server(&app_data_dir);
            commands::cleanup_orphan_http_server(&app_data_dir);
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
            commands::create_run,
            commands::complete_run,
            commands::fail_run,
            commands::save_run_metrics,
            commands::list_runs,
            commands::get_run_metrics,
            commands::delete_run,
            // Model Registry
            commands::create_model,
            commands::list_models,
            commands::get_model,
            commands::delete_model,
            commands::register_model_version,
            commands::list_model_versions,
            commands::promote_model,
            commands::delete_model_version,
            commands::get_model_file_path,
            commands::get_model_version,
            // Inference Server
            commands::start_inference_server,
            commands::stop_inference_server,
            commands::get_inference_server_status,
            commands::run_inference,
            // Tuning
            commands::check_python_package,
            commands::create_tuning_session,
            commands::complete_tuning_session,
            commands::cancel_tuning_session,
            commands::get_tuning_session,
            commands::get_tuning_session_by_run,
            commands::save_tuning_trial,
            commands::list_tuning_trials,
            commands::get_best_trial,
            // Experiments
            commands::create_experiment,
            commands::update_experiment,
            commands::list_experiments,
            commands::get_experiment,
            commands::delete_experiment,
            // Run Annotations
            commands::update_run_display_name,
            commands::set_run_experiment,
            commands::set_run_note,
            commands::get_run_note,
            commands::delete_run_note,
            commands::add_run_tag,
            commands::remove_run_tag,
            commands::get_run_tags,
            commands::list_all_tags,
            commands::get_runs_for_comparison,
            // Model Metadata & Tags (v9)
            commands::update_model_version_metadata,
            commands::update_model_version_training_info,
            commands::update_model_version_export_path,
            commands::add_model_tag,
            commands::remove_model_tag,
            commands::get_model_tags,
            commands::list_all_model_tags,
            commands::list_all_model_versions_filtered,
            commands::get_model_versions_for_comparison,
            commands::get_comparable_versions,
            // HTTP Server (v10)
            commands::start_http_server,
            commands::stop_http_server,
            commands::get_http_server_status,
            commands::get_http_server_metrics,
            commands::reset_http_server_metrics,
            commands::get_serving_version_id,
            commands::delete_model_version_safe,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
