use std::path::{Path, PathBuf};
use std::time::Duration;

use crate::error::InstallerError;
use crate::system;

pub const EXE: &[u8] = include_bytes!("../payload/download-all.exe");
const IMAGE: &str = "download-all.exe";
const SHORTCUT: &str = "Download All.lnk";
const MARKER: &str = ".cef-enable-remote-debugging";

fn install_dir() -> Option<PathBuf> {
    std::env::var_os("LOCALAPPDATA").map(|dir| PathBuf::from(dir).join("DownloadAll"))
}

fn shortcut_path() -> Option<PathBuf> {
    system::startup_folder().map(|dir| dir.join(SHORTCUT))
}

pub fn is_installed() -> bool {
    install_dir().is_some_and(|dir| dir.join(IMAGE).exists())
}

fn stop() {
    if system::is_running(IMAGE) {
        system::kill(IMAGE);
        system::wait_until_stopped(IMAGE, Duration::from_secs(10));
    }
}

pub fn install(steam: &Path) -> Result<(), InstallerError> {
    let dir = install_dir().ok_or(InstallerError::NoLocalAppData)?;
    let exe = dir.join(IMAGE);
    stop();
    std::fs::create_dir_all(&dir)?;
    std::fs::write(&exe, EXE)?;
    std::fs::write(steam.join(MARKER), b"")?;
    let shortcut = shortcut_path().ok_or(InstallerError::NoLocalAppData)?;
    system::create_shortcut(
        &shortcut,
        &exe,
        "Adds a Download All button to the Steam Downloads page",
    )?;
    system::launch_detached(&exe)?;
    Ok(())
}

pub fn remove(steam: &Path) -> Result<(), InstallerError> {
    stop();
    if let Some(shortcut) = shortcut_path().filter(|p| p.exists()) {
        std::fs::remove_file(shortcut)?;
    }
    if let Some(dir) = install_dir().filter(|p| p.exists()) {
        std::fs::remove_dir_all(dir)?;
    }
    let marker = steam.join(MARKER);
    if marker.exists() {
        std::fs::remove_file(marker)?;
    }
    Ok(())
}
