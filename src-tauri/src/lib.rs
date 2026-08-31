use std::sync::{Arc, Mutex};

use serde_json::Value;
use tauri::async_runtime::spawn;
use tauri::{AppHandle, Emitter, State};
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
        .manage(SidecarState {
            child: Arc::new(Mutex::new(None)),
        })
        .invoke_handler(tauri::generate_handler![
            start_agent_bridge,
            send_bridge_command
        ])
        .run(tauri::generate_context!())
        .expect("error while running EVO desktop application");
}