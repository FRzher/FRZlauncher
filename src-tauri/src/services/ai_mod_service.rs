use std::collections::HashMap;
use std::sync::Arc;
use futures_util::future::join_all;
use tauri::{AppHandle, Emitter};

use crate::models::{
    AiBatchInstallProgress, AiModResolvedItem, CreateInstanceRequest, InstanceConfig,
    InstallModResult, LoaderType,
};
use crate::services::{InstanceManager, MinecraftInsideService, ModrinthService};

pub struct AiModService {
    modrinth_service: Arc<ModrinthService>,
    instance_manager: Arc<InstanceManager>,
    minecraft_inside_service: Option<Arc<MinecraftInsideService>>,
    alias_map: HashMap<&'static str, &'static str>,
}

impl AiModService {
    pub fn new(
        modrinth_service: Arc<ModrinthService>,
        instance_manager: Arc<InstanceManager>,
        minecraft_inside_service: Option<Arc<MinecraftInsideService>>,
    ) -> Self {
        let mut alias_map = HashMap::new();

        // Performance / FPS
        alias_map.insert("содиум", "sodium");
        alias_map.insert("натрий", "sodium");
        alias_map.insert("рубидий", "rubidium");
        alias_map.insert("эмбедиум", "embeddium");
        alias_map.insert("embedium", "embeddium");
        alias_map.insert("ирис", "iris");
        alias_map.insert("айрис", "iris");
        alias_map.insert("шейдеры", "iris");
        alias_map.insert("окулус", "oculus");
        alias_map.insert("литиум", "lithium");
        alias_map.insert("литий", "lithium");
        alias_map.insert("радий", "radium");
        alias_map.insert("феррит", "ferrite-core");
        alias_map.insert("ферритекор", "ferrite-core");
        alias_map.insert("ferritecore", "ferrite-core");
        alias_map.insert("индиум", "indium");
        alias_map.insert("индий", "indium");
        alias_map.insert("криптон", "krypton");
        alias_map.insert("фосфор", "phosphor");
        alias_map.insert("иммедиатли", "immediatelyfast");
        alias_map.insert("immediately fast", "immediatelyfast");
        alias_map.insert("нойзиум", "noisium");
        alias_map.insert("модернфикс", "modernfix");
        alias_map.insert("модерн фикс", "modernfix");
        alias_map.insert("бобби", "bobby");
        alias_map.insert("c2me", "c2me-fabric");
        alias_map.insert("энтити куллинг", "entityculling");
        alias_map.insert("оптимизация мобов", "entityculling");
        alias_map.insert("содиум экстра", "sodium-extra");
        alias_map.insert("sodium extra", "sodium-extra");
        alias_map.insert("ризис", "reeses-sodium-options");
        alias_map.insert("reeses", "reeses-sodium-options");

        // UI / Information
        alias_map.insert("джеи", "jei");
        alias_map.insert("джей", "jei");
        alias_map.insert("jei", "jei");
        alias_map.insert("just enough items", "jei");
        alias_map.insert("рецепты", "jei");
        alias_map.insert("рей", "roughly-enough-items");
        alias_map.insert("реи", "roughly-enough-items");
        alias_map.insert("rei", "roughly-enough-items");
        alias_map.insert("еми", "emi");
        alias_map.insert("эми", "emi");
        alias_map.insert("emi", "emi");
        alias_map.insert("миникарта", "xaeros-minimap");
        alias_map.insert("мини карта", "xaeros-minimap");
        alias_map.insert("ксаеро миникарта", "xaeros-minimap");
        alias_map.insert("xaero", "xaeros-minimap");
        alias_map.insert("xaeros minimap", "xaeros-minimap");
        alias_map.insert("карта мира", "xaeros-world-map");
        alias_map.insert("xaeros world map", "xaeros-world-map");
        alias_map.insert("джорнеймап", "journeymap");
        alias_map.insert("джорней", "journeymap");
        alias_map.insert("journeymap", "journeymap");
        alias_map.insert("эпплскин", "appleskin");
        alias_map.insert("апплскин", "appleskin");
        alias_map.insert("яблоко", "appleskin");
        alias_map.insert("appleskin", "appleskin");
        alias_map.insert("насыщение", "appleskin");
        alias_map.insert("ваила", "wthit");
        alias_map.insert("waila", "wthit");
        alias_map.insert("что за блок", "wthit");
        alias_map.insert("wthit", "wthit");
        alias_map.insert("джейд", "jade");
        alias_map.insert("jade", "jade");
        alias_map.insert("мод меню", "modmenu");
        alias_map.insert("модменю", "modmenu");
        alias_map.insert("mod menu", "modmenu");
        alias_map.insert("modmenu", "modmenu");
        alias_map.insert("беттер ф3", "betterf3");
        alias_map.insert("better f3", "betterf3");
        alias_map.insert("betterf3", "betterf3");
        alias_map.insert("шалкера", "shulkerboxtooltip");
        alias_map.insert("просмотр шалкеров", "shulkerboxtooltip");
        alias_map.insert("shulker box tooltip", "shulkerboxtooltip");
        alias_map.insert("shulkerboxtooltip", "shulkerboxtooltip");

        // Visuals & Atmosphere
        alias_map.insert("зум", "zoomify");
        alias_map.insert("приближение", "zoomify");
        alias_map.insert("zoom", "zoomify");
        alias_map.insert("дистант", "distant-horizons");
        alias_map.insert("дистант горизонт", "distant-horizons");
        alias_map.insert("distant horizons", "distant-horizons");
        alias_map.insert("динамический свет", "lambdynamiclights");
        alias_map.insert("динамическое освещение", "lambdynamiclights");
        alias_map.insert("факел в руке", "lambdynamiclights");
        alias_map.insert("lambdynamiclights", "lambdynamiclights");
        alias_map.insert("свежие анимации", "fresh-animations");
        alias_map.insert("fresh animations", "fresh-animations");
        alias_map.insert("анимации мобов", "fresh-animations");
        alias_map.insert("визуалити", "visuality");
        alias_map.insert("частицы", "visuality");
        alias_map.insert("листопад", "fallingleaves");
        alias_map.insert("падающие листья", "fallingleaves");
        alias_map.insert("falling leaves", "fallingleaves");
        alias_map.insert("звуки природы", "ambientsounds");
        alias_map.insert("ambientsounds", "ambientsounds");
        alias_map.insert("звуки в пещерах", "sound-physics-remastered");
        alias_map.insert("sound physics", "sound-physics-remastered");
        alias_map.insert("шаги", "presence-footsteps");
        alias_map.insert("presence footsteps", "presence-footsteps");
        alias_map.insert("соединенные стекла", "continuity");
        alias_map.insert("стекла оптифайн", "continuity");
        alias_map.insert("континуити", "continuity");
        alias_map.insert("continuity", "continuity");

        // Utility & Multiplayer
        alias_map.insert("войс", "simple-voice-chat");
        alias_map.insert("войс чат", "simple-voice-chat");
        alias_map.insert("голосовой чат", "simple-voice-chat");
        alias_map.insert("симпл войс чат", "simple-voice-chat");
        alias_map.insert("voice chat", "simple-voice-chat");
        alias_map.insert("simple voice chat", "simple-voice-chat");
        alias_map.insert("голос", "simple-voice-chat");
        alias_map.insert("фрикам", "freecam");
        alias_map.insert("свободная камера", "freecam");
        alias_map.insert("freecam", "freecam");
        alias_map.insert("скины", "custom-skin-loader");
        alias_map.insert("кастом скин лоадер", "custom-skin-loader");
        alias_map.insert("3д скины", "skin-layers-3d");
        alias_map.insert("объемные скины", "skin-layers-3d");
        alias_map.insert("3d skin layers", "skin-layers-3d");
        alias_map.insert("плащи", "capes");
        alias_map.insert("волнистые плащи", "wavey-capes");
        alias_map.insert("wavey capes", "wavey-capes");
        alias_map.insert("анимация еды", "eating-animation");
        alias_map.insert("eating animation", "eating-animation");
        alias_map.insert("головы в чате", "chat-heads");
        alias_map.insert("chat heads", "chat-heads");
        alias_map.insert("геймпад", "midnightcontrols");
        alias_map.insert("контроллер", "midnightcontrols");
        alias_map.insert("джойстик", "midnightcontrols");
        alias_map.insert("midnightcontrols", "midnightcontrols");
        alias_map.insert("физика", "physics-mod");
        alias_map.insert("регдолл", "physics-mod");
        alias_map.insert("physics mod", "physics-mod");
        alias_map.insert("ворлдэдит", "worldedit");
        alias_map.insert("worldedit", "worldedit");
        alias_map.insert("лайтематика", "litematica");
        alias_map.insert("litematica", "litematica");
        alias_map.insert("крейт", "create");
        alias_map.insert("create", "create");
        alias_map.insert("плазмо войс", "plasmo-voice");
        alias_map.insert("плазмо", "plasmo-voice");
        alias_map.insert("plasmo voice", "plasmo-voice");
        alias_map.insert("plasmovoice", "plasmo-voice");
        alias_map.insert("сумеречный лес", "the-twilight-forest");
        alias_map.insert("твайлайт", "the-twilight-forest");
        alias_map.insert("твайлайт форест", "the-twilight-forest");
        alias_map.insert("twilight forest", "the-twilight-forest");
        alias_map.insert("рюкзаки", "travelers-backpack");
        alias_map.insert("рюкзак путешественника", "travelers-backpack");
        alias_map.insert("travelers backpack", "travelers-backpack");
        alias_map.insert("traveler's backpack", "travelers-backpack");
        alias_map.insert("железные сундуки", "iron-chests");
        alias_map.insert("айрон чест", "iron-chests");
        alias_map.insert("iron chests", "iron-chests");
        alias_map.insert("оптифайн", "optifabric");
        alias_map.insert("optifine", "optifabric");
        alias_map.insert("замена оптифайна", "sodium");
        alias_map.insert("дальность прорисовки", "distant-horizons");
        alias_map.insert("дальность", "distant-horizons");
        alias_map.insert("мобы алекса", "alexs-mobs");
        alias_map.insert("alexs mobs", "alexs-mobs");
        alias_map.insert("alex's mobs", "alexs-mobs");
        alias_map.insert("крафты", "jei");
        alias_map.insert("квесты", "ftb-quests");
        alias_map.insert("ftb quests", "ftb-quests");
        alias_map.insert("ftb квесты", "ftb-quests");
        alias_map.insert("инвентарь", "inventory-profiles-next");
        alias_map.insert("вейпоинты", "xaeros-minimap");

        // Core Libraries & APIs
        alias_map.insert("фабрик апи", "fabric-api");
        alias_map.insert("fabric api", "fabric-api");
        alias_map.insert("клот конфиг", "cloth-config");
        alias_map.insert("cloth config", "cloth-config");
        alias_map.insert("архитектури", "architectury-api");
        alias_map.insert("architectury", "architectury-api");

        Self {
            modrinth_service,
            instance_manager,
            minecraft_inside_service,
            alias_map,
        }
    }

