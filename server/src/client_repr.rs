/*
ELEKTRON © 2026 - now
Written by melektron
www.elektron.work
14.03.26, 20:37

Structure representing a collab client
*/

use std::{collections::{HashMap, HashSet}, fmt::Display, net::IpAddr, sync::Arc, time::Duration};

use anyhow::{Context, Result};
use axum::extract::ws;
use futures::{
    SinkExt, StreamExt,
    stream::{SplitSink, SplitStream},
};
use log::{debug, error, info, warn};
use tokio::{sync::Mutex, time::sleep};
use tokio_util::{
    future::FutureExt,
    sync::{CancellationToken, WaitForCancellationFuture},
};
use uuid::Uuid;
use yrs::{
    AsyncTransact, ReadTxn, StateVector, Subscription, UpdateEvent, updates::{decoder::Decode, encoder::Encode}
};

use crate::{
    app::AppState,
    collab_proto::{
        CollabMessageC2S, CollabMessageS2C, SyncStep1Inner, SyncStep2Inner, SyncUpdateInner,
    },
    doc_provider::DocProvider, utils::{or_log::OrLog, poisonless_lock::PoisonlessLock},
};

type WsSink = SplitSink<ws::WebSocket, ws::Message>;
type WsStream = SplitStream<ws::WebSocket>;

const DISCONNECT_TIMEOUT: Duration = Duration::from_secs(10);

pub struct ClientRepr {
    app_state: Arc<AppState>,
    doc_provider: Arc<DocProvider>,

    ip_addr: IpAddr,
    sink: Mutex<WsSink>,
    stream: Mutex<WsStream>,

    // identifier for server internal use
    client_id: u32,

