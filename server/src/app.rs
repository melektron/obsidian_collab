/*
ELEKTRON © 2026 - now
Written by melektron
www.elektron.work
08.03.26, 15:24


*/

use std::sync::Arc;

use anyhow::Result;
use log::info;
use tokio_util::sync::CancellationToken;

use crate::{
    args::Args,
    doc_provider::DocProvider,
    repl::{Repl, ReplIo},
    webserver::WebServer,
};

pub struct AppState {
    pub terminate: CancellationToken,
}

pub struct App {
    args: Args,
    _app_state: Arc<AppState>,
    doc_provider: Arc<DocProvider>,
    web_server: Arc<WebServer>,
    repl: Option<Arc<Repl>>,
}

impl App {
    pub fn new(
        args: Args,
        // optional repl IO when running interactively
        repl_io: Option<ReplIo>,
    ) -> Self {
        let app_state = Arc::new(AppState {
            terminate: CancellationToken::new(),
        });

        let doc_provider = Arc::new(DocProvider::new(&app_state));

        let web_server = Arc::new(WebServer::new(&app_state, &doc_provider));

        // only create repl if it exists
        let repl = repl_io.map(|io| Arc::new(Repl::new(&app_state, &doc_provider, io)));

        Self {
            args,
            _app_state: app_state,
            doc_provider,
            web_server,
            repl,
        }
    }

    pub async fn run(&self) -> Result<()> {
        info!("Storing persistent data in {}", self.args.data.display());

        // run all components until all complete or one fails.
        // run repl only if it it is available
        if let Some(repl) = &self.repl {
            tokio::try_join!(
                self.doc_provider.clone().run(),
                self.web_server.clone().run(),
                repl.clone().run(),
            )?;
        } else {
            tokio::try_join!(
                self.doc_provider.clone().run(),
                self.web_server.clone().run(),
            )?;
        }

        Ok(())
    }
}