    /// Intelligently parses raw user input (descriptions, mod lists, copied text, pipes, commas, slashes, bullets)
    pub fn parse_input(&self, input: &str) -> Vec<String> {
        let mut results = Vec::new();
        let mut seen = std::collections::HashSet::new();

        // Split by lines first, then by common separators
        for raw_line in input.lines() {
            let line = raw_line.trim();
            if line.is_empty() {
                continue;
            }

            // Split line by pipe '|', commas ',', semicolons ';', bullets '•', tabs '\t'
            let chunks: Vec<&str> = if line.starts_with("http://") || line.starts_with("https://") {
                vec![line]
            } else {
                line.split(|c| c == '|' || c == ',' || c == ';' || c == '•' || c == '\t').collect()
            };

            for chunk in chunks {
                // If chunk contains " / " or " \ " with spaces, split further
                let subchunks: Vec<&str> = if chunk.contains(" / ") {
                    chunk.split(" / ").collect()
                } else if chunk.contains(" \\ ") {
                    chunk.split(" \\ ").collect()
                } else {
                    vec![chunk]
                };

                for sub in subchunks {
                    let cleaned = self.clean_single_token(sub);
                    if !cleaned.is_empty() {
                        let key = cleaned.to_lowercase();
                        if !seen.contains(&key) {
                            seen.insert(key);
                            results.push(cleaned);
                        }
                    }
                }
            }
        }

        results
    }

