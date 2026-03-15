/*
ELEKTRON © 2026 - now
Written by melektron
www.elektron.work
14.03.26, 18:58

Definition and implementation of the collab sync protocol
*/


use serde::{Deserialize, Serialize};
use serde_with::{serde_as, base64::Base64};
use uuid::Uuid;


#[serde_as]
#[derive(Deserialize, Serialize)]
pub struct CollabMessage {
    /// the document ID this message references because
    /// a single connection often accesses multiple documents
    pub doc_id: Uuid,

    /// For now, we just more or less use the basic y-sync 
    /// protocol under the hood. Small difference: since the
    /// connection is long lived, we trigger a transmission of 
    /// SyncStep1 from server to client whenever a client sends
    /// SyncStep1 to the server (in addition to the normal SyncStep2
    /// reply). 
    /// 
    /// Later we will probably customize the protocol further (leaning
    /// on the existing one), renaming and modifying the messages
    /// to better fit the use case.
    #[serde_as(as = "Base64")]
    pub ysync_message: Vec<u8>
}
