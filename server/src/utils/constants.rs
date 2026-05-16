/*
ELEKTRON © 2026 - now
Written by melektron
www.elektron.work
11.05.26, 19:40

various constants used for networking and other things
*/

// https://www.rfc-editor.org/rfc/rfc6455.html#section-7.4.1
// https://www.rfc-editor.org/rfc/rfc6455.html#section-11.7
pub const WS_CLOSE_NORMAL_CLOSURE: u16             = 1000;
pub const WS_CLOSE_GOING_AWAY: u16                 = 1001;
pub const WS_CLOSE_PROTOCOL_ERROR: u16             = 1002;
pub const WS_CLOSE_UNSUPPORTED: u16                = 1003;
pub const WS_CLOSE_RESERVED: u16                   = 1004;
pub const WS_CLOSE_NO_STATUS_RECEIVED: u16         = 1005;
pub const WS_CLOSE_ABNORMAL: u16                   = 1006;
pub const WS_CLOSE_INVALID_FRAME_PAYLOAD_DATA: u16 = 1007;
pub const WS_CLOSE_POLICY: u16                     = 1008;
pub const WS_CLOSE_MESSAGE_TOO_BIG: u16            = 1009;
pub const WS_CLOSE_MANDATORY_EXT: u16              = 1010;
pub const WS_CLOSE_INTERNAL_SERVER_ERROR: u16      = 1011;
pub const WS_CLOSE_TLS_HANDSHAKE: u16              = 1015;