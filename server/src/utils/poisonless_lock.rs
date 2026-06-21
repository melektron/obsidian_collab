/*
ELEKTRON © 2026 - now
Written by melektron
www.elektron.work
20.06.26, 14:24

Additional methods for std::sync::Mutex and similar to 
automatically lock and unwrap. This is useful when a thread panic
should be treated as unrecoverable but general use of unwrap() in code,
still should be avoided to making it easier to eliminate it in cases where 
we actually don't want a panic.
*/

pub trait PoisonlessLock<T> {
    fn poisonless_lock(&self) -> std::sync::MutexGuard<'_, T>;
}

impl<T> PoisonlessLock<T> for std::sync::Mutex<T> {
    fn poisonless_lock(&self) -> std::sync::MutexGuard<'_, T> {
        self.lock().unwrap()
    }
}