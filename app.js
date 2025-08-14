// College Basketball GM — MVP (No build tools; Netlify-ready)
// Everything persists to LocalStorage. Replace data/teams.csv with a full D-I list when ready.

const STORAGE_KEY = "cbbgm_save_v1";

// ---------- Small utilities ----------
function rng(seed) {
  // Mulberry32 deterministic RNG
  let t = seed >>> 0;
  return function() {
    t += 0x6D2B79F5;
    let r = Math.imul(t ^ t >>> 15, 1 | t);
    r ^= r + Math.imul(r ^ r >>> 7, 61 | r);
    return ((r ^ r >>> 14) >>> 0) / 4294967296;
  };
}

function hashString(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h += (h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24);
  }
  return h >>> 0;
}

function pick(arr, rnd) { return arr[Math.floor(rnd() * arr.length)]; }

function shuffle(arr, rnd) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function saveState(state) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function loadState() {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return null;
  try { return JSON.parse(raw); } catch { return null; }
}


// ---------- Division I Auto-Loader (Wikipedia) ----------
// Fetches the full D-I list (programs) from Wikipedia and builds teams.
// Uses a simple conference->average rating mapping you can tweak below.

const CONF_AVG_RATING = {
  // Power conferences
  "Big Ten": 86, "Big 12": 86, "SEC": 85, "Big East": 84, "ACC": 83, "Pac-12": 0,
  // 2025 landscape extras / strong mids
  "Mountain West": 82, "American Athletic": 79, "West Coast": 79, "A-10": 78,
  // Other multis (adjust as you like):
  "Missouri Valley": 77, "Conference USA": 75, "Sun Belt": 74, "Colonial": 74,
  "WAC": 73, "MAC": 74, "Big Sky": 72, "Big South": 71, "Horizon": 72,
  "Ivy": 73, "MAAC": 71, "MEAC": 67, "NEC": 68, "Ohio Valley": 71, "Patriot": 71,
  "SoCon": 73, "Southland": 70, "SWAC": 66, "ASUN": 71, "Summit League": 72,
  // Aliases
  "Atlantic 10": 78, "Western Athletic": 73, "America East": 71, "A-Sun": 71,
  "CAA": 74, "WCC": 79, "MWC": 82, "AAC": 79
};

