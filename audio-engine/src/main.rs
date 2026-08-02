mod bpm;
mod crossfader;
mod deck;
mod engine;
mod eq;
mod rpc;
mod waveform;

use serde_json::Value;
use std::io::{self, BufRead, Write};

fn main() {
    let stdin = io::stdin();
    let stdout = io::stdout();
    let mut out = stdout.lock();

    let engine = match engine::AudioEngine::new() {
        Ok(engine) => engine,
        Err(error) => {
            let fatal = serde_json::json!({"event": "fatal", "message": error});
            let _ = writeln!(out, "{}", fatal);
            let _ = out.flush();
            std::process::exit(1);
        }
    };
    let info = engine.info();
    let ready = serde_json::json!({
        "event": "ready",
        "version": env!("CARGO_PKG_VERSION"),
        "sampleRate": info.sample_rate,
        "channels": info.channels,
        "sampleFormat": info.sample_format,
        "outputDevice": info.output_device,
        "capabilities": { "vst3Hosting": false }
    });
    writeln!(out, "{}", ready).unwrap();
    out.flush().unwrap();

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
