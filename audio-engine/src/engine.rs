use crate::bpm::BpmResult;
use crate::crossfader::{Crossfader, CrossfaderCurve};
use crate::deck::{analyze_snapshot, Deck, DeckPosition};
use crate::eq::GlobalEqualizer;
use cpal::traits::{DeviceTrait, HostTrait, StreamTrait};
use std::sync::{Arc, Mutex};

pub struct EngineInfo {
    pub sample_rate: u32,
    pub channels: u16,
    pub sample_format: String,
    pub output_device: String,
}

pub struct AudioEngine {
    inner: Arc<Mutex<EngineInner>>,
    stream: cpal::Stream,
    info: EngineInfo,
}

struct EngineInner {
    decks: [Deck; 2],
    crossfader: Crossfader,
    global_eq: GlobalEqualizer,
    global_eq_enabled: bool,
    master_volume: f32,
    deck_buffer_a: Vec<f32>,
    deck_buffer_b: Vec<f32>,
}

impl AudioEngine {
    pub fn new() -> Result<Self, String> {
        let host = cpal::default_host();
        let device = host
            .default_output_device()
            .ok_or_else(|| "no output audio device found".to_string())?;
        let output_device = device
            .name()
            .unwrap_or_else(|_| "Unknown output".to_string());
        let supported_config = device
            .default_output_config()
            .map_err(|e| format!("cannot read output configuration: {e}"))?;
        let sample_format = supported_config.sample_format();
        let config = supported_config.config();
        let sample_rate = config.sample_rate.0;
        let channels = config.channels;
        if channels == 0 {
            return Err("output device reports zero channels".to_string());
        }

        let inner = Arc::new(Mutex::new(EngineInner {
            decks: [Deck::new(sample_rate), Deck::new(sample_rate)],
            crossfader: Crossfader::new(),
            global_eq: GlobalEqualizer::new(sample_rate),
            global_eq_enabled: false,
            master_volume: 1.0,
            deck_buffer_a: Vec::new(),
            deck_buffer_b: Vec::new(),
        }));
        let stream = build_output_stream(&device, &config, sample_format, inner.clone())?;
        stream
            .play()
            .map_err(|e| format!("cannot start output stream: {e}"))?;

        Ok(Self {
            inner,
            stream,
            info: EngineInfo {
                sample_rate,
                channels,
                sample_format: format!("{sample_format:?}"),
                output_device,
            },
        })
    }

    pub fn info(&self) -> &EngineInfo {
        &self.info
    }

    pub fn load_track(&self, deck: usize, path: &str) -> Result<(), String> {
        let decoded = Deck::decode(path, self.info.sample_rate)?;
        let mut engine = self.lock_engine()?;
        engine.decks[deck].replace_audio(decoded);
        Ok(())
    }

    pub fn play(&self, deck: usize) {
        if let Ok(mut engine) = self.inner.lock() {
            engine.decks[deck].play();
        }
    }

    pub fn pause(&self, deck: usize) {
        if let Ok(mut engine) = self.inner.lock() {
            engine.decks[deck].pause();
        }
    }

    pub fn stop(&self, deck: usize) {
        if let Ok(mut engine) = self.inner.lock() {
            engine.decks[deck].stop();
        }
    }

    pub fn seek(&self, deck: usize, position_samples: usize) {
        if let Ok(mut engine) = self.inner.lock() {
            engine.decks[deck].seek(position_samples);
        }
    }

    pub fn set_deck_gain(&self, deck: usize, gain: f32) {
        if let Ok(mut engine) = self.inner.lock() {
            engine.decks[deck].gain = gain.clamp(0.0, 2.0);
        }
    }

    pub fn get_position(&self, deck: usize) -> DeckPosition {
        self.inner
            .lock()
            .map(|engine| engine.decks[deck].get_position())
            .unwrap_or(DeckPosition {
                position_samples: 0,
                duration_samples: 0,
                bpm: None,
                playing: false,
            })
    }