async function fetchWikipediaDI() {
  // Use MediaWiki API to get HTML for the "List of NCAA Division I men's basketball programs" page.
  // We'll parse tables with class 'wikitable' and extract Team (school+nickname) and Conference.
  const url = "https://en.wikipedia.org/w/api.php?action=parse&page=List_of_NCAA_Division_I_men%27s_basketball_programs&prop=text&formatversion=2&format=json&origin=*";
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error("Wikipedia fetch failed");
  const data = await res.json();
  const html = data.parse && data.parse.text ? data.parse.text : "";
  if (!html) throw new Error("Wikipedia parse returned empty HTML");

  // Parse HTML into a DOM
  const container = document.createElement("div");
  container.innerHTML = html;

  // Find all wikitable tables and scrape rows
  const tables = container.querySelectorAll(".wikitable");
  const rows = [];
  tables.forEach(tbl => {
    const trs = tbl.querySelectorAll("tr");
    // detect header
    let headers = [];
    if (trs.length === 0) return;
    const ths = trs[0].querySelectorAll("th");
    headers = Array.from(ths).map(th => th.textContent.trim().toLowerCase());
    const hasTeam = headers.some(h => h.includes("team") || h.includes("school"));
    const hasConf = headers.some(h => h.includes("conference"));
    if (!hasTeam || !hasConf) return;
    for (let i = 1; i < trs.length; i++) {
      const tds = trs[i].querySelectorAll("td");
      if (tds.length < 2) continue;
      const cells = Array.from(tds).map(td => td.textContent.replace(/\[\d+\]/g, "").trim());
      // try to map columns
      const obj = {};
      headers.forEach((h, idx) => obj[h] = cells[idx] ?? "");
      const teamStr = obj["team"] || obj["school"] || cells[0] || "";
      const confStr = obj["conference"] || cells[cells.length - 1] || "";
      if (!teamStr || !confStr) continue;
      rows.push({ team: teamStr, conference: confStr });
    }
  });

  // Deduplicate and normalize
  const unique = new Map();
  for (const r of rows) {
    // Clean team "X Y Z" — keep as full display in nickname; derive School by dropping last 1-2 tokens if they look like nicknames
    let team = r.team.replace(/\s+/g, " ").replace(/\u00A0/g, " ").trim();
    let conf = r.conference.replace(/\s+/g, " ").trim();
    // normalize conference aliases
    conf = conf.replace(/^The\s+/i, "");
    conf = conf.replace(/American Athletic Conference.*/i, "American Athletic");
    conf = conf.replace(/Atlantic\s*10.*/i, "Atlantic 10");
    conf = conf.replace(/West Coast Conference.*/i, "West Coast");
    conf = conf.replace(/Mountain West Conference.*/i, "Mountain West");
    conf = conf.replace(/Western Athletic Conference.*/i, "Western Athletic");
    conf = conf.replace(/Missouri Valley Conference.*/i, "Missouri Valley");
    conf = conf.replace(/Colonial Athletic Association.*/i, "Colonial");
    conf = conf.replace(/Sun Belt Conference.*/i, "Sun Belt");
    conf = conf.replace(/Horizon League.*/i, "Horizon");
    conf = conf.replace(/Patriot League.*/i, "Patriot");
    conf = conf.replace(/America East Conference.*/i, "America East");

    // Heuristic split: if team contains a known school + nickname pattern, split last 1–3 words as nickname
    const parts = team.split(" ");
    let school = team, nickname = "";
    if (parts.length >= 3) {
      // try 2-word nickname then 1-word
      const try2 = parts.slice(-2).join(" ");
      const try1 = parts.slice(-1).join(" ");
      if (/Devils|Heels|Cavaliers|Hurricanes|Wolfpack|Orange|Tigers|Deacons|Seminoles|Irish|Cardinals|Panthers|Eagles|Jackets|Hokies|Jayhawks|Bears|Cougars|Cyclones|Longhorns|Raiders|Sooners|Cowboys|Frogs|Mountaineers|Bearcats|Knights|Wildcats|Utes|Buffaloes|Crimson|Volunteers|Razorbacks|Aggies|Gators|Bulldogs|Rebels|Tigers|Gamecocks|Commodores|Huskies|Boilermakers|Spartans|Buckeyes|Badgers|Hoosiers|Terrapins|Hawkeyes|Knights|Cornhuskers|Gophers|Lions|Bruins|Trojans|Ducks|Huskies|Bulldogs|Gaels|Aztecs|Rebels|Broncos|Lobos|Flyers|Rams|Eagles|Bluejays|Musketeers|Friars|Pirates|Hoyas|Gaels|Vikings|Lancers|Lions|Wildcats|Owls|Waves|Flames|Dolphins|Seahawks|Seawolves|Bison|Grizzlies|Bears|Bobcats|Spartans|Titans|Privateers|Lumberjacks|Thunderbirds|Trojans|Mastodons|Penguins|Catamounts|Salukis|Antelopes|Lancers/i.test(try2)) {
        school = parts.slice(0, -2).join(" ");
        nickname = try2;
      } else if (/Devils|Heels|Cavaliers|Hurricanes|Wolfpack|Orange|Tigers|Deacons|Seminoles|Irish|Cardinals|Panthers|Eagles|Jackets|Hokies|Jayhawks|Bears|Cougars|Cyclones|Longhorns|Raiders|Sooners|Cowboys|Frogs|Mountaineers|Bearcats|Knights|Wildcats|Utes|Buffaloes|Crimson|Volunteers|Razorbacks|Aggies|Gators|Bulldogs|Rebels|Tigers|Gamecocks|Commodores|Huskies|Boilermakers|Spartans|Buckeyes|Badgers|Hoosiers|Terrapins|Hawkeyes|Knights|Cornhuskers|Gophers|Lions|Bruins|Trojans|Ducks|Huskies|Gaels|Aztecs|Broncos|Lobos|Flyers|Rams|Bluejays|Musketeers|Friars|Pirates|Hoyas|Gaels|Vikings|Lancers|Owls|Waves|Flames|Dolphins|Seahawks|Seawolves|Bison|Grizzlies|Bears|Bobcats|Spartans|Titans|Privateers|Lumberjacks|Thunderbirds|Trojans|Mastodons|Penguins|Catamounts|Salukis|Antelopes|Lancers/i.test(try1)) {
        school = parts.slice(0, -1).join(" ");
        nickname = try1;
      }
    }

    const key = school + "~~" + nickname + "~~" + conf;
    if (!unique.has(key)) {
      unique.set(key, { school, nickname, conf });
    }
  }

  const list = Array.from(unique.values());
  if (list.length < 320) {
    console.warn("Low team count parsed:", list.length);
  }

  // Assign ratings by conference average with small random jitter for variety
  const out = list.map((t, idx) => {
    const base = CONF_AVG_RATING[t.conf] ?? 74;
    const jitter = Math.round((Math.random()-0.5) * 8); // -4..+4
    const rating = Math.max(30, Math.min(95, base + jitter));
    return { id: idx, school: t.school, nickname: t.nickname, conf: t.conf, rating };
  });

  return out;
}

