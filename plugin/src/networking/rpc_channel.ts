/*
ELEKTRON © 2026 - now
Written by melektron
www.elektron.work
24.05.26, 20:08

Class representing an "RPC" call via the
websocket API using a C2S and S2C message
containing a "req_id" field
*/

const U32_MAX = (2**32 - 1)

export class RpcChannel<
    C2SMT extends string,
    S2CMT extends string,
    P extends { req_id: number; c2smtype: C2SMT },
    R extends { req_id: number; s2cmtype: S2CMT }
> {

    nextRequestId: number = 0
    activeRequests: Map<number, {
        resolve: (v: R) => void,
        reject: (reason: any) => void
    }> = new Map()

    constructor(
        private sender: (parameters: P) => boolean,
        private c2smtype: C2SMT,
        private s2cmtype: S2CMT
    ) { }

    /**
     * invokes the remote procedure on the server by sending 
     * a request message with given parameters.
     * @param parameters invocation parameters to send to server
     * (excluding req_id and message type)
     * @returns Promise to the server response message. Rejects
     * if server is not connected or disconnects before response
     * is received.
     */
    async call(parameters: Omit<P, "req_id" | "c2smtype">): Promise<R> {
        // allocate a request ID
        const reqId = this.nextRequestId++
        if (this.nextRequestId >= U32_MAX) {
            // it's unlikely to have more than 4 billion 
            // requests at once, so it's pretty safe to wrap
            // around by then
            this.nextRequestId = 0
        }

        return new Promise((resolve, reject) => {
            // register a callback for that request ID
            this.activeRequests.set(reqId, {
                resolve,
                reject
            })

            // send the request
            const success = this.sender({
                ...parameters,
                req_id: reqId,
                c2smtype: this.c2smtype
            } as P) // TS doesn't like this but adding the req_id back should yield P again

            // if the request could not be sent (e.g. bc the connection is closed)
            // we reject immediately
            if (!success) {
                // remove cb again
                this.activeRequests.delete(reqId)
                reject("not connected")
            }

            // otherwise wait for external resolve or reject
        })
    }

    /**
     * Handles server responses of this channel
     * and calls the specific request handlers
     * @param resp server response
     */
    handleResponse(resp: R) {
        if (resp.s2cmtype !== this.s2cmtype) {
            console.warn("RpcChannel handled invalid s2cmtype, ignoring")
            return
        }

        const request = this.activeRequests.get(resp.req_id)
        if (request === undefined) {
            console.warn(`RpcChannel handled unknown request id ${resp.req_id}, ignoring`)
            return
        }

        request.resolve(resp)
        this.activeRequests.delete(resp.req_id)
    }

    /**
     * cancels all running requests by rejecting
     * their promises. This is meant to be called
     * when the request cannot be fulfilled any longer
     * because the network connection has failed.
     * @param reason reason to pass to promise rejection
     */
    cancelAll(reason: any) {
        for (const [id, { resolve, reject }] of this.activeRequests) {
            reject(reason)
        }
        this.activeRequests.clear()
    }

}