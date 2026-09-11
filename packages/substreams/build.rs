fn main() -> Result<(), Box<dyn std::error::Error>> {
    let protoc = protoc_bin_vendored::protoc_bin_path()?;
    std::env::set_var("PROTOC", protoc);
    prost_build::Config::new().compile_protos(
        &["proto/context.proto", "upstream/events.proto"],
        &[
            std::path::PathBuf::from("proto"),
            std::path::PathBuf::from("upstream"),
            protoc_bin_vendored::include_path()?,
        ],
    )?;
    println!("cargo:rerun-if-changed=proto/context.proto");
    println!("cargo:rerun-if-changed=upstream/events.proto");
    Ok(())
}