// Hook up a button to trigger the loader (and save as the new universe)
async function loadFromWikipediaAndStart() {
  const rows = await fetchWikipediaDI();
  const seedInput = document.getElementById("seedInput");
  U = new Universe(rows, seedInput.value || "wiki-2025");
  saveState(U);
  renderAll();
  alert(`Loaded ${rows.length} Division I teams from Wikipedia. You can tweak ratings later in code.`);
}

// ---------- Data loading ----------
async function loadTeamsCSV() {
  // CSV columns: School,Nickname,Conference,Rating
  const res = await fetch("data/teams.csv", { cache: "no-store" });
  if (!res.ok) throw new Error("Failed to fetch data/teams.csv");
  const text = await res.text();
  return parseCSV(text);
}

function parseCSV(text) {
  const lines = text.replace(/\r/g, "").split("\n").filter(Boolean);
  const header = lines[0].split(",").map(s => s.trim());
  const idx = {
    School: header.indexOf("School"),
    Nickname: header.indexOf("Nickname"),
    Conference: header.indexOf("Conference"),
    Rating: header.indexOf("Rating"),
  };
  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    const parts = splitCSVLine(lines[i]);
    if (parts.length < 4) continue;
    rows.push({
      school: parts[idx.School]?.trim(),
      nickname: parts[idx.Nickname]?.trim(),
      conf: parts[idx.Conference]?.trim(),
      rating: Number(parts[idx.Rating]) || 50,
      id: i - 1,
    });
  }
  return rows.filter(r => r.school && r.conf);
}

function splitCSVLine(line) {
  // naive CSV split supporting basic quoted values
  const out = [];
  let cur = "";
  let q = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"' ) {
      if (q && line[i+1] === '"') { cur += '"'; i++; }
      else { q = !q; }
    } else if (ch === "," && !q) {
      out.push(cur); cur = "";
    } else {
      cur += ch;
    }
  }
  out.push(cur);
  return out;
}

// ---------- Core sim types ----------
class Team {
  constructor(row) {
    this.id = row.id;
    this.school = row.school;
    this.nickname = row.nickname;
    this.conf = row.conf;
    this.rating = row.rating; // 30..90 suggested
    this.w = 0; this.l = 0;
    this.cw = 0; this.cl = 0;
    this.sos = 0; // strength of schedule
    this.rs = 0;  // resume (wins vs good teams)
    this.seedNote = "";
  }
  get name(){ return `${this.school} ${this.nickname}`.trim(); }
}

class Game {
  constructor(homeId, awayId, conf, week, neutral=false) {
    this.homeId = homeId;
    this.awayId = awayId;
    this.conf = conf;
    this.week = week;
    this.neutral = neutral;
    this.played = false;
    this.homeScore = 0; this.awayScore = 0;
  }
}

