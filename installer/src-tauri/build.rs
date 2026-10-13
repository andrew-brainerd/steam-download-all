fn main() {
    for file in [
        "payload/dev.brainerd.download-all.star",
        "payload/download-all.exe",
    ] {
        println!("cargo:rerun-if-changed={file}");
        if !std::path::Path::new(file).exists() {
            panic!("{file} is missing; run `pnpm payload` in installer/ first");
        }
    }
    tauri_build::build()
}
