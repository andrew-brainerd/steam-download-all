use std::io::{Read, Write};
use std::path::{Path, PathBuf};

use futures_util::StreamExt;
use serde::Deserialize;
use serde_json::{json, Value};
use sha2::{Digest, Sha256};

use crate::error::InstallerError;

const RELEASES_URL: &str =
    "https://api.github.com/repos/SteamClientHomebrew/Millennium/releases/latest";
const USER_AGENT: &str = "download-all-installer";
pub const PLUGIN_ID: &str = "dev.brainerd.download-all";
pub const PLUGIN_STAR: &[u8] = include_bytes!("../payload/dev.brainerd.download-all.star");

const CORE_FILES: &[&str] = &[
    "wsock32.dll",
    r"millennium\lib\millennium.dll",
    r"millennium\lib\millennium.hhx64.dll",
    r"millennium\bin\millennium.crashhandler64.exe",
    r"millennium\bin\millennium.luavm64.exe",
];

#[derive(Debug, Clone, PartialEq)]
pub struct ReleaseAsset {
    pub tag: String,
    pub url: String,
    pub size: u64,
    pub sha256: String,
}

#[derive(Deserialize)]
struct Release {
    tag_name: String,
    assets: Vec<Asset>,
}

#[derive(Deserialize)]
struct Asset {
    name: String,
    browser_download_url: String,
    size: u64,
    digest: Option<String>,
}

pub fn is_installed(steam: &Path) -> bool {
    steam.join("wsock32.dll").exists() && steam.join(r"millennium\lib\millennium.dll").exists()
}

fn plugin_path(steam: &Path) -> PathBuf {
    steam.join(format!(r"millennium\plugins\{PLUGIN_ID}.star"))
}

fn config_path(steam: &Path) -> PathBuf {
    steam.join(r"millennium\config\config.json")
}

pub fn plugin_installed(steam: &Path) -> bool {
    plugin_path(steam).exists()
}

pub fn plugin_enabled(steam: &Path) -> bool {
    std::fs::read_to_string(config_path(steam))
        .ok()
        .and_then(|text| serde_json::from_str::<Value>(&text).ok())
        .is_some_and(|config| is_plugin_enabled(&config))
}

fn is_plugin_enabled(config: &Value) -> bool {
    config["plugins"]["enabledPlugins"]
        .as_array()
        .is_some_and(|ids| ids.iter().any(|id| id.as_str() == Some(PLUGIN_ID)))
}

fn select_asset(release: Release) -> Option<ReleaseAsset> {
    let wanted = format!("millennium-{}-windows-x86_64.zip", release.tag_name);
    let asset = release.assets.into_iter().find(|a| a.name == wanted)?;
    let sha256 = asset.digest?.strip_prefix("sha256:")?.to_lowercase();
    Some(ReleaseAsset {
        tag: release.tag_name,
        url: asset.browser_download_url,
        size: asset.size,
        sha256,
    })
}

fn client() -> Result<reqwest::Client, InstallerError> {
    Ok(reqwest::Client::builder().user_agent(USER_AGENT).build()?)
}

pub async fn latest_release() -> Result<ReleaseAsset, InstallerError> {
    let release: Release = client()?
        .get(RELEASES_URL)
        .send()
        .await?
        .error_for_status()?
        .json()
        .await?;
    select_asset(release).ok_or(InstallerError::NoMillenniumAsset)
}

/// Downloads the release zip to the temp folder and verifies it against the release's SHA-256 digest.
pub async fn download(
    asset: &ReleaseAsset,
    mut progress: impl FnMut(f64),
) -> Result<PathBuf, InstallerError> {
    let target = std::env::temp_dir().join(format!("millennium-{}-windows-x86_64.zip", asset.tag));
    let response = client()?.get(&asset.url).send().await?.error_for_status()?;
    let total = response.content_length().unwrap_or(asset.size).max(1);
    let mut file = std::fs::File::create(&target)?;
    let mut hasher = Sha256::new();
    let mut received = 0u64;
    let mut stream = response.bytes_stream();
    while let Some(chunk) = stream.next().await {
        let chunk = chunk?;
        hasher.update(&chunk);
        file.write_all(&chunk)?;
        received += chunk.len() as u64;
        progress(received as f64 / total as f64);
    }
    drop(file);
    let actual = format!("{:x}", hasher.finalize());
    if actual != asset.sha256 {
        let _ = std::fs::remove_file(&target);
        return Err(InstallerError::ChecksumMismatch);
    }
    Ok(target)
}

pub fn extract(zip_path: &Path, steam: &Path) -> Result<(), InstallerError> {
    let mut archive = zip::ZipArchive::new(std::fs::File::open(zip_path)?)?;
    for i in 0..archive.len() {
        let mut entry = archive.by_index(i)?;
        let Some(relative) = entry.enclosed_name() else {
            return Err(InstallerError::UnsafeArchive);
        };
        let out = steam.join(relative);
        if entry.is_dir() {
            std::fs::create_dir_all(&out)?;
            continue;
        }
        if let Some(parent) = out.parent() {
            std::fs::create_dir_all(parent)?;
        }
        let mut bytes = Vec::with_capacity(entry.size() as usize);
        entry.read_to_end(&mut bytes)?;
        std::fs::write(&out, bytes)?;
    }
    let _ = std::fs::remove_file(zip_path);
    Ok(())
}

