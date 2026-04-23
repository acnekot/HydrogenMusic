use serde::{Serialize, Deserialize};
use crate::deck::Deck;

/// 扫描到的 VST3 插件信息
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PluginInfo {
    pub id: String,
    pub name: String,
    pub vendor: String,
    pub version: String,
    pub path: String,
}

/// 插件参数
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PluginParam {
    pub id: u32,
    pub name: String,
    pub value: f64,
    pub min: f64,
    pub max: f64,
    pub default: f64,
}

pub struct Vst3Host {
    scanned_plugins: Vec<PluginInfo>,
}

impl Vst3Host {
    pub fn new() -> Self {
        Vst3Host {
            scanned_plugins: Vec::new(),
        }
    }

    /// 扫描指定目录下的 .vst3 文件
    pub fn scan(&mut self, paths: &[String]) -> Result<Vec<PluginInfo>, String> {
        let mut plugins = Vec::new();

        for base_path in paths {
            let path = std::path::Path::new(base_path);
            if !path.exists() {
                continue;
            }

            // 递归扫描 .vst3 文件/文件夹
            Self::scan_directory(path, &mut plugins);
        }

        self.scanned_plugins = plugins.clone();
        Ok(plugins)
    }

    fn scan_directory(dir: &std::path::Path, plugins: &mut Vec<PluginInfo>) {
        let entries = match std::fs::read_dir(dir) {
            Ok(e) => e,
            Err(_) => return,
        };

        for entry in entries.flatten() {
            let path = entry.path();
            let name = entry.file_name().to_string_lossy().to_string();

            if path.is_dir() {
                if name.ends_with(".vst3") {
                    // VST3 bundle 目录
                    plugins.push(PluginInfo {
                        id: format!("vst3:{}", name),
                        name: name.trim_end_matches(".vst3").to_string(),
                        vendor: String::new(),
                        version: String::new(),
                        path: path.to_string_lossy().to_string(),
                    });
                } else {
                    // 递归进子目录
                    Self::scan_directory(&path, plugins);
                }
            } else if name.ends_with(".vst3") {
                plugins.push(PluginInfo {
                    id: format!("vst3:{}", name),
                    name: name.trim_end_matches(".vst3").to_string(),
                    vendor: String::new(),
                    version: String::new(),
                    path: path.to_string_lossy().to_string(),
                });
            }
        }
    }

    /// 将插件加载到 Deck 的某个 FX 槽位
    pub fn load_to_slot(&mut self, deck: &mut Deck, slot: usize, plugin_id: &str) -> Result<(), String> {
        let plugin_info = self.scanned_plugins
            .iter()
            .find(|p| p.id == plugin_id)
            .ok_or_else(|| format!("plugin not found: {}", plugin_id))?;

        // TODO: 使用 vst3-sys 真正加载 VST3 插件
        // 当前为占位实现：
        // 1. 打开 .vst3 bundle
        // 2. 获取 IPluginFactory
        // 3. 创建 IComponent + IAudioProcessor
        // 4. 初始化 process context（sample rate, block size）
        // 5. 包装成 FxProcessor trait 对象
        // 6. 赋值到 deck.fx_chain[slot].plugin_instance

        eprintln!(
            "[VST3] Placeholder: would load '{}' from '{}' into slot {}",
            plugin_info.name, plugin_info.path, slot
        );

        // 标记槽位为活跃
        if slot < 4 {
            deck.fx_chain[slot].active = true;
        }

        Ok(())
    }

    /// 从 FX 槽位卸载插件
    pub fn unload_from_slot(&self, deck: &mut Deck, slot: usize) {
        if slot < 4 {
            deck.fx_chain[slot].active = false;
            deck.fx_chain[slot].plugin_instance = None;
            deck.fx_chain[slot].params.clear();
        }
    }

    /// 获取已加载插件的参数列表
    pub fn get_params(&self, deck: &Deck, slot: usize) -> Result<Vec<PluginParam>, String> {
        if slot >= 4 {
            return Err("invalid slot index".to_string());
        }

        // TODO: 从真正的 VST3 IEditController 获取参数
        // 当前返回空列表
        Ok(Vec::new())
    }
}