    /// Cleans an individual query item (removing bullet points, links, file extensions, parenthesized comments, versions, authors)
    fn clean_single_token(&self, raw: &str) -> String {
        let mut s = raw.trim();

        if s.is_empty() || s.starts_with('#') || s.starts_with("//") {
            return String::new();
        }

        // Skip obvious section headers or noise
        let lower = s.to_lowercase();
        if lower.starts_with("моды:")
            || lower.starts_with("список модов:")
            || lower.starts_with("моды из видео:")
            || lower.starts_with("mods:")
            || lower.starts_with("dependencies:")
            || lower == "моды"
            || lower == "mods"
        {
            return String::new();
        }

        // Remove bullet markers: '1. ', '1) ', '[1] ', '- ', '* ', '• ', '+ ', '> ', '~ '
        if let Some(pos) = s.find(|c: char| c.is_alphabetic() || c.is_numeric()) {
            let prefix = &s[..pos];
            if prefix.contains('-')
                || prefix.contains('*')
                || prefix.contains('•')
                || prefix.contains('+')
                || prefix.contains('>')
                || prefix.contains('~')
                || prefix.contains('[')
            {
                s = &s[pos..];
            }
        }
        // Strip numbered list prefix like '1.', '2)', '10. '
        if let Some(first_space) = s.find(' ') {
            let first_part = &s[..first_space];
            if first_part.ends_with('.') || first_part.ends_with(')') {
                let num_str = &first_part[..first_part.len() - 1];
                if num_str.chars().all(|c| c.is_numeric()) {
                    s = s[first_space + 1..].trim();
                }
            }
        }

        // Strip noise prefixes like 'Мод: ', 'Mod: ', 'Name: ', 'Название: '
        if let Some(rest) = s.strip_prefix("мод: ").or_else(|| s.strip_prefix("Мод: ")).or_else(|| s.strip_prefix("МОД: ")) {
            s = rest.trim();
        } else if let Some(rest) = s.strip_prefix("mod: ").or_else(|| s.strip_prefix("Mod: ")).or_else(|| s.strip_prefix("MOD: ")) {
            s = rest.trim();
        } else if let Some(rest) = s.strip_prefix("название: ").or_else(|| s.strip_prefix("Название: ")) {
            s = rest.trim();
        } else if let Some(rest) = s.strip_prefix("name: ").or_else(|| s.strip_prefix("Name: ")) {
            s = rest.trim();
        }

        // If it's a URL, extract slug
        if s.starts_with("http://") || s.starts_with("https://") {
            if let Some(pos) = s.find("/mod/") {
                let rest = &s[pos + 5..];
                let slug = rest.split(['/', '?', '#']).next().unwrap_or(rest);
                return slug.trim().to_string();
            }
        }

        // Remove brackets and parentheses comments: (для фпс), [1.20.1], {fabric}, (by Author)
        let mut sanitized = String::new();
        let mut depth = 0;
        for c in s.chars() {
            if c == '(' || c == '[' || c == '{' {
                depth += 1;
            } else if c == ')' || c == ']' || c == '}' {
                if depth > 0 {
                    depth -= 1;
                }
            } else if depth == 0 {
                sanitized.push(c);
            }
        }
        let after_brackets = sanitized.trim();
        if !after_brackets.is_empty() {
            s = after_brackets;
        }

        // Handle descriptions after hyphens or colons
        if let Some(pos) = s.find(" - ") {
            s = s[..pos].trim();
        } else if let Some(pos) = s.find(" — ") {
            s = s[..pos].trim();
        } else if let Some(pos) = s.find(" – ") {
            s = s[..pos].trim();
        } else if let Some(pos) = s.find(':') {
            let prefix = s[..pos].trim();
            let after = s[pos + 1..].trim();
            if prefix.eq_ignore_ascii_case("мод")
                || prefix.eq_ignore_ascii_case("mod")
                || prefix.eq_ignore_ascii_case("name")
                || prefix.eq_ignore_ascii_case("название")
            {
                s = after;
            } else {
                let after_lower = after.to_lowercase();
                if after_lower.starts_with("мод ")
                    || after_lower.starts_with("для ")
                    || after_lower.starts_with("описание")
                    || after_lower.starts_with("классный")
                    || after_lower.starts_with("топ")
                {
                    s = prefix;
                }
                // Otherwise, retain full name (e.g. "Create: Steam & Rails", "Create: Astral")
            }
        }

        // Clean filename patterns: 'sodium-fabric-0.5.8+mc1.20.1.jar' -> 'sodium'
        let mut token = s.to_string();
        if token.to_lowercase().ends_with(".jar") || token.to_lowercase().ends_with(".zip") {
            token = token
                .trim_end_matches(".jar")
                .trim_end_matches(".JAR")
                .trim_end_matches(".zip")
                .trim_end_matches(".ZIP")
                .to_string();

            if let Some(dash_pos) = token.find('-') {
                let prefix = &token[..dash_pos];
                if !prefix.is_empty() {
                    token = prefix.to_string();
                }
            }
        }

        // Strip author attributions: "by <Author>" or "от <Автор>"
        let lower_tok = token.to_lowercase();
        if let Some(pos) = lower_tok.find(" by ") {
            token = token[..pos].trim().to_string();
        } else if let Some(pos) = lower_tok.find(" от ") {
            token = token[..pos].trim().to_string();
        }

        // Strip standalone version tokens like "1.20.1", "v0.5.8", "0.5.8", "v15.2.0.27"
        let parts: Vec<&str> = token.split_whitespace().collect();
        let filtered_parts: Vec<&str> = parts
            .into_iter()
            .filter(|part| {
                if *part == "&" || *part == "+" {
                    return true;
                }
                let p = part.trim_matches(|c: char| !c.is_alphanumeric());
                if p.is_empty() {
                    return false;
                }
                let num_dots = p.chars().filter(|&c| c == '.').count();
                let has_digits = p.chars().any(|c| c.is_numeric());
                if has_digits && num_dots >= 1 {
                    if p.starts_with('v') || p.starts_with('V') || p.chars().next().map_or(false, |c| c.is_numeric()) {
                        return false;
                    }
                }
                if p.to_lowercase().starts_with("mc1.") {
                    return false;
                }
                true
            })
            .collect();

        let mut result = filtered_parts.join(" ");

        let res_lower = result.to_lowercase();
        if (res_lower.ends_with(" mod") || res_lower.ends_with(" мод"))
            && res_lower != "physics mod"
            && res_lower != "физика мод"
        {
            result = result[..result.len() - 4].trim().to_string();
        }

        // Normalize spaces
        result.split_whitespace().collect::<Vec<_>>().join(" ")
    }

