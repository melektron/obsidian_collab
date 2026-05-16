/*
ELEKTRON © 2026 - now
Written by melektron
www.elektron.work
10.05.26, 11:12

Class for managing and maintaining a connection to a single server.
It represents interactions and state related to the server.
*/

import z from "zod";
import { collabMessage, CollabMessage, MessageType } from "./collab_proto";
import { effect, ref, VueRef } from "./utils/reactivity";


enum WsStatusCode {
    NormalClosure           = 1000,
    GoingAway               = 1001,
    ProtocolError           = 1002,
    Unsupported             = 1003,
    Reserved                = 1004,
    NoStatusReceived        = 1005,
    Abnormal                = 1006,
    InvalidFramePayloadData = 1007,
    Policy                  = 1008,
    MessageTooBig           = 1009,
    MandatoryExt            = 1010,
    InternalServerError     = 1011,
    TlsHandshake            = 1015,
}

export enum ConnectionState {
    Disconnected,
    Connecting,
    Connected,
}

export class ConnectionProvider {
    socket: WebSocket | null = null;
    state: VueRef<ConnectionState>

    private nextReqId: number = 0

    constructor(
        private url: string
    ) {
        this.state = ref(ConnectionState.Disconnected)
        effect(() => {
            console.log("ConnectionState:", this.state.value)
        })
    }

    attemptConnect() {
        if (this.socket !== null) return;

        this.socket = new WebSocket(this.url)
        this.state.value = ConnectionState.Connecting

        this.socket.onopen = (e) => {
            console.log("WS open:", e)
            this.state.value = ConnectionState.Connected
            console.log("after set signal")
        }
        this.socket.onclose = (e) => {
            console.log("WS close:", e)
            this.socket = null;
            this.state.value = ConnectionState.Disconnected
            console.log("after set signal")
        }
        this.socket.onerror = (e) => {
            console.log("WS error:", e)
        }
        this.socket.onmessage = (e) => {
            console.log("WS message:", e)
            if (typeof(e.data) !== "string") {
                this.panic(WsStatusCode.Unsupported, "received non-text message")
                return
            }
            this.parseMessage(e.data)
        }
    }

    private parseMessage(data: string) {
        try {
            const decoded = JSON.parse(data)
            const validated = collabMessage.parse(decoded)
            this.handleMessage(validated)
        } catch (error) {
            this.panic(WsStatusCode.ProtocolError, `malformed message: ${error}`)
        }
    }

    private handleMessage(msg: CollabMessage) {

        switch (msg.mtype) {
            case MessageType.GetDoc:
                break;

            case MessageType.GetDocResp:
                break;

            case MessageType.YSync:
                break;

            default:
                break;
        }
    }

    sendMessage(msg: CollabMessage) {
        if (this.socket == null) return;
        this.socket.send(JSON.stringify(msg))
    }

    private panic(code: WsStatusCode, reason: string) {
        console.error(`WS panic: ${reason}, disconnecting ${this.url} with ${code} (${WsStatusCode[code]})`)
        if (this.socket == null) return;
        this.socket.close(code, reason)
    }

    disconnect() {
        if (this.socket == null) return;
        this.socket.close(WsStatusCode.NormalClosure, "disconnect");
    }
}