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

    /// Find a plugin by id (clones info)
    pub fn find_plugin(&self, plugin_id: &str) -> Result<PluginInfo, String> {
        self.scanned_plugins
            .iter()
            .find(|p| p.id == plugin_id)
            .cloned()
            .ok_or_else(|| format!("plugin not found: {}", plugin_id))
    }

    /// 将插件加载到 Deck 的某个 FX 槽位
    pub fn load_to_deck_slot(&mut self, plugin_info: &PluginInfo, deck: &mut Deck, slot: usize) -> Result<(), String> {
        // TODO: 使用 vst3 crate 真正加载 VST3 插件
        eprintln!(
            "[VST3] Placeholder: would load '{}' from '{}' into slot {}",
            plugin_info.name, plugin_info.path, slot
        );

        if slot < 4 {
            deck.fx_chain[slot].active = true;
        }

        Ok(())
    }

    /// 从 FX 槽位卸载插件
    pub fn unload_slot(deck: &mut Deck, slot: usize) {
        if slot < 4 {
            deck.fx_chain[slot].active = false;
            deck.fx_chain[slot].plugin_instance = None;
            deck.fx_chain[slot].params.clear();
        }
    }
}