    pub fn set_cue(&self, deck: usize, cue_index: usize, position: usize) {
        if let Ok(mut engine) = self.inner.lock() {
            engine.decks[deck].set_cue(cue_index, position);
        }
    }

    pub fn jump_to_cue(&self, deck: usize, cue_index: usize) {
        if let Ok(mut engine) = self.inner.lock() {
            engine.decks[deck].jump_to_cue(cue_index);
        }
    }

    pub fn set_loop(&self, deck: usize, start: Option<usize>, end: Option<usize>) {
        if let Ok(mut engine) = self.inner.lock() {
            engine.decks[deck].set_loop(start, end);
        }
    }

    pub fn set_crossfader(&self, value: f32) {
        if let Ok(mut engine) = self.inner.lock() {
            engine.crossfader.set_position(value);
        }
    }

    pub fn set_crossfader_curve(&self, curve: &str) -> Result<(), String> {
        let curve = match curve {
            "linear" => CrossfaderCurve::Linear,
            "equal-power" => CrossfaderCurve::EqualPower,
            "scratch" => CrossfaderCurve::Scratch,
            _ => return Err(format!("unknown curve: {curve}")),
        };
        self.lock_engine()?.crossfader.set_curve(curve);
        Ok(())
    }

    pub fn set_eq(&self, deck: usize, band: &str, gain_db: f32) -> Result<(), String> {
        self.lock_engine()?.decks[deck].set_eq(band, gain_db)
    }

    pub fn set_global_eq(&self, bands: &[f32]) -> Result<(), String> {
        self.lock_engine()?.global_eq.set_bands(bands)
    }

    pub fn set_global_eq_enabled(&self, enabled: bool) {
        if let Ok(mut engine) = self.inner.lock() {
            engine.global_eq_enabled = enabled;
        }
    }

    pub fn get_waveform(&self, deck: usize, width: usize) -> Result<Vec<f32>, String> {
        if !(16..=8192).contains(&width) {
            return Err("waveform width must be between 16 and 8192".to_string());
        }
        let (samples, _) = self.lock_engine()?.decks[deck].analysis_snapshot()?;
        Ok(crate::waveform::generate_rms_thumbnail(&samples, width))
    }

    pub fn analyze_bpm(&self, deck: usize) -> Result<BpmResult, String> {
        let (samples, sample_rate) = self.lock_engine()?.decks[deck].analysis_snapshot()?;
        let result = analyze_snapshot(&samples, sample_rate);
        self.lock_engine()?.decks[deck].bpm = Some(result.bpm);
        Ok(result)
    }

    pub fn set_manual_bpm(&self, deck: usize, bpm: f64) {
        if let Ok(mut engine) = self.inner.lock() {
            engine.decks[deck].bpm = Some(bpm.clamp(30.0, 300.0));
        }
    }

    pub fn sync_bpm(&self, source: usize, target: usize) -> Result<(), String> {
        let mut engine = self.lock_engine()?;
        let source_bpm = engine.decks[source].bpm.ok_or("source deck has no BPM")?;
        let target_bpm = engine.decks[target].bpm.ok_or("target deck has no BPM")?;
        let ratio = source_bpm / target_bpm;
        engine.decks[target].set_playback_rate(ratio);
        Ok(())
    }

    pub fn set_master_volume(&self, volume: f32) {
        if let Ok(mut engine) = self.inner.lock() {
            engine.master_volume = volume.clamp(0.0, 1.0);
        }
    }

    fn lock_engine(&self) -> Result<std::sync::MutexGuard<'_, EngineInner>, String> {
        self.inner
            .lock()
            .map_err(|_| "audio engine state is unavailable".to_string())
    }
}

impl Drop for AudioEngine {
    fn drop(&mut self) {
        let _ = self.stream.pause();
    }
}

