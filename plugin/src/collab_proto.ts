/*
ELEKTRON © 2026 - now
Written by melektron
www.elektron.work
01.05.26, 23:55

Definition and implementation of the collab sync protocol.

The collab protocol uses a WebSocket connection to send 
Messages, effectively achieving low-latency bidirectional
RPC and event passing.

Messages frequently include the ID of the document they reference
because a single connection often accesses multiple documents.

*/

import * as z from "zod";


enum MessageType {
    GetDoc = "GetDoc",
    GetDocResp = "GetDocResp",
    YSync = "YSync",
}

const collabMessage = z.discriminatedUnion("mtype", [
    z.object({
        mtype: z.literal(MessageType.GetDoc),
        doc_id: z.uuid(),
    }),
    z.object({
        mtype: z.literal(MessageType.GetDocResp),
        doc_id: z.uuid(),
        replica_id: z.number(),
    }),
    z.object({
        mtype: z.literal(MessageType.YSync),
        doc_id: z.uuid(),
        // TODO: change this to a codec which automatically encodes/decodes base64
        ysync_message: z.string(),
    })
]);
type CollabMessage = z.infer<typeof collabMessage>;

const a = collabMessage.parse({
    mtype: "GetDoc",
    doc_id: z.uuid(),
});

switch (a.mtype) {
    case MessageType.GetDoc:
        a
        break;

    case MessageType.GetDocResp:
        break;

    case MessageType.YSync:
        break;

    default:
        break;
}

