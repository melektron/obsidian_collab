/*
ELEKTRON © 2026 - now
Written by melektron
www.elektron.work
15.03.26, 13:08

REPL for direct interaction with the collab server
while it is running.
*/

// TODO: impl this, with (shellfish+)rustyline+clap
// TODO: maybe replace env_logger with custom logger or at least make sure env_logger prints through rustylines external printer.
// see: https://chatgpt.com/g/g-p-697004bf59108191a3ab68bb4f2401ee-obsidian-collab/c/69b69b55-e47c-8389-bfb5-27d3fd6635ef

use anyhow::{Context, Result};
use log::info;
use rustyline_async::{Readline, ReadlineEvent, SharedWriter};
use std::sync::{Arc, Mutex};
use tokio_util::future::FutureExt;

use crate::app::AppState;

pub type ReplIo = (Readline, SharedWriter);

pub struct Repl {
    app_state: Arc<AppState>,
    rl: Mutex<Readline>,
    _stdout: SharedWriter,
}

impl Repl {
    pub fn new(app_state: &Arc<AppState>, io: ReplIo) -> Self {
        Self {
            app_state: app_state.clone(),
            rl: Mutex::new(io.0),
            _stdout: io.1,
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
                    rl.add_history_entry(line.clone());
                    info!("Got a line: {line}");
                    if line == "q" {
                        self.app_state.terminate.cancel();
                    }
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
}
