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

use crate::app::AppState;


pub struct WebServer {
    app_state: Arc<AppState>
}

mod routes {
    use std::sync::Arc;

    use anyhow::{Context, Result};
    use axum::{body::Bytes, extract::{Path, State, WebSocketUpgrade, ws::{CloseFrame, WebSocket}}, response::Response};
    use log::{debug, error, info};
    
    use crate::webserver::WebServer;

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

    pub async fn ws_handler(
        State(state): State<Arc<WebServer>>,
        upgrade_handler: WebSocketUpgrade
    ) -> Response {
        upgrade_handler
            .on_failed_upgrade(|error| {
                error!("Websocket upgrade failed: {error}")
            })
            .on_upgrade(|socket| async {
                if let Err(e) = handle_socket(state, socket).await {
                    error!("Websocket handler crashed: {e:?}")
                };
                ()
            })
    }

    pub async fn handle_socket(
        state: Arc<WebServer>,
        mut socket: WebSocket
    ) -> Result<()> {
        info!("Websocket connected");

        while let Some(msg) = socket.recv().await {
            let msg = msg.context("Error extracting websocket message")?;

            match &msg {
                axum::extract::ws::Message::Text(utf8_bytes) => {
                    info!("Got Text message: {}", utf8_bytes.as_str());
                    if utf8_bytes.as_str() == "terminate" {
                        state.app_state.terminate.cancel();
                    } else if utf8_bytes.as_str() == "kill" {
                        info!("Killing by dropping socket");
                        return Ok(());
                    } else if utf8_bytes.as_str() == "close" {
                        info!("Closing by sending close message");
                        socket.send(axum::extract::ws::Message::Close(Some(CloseFrame { 
                            code: 1001, reason: "close".into() 
                        }))).await?;
                    } else if utf8_bytes.as_str() == "cterm" {
                        info!("Closing by sending close message then terminating");
                        socket.send(axum::extract::ws::Message::Close(Some(CloseFrame { 
                            code: 1001, reason: "cterm".into() 
                        }))).await?;
                        state.app_state.terminate.cancel();
                    } else {
                        socket.send(msg).await?;
                    }
                    
                },
                axum::extract::ws::Message::Binary(bytes) => {
                    info!("Got Binary message: {:?}", bytes);
                    socket.send(msg).await?;
                },
                axum::extract::ws::Message::Ping(bytes) => {
                    info!("Got Ping message: {:?}", bytes);
                    // pong is apparently handled automatically
                    //socket.send(axum::extract::ws::Message::Pong(Bytes::new())).await?;
                },
                axum::extract::ws::Message::Pong(bytes) => {
                    info!("Got Pong message: {:?}", bytes);
                },
                axum::extract::ws::Message::Close(close_frame) => {
                    if let Some(close_frame) = close_frame {
                        info!("Got Close message: {:?}", close_frame)
                    } else {
                        info!("Got Close message that is None")
                    }
                },
            }
        }
        debug!("recv returned None");

        Ok(())
    }
}

impl WebServer {
    pub fn new(app_state: &Arc<AppState>) -> Self {
        WebServer { 
            app_state: app_state.clone()
        }
    }

    pub async fn run(self: Arc<Self>) -> Result<()> {
        let listener = TcpListener::bind("0.0.0.0:1234")
            .await
            .context("Binding TCP listener for HTTP")?;

        let app = Router::new()
            .route("/health", get(routes::health_check))
            .route("/terminate/{id}/{id2}/now", get(routes::terminate))
            .route("/ws", get(routes::ws_handler))
            .with_state(self.clone());

        axum::serve(listener, app)
            .with_graceful_shutdown({
                let this = self.clone();
                async move { this.app_state.terminate.cancelled().await }
            })
            .await?;

        Ok(())
    }

    fn print_stuff(&self) {
        println!("Terminated: {}", if self.app_state.terminate.is_cancelled() { "yes" } else { "no" });
    }
}


