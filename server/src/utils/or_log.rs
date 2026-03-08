/*
ELEKTRON © 2026 - now
Written by melektron
www.elektron.work
08.03.26, 15:25
*/

use log::{debug, error, info, trace, warn};

/// Adds methods to print a logging message for any error case
pub trait OrLog {
    fn or_error(&self, msg: &str);
    fn or_warn(&self, msg: &str);
    fn or_info(&self, msg: &str);
    fn or_debug(&self, msg: &str);
    fn or_trace(&self, msg: &str);
    fn ignore_error(&self);
}

impl<T, E> OrLog for Result<T, E> {
    fn or_error(&self, msg: &str) {
        if self.is_err() {
            error!("{msg}")
        }
    }

    fn or_warn(&self, msg: &str) {
        if self.is_err() {
            warn!("{msg}")
        }
    }

    fn or_info(&self, msg: &str) {
        if self.is_err() {
            info!("{msg}")
        }
    }

    fn or_debug(&self, msg: &str) {
        if self.is_err() {
            debug!("{msg}")
        }
    }

    fn or_trace(&self, msg: &str) {
        if self.is_err() {
            trace!("{msg}")
        }
    }
    
    fn ignore_error(&self) {}
}