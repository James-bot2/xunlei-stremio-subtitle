const express = require("express");

const app = express();
const PORT = process.env.PORT || 7000;

const API_BASE = "https://api-shoulei-ssl.xunlei.com";
const CINEMETA = "https://v3-cinemeta.strem.io/meta";

function text(v) {
  return String(v || "").trim();
}

function getLangTag(langStr) {
  if (!langStr) return "【其他】";
  const t = String(langStr).toLowerCase();
  if (t.includes("简") || t.includes("chs") || t.includes("zho") || t.includes("chi")) return "【简中】";
  if (t.includes("繁") || t.includes("cht")) return "【繁中】";
  if (t.includes("双语") || t.includes("中英")) return "【双语】";
  if (t.includes("英") || t.includes("eng")) return "【英文】";
  return "【字幕】";
}

function getExt(name) {
  const s = text(name).toLowerCase();
  if (s.endsWith(".srt")) return ".srt";
  if (s.endsWith(".ass")) return ".ass";
  if (s.endsWith(".ssa")) return ".ssa";
  return "";
}

function parseDurationValue(value) {
  if (value == null) return 0;
  if (typeof value === "number" && Number.isFinite(value)) return value;
  const t = text(value);
  if (!t) return 0;
  if (/^\d+(?:\.\d+)?$/.test(t)) return Number(t);

  const hms = t.match(/(?:(\d+):)?(\d{1,2}):(\d{2})/);
  if (hms) {
    return Number(hms[1] || 0) * 3600 +
           Number(hms[2] || 0) * 60 +
           Number(hms[3] || 0);
  }

  const zh = t.match(/(\d+)\s*小时(?:\s*(\d+)\s*分(?:钟)?)?(?:\s*(\d+)\s*秒)?/);
  if (zh) {
    return Number(zh[1] || 0) * 3600 +
           Number(zh[2] || 0) * 60 +
           Number(zh[3] || 0);
  }
  return 0;
}

function formatDuration(seconds) {
  const n = Number(seconds) || 0;
  if (n <= 0) return "";
  const total = Math.floor(n);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return h > 0
    ? `${h}:${String(m).padStart(2,"0")}:${String(s).padStart(2,"0")}`
    : `${m}:${String(s).padStart(2,"0")}`;
}

function formatFileSize(bytes) {
  const n = Number(bytes) || 0;
  if (n <= 0) return "";
  if (n >= 1024**3) return (n / 1024**3).toFixed(1) + "G";
  if (n >= 1024**2) return (n / 1024**2).toFixed(1) + "M";
  if (n >= 1024) return (n / 1024).toFixed(1) + "K";
  return `${n}B`;
}

function firstNumber(...values) {
  for (const v of values) {
    const n = Number(v);
    if (Number.isFinite(n) && n > 0) return n;
  }
  return 0;
}

