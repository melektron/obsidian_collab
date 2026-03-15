mod app;
mod args;
mod client_repr;
mod collab_proto;
mod doc_provider;
mod webserver;

use std::process::ExitCode;

use anyhow::Context;
use clap::Parser;
use log::{error, info};

use crate::args::Args;

#[tokio::main]
async fn main() -> ExitCode {
    // setup logging
    env_logger::Builder::from_default_env()
        .filter_level(log::LevelFilter::Debug)
        .format(|buf, record| {
            use std::io::Write;

            const LOC_MAX: usize = 24;

            let level = record.level();
            let color = match level {
                log::Level::Error => "\x1b[31m",
                log::Level::Warn => "\x1b[33m",
                log::Level::Info => "\x1b[32m",
                log::Level::Debug => "\x1b[34m",
                log::Level::Trace => "\x1b[35m",
            };

            // build file:line string
            let file = record.file().unwrap_or("?");
            let line = record.line().unwrap_or(0);
            let mut loc = format!("{file}:{line}");

            // cap length (keep rightmost part, usually the file name)
            if loc.len() > LOC_MAX {
                loc = format!("…{}", &loc[loc.len() - (LOC_MAX - 1)..]);
            }

            // fixed-width padding
            let loc = format!("{loc:>LOC_MAX$}");

            writeln!(
                buf,
                "{}[{}] [{}] {}\x1b[0m",
                color,
                level.as_str().chars().next().unwrap(), // levels are static constants, always longer than 1 char
                loc,
                record.args()
            )
        })
        .init();

    // parse commandline arguments
    let args = Args::parse();

    info!("== Collab server starting ==");

    let app = app::App::new(args);
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