class Universe {
  constructor(teams, seedStr="") {
    this.teams = teams.map(t => new Team(t));
    this.year = 2025;
    this.week = 1;
    this.games = [];
    this.confTournaments = {}; // conf -> array of Games
    this.bracket = null;
    const s = seedStr ? hashString(seedStr) : Date.now();
    this.rnd = rng(s);
  }
}

// ---------- Schedule & Sim ----------
function groupByConference(teams){
  const by = {};
  for (const t of teams) {
    if (!by[t.conf]) by[t.conf] = [];
    by[t.conf].push(t);
  }
  return by;
}

function eloWinProb(rA, rB, homeAdv=1.5) {
  // r in ~30..90. Convert to a softer logistic.
  const diff = (rA + homeAdv) - rB;
  return 1 / (1 + Math.exp(-diff/6));
}

function simScore(base=70, variance=12, rnd){
  // return a plausible score baseline
  const g = (rnd() + rnd() + rnd())/3; // ~normal
  return Math.max(40, Math.round(base + (g-0.5)*2*variance));
}

function simulateGame(u, g){
  if (g.played) return;
  const home = u.teams.find(t => t.id === g.homeId);
  const away = u.teams.find(t => t.id === g.awayId);
  const homeAdv = g.neutral ? 0 : 2.5;
  const pHome = eloWinProb(home.rating, away.rating, homeAdv);
  const roll = u.rnd();
  let homeScore = simScore(71, 11, u.rnd);
  let awayScore = simScore(71, 11, u.rnd);

  // bias towards expected winner by nudging scores
  const margin = Math.floor((pHome - 0.5) * 12);
  homeScore += margin; awayScore -= margin;

  // avoid ties
  if (homeScore === awayScore) {
    if (u.rnd() < 0.5) homeScore += 1; else awayScore += 1;
  }

  g.played = true;
  g.homeScore = homeScore;
  g.awayScore = awayScore;

  const homeWon = homeScore > awayScore;
  if (homeWon) {
    home.w++; away.l++;
    if (g.conf) { home.cw++; away.cl++; }
    home.rs += away.rating >= 75 ? 1 : 0;
  } else {
    away.w++; home.l++;
    if (g.conf) { away.cw++; home.cl++; }
    away.rs += home.rating >= 75 ? 1 : 0;
  }
  // update basic SOS
  home.sos += away.rating * 0.02;
  away.sos += home.rating * 0.02;
}

function generateSchedule(u, mode="single", nonConf=8) {
  u.games = [];
  u.week = 1;
  const byConf = groupByConference(u.teams);
  let week = 1;

  // conference round robin(s)
  for (const conf of Object.keys(byConf)) {
    const teams = byConf[conf].slice();
    // single RR pairing using circle method
    let list = teams.map(t => t.id);
    if (list.length % 2 === 1) list.push(null); // bye
    const rounds = mode === "double" ? (list.length-1)*2 : (list.length-1);

    for (let r=0; r<rounds; r++) {
      const pairs = [];
      for (let i=0;i<list.length/2;i++){
        const a = list[i], b = list[list.length-1-i];
        if (a!=null && b!=null) {
          const homeFirst = (r % 2 === 0);
          pairs.push(new Game(homeFirst ? a : b, homeFirst ? b : a, conf, week));
        }
      }
      u.games.push(...pairs);
      // rotate
      const fixed = list[0];
      const rotated = [fixed, ...list.slice(2), list[1]];
      list = rotated;
      week++;
    }
  }

  // non-conference
  const allIds = u.teams.map(t => t.id);
  const byConf = groupByConference(u.teams);
  const confMap = {};
  for (const t of u.teams) confMap[t.id] = t.conf;

  for (const team of u.teams) {
    let added = 0, tries = 0;
    while (added < nonConf && tries < nonConf * 20) {
      tries++;
      const oppId = pick(allIds, u.rnd);
      if (oppId === team.id) continue;
      if (confMap[oppId] === team.conf) continue; // avoid same conf
      // avoid duplicates
      const dup = u.games.some(g =>
        (g.homeId === team.id && g.awayId === oppId) ||
        (g.homeId === oppId && g.awayId === team.id)
      );
      if (dup) continue;
      // alternate home/away by hash
      const h = hashString(`${team.id}-${oppId}-${u.year}-${added}`);
      const home = (h % 2 === 0) ? team.id : oppId;
      const away = home === team.id ? oppId : team.id;
      u.games.push(new Game(home, away, null, week));
      added++;
      week++;
    }
  }
}

