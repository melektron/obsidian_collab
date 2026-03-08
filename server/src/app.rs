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

use crate::webserver::WebServer;

pub struct AppState {
    pub terminate: CancellationToken,
}

pub struct App {
    app_state: Arc<AppState>,
    web_server: Arc<WebServer>
}

impl App {
    pub fn new() -> Self {
        let app_state = Arc::new(AppState {
            terminate: CancellationToken::new(),
        });

        let web_server = Arc::new(WebServer::new(
            &app_state
        ));

        Self { 
            app_state,
            web_server
        }
    }

    pub async fn run(&self) -> Result<()> {

        let results = tokio::join!(
            self.web_server.clone().run()
        );

        Ok(())
    }

}
