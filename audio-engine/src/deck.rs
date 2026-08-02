use crate::bpm::{self, BpmResult};
use crate::eq::DeckEqualizer;
use symphonia::core::audio::SampleBuffer;
use symphonia::core::codecs::DecoderOptions;
use symphonia::core::formats::FormatOptions;
use symphonia::core::io::MediaSourceStream;
use symphonia::core::meta::MetadataOptions;
use symphonia::core::probe::Hint;

const MAX_CUES: usize = 4;

pub struct DeckPosition {
    pub position_samples: usize,
    pub duration_samples: usize,
    pub bpm: Option<f64>,
    pub playing: bool,
}

pub struct DecodedTrack {
    samples: Vec<f32>,
}

pub struct Deck {
    /// Interleaved stereo PCM at the output device sample rate.
    audio_data: Vec<f32>,
    /// Playback head in sample frames. A fractional value is required for BPM sync.
    position: f64,
    playing: bool,
    pub gain: f32,
    pub bpm: Option<f64>,
    playback_rate: f64,
    cues: [Option<usize>; MAX_CUES],
    loop_start: Option<usize>,
    loop_end: Option<usize>,
    eq: DeckEqualizer,
    sample_rate: u32,
}

impl Deck {
    pub fn new(sample_rate: u32) -> Self {
        Self {
            audio_data: Vec::new(),
            position: 0.0,
            playing: false,
            gain: 1.0,
            bpm: None,
            playback_rate: 1.0,
            cues: [None; MAX_CUES],
            loop_start: None,
            loop_end: None,
            eq: DeckEqualizer::new(sample_rate),
            sample_rate,
        }
    }

    /// Decode and resample outside the realtime engine lock.
    pub fn decode(path: &str, output_sample_rate: u32) -> Result<DecodedTrack, String> {
        let file = std::fs::File::open(path).map_err(|e| format!("cannot open file: {e}"))?;
        let mss = MediaSourceStream::new(Box::new(file), Default::default());
        let mut hint = Hint::new();
        if let Some(ext) = std::path::Path::new(path)
            .extension()
            .and_then(|e| e.to_str())
        {
            hint.with_extension(ext);
        }

        let probed = symphonia::default::get_probe()
            .format(
                &hint,
                mss,
                &FormatOptions::default(),
                &MetadataOptions::default(),
            )
            .map_err(|e| format!("probe failed: {e}"))?;
        let mut format = probed.format;
        let track = format.default_track().ok_or("no audio track found")?;
        let track_id = track.id;
        let mut decoder = symphonia::default::get_codecs()
            .make(&track.codec_params, &DecoderOptions::default())
            .map_err(|e| format!("codec init failed: {e}"))?;

        let mut samples = Vec::new();
        let mut source_sample_rate = track.codec_params.sample_rate;
        loop {
            let packet = match format.next_packet() {
                Ok(packet) => packet,
                Err(symphonia::core::errors::Error::IoError(ref error))
                    if error.kind() == std::io::ErrorKind::UnexpectedEof =>
                {
                    break;
                }
                Err(_) => break,
            };
            if packet.track_id() != track_id {
                continue;
            }

            let decoded = match decoder.decode(&packet) {
                Ok(decoded) => decoded,
                Err(symphonia::core::errors::Error::DecodeError(_)) => continue,
                Err(error) => return Err(format!("decode failed: {error}")),
            };
            let spec = *decoded.spec();
            source_sample_rate.get_or_insert(spec.rate);
            let mut sample_buffer = SampleBuffer::<f32>::new(decoded.frames() as u64, spec);
            sample_buffer.copy_interleaved_ref(decoded);
            append_as_stereo(sample_buffer.samples(), spec.channels.count(), &mut samples);
        }

        if samples.is_empty() {
            return Err("decoded track contains no audio samples".to_string());
        }
        let source_sample_rate = source_sample_rate.ok_or("audio sample rate is unavailable")?;
        Ok(DecodedTrack {
            samples: resample_stereo(&samples, source_sample_rate, output_sample_rate),
        })
    }

    pub fn replace_audio(&mut self, track: DecodedTrack) {
        self.stop();
        self.audio_data = track.samples;
        self.position = 0.0;
        self.bpm = None;
        self.playback_rate = 1.0;
        self.cues = [None; MAX_CUES];
        self.loop_start = None;
        self.loop_end = None;
    }

    pub fn analysis_snapshot(&self) -> Result<(Vec<f32>, u32), String> {
        if self.audio_data.is_empty() {
            return Err("no audio loaded".to_string());
        }
        Ok((self.audio_data.clone(), self.sample_rate))
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
        self.position = 0.0;
    }

    pub fn seek(&mut self, position_samples: usize) {
        let total_frames = self.audio_data.len() / 2;
        self.position = position_samples.min(total_frames) as f64;
    }

