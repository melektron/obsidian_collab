/*
ELEKTRON © 2026 - now
Written by melektron
www.elektron.work
08.03.26, 15:24


*/

use std::{
    net::SocketAddr,
    sync::{
        Arc,
        atomic::{AtomicBool, AtomicU32},
    },
    vec,
};

use anyhow::{Context, Result};
use axum::{Router, routing::get};
use log::{error, info};
use tokio::{
    io::{AsyncBufReadExt, AsyncReadExt, AsyncWriteExt, BufReader},
    net::{
        TcpListener, TcpStream,
        tcp::{ReadHalf, WriteHalf},
    },
    select,
    sync::{Notify, RwLock, Semaphore},
};
use tokio_util::sync::CancellationToken;

use crate::{args::Args, doc_provider::DocProvider, webserver::WebServer};

pub struct AppState {
    pub terminate: CancellationToken,
}

pub struct App {
    args: Args,
    app_state: Arc<AppState>,
    doc_provider: Arc<DocProvider>,
    web_server: Arc<WebServer>,
}

impl App {
    pub fn new(args: Args) -> Self {
        let app_state = Arc::new(AppState {
            terminate: CancellationToken::new(),
        });

        let doc_provider = Arc::new(DocProvider::new(
            &app_state
        ));

        let web_server = Arc::new(WebServer::new(
            &app_state,
            &doc_provider
        ));

        Self { 
            args,
            app_state,
            doc_provider,
            web_server
        }
    }

    pub async fn run(&self) -> Result<()> {

        info!("Storing persistent data in {}", self.args.data.display());

        // run all components until all complete or one fails
        tokio::try_join!(
            self.doc_provider.clone().run(),
            self.web_server.clone().run(),
        )?;

        Ok(())
    }

}
