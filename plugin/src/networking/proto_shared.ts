/*
ELEKTRON © 2026 - now
Written by melektron
www.elektron.work
25.05.26, 12:03

structures and utilities shared between S2C and C2S.

The collab protocol uses a WebSocket connection to send 
Messages, effectively achieving low-latency bidirectional
RPC and event passing.

Messages frequently include the ID of the document they reference
because a single connection often accesses multiple documents.

*/

import * as z from "zod"
import * as c2s from "./proto_c2s"
import * as s2c from "./proto_s2c"
import { RpcChannel } from "./rpc_channel";


export type AnyUint8Array = Uint8Array<ArrayBufferLike>
// https://zod.dev/codecs#base64tobytes
const base64ToBytes = z.codec(z.base64(), z.instanceof(Uint8Array<ArrayBufferLike>), {
    decode: (base64String) => z.util.base64ToUint8Array(base64String),
    encode: (bytes) => z.util.uint8ArrayToBase64(bytes),
});

export const syncStep1Inner = z.object({
    doc_id: z.uuid(),
    state_vector: base64ToBytes
})

export const syncStep2Inner = z.object({
    doc_id: z.uuid(),
    update: base64ToBytes
})

export const syncStepUpdateInner = z.object({
    doc_id: z.uuid(),
    update: base64ToBytes
})

/**
 * The following is a function for creating an RPC channel
 * with data identified by the C2S and S2C message types.
 * All types are inferred form the parameters, making this
 * very convenient to use.
 * See ChatGPT for why many of these aliases can't be inlined
 * https://chatgpt.com/share/6a143283-3100-83eb-ad3e-c68dee53eec6
 */


type C2SMessageWithReqId = Extract<
    c2s.CollabMessageC2S,
    { req_id: number }
>;

type S2CMessageWithReqId = Extract<
    s2c.CollabMessageS2C,
    { req_id: number }
>;

type MessageTypeC2SWithReqId = C2SMessageWithReqId["c2smtype"];
type MessageTypeS2CWithReqId = S2CMessageWithReqId["s2cmtype"];


type C2SRpcMsg<T extends MessageTypeC2SWithReqId> =
    Extract<C2SMessageWithReqId, { c2smtype: T }>;

type S2CRpcMsg<T extends MessageTypeS2CWithReqId> =
    Extract<S2CMessageWithReqId, { s2cmtype: T }>;

/**
 * Creates an RPC using a C2S and a C2S message type.
 * The parameter and response datatypes are inferred from the message types.
 * @param sender callback for sending C2S messages (true if send was possible, false otherwise)
 * @param c2smt Message type of the RPC call message to use
 * @param s2cmt Message type of the RPC response message to use
 * @returns RpcChannel that can be used to call to the server asynchronously
 */
export function makeRpcChannel<
    C2SMT extends MessageTypeC2SWithReqId, 
    S2CMT extends MessageTypeS2CWithReqId
>(sender: (data: c2s.CollabMessageC2S) => boolean, c2smt: C2SMT, s2cmt: S2CMT) {

    return new RpcChannel<
        C2SMT,
        S2CMT,
        C2SRpcMsg<C2SMT>,
        S2CRpcMsg<S2CMT>
    >((p) => sender(p), c2smt, s2cmt)
}