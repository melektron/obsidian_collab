/*
ELEKTRON © 2026 - now
Written by melektron
www.elektron.work
09.03.26, 12:19

Subsystem for storing and manipulating CRDT Documents
*/

use std::{collections::HashMap, sync::{Arc, Mutex}};

use anyhow::Result;
use log::{debug, info};
use uuid::{Uuid, uuid};
use yrs::{AsyncTransact, Doc, GetString, ReadTxn, Text, TextRef, updates::encoder::Encode};

use crate::{app::AppState, collab_proto::CollabMessage};

/*/
#[derive(Error, Debug)]
enum DocError {
    #[error("IO Error: {0}")]
    IOError(io::Error),
    #[error("Client disconnected")]
    Disconnected,
    #[error("Console is about to shut down")]
    ShuttingDown, // console is likely shutting down (main IO channels closed)
    #[error("Authentication failure (user: {0})")]
    AuthenticationFailure(String),
}

type ConsoleResult<T> = Result<T, ConsoleError>;
*/
pub const DOC_ID: Uuid = uuid!("00000000-0000-0000-0000-ffff00000000");



pub struct DocWrapper {
    pub ydoc: Mutex<Doc>,
    // TODO: This stores a pointer to something owned by teh above document. 
    // is it even safe to keep here? does the doc need external Pinning?
    pub text: TextRef
}

impl DocWrapper {
    pub fn new() -> Self {
        let ydoc = Mutex::new(Doc::new());

        // TODO: maybe use a manual, async implementation for this in the future:
        // we use unwrap here... must never fail during init
        let text = ydoc.try_lock().unwrap().get_or_insert_text("item_text");

        Self {
            ydoc,
            text
        }
    }
}

pub struct DocProvider {
    app_state: Arc<AppState>,
    document_cache: Mutex<HashMap<Uuid, Arc<DocWrapper>>>
}

impl DocProvider {
    pub fn new(app_state: &Arc<AppState>) -> Self {
        let document_cache = Mutex::new(HashMap::new());

        Self {
            app_state: app_state.clone(),
            document_cache,
        }
    }

    pub fn get_doc_by_id(&self, id: Uuid) -> Arc<DocWrapper> {
        let mut cache = self.document_cache.lock().unwrap(); // unwrap poison error
        match cache.get(&id) {
            Some(doc) => doc.clone(),
            None => {
                // TODO: first try to load doc from disk, only create if that also fails
                info!("Creating new document {}", id);
                let new_doc = Arc::new(DocWrapper::new());
                cache.insert(id, new_doc.clone());
                new_doc
            }
        }
    }

    pub async fn run(self: Arc<Self>) -> Result<()> {
        let doc = Doc::new();
        // TODO: maybe use a manual, async implementation for this in the future:
        let text = doc.get_or_insert_text("root_item");

        {
            let mut txn = doc.transact_mut().await;
            text.insert(&mut txn, 0, "Herld!");
            text.insert(&mut txn, 2, "llo Wo");
        }
        debug!("We now have: {}", text.get_string(&doc.transact().await));

        let sv = doc.transact().await.state_vector();
        debug!("State: {:#?}", sv);

        {
            let mut txn = doc.transact_mut().await;
            text.remove_range(&mut txn, 0, 6);
        }
        debug!("We now have: {}", text.get_string(&doc.transact().await));

        let sv2 = doc.transact().await.state_vector();
        let encoded = sv2.encode_v1();
        debug!("State: {:#?}", sv2);

        info!("now the json...");
        let msg = CollabMessage::YSync {
            doc_id: DOC_ID.clone(),
            ysync_message: encoded
        };
        let as_json = serde_json::to_string(&msg)?;
        debug!("got json: {as_json}");

        Ok(())
    }

}