function simRegularSeason(u){
  const seasonGames = u.games.filter(g => !g.played);
  for (const g of seasonGames) simulateGame(u, g);
}

function standingsForConf(u, conf){
  const teams = u.teams.filter(t => t.conf === conf);
  return teams.slice().sort((a,b)=>{
    // conference record first, then overall, then rating
    if (b.cw - b.cl !== a.cw - a.cl) {
      return (b.cw - b.cl) - (a.cw - a.cl);
    }
    if (b.w - b.l !== a.w - a.l) {
      return (b.w - b.l) - (a.w - a.l);
    }
    return (b.rating + b.sos) - (a.rating + a.sos);
  });
}

function buildConfTournaments(u){
  u.confTournaments = {};
  const by = groupByConference(u.teams);
  for (const conf of Object.keys(by)) {
    const seeds = standingsForConf(u, conf).map(t => t.id);
    // single-elim bracket; neutral courts
    const rounds = [];
    let roundTeams = seeds;
    while (roundTeams.length > 1) {
      const games = [];
      for (let i=0;i<Math.floor(roundTeams.length/2);i++){
        const a = roundTeams[i];
        const b = roundTeams[roundTeams.length-1-i];
        games.push(new Game(a, b, conf, 0, true));
      }
      rounds.push(games);
      roundTeams = games.map((g)=>{
        simulateGame(u, g);
        return (g.homeScore > g.awayScore) ? g.homeId : g.awayId;
      });
    }
    u.confTournaments[conf] = rounds;
  }
}

function rateTeamForSelection(t){
  // simple composite metric
  return t.rating*0.6 + t.sos*0.3 + t.rs*4 + (t.w - t.l)*0.5;
}

function buildNationalBracket(u){
  const by = groupByConference(u.teams);
  // Auto-bids: conference tournament winners (last round winner)
  const autoBidIds = new Set();
  for (const conf of Object.keys(by)) {
    const rounds = u.confTournaments[conf];
    if (!rounds || rounds.length === 0) continue;
    const lastRound = rounds[rounds.length-1];
    const champGame = lastRound[lastRound.length-1];
    const champId = (champGame.homeScore > champGame.awayScore) ? champGame.homeId : champGame.awayId;
    autoBidIds.add(champId);
  }

  // Rank all teams
  const ranked = u.teams.slice().sort((a,b)=>rateTeamForSelection(b)-rateTeamForSelection(a));
  // Choose tournament size based on universe size
  const N = u.teams.length;
  const size = N >= 64 ? 64 : (N >= 32 ? 32 : (N >= 16 ? 16 : 8));

  const selected = [];
  // add auto-bids first
  for (const id of autoBidIds) {
    if (selected.length < size) selected.push(u.teams.find(t=>t.id===id));
  }
  // fill at-larges
  for (const t of ranked) {
    if (selected.length >= size) break;
    if (!autoBidIds.has(t.id)) selected.push(t);
  }

  // seed 1..size
  const seeded = selected.slice().sort((a,b)=>rateTeamForSelection(b)-rateTeamForSelection(a));
  for (let i=0;i<seeded.length;i++){
    seeded[i].seedNote = `Seed ${i+1}`;
  }

  // create bracket pairings (1 vs size, 2 vs size-1, ...)
  const rounds = [];
  let roundTeams = seeded.map(t => t.id);
  rounds.push(pairRound(roundTeams));
  u.bracket = { rounds };
}

function pairRound(ids){
  const games = [];
  for (let i=0;i<Math.floor(ids.length/2);i++){
    const a = ids[i];
    const b = ids[ids.length-1-i];
    games.push(new Game(a, b, "NCAA", 0, true));
  }
  return games;
}

