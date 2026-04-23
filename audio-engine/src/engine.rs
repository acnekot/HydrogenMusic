use std::sync::{Arc, Mutex, atomic::{AtomicBool, Ordering}};
use crate::deck::{Deck, DeckPosition};
use crate::crossfader::{Crossfader, CrossfaderCurve};
use crate::eq::GlobalEqualizer;
use crate::vst3_host::{Vst3Host, PluginInfo, PluginParam};
use crate::bpm::BpmResult;
use crate::waveform;

pub struct AudioEngine {
    inner: Arc<Mutex<EngineInner>>,
}

struct EngineInner {
    decks: [Deck; 2],
    crossfader: Crossfader,
    global_eq: GlobalEqualizer,
    global_eq_enabled: bool,
    master_volume: f32,
    vst3_host: Vst3Host,
    sample_rate: u32,
}

impl AudioEngine {
    pub fn new() -> Self {
        let sample_rate = 44100;
        let inner = EngineInner {
            decks: [Deck::new(sample_rate), Deck::new(sample_rate)],
            crossfader: Crossfader::new(),
            global_eq: GlobalEqualizer::new(sample_rate),
            global_eq_enabled: false,
            master_volume: 1.0,
            vst3_host: Vst3Host::new(),
            sample_rate,
        };

        let engine = AudioEngine {
            inner: Arc::new(Mutex::new(inner)),
        };

        engine.start_audio_stream();
        engine
    }

    fn start_audio_stream(&self) {
        let inner = self.inner.clone();

        std::thread::spawn(move || {
            use cpal::traits::{DeviceTrait, HostTrait, StreamTrait};

            let host = cpal::default_host();
            let device = match host.default_output_device() {
                Some(d) => d,
                None => {
                    eprintln!("No output audio device found");
                    return;
                }
            };

            let config = cpal::StreamConfig {
                channels: 2,
                sample_rate: cpal::SampleRate(44100),
                buffer_size: cpal::BufferSize::Default,
            };

            let stream = device.build_output_stream(
                &config,
                move |data: &mut [f32], _: &cpal::OutputCallbackInfo| {
                    let mut eng = inner.lock().unwrap();
                    eng.fill_buffer(data);
                },
                |err| {
                    eprintln!("Audio stream error: {}", err);
                },
                None,
            ).unwrap();

            stream.play().unwrap();

            // Keep thread alive to hold the stream
            loop {
                std::thread::park();
            }
        });
    }

    // ===== Deck controls =====

    pub fn load_track(&self, deck: usize, path: &str) -> Result<(), String> {
        let mut eng = self.inner.lock().unwrap();
        eng.decks[deck].load(path)
    }

    pub fn play(&self, deck: usize) {
        let mut eng = self.inner.lock().unwrap();
        eng.decks[deck].play();
    }

    pub fn pause(&self, deck: usize) {
        let mut eng = self.inner.lock().unwrap();
        eng.decks[deck].pause();
    }

    pub fn stop(&self, deck: usize) {
        let mut eng = self.inner.lock().unwrap();
        eng.decks[deck].stop();
    }

    pub fn seek(&self, deck: usize, position_samples: usize) {
        let mut eng = self.inner.lock().unwrap();
        eng.decks[deck].seek(position_samples);
    }

    pub fn set_deck_gain(&self, deck: usize, gain: f32) {
        let mut eng = self.inner.lock().unwrap();
        eng.decks[deck].gain = gain;
    }

    pub fn get_position(&self, deck: usize) -> DeckPosition {
        let eng = self.inner.lock().unwrap();
        eng.decks[deck].get_position()
    }

    // ===== Cue =====

    pub fn set_cue(&self, deck: usize, cue_index: usize, position: usize) {
        let mut eng = self.inner.lock().unwrap();
        eng.decks[deck].set_cue(cue_index, position);
    }

    pub fn jump_to_cue(&self, deck: usize, cue_index: usize) {
        let mut eng = self.inner.lock().unwrap();
        eng.decks[deck].jump_to_cue(cue_index);
    }

    pub fn set_loop(&self, deck: usize, start: Option<usize>, end: Option<usize>) {
        let mut eng = self.inner.lock().unwrap();
        eng.decks[deck].set_loop(start, end);
    }

    // ===== Crossfader =====

    pub fn set_crossfader(&self, value: f32) {
        let mut eng = self.inner.lock().unwrap();
        eng.crossfader.set_position(value);
    }

    pub fn set_crossfader_curve(&self, curve: &str) -> Result<(), String> {
        let mut eng = self.inner.lock().unwrap();
        let c = match curve {
            "linear" => CrossfaderCurve::Linear,
            "equal-power" => CrossfaderCurve::EqualPower,
            "scratch" => CrossfaderCurve::Scratch,
            _ => return Err(format!("unknown curve: {}", curve)),
        };
        eng.crossfader.set_curve(c);
        Ok(())
    }

