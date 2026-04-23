use std::io::BufReader;
use symphonia::core::audio::SampleBuffer;
use symphonia::core::codecs::DecoderOptions;
use symphonia::core::formats::FormatOptions;
use symphonia::core::io::MediaSourceStream;
use symphonia::core::meta::MetadataOptions;
use symphonia::core::probe::Hint;
use crate::eq::DeckEqualizer;
use crate::bpm::{self, BpmResult};

const MAX_CUES: usize = 4;
const MAX_FX_SLOTS: usize = 4;

/// 一条 FX 插槽
pub struct FxSlot {
    pub active: bool,
    pub dry_wet: f32,
    /// VST3 插件实例引用（如果已加载）
    pub plugin_instance: Option<Box<dyn FxProcessor>>,
    pub params: std::collections::HashMap<u32, f64>,
}

pub trait FxProcessor: Send {
    fn process(&mut self, data: &mut [f32]);
    fn set_param(&mut self, id: u32, value: f64);
    fn get_params(&self) -> Vec<(u32, String, f64)>; // (id, name, value)
}

impl FxSlot {
    fn new() -> Self {
        FxSlot {
            active: false,
            dry_wet: 1.0,
            plugin_instance: None,
            params: std::collections::HashMap::new(),
        }
    }
}

pub struct DeckPosition {
    pub position_samples: usize,
    pub duration_samples: usize,
    pub bpm: Option<f64>,
}

pub struct Deck {
    /// 解码后的交错立体声 PCM 数据
    audio_data: Vec<f32>,
    /// 当前播放头位置（sample frame，非 sample index）
    position: usize,
    /// 是否正在播放
    playing: bool,
    /// Deck 增益
    pub gain: f32,
    /// BPM（检测到的或手动设定的）
    pub bpm: Option<f64>,
    /// 播放速率（1.0 = 正常，用于 BPM sync）
    playback_rate: f64,
    /// Cue 点（最多 4 个）
    cues: [Option<usize>; MAX_CUES],
    /// 循环区间
    loop_start: Option<usize>,
    loop_end: Option<usize>,
    /// 3 段 EQ
    eq: DeckEqualizer,
    /// FX 效果链
    pub fx_chain: [FxSlot; MAX_FX_SLOTS],
    /// 采样率
    sample_rate: u32,
}

impl Deck {
    pub fn new(sample_rate: u32) -> Self {
        Deck {
            audio_data: Vec::new(),
            position: 0,
            playing: false,
            gain: 1.0,
            bpm: None,
            playback_rate: 1.0,
            cues: [None; MAX_CUES],
            loop_start: None,
            loop_end: None,
            eq: DeckEqualizer::new(sample_rate),
            fx_chain: [FxSlot::new(), FxSlot::new(), FxSlot::new(), FxSlot::new()],
            sample_rate,
        }
    }

    pub fn load(&mut self, path: &str) -> Result<(), String> {
        self.stop();

        let file = std::fs::File::open(path).map_err(|e| format!("cannot open file: {}", e))?;
        let mss = MediaSourceStream::new(Box::new(BufReader::new(file)), Default::default());

        let mut hint = Hint::new();
        if let Some(ext) = std::path::Path::new(path).extension().and_then(|e| e.to_str()) {
            hint.with_extension(ext);
        }

        let probed = symphonia::default::get_probe()
            .format(&hint, mss, &FormatOptions::default(), &MetadataOptions::default())
            .map_err(|e| format!("probe failed: {}", e))?;

        let mut format = probed.format;
        let track = format.default_track().ok_or("no audio track found")?;
        let track_id = track.id;

        let mut decoder = symphonia::default::get_codecs()
            .make(&track.codec_params, &DecoderOptions::default())
            .map_err(|e| format!("codec init failed: {}", e))?;

        let mut samples = Vec::new();

        loop {
            let packet = match format.next_packet() {
                Ok(p) => p,
                Err(symphonia::core::errors::Error::IoError(ref e))
                    if e.kind() == std::io::ErrorKind::UnexpectedEof => break,
                Err(_) => break,
            };

            if packet.track_id() != track_id {
                continue;
            }

            let decoded = match decoder.decode(&packet) {
                Ok(d) => d,
                Err(_) => continue,
            };

            let spec = *decoded.spec();
            let num_frames = decoded.frames();
            let mut sample_buf = SampleBuffer::<f32>::new(num_frames as u64, spec);
            sample_buf.copy_interleaved_ref(decoded);

            let interleaved = sample_buf.samples();

            // 如果是单声道，展开为立体声
            if spec.channels.count() == 1 {
                for &s in interleaved {
                    samples.push(s);
                    samples.push(s);
                }
            } else {
                samples.extend_from_slice(interleaved);
            }
        }

        self.audio_data = samples;
        self.position = 0;
        self.bpm = None;
        self.cues = [None; MAX_CUES];
        self.loop_start = None;
        self.loop_end = None;

        Ok(())
    }

    pub fn play(&mut self) {
        if !self.audio_data.is_empty() {
            self.playing = true;
        }
    }

    pub fn pause(&mut self) {
        self.playing = false;
    }

    pub fn stop(&mut self) {
        self.playing = false;
        self.position = 0;
    }