function simBracket(u){
  if (!u.bracket) return;
  const rounds = u.bracket.rounds;
  let current = rounds[0];
  // simulate current if not played
  for (const g of current) simulateGame(u, g);
  let nextIds = current.map(g => (g.homeScore > g.awayScore) ? g.homeId : g.awayId);
  while (nextIds.length > 1) {
    const nextRound = pairRound(nextIds);
    for (const g of nextRound) simulateGame(u, g);
    rounds.push(nextRound);
    nextIds = nextRound.map(g => (g.homeScore > g.awayScore) ? g.homeId : g.awayId);
  }
}

// ---------- UI ----------
const els = {
  views: {
    teams: document.getElementById("view-teams"),
    standings: document.getElementById("view-standings"),
    schedule: document.getElementById("view-schedule"),
    tournaments: document.getElementById("view-tournaments"),
    bracket: document.getElementById("view-bracket"),
  },
  help: document.getElementById("help"),
  fileInput: document.getElementById("fileInput")
};

let U = null;

function renderTeams(){
  const by = groupByConference(U.teams);
  const confs = Object.keys(by).sort();
  let html = `<div class="grid cols-2">`;
  for (const conf of confs) {
    html += `<div class="card"><div class="badge">${conf}</div><table><thead><tr><th>Team</th><th class="mono">Rtg</th><th class="mono">W-L</th></tr></thead><tbody>`;
    for (const t of standingsForConf(U, conf)) {
      html += `<tr><td>${t.name}</td><td class="mono">${t.rating.toFixed(0)}</td><td class="mono">${t.w}-${t.l}</td></tr>`;
    }
    html += `</tbody></table></div>`;
  }
  html += `</div>`;
  els.views.teams.innerHTML = html;
}

function renderStandings(){
  const by = groupByConference(U.teams);
  const confs = Object.keys(by).sort();
  let html = "";
  for (const conf of confs) {
    const s = standingsForConf(U, conf);
    html += `<div class="card"><div class="badge">${conf}</div><table><thead><tr><th>#</th><th>Team</th><th class="mono">Conf</th><th class="mono">Overall</th><th class="mono">SOS</th></tr></thead><tbody>`;
    s.forEach((t,i)=>{
      html += `<tr><td>${i+1}</td><td>${t.name}</td><td class="mono">${t.cw}-${t.cl}</td><td class="mono">${t.w}-${t.l}</td><td class="mono">${t.sos.toFixed(1)}</td></tr>`;
    });
    html += `</tbody></table></div>`;
  }
  els.views.standings.innerHTML = html;
}

function renderSchedule(){
  const weeks = {};
  for (const g of U.games) {
    const w = g.week || 0;
    if (!weeks[w]) weeks[w] = [];
    weeks[w].push(g);
  }
  const sortedWeeks = Object.keys(weeks).map(Number).sort((a,b)=>a-b);
  let html = "";
  for (const w of sortedWeeks) {
    html += `<div class="card"><div class="badge">Week ${w}</div>`;
    for (const g of weeks[w]) {
      const home = U.teams.find(t => t.id === g.homeId);
      const away = U.teams.find(t => t.id === g.awayId);
      html += `<div class="game"><span>${g.conf?`<span class="badge">${g.conf}</span> `:""}${away.name} @ ${home.name}${g.neutral?" (N)":""}</span>`;
      html += `<span class="mono">${g.played?`${g.awayScore}–${g.homeScore}`:"—"}</span></div>`;
    }
    html += `</div>`;
  }
  els.views.schedule.innerHTML = html || `<div class="card">No schedule yet. Click <em>Generate Schedule</em>.</div>`;
}

