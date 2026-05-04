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
Messages that need a reply also have a request ID, that can be used
to identify which response belongs to the message, even when multipler
requests are running simultaneously.

*/


use serde::{Deserialize, Serialize};
use serde_with::{serde_as, base64::Base64};
use uuid::Uuid;


//#[serde_as]
#[derive(Deserialize, Debug)]
// for now we use internal tagging as that is 
// more convenient for typescript 
#[serde(tag = "c2smtype")]
pub enum CollabMessageC2S {
    /// Sent once to the server to request initial information about a document
    /// including a replica ID that can be used to edit the document.
    GetDoc {
        req_id: u64,
        doc_id: Uuid,
    },

    SyncStep1(SyncStep1Inner),
    SyncStep2(SyncStep2Inner),
    SyncUpdate(SyncUpdateInner),
}

//#[serde_as]
#[derive(Serialize, Debug)]
// for now we use internal tagging as that is 
// more convenient for typescript 
#[serde(tag = "s2cmtype")]
pub enum CollabMessageS2C {
    /// Sent once to the server to request initial information about a document
    /// including a replica ID that can be used to edit the document.
    GetDocResp {
        req_id: u64,
        doc_id: Uuid,

        /// replica ID that can be used to edit this document.
        /// This is guaranteed to be unique among all all currently 
        /// existing replicas (roughly equivalent to all currently
        /// active and inactive clients)
        replica_id: u32
    },

    SyncStep1(SyncStep1Inner),
    SyncStep2(SyncStep2Inner),
    SyncUpdate(SyncUpdateInner),
}


/// **Server<->Client**
/// 
/// The actual sync messages used to exchange update information:
/// - SyncStep1
/// - SyncStep2
/// - SyncUpdate
/// 
/// https://github.com/yjs/y-protocols/blob/master/PROTOCOL.md
/// https://github.com/y-crdt/y-sync/tree/master
/// 
/// For now, we just more or less use the core y-sync 
/// SyncMessages with lib0 encoding under the hood, plus the
/// added document ID field. We do not use [`yrs::sync::Protocol`] 
/// however, as it forces us into the standard y-crdt model of 
/// awareness tied to a single document, which in y-rs results in 
/// the [`Awareness`] owning the entire document. This does not 
/// fit the model of Collab, where awareness may need to be spread
/// across multiple documents (and is not strictly required).
/// All higher level y-sync message (auth, awareness (query)) are left
/// out to be replaced by Collab-specific implementations later.
/// 
/// Later we will probably customize the protocol further (leaning
/// on the existing one), renaming and modifying the messages
/// to better fit the use case.

#[serde_as]
#[derive(Deserialize, Serialize, Debug)]
pub struct SyncStep1Inner {
    pub doc_id: Uuid,

    #[serde_as(as = "Base64")]
    pub state_vector: Vec<u8>
}

#[serde_as]
#[derive(Deserialize, Serialize, Debug)]
pub struct SyncStep2Inner {
    pub doc_id: Uuid,
    
    #[serde_as(as = "Base64")]
    pub update: Vec<u8>
}

#[serde_as]
#[derive(Deserialize, Serialize, Debug)]
pub struct SyncUpdateInner {
    pub doc_id: Uuid,
    
    #[serde_as(as = "Base64")]
    pub update: Vec<u8>
}