mod engine;
mod deck;
mod crossfader;
mod eq;
mod vst3_host;
mod bpm;
mod waveform;
mod rpc;

use std::io::{self, BufRead, Write};
use serde_json::Value;

fn main() {
    let stdin = io::stdin();
    let stdout = io::stdout();
    let mut out = stdout.lock();

    // Send ready event
    let ready = serde_json::json!({"event": "ready", "version": env!("CARGO_PKG_VERSION")});
    writeln!(out, "{}", ready).unwrap();
    out.flush().unwrap();

    let engine = engine::AudioEngine::new();

    for line in stdin.lock().lines() {
        let line = match line {
            Ok(l) if !l.trim().is_empty() => l,
            _ => continue,
        };

        let msg: Value = match serde_json::from_str(&line) {
            Ok(v) => v,
            Err(e) => {
                let err = serde_json::json!({"error": "parse_error", "message": e.to_string()});
                writeln!(out, "{}", err).unwrap();
                out.flush().unwrap();
                continue;
            }
        };

        let id = msg.get("id").cloned().unwrap_or(Value::Null);
        let method = msg["method"].as_str().unwrap_or("");
        let params = msg.get("params").cloned().unwrap_or(Value::Null);

        let result = rpc::dispatch(&engine, method, &params);

        let response = match result {
            Ok(val) => serde_json::json!({"id": id, "result": val}),
            Err(e) => serde_json::json!({"id": id, "error": {"code": -1, "message": e}}),
        };

        writeln!(out, "{}", response).unwrap();
        out.flush().unwrap();
    }
}