    // channel to receive updates from documents
    update_tx: flume::Sender<(Uuid, Vec<u8>)>,
    update_rx: flume::Receiver<(Uuid, Vec<u8>)>,
    // map of docs with updates enabled to their subscriptions.
    // removing the entry from this will drop the subscription and therefore
    // disable updates automatically.
    active_docs: std::sync::Mutex<HashMap<Uuid, Subscription>>,


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
        ip_addr: IpAddr,
        socket: ws::WebSocket,
        client_id: u32,
    ) -> Self {
        let (sink, stream) = socket.split();

        let (update_tx, update_rx) = flume::unbounded();

        Self {
            app_state: app_state.clone(),
            doc_provider: doc_provider.clone(),

            ip_addr,
            sink: Mutex::new(sink),
            stream: Mutex::new(stream),

            client_id,

            update_tx,
            update_rx,
            active_docs: std::sync::Mutex::new(HashMap::new()),

            force_close: CancellationToken::new(),
            has_closed: CancellationToken::new(),
        }
    }

    pub async fn run(&self) -> Result<()> {
        let mut stream = self.stream.lock().await;
        loop {
            tokio::select! {
                _ = self.force_close.cancelled() => {
                    warn!("Force close client rx loop");
                    break;
                }
                // listen for incoming messages
                maybe_msg = stream.next() => {
                    match maybe_msg
                    {
                        // got message
                        Some(msg) => {
                            let msg = msg.context("Error extracting websocket message")?;
                            self.handle_websocket_message(msg).await?;
                        }
                        // no more messages, socket closed cleanly
                        None => {
                            debug!("No more messages, exiting rx loop");
                            break;
                        }
                    }
                }
                // send any outgoing updates
                value = self.update_rx.recv_async() => {
                    if let Ok((doc_id, update)) = value {
                        self.send_message(CollabMessageS2C::SyncUpdate(SyncUpdateInner { 
                            doc_id, update
                        })).await?;
                    }
                }
            }
            
        }
        self.has_closed.cancel();
        Ok(())
    }

    /// handles incoming websocket messages.
    async fn handle_websocket_message(&self, msg: ws::Message) -> Result<()> {
        match &msg {
            ws::Message::Text(utf8_bytes) => {
                debug!("Got Text message: {}", utf8_bytes.as_str());
                if utf8_bytes.as_str() == "terminate" {
                    self.app_state.terminate.cancel();
                } else if utf8_bytes.as_str() == "kill" {
                    debug!("Killing by dropping socket");
                    self.force_close.cancel();
                } else if utf8_bytes.as_str() == "close" {
                    debug!("Closing by sending close message");
                    sleep(Duration::from_secs(5)).await;
                    self.disconnect(1001, "close").await;
                } else if utf8_bytes.as_str() == "cterm" {
                    debug!("Closing by sending close message then terminating");
                    self.disconnect(1001, "cterm").await;
                    self.app_state.terminate.cancel();
                } else {
                    let collab_msg: CollabMessageC2S = serde_json::from_str(utf8_bytes.as_str())
                        .context("message parsing failed")?;
                    self.handle_collab_message(collab_msg)
                        .await
                        .context("message handler failed")?;
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

    async fn handle_collab_message(&self, msg: CollabMessageC2S) -> Result<()> {
        info!("Got collab message: {msg:?}");
        match msg {
            CollabMessageC2S::GetDoc { req_id, doc_id } => {
                self.send_message(CollabMessageS2C::GetDocResp {
                    req_id,
                    doc_id,
                })
                .await?;
                debug!("Sent doc request response");
            }
            CollabMessageC2S::ConfigureUpdates { doc_id, enabled } => 'handler: {
                let doc = self.doc_provider.get_doc_by_id(doc_id);        
                let mut active_docs = self.active_docs.poisonless_lock();

                if enabled {
                    // updates should be enabled

                    // if already enabled, do nothing
                    if active_docs.contains_key(&doc_id) { break 'handler; }
    
                    // otherwise try to subscribe to updates
                    let observe_result = doc.ydoc.observe_update_v1({
                        let sender = self.update_tx.clone();
                        move |_txn, update| {
                            sender.send((doc_id, update.update.clone())).or_warn("Tried to send update to dropped client");
                        }
                    });
                    if let Ok(sub) = observe_result {
                        active_docs.insert(doc_id, sub);
                        debug!("enabled updates for {doc_id} for client {}", self.client_id)
                    } else {
                        error!("Failed to enable subscription of doc {doc_id} for client {}", self.client_id)
                    };

                } else {
                    // updates should be disabled,
                    // drop subscription 
                    if active_docs.remove(&doc_id).is_some() {
                        debug!("disabled updates for {doc_id} for client {}", self.client_id)
                    }

                }
                // TODO: maybe respond with some sort of status indicating success or failure
            }
            CollabMessageC2S::SyncStep1(SyncStep1Inner {
                doc_id,
                state_vector,
            }) => {
                // compute update for peer and our state vector
                let (update, our_sv) = {
                    let state_vector = StateVector::decode_v1(&state_vector.as_slice())
                        .context("failed to decode state vector")?;

                    let doc = self.doc_provider.get_doc_by_id(doc_id);
                    let txn = doc.ydoc.transact().await;

                    (
                        txn.encode_diff_v1(&state_vector),
                        txn.state_vector().encode_v1(),
                    )
                };
                // send missing updates to peer in sync step 2
                self.send_message(CollabMessageS2C::SyncStep2(SyncStep2Inner {
                    doc_id: doc_id,
                    update,
                })).await.context("failed to send sync step 2 in response to sync step 1")?;

                // immediately initiate sync step 1 from our side as well to get missing updates from peer
                self.send_message(CollabMessageS2C::SyncStep1(SyncStep1Inner {
                    doc_id: doc_id,
                    state_vector: our_sv,
                })).await.context("failed to send sync step 2 in response to sync step 1")?;
            }
            CollabMessageC2S::SyncStep2(SyncStep2Inner { doc_id, update }) => {
                let doc = self.doc_provider.get_doc_by_id(doc_id);
                doc.integrate_update_v1(update.as_slice())
                    .await
                    .context("integrate sync step 2")?;
                // TODO: maybe respond with some sort of sync done indicator (a la SyncStepDone)?
            }
            CollabMessageC2S::SyncUpdate(SyncUpdateInner { doc_id, update }) => {
                let doc = self.doc_provider.get_doc_by_id(doc_id);
                doc.integrate_update_v1(update.as_slice())
                    .await
                    .context("integrate sync update")?;
            }
        }
        Ok(())
    }

    async fn send_message(&self, msg: CollabMessageS2C) -> Result<()> {
        let text = serde_json::to_string(&msg).context("message serialization failed")?;
        self.sink
            .lock()
            .await
            .send(text.into())
            .await
            .context("message transmission failed")?;
        Ok(())
    }

    /// tries to cleanly disconnect the client.
    /// If the disconnect handshake times out, the connection
    /// is forcefully closed by canceling `self.force_close`.
    pub async fn disconnect(&self, code: u16, reason: &str) {
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

        // force close the client if the disconnect handshake times out
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

    /**
     * returns a future that resolves when the client connection has been closed
     * (cleanly or not).
     */
    pub fn closed(&self) -> WaitForCancellationFuture<'_> {
        self.has_closed.cancelled()
    }
}

impl Display for ClientRepr {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(
            f,
            "CollabClient {} @{}, {} active documents",
            self.client_id,
            self.ip_addr,
            self.active_docs.poisonless_lock().len(),
        )
    }
}
