use std::os::windows::process::CommandExt;
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};
use std::time::{Duration, Instant};

const CREATE_NO_WINDOW: u32 = 0x0800_0000;
const DETACHED_PROCESS: u32 = 0x0000_0008;
const STEAM_CLOSE_TIMEOUT: Duration = Duration::from_secs(60);

pub fn hidden(program: impl AsRef<std::ffi::OsStr>) -> Command {
    let mut command = Command::new(program);
    command
        .creation_flags(CREATE_NO_WINDOW)
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());
    command
}

pub fn steam_path() -> Option<PathBuf> {
    let key = winreg::RegKey::predef(winreg::enums::HKEY_CURRENT_USER)
        .open_subkey(r"Software\Valve\Steam")
        .ok()?;
    let path: String = key.get_value("SteamPath").ok()?;
    let path = PathBuf::from(path.replace('/', "\\"));
    path.join("steam.exe").exists().then_some(path)
}

pub fn is_running(image: &str) -> bool {
    hidden("tasklist")
        .args(["/FI", &format!("IMAGENAME eq {image}"), "/NH", "/FO", "CSV"])
        .output()
        .map(|out| {
            String::from_utf8_lossy(&out.stdout)
                .to_lowercase()
                .contains(&image.to_lowercase())
        })
        .unwrap_or(false)
}

pub fn kill(image: &str) {
    let _ = hidden("taskkill").args(["/IM", image, "/F"]).output();
}

pub fn wait_until_stopped(image: &str, timeout: Duration) -> bool {
    let start = Instant::now();
    while is_running(image) {
        if start.elapsed() > timeout {
            return false;
        }
        std::thread::sleep(Duration::from_millis(750));
    }
    true
}

/// Asks Steam to exit cleanly, falling back to a force-kill after a minute.
pub fn close_steam(steam: &Path) {
    if !is_running("steam.exe") {
        return;
    }
    let _ = hidden(steam.join("steam.exe")).arg("-shutdown").spawn();
    if !wait_until_stopped("steam.exe", STEAM_CLOSE_TIMEOUT) {
        kill("steam.exe");
        wait_until_stopped("steam.exe", Duration::from_secs(10));
    }
    wait_until_stopped("steamwebhelper.exe", Duration::from_secs(15));
}

pub fn launch_detached(exe: &Path) -> std::io::Result<()> {
    let mut command = Command::new(exe);
    if let Some(dir) = exe.parent() {
        command.current_dir(dir);
    }
    command
        .creation_flags(DETACHED_PROCESS | CREATE_NO_WINDOW)
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .spawn()
        .map(|_| ())
}

pub fn startup_folder() -> Option<PathBuf> {
    std::env::var_os("APPDATA").map(|appdata| {
        PathBuf::from(appdata).join(r"Microsoft\Windows\Start Menu\Programs\Startup")
    })
}

fn ps_quote(value: &Path) -> String {
    format!("'{}'", value.display().to_string().replace('\'', "''"))
}

pub fn create_shortcut(shortcut: &Path, target: &Path, description: &str) -> std::io::Result<()> {
    let working_dir = target.parent().unwrap_or(target);
    let script = format!(
        "$s = (New-Object -ComObject WScript.Shell).CreateShortcut({}); $s.TargetPath = {}; $s.WorkingDirectory = {}; $s.Description = '{}'; $s.Save()",
        ps_quote(shortcut),
        ps_quote(target),
        ps_quote(working_dir),
        description.replace('\'', "''")
    );
    let out = hidden("powershell")
        .args([
            "-NoProfile",
            "-NonInteractive",
            "-ExecutionPolicy",
            "Bypass",
            "-Command",
            &script,
        ])
        .output()?;
    if out.status.success() {
        Ok(())
    } else {
        Err(std::io::Error::other(
            String::from_utf8_lossy(&out.stderr).trim().to_string(),
        ))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn ps_quote_escapes_single_quotes() {
        assert_eq!(
            ps_quote(Path::new(r"C:\Users\O'Neil\x.lnk")),
            r"'C:\Users\O''Neil\x.lnk'"
        );
    }
}
