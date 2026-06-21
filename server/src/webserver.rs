/*
ELEKTRON © 2026 - now
Written by melektron
www.elektron.work
08.03.26, 17:10

Subsystem for handling web/websocket requests
*/

use std::{collections::HashMap, net::SocketAddr, sync::{Arc, atomic::{AtomicU32, Ordering}}};

use anyhow::{Context, Result};
use axum::{Router, routing::get};
use futures::future::join_all;
use log::{info};
use tokio::net::TcpListener;

use crate::{app::AppState, client_repr::ClientRepr, doc_provider::DocProvider, utils};


pub struct WebServer {
    app_state: Arc<AppState>,
    doc_provider: Arc<DocProvider>,

    // unique identifier used to identify client
    // connection internal to server
    next_client_id: AtomicU32,

    // list of active clients
    pub clients: tokio::sync::Mutex<HashMap<u32, Arc<ClientRepr>>>,
}

mod routes {
    use std::{net::IpAddr, sync::Arc};
    use axum_client_ip::ClientIp;
    use log::{error, info};

    use axum::{extract::{Path, State, WebSocketUpgrade, ws::WebSocket}, response::Response};
    
    use crate::{client_repr::ClientRepr, webserver::WebServer};

    pub async fn health_check(
        State(_state): State<Arc<WebServer>>,
        ClientIp(ip): ClientIp,
    ) -> String {
        format!("
            Collab Healthy.
            Request source: {ip}
        " )
        // TODO: print more helpful data
    }
    
    // TODO: eventually remove this
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
        ClientIp(ip): ClientIp,
        upgrade_handler: WebSocketUpgrade
    ) -> Response {
        upgrade_handler
            .on_failed_upgrade(|error| {
                error!("Websocket upgrade failed: {error}")
            })
            .on_upgrade(move |socket| async move {
                handle_collab_client(state, ip, socket).await
            })
    }

    pub async fn handle_collab_client(
        state: Arc<WebServer>,
        ip: IpAddr,
        socket: WebSocket
    ) {
        info!("Collab client connected");
        let client_id = state.alloc_client_id();

        let client = {
            let mut clients = state.clients.lock().await;

            let client = Arc::new(ClientRepr::new(
                &state.app_state,
                &state.doc_provider,
                ip,
                socket,
                client_id,
            ));
            clients.insert(client_id, client.clone());
            client
        };
        
        if let Err(e) = client.run().await {
            error!("Collab client handler crashed, disconnecting: {e:?}");
        } else {
            info!("Collab client disconnected");
        };

        {
            // remove client from list as it is no longer needed.
            // this may take a while when the server terminates as the map
            // will be locked for termination
            let mut clients = state.clients.lock().await;
            clients.remove(&client_id);
        }
    }
}

impl WebServer {
    pub fn new(
        app_state: &Arc<AppState>,
        doc_provider: &Arc<DocProvider>,
    ) -> Self {
        Self { 
            app_state: app_state.clone(),
            doc_provider: doc_provider.clone(),
            next_client_id: AtomicU32::new(0),
            clients: tokio::sync::Mutex::new(HashMap::new()),
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
            // configure client IP source to use
            .layer(self.app_state.args.ip_source.clone().into_extension())
            .with_state(self.clone());

        axum::serve(listener, app.into_make_service_with_connect_info::<SocketAddr>())
            .with_graceful_shutdown({
                let this = self.clone();
                async move { 
                    // wait for shutdown signal
                    this.app_state.terminate.cancelled().await;
                    
                    // attempt to cleanly disconnect all clients first 
                    // before we "gracefully" shut down the server, which seems to just
                    // cancel all the futures or at least close all sockets and not doing
                    // a WS disconnect handshake
                    info!("disconnecting clients cleanly...");
                    let clients = this.clients.lock().await;
                    // trigger disconnect
                    for client in clients.values() {
                        client.disconnect(utils::constants::WS_CLOSE_GOING_AWAY, "server shutting down").await;
                    }
                    // wait for all clients to close
                    join_all(clients.values().map(|c| c.closed())).await;
                }
            })
            .await?;

        Ok(())
    }

    fn alloc_client_id(&self) -> u32 {
        // TODO: may be able to change to Relaxed, but SeqCst is safe for now
        self.next_client_id.fetch_add(1, Ordering::SeqCst)
    }
}


