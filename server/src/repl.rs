/*
ELEKTRON © 2026 - now
Written by melektron
www.elektron.work
15.03.26, 13:08

REPL for direct interaction with the collab server
while it is running.
*/

use anstyle::{AnsiColor, Style};
use anyhow::{Context, Result};
use clap::{CommandFactory, Parser, Subcommand};
use log::info;
use rustyline_async::{Readline, ReadlineEvent, SharedWriter};
use yrs::{AsyncTransact, GetString, Text};
use std::io::Write;
use std::sync::{Arc, Mutex};
use tokio_util::future::FutureExt;

use crate::app::AppState;
use crate::doc_provider::{DOC_ID, DocProvider};
use crate::errors::CollabError;

pub fn handle_write_fail(r: Result<(), std::io::Error>) {
    if let Err(e) = r {
        eprintln!("Failed to write to interactive console: {e:?}")
    }
}


fn colorize(color: AnsiColor, text: &str) -> String {
    let style = Style::new().fg_color(Some(color.into()));
    format!("{style}{text}{}", anstyle::Reset)
}

macro_rules! shelloutln {
    // colored form: self, color => fmt, args...
    ($self:expr, $color:expr => $fmt:expr $(, $args:expr)* $(,)?) => {
        handle_write_fail(
            writeln!(
                $self.stdout.clone(),
                "{}",
                colorize($color, &format!($fmt $(, $args)*))
            )
        )
    };

    // plain form: self, fmt, args...
    ($self:expr, $fmt:expr $(, $args:expr)* $(,)?) => {
        handle_write_fail(
            writeln!(
                $self.stdout.clone(),
                $fmt $(, $args)*
            )
        )
    };
}

#[expect(unused)]
macro_rules! shellout {
    // colored form: self, color => fmt, args...
    ($self:expr, $color:expr => $fmt:expr $(, $args:expr)* $(,)?) => {
        handle_write_fail(
            write!(
                $self.stdout.clone(),
                "{}",
                colorize($color, &format!($fmt $(, $args)*))
            )
        )
    };

    // plain form: self, fmt, args...
    ($self:expr, $fmt:expr $(, $args:expr)* $(,)?) => {
        handle_write_fail(
            write!(
                $self.stdout.clone(),
                $fmt $(, $args)*
            )
        )
    };
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

    #[command(alias = "a", about = "Appends text to the document")]
    Append {
        text: String,
    },

    #[command(alias = "i", about = "Inserts text into the document")]
    Insert {
        position: u16,
        text: String,
    },

    #[command(alias = "d", about = "Deletes a range of text in the document")]
    Delete {
        position: u16,
        len: u16,
    },

    #[command(alias = "p", about = "Prints the current document")]
    Print,

}

pub type ReplIo = (Readline, SharedWriter);

pub struct Repl {
    app_state: Arc<AppState>,
    doc_provider: Arc<DocProvider>,

    rl: Mutex<Readline>,
    stdout: SharedWriter,
}

impl Repl {
    pub fn new(app_state: &Arc<AppState>, doc_provider: &Arc<DocProvider>, io: ReplIo) -> Self {
        Self {
            app_state: app_state.clone(),
            doc_provider: doc_provider.clone(),
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
                            shelloutln!(self, AnsiColor::Red => "Syntax error: {e}");
                            continue;
                        }
                        Err(e) => {
                            // filter unknown errors
                            let Some(clap_error) = e.downcast_ref::<clap::Error>() else {
                                shelloutln!(self, AnsiColor::Red => "Unexpected error during REPL command parsing: {e}");
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
                    if let Err(e) = self.handle_command(command).await {
                        shelloutln!(self, AnsiColor::Red => "Command failed: {e}");
                    };
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

    async fn handle_command(&self, cmd: ReplCommands) -> Result<()> {
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
            ReplCommands::Append { text } => {
                let doc = self.doc_provider.get_doc_by_id(DOC_ID);
                let ydoc = doc.ydoc.lock().map_err(|_| CollabError::LockFailed)?;

                let mut txn = ydoc.transact_mut().await;
                shelloutln!(self, "Before: {}", doc.text.get_string(&txn));

                let old_len = doc.text.len(&txn);
                doc.text.insert(&mut txn, old_len, text.as_str());
                txn.commit();
                
                shelloutln!(self, "After: {}", doc.text.get_string(&txn));
            }
            ReplCommands::Insert { position, text } => {
                let doc = self.doc_provider.get_doc_by_id(DOC_ID);
                let ydoc = doc.ydoc.lock().map_err(|_| CollabError::LockFailed)?;

                let mut txn = ydoc.transact_mut().await;
                shelloutln!(self, "Before: {}", doc.text.get_string(&txn));
                
                doc.text.insert(&mut txn, position.into(), text.as_str());
                txn.commit();

                shelloutln!(self, "After: {}", doc.text.get_string(&txn));
            }
            ReplCommands::Delete { position, len } => {
                let doc = self.doc_provider.get_doc_by_id(DOC_ID);
                let ydoc = doc.ydoc.lock().map_err(|_| CollabError::LockFailed)?;

                let mut txn = ydoc.transact_mut().await;
                shelloutln!(self, "Before: {}", doc.text.get_string(&txn));
                
                doc.text.remove_range(&mut txn, position.into(), len.into());
                txn.commit();

                shelloutln!(self, "After: {}", doc.text.get_string(&txn));

            }
            ReplCommands::Print => {
                let doc = self.doc_provider.get_doc_by_id(DOC_ID);
                let ydoc = doc.ydoc.lock().map_err(|_| CollabError::LockFailed)?;
                let txn = ydoc.transact().await;
                shelloutln!(self, "{}", doc.text.get_string(&txn));
            }
        }

        Ok(())
    }
}