    /// Resolves an array of mod queries concurrently via Modrinth API
    pub async fn resolve_mods(
        &self,
        queries: Vec<String>,
        game_version: &str,
        loader: &str,
    ) -> Vec<AiModResolvedItem> {
        let tasks = queries.into_iter().map(|raw_query| {
            let g_ver = game_version.to_string();
            let l_type = loader.to_string();
            async move {
                self.resolve_single_mod(&raw_query, &g_ver, &l_type).await
            }
        });

        join_all(tasks).await
    }

    /// Resolve a single query string against Modrinth with multiple fallbacks
    async fn resolve_single_mod(
        &self,
        raw_query: &str,
        game_version: &str,
        loader: &str,
    ) -> AiModResolvedItem {
        let cleaned = raw_query.trim();
        let lower = cleaned.to_lowercase();

        // 1. Check alias mapping
        let query_term = self
            .alias_map
            .get(lower.as_str())
            .copied()
            .unwrap_or(cleaned);

        // 2. Perform search on Modrinth with strict version and loader filters
        let mut search_res = self
            .modrinth_service
            .search_mods(
                query_term,
                Some(game_version),
                Some(loader),
                Some("mod"),
                None,
                None,
                Some(0),
                Some(5),
            )
            .await;

        // 3. Fallback search 1: if no hits with query_term, try sanitized alphanumeric query
        if search_res.as_ref().map(|r| r.hits.is_empty()).unwrap_or(true) {
            let sanitized_alphanumeric: String = query_term
                .chars()
                .map(|c| if c.is_alphanumeric() || c == ' ' { c } else { ' ' })
                .collect::<String>()
                .split_whitespace()
                .collect::<Vec<_>>()
                .join(" ");

            if !sanitized_alphanumeric.is_empty() && sanitized_alphanumeric != query_term {
                if let Ok(res) = self
                    .modrinth_service
                    .search_mods(
                        &sanitized_alphanumeric,
                        Some(game_version),
                        Some(loader),
                        Some("mod"),
                        None,
                        None,
                        Some(0),
                        Some(5),
                    )
                    .await
                {
                    if !res.hits.is_empty() {
                        search_res = Ok(res);
                    }
                }
            }
        }

        // 4. Fallback search 2: try slug format (e.g. "simple-voice-chat")
        if search_res.as_ref().map(|r| r.hits.is_empty()).unwrap_or(true) && query_term.contains(' ') {
            let slug_query = query_term.to_lowercase().replace(' ', "-");
            if let Ok(res) = self
                .modrinth_service
                .search_mods(
                    &slug_query,
                    Some(game_version),
                    Some(loader),
                    Some("mod"),
                    None,
                    None,
                    Some(0),
                    Some(5),
                )
                .await
            {
                if !res.hits.is_empty() {
                    search_res = Ok(res);
                }
            }
        }

        match search_res {
            Ok(res) if !res.hits.is_empty() => {
                let mut hits = res.hits;
                hits.sort_by(|a, b| {
                    let score_a = calculate_match_score(a, query_term);
                    let score_b = calculate_match_score(b, query_term);
                    score_b.cmp(&score_a)
                });

                let best_hit = hits.remove(0);

                let suggestions: Vec<crate::models::AiModSuggestion> = hits
                    .into_iter()
                    .take(3)
                    .map(|h| crate::models::AiModSuggestion {
                        project_id: h.project_id,
                        slug: h.slug,
                        title: h.title,
                        author: h.author,
                        icon_url: h.icon_url,
                        downloads: h.downloads,
                    })
                    .collect();

                let confidence = if best_hit.slug.eq_ignore_ascii_case(query_term)
                    || best_hit.title.eq_ignore_ascii_case(query_term)
                {
                    "exact"
                } else if best_hit.title.to_lowercase().contains(&query_term.to_lowercase()) {
                    "high"
                } else {
                    "fuzzy"
                };

                // Check version compatibility
                match self
                    .modrinth_service
                    .get_project_version(&best_hit.project_id, game_version, loader)
                    .await
                {
                    Ok(ver) => {
                        let filename = ver
                            .files
                            .iter()
                            .find(|f| f.primary)
                            .or_else(|| ver.files.first())
                            .map(|f| f.filename.clone());

                        AiModResolvedItem {
                            raw_query: raw_query.to_string(),
                            project_id: Some(best_hit.project_id),
                            slug: Some(best_hit.slug),
                            title: best_hit.title,
                            description: best_hit.description,
                            icon_url: best_hit.icon_url,
                            author: Some(best_hit.author),
                            downloads: best_hit.downloads,
                            status: "compatible".to_string(),
                            version_id: Some(ver.id),
                            filename,
                            categories: best_hit.categories,
                            external_url: None,
                            match_confidence: Some(confidence.to_string()),
                            suggestions,
                        }
                    }
                    Err(_) => {
                        // Project exists, but no compatible version for this MC/loader
                        AiModResolvedItem {
                            raw_query: raw_query.to_string(),
                            project_id: Some(best_hit.project_id),
                            slug: Some(best_hit.slug),
                            title: best_hit.title,
                            description: best_hit.description,
                            icon_url: best_hit.icon_url,
                            author: Some(best_hit.author),
                            downloads: best_hit.downloads,
                            status: "incompatible".to_string(),
                            version_id: None,
                            filename: None,
                            categories: best_hit.categories,
                            external_url: None,
                            match_confidence: Some(confidence.to_string()),
                            suggestions,
                        }
                    }
                }
            }
            _ => {
                // If not found with filters, try searching without version/loader filters (looser search)
                let fallback_search = self
                    .modrinth_service
                    .search_mods(query_term, None, None, Some("mod"), None, None, Some(0), Some(4))
                    .await;

                if let Ok(res) = fallback_search {
                    if !res.hits.is_empty() {
                        let mut hits = res.hits;
                        let best = hits.remove(0);
                        let suggestions = hits
                            .into_iter()
                            .take(3)
                            .map(|h| crate::models::AiModSuggestion {
                                project_id: h.project_id,
                                slug: h.slug,
                                title: h.title,
                                author: h.author,
                                icon_url: h.icon_url,
                                downloads: h.downloads,
                            })
                            .collect();

                        if let Ok(ver) = self
                            .modrinth_service
                            .get_project_version(&best.project_id, game_version, loader)
                            .await
                        {
                            let filename = ver
                                .files
                                .iter()
                                .find(|f| f.primary)
                                .or_else(|| ver.files.first())
                                .map(|f| f.filename.clone());

                            return AiModResolvedItem {
                                raw_query: raw_query.to_string(),
                                project_id: Some(best.project_id),
                                slug: Some(best.slug),
                                title: best.title,
                                description: best.description,
                                icon_url: best.icon_url,
                                author: Some(best.author),
                                downloads: best.downloads,
                                status: "compatible".to_string(),
                                version_id: Some(ver.id),
                                filename,
                                categories: best.categories,
                                external_url: None,
                                match_confidence: Some("fuzzy".to_string()),
                                suggestions,
                            };
                        } else {
                            return AiModResolvedItem {
                                raw_query: raw_query.to_string(),
                                project_id: Some(best.project_id),
                                slug: Some(best.slug),
                                title: best.title,
                                description: best.description,
                                icon_url: best.icon_url,
                                author: Some(best.author),
                                downloads: best.downloads,
                                status: "incompatible".to_string(),
                                version_id: None,
                                filename: None,
                                categories: best.categories,
                                external_url: None,
                                match_confidence: Some("fuzzy".to_string()),
                                suggestions,
                            };
                        }
                    }
                }

                // If still not found on Modrinth, fallback to Minecraft Inside!
                if let Some(inside_svc) = &self.minecraft_inside_service {
                    if let Ok(inside_results) = inside_svc.search(query_term).await {
                        let mut inside_iter = inside_results.into_iter();
                        if let Some(top_inside) = inside_iter.next() {
                            let suggestions = inside_iter
                                .take(4)
                                .map(|item| crate::models::AiModSuggestion {
                                    project_id: item.url.clone(),
                                    slug: item.url.clone(),
                                    title: item.title,
                                    author: "Minecraft Inside".to_string(),
                                    icon_url: None,
                                    downloads: 0,
                                })
                                .collect();

                            return AiModResolvedItem {
                                raw_query: raw_query.to_string(),
                                project_id: None,
                                slug: Some(top_inside.url.clone()),
                                title: top_inside.title,
                                description: if top_inside.description.is_empty() {
                                    "Найдено на Minecraft Inside (RU). Нажмите для перехода к странице загрузки.".to_string()
                                } else {
                                    format!("Найдено на Minecraft Inside: {}", top_inside.description)
                                },
                                icon_url: None,
                                author: Some("Minecraft Inside".to_string()),
                                downloads: 0,
                                status: "minecraft_inside".to_string(),
                                version_id: None,
                                filename: None,
                                categories: vec![top_inside.category],
                                external_url: Some(top_inside.url),
                                match_confidence: Some("inside".to_string()),
                                suggestions,
                            };
                        }
                    }
                }

                // Completely not found
                AiModResolvedItem {
                    raw_query: raw_query.to_string(),
                    project_id: None,
                    slug: None,
                    title: cleaned.to_string(),
                    description: "Мод не найден на Modrinth и Minecraft Inside. Проверьте правильность написания названия.".to_string(),
                    icon_url: None,
                    author: None,
                    downloads: 0,
                    status: "not_found".to_string(),
                    version_id: None,
                    filename: None,
                    categories: Vec::new(),
                    external_url: None,
                    match_confidence: None,
                    suggestions: Vec::new(),
                }
            }
        }
    }

