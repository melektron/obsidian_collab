/*
ELEKTRON © 2026 - now
Written by melektron
www.elektron.work
27.04.26, 21:32

Common global error definitions
*/

use thiserror::Error;

#[derive(Error, Debug)]
pub enum CollabError {
    // this is Send unlike Poison error because it is only informational
    // and doesn't give access to the poisoned data
    #[error("Failed to acquire a lock (poison error)")]
    LockFailed,

    //#[error("Console is about to shut down")]
    //ShuttingDown, // console is likely shutting down (main IO channels closed)
    //#[error("Authentication failure (user: {0})")]
    //AuthenticationFailure(String),
}
