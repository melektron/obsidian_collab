/*
ELEKTRON © 2026 - now
Written by melektron
www.elektron.work
08.03.26, 17:10

Subsystem for handling web/websocket requests
*/

use std::sync::Arc;

use anyhow::{Context, Result};
use axum::{Router, routing::get};
use tokio::net::TcpListener;

use crate::{app::AppState, doc_provider::DocProvider};


pub struct WebServer {
    app_state: Arc<AppState>,
    doc_provider: Arc<DocProvider>,
}

mod routes {
    use std::{sync::Arc};

    use axum::{extract::{Path, State, WebSocketUpgrade, ws::WebSocket}, response::Response};
    use log::{error, info};
    
    use crate::{client_repr::ClientRepr, webserver::WebServer};

    pub async fn health_check(
        State(state): State<Arc<WebServer>>
    ) -> &'static str {
        state.print_stuff();
        "Healthy"
    }
    
    pub async fn terminate(
        State(state): State<Arc<WebServer>>,
        Path((user_id, id2)): Path<(String, String)>
    ) -> String {
        if user_id == "yes" {
            state.app_state.terminate.cancel();
        }
        format!("Done, user_id: {user_id}, id2: {id2}")
    }

    pub async fn collab_ws(
        State(state): State<Arc<WebServer>>,
        upgrade_handler: WebSocketUpgrade
    ) -> Response {
        upgrade_handler
            .on_failed_upgrade(|error| {
                error!("Websocket upgrade failed: {error}")
            })
            .on_upgrade(|socket| async {
                handle_collab_client(state, socket).await
            })
    }

    pub async fn handle_collab_client(
        state: Arc<WebServer>,
        socket: WebSocket
    ) {
        info!("Collab client connected");
        let client = ClientRepr::new(
            &state.app_state,
            &state.doc_provider,
            socket
        );
        if let Err(e) = client.run().await {
            error!("Collab client handler crashed, disconnecting: {e:?}");
            return 
        };
        info!("Collab client disconnected");
    }
}

impl WebServer {
    pub fn new(
        app_state: &Arc<AppState>,
        doc_provider: &Arc<DocProvider>,
    ) -> Self {
        Self { 
            app_state: app_state.clone(),
            doc_provider: doc_provider.clone()
        }
    }

    pub async fn run(self: Arc<Self>) -> Result<()> {
        let listener = TcpListener::bind("0.0.0.0:1234")
            .await
            .context("Binding TCP listener for HTTP")?;

        let app = Router::new()
            .route("/health", get(routes::health_check))
            .route("/terminate/{id}/{id2}/now", get(routes::terminate))
            .route("/collab", get(routes::collab_ws))
            .with_state(self.clone());

        axum::serve(listener, app)
            .with_graceful_shutdown({
                let this = self.clone();
                // TODO: rewrite this so we cleanly disconnect all clients first 
                // before we "gracefully" shut down the server, which seems to just
                // cancel all the futures or at least close all sockets.
                async move { this.app_state.terminate.cancelled().await }
            })
            .await?;

        Ok(())
    }

    fn print_stuff(&self) {
        println!("Terminated: {}", if self.app_state.terminate.is_cancelled() { "yes" } else { "no" });
    }
}