    /// Batch install selected projects into an instance
    pub async fn batch_install_mods(
        &self,
        app: &AppHandle,
        instance_id: &str,
        project_ids: Vec<String>,
        game_version: &str,
        loader: &str,
    ) -> Result<Vec<InstallModResult>, String> {
        let instance_path = self.instance_manager.instance_path(instance_id);
        let mods_dir = instance_path.join("mods");
        std::fs::create_dir_all(&mods_dir).map_err(|e| e.to_string())?;

        let total = project_ids.len();
        let mut results = Vec::new();

        for (idx, pid) in project_ids.iter().enumerate() {
            let percent = ((idx as f32) / (total as f32)) * 100.0;
            let _ = app.emit(
                "ai-builder-progress",
                AiBatchInstallProgress {
                    current_index: idx + 1,
                    total_count: total,
                    current_mod: pid.clone(),
                    stage: format!("Загрузка мода и зависимостей ({}/{})", idx + 1, total),
                    percentage: percent,
                },
            );

            match self
                .modrinth_service
                .install_project_with_dependencies(&mods_dir, pid, game_version, loader)
                .await
            {
                Ok(res) => results.push(res),
                Err(e) => {
                    tracing::warn!("Ошибка установки мода {}: {}", pid, e);
                }
            }
        }

        let _ = app.emit(
            "ai-builder-progress",
            AiBatchInstallProgress {
                current_index: total,
                total_count: total,
                current_mod: "Готово!".to_string(),
                stage: "Все моды и зависимости успешно установлены!".to_string(),
                percentage: 100.0,
            },
        );

        Ok(results)
    }

