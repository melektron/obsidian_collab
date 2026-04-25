/*
ELEKTRON © 2026 - now
Written by melektron
www.elektron.work
15.03.26, 13:08

REPL for direct interaction with the collab server
while it is running.
*/

use anyhow::{Context, Result};
use clap::{CommandFactory, Parser, Subcommand};
use log::info;
use rustyline_async::{Readline, ReadlineEvent, SharedWriter};
use std::io::Write;
use std::sync::{Arc, Mutex};
use tokio_util::future::FutureExt;

use crate::app::AppState;

pub fn handle_write_fail(r: Result<(), std::io::Error>) {
    if let Err(e) = r {
        eprintln!("Failed to write to interactive console: {e:?}")
    }
}

#[derive(Parser, Debug)]
#[command(multicall = true)]
//#[command(no_binary_name = true)]
//#[command(disable_help_flag = true)]
//#[command(disable_help_subcommand = true)]
// unfortunately it is not possible to mutate the help command because it is
// created during actual command parsing, way after the builder has called these
// mut_subcommand hooks.
//#[clap(mut_subcommand("help", |cmd| cmd.visible_alias("h").visible_alias("?")))]
struct ReplInvocation {
    #[command(subcommand)]
    command: ReplCommands,
}

#[derive(Subcommand, Debug)]
enum ReplCommands {
    // custom hidden help command to act as a shortcut for the global help command.
    // This has to be done because the normal help command cannot be modified with mut_subcommand.
    // (this does not replace individual --help's of subcommands or "help <COMMAND>")
    #[command(
        name = "?",
        hide = true,
        about = "Shortcut for 'help'.\nThis doesn't replace 'help <SUBCOMMAND>'."
    )]
    HelpShortcut,

    #[command(
        visible_alias = "q",
        visible_alias = "quit",
        about = "Shuts down the server cleanly"
    )]
    Exit,

    Connect {
        host: String,

        #[arg(short, long, default_value_t = 8080)]
        port: u16,
    },

    Send {
        message: String,
    },
}

pub type ReplIo = (Readline, SharedWriter);

pub struct Repl {
    app_state: Arc<AppState>,
    rl: Mutex<Readline>,
    stdout: SharedWriter,
}

impl Repl {
    pub fn new(app_state: &Arc<AppState>, io: ReplIo) -> Self {
        Self {
            app_state: app_state.clone(),
            rl: Mutex::new(io.0),
            stdout: io.1,
        }
    }

    pub async fn run(self: Arc<Self>) -> Result<()> {
        let mut rl = self.rl.try_lock().unwrap();

        while let Some(event) = rl
            .readline()
            .with_cancellation_token(&self.app_state.terminate)
            .await
        {
            match event {
                Ok(rustyline_async::ReadlineEvent::Line(line)) => {
                    // empty command lines are ignored
                    if line.as_str().trim().is_empty() {
                        continue;
                    }

                    rl.add_history_entry(line.clone());

                    let command = match Self::parse_line(line.as_str()) {
                        Ok(invocation) => invocation.command,
                        Err(e) if e.downcast_ref::<shell_words::ParseError>().is_some() => {
                            // shell_words error comes from invalid syntax
                            handle_write_fail(writeln!(self.stdout.clone(), "Syntax error: {e}"));
                            continue;
                        }
                        Err(e) => {
                            // filter unknown errors
                            let Some(clap_error) = e.downcast_ref::<clap::Error>() else {
                                handle_write_fail(writeln!(
                                    self.stdout.clone(),
                                    "Unexpected error during REPL command parsing: {e}"
                                ));
                                continue;
                            };
                            // this is probably a clap error, so no prefix, it just prints the clap output (e.g. help text).
                            // This needs to be written directly to preserve ANSI styling
                            handle_write_fail(
                                self.stdout
                                    .clone()
                                    .write_all(clap_error.render().ansi().to_string().as_bytes()),
                            );
                            continue;
                        }
                    };

                    // valid command has been invoked
                    self.handle_command(command);
                }
                Ok(ReadlineEvent::Interrupted) => {
                    self.app_state.terminate.cancel();
                }
                Ok(ReadlineEvent::Eof) => {
                    info!("eof")
                }
                Err(e) => {
                    return Err(e).context("readline failed, REPL must stop");
                }
            }
        }

        Ok(())
    }

    fn parse_line(line: &str) -> Result<ReplInvocation> {
        // Split shell-style command string into argv tokens
        let args = shell_words::split(line)?;

        Ok(ReplInvocation::try_parse_from(args)?)
    }

    fn handle_command(&self, cmd: ReplCommands) {
        match cmd {
            ReplCommands::HelpShortcut => {
                handle_write_fail(
                    self.stdout.clone().write_all(
                        ReplInvocation::command()
                            .bin_name("")
                            .color(clap::ColorChoice::Always)
                            .render_long_help()
                            .ansi()
                            .to_string()
                            .as_bytes(),
                    ),
                );
            }
            ReplCommands::Exit => {
                self.app_state.terminate.cancel();
            }
            _ => {
                info!("Unhandled command: {cmd:?}");
            }
        }
    }
}