function renderConfTournaments(){
  let html = "";
  for (const conf of Object.keys(U.confTournaments).sort()) {
    const rounds = U.confTournaments[conf];
    html += `<div class="card"><div class="badge">${conf} — Tournament</div>`;
    rounds.forEach((games, idx) => {
      html += `<div class="round"><h3>Round ${idx+1}</h3>`;
      for (const g of games) {
        const A = U.teams.find(t=>t.id===g.awayId);
        const H = U.teams.find(t=>t.id===g.homeId);
        html += `<div class="game"><span>${A.name} vs ${H.name} (N)</span><span class="mono">${g.awayScore}–${g.homeScore}</span></div>`;
      }
      html += `</div>`;
    });
    // champ
    const last = rounds[rounds.length-1];
    const cg = last[last.length-1];
    const champ = U.teams.find(t=>(cg.homeScore>cg.awayScore?cg.homeId:cg.awayId)===t.id);
    html += `<div class="badge">Champion: ${champ.name}</div>`;
    html += `</div>`;
  }
  els.views.tournaments.innerHTML = html || `<div class="card">Run <em>Sim Conf Tournaments</em> after regular season.</div>`;
}

function renderBracket(){
  if (!U.bracket) {
    els.views.bracket.innerHTML = `<div class="card">Build the national bracket after conference tournaments.</div>`;
    return;
  }
  const rounds = U.bracket.rounds;
  let html = `<div class="bracket">`;
  rounds.forEach((games, idx) => {
    html += `<div class="round"><h3>${["Round of","Round of","Sweet 16","Elite 8","Final 4","Final"][idx]||"Round"} ${games.length*2}</h3>`;
    for (const g of games) {
      const A = U.teams.find(t=>t.id===g.awayId);
      const H = U.teams.find(t=>t.id===g.homeId);
      html += `<div class="game"><span>${A.name} vs ${H.name}</span><span class="mono">${g.awayScore}–${g.homeScore}</span></div>`;
    }
    html += `</div>`;
  });
  // champion
  const last = rounds[rounds.length-1];
  const g = last[last.length-1];
  const champ = U.teams.find(t=>(g.homeScore>g.awayScore?g.homeId:g.awayId)===t.id);
  html += `</div><div class="card"><div class="badge">National Champion: ${champ.name}</div></div>`;
  els.views.bracket.innerHTML = html;
}

function setView(name){
  for (const key of Object.keys(els.views)) {
    els.views[key].classList.remove("active");
  }
  const el = els.views[name];
  if (el) el.classList.add("active");
}

// ---------- Bootstrap / Actions ----------
async function buildOrLoad() {
  const saved = loadState();
  if (saved) {
    U = revive(saved);
    renderAll();
    return;
  }
  // fresh: load data/teams.csv
  const rows = await loadTeamsCSV();
  const seedInput = document.getElementById("seedInput");
  U = new Universe(rows, seedInput.value || "default");
  saveState(U);
  renderAll();
}

function revive(saved){
  const u = new Universe(saved.teams, "revive");
  // overwrite with saved fields
  u.teams = saved.teams.map(t => Object.assign(new Team({id:t.id, school:t.school, nickname:t.nickname, conf:t.conf, rating:t.rating}), t));
  u.year = saved.year; u.week = saved.week;
  u.games = saved.games.map(g => Object.assign(new Game(g.homeId,g.awayId,g.conf,g.week,g.neutral), g));
  u.confTournaments = saved.confTournaments || {};
  u.bracket = saved.bracket || null;
  // keep deterministic rng based on year+seed
  u.rnd = rng(hashString(String(saved.year)));
  return u;
}

function renderAll(){
  renderTeams();
  renderStandings();
  renderSchedule();
  renderConfTournaments();
  renderBracket();
  setView("teams");
  saveState(U);
}

document.getElementById("newGameBtn").addEventListener("click", async () => {
  if (!confirm("Start a fresh universe? This will overwrite your current save (export first if needed).")) return;
  localStorage.removeItem(STORAGE_KEY);
  await buildOrLoad();
});

document.getElementById("exportBtn").addEventListener("click", () => {
  const data = JSON.stringify(U);
  const blob = new Blob([data], {type:"application/json"});
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = "cbbgm-save.json";
  document.body.appendChild(a); a.click(); a.remove();
  URL.revokeObjectURL(url);
});

document.getElementById("importBtn").addEventListener("click", () => {
  els.fileInput.click();
});
els.fileInput.addEventListener("change", async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  const text = await file.text();
  try {
    const obj = JSON.parse(text);
    U = revive(obj);
    saveState(U);
    renderAll();
  } catch (err) {
    alert("Invalid save file.");
  }
});