function extractSearchCode(input) {
  const s = text(input).toUpperCase();
  if (!s) return "";

  const normalized = s
    .replace(/\./g, " ")
    .replace(/_/g, "-")
    .replace(/\s+/g, " ")
    .trim();

  const patterns = [
    /\bFC2(?:[- ]?PPV)?[- ]?\d{5,8}\b/,
    /\bCARIB[- ]?\d{6,8}\b/,
    /\b1PONDO[- ]?\d{6,8}\b/,
    /\bHEYZO[- ]?\d{3,6}\b/,
    /\bT28[- ]?\d{6,8}\b/,
    /\b(?:S2M|MIAA|SSNI|SNIS|IPX|IPZZ|SSIS|JUQ|MIDE|MIDV|STARS|ABW|RKI|DVAJ|WANZ|LULU|DLDSS|VRTM|SDMU|SDDE|MKMP|HMN|MUDR|ADN|CAWD|PPPE|PRED|MGR|SHKD|MXGS|FSDSS|JUL|KTB|MIAB|GVH|MIMK|JUY|JUTA|IDBD|HND|DASD|CLO|BF|HONB|ROE|CEMD|MIUM|NITR|RCTD|RCT|IPVR|MIBD|JUR|JURD|SOE|ORE|PYO)\s*[-_ ]?\d{2,6}[A-Z]?(?:[-_ ]?[A-Z]{0,4})?\b/,
    /\b[A-Z]{2,10}\s*[-_ ]?\d{2,8}[A-Z]?\b/,
    /\b\d{6,8}\b/
  ];

  const candidates = [normalized];
  const titleLike = normalized
    .replace(/\b(UNCENSORED|LEAK|OTHER|COMPLETE|FULL|HDR|WEB|BLURAY|BDRIP|WEBDL|REMUX|X264|X265|10BIT|8BIT|HEVC|AVC)\b/gi, " ")
    .replace(/\b(?:CD\d+|PART\d+|DISC\d+|EP\s*\d+|E\s*\d+|S\d{1,2}E\d{1,2}|\d{1,2}x\d{1,2}|SEASON\s*\d+)\b/gi, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (titleLike && titleLike !== normalized) candidates.push(titleLike);

  for (const source of candidates) {
    for (const reg of patterns) {
      const m = source.match(reg);
      if (m?.[0]) {
        return m[0]
          .replace(/\s+/g, "")
          .replace(/_/g, "-")
          .replace(/-+/g, "-")
          .toUpperCase();
      }
    }
  }
  return "";
}

function normalizeResult(item) {
  const duration = firstNumber(
    parseDurationValue(item?.Duration), parseDurationValue(item?.duration),
    parseDurationValue(item?.TimeLength), parseDurationValue(item?.time_length),
    parseDurationValue(item?.Length), parseDurationValue(item?.length),
    parseDurationValue(item?.VideoDuration), parseDurationValue(item?.video_duration),
    parseDurationValue(item?.Dur), parseDurationValue(item?.dur),
    parseDurationValue(item?.Runtime), parseDurationValue(item?.runtime),
    parseDurationValue(item?.PlayTime), parseDurationValue(item?.play_time)
  );

  const file_size = firstNumber(
    item?.FileSize, item?.file_size, item?.Size, item?.size,
    item?.FileSizeBytes, item?.fileSize, item?.filesize,
    item?.SubSize, item?.sub_size, item?.Subsize, item?.subsize,
    item?.LengthBytes, item?.length_bytes, item?.Bytes, item?.bytes
  );

  return {
    id: item?.Url || item?.url || item?.Id || item?.id || item?.Name || item?.name || Math.random().toString(36).slice(2),
    name: text(item?.Name || item?.name || item?.Title || item?.title || item?.FileName || item?.filename || "迅雷字幕"),
    langs: text(item?.Langs || item?.langs || item?.Languages?.join?.(",") || item?.Languages || item?.lang || item?.language || ""),
    ext: text(item?.Ext || item?.ext || item?.Format || item?.format || getExt(item?.Name || item?.name) || ".srt"),
    url: text(item?.Url || item?.url),
    down_count: Number(item?.DownCount || item?.down_count || item?.Download || item?.download || item?.Downloads || item?.downloads || 0),
    cid_match: Boolean(item?.CidMatch ?? item?.cid_match),
    duration,
    file_size,
    score: Number(item?.Score || item?.score || 0),
    fingerprintScore: Number(item?.FingerprintfScore || item?.fingerprintfScore || item?.FingerprintScore || item?.fingerprintScore || 0)
  };
}

function scoreItem(item, title, season, episode, mediaType, avCode) {
  const t = text(title).toLowerCase();
  const textValue = `${item.name} ${item.langs} ${item.ext}`.toLowerCase();
  const titleLoose = t.replace(/[-_\s.]/g, "");
  const textLoose = textValue.replace(/[-_\s.]/g, "");
  const code = avCode || extractSearchCode(title);
  const codeLoose = code.replace(/[-_ ]/g, "");

  let score = (item.cid_match ? 100000 : 0) + item.down_count / 10000;
  if (code && (textValue.includes(code.toLowerCase()) || textLoose.includes(codeLoose))) score += 25000;
  score += Math.max(0, item.score);
  score += Math.max(0, item.fingerprintScore);
  if (item.duration > 0) score += 50;
  if (item.file_size > 0) score += Math.min(item.file_size / 1024 / 1024, 20);

  if (mediaType === "series") {
    const s = season ? String(season).padStart(2, "0") : "";
    const e = episode ? String(episode).padStart(2, "0") : "";
    if (s && e && textValue.includes(`s${s}e${e}`)) score += 10000;
    else if (s && e && textValue.includes(`${s}x${e}`)) score += 9000;
    else if (s && textValue.includes(`s${s}`)) score += 5000;
    else if (t && (textValue.includes(t) || textLoose.includes(titleLoose))) score += 1000;
  } else if (t && (textValue.includes(t) || textLoose.includes(titleLoose))) {
    score += 1000;
  }

  if (code && mediaType === "movie") score += 500;
  if (textValue.includes("sub") || textValue.includes("subtitle") || textValue.includes("字幕")) score += 300;
  return score;
}

async function searchSub(key) {
  const url = `${API_BASE}/oracle/subtitle?name=${encodeURIComponent(key)}`;
  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent": "Stremio-Xunlei-Subtitle/1.0",
        "Accept": "*/*"
      }
    });
    const data = await res.json();
    if (!data || Number(data.code) !== 0 || !Array.isArray(data.data)) return [];
    return data.data;
  } catch (e) {
    console.warn("Xunlei search error:", e.message);
    return [];
  }
}

