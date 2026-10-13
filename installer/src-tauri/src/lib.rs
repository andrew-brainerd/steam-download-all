mod error;
mod millennium;
mod plan;
mod standalone;
mod system;

use serde::Serialize;
use tauri::{AppHandle, Emitter};

use error::InstallerError;
use plan::{Action, Installed, Step};

#[derive(Serialize)]
struct Detection {
    steam_found: bool,
    steam_path: Option<String>,
    steam_running: bool,
    millennium: bool,
    plugin: bool,
    plugin_enabled: bool,
    standalone: bool,
}

#[derive(Clone, Serialize)]
struct PlannedStep {
    id: Step,
    label: &'static str,
}

#[derive(Clone, Serialize)]
#[serde(tag = "status", rename_all = "snake_case")]
enum StepEvent {
    Running { index: usize },
    Progress { index: usize, fraction: f64 },
    Done { index: usize },
    Failed { index: usize, message: String },
}

fn installed(steam: &std::path::Path) -> Installed {
    Installed {
        millennium: millennium::is_installed(steam),
        plugin: millennium::plugin_installed(steam),
        standalone: standalone::is_installed(),
    }
}

#[tauri::command]
fn detect() -> Detection {
    let steam = system::steam_path();
    let state = steam.as_deref().map(installed).unwrap_or_default();
    let plugin_enabled = steam.as_deref().is_some_and(millennium::plugin_enabled);
    Detection {
        steam_found: steam.is_some(),
        steam_path: steam.map(|p| p.display().to_string()),
        steam_running: system::is_running("steam.exe"),
        millennium: state.millennium,
        plugin: state.plugin,
        plugin_enabled,
        standalone: state.standalone,
    }
}

#[tauri::command]
fn plan(action: Action) -> Result<Vec<PlannedStep>, InstallerError> {
    let steam = system::steam_path().ok_or(InstallerError::SteamNotFound)?;
    Ok(plan::steps(action, installed(&steam))
        .into_iter()
        .map(|id| PlannedStep {
            id,
            label: id.label(),
        })
        .collect())
}

#[tauri::command]
async fn execute(app: AppHandle, action: Action) -> Result<(), InstallerError> {
    let steam = system::steam_path().ok_or(InstallerError::SteamNotFound)?;
    let steps = plan::steps(action, installed(&steam));
    let emit = |event: StepEvent| {
        let _ = app.emit("step", event);
    };
    let mut millennium_zip = None;

    for (index, step) in steps.into_iter().enumerate() {
        emit(StepEvent::Running { index });
        let result = run_step(step, &steam, &mut millennium_zip, |fraction| {
            emit(StepEvent::Progress { index, fraction })
        })
        .await;
        if let Err(error) = result {
            emit(StepEvent::Failed {
                index,
                message: error.to_string(),
            });
            return Err(error);
        }
        emit(StepEvent::Done { index });
    }
    Ok(())
}

async fn run_step(
    step: Step,
    steam: &std::path::Path,
    millennium_zip: &mut Option<std::path::PathBuf>,
    progress: impl FnMut(f64),
) -> Result<(), InstallerError> {
    let steam = steam.to_path_buf();
    let blocking = |work: Box<dyn FnOnce() -> Result<(), InstallerError> + Send>| async move {
        tauri::async_runtime::spawn_blocking(work)
            .await
            .map_err(|e| InstallerError::Io(std::io::Error::other(e.to_string())))?
    };
    match step {
        Step::DownloadMillennium => {
            let asset = millennium::latest_release().await?;
            *millennium_zip = Some(millennium::download(&asset, progress).await?);
            Ok(())
        }
        Step::CloseSteam => {
            blocking(Box::new(move || {
                system::close_steam(&steam);
                Ok(())
            }))
            .await
        }
        Step::InstallMillennium => {
            let zip = millennium_zip
                .take()
                .ok_or(InstallerError::NoMillenniumAsset)?;
            blocking(Box::new(move || millennium::extract(&zip, &steam))).await
        }
        Step::InstallPlugin => blocking(Box::new(move || millennium::install_plugin(&steam))).await,
        Step::RemovePlugin => blocking(Box::new(move || millennium::remove_plugin(&steam))).await,
        Step::InstallStandalone => blocking(Box::new(move || standalone::install(&steam))).await,
        Step::RemoveStandalone => blocking(Box::new(move || standalone::remove(&steam))).await,
        Step::RemoveMillennium => blocking(Box::new(move || millennium::remove_core(&steam))).await,
        Step::StartSteam => {
            tokio::time::sleep(std::time::Duration::from_secs(1)).await;
            system::launch_detached(&steam.join("steam.exe"))?;
            Ok(())
        }
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![detect, plan, execute])
        .run(tauri::generate_context!())
        .expect("error while running the installer");
}
