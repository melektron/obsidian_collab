/*
ELEKTRON © 2026 - now
Written by melektron
www.elektron.work
14.03.26, 18:58

Definition and implementation of the collab sync protocol.

The collab protocol uses a WebSocket connection to send 
Messages, effectively achieving low-latency bidirectional
RPC and event passing.

Messages frequently include the ID of the document they reference
because a single connection often accesses multiple documents.

*/


use serde::{Deserialize, Serialize};
use serde_with::{serde_as, base64::Base64};
use uuid::Uuid;


#[serde_as]
#[derive(Deserialize, Serialize)]
// for now we use internal tagging as that is 
// more convenient for typescript 
#[serde(tag = "mtype")]
pub enum CollabMessage {
    /// **Client->Server**
    /// 
    /// Sent once to the server to request initial information about a document
    /// including a replica ID that can be used to edit the document.
    GetDoc {
        doc_id: Uuid,
    },

    /// **Server->Client**
    /// 
    /// Sent once to the server to request initial information about a document
    /// including a replica ID that can be used to edit the document.
    GetDocResp {
        doc_id: Uuid,

        /// replica ID that can be used to edit this document.
        /// This is guaranteed to be unique among all all currently 
        /// existing replicas (roughly equivalent to all currently
        /// active and inactive clients)
        replica_id: u32
    },

    /// **Server<->Client**
    /// 
    /// The actual sync message used to exchange update information.
    /// 
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
    YSync {
        /// the document ID this message references because
        /// a single connection often accesses multiple documents
        doc_id: Uuid,
    
        /// the regular y-sync message, but encoded as base64
        #[serde_as(as = "Base64")]
        ysync_message: Vec<u8>
    }
}
