/*
ELEKTRON © 2026 - now
Written by melektron
www.elektron.work
25.05.26, 12:03

Server-to-Client messages
*/


import * as z from "zod";
import { syncStep1Inner, syncStep2Inner, syncStepUpdateInner } from "./proto_shared";
import { TargetedEventChannel } from "./targeted_event_channel";


export enum MessageTypeS2C {
    GetDocResp = "GetDocResp",
    SyncStep1 = "SyncStep1",
    SyncStep2 = "SyncStep2",
    SyncUpdate = "SyncUpdate",
}

export const collabMessageS2C = z.discriminatedUnion("s2cmtype", [
    z.object({
        s2cmtype: z.literal(MessageTypeS2C.GetDocResp),
        req_id: z.uint32(),
        doc_id: z.uuid(),
        replica_id: z.number(),
    }),
    z.object({
        s2cmtype: z.literal(MessageTypeS2C.SyncStep1),
        ...syncStep1Inner.shape
    }),
    z.object({
        s2cmtype: z.literal(MessageTypeS2C.SyncStep2),
        ...syncStep2Inner.shape
    }),
    z.object({
        s2cmtype: z.literal(MessageTypeS2C.SyncUpdate),
        ...syncStepUpdateInner.shape
    }),
]);
export type CollabMessageS2C = z.infer<typeof collabMessageS2C>;
export type GetDocResp = Extract<CollabMessageS2C, { s2cmtype: MessageTypeS2C.GetDocResp}>


/**
 * @returns TargetedEventChannel with doc_id as the criterion and the
 * message of the specified type as the data type.
 */
export function makeDocIdEventChannel<MT extends MessageTypeS2C>() {
    return new TargetedEventChannel<Extract<CollabMessageS2C, { s2cmtype: MT }>, "doc_id">("doc_id")
}
