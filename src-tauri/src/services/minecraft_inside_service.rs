use std::fs::{self, File};
use std::io::Write;
use std::path::{Path, PathBuf};
use std::time::Duration;
use futures_util::StreamExt;
use regex::Regex;
use reqwest::header::{HeaderMap, HeaderValue, REFERER, USER_AGENT};
use reqwest::Client;

use crate::models::{MinecraftInsideDownloadItem, MinecraftInsideSearchResult};

const USER_AGENT_STR: &str =
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

#[derive(Clone)]
pub struct MinecraftInsideService {
    client: Client,
}

impl Default for MinecraftInsideService {
    fn default() -> Self {
        Self::new()
    }
}

impl MinecraftInsideService {
    pub fn new() -> Self {
        let client = Client::builder()
            .timeout(Duration::from_secs(30))
            .build()
            .unwrap_or_else(|_| Client::new());

        Self { client }
    }

    /// Search content on minecraft-inside.ru
    pub async fn search(&self, query: &str) -> Result<Vec<MinecraftInsideSearchResult>, String> {
        let trimmed = query.trim();
        if trimmed.is_empty() {
            return Ok(Vec::new());
        }

        let search_url = format!(
            "https://minecraft-inside.ru/?do=search&subaction=search&story={}",
            urlencoding::encode(trimmed)
        );

        let mut headers = HeaderMap::new();
        headers.insert(USER_AGENT, HeaderValue::from_static(USER_AGENT_STR));

        let resp = self
            .client
            .get(&search_url)
            .headers(headers)
            .send()
            .await
            .map_err(|e| format!("Ошибка поиска на Minecraft Inside: {}", e))?;

        if !resp.status().is_success() {
            return Err(format!("Minecraft Inside ответил с ошибкой: {}", resp.status()));
        }

        let html = resp.text().await.map_err(|e| e.to_string())?;
        Ok(Self::parse_search_html(&html))
    }