async function getMeta(type, id) {
  try {
    const r = await fetch(`${CINEMETA}/${type}/${encodeURIComponent(id)}.json`);
    if (!r.ok) return null;
    const j = await r.json();
    return j.meta || null;
  } catch (e) {
    console.warn("Cinemeta error:", e.message);
    return null;
  }
}

function buildSearchKeys(meta, type, season, episode) {
  const title = text(meta?.name);
  if (!title) return [];

  const avCode = extractSearchCode(`${title} ${meta?.description || ""}`);
  const keys = [];
  const display = title.replace(/\b(?:S\d{1,2}E\d{1,2}|Season\s*\d+)\b/gi, " ").trim();

  if (avCode) {
    const titlePart = display.replace(new RegExp(avCode.replace(/[-_]/g, "[-_]?"), "i"), "").trim();
    keys.push(avCode, avCode.replace(/[-_ ]/g, ""));
    if (titlePart) keys.push(`${avCode} ${titlePart}`);
  }

  if (type === "series") {
    const s = Number(season), e = Number(episode);
    if (s > 0 && e > 0) {
      keys.push(`${display} S${String(s).padStart(2,"0")}E${String(e).padStart(2,"0")}`);
      keys.push(`${display} ${String(s).padStart(2,"0")}x${String(e).padStart(2,"0")}`);
    }
    if (s > 0) keys.push(`${display} S${String(s).padStart(2,"0")}`);
    keys.push(display);
  } else {
    keys.push(display);
  }

  return [...new Set(keys)].filter(k => k.length >= 2);
}

app.get("/manifest.json", (req, res) => res.json(manifest));

app.get("/subtitles/:type/:id.vtt", async (req, res) => {
  const { type, id: rawId } = req.params;
  const id = decodeURIComponent(rawId);

  let season = 0, episode = 0, cleanId = id;
  if (type === "series") {
    const parts = id.split(":");
    cleanId = parts[0];
    season = Number(parts[1] || 0);
    episode = Number(parts[2] || 0);
  }

  const meta = await getMeta(type === "series" ? "series" : "movie", cleanId);
  if (!meta) return res.json({ subtitles: [] });

  const keys = buildSearchKeys(meta, type, season, episode);
  if (!keys.length) return res.json({ subtitles: [] });

  let all = [];
  for (const key of keys) {
    all = await searchSub(key);
    if (all.length) break;
  }

  const title = meta.name || "";
  const avCode = extractSearchCode(title);
  const scored = all.map(raw => {
    const item = normalizeResult(raw);
    return { item, score: scoreItem(item, title, season, episode, type, avCode) };
  }).sort((a,b) => b.score - a.score);

  const subtitles = [];
  const seen = new Set();

  for (const {item} of scored) {
    if (subtitles.length >= 10 || !item.url) continue;

    const key = `${item.name.toLowerCase()}|${item.url}`;
    if (seen.has(key)) continue;
    seen.add(key);

    const lang = avCode ? "chi" : (
      /简|chs|zho|chi/i.test(item.langs) ? "chi" :
      /繁|cht/i.test(item.langs) ? "zht" :
      /英|eng/i.test(item.langs) ? "eng" : "chi"
    );

    const cleanName = item.name.replace(/\.(srt|ass|ssa|zip|rar|7z)$/i, "");
    const ext = getExt(item.name) || item.ext || ".srt";
    const extras = [];
    const d = formatDuration(item.duration);
    const size = formatFileSize(item.file_size);
    if (d) extras.push(`时长${d}`);
    if (size) extras.push(`大小${size}`);

    subtitles.push({
      id: String(item.id),
      url: item.url,
      lang,
      name: avCode ? "简中" : getLangTag(item.langs).replace(/[【】]/g, ""),
      title: `${avCode ? "【简中】" : getLangTag(item.langs)}${cleanName}${ext}${extras.length ? ` | ${extras.join(" | ")}` : ""}`
    });
  }

  res.json({ subtitles });
});

app.get("/", (req, res) => {
  res.json({
    name: manifest.name,
    manifest: "/manifest.json",
    usage: "Install the manifest URL into Stremio."
  });
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`Xunlei Stremio subtitle addon running on port ${PORT}`);
});
