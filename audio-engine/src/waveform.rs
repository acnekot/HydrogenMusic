/// 波形数据生成
///
/// 波形可视化由 deck.rs 中的 `get_waveform()` 方法直接实现。
/// 本模块保留用于未来扩展（如频率分离着色的波形）。

/// 从交错立体声数据生成 RMS 缩略图
pub fn generate_rms_thumbnail(
    interleaved_stereo: &[f32],
    target_width: usize,
) -> Vec<f32> {
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
                let mono = (interleaved_stereo[idx] as f64 + interleaved_stereo[idx + 1] as f64) * 0.5;
                rms += mono * mono;
            }
        }

        result.push((rms / count as f64).sqrt() as f32);
    }

    result
}

/// 生成频率分段波形（低/中/高三色）
/// 返回三个通道的 RMS 值，供前端分色渲染
pub fn generate_frequency_bands_thumbnail(
    _interleaved_stereo: &[f32],
    _sample_rate: u32,
    _target_width: usize,
) -> (Vec<f32>, Vec<f32>, Vec<f32>) {
    // TODO: 通过 FFT 分频后分别计算 RMS
    // 低频: 0-200Hz, 中频: 200-4000Hz, 高频: 4000Hz+
    unimplemented!("frequency band waveform not yet implemented")
}
