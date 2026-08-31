use std::sync::{Arc, Mutex};

use serde_json::Value;
use tauri::async_runtime::spawn;
use tauri::menu::{Menu, MenuItem};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::{AppHandle, Emitter, Manager, State, WindowEvent};
use tauri_plugin_shell::process::{CommandChild, CommandEvent};
use tauri_plugin_shell::ShellExt;

struct SidecarState {
    child: Arc<Mutex<Option<CommandChild>>>,
}

#[tauri::command]
async fn start_agent_bridge(
    app: AppHandle,
    state: State<'_, SidecarState>,
) -> Result<(), String> {
    {
        let child = state
            .child
            .lock()
            .map_err(|_| "Agent bridge state is unavailable".to_string())?;
        if child.is_some() {
            return Ok(());
        }
    }

    let sidecar_command = app
        .shell()
        .sidecar("evo-bridge")
        .map_err(|error| format!("Failed to create sidecar command: {error}"))?;
    let (mut receiver, child) = sidecar_command
        .spawn()
        .map_err(|error| format!("Failed to spawn evo-bridge: {error}"))?;

    {
        let mut state_child = state
            .child
            .lock()
            .map_err(|_| "Agent bridge state is unavailable".to_string())?;
        *state_child = Some(child);
    }

    spawn(async move {
        while let Some(event) = receiver.recv().await {
            match event {
                CommandEvent::Stdout(bytes) | CommandEvent::Stderr(bytes) => {
                    let raw_line = String::from_utf8_lossy(&bytes).trim().to_string();
                    if !raw_line.is_empty() {
                        let _ = app.emit("agent-event", raw_line);
                    }
                }
                CommandEvent::Terminated(payload) => {
                    let _ = app.emit(
                        "agent-event",
                        serde_json::json!({
                            "type": "ERROR",
                            "error": format!("Agent bridge exited with code {:?}", payload.code)
                        })
                        .to_string(),
                    );
                    break;
                }
                _ => {}
            }
        }
    });

    Ok(())
}

#[tauri::command]
async fn send_bridge_command(
    command: String,
    payload: Value,
    state: State<'_, SidecarState>,
) -> Result<(), String> {
    let message = serde_json::json!({
        "command": command,
        "payload": payload,
    });
    let mut child = state
        .child
        .lock()
        .map_err(|_| "Agent bridge state is unavailable".to_string())?;
    let running_child = child
        .as_mut()
        .ok_or_else(|| "Agent bridge is not running".to_string())?;
    running_child
        .write(format!("{message}\n").as_bytes())
        .map_err(|error| format!("Failed to write to agent stdin: {error}"))
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_autostart::init(
            tauri_plugin_autostart::MacosLauncher::LaunchAgent,
            Some(vec!["--minimized"]),
        ))
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.show();
                let _ = window.unminimize();
                let _ = window.set_focus();
            }
        }))
        .manage(SidecarState {
            child: Arc::new(Mutex::new(None)),
        })
        .setup(|app| {
            #[cfg(desktop)]
            {
                use tauri_plugin_global_shortcut::{Code, GlobalShortcutExt, Modifiers, Shortcut, ShortcutState};

                let app_handle = app.handle().clone();

                let shortcut = Shortcut::new(Some(Modifiers::CONTROL | Modifiers::SHIFT), Code::KeyE);
                app.global_shortcut().on_shortcut(shortcut, move |_app, _shortcut, event| {
                    if event.state() == ShortcutState::Pressed {
                        if let Some(window) = app_handle.get_webview_window("main") {
                            if window.is_visible().unwrap_or(false) && window.is_focused().unwrap_or(false) {
                                let _ = window.hide();
                            } else {
                                let _ = window.show();
                                let _ = window.unminimize();
                                let _ = window.set_focus();
                            }
                        }
                    }
                })?;
            }

            let show_item = MenuItem::with_id(app, "show", "Show EVO", true, None::<&str>)?;
            let hide_item = MenuItem::with_id(app, "hide", "Hide EVO", true, None::<&str>)?;
            let quit_item = MenuItem::with_id(app, "quit", "Quit EVO", true, None::<&str>)?;
            let tray_menu = Menu::with_items(app, &[&show_item, &hide_item, &quit_item])?;

            let mut tray_builder = TrayIconBuilder::new()
                .menu(&tray_menu)
                .show_menu_on_left_click(false)
                .tooltip("EVO Desktop")
                .on_menu_event(|app, event| match event.id.as_ref() {
                    "show" => {
                        if let Some(window) = app.get_webview_window("main") {
                            let _ = window.show();
                            let _ = window.unminimize();
                            let _ = window.set_focus();
                        }
                    }
                    "hide" => {
                        if let Some(window) = app.get_webview_window("main") {
                            let _ = window.hide();
                        }
                    }
                    "quit" => {
                        app.exit(0);
                    }
                    _ => {}
                })
                .on_tray_icon_event(|tray, event| {
                    if let TrayIconEvent::Click {
                        button: MouseButton::Left,
                        button_state: MouseButtonState::Up,
                        ..
                    } = event
                    {
                        let app = tray.app_handle();
                        if let Some(window) = app.get_webview_window("main") {
                            if window.is_visible().unwrap_or(false) {
                                let _ = window.hide();
                            } else {
                                let _ = window.show();
                                let _ = window.unminimize();
                                let _ = window.set_focus();
                            }
                        }
                    }
                });

            if let Some(icon) = app.default_window_icon() {
                tray_builder = tray_builder.icon(icon.clone());
            }

            let _tray = tray_builder.build(app)?;

            Ok(())
        })
        .on_window_event(|window, event| {
            if let WindowEvent::CloseRequested { api, .. } = event {
                api.prevent_close();
                let _ = window.hide();
            }
        })
        .invoke_handler(tauri::generate_handler![
            start_agent_bridge,
            send_bridge_command
        ])
        .run(tauri::generate_context!())
        .expect("error while running EVO desktop application");
}