mod app;
mod webserver;

use std::process::ExitCode;

use anyhow::Context;
use log::{error, info};

#[tokio::main]
async fn main() -> ExitCode {
    // setup logging
    env_logger::Builder::from_default_env()
        .filter_level(log::LevelFilter::Debug) // show everything except Trace
        .format(|buf, record| {
            use std::io::Write;
            let level = record.level();
            let color = match level {
                log::Level::Error => "\x1b[31m", // red
                log::Level::Warn => "\x1b[33m",  // yellow
                log::Level::Info => "\x1b[32m",  // green
                log::Level::Debug => "\x1b[34m", // blue
                log::Level::Trace => "\x1b[35m", // magenta
            };
            writeln!(buf, "{}[{}] {}\x1b[0m", color, level, record.args())
        })
        .init();

    info!("== Collab server starting ==");

    let app = app::App::new();
    if let Err(e) = app
        .run()
        .await
        .context("Application core terminated with error")
    {
        // print global application error using logger rather
        // than default std::process::Termination output
        error!("{e:?}");
        return ExitCode::FAILURE;
    }

    info!("Exiting...");
    return ExitCode::SUCCESS;
}
