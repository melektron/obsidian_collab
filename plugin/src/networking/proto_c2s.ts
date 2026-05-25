/*
ELEKTRON © 2026 - now
Written by melektron
www.elektron.work
25.05.26, 12:03

Client-to-Server messages
*/

import * as z from "zod";
import { syncStep1Inner, syncStep2Inner, syncStepUpdateInner } from "./proto_shared";


export enum MessageTypeC2S {
    GetDoc = "GetDoc",
    ConfigureUpdates = "ConfigureUpdates",
    SyncStep1 = "SyncStep1",
    SyncStep2 = "SyncStep2",
    SyncUpdate = "SyncUpdate",
}

export const collabMessageC2S = z.discriminatedUnion("c2smtype", [
    z.object({
        c2smtype: z.literal(MessageTypeC2S.GetDoc),
        req_id: z.uint32(),
        doc_id: z.uuid(),
    }),
    z.object({
        c2smtype: z.literal(MessageTypeC2S.ConfigureUpdates),
        doc_id: z.uuid(),
        enabled: z.boolean(),
    }),
    z.object({
        c2smtype: z.literal(MessageTypeC2S.SyncStep1),
        ...syncStep1Inner.shape
    }),
    z.object({
        c2smtype: z.literal(MessageTypeC2S.SyncStep2),
        ...syncStep2Inner.shape
    }),
    z.object({
        c2smtype: z.literal(MessageTypeC2S.SyncUpdate),
        ...syncStepUpdateInner.shape
    }),
]);
export type CollabMessageC2S = z.infer<typeof collabMessageC2S>;
export type GetDocReq = Extract<CollabMessageC2S, { c2smtype: MessageTypeC2S.GetDoc}>
