/* Mansour Cup 2026 - Robust CSV-driven front-end (no external libs) */
const CupApp = (() => {

  function qs(sel){ return document.querySelector(sel); }
  function qsa(sel){ return Array.from(document.querySelectorAll(sel)); }

  function getParam(name){
    const url = new URL(window.location.href);
    return url.searchParams.get(name) || "";
  }

  function showError(msg){
    const el = qs('#loadError');
    if(!el) return;
    el.textContent = msg;
    el.classList.remove('hidden');
  }

  // Basic CSV parser that supports quotes.
  function parseCSV(text){
    const rows = [];
    let row = [];
    let cur = "";
    let inQuotes = false;
    for(let i=0;i<text.length;i++){
      const ch = text[i];
      const next = text[i+1];
      if(inQuotes){
        if(ch === '"' && next === '"'){ cur += '"'; i++; continue; }
        if(ch === '"'){ inQuotes = false; continue; }
        cur += ch;
      }else{
        if(ch === '"'){ inQuotes = true; continue; }
        if(ch === ','){ row.push(cur); cur=""; continue; }
        if(ch === '\n'){ row.push(cur); rows.push(row); row=[]; cur=""; continue; }
        if(ch === '\r'){ continue; }
        cur += ch;
      }
    }
    row.push(cur);
    rows.push(row);
    // trim empty last line
    if(rows.length && rows[rows.length-1].length===1 && rows[rows.length-1][0].trim()===""){
      rows.pop();
    }
    const headers = rows.shift().map(h => h.trim());
    return rows.map(r => {
      const obj = {};
      headers.forEach((h, idx) => obj[h] = (r[idx] ?? "").trim());
      return obj;
    });
  }

  async function loadMatches(){
    try{
      const res = await fetch('data/matches.csv', { cache: 'no-store' });
      if(!res.ok) throw new Error('لم أستطع تحميل data/matches.csv (تأكد أنه موجود في المشروع).');
      const text = await res.text();
      const data = parseCSV(text);
      // normalize
      return data.map(m => ({
        group: (m.group || "").toUpperCase(),
        round: m.round || "",
        date: m.date || "",
        time: m.time || "",
        team1: m.team1 || "",
        team2: m.team2 || "",
        score1: m.score1 || "",
        score2: m.score2 || "",
        referee1: m.referee1 || "",
        referee2: m.referee2 || "",
        commentator: m.commentator || "",
        player_of_match: m.player_of_match || "",
        goals_team1: m.goals_team1 || "",
        goals_team2: m.goals_team2 || "",
        match_code: m.match_code || ""
      })).filter(m => m.group && m.team1 && m.team2);
    }catch(e){
      showError(e.message || String(e));
      return [];
    }
  }

  function isPlayed(m){
    return m.score1 !== "" && m.score2 !== "" && !isNaN(Number(m.score1)) && !isNaN(Number(m.score2));
  }

  function matchKey(m){
    return `${m.date} ${m.time}`.trim();
  }

  function sortByDateTimeDesc(a,b){
    const ka = matchKey(a);
    const kb = matchKey(b);
    return kb.localeCompare(ka);
  }

  function computeStandings(matches, group){
    const gMatches = matches.filter(m => m.group === group);
    const teams = new Set();
    gMatches.forEach(m => { teams.add(m.team1); teams.add(m.team2); });

    const table = {};
    for(const t of teams){
      table[t] = { team:t, P:0, W:0, D:0, L:0, GF:0, GA:0, GD:0, Pts:0 };
    }

    for(const m of gMatches){
      if(!isPlayed(m)) continue;
      const s1 = Number(m.score1);
      const s2 = Number(m.score2);
      const t1 = table[m.team1] || (table[m.team1] = { team:m.team1, P:0, W:0, D:0, L:0, GF:0, GA:0, GD:0, Pts:0 });
      const t2 = table[m.team2] || (table[m.team2] = { team:m.team2, P:0, W:0, D:0, L:0, GF:0, GA:0, GD:0, Pts:0 });

      t1.P++; t2.P++;
      t1.GF += s1; t1.GA += s2;
      t2.GF += s2; t2.GA += s1;

      if(s1 > s2){ t1.W++; t2.L++; t1.Pts += 3; }
      else if(s1 < s2){ t2.W++; t1.L++; t2.Pts += 3; }
      else { t1.D++; t2.D++; t1.Pts += 1; t2.Pts += 1; }
    }

    for(const t of Object.values(table)){
      t.GD = t.GF - t.GA;
    }

    const arr = Object.values(table);
    arr.sort((a,b) => {
      if(b.Pts !== a.Pts) return b.Pts - a.Pts;
      if(b.GD !== a.GD) return b.GD - a.GD;
      if(b.GF !== a.GF) return b.GF - a.GF;
      return a.team.localeCompare(b.team, 'ar');
    });
    return arr;
  }

  function renderRecent(matches){
    const tbl = qs('#tblRecent tbody');
    const badge = qs('#matchesCount');
    if(!tbl || !badge) return;
    const sorted = [...matches].sort(sortByDateTimeDesc).slice(0, 10);
    badge.textContent = String(matches.length);
    tbl.innerHTML = sorted.map(m => {
      const score = isPlayed(m) ? `${m.score1} - ${m.score2}` : '—';
      const link = m.match_code ? `<a href="match.html?id=${encodeURIComponent(m.match_code)}">عرض</a>` : '—';
      return `<tr>
        <td>${escapeHTML(m.match_code)}</td>
        <td>${escapeHTML(m.group)}</td>
        <td>${escapeHTML(m.date)}</td>
        <td>${escapeHTML(m.time)}</td>
        <td>${escapeHTML(m.team1)}</td>
        <td class="score">${escapeHTML(score)}</td>
        <td>${escapeHTML(m.team2)}</td>
        <td>${link}</td>
      </tr>`;
    }).join('');
  }

  function renderStandings(standings){
    const tbody = qs('#tblStandings tbody');
    const badge = qs('#grpBadge');
    if(!tbody || !badge) return;
    badge.textContent = String(standings.length);
    tbody.innerHTML = standings.map((t, idx) => `
      <tr>
        <td>${idx+1}</td>
        <td>${escapeHTML(t.team)}</td>
        <td>${t.P}</td>
        <td>${t.W}</td>
        <td>${t.D}</td>
        <td>${t.L}</td>
        <td>${t.GF}</td>
        <td>${t.GA}</td>
        <td>${t.GD}</td>
        <td>${t.Pts}</td>
      </tr>
    `).join('');
  }

  function groupMatchesByRound(matches, group){
    const g = matches.filter(m => m.group === group);
    const map = new Map();
    for(const m of g){
      const r = m.round || 'مباريات';
      if(!map.has(r)) map.set(r, []);
      map.get(r).push(m);
    }
    // sort rounds by common order (الأولى/الثانية/الثالثة) else keep
    const order = ['الجولة الأولى','الجولة الثانية','الجولة الثالثة','الجولة الرابعة'];
    const rounds = Array.from(map.keys()).sort((a,b) => {
      const ia = order.indexOf(a);
      const ib = order.indexOf(b);
      if(ia !== -1 || ib !== -1) return (ia===-1?999:ia) - (ib===-1?999:ib);
      return a.localeCompare(b,'ar');
    });
    rounds.forEach(r => map.get(r).sort((a,b) => matchKey(a).localeCompare(matchKey(b))));
    return { rounds, map };
  }

  function renderGroupMatches(matches, group){
    const wrap = qs('#matchesByRound');
    const badge = qs('#matchesCount');
    if(!wrap || !badge) return;
    const { rounds, map } = groupMatchesByRound(matches, group);
    const all = matches.filter(m => m.group===group);
    badge.textContent = String(all.length);

    wrap.innerHTML = rounds.map(r => {
      const ms = map.get(r) || [];
      const items = ms.map(m => {
        const score = isPlayed(m) ? `${m.score1} - ${m.score2}` : '—';
        const dt = [m.date, m.time].filter(Boolean).join(' • ');
        const ref = [m.referee1, m.referee2].filter(Boolean).join(' / ') || '—';
        const pom = m.player_of_match || '—';
        const link = m.match_code ? `<a href="match.html?id=${encodeURIComponent(m.match_code)}">تفاصيل</a>` : '';
        return `<div class="match-row">
          <div class="pill">${escapeHTML(dt || '—')}</div>
          <div class="dim">${escapeHTML(m.match_code || '')}</div>
          <div>${escapeHTML(m.team1)}</div>
          <div class="score">${escapeHTML(score)}</div>
          <div>${escapeHTML(m.team2)}</div>
          <div>${link}</div>
          <div class="dim" style="grid-column: 1 / -1;">
            حكم: ${escapeHTML(ref)} • أفضل لاعب: ${escapeHTML(pom)}
          </div>
        </div>`;
      }).join('');
      return `<div class="round">
        <div class="round-title">${escapeHTML(r)}</div>
        ${items || '<div class="muted">لا توجد مباريات</div>'}
      </div>`;
    }).join('');
  }

  function renderMatchPage(matches, matchCode){
    const m = matches.find(x => x.match_code === matchCode);
    if(!m){
      showError('لم أجد هذه المباراة. تأكد من id في الرابط.');
      return;
    }
    const set = (id, val) => { const el = qs('#'+id); if(el) el.textContent = val; };
    set('matchTitle', `${m.team1} × ${m.team2}`);
    set('matchCode', m.match_code);
    set('matchGroup', m.group);
    document.body.dataset.group = m.group;
    set('matchRound', m.round || '—');
    set('matchDate', m.date || '—');
    set('matchTime', m.time || '—');

    const ref = [m.referee1, m.referee2].filter(Boolean).join(' / ') || '—';
    set('matchRef', ref);
    set('matchComm', m.commentator || '—');
    set('matchPOM', m.player_of_match || '—');
    // VAR usage (0-2 per team)
    const v1 = (m.var_team1===undefined || m.var_team1===null || m.var_team1==='') ? 0 : Number(m.var_team1);
    const v2 = (m.var_team2===undefined || m.var_team2===null || m.var_team2==='') ? 0 : Number(m.var_team2);
    set('matchVAR', `الفريق 1: ${isNaN(v1)?0:v1}/2 — الفريق 2: ${isNaN(v2)?0:v2}/2`);

    const score = isPlayed(m) ? `${m.score1} - ${m.score2}` : 'لم تُلعب بعد';
    const scoreLine = qs('#scoreLine');
    if(scoreLine) scoreLine.textContent = `${m.team1}  ${score}  ${m.team2}`;

    const back = qs('#backToGroup');
    if(back) back.href = `group.html?g=${encodeURIComponent(m.group)}`;

    const goals1 = qs('#goals1');
    const goals2 = qs('#goals2');
    if(goals1) goals1.innerHTML = renderGoalsList(m.goals_team1);
    if(goals2) goals2.innerHTML = renderGoalsList(m.goals_team2);
  }

  function renderGoalsList(text){
    const s = (text || '').trim();
    if(!s) return '<li class="muted">—</li>';
    // split by ; or newline
    const parts = s.split(/;|\n|,|،|\||\/+/).map(x => x.trim()).filter(Boolean);
    return parts.map(p => `<li>${escapeHTML(formatGoalItem(p))}</li>`).join('');
  }


  function formatGoalItem(p){
    const t = String(p||'').trim();
    if(!t) return '';
    // normalize common minute notations: "Name 12" -> "Name (12')"
    const m = t.match(/^(.*?)(?:\s*[\-:()]*\s*)(\d{1,3})(?:\s*['’]|\s*د|\s*min)?\s*$/);
    if(m && m[1] && m[2]){
      const name = m[1].trim().replace(/[\-:()]+$/,'').trim();
      const minute = m[2].trim();
      if(name) return `${name} (${minute}')`;
    }
    return t;
  }

  function escapeHTML(str){
    return String(str ?? '')
      .replaceAll('&','&amp;')
      .replaceAll('<','&lt;')
      .replaceAll('>','&gt;')
      .replaceAll('"','&quot;')
      .replaceAll("'",'&#39;');
  }

  async function initIndex(){
    const matches = await loadMatches();
    renderRecent(matches);
  }

  async function initGroup(){
    const g = (getParam('g') || 'A').toUpperCase();
    const sub = qs('#pageSub'); if(sub) sub.textContent = `المجموعة ${g}`;
    const title = qs('#grpTitle'); if(title) title.textContent = `الترتيب — المجموعة ${g}`;
    const matches = await loadMatches();
    const standings = computeStandings(matches, g);
    renderStandings(standings);
    renderGroupMatches(matches, g);
  }

  async function initMatch(){
    const id = getParam('id');
    const matches = await loadMatches();
    renderMatchPage(matches, id);
  }

  return { initIndex, initGroup, initMatch };
})();