    /// Pure function to parse search HTML
    pub fn parse_search_html(html: &str) -> Vec<MinecraftInsideSearchResult> {
        let h2_re = Regex::new(r#"(?is)<h2[^>]*>\s*<a[^>]+href="([^"]+)"[^>]*>(.*?)</a>\s*</h2>"#).unwrap();
        let tag_strip_re = Regex::new(r#"<[^>]+>"#).unwrap();

        let mut results = Vec::new();

        for cap in h2_re.captures_iter(html) {
            let raw_url = &cap[1];
            let raw_title = &cap[2];

            let clean_title = tag_strip_re
                .replace_all(raw_title, "")
                .trim()
                .to_string();

            let full_url = if raw_url.starts_with("http") {
                raw_url.to_string()
            } else {
                format!("https://minecraft-inside.ru{}", raw_url)
            };

            let category = if full_url.contains("/mods/") {
                "Мод".to_string()
            } else if full_url.contains("/resource-packs/") {
                "Ресурспак".to_string()
            } else if full_url.contains("/datapacks/") {
                "Датапак".to_string()
            } else if full_url.contains("/shaders/") {
                "Шейдеры".to_string()
            } else if full_url.contains("/maps/") {
                "Карта".to_string()
            } else {
                "Материал".to_string()
            };

            results.push(MinecraftInsideSearchResult {
                title: clean_title,
                url: full_url,
                category,
                description: String::new(),
            });
        }

        results
    }

    /// Extract downloadable files from a Minecraft Inside article URL
    pub async fn get_page_downloads(
        &self,
        page_url: &str,
    ) -> Result<Vec<MinecraftInsideDownloadItem>, String> {
        let mut headers = HeaderMap::new();
        headers.insert(USER_AGENT, HeaderValue::from_static(USER_AGENT_STR));

        let resp = self
            .client
            .get(page_url)
            .headers(headers)
            .send()
            .await
            .map_err(|e| format!("Не удалось загрузить страницу: {}", e))?;

        if !resp.status().is_success() {
            return Err(format!("Страница недоступна: {}", resp.status()));
        }

        let html = resp.text().await.map_err(|e| e.to_string())?;
        Ok(Self::parse_page_downloads_html(&html))
    }

    /// Pure function to parse download items from article HTML
    pub fn parse_page_downloads_html(html: &str) -> Vec<MinecraftInsideDownloadItem> {
        let tag_strip_re = Regex::new(r#"<[^>]+>"#).unwrap();
        let row_re = Regex::new(r#"(?s)<tr class="dl__row">(.*?)</tr>"#).unwrap();
        let link_re = Regex::new(r#"href="(https?://(?:www\.)?minecraft-inside\.ru/download/\d+/?)""#).unwrap();
        let name_re = Regex::new(r#"(?s)<span class="dl__name">(.*?)</span>"#).unwrap();
        let size_re = Regex::new(r#"(?s)<td class="dl__size">(.*?)</td>"#).unwrap();
        let date_re = Regex::new(r#"(?s)<td class="dl__date">(.*?)</td>"#).unwrap();

        let mut items = Vec::new();

        for row_cap in row_re.captures_iter(html) {
            let row_html = &row_cap[1];

            if let Some(link_cap) = link_re.captures(row_html) {
                let download_url = link_cap[1].to_string();

                let name = if let Some(nc) = name_re.captures(row_html) {
                    tag_strip_re.replace_all(&nc[1], " ").trim().replace("  ", " ")
                } else {
                    "Файл".to_string()
                };

                let size = if let Some(sc) = size_re.captures(row_html) {
                    tag_strip_re.replace_all(&sc[1], "").trim().to_string()
                } else {
                    "".to_string()
                };

                let date = if let Some(dc) = date_re.captures(row_html) {
                    tag_strip_re.replace_all(&dc[1], "").trim().to_string()
                } else {
                    "".to_string()
                };

                // Prevent duplicates if table has multiple download links to same file
                if !items.iter().any(|i: &MinecraftInsideDownloadItem| i.url == download_url) {
                    items.push(MinecraftInsideDownloadItem {
                        name,
                        url: download_url,
                        size,
                        date,
                    });
                }
            }
        }

        items
    }

    /// Download a file directly into target instance directory with proper Referer header
    pub async fn download_file(
        &self,
        download_url: &str,
        page_url: &str,
        target_dir: &Path,
    ) -> Result<String, String> {
        fs::create_dir_all(target_dir).map_err(|e| e.to_string())?;

        let mut headers = HeaderMap::new();
        headers.insert(USER_AGENT, HeaderValue::from_static(USER_AGENT_STR));
        if let Ok(ref_val) = HeaderValue::from_str(page_url) {
            headers.insert(REFERER, ref_val);
        }

        let resp = self
            .client
            .get(download_url)
            .headers(headers)
            .send()
            .await
            .map_err(|e| format!("Ошибка загрузки файла: {}", e))?;

        if !resp.status().is_success() {
            return Err(format!("Сервер вернул статус {}", resp.status()));
        }

        // Determine filename from final URL or Content-Disposition
        let final_url = resp.url().clone();
        let mut filename = String::new();

        if let Some(cd) = resp.headers().get("content-disposition") {
            if let Ok(cd_str) = cd.to_str() {
                if let Some(name_idx) = cd_str.find("filename=") {
                    let raw_name = &cd_str[name_idx + 9..];
                    filename = raw_name.trim_matches('"').trim_matches('\'').to_string();
                }
            }
        }

        if filename.is_empty() {
            if let Some(segment) = final_url.path_segments().and_then(|mut s| s.next_back()) {
                if !segment.is_empty() && segment.contains('.') {
                    filename = segment.to_string();
                }
            }
        }

        if filename.is_empty() {
            filename = format!("minecraft_inside_{}.jar", chrono::Utc::now().timestamp());
        }

        // Write streaming content to destination file
        let dest_path: PathBuf = target_dir.join(&filename);
        let mut file = File::create(&dest_path).map_err(|e| format!("Не удалось создать файл: {}", e))?;

        let mut stream = resp.bytes_stream();
        while let Some(chunk_res) = stream.next().await {
            let chunk = chunk_res.map_err(|e| format!("Ошибка потока загрузки: {}", e))?;
            file.write_all(&chunk)
                .map_err(|e| format!("Ошибка записи файла: {}", e))?;
        }

        file.flush().map_err(|e| e.to_string())?;

        Ok(filename)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_parse_search_html() {
        let sample_html = r#"
            <div class="news">
                <h2><a href="/mods/196280-howling-werewolf.html">Howling Werewolf [1.21.1]</a></h2>
            </div>
            <div class="news">
                <h2><a href="https://minecraft-inside.ru/resource-packs/1000-pack.html">Cool Pack [1.20]</a></h2>
            </div>
        "#;

        let results = MinecraftInsideService::parse_search_html(sample_html);
        assert_eq!(results.len(), 2);
        assert_eq!(results[0].title, "Howling Werewolf [1.21.1]");
        assert_eq!(results[0].url, "https://minecraft-inside.ru/mods/196280-howling-werewolf.html");
        assert_eq!(results[0].category, "Мод");

        assert_eq!(results[1].title, "Cool Pack [1.20]");
        assert_eq!(results[1].category, "Ресурспак");
    }

    #[test]
    fn test_parse_page_downloads_html() {
        let sample_page = r#"
            <tr class="dl__row">
                <td class="dl__icon"><a href="https://minecraft-inside.ru/download/532936/">&nbsp;</a></td>
                <td class="dl__info"><a href="https://minecraft-inside.ru/download/532936/"><span class="dl__name">Для 1.21.1 <span class="dl__loader neoforge">neoforge</span></span></a></td>
                <td class="dl__size">697,98 КБ</td>
                <td class="dl__date">22 сентября 2026</td>
            </tr>
        "#;

        let downloads = MinecraftInsideService::parse_page_downloads_html(sample_page);
        assert_eq!(downloads.len(), 1);
        assert_eq!(downloads[0].url, "https://minecraft-inside.ru/download/532936/");
        assert_eq!(downloads[0].name, "Для 1.21.1 neoforge");
        assert_eq!(downloads[0].size, "697,98 КБ");
        assert_eq!(downloads[0].date, "22 сентября 2026");
    }
}