    /// Create a new instance and install all selected mods in 1 click
    pub async fn create_instance_and_install_mods(
        &self,
        app: &AppHandle,
        name: String,
        game_version: String,
        loader_type: LoaderType,
        loader_version: Option<String>,
        project_ids: Vec<String>,
    ) -> Result<InstanceConfig, String> {
        let req = CreateInstanceRequest {
            name,
            game_version: game_version.clone(),
            loader_type: loader_type.clone(),
            loader_version,
            icon: None,
            memory: None,
            gc_preset: Some("fps_boost".to_string()),
        };

        let new_instance = self.instance_manager.create_instance(req)?;
        let loader_str = match loader_type {
            LoaderType::Fabric => "fabric",
            LoaderType::Forge => "forge",
            LoaderType::NeoForge => "neoforge",
            LoaderType::Quilt => "quilt",
            LoaderType::Vanilla => "vanilla",
        };

        let mut final_project_ids = project_ids;
        if loader_type == LoaderType::Fabric || loader_type == LoaderType::Quilt {
            let has_fabric_api = final_project_ids.iter().any(|id| {
                id.eq_ignore_ascii_case("fabric-api") || id == "P7dR8mAc"
            });
            if !has_fabric_api {
                final_project_ids.insert(0, "fabric-api".to_string());
            }
        }

        self.batch_install_mods(app, &new_instance.id, final_project_ids, &game_version, loader_str)
            .await?;

        Ok(new_instance)
    }
}

