/*
ELEKTRON © 2026 - now
Written by melektron
www.elektron.work
09.03.26, 11:51

Command line argument definitions
*/

use std::path::{PathBuf};

use axum_client_ip::{ClientIp, ClientIpSource};
use clap::Parser;

#[derive(Parser, Debug)]
#[command(version, about, long_about = None)]
pub struct Args {
    /// Data folder where documents are stored.
    #[arg(short, long, default_value = "./data")]
    pub data: PathBuf,

    ///// Config file location
    //#[arg(short, long)]
    //config: PathBuf
    
    /// Force enabling the repl, even in non-interactive environments.
    /// (may lead to unexpected errors)
    #[arg(long="force-repl")]
    pub force_repl: Option<bool>,

    /// Source of client IP address. By default the socket IP address,
    /// but usage of proxy headers can be selected instead.
    #[arg(long, default_value = "ConnectInfo")]
    pub ip_source: ClientIpSource,
}