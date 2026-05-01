/*
ELEKTRON © 2026 - now
Written by melektron
www.elektron.work
14.03.26, 20:37

Structure representing a collab client
*/

use std::{collections::HashSet, sync::Arc, time::Duration};

use anyhow::{Context, Result};
use axum::extract::ws;
use futures::{
    SinkExt, StreamExt,
    stream::{SplitSink, SplitStream},
};
use log::{debug, info, warn};
use tokio::{sync::Mutex, time::sleep};
use tokio_util::{future::FutureExt, sync::CancellationToken};
use uuid::Uuid;

use crate::{app::AppState, doc_provider::DocProvider};


type WsSink = SplitSink<ws::WebSocket, ws::Message>;
type WsStream = SplitStream<ws::WebSocket>;


const DISCONNECT_TIMEOUT: Duration = Duration::from_secs(10);


pub struct ClientRepr {
    app_state: Arc<AppState>,
    doc_provider: Arc<DocProvider>,

    // unique identifier for the client to use as the
    // CRDT client ID (which should be called replica ID).
    // TODO: maybe we want to transition to per-document replica-ids
    // to allow for improved scalability?
    client_id: u32,

    sink: Mutex<WsSink>,
    stream: Mutex<WsStream>,
    active_docs: HashSet<Uuid>,

    // cancellation token to forcefully stop all processing and
    // disconnect client by dropping sockets
    force_close: CancellationToken,
    // cancellation token used to signal that the rx loop exited
    // indicating the connection was closed (whether cleanly or not)
    has_closed: CancellationToken,
}

impl ClientRepr {
    pub fn new(
        app_state: &Arc<AppState>,
        doc_provider: &Arc<DocProvider>,
        client_id: u32,
        socket: ws::WebSocket,
    ) -> Self {
        let (sink, stream) = socket.split();

        Self {
            app_state: app_state.clone(),
            doc_provider: doc_provider.clone(),

            client_id,

            sink: Mutex::new(sink),
            stream: Mutex::new(stream),
            active_docs: HashSet::new(),

            force_close: CancellationToken::new(),
            has_closed: CancellationToken::new(),
        }
    }

    pub async fn run(&self) -> Result<()> {
        let mut stream = self.stream.lock().await;

        loop {
            match stream
                .next()
                .with_cancellation_token(&self.force_close)
                .await
            {
                // got message
                Some(Some(msg)) => {
                    let msg = msg.context("Error extracting websocket message")?;
                    self.handle_message(msg).await?;
                }
                // token canceled -> force exit
                None => {
                    warn!("Force close rx loop");
                    break;
                }
                // no more messages, socket closed cleanly
                Some(None) => {
                    debug!("No more messages, exiting rx loop");
                    break;
                }
            }
        }
        self.has_closed.cancel();
        Ok(())
    }

    /// handles incoming websocket messages.
    /// returns true when the websocket receive loop should
    /// be exited prematurely.
    async fn handle_message(&self, msg: ws::Message) -> Result<()> {
        match &msg {
            ws::Message::Text(utf8_bytes) => {
                info!("Got Text message: {}", utf8_bytes.as_str());
                if utf8_bytes.as_str() == "terminate" {
                    self.app_state.terminate.cancel();
                } else if utf8_bytes.as_str() == "kill" {
                    info!("Killing by dropping socket");
                    self.force_close.cancel();
                } else if utf8_bytes.as_str() == "close" {
                    info!("Closing by sending close message");
                    sleep(Duration::from_secs(5)).await;
                    self.disconnect(1001, "close").await;
                } else if utf8_bytes.as_str() == "cterm" {
                    info!("Closing by sending close message then terminating");
                    self.disconnect(1001, "cterm").await;
                    self.app_state.terminate.cancel();
                } else {
                    // TODO: decode message here using serde and call into 
                    // doc provider to get doc or something like that
                    self.sink.lock().await.send(msg).await?;
                }
            }
            axum::extract::ws::Message::Binary(bytes) => {
                info!("Got Binary message: {:?}", bytes);
                self.sink.lock().await.send(msg).await?;
            }
            axum::extract::ws::Message::Ping(bytes) => {
                info!("Got Ping message: {:?}", bytes);
                // pong is apparently handled automatically
                //socket.send(axum::extract::ws::Message::Pong(Bytes::new())).await?;
            }
            axum::extract::ws::Message::Pong(bytes) => {
                info!("Got Pong message: {:?}", bytes);
            }
            axum::extract::ws::Message::Close(close_frame) => {
                if let Some(close_frame) = close_frame {
                    info!("Got Close message: {:?}", close_frame)
                } else {
                    info!("Got Close message that is None")
                }
            }
        }

        Ok(())
    }

    /// tries to cleanly disconnect the client.
    /// If the disconnect handshake times out, the connection
    /// is forcefully closed by canceling `self.force_close`.
    async fn disconnect(&self, code: u16, reason: &str) {
        if let Err(e) = self
            .sink
            .lock()
            .await
            .send(axum::extract::ws::Message::Close(Some(ws::CloseFrame {
                code: code,
                reason: reason.into(),
            })))
            .await
        {
            warn!("Failed to send close message: {e}")
        }

        // force close the client if it disconnect handshake times out
        tokio::spawn({
            let has_closed = self.has_closed.clone();
            let force_close = self.force_close.clone();
            async move {
                sleep(DISCONNECT_TIMEOUT).await;
                if !has_closed.is_cancelled() {
                    warn!("Client disconnect timeout, force closing");
                    force_close.cancel();
                }
            }
        });
    }
}