    pub fn get_position(&self) -> DeckPosition {
        DeckPosition {
            position_samples: (self.position.floor() as usize).min(self.audio_data.len() / 2),
            duration_samples: self.audio_data.len() / 2,
            bpm: self.bpm,
            playing: self.playing,
        }
    }

    pub fn set_cue(&mut self, index: usize, position: usize) {
        if index < MAX_CUES {
            self.cues[index] = Some(position.min(self.audio_data.len() / 2));
        }
    }

    pub fn jump_to_cue(&mut self, index: usize) {
        if let Some(Some(position)) = self.cues.get(index) {
            self.seek(*position);
        }
    }

    pub fn set_loop(&mut self, start: Option<usize>, end: Option<usize>) {
        let duration = self.audio_data.len() / 2;
        match (start, end) {
            (Some(start), Some(end)) if start < end && end <= duration => {
                self.loop_start = Some(start);
                self.loop_end = Some(end);
            }
            _ => {
                self.loop_start = None;
                self.loop_end = None;
            }
        }
    }

    pub fn set_eq(&mut self, band: &str, gain_db: f32) -> Result<(), String> {
        self.eq.set_band(band, gain_db)
    }

    pub fn set_playback_rate(&mut self, rate: f64) {
        self.playback_rate = rate.clamp(0.25, 4.0);
    }

    pub fn fill_buffer(&mut self, data: &mut [f32]) {
        data.fill(0.0);
        if !self.playing || self.audio_data.is_empty() {
            return;
        }

        let total_frames = self.audio_data.len() / 2;
        for frame in data.chunks_exact_mut(2) {
            if let (Some(loop_start), Some(loop_end)) = (self.loop_start, self.loop_end) {
                if self.position >= loop_end as f64 {
                    self.position = loop_start as f64;
                }
            }
            if self.position >= total_frames as f64 {
                self.playing = false;
                break;
            }

            let frame_a = self.position.floor() as usize;
            let frame_b = (frame_a + 1).min(total_frames - 1);
            let fraction = (self.position - frame_a as f64) as f32;
            for (channel, output_sample) in frame.iter_mut().enumerate() {
                let sample_a = self.audio_data[frame_a * 2 + channel];
                let sample_b = self.audio_data[frame_b * 2 + channel];
                *output_sample = sample_a + (sample_b - sample_a) * fraction;
            }
            self.position += self.playback_rate;
        }

        self.eq.process(data);
    }
}

fn append_as_stereo(input: &[f32], channels: usize, output: &mut Vec<f32>) {
    match channels {
        0 => {}
        1 => {
            for &sample in input {
                output.extend_from_slice(&[sample, sample]);
            }
        }
        _ => {
            for frame in input.chunks_exact(channels) {
                output.extend_from_slice(&frame[..2]);
            }
        }
    }
}

fn resample_stereo(input: &[f32], source_rate: u32, target_rate: u32) -> Vec<f32> {
    if source_rate == target_rate || input.len() < 4 {
        return input.to_vec();
    }
    let input_frames = input.len() / 2;
    let output_frames =
        ((input_frames as u64 * target_rate as u64) / source_rate as u64).max(1) as usize;
    let mut output = Vec::with_capacity(output_frames * 2);

    for output_frame in 0..output_frames {
        let source_position = output_frame as f64 * source_rate as f64 / target_rate as f64;
        let frame_a = (source_position.floor() as usize).min(input_frames - 1);
        let frame_b = (frame_a + 1).min(input_frames - 1);
        let fraction = (source_position - frame_a as f64) as f32;
        for channel in 0..2 {
            let sample_a = input[frame_a * 2 + channel];
            let sample_b = input[frame_b * 2 + channel];
            output.push(sample_a + (sample_b - sample_a) * fraction);
        }
    }
    output
}

pub fn analyze_snapshot(samples: &[f32], sample_rate: u32) -> BpmResult {
    bpm::detect_bpm(samples, sample_rate)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn stereo_resampling_preserves_duration() {
        let input = vec![0.0, 0.0, 1.0, 1.0, 0.0, 0.0, -1.0, -1.0];
        let output = resample_stereo(&input, 2, 4);
        assert_eq!(output.len(), input.len() * 2);
    }

    #[test]
    fn fractional_playback_rate_advances_smoothly() {
        let mut deck = Deck::new(44_100);
        deck.audio_data = vec![0.0, 0.0, 1.0, 1.0, 2.0, 2.0, 3.0, 3.0];
        deck.play();
        deck.set_playback_rate(0.5);
        let mut output = [0.0; 4];
        deck.fill_buffer(&mut output);
        assert_eq!(output, [0.0, 0.0, 0.5, 0.5]);
        assert_eq!(deck.get_position().position_samples, 1);
    }

    #[test]
    fn multichannel_audio_uses_first_stereo_pair() {
        let mut output = Vec::new();
        append_as_stereo(&[1.0, 2.0, 99.0, 3.0, 4.0, 99.0], 3, &mut output);
        assert_eq!(output, vec![1.0, 2.0, 3.0, 4.0]);
    }
}
