use serde_json::Value;
use crate::engine::AudioEngine;

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
            let position = params["positionSamples"].as_u64().ok_or("missing positionSamples")?;
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
                "bpm": pos.bpm
            }))
        }

        // ===== Cue 点 =====
        "deck.setCue" => {
            let deck = get_deck_index(params)?;
            let cue_index = params["cueIndex"].as_u64().ok_or("missing cueIndex")? as usize;
            let position = params["positionSamples"].as_u64().ok_or("missing positionSamples")? as usize;
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
            let bands: Vec<f64> = serde_json::from_value(
                params["bands"].clone()
            ).map_err(|e| e.to_string())?;
            let bands_f32: Vec<f32> = bands.iter().map(|&v| v as f32).collect();
            engine.set_global_eq(&bands_f32)?;
            Ok(Value::Bool(true))
        }
        "eq.setGlobalEnabled" => {
            let enabled = params["enabled"].as_bool().ok_or("missing enabled")?;
            engine.set_global_eq_enabled(enabled);
            Ok(Value::Bool(true))
        }

        // ===== VST3 =====
        "vst3.scan" => {
            let paths: Vec<String> = serde_json::from_value(
                params["paths"].clone()
            ).map_err(|e| e.to_string())?;
            let plugins = engine.scan_vst3(&paths)?;
            Ok(serde_json::to_value(plugins).unwrap())
        }
        "vst3.load" => {
            let deck = get_deck_index(params)?;
            let slot = params["slot"].as_u64().ok_or("missing slot")? as usize;
            let plugin_id = params["pluginId"].as_str().ok_or("missing pluginId")?;
            engine.load_vst3(deck, slot, plugin_id)?;
            Ok(Value::Bool(true))
        }
        "vst3.unload" => {
            let deck = get_deck_index(params)?;
            let slot = params["slot"].as_u64().ok_or("missing slot")? as usize;
            engine.unload_vst3(deck, slot);
            Ok(Value::Bool(true))
        }
        "vst3.getParams" => {
            let deck = get_deck_index(params)?;
            let slot = params["slot"].as_u64().ok_or("missing slot")? as usize;
            let p = engine.get_vst3_params(deck, slot)?;
            Ok(serde_json::to_value(p).unwrap())
        }

        // ===== FX 参数 =====
        "fx.setParam" => {
            let deck = get_deck_index(params)?;
            let slot = params["slot"].as_u64().ok_or("missing slot")? as usize;
            let param_id = params["paramId"].as_u64().ok_or("missing paramId")? as u32;
            let value = get_f64(params, "value")?;
            engine.set_fx_param(deck, slot, param_id, value);
            Ok(Value::Bool(true))
        }
        "fx.setDryWet" => {
            let deck = get_deck_index(params)?;
            let slot = params["slot"].as_u64().ok_or("missing slot")? as usize;
            let value = get_f64(params, "value")?;
            engine.set_fx_dry_wet(deck, slot, value as f32);
            Ok(Value::Bool(true))
        }

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
            let target = params["targetDeck"].as_u64().ok_or("missing targetDeck")? as usize;
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
    params["deck"]
        .as_u64()
        .map(|v| v as usize)
        .ok_or_else(|| "missing deck index".to_string())
        .and_then(|d| {
            if d < 2 { Ok(d) } else { Err(format!("invalid deck index: {}", d)) }
        })
}

fn get_f64(params: &Value, key: &str) -> Result<f64, String> {
    params[key]
        .as_f64()
        .ok_or_else(|| format!("missing or invalid {}", key))
}
