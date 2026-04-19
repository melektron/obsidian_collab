/*
ELEKTRON © 2026 - now
Written by melektron
www.elektron.work
09.03.26, 11:51

Command line argument definitions
*/

use std::path::{PathBuf};

use clap::Parser;

#[derive(Parser, Debug)]
#[command(version, about, long_about = None)]
pub struct Args {
    /// Data folder where documents are stored
    #[arg(short, long)]
    pub data: PathBuf,

    ///// Config file location
    //#[arg(short, long)]
    //config: PathBuf
    
    /// force enabling the repl, even in non-interactive environments
    /// (may lead to unexpected errors)
    #[arg(long="force-repl")]
    pub force_repl: Option<bool>
}