    // ===== EQ =====

    pub fn set_eq(&self, deck: usize, band: &str, gain_db: f32) -> Result<(), String> {
        let mut eng = self.inner.lock().unwrap();
        eng.decks[deck].set_eq(band, gain_db)
    }

    pub fn set_global_eq(&self, bands: &[f32]) -> Result<(), String> {
        let mut eng = self.inner.lock().unwrap();
        eng.global_eq.set_bands(bands)
    }

    pub fn set_global_eq_enabled(&self, enabled: bool) {
        let mut eng = self.inner.lock().unwrap();
        eng.global_eq_enabled = enabled;
    }

    // ===== VST3 =====

    pub fn scan_vst3(&self, paths: &[String]) -> Result<Vec<PluginInfo>, String> {
        let mut eng = self.inner.lock().unwrap();
        eng.vst3_host.scan(paths)
    }

    pub fn load_vst3(&self, deck: usize, slot: usize, plugin_id: &str) -> Result<(), String> {
        let mut eng = self.inner.lock().unwrap();
        eng.vst3_host.load_to_slot(&mut eng.decks[deck], slot, plugin_id)
    }

    pub fn unload_vst3(&self, deck: usize, slot: usize) {
        let mut eng = self.inner.lock().unwrap();
        eng.vst3_host.unload_from_slot(&mut eng.decks[deck], slot);
    }

    pub fn get_vst3_params(&self, deck: usize, slot: usize) -> Result<Vec<PluginParam>, String> {
        let eng = self.inner.lock().unwrap();
        eng.vst3_host.get_params(&eng.decks[deck], slot)
    }

    // ===== FX =====

    pub fn set_fx_param(&self, deck: usize, slot: usize, param_id: u32, value: f64) {
        let mut eng = self.inner.lock().unwrap();
        eng.decks[deck].set_fx_param(slot, param_id, value);
    }

    pub fn set_fx_dry_wet(&self, deck: usize, slot: usize, value: f32) {
        let mut eng = self.inner.lock().unwrap();
        eng.decks[deck].set_fx_dry_wet(slot, value);
    }

    // ===== Waveform =====

    pub fn get_waveform(&self, deck: usize, width: usize) -> Result<Vec<f32>, String> {
        let eng = self.inner.lock().unwrap();
        eng.decks[deck].get_waveform(width)
    }

    // ===== BPM =====

    pub fn analyze_bpm(&self, deck: usize) -> Result<BpmResult, String> {
        let eng = self.inner.lock().unwrap();
        eng.decks[deck].analyze_bpm()
    }

    pub fn set_manual_bpm(&self, deck: usize, bpm: f64) {
        let mut eng = self.inner.lock().unwrap();
        eng.decks[deck].bpm = Some(bpm);
    }

    pub fn sync_bpm(&self, source: usize, target: usize) -> Result<(), String> {
        let mut eng = self.inner.lock().unwrap();
        let source_bpm = eng.decks[source].bpm.ok_or("source deck has no BPM")?;
        let target_bpm = eng.decks[target].bpm.ok_or("target deck has no BPM")?;
        let ratio = source_bpm / target_bpm;
        eng.decks[target].set_playback_rate(ratio);
        Ok(())
    }

    // ===== Master =====

    pub fn set_master_volume(&self, volume: f32) {
        let mut eng = self.inner.lock().unwrap();
        eng.master_volume = volume;
    }
}

impl EngineInner {
    /// 填充音频输出缓冲区（由 cpal 回调调用）
    fn fill_buffer(&mut self, data: &mut [f32]) {
        let frames = data.len() / 2;

        // 零初始化
        for s in data.iter_mut() {
            *s = 0.0;
        }

        // 获取 crossfader 增益
        let (gain_a, gain_b) = self.crossfader.get_gains();

        // 临时缓冲
        let mut deck_buf_a = vec![0.0f32; data.len()];
        let mut deck_buf_b = vec![0.0f32; data.len()];

        // 填充各 Deck
        self.decks[0].fill_buffer(&mut deck_buf_a);
        self.decks[1].fill_buffer(&mut deck_buf_b);

        // 混合
        for i in 0..data.len() {
            let mixed = deck_buf_a[i] * gain_a * self.decks[0].gain
                      + deck_buf_b[i] * gain_b * self.decks[1].gain;
            data[i] = mixed;
        }

        // 全局 EQ
        if self.global_eq_enabled {
            self.global_eq.process(data);
        }

        // Master 音量
        for s in data.iter_mut() {
            *s *= self.master_volume;
        }
    }
}
