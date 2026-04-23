/// Crossfader 曲线类型
#[derive(Clone, Copy)]
pub enum CrossfaderCurve {
    /// 线性：左右音量线性互补
    Linear,
    /// 等功率：恒定能量（-3dB 交叉点）
    EqualPower,
    /// Scratch：快速切换，两端硬切
    Scratch,
}

pub struct Crossfader {
    position: f32, // 0.0 = full A, 0.5 = center, 1.0 = full B
    curve: CrossfaderCurve,
}

impl Crossfader {
    pub fn new() -> Self {
        Crossfader {
            position: 0.5,
            curve: CrossfaderCurve::EqualPower,
        }
    }

    pub fn set_position(&mut self, value: f32) {
        self.position = value.clamp(0.0, 1.0);
    }

    pub fn set_curve(&mut self, curve: CrossfaderCurve) {
        self.curve = curve;
    }

    /// 返回 (gain_a, gain_b)
    pub fn get_gains(&self) -> (f32, f32) {
        let p = self.position;
        match self.curve {
            CrossfaderCurve::Linear => {
                (1.0 - p, p)
            }
            CrossfaderCurve::EqualPower => {
                let angle = p * std::f32::consts::FRAC_PI_2;
                (angle.cos(), angle.sin())
            }
            CrossfaderCurve::Scratch => {
                // 快速切换曲线：中间 5% 范围内线性过渡，两侧硬切
                let threshold = 0.05;
                let gain_a = if p < 0.5 - threshold {
                    1.0
                } else if p > 0.5 + threshold {
                    0.0
                } else {
                    1.0 - (p - (0.5 - threshold)) / (2.0 * threshold)
                };
                let gain_b = if p > 0.5 + threshold {
                    1.0
                } else if p < 0.5 - threshold {
                    0.0
                } else {
                    (p - (0.5 - threshold)) / (2.0 * threshold)
                };
                (gain_a, gain_b)
            }
        }
    }
}
