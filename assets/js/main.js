/*!
 * MBZ Cup 2026 – Direct Google Sheets CSV (Option B)
 * Drop-in main.js replacement that loads matches from a published Google Sheets CSV.
 * ✅ No design/CSS changes (data only).
 *
 * How it works:
 * - Fetch CSV -> parse -> normalize fields
 * - Expose data as window.MBZ_DATA
 * - Try to call existing render functions if they already exist (backward compatible)
 * - Always dispatch a CustomEvent: "mbz:data" with { matches, topScorers }
 *
 * You ONLY need to paste your published CSV URL in CONFIG.CSV_URL below.
 */

(function () {
  "use strict";

  // =========================
  // 1) CONFIG (EDIT THIS)
  // =========================
  const CONFIG = {
    // Put your "Publish to web" CSV URL here:
    // Example:
    // "https://docs.google.com/spreadsheets/d/e/XXXXXXXXXXXX/pub?gid=0&single=true&output=csv"
    CSV_URL: "PUT_YOUR_PUBLISHED_CSV_URL_HERE",

    // Optional: auto-refresh (ms). Set 0 to disable.
    AUTO_REFRESH_MS: 0,

    // If your sheet headers differ, adjust FIELD_MAP below (recommended),
    // otherwise normalization tries common Arabic/English variants.
  };

  // =========================
  // 2) OPTIONAL FIELD MAP
  // =========================
  // If your CSV has fixed headers, you can map them here.
  // Left side is the standard key we want; right side is your CSV header.
  // Leave blank ("") to use auto-detection.
  const FIELD_MAP = {
    home: "",
    away: "",
    homeScore: "",
    awayScore: "",
    date: "",
    time: "",
    group: "",
    round: "",
    scorersHome: "",
    scorersAway: "",
    scorers: "",
    varFlag: "",
    varNotes: ""
  };

  // =========================
  // 3) Utilities
  // =========================
  function cacheBust(url) {
    const sep = url.includes("?") ? "&" : "?";
    return url + sep + "t=" + Date.now();
  }

  async function fetchCSV(url) {
    const res = await fetch(cacheBust(url), { cache: "no-store" });
    if (!res.ok) throw new Error("CSV fetch failed: " + res.status);
    return await res.text();
  }

  // CSV parser (supports quotes and commas inside cells)
  function parseCSV(text) {
    const rows = [];
    let row = [];
    let cell = "";
    let inQuotes = false;

    for (let i = 0; i < text.length; i++) {
      const c = text[i];
      const next = text[i + 1];

      if (c === '"' && inQuotes && next === '"') { cell += '"'; i++; continue; }
      if (c === '"') { inQuotes = !inQuotes; continue; }

      if (c === "," && !inQuotes) { row.push(cell.trim()); cell = ""; continue; }

      if ((c === "\n" || c === "\r") && !inQuotes) {
        if (c === "\r" && next === "\n") i++;
        row.push(cell.trim());
        if (row.some(v => v !== "")) rows.push(row);
        row = [];
        cell = "";
        continue;
      }
      cell += c;
    }

    row.push(cell.trim());
    if (row.some(v => v !== "")) rows.push(row);

    const header = rows.shift() || [];
    return rows.map(r => {
      const o = {};
      header.forEach((h, idx) => { o[String(h || "").trim()] = (r[idx] ?? ""); });
      return o;
    });
  }

  function pick(r, candidates) {
    for (const key of candidates) {
      if (key && r[key] != null && String(r[key]).trim() !== "") return r[key];
    }
    return "";
  }

  function toInt(x) {
    const n = parseInt(String(x).trim(), 10);
    return Number.isFinite(n) ? n : null;
  }

  function normalizeYesNo(v) {
    const s = String(v ?? "").trim().toLowerCase();
    return ["yes","y","true","1","✅","var","تم","نعم","نعم✅","yes✅"].includes(s);
  }

  function normalizeMatchRow(r) {
    // If FIELD_MAP provided, use it first
    const mapped = {};
    for (const k in FIELD_MAP) {
      const header = FIELD_MAP[k];
      mapped[k] = header ? (r[header] ?? "") : "";
    }

    const home = mapped.home || pick(r, ["Home","TeamA","A","الفريق_أ","الفريق أ","الفريق A","الفريق1","الفريق 1","Team 1","Home Team","البيت","مضيف"]);
    const away = mapped.away || pick(r, ["Away","TeamB","B","الفريق_ب","الفريق ب","الفريق B","الفريق2","الفريق 2","Team 2","Away Team","ضيف"]);

    const homeScore = (mapped.homeScore !== "" ? toInt(mapped.homeScore) : null) ?? toInt(pick(r, ["HomeScore","A_Score","GoalsA","نتيجة_أ","نتيجة أ","أهداف_أ","Goals 1","ScoreA"]));
    const awayScore = (mapped.awayScore !== "" ? toInt(mapped.awayScore) : null) ?? toInt(pick(r, ["AwayScore","B_Score","GoalsB","نتيجة_ب","نتيجة ب","أهداف_ب","Goals 2","ScoreB"]));

    const date = mapped.date || pick(r, ["Date","MatchDate","التاريخ","تاريخ","يوم"]);
    const time = mapped.time || pick(r, ["Time","MatchTime","الوقت","ساعة"]);
    const group = mapped.group || pick(r, ["Group","المجموعة","GroupName"]);
    const round = mapped.round || pick(r, ["Round","Stage","الدور","المرحلة"]);

    const scorersHome = mapped.scorersHome || pick(r, ["ScorersHome","ScorersA","هدافو_أ","هدافو أ","هدافين_أ","Scorers 1"]);
    const scorersAway = mapped.scorersAway || pick(r, ["ScorersAway","ScorersB","هدافو_ب","هدافو ب","هدافين_ب","Scorers 2"]);
    const scorers = mapped.scorers || pick(r, ["Scorers","الهدافين","هدافين","Goalscorers"]);

    const varFlagRaw = mapped.varFlag || pick(r, ["VAR","var","تقنية_VAR","تقنية var","فار","VarUsed"]);
    const varNotes = mapped.varNotes || pick(r, ["VAR_Notes","VAR Notes","ملاحظات_VAR","ملاحظات var","VARReason"]);

    return {
      home: String(home).trim(),
      away: String(away).trim(),
      homeScore,
      awayScore,
      date: String(date).trim(),
      time: String(time).trim(),
      group: String(group).trim(),
      round: String(round).trim(),
      scorersHome: String(scorersHome).trim(),
      scorersAway: String(scorersAway).trim(),
      scorers: String(scorers).trim(),
      var: normalizeYesNo(varFlagRaw),
      varNotes: String(varNotes).trim()
    };
  }

  // Compute top scorers from "محمد (2), علي (1)" OR "محمد-2;علي-1"
  function computeTopScorers(matches) {
    const map = new Map();

    function addName(name, goals) {
      const n = String(name || "").trim();
      if (!n) return;
      const g = Number.isFinite(goals) ? goals : 1;
      map.set(n, (map.get(n) || 0) + g);
    }

    function parseLine(line) {
      const s = String(line || "").trim();
      if (!s) return;
      const parts = s.split(/[,;]+/).map(x => x.trim()).filter(Boolean);
      for (const p of parts) {
        // name (n)
        let m = p.match(/^(.+?)\s*\((\d+)\)\s*$/);
        if (m) { addName(m[1], parseInt(m[2], 10)); continue; }
        // name-n
        m = p.match(/^(.+?)\s*[-:]\s*(\d+)\s*$/);
        if (m) { addName(m[1], parseInt(m[2], 10)); continue; }
        // fallback: 1 goal
        addName(p, 1);
      }
    }

    matches.forEach(m => {
      parseLine(m.scorers);
      parseLine(m.scorersHome);
      parseLine(m.scorersAway);
    });

    return Array.from(map.entries())
      .map(([name, goals]) => ({ name, goals }))
      .sort((a, b) => b.goals - a.goals);
  }

  function dispatchData(matches) {
    const topScorers = computeTopScorers(matches);

    // Global (for debugging/use by other scripts)
    window.MBZ_DATA = { matches, topScorers };

    // Event (recommended integration point)
    document.dispatchEvent(new CustomEvent("mbz:data", { detail: { matches, topScorers } }));

    // Backward-compatible calls (only if functions exist)
    if (typeof window.renderMatches === "function") window.renderMatches(matches);
    if (typeof window.renderScorers === "function") window.renderScorers(matches);
    if (typeof window.renderTopScorers === "function") window.renderTopScorers(topScorers);
    if (typeof window.renderVAR === "function") window.renderVAR(matches);
    if (typeof window.initUI === "function") window.initUI(matches);
  }

  async function loadDirectB() {
    if (!CONFIG.CSV_URL || CONFIG.CSV_URL.includes("PUT_YOUR")) {
      console.error("MBZ Direct B: Please set CONFIG.CSV_URL to your published CSV URL.");
      return;
    }
    const csv = await fetchCSV(CONFIG.CSV_URL);
    const raw = parseCSV(csv);
    const matches = raw.map(normalizeMatchRow).filter(m => m.home || m.away || m.date || m.group || m.round);
    dispatchData(matches);
  }

  function start() {
    loadDirectB().catch(err => console.error("MBZ Direct B error:", err));
    if (CONFIG.AUTO_REFRESH_MS && CONFIG.AUTO_REFRESH_MS > 0) {
      setInterval(() => loadDirectB().catch(() => {}), CONFIG.AUTO_REFRESH_MS);
    }
  }

  document.addEventListener("DOMContentLoaded", start);
})();
