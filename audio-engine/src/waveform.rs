//! Waveform thumbnail helpers used outside the realtime audio callback.

/// 从交错立体声数据生成 RMS 缩略图
pub fn generate_rms_thumbnail(interleaved_stereo: &[f32], target_width: usize) -> Vec<f32> {
    if interleaved_stereo.is_empty() || target_width == 0 {
        return vec![0.0; target_width];
    }

    let total_frames = interleaved_stereo.len() / 2;
    let frames_per_pixel = total_frames as f64 / target_width as f64;
    let mut result = Vec::with_capacity(target_width);

    for i in 0..target_width {
        let start = (i as f64 * frames_per_pixel) as usize;
        let end = ((i + 1) as f64 * frames_per_pixel) as usize;
        let end = end.min(total_frames);

        let mut rms = 0.0f64;
        let count = end - start;
        if count == 0 {
            result.push(0.0);
            continue;
        }

        for f in start..end {
            let idx = f * 2;
            if idx + 1 < interleaved_stereo.len() {
                let mono =
                    (interleaved_stereo[idx] as f64 + interleaved_stereo[idx + 1] as f64) * 0.5;
                rms += mono * mono;
            }
        }

        result.push((rms / count as f64).sqrt() as f32);
    }

    result
}