pub fn remove_core(steam: &Path) -> Result<(), InstallerError> {
    for file in CORE_FILES {
        let path = steam.join(file);
        if path.exists() {
            std::fs::remove_file(&path)?;
        }
    }
    for dir in [r"millennium\lib", r"millennium\bin"] {
        let _ = std::fs::remove_dir(steam.join(dir));
    }
    Ok(())
}

pub fn install_plugin(steam: &Path) -> Result<(), InstallerError> {
    let path = plugin_path(steam);
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent)?;
    }
    std::fs::write(&path, PLUGIN_STAR)?;
    update_config(steam, |config| set_plugin_enabled(config, true))
}

pub fn remove_plugin(steam: &Path) -> Result<(), InstallerError> {
    let path = plugin_path(steam);
    if path.exists() {
        std::fs::remove_file(&path)?;
    }
    if config_path(steam).exists() {
        update_config(steam, |config| set_plugin_enabled(config, false))?;
    }
    Ok(())
}

fn update_config(steam: &Path, change: impl FnOnce(Value) -> Value) -> Result<(), InstallerError> {
    let path = config_path(steam);
    let current = std::fs::read_to_string(&path)
        .ok()
        .and_then(|text| serde_json::from_str::<Value>(&text).ok())
        .unwrap_or_else(|| json!({}));
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent)?;
    }
    std::fs::write(&path, serde_json::to_string_pretty(&change(current))?)?;
    Ok(())
}

fn set_plugin_enabled(mut config: Value, enabled: bool) -> Value {
    if !config.is_object() {
        config = json!({});
    }
    let plugins = config
        .as_object_mut()
        .unwrap()
        .entry("plugins")
        .or_insert_with(|| json!({}));
    if !plugins.is_object() {
        *plugins = json!({});
    }
    let list = plugins
        .as_object_mut()
        .unwrap()
        .entry("enabledPlugins")
        .or_insert_with(|| json!([]));
    if !list.is_array() {
        *list = json!([]);
    }
    let list = list.as_array_mut().unwrap();
    list.retain(|id| id.as_str() != Some(PLUGIN_ID));
    if enabled {
        list.push(json!(PLUGIN_ID));
    }
    config
}

#[cfg(test)]
mod tests {
    use super::*;

    fn release(tag: &str, assets: Vec<(&str, Option<&str>)>) -> Release {
        Release {
            tag_name: tag.into(),
            assets: assets
                .into_iter()
                .map(|(name, digest)| Asset {
                    name: name.into(),
                    browser_download_url: format!("https://example.test/{name}"),
                    size: 10,
                    digest: digest.map(String::from),
                })
                .collect(),
        }
    }

    #[test]
    fn selects_the_windows_zip_and_its_digest() {
        let asset = select_asset(release(
            "v3.5.0",
            vec![
                ("millennium-v3.5.0-linux-x86_64.tar.gz", Some("sha256:aa")),
                ("millennium-v3.5.0-windows-x86_64.zip", Some("sha256:ABCD")),
            ],
        ))
        .unwrap();
        assert_eq!(asset.tag, "v3.5.0");
        assert_eq!(
            asset.url,
            "https://example.test/millennium-v3.5.0-windows-x86_64.zip"
        );
        assert_eq!(asset.sha256, "abcd");
    }

    #[test]
    fn refuses_assets_without_a_digest() {
        assert!(select_asset(release(
            "v1.0.0",
            vec![("millennium-v1.0.0-windows-x86_64.zip", None)]
        ))
        .is_none());
    }

    #[test]
    fn enabling_adds_the_plugin_once_and_keeps_other_settings() {
        let config = json!({ "general": { "injectCSS": true }, "plugins": { "enabledPlugins": ["other", PLUGIN_ID] } });
        let updated = set_plugin_enabled(config, true);
        assert_eq!(updated["general"]["injectCSS"], json!(true));
        assert_eq!(
            updated["plugins"]["enabledPlugins"],
            json!(["other", PLUGIN_ID])
        );
    }

    #[test]
    fn enabling_creates_missing_sections() {
        assert_eq!(
            set_plugin_enabled(json!({}), true),
            json!({ "plugins": { "enabledPlugins": [PLUGIN_ID] } })
        );
    }

    #[test]
    fn detects_whether_the_plugin_is_enabled() {
        assert!(is_plugin_enabled(
            &json!({ "plugins": { "enabledPlugins": [PLUGIN_ID] } })
        ));
        assert!(!is_plugin_enabled(
            &json!({ "plugins": { "enabledPlugins": ["other"] } })
        ));
        assert!(!is_plugin_enabled(&json!({})));
    }

    #[test]
    fn disabling_removes_only_this_plugin() {
        let config = json!({ "plugins": { "enabledPlugins": ["other", PLUGIN_ID] } });
        assert_eq!(
            set_plugin_enabled(config, false)["plugins"]["enabledPlugins"],
            json!(["other"])
        );
    }
}
