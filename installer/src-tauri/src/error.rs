use thiserror::Error;

#[derive(Debug, Error)]
pub enum InstallerError {
    #[error("Steam isn't installed, or its install folder couldn't be found.")]
    SteamNotFound,
    #[error("Couldn't find a Windows build in Millennium's latest release.")]
    NoMillenniumAsset,
    #[error(
        "The Millennium download didn't match its published checksum, so it wasn't installed."
    )]
    ChecksumMismatch,
    #[error("The Millennium archive contains an unsafe path.")]
    UnsafeArchive,
    #[error("Couldn't locate your AppData folder.")]
    NoLocalAppData,
    #[error("Network error: {0}")]
    Network(#[from] reqwest::Error),
    #[error("Archive error: {0}")]
    Zip(#[from] zip::result::ZipError),
    #[error("Couldn't read or write Millennium's settings: {0}")]
    Json(#[from] serde_json::Error),
    #[error("{0}")]
    Io(#[from] std::io::Error),
}

impl serde::Serialize for InstallerError {
    fn serialize<S: serde::Serializer>(&self, serializer: S) -> Result<S::Ok, S::Error> {
        serializer.serialize_str(&self.to_string())
    }
}
