mod app;
mod args;
mod client_repr;
mod collab_proto;
mod doc_provider;
mod repl;
mod webserver;
mod errors;

use std::{
    io::{IsTerminal},
    process::ExitCode,
};

use anyhow::Context;
use clap::Parser;
use env_logger::{Env, WriteStyle, fmt::Formatter};
use log::{Record, info};
use rustyline_async::Readline;

use crate::{args::Args, repl::ReplIo};

const DEFAULT_LOG_LEVEL: &str = "info";

fn format_log(buf: &mut Formatter, record: &Record) -> Result<(), std::io::Error> {
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
}

#[tokio::main]
async fn main() -> ExitCode {
    // parse commandline arguments
    let args = Args::parse();

    // check whether we are running interactively, meaning both input and at least stdout
    // are attached to a tty, otherwise we disable the repl.
    let is_terminal = std::io::stdin().is_terminal() && std::io::stdout().is_terminal();
    let mut repl_io: Option<ReplIo> = None;

    if (is_terminal && args.force_repl == None) || args.force_repl == Some(true) {
        // initialize interactive readline editor
        let (rl, stdout) = Readline::new(">> ".to_string())
            .context("Setup interactive line editor")
            .unwrap();

        // save readline and stdout instance for use by repl
        repl_io = Some((rl, stdout.clone()));


        // setup logging to repl stdout
        env_logger::Builder::from_env(Env::default().default_filter_or(DEFAULT_LOG_LEVEL))
            .format(format_log)
            .target(env_logger::Target::Pipe(Box::new(stdout.clone())))
            // force allow ANSI sequences (pipe target normally disables them)
            .write_style(WriteStyle::Always)
            .init();

        info!("== Collab server starting ==");
        info!(
            "Running interactively{}.",
            if args.force_repl == Some(true) && !is_terminal {
                " (forced)"
            } else {
                ""
            }
        );
    } else {
        // setup logging to stdout
        env_logger::Builder::from_env(Env::default().default_filter_or(DEFAULT_LOG_LEVEL))
            .format(format_log)
            .target(env_logger::Target::Stdout)
            .init();

        info!("== Collab server starting ==");
        info!(
            "Running non-interactively, disabling repl (in: {}, out: {}).",
            std::io::stdin().is_terminal(),
            std::io::stdout().is_terminal()
        );
    }

    let app = app::App::new(args, repl_io);
    if let Err(e) = app
        .run()
        .await
        .context("Application core terminated with error")
    {
        // print global application error using logger rather
        // than default std::process::Termination output
        eprintln!("{e:?}"); // logging via error! may not work anymore here due to repl shutdown
        return ExitCode::FAILURE;
    }

    println!("Exiting..."); // logging via info! may not work anymore here due to repl shutdown
    return ExitCode::SUCCESS;
}
