/*
ELEKTRON © 2026 - now
Written by melektron
www.elektron.work
10.05.26, 11:12

Class for managing and maintaining a connection to a single server.
It represents interactions and state related to the server.
*/

import * as c2s from "./proto_c2s"
import * as s2c from "./proto_s2c"
import { UUID } from "src/doc_manager";
import { AnyUint8Array, makeRpcChannel } from "./proto_shared";
import { EventChannel } from "src/utils/event_channel";
import { effect, Ref, ref } from "@vue/reactivity";
import { Logger } from "src/utils/logger";


enum WsStatusCode {
    NormalClosure = 1000,
    GoingAway = 1001,
    ProtocolError = 1002,
    Unsupported = 1003,
    Reserved = 1004,
    NoStatusReceived = 1005,
    Abnormal = 1006,
    InvalidFramePayloadData = 1007,
    Policy = 1008,
    MessageTooBig = 1009,
    MandatoryExt = 1010,
    InternalServerError = 1011,
    TlsHandshake = 1015,
}

export enum ConnectionState {
    Disconnected,
    Connecting,
    Connected,
}


export class Connection {
    private socket: WebSocket | null = null;
    public state: Ref<ConnectionState>

    public get connected() { return this.state.value === ConnectionState.Connected}

    public disconnectEvent = new EventChannel()
    public connectedEvent = new EventChannel()

    constructor(
        private log: Logger,
        private url: string
    ) {
        this.state = ref(ConnectionState.Disconnected)
        effect(() => {
            this.log.info("ConnectionState:", this.state.value)
        })

    }

    attemptConnect() {
        if (this.socket !== null) return;

        this.socket = new WebSocket(this.url)
        this.state.value = ConnectionState.Connecting

        this.socket.onopen = (e) => {
            this.log.debug("WS open:", e)
            this.state.value = ConnectionState.Connected
            this.connectedEvent.emit()
        }
        this.socket.onclose = (e) => {
            this.log.debug("WS close:", e)
            this.socket = null;

            // cancel all active RPC calls
            this.getDocRpc.cancelAll(`connection closed: ${e.reason}`)
            // remove all event listeners
            this.syncStep1Event.destroy()

            // notify listeners
            this.state.value = ConnectionState.Disconnected
            this.disconnectEvent.emit()
        }
        this.socket.onerror = (e) => {
            this.log.debug("WS error:", e)
        }
        this.socket.onmessage = (e) => {
            this.log.debug("WS message:", e)
            if (typeof (e.data) !== "string") {
                this.panic(WsStatusCode.Unsupported, "received non-text message")
                return
            }
            this.parseMessage(e.data)
        }
    }

    private parseMessage(data: string) {
        try {
            const parsed = JSON.parse(data)
            const decoded = s2c.collabMessageS2C.parse(parsed)
            this.handleMessage(decoded)
        } catch (error) {
            this.panic(WsStatusCode.ProtocolError, `malformed message: ${error}`)
        }
    }

    private handleMessage(msg: s2c.CollabMessageS2C) {

        switch (msg.s2cmtype) {
            case s2c.MessageTypeS2C.GetDocResp:
                this.getDocRpc.handleResponse(msg)
                break;

            case s2c.MessageTypeS2C.SyncStep1:
                this.syncStep1Event.emit(msg)
                break;

            case s2c.MessageTypeS2C.SyncStep2:
                this.syncStep2Event.emit(msg)
                break;

            case s2c.MessageTypeS2C.SyncUpdate:
                this.syncStepUpdateEvent.emit(msg)
                break;

        }
    }

    private sendMessage(msg: c2s.CollabMessageC2S): boolean {
        if (this.socket == null) return false;
        this.socket.send(JSON.stringify(c2s.collabMessageC2S.encode(msg)))
        return true
    }

    private panic(code: WsStatusCode, reason: string) {
        this.log.error(`WS panic: ${reason}, disconnecting ${this.url} with ${code} (${WsStatusCode[code]})`)
        if (this.socket == null) return;
        this.socket.close(code, reason)
    }

    disconnect() {
        if (this.socket == null) return;
        this.socket.close(WsStatusCode.NormalClosure, "disconnect");
    }

    /**
     * API for server communication
     */

    public getDocRpc = makeRpcChannel(
        this.sendMessage.bind(this), 
        c2s.MessageTypeC2S.GetDoc, 
        s2c.MessageTypeS2C.GetDocResp
    )

    public configureUpdates(doc_id: UUID, enabled: boolean) {
        this.sendMessage({
            c2smtype: c2s.MessageTypeC2S.ConfigureUpdates,
            doc_id,
            enabled,
        })
    }

    public async sendSyncStep1(doc_id: UUID, state_vector: AnyUint8Array) {
        await this.sendMessage({
            c2smtype: c2s.MessageTypeC2S.SyncStep1,
            doc_id,
            state_vector,
        })
    }
    public syncStep1Event = s2c.makeDocIdEventChannel<s2c.MessageTypeS2C.SyncStep1>()

    public sendSyncStep2(doc_id: UUID, update: AnyUint8Array) {
        this.sendMessage({
            c2smtype: c2s.MessageTypeC2S.SyncStep2,
            doc_id,
            update,
        })
    }
    public syncStep2Event = s2c.makeDocIdEventChannel<s2c.MessageTypeS2C.SyncStep2>()

    public sendSyncStepUpdate(doc_id: UUID, update: AnyUint8Array) {
        this.sendMessage({
            c2smtype: c2s.MessageTypeC2S.SyncStep2,
            doc_id,
            update,
        })
    }
    public syncStepUpdateEvent = s2c.makeDocIdEventChannel<s2c.MessageTypeS2C.SyncUpdate>()

}