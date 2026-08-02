use crate::engine::AudioEngine;
use serde_json::Value;

pub fn dispatch(engine: &AudioEngine, method: &str, params: &Value) -> Result<Value, String> {
    match method {
        // ===== Deck 控制 =====
        "deck.load" => {
            let deck = get_deck_index(params)?;
            let path = params["path"].as_str().ok_or("missing path")?;
            engine.load_track(deck, path)?;
            Ok(Value::Bool(true))
        }
        "deck.play" => {
            let deck = get_deck_index(params)?;
            engine.play(deck);
            Ok(Value::Bool(true))
        }
        "deck.pause" => {
            let deck = get_deck_index(params)?;
            engine.pause(deck);
            Ok(Value::Bool(true))
        }
        "deck.stop" => {
            let deck = get_deck_index(params)?;
            engine.stop(deck);
            Ok(Value::Bool(true))
        }
        "deck.seek" => {
            let deck = get_deck_index(params)?;
            let position = params["positionSamples"]
                .as_u64()
                .ok_or("missing positionSamples")?;
            engine.seek(deck, position as usize);
            Ok(Value::Bool(true))
        }
        "deck.setGain" => {
            let deck = get_deck_index(params)?;
            let gain = get_f64(params, "gain")?;
            engine.set_deck_gain(deck, gain as f32);
            Ok(Value::Bool(true))
        }
        "deck.getPosition" => {
            let deck = get_deck_index(params)?;
            let pos = engine.get_position(deck);
            Ok(serde_json::json!({
                "positionSamples": pos.position_samples,
                "durationSamples": pos.duration_samples,
                "bpm": pos.bpm,
                "playing": pos.playing
            }))
        }

        // ===== Cue 点 =====
        "deck.setCue" => {
            let deck = get_deck_index(params)?;
            let cue_index = params["cueIndex"].as_u64().ok_or("missing cueIndex")? as usize;
            let position = params["positionSamples"]
                .as_u64()
                .ok_or("missing positionSamples")? as usize;
            engine.set_cue(deck, cue_index, position);
            Ok(Value::Bool(true))
        }
        "deck.jumpToCue" => {
            let deck = get_deck_index(params)?;
            let cue_index = params["cueIndex"].as_u64().ok_or("missing cueIndex")? as usize;
            engine.jump_to_cue(deck, cue_index);
            Ok(Value::Bool(true))
        }
        "deck.setLoop" => {
            let deck = get_deck_index(params)?;
            let start = params["startSamples"].as_u64().map(|v| v as usize);
            let end = params["endSamples"].as_u64().map(|v| v as usize);
            engine.set_loop(deck, start, end);
            Ok(Value::Bool(true))
        }

        // ===== Crossfader =====
        "crossfader.set" => {
            let value = get_f64(params, "value")?;
            engine.set_crossfader(value as f32);
            Ok(Value::Bool(true))
        }
        "crossfader.setCurve" => {
            let curve = params["curve"].as_str().ok_or("missing curve")?;
            engine.set_crossfader_curve(curve)?;
            Ok(Value::Bool(true))
        }

        // ===== EQ =====
        "eq.set" => {
            let deck = get_deck_index(params)?;
            let band = params["band"].as_str().ok_or("missing band")?;
            let gain_db = get_f64(params, "gainDb")?;
            engine.set_eq(deck, band, gain_db as f32)?;
            Ok(Value::Bool(true))
        }

        // ===== 全局 10 段均衡器 =====
        "eq.setGlobal" => {
            let bands: Vec<f64> =
                serde_json::from_value(params["bands"].clone()).map_err(|e| e.to_string())?;
            let bands_f32: Vec<f32> = bands.iter().map(|&v| v as f32).collect();
            engine.set_global_eq(&bands_f32)?;
            Ok(Value::Bool(true))
        }
        "eq.setGlobalEnabled" => {
            let enabled = params["enabled"].as_bool().ok_or("missing enabled")?;
            engine.set_global_eq_enabled(enabled);
            Ok(Value::Bool(true))
        }

        // VST3 hosting is intentionally unavailable until a real realtime-safe host exists.
        "vst3.scan" | "vst3.load" | "vst3.unload" | "vst3.getParams" | "fx.setParam"
        | "fx.setDryWet" => Err(
            "VST3 hosting is not implemented; the experimental DJ engine cannot load plugins"
                .to_string(),
        ),

        // ===== 波形 =====
        "waveform.request" => {
            let deck = get_deck_index(params)?;
            let width = params["width"].as_u64().unwrap_or(1024) as usize;
            let data = engine.get_waveform(deck, width)?;
            Ok(serde_json::json!({"deck": deck, "data": data}))
        }

        // ===== BPM =====
        "bpm.analyze" => {
            let deck = get_deck_index(params)?;
            let result = engine.analyze_bpm(deck)?;
            Ok(serde_json::json!({
                "deck": deck,
                "bpm": result.bpm,
                "confidence": result.confidence
            }))
        }
        "bpm.setManual" => {
            let deck = get_deck_index(params)?;
            let bpm = get_f64(params, "bpm")?;
            engine.set_manual_bpm(deck, bpm);
            Ok(Value::Bool(true))
        }
        "bpm.sync" => {
            let source = get_deck_index(params)?;
            let target = get_bounded_index(params, "targetDeck", 2)?;
            engine.sync_bpm(source, target)?;
            Ok(Value::Bool(true))
        }

        // ===== Master =====
        "master.setVolume" => {
            let volume = get_f64(params, "volume")?;
            engine.set_master_volume(volume as f32);
            Ok(Value::Bool(true))
        }

        // ===== Ping =====
        "ping" => Ok(serde_json::json!({"pong": true})),

        _ => Err(format!("unknown method: {}", method)),
    }
}

fn get_deck_index(params: &Value) -> Result<usize, String> {
    get_bounded_index(params, "deck", 2)
}

fn get_bounded_index(params: &Value, key: &str, upper_bound: usize) -> Result<usize, String> {
    params[key]
        .as_u64()
        .map(|v| v as usize)
        .ok_or_else(|| format!("missing or invalid {key}"))
        .and_then(|d| {
            if d < upper_bound {
                Ok(d)
            } else {
                Err(format!("invalid {key}: {d}"))
            }
        })
}

fn get_f64(params: &Value, key: &str) -> Result<f64, String> {
    params[key]
        .as_f64()
        .ok_or_else(|| format!("missing or invalid {}", key))
}