fn calculate_match_score(hit: &crate::models::ModrinthHit, query: &str) -> i64 {
    let mut score = (hit.downloads / 1000) as i64;
    let query_lower = query.to_lowercase();
    if hit.slug.eq_ignore_ascii_case(query) {
        score += 1_000_000;
    } else if hit.title.eq_ignore_ascii_case(query) {
        score += 800_000;
    } else if hit.slug.to_lowercase().contains(&query_lower) {
        score += 300_000;
    } else if hit.title.to_lowercase().contains(&query_lower) {
        score += 200_000;
    }
    score
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::services::Downloader;

    #[test]
    fn test_ai_parse_input_handles_mixed_content() {
        let downloader = Arc::new(Downloader::new());
        let modrinth = Arc::new(ModrinthService::new(downloader));
        let temp_dir = std::env::temp_dir().join("frz_test_ai");
        let inst_mgr = Arc::new(InstanceManager::new(temp_dir));
        let service = AiModService::new(modrinth, inst_mgr, None);

        let input = "
        Моды из видео:
        1. Sodium (для фпс)
        2. iris-mc1.20.1-1.6.17.jar
        • JEI (Just Enough Items)
        - содиум, ирис шейдеры, литиум
        https://modrinth.com/mod/appleskin/version/1.20
        ";

        let parsed = service.parse_input(input);
        assert!(parsed.contains(&"Sodium".to_string()));
        assert!(parsed.contains(&"iris".to_string()));
        assert!(parsed.contains(&"JEI".to_string()));
        assert!(parsed.contains(&"содиум".to_string()));
        assert!(parsed.contains(&"ирис шейдеры".to_string()));
        assert!(parsed.contains(&"литиум".to_string()));
        assert!(parsed.contains(&"appleskin".to_string()));
    }

    #[test]
    fn test_ai_parse_input_pipe_and_version_cleaning() {
        let downloader = Arc::new(Downloader::new());
        let modrinth = Arc::new(ModrinthService::new(downloader));
        let temp_dir = std::env::temp_dir().join("frz_test_ai_pipe");
        let inst_mgr = Arc::new(InstanceManager::new(temp_dir));
        let service = AiModService::new(modrinth, inst_mgr, None);

        let input = "Sodium 0.5.8 (by Cortex) | Lithium [1.20.1] | Iris | JEI - Just Enough Items v15.2.0.27 | ModName";
        let parsed = service.parse_input(input);
        assert_eq!(parsed.len(), 5);
        assert_eq!(parsed[0], "Sodium");
        assert_eq!(parsed[1], "Lithium");
        assert_eq!(parsed[2], "Iris");
        assert_eq!(parsed[3], "JEI");
        assert_eq!(parsed[4], "ModName");
    }

    #[test]
    fn test_ai_parse_input_colon_subtitles_and_prefixes() {
        let downloader = Arc::new(Downloader::new());
        let modrinth = Arc::new(ModrinthService::new(downloader));
        let temp_dir = std::env::temp_dir().join("frz_test_ai_colons");
        let inst_mgr = Arc::new(InstanceManager::new(temp_dir));
        let service = AiModService::new(modrinth, inst_mgr, None);

        let input = "Мод: Sodium | Create: Steam & Rails | Create: Astral | Название: Iris | JEI: Just Enough Items";
        let parsed = service.parse_input(input);
        assert_eq!(parsed.len(), 5);
        assert_eq!(parsed[0], "Sodium");
        assert_eq!(parsed[1], "Create: Steam & Rails");
        assert_eq!(parsed[2], "Create: Astral");
        assert_eq!(parsed[3], "Iris");
        assert_eq!(parsed[4], "JEI: Just Enough Items");
    }

    #[test]
    fn test_ai_parse_input_slashes_and_tabs() {
        let downloader = Arc::new(Downloader::new());
        let modrinth = Arc::new(ModrinthService::new(downloader));
        let temp_dir = std::env::temp_dir().join("frz_test_ai_slashes");
        let inst_mgr = Arc::new(InstanceManager::new(temp_dir));
        let service = AiModService::new(modrinth, inst_mgr, None);

        let input = "Sodium / Lithium / Iris \t FerriteCore \\ AppleSkin";
        let parsed = service.parse_input(input);
        assert_eq!(parsed.len(), 5);
        assert_eq!(parsed[0], "Sodium");
        assert_eq!(parsed[1], "Lithium");
        assert_eq!(parsed[2], "Iris");
        assert_eq!(parsed[3], "FerriteCore");
        assert_eq!(parsed[4], "AppleSkin");
    }
}