    pub fn seek(&mut self, position_samples: usize) {
        let total_frames = self.audio_data.len() / 2;
        self.position = position_samples.min(total_frames);
    }

    pub fn get_position(&self) -> DeckPosition {
        DeckPosition {
            position_samples: self.position,
            duration_samples: self.audio_data.len() / 2,
            bpm: self.bpm,
        }
    }

    // ===== Cue =====

    pub fn set_cue(&mut self, index: usize, position: usize) {
        if index < MAX_CUES {
            self.cues[index] = Some(position);
        }
    }

    pub fn jump_to_cue(&mut self, index: usize) {
        if index < MAX_CUES {
            if let Some(pos) = self.cues[index] {
                self.seek(pos);
            }
        }
    }

    pub fn set_loop(&mut self, start: Option<usize>, end: Option<usize>) {
        self.loop_start = start;
        self.loop_end = end;
    }

    // ===== EQ =====

    pub fn set_eq(&mut self, band: &str, gain_db: f32) -> Result<(), String> {
        self.eq.set_band(band, gain_db)
    }

    // ===== FX =====

    pub fn set_fx_param(&mut self, slot: usize, param_id: u32, value: f64) {
        if slot < MAX_FX_SLOTS {
            self.fx_chain[slot].params.insert(param_id, value);
            if let Some(ref mut plugin) = self.fx_chain[slot].plugin_instance {
                plugin.set_param(param_id, value);
            }
        }
    }

    pub fn set_fx_dry_wet(&mut self, slot: usize, value: f32) {
        if slot < MAX_FX_SLOTS {
            self.fx_chain[slot].dry_wet = value.clamp(0.0, 1.0);
        }
    }

    pub fn set_playback_rate(&mut self, rate: f64) {
        self.playback_rate = rate.clamp(0.25, 4.0);
    }

    // ===== Waveform =====

    pub fn get_waveform(&self, width: usize) -> Result<Vec<f32>, String> {
        if self.audio_data.is_empty() {
            return Err("no audio loaded".to_string());
        }

        let total_frames = self.audio_data.len() / 2;
        let frames_per_pixel = total_frames as f64 / width as f64;
        let mut result = Vec::with_capacity(width);

        for i in 0..width {
            let start_frame = (i as f64 * frames_per_pixel) as usize;
            let end_frame = ((i + 1) as f64 * frames_per_pixel) as usize;
            let end_frame = end_frame.min(total_frames);

            let mut rms = 0.0f64;
            let mut count = 0usize;

            for f in start_frame..end_frame {
                let idx = f * 2;
                if idx + 1 < self.audio_data.len() {
                    let l = self.audio_data[idx] as f64;
                    let r = self.audio_data[idx + 1] as f64;
                    let mono = (l + r) * 0.5;
                    rms += mono * mono;
                    count += 1;
                }
            }

            if count > 0 {
                result.push((rms / count as f64).sqrt() as f32);
            } else {
                result.push(0.0);
            }
        }

        Ok(result)
    }

    // ===== BPM =====

    pub fn analyze_bpm(&self) -> Result<BpmResult, String> {
        if self.audio_data.is_empty() {
            return Err("no audio loaded".to_string());
        }
        Ok(bpm::detect_bpm(&self.audio_data, self.sample_rate))
    }

    // ===== Audio buffer fill =====

    pub fn fill_buffer(&mut self, data: &mut [f32]) {
        if !self.playing || self.audio_data.is_empty() {
            for s in data.iter_mut() {
                *s = 0.0;
            }
            return;
        }

        let total_frames = self.audio_data.len() / 2;
        let frames = data.len() / 2;

        // TODO: 使用 rubato 进行 playback_rate 变速（当前简单跳采样）
        for i in 0..frames {
            if self.position >= total_frames {
                // 检查循环
                if let (Some(ls), Some(_)) = (self.loop_start, self.loop_end) {
                    self.position = ls;
                } else {
                    // 到达结尾
                    self.playing = false;
                    data[i * 2] = 0.0;
                    data[i * 2 + 1] = 0.0;
                    continue;
                }
            }

            // 循环边界检测
            if let Some(le) = self.loop_end {
                if self.position >= le {
                    if let Some(ls) = self.loop_start {
                        self.position = ls;
                    }
                }
            }

            let idx = self.position * 2;
            data[i * 2] = self.audio_data[idx];
            data[i * 2 + 1] = self.audio_data[idx + 1];

            // 简单的速率调整（整数步进，后续换 rubato）
            let step = self.playback_rate.round().max(1.0) as usize;
            self.position += step;
        }

        // 通过 EQ
        self.eq.process(data);

        // 通过 FX 链
        for slot in &mut self.fx_chain {
            if slot.active {
                if let Some(ref mut plugin) = slot.plugin_instance {
                    if slot.dry_wet >= 1.0 {
                        plugin.process(data);
                    } else if slot.dry_wet > 0.0 {
                        // Dry/Wet 混合
                        let dry = data.to_vec();
                        plugin.process(data);
                        let wet_amount = slot.dry_wet;
                        let dry_amount = 1.0 - wet_amount;
                        for (i, s) in data.iter_mut().enumerate() {
                            *s = dry[i] * dry_amount + *s * wet_amount;
                        }
                    }
                }
            }
        }
    }
}