impl EngineInner {
    fn fill_buffer(&mut self, data: &mut [f32]) {
        data.fill(0.0);
        if self.deck_buffer_a.len() != data.len() {
            self.deck_buffer_a.resize(data.len(), 0.0);
            self.deck_buffer_b.resize(data.len(), 0.0);
        }

        let (gain_a, gain_b) = self.crossfader.get_gains();
        self.decks[0].fill_buffer(&mut self.deck_buffer_a);
        self.decks[1].fill_buffer(&mut self.deck_buffer_b);
        let deck_gain_a = self.decks[0].gain;
        let deck_gain_b = self.decks[1].gain;

        for ((output, sample_a), sample_b) in data
            .iter_mut()
            .zip(self.deck_buffer_a.iter())
            .zip(self.deck_buffer_b.iter())
        {
            *output = *sample_a * gain_a * deck_gain_a + *sample_b * gain_b * deck_gain_b;
        }
        if self.global_eq_enabled {
            self.global_eq.process(data);
        }
        for sample in data {
            *sample = (*sample * self.master_volume).clamp(-1.0, 1.0);
        }
    }
}

fn build_output_stream(
    device: &cpal::Device,
    config: &cpal::StreamConfig,
    sample_format: cpal::SampleFormat,
    inner: Arc<Mutex<EngineInner>>,
) -> Result<cpal::Stream, String> {
    let channels = config.channels as usize;
    let error_callback = |error| eprintln!("audio stream error: {error}");
    match sample_format {
        cpal::SampleFormat::F32 => {
            let mut stereo_scratch = Vec::new();
            device.build_output_stream(
                config,
                move |output: &mut [f32], _| {
                    render_device_buffer(&inner, output, channels, &mut stereo_scratch)
                },
                error_callback,
                None,
            )
        }
        cpal::SampleFormat::I16 => {
            let mut float_output = Vec::new();
            let mut stereo_scratch = Vec::new();
            device.build_output_stream(
                config,
                move |output: &mut [i16], _| {
                    float_output.resize(output.len(), 0.0);
                    render_device_buffer(&inner, &mut float_output, channels, &mut stereo_scratch);
                    for (target, sample) in output.iter_mut().zip(float_output.iter()) {
                        *target = (*sample * i16::MAX as f32) as i16;
                    }
                },
                error_callback,
                None,
            )
        }
        cpal::SampleFormat::U16 => {
            let mut float_output = Vec::new();
            let mut stereo_scratch = Vec::new();
            device.build_output_stream(
                config,
                move |output: &mut [u16], _| {
                    float_output.resize(output.len(), 0.0);
                    render_device_buffer(&inner, &mut float_output, channels, &mut stereo_scratch);
                    for (target, sample) in output.iter_mut().zip(float_output.iter()) {
                        *target = ((*sample * 0.5 + 0.5) * u16::MAX as f32) as u16;
                    }
                },
                error_callback,
                None,
            )
        }
        _ => {
            return Err(format!(
                "unsupported output sample format: {sample_format:?}"
            ))
        }
    }
    .map_err(|e| format!("cannot build output stream: {e}"))
}

fn render_device_buffer(
    inner: &Arc<Mutex<EngineInner>>,
    output: &mut [f32],
    channels: usize,
    stereo_scratch: &mut Vec<f32>,
) {
    output.fill(0.0);
    if channels == 2 {
        if let Ok(mut engine) = inner.try_lock() {
            engine.fill_buffer(output);
        }
        return;
    }

    let frames = output.len() / channels;
    stereo_scratch.resize(frames * 2, 0.0);
    stereo_scratch.fill(0.0);
    if let Ok(mut engine) = inner.try_lock() {
        engine.fill_buffer(stereo_scratch);
    }
    for (frame_index, device_frame) in output.chunks_exact_mut(channels).enumerate() {
        let left = stereo_scratch[frame_index * 2];
        let right = stereo_scratch[frame_index * 2 + 1];
        if channels == 1 {
            device_frame[0] = (left + right) * 0.5;
        } else {
            device_frame[0] = left;
            device_frame[1] = right;
        }
    }
}
