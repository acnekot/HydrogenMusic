/// BPM 检测结果
pub struct BpmResult {
    pub bpm: f64,
    pub confidence: f64,
}

/// 基于自相关的 BPM 检测算法
///
/// 1. 混合为单声道
/// 2. 低通滤波（仅保留节奏能量）
/// 3. 包络跟随（RMS 窗口）
/// 4. 自相关，在 60-200 BPM 范围搜索峰值
pub fn detect_bpm(interleaved_stereo: &[f32], sample_rate: u32) -> BpmResult {
    let sr = sample_rate as f64;
    let total_frames = interleaved_stereo.len() / 2;

    // 混合为单声道
    let mut mono: Vec<f32> = Vec::with_capacity(total_frames);
    for i in 0..total_frames {
        let l = interleaved_stereo[i * 2];
        let r = interleaved_stereo[i * 2 + 1];
        mono.push((l + r) * 0.5);
    }

    // 降采样到 ~11025 Hz（加速计算）
    let downsample_factor = (sample_rate / 11025).max(1) as usize;
    let downsampled: Vec<f32> = mono.iter().step_by(downsample_factor).copied().collect();
    let ds_sr = sr / downsample_factor as f64;

    // RMS 包络（~10ms 窗口）
    let window_size = (ds_sr * 0.01) as usize;
    let window_size = window_size.max(1);
    let envelope_len = downsampled.len() / window_size;
    let mut envelope: Vec<f64> = Vec::with_capacity(envelope_len);

    for i in 0..envelope_len {
        let start = i * window_size;
        let end = (start + window_size).min(downsampled.len());
        let rms: f64 = downsampled[start..end]
            .iter()
            .map(|&s| (s as f64) * (s as f64))
            .sum::<f64>()
            / (end - start) as f64;
        envelope.push(rms.sqrt());
    }

    if envelope.len() < 2 {
        return BpmResult { bpm: 120.0, confidence: 0.0 };
    }

    // 归一化包络
    let max_env = envelope.iter().cloned().fold(0.0f64, f64::max);
    if max_env > 0.0 {
        for v in &mut envelope {
            *v /= max_env;
        }
    }

    let envelope_sr = ds_sr / window_size as f64;

    // 自相关搜索 BPM 范围 60-200
    let min_bpm = 60.0;
    let max_bpm = 200.0;
    let min_lag = (envelope_sr * 60.0 / max_bpm) as usize;
    let max_lag = (envelope_sr * 60.0 / min_bpm) as usize;
    let max_lag = max_lag.min(envelope.len() / 2);

    if min_lag >= max_lag {
        return BpmResult { bpm: 120.0, confidence: 0.0 };
    }

    let n = envelope.len();
    let mut best_lag = min_lag;
    let mut best_corr = f64::NEG_INFINITY;
    let mut total_corr = 0.0;
    let mut count = 0;

    for lag in min_lag..=max_lag {
        let mut corr = 0.0;
        let frames = n - lag;
        for i in 0..frames {
            corr += envelope[i] * envelope[i + lag];
        }
        corr /= frames as f64;

        total_corr += corr;
        count += 1;

        if corr > best_corr {
            best_corr = corr;
            best_lag = lag;
        }
    }

    let bpm = envelope_sr * 60.0 / best_lag as f64;
    let avg_corr = if count > 0 { total_corr / count as f64 } else { 0.0 };
    let confidence = if avg_corr > 0.0 {
        ((best_corr / avg_corr) - 1.0).clamp(0.0, 1.0)
    } else {
        0.0
    };

    BpmResult {
        bpm: (bpm * 10.0).round() / 10.0, // 保留一位小数
        confidence,
    }
}
