use biquad::{Biquad, Coefficients, DirectForm1, ToHertz, Type, Q_BUTTERWORTH_F32};

/// DJ Deck 3 段 EQ（Low / Mid / High）
pub struct DeckEqualizer {
    low_l: DirectForm1<f32>,
    low_r: DirectForm1<f32>,
    mid_l: DirectForm1<f32>,
    mid_r: DirectForm1<f32>,
    high_l: DirectForm1<f32>,
    high_r: DirectForm1<f32>,
    sample_rate: f32,
}

impl DeckEqualizer {
    pub fn new(sample_rate: u32) -> Self {
        let sr = sample_rate as f32;
        let flat = Coefficients::<f32>::from_params(
            Type::PeakingEQ(0.0),
            sr.hz(),
            1000.0.hz(),
            Q_BUTTERWORTH_F32,
        ).unwrap();

        DeckEqualizer {
            low_l: DirectForm1::<f32>::new(flat),
            low_r: DirectForm1::<f32>::new(flat),
            mid_l: DirectForm1::<f32>::new(flat),
            mid_r: DirectForm1::<f32>::new(flat),
            high_l: DirectForm1::<f32>::new(flat),
            high_r: DirectForm1::<f32>::new(flat),
            sample_rate: sr,
        }
    }

    pub fn set_band(&mut self, band: &str, gain_db: f32) -> Result<(), String> {
        let gain = gain_db.clamp(-24.0, 24.0);
        let (freq, filters) = match band {
            "low" => (100.0, vec![&mut self.low_l, &mut self.low_r]),
            "mid" => (1000.0, vec![&mut self.mid_l, &mut self.mid_r]),
            "high" => (10000.0, vec![&mut self.high_l, &mut self.high_r]),
            _ => return Err(format!("unknown EQ band: {}", band)),
        };

        let coeffs = Coefficients::<f32>::from_params(
            Type::PeakingEQ(gain),
            self.sample_rate.hz(),
            freq.hz(),
            Q_BUTTERWORTH_F32,
        ).map_err(|e| format!("EQ coefficients error: {:?}", e))?;

        for f in filters {
            f.replace_coefficients(coeffs);
        }
        Ok(())
    }

    pub fn process(&mut self, data: &mut [f32]) {
        let frames = data.len() / 2;
        for i in 0..frames {
            let l = &mut data[i * 2];
            *l = self.low_l.run(*l);
            *l = self.mid_l.run(*l);
            *l = self.high_l.run(*l);

            let r = &mut data[i * 2 + 1];
            *r = self.low_r.run(*r);
            *r = self.mid_r.run(*r);
            *r = self.high_r.run(*r);
        }
    }
}

/// 全局 10 段图形均衡器
/// 频率: 31, 63, 125, 250, 500, 1k, 2k, 4k, 8k, 16k Hz
pub struct GlobalEqualizer {
    bands_l: Vec<DirectForm1<f32>>,
    bands_r: Vec<DirectForm1<f32>>,
    frequencies: Vec<f32>,
    sample_rate: f32,
}

const GLOBAL_EQ_FREQUENCIES: [f32; 10] = [
    31.0, 63.0, 125.0, 250.0, 500.0,
    1000.0, 2000.0, 4000.0, 8000.0, 16000.0,
];

impl GlobalEqualizer {
    pub fn new(sample_rate: u32) -> Self {
        let sr = sample_rate as f32;
        let flat = Coefficients::<f32>::from_params(
            Type::PeakingEQ(0.0),
            sr.hz(),
            1000.0.hz(),
            Q_BUTTERWORTH_F32,
        ).unwrap();

        let bands_l: Vec<_> = (0..10).map(|_| DirectForm1::<f32>::new(flat)).collect();
        let bands_r: Vec<_> = (0..10).map(|_| DirectForm1::<f32>::new(flat)).collect();

        GlobalEqualizer {
            bands_l,
            bands_r,
            frequencies: GLOBAL_EQ_FREQUENCIES.to_vec(),
            sample_rate: sr,
        }
    }

    pub fn set_bands(&mut self, gains_db: &[f32]) -> Result<(), String> {
        if gains_db.len() != 10 {
            return Err(format!("expected 10 bands, got {}", gains_db.len()));
        }

        for (i, &gain_db) in gains_db.iter().enumerate() {
            let gain = gain_db.clamp(-12.0, 12.0);
            let coeffs = Coefficients::<f32>::from_params(
                Type::PeakingEQ(gain),
                self.sample_rate.hz(),
                self.frequencies[i].hz(),
                Q_BUTTERWORTH_F32,
            ).map_err(|e| format!("EQ band {} error: {:?}", i, e))?;

            self.bands_l[i].replace_coefficients(coeffs);
            self.bands_r[i].replace_coefficients(coeffs);
        }
        Ok(())
    }

    pub fn process(&mut self, data: &mut [f32]) {
        let frames = data.len() / 2;
        for i in 0..frames {
            let l = &mut data[i * 2];
            for band in &mut self.bands_l {
                *l = band.run(*l);
            }

            let r = &mut data[i * 2 + 1];
            for band in &mut self.bands_r {
                *r = band.run(*r);
            }
        }
    }
}
