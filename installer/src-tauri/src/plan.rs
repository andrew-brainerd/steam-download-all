use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, PartialEq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum Step {
    DownloadMillennium,
    CloseSteam,
    InstallMillennium,
    InstallPlugin,
    RemoveStandalone,
    RemovePlugin,
    InstallStandalone,
    RemoveMillennium,
    StartSteam,
}

impl Step {
    pub fn label(self) -> &'static str {
        match self {
            Step::DownloadMillennium => "Downloading Millennium",
            Step::CloseSteam => "Closing Steam",
            Step::InstallMillennium => "Installing Millennium",
            Step::InstallPlugin => "Installing the Download All plugin",
            Step::RemoveStandalone => "Removing the standalone version",
            Step::RemovePlugin => "Removing the Millennium plugin",
            Step::InstallStandalone => "Installing standalone Download All",
            Step::RemoveMillennium => "Removing Millennium",
            Step::StartSteam => "Starting Steam",
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Deserialize)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub enum Action {
    InstallMillennium,
    InstallStandalone,
    Remove {
        download_all: bool,
        millennium: bool,
    },
}

#[derive(Debug, Clone, Copy, Default)]
pub struct Installed {
    pub millennium: bool,
    pub plugin: bool,
    pub standalone: bool,
}

/// The ordered steps for an action. Downloads happen before Steam closes to keep it closed briefly.
pub fn steps(action: Action, installed: Installed) -> Vec<Step> {
    let mut steps = Vec::new();
    match action {
        Action::InstallMillennium => {
            if !installed.millennium {
                steps.push(Step::DownloadMillennium);
            }
            steps.push(Step::CloseSteam);
            if !installed.millennium {
                steps.push(Step::InstallMillennium);
            }
            steps.push(Step::InstallPlugin);
            if installed.standalone {
                steps.push(Step::RemoveStandalone);
            }
        }
        Action::InstallStandalone => {
            steps.push(Step::CloseSteam);
            if installed.plugin {
                steps.push(Step::RemovePlugin);
            }
            steps.push(Step::InstallStandalone);
        }
        Action::Remove {
            download_all,
            millennium,
        } => {
            steps.push(Step::CloseSteam);
            if download_all && installed.plugin {
                steps.push(Step::RemovePlugin);
            }
            if download_all && installed.standalone {
                steps.push(Step::RemoveStandalone);
            }
            if millennium && installed.millennium {
                steps.push(Step::RemoveMillennium);
            }
        }
    }
    steps.push(Step::StartSteam);
    steps
}

#[cfg(test)]
mod tests {
    use super::*;

    const NOTHING: Installed = Installed {
        millennium: false,
        plugin: false,
        standalone: false,
    };

    #[test]
    fn millennium_install_downloads_before_closing_steam() {
        assert_eq!(
            steps(Action::InstallMillennium, NOTHING),
            vec![
                Step::DownloadMillennium,
                Step::CloseSteam,
                Step::InstallMillennium,
                Step::InstallPlugin,
                Step::StartSteam
            ]
        );
    }

    #[test]
    fn millennium_install_skips_millennium_when_present_and_swaps_out_standalone() {
        let installed = Installed {
            millennium: true,
            plugin: false,
            standalone: true,
        };
        assert_eq!(
            steps(Action::InstallMillennium, installed),
            vec![
                Step::CloseSteam,
                Step::InstallPlugin,
                Step::RemoveStandalone,
                Step::StartSteam
            ]
        );
    }

    #[test]
    fn standalone_install_removes_the_millennium_plugin_but_not_millennium() {
        let installed = Installed {
            millennium: true,
            plugin: true,
            standalone: false,
        };
        assert_eq!(
            steps(Action::InstallStandalone, installed),
            vec![
                Step::CloseSteam,
                Step::RemovePlugin,
                Step::InstallStandalone,
                Step::StartSteam
            ]
        );
    }

    #[test]
    fn remove_only_touches_selected_and_installed_parts() {
        let installed = Installed {
            millennium: true,
            plugin: true,
            standalone: false,
        };
        assert_eq!(
            steps(
                Action::Remove {
                    download_all: true,
                    millennium: false
                },
                installed
            ),
            vec![Step::CloseSteam, Step::RemovePlugin, Step::StartSteam]
        );
        assert_eq!(
            steps(
                Action::Remove {
                    download_all: true,
                    millennium: true
                },
                installed
            ),
            vec![
                Step::CloseSteam,
                Step::RemovePlugin,
                Step::RemoveMillennium,
                Step::StartSteam
            ]
        );
    }
}