document.getElementById("loadTeamsBtn").addEventListener("click", async () => {
  if (!confirm("Reload teams from data/teams.csv? This resets the universe.")) return;
  const rows = await loadTeamsCSV();
  const seedInput = document.getElementById("seedInput");
  U = new Universe(rows, seedInput.value || "default");
  saveState(U);
  renderAll();
});

document.querySelectorAll('aside .panel button[data-view]').forEach(btn=>{
  btn.addEventListener("click", ()=> setView(btn.getAttribute("data-view")));
});

document.getElementById("genScheduleBtn").addEventListener("click", () => {
  const rr = document.getElementById("rrMode").value;
  const nc = parseInt(document.getElementById("nonConfInput").value,10) || 8;
  generateSchedule(U, rr, nc);
  saveState(U); renderAll(); setView("schedule");
});
document.getElementById("simRegularBtn").addEventListener("click", () => {
  simRegularSeason(U);
  saveState(U); renderAll(); setView("standings");
});
document.getElementById("simTournamentsBtn").addEventListener("click", () => {
  buildConfTournaments(U);
  saveState(U); renderAll(); setView("tournaments");
});
document.getElementById("buildBracketBtn").addEventListener("click", () => {
  buildNationalBracket(U);
  saveState(U); renderAll(); setView("bracket");
});
document.getElementById("simBracketBtn").addEventListener("click", () => {
  simBracket(U);
  saveState(U); renderAll(); setView("bracket");
});

// Kick off
buildOrLoad().catch(err => {
  console.error(err);
  document.getElementById("content").innerHTML = `<div class="card">Failed to initialize: ${err.message}</div>`;
});


document.getElementById("wikiLoadBtn").addEventListener("click", async () => {
  if (!confirm("Fetch the full Division I list from Wikipedia and start a new universe?")) return;
  try {
    await loadFromWikipediaAndStart();
  } catch (e) {
    console.error(e);
    alert("Wikipedia load failed. You can still use data/teams.csv or try again.");
  }
});


// ---------- Static CSV Mode & Exporter ----------
function isStaticCsvMode(){
  const el = document.getElementById("staticCsvMode");
  return el && el.checked;
}
if (document.getElementById("staticCsvMode")) {
  document.getElementById("staticCsvMode").addEventListener("change", ()=>{
    localStorage.setItem("cbbgm_static_csv_mode", isStaticCsvMode() ? "1" : "0");
  });
  const savedFlag = localStorage.getItem("cbbgm_static_csv_mode");
  if (savedFlag === "1") document.getElementById("staticCsvMode").checked = true;
}

async function exportTeamsCSV(teams) {
  // teams: array of {school,nickname,conf,rating}
  const header = "School,Nickname,Conference,Rating";
  const lines = teams.map(t => {
    const esc = (s)=> `"${String(s).replace(/"/g,'""')}"`;
    return [esc(t.school), esc(t.nickname||""), esc(t.conf), t.rating].join(",");
  });
  const csv = [header, ...lines].join("\n");
  const blob = new Blob([csv], {type:"text/csv"});
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = "teams.csv";
  document.body.appendChild(a); a.click(); a.remove();
  URL.revokeObjectURL(url);
}

// Replace buildOrLoad to honor Static CSV Mode on first boot
const _buildOrLoad = buildOrLoad;
buildOrLoad = async function(){
  const saved = loadState();
  if (saved) {
    U = revive(saved);
    renderAll();
    return;
  }
  const useStatic = localStorage.getItem("cbbgm_static_csv_mode") === "1";
  if (useStatic) {
    const rows = await loadTeamsCSV();
    const seedInput = document.getElementById("seedInput");
    U = new Universe(rows, seedInput.value || "static-csv");
    saveState(U); renderAll();
  } else {
    // default behavior
    return _buildOrLoad();
  }
};

document.getElementById("exportTeamsBtn").addEventListener("click", () => {
  if (!U || !Array.isArray(U.teams) || U.teams.length === 0) {
    alert("No teams loaded yet. Load from Wikipedia or CSV first.");
    return;
  }
  exportTeamsCSV(U.teams);
});
