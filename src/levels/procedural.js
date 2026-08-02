// ============================================================================
//  levels/procedural.js — "NIGHTMARES MODE" (beta) — the procedural game mode.
//
//  A second, replayable mode: a run of TEN alternating stages that always cover
//  EVERY level kind (castle / lava cave / magic forest / carpet-flight — see
//  PROC_KINDS) followed by a FINAL BOSS (the castle's six-armed guardian OR the
//  Lava Knight, with much more energy). Two difficulties (NORMAL / EASY). The
//  whole run — difficulty, the kind sequence and how far you've got — persists
//  in localStorage so it can be continued after closing the game.
//
//  Rendering is reused wholesale by piggy-backing each theme onto its story
//  level number (castle→2, lava→5, forest→6): setting `level`/`plats`/etc. makes
//  drawPlats + drawBackgroundN + the enemy AI all "just work". engine.js routes
//  update/draw to updateProc/drawProc/drawProcOverlay when PROC.active, and
//  skips the story per-level pipelines. Loaded before engine.js; every shared
//  symbol resolves by name via the one top-level scope. See the plan file.
// ============================================================================
'use strict';

const PROC_SAVE_KEY = 'rots:proc';
const PROC_STAGES = 10;                 // number of themed stages before the boss
const PROC_THEMES = ['castle', 'lava', 'forest'];   // biome → level number mapping
// The master list of level KINDS the Nightmares sequence cycles through. Every
// run is guaranteed to include at least one of EACH kind (see procGenerateRun),
// and no two consecutive stages share a kind. THIS IS THE EXTENSION POINT: when a
// new level type is added, list it here (and give it a branch in initProcStage /
// buildProcGeometry) and it automatically joins the Nightmares rotation.
const PROC_KINDS = ['castle', 'lava', 'forest', 'flight'];
const PROC_FLOOR = 384;                 // shared with FLOOR3/FLOOR5/FLOOR6

const PROC = {
  active: false,
  difficulty: 'easy',        // 'easy' (5 HP/5 lives) | 'normal' (3 HP/3 lives)
  seed: 1,
  types: [],                 // length PROC_STAGES: one of PROC_KINDS
  bossType: 'castle',        // 'castle' | 'lava'
  index: 0,                  // 0..PROC_STAGES-1 = stages; PROC_STAGES = boss
  stageKind: 'castle',       // one of PROC_KINDS, or 'boss'
  theme: 'castle',           // biome for rendering: 'castle'|'lava'|'forest'
  plats: [], checkpoints: [], doorX: 0,
  lava: [],                  // molten pools filling gaps (lava theme) {x0,x1,y}
  skels: [], biters: [], sentinels: [],
  lives: 5,
  score: 0,                  // banked score from completed stages (+ bonuses)
  levelScore: 0,             // this stage's tentative score — lost on a full wipe
  stageT: 0, cleared: false, wonT: 0,
  gameOver: false, won: false,
  _hitSwing: false,
};

// score awards
const SCORE_SKELETON = 1000, SCORE_BITER = 500, SCORE_SENTINEL = 2000;
const SCORE_FLIGHT = 10000, SCORE_BOSS = 10000;
const SCORE_LIFE_LOST = 200;   // penalty deducted from the total per life spent
function procScore() { return Math.max(0, (PROC.score || 0) + (PROC.levelScore || 0)); }

// -------------------------------------------------------------- difficulty knobs
function procMaxLives() { return PROC.difficulty === 'easy' ? 5 : 3; }
// the hero's HP/lives run through the shared difficultyMaxHp()/difficultyMaxLives(),
// which key off `gameDifficulty` — map EASY→'easy' (5 HP/5 lives), NORMAL→'normal'
// (3 HP/3 lives). (We set the global directly, without disturbing the story save.)
function applyProcDifficulty() { gameDifficulty = (PROC.difficulty === 'easy') ? 'easy' : 'normal'; }
function procBossHP() { return PROC.difficulty === 'easy' ? 16 : 26; }
// foe count rises every level (progressively harder the deeper you go); heavily
// populated so the long stages feel dense with enemies
function procFoeCount() {
  const i = PROC.index;
  return PROC.difficulty === 'easy'
    ? Math.min(22, 6 + Math.floor(i * 1.8))
    : Math.min(30, 10 + Math.floor(i * 2.2));
}
function themeLevelNum(theme) { return theme === 'lava' ? 5 : (theme === 'forest' ? 6 : 2); }

// -------------------------------------------------------------- persistence
function saveProc() {
  try {
    localStorage.setItem(PROC_SAVE_KEY, JSON.stringify({
      v: 1, difficulty: PROC.difficulty, seed: PROC.seed,
      types: PROC.types, bossType: PROC.bossType, index: PROC.index,
      score: PROC.score || 0,
    }));
  } catch (e) {}
}
function loadProc() {
  try {
    const s = JSON.parse(localStorage.getItem(PROC_SAVE_KEY));
    if (!s || s.v !== 1 || !Array.isArray(s.types) || s.types.length !== PROC_STAGES) return null;
    if (!Number.isFinite(s.seed) || !Number.isFinite(s.index)) return null;
    return s;
  } catch (e) { return null; }
}
function hasProcSave() { return !!loadProc(); }
function clearProc() { try { localStorage.removeItem(PROC_SAVE_KEY); } catch (e) {} }

// -------------------------------------------------------------- run setup
function normalizeProcDiff(d) { return d === 'easy' ? 'easy' : 'normal'; }
// Build the 10-stage sequence: guaranteed to contain EVERY kind in PROC_KINDS
// (seeded with a shuffled full set), with no two consecutive stages alike.
function procGenerateRun(seed, diff) {
  PROC.seed = seed; PROC.difficulty = normalizeProcDiff(diff); PROC.index = 0;
  PROC.lives = procMaxLives();
  PROC.score = 0; PROC.levelScore = 0;
  const rng = love.math.newRandomGenerator(seed >>> 0);
  const bag = PROC_KINDS.slice();
  for (let i = bag.length - 1; i > 0; i--) {   // Fisher–Yates shuffle the full kind set
    const j = Math.floor(rng.random() * (i + 1));
    const tmp = bag[i]; bag[i] = bag[j]; bag[j] = tmp;
  }
  const types = bag.slice(0, Math.min(bag.length, PROC_STAGES));   // every kind appears once, up front
  let prev = types[types.length - 1];
  while (types.length < PROC_STAGES) {         // fill the rest, never repeating the previous kind
    const pool = PROC_KINDS.filter(function (k) { return k !== prev; });
    const k = pool[Math.floor(rng.random() * pool.length)];
    types.push(k); prev = k;
  }
  // never OPEN a run on the carpet flight — start on solid ground for a lead-in
  if (types[0] === 'flight') {
    for (let i = 1; i < types.length; i++) {
      if (types[i] !== 'flight') { types[0] = types[i]; types[i] = 'flight'; break; }
    }
  }
  PROC.types = types;
  PROC.bossType = rng.random() < 0.5 ? 'castle' : 'lava';
}

// the ambient "lonely" score is normally started by initLevel; Nightmares never
// calls initLevel, so kick it off here (it loops; procMusic rides its volume)
function startProcMusic() {
  if (musicSrc) { musicSrc.stop(); musicSrc.setVolume(0); musicSrc.play(); }
}

function startProceduralRun(diff) {
  const seed = (Math.floor(love.math.random() * 0x7fffffff) ^ Date.now()) >>> 0;
  procGenerateRun(seed, diff);
  PROC.active = true;
  PROC.gameOver = false; PROC.won = false;
  titleMenu.active = false; studio.active = false; cine.on = false;
  startProcMusic();
  initProcStage(0);
}

function continueProceduralRun() {
  const s = loadProc();
  if (!s) { startProceduralRun('normal'); return; }
  PROC.seed = s.seed; PROC.difficulty = normalizeProcDiff(s.difficulty);
  PROC.types = s.types; PROC.bossType = s.bossType === 'lava' ? 'lava' : 'castle';
  PROC.index = Math.max(0, Math.min(PROC_STAGES, s.index | 0));
  PROC.lives = procMaxLives();
  PROC.score = Number.isFinite(s.score) ? s.score : 0; PROC.levelScore = 0;
  PROC.active = true;
  PROC.gameOver = false; PROC.won = false;
  titleMenu.active = false; studio.active = false; cine.on = false;
  startProcMusic();
  initProcStage(PROC.index);
}

// Clear story level-state that the shared hero-draw / overlays peek at, so a
// previous stage's carpet / cutscene / game-over never leaks into the next one.
function procResetSharedState() {
  introT = 999;                       // no story intro fade / location card
  l5.carpet = null; l5.flight = null; l5.wake = { active: false, stage: 0, t: 0, rise: 0 };
  l5.end = { stage: 0, t: 0 }; l5.gameOver = false;
  l6.end = { stage: 0 }; l6.gameOver = false; if (l6.arrival) l6.arrival.active = false;
  l3.cutscene = false; l3.end = { stage: 0, t: 0 }; l3.gameOver = false;
  l2.endStage = 0; l2.gameOver = false;
}

// -------------------------------------------------------------- stage build
function initProcStage(index) {
  PROC.index = index;
  PROC.stageT = 0; PROC.cleared = false; PROC.gameOver = false; PROC._hitSwing = false;
  PROC.levelScore = 0;   // fresh stage: the tentative score starts at zero
  procResetSharedState();
  PROC.skels.length = 0; PROC.biters.length = 0; PROC.sentinels.length = 0; PROC.lava.length = 0;
  applyProcDifficulty();

  if (index >= PROC_STAGES) { initProcBoss(); return; }

  const kind = PROC.types[index];
  PROC.stageKind = kind;
  PROC.theme = (kind === 'flight') ? 'lava' : kind;
  level = themeLevelNum(PROC.theme);

  if (kind === 'flight') { setupFlightStage(); saveProc(); return; }

  buildProcGeometry(index, kind);
  plats = PROC.plats; checkpoints = PROC.checkpoints;
  respawn = { x: checkpoints[0].x, y: checkpoints[0].y };
  if (PROC.theme === 'lava') l5.lava = PROC.lava;   // let drawLava5() render our pools
  // the fire-sword's bullet list (l5.bullets on lava, l6.bullets in the wood)
  if (level === 6) l6.bullets = []; else l5.bullets = [];
  spawnProcEnemies(index, kind);
  spawnProcPlayer();
  saveProc();
}

// A themed linear run: 4–6 ground segments on the shared floor, separated by
// gaps (death pits, or lava pools on the lava theme), a few floating beam
// ledges, and a radiant exit door on the last segment.
function buildProcGeometry(index, kind) {
  const rng = love.math.newRandomGenerator((PROC.seed * 100 + index + 7) >>> 0);
  const F = PROC_FLOOR;
  const built = [];
  const cps = [];
  let px = -220;
  const segs = 8 + Math.floor(rng.random() * 5);   // 8..12 — roughly twice as long
  let lastGround = null;
  for (let s = 0; s < segs; s++) {
    const w = 380 + Math.floor(rng.random() * 360);
    const seg = { x: px, y: F, w: w, h: 1400 };
    built.push(seg); lastGround = seg;
    cps.push({ x: px + 70, y: F });
    if (s > 0 && rng.random() < 0.5) {   // a floating jump-ledge (kept within jump reach)
      const bw = 130 + Math.floor(rng.random() * 90);
      built.push({ x: px + Math.floor(w * 0.30), y: F - (70 + Math.floor(rng.random() * 42)), w: bw, h: 16, beam: true });
    }
    if (s < segs - 1) {
      // gaps stay comfortably jumpable: a running jump clears ~215px, so cap well under that
      const gap = 90 + Math.floor(rng.random() * 60);
      if (kind === 'lava') PROC.lava.push({ x0: px + w, x1: px + w + gap, y: 452 });
      px = px + w + gap;
    } else {
      px = px + w;
    }
  }
  // widen the final segment a touch and stand the door near its right edge
  lastGround.w += 200;
  PROC.doorX = lastGround.x + lastGround.w - 90;
  PROC.plats = built; PROC.checkpoints = cps;
}

function spawnProcEnemies(index, kind) {
  const rng = love.math.newRandomGenerator((PROC.seed * 100 + index + 31) >>> 0);
  const n = procFoeCount();
  const grounds = PROC.plats.filter(function (p) { return !p.beam; });
  for (let i = 0; i < n; i++) {
    const g = grounds[1 + Math.floor(rng.random() * Math.max(1, grounds.length - 1))] || grounds[grounds.length - 1];
    const ex = g.x + 40 + rng.random() * Math.max(20, g.w - 80);
    if (kind === 'forest') {
      const r = rng.random();
      const s = newSentinel(ex, g.x + 20, g.x + g.w - 20, r < 0.5 ? 'both' : (r < 0.75 ? 'melee' : 'ranged'));
      s.y = floorAt(ex, 0) || PROC_FLOOR;
      PROC.sentinels.push(s);
    } else if (rng.random() < 0.72) {
      const armed = PROC.difficulty === 'normal' || rng.random() < 0.6;
      const sk = newSkel(ex, g.x + 20, g.x + g.w - 20, armed);
      sk.y = floorAt(ex, 0) || PROC_FLOOR; sk.hits = 0;
      PROC.skels.push(sk);
    } else {
      PROC.biters.push(newBiter(ex, PROC_FLOOR - 120 - rng.random() * 80));
    }
  }
  // NORMAL always keeps at least one flying head about on non-forest stages
  if (PROC.difficulty === 'normal' && kind !== 'forest' && PROC.biters.length === 0) {
    const g = grounds[grounds.length - 1];
    PROC.biters.push(newBiter(g.x + g.w * 0.5, PROC_FLOOR - 140));
  }
}

function spawnProcPlayer() {
  const c = checkpoints[0];
  player = newPlayer(c.x, c.y);
  player.hp = difficultyMaxHp();
  player.hasSword = true; player.sheathed = false; player.swordIdle = 0; player.drawT = 0;
  player.started = true;
  // the Fire-Sword is carried from the very start on every biome, rechargeable
  // by holding BLOCK for one second (see updateFireCharge)
  player.lavaSword = true; player.lavaCharge = 3; player.blockHold = 0;
  // drop-resolve onto solid ground so the hero always starts standing
  for (let i = 0; i < 8 && !player.onGround; i++) { player.vy = 260; moveAndCollide(player, 1 / 60); }
  if (!player.onGround) { const fy = floorAt(player.x, player.y); if (fy != null) player.y = fy; }
  player.vy = 0; player.state = 'ground'; player.onGround = true; player.coyote = COYOTE;
  player.spawnFloor = player.y; player.safeX = player.x; player.safeY = player.y;
  player.initGrace = 0.5; player.startGuard = 0; player.l3SpawnLock = 0;
  resetScarf.apply(null, neckPos(player));
  cam.x = player.x + 70; cam.y = player.y - 130; cam.zoom = 1;
}

// -------------------------------------------------------------- carpet flight stage
// A magic-carpet flight over a lava river, exactly like Level 5's crossing:
// the auto-scrolling flight, swooping flying heads and rising lava bolts. Reuses
// the L5 flight subsystem (FL consts, updateFlightEnts, updateFireCharge,
// flightHurt, drawFlightEnts/Overlay) but owns the ending (→ next proc stage).
function setupFlightStage() {
  const F = PROC_FLOOR;
  PROC.plats = [{ x: -220, y: F, w: 900, h: 1400 }];
  plats = PROC.plats;
  PROC.checkpoints = [{ x: 120, y: F }]; checkpoints = PROC.checkpoints;
  respawn = { x: 120, y: F };
  PROC.lava.length = 0; PROC.doorX = 0;
  l5.lava = []; l5.balls = []; l5.bullets.length = 0;
  spawnProcPlayer();
  // hand the flight subsystem its lives + a fresh flight/carpet
  l5.lives = PROC.lives; l5.gameOver = false; l5.msg = ''; l5.msgT = 0;
  l5.wake = { active: false, stage: 0, t: 0, rise: 0 };
  l5.end = { stage: 0, t: 0 };
  const startX = player.x;
  const flightLen = 10800 + PROC.index * 520;   // ~twice as long; grows deeper in
  l5.flight = { active: true, phase: 'lift', t: 0, heads: [], upBolts: [],
    headCool: 1.2, boltCool: 1.0, startX: startX, y0: player.y, doorX: startX + flightLen, whiteA: 0 };
  l5.carpet = { x: player.x, y: player.y, t: 0, state: 'riding' };
  player.state = 'cine'; player.vx = 0; player.vy = 0; player.facing = 1;
  player.sheathed = false; player.swordIdle = 0;
  player.lavaSword = true; player.lavaCharge = 3;
  player.hp = difficultyMaxHp(); player.inv = 0.6; player.blockHold = 0;
}

function updateProcFlight(dt) {
  const f = l5.flight, p = player, cp = l5.carpet;
  f.t += dt; cp.t = (cp.t || 0) + dt;
  p.inv = Math.max(0, (p.inv || 0) - dt);
  p.blockFlash = Math.max(0, (p.blockFlash || 0) - dt);
  p.blockT = Math.max(0, (p.blockT || 0) - dt);
  p.atkT = Math.max(-1, (p.atkT || 0) - dt);
  p.drawT = Math.max(0, (p.drawT || 0) - dt);
  p.lavaCharge = p.lavaCharge || 0;
  updateScarf(dt); updateParticles(dt);
  procMusic(dt);

  if (f.phase === 'fall') { updateFlightFall(dt); PROC.lives = l5.lives; if (l5.gameOver) PROC.gameOver = true; return; }

  p.state = 'ground'; p.onGround = true; p.vx = 0; p.facing = 1;
  cp.x = p.x; cp.y = p.y;

  if (f.phase === 'lift') {
    const k = smooth(clamp(f.t / 1.3, 0, 1));
    p.y = lerp(f.y0, FL.ALT, k); p.x = f.startX + f.t * 140;
    cam.x = lerp(cam.x, p.x + 190, Math.min(1, dt * 3)); cam.y = lerp(cam.y, FL.CAMY, Math.min(1, dt * 3)); cam.zoom = 1;
    if (f.t > 1.3) { f.phase = 'run'; f.t = 0; }
    return;
  }
  if (f.phase === 'run') {
    updateFireCharge(p, dt);
    const up = keyUp(), down = keyDown(), left = keyLeft(), right = keyRight();
    let vy = 0; if (up) vy -= FL.VFLY; if (down) vy += FL.VFLY;
    p.y = clamp(p.y + vy * dt, FL.TOP, FL.BOT);
    let vx = FL.SCROLL; if (right) vx += FL.HFLY; if (left) vx -= FL.HFLY * 0.8;
    p.x += vx * dt;
    cam.x = lerp(cam.x, p.x + 190, Math.min(1, dt * 4)); cam.y = FL.CAMY; cam.zoom = 1;
    f.headCool -= dt;
    if (f.headCool <= 0) {
      f.headCool = (PROC.difficulty === 'normal' ? 0.5 : 0.7) + love.math.random() * 0.8;
      const hy = FL.TOP + 24 + love.math.random() * (FL.BOT - FL.TOP - 48);
      f.heads.push({ x: cam.x + VW * 0.60, y: hy, vx: -(135 + love.math.random() * 80),
        vy: (love.math.random() - 0.5) * 46, ph: love.math.random() * 6, t: 0,
        phase: love.math.random() * 6.28, state: 'chase', bite: 0, hurt: 0, dead: 0 });
    }
    f.boltCool -= dt;
    if (f.boltCool <= 0) {
      f.boltCool = (PROC.difficulty === 'normal' ? 0.4 : 0.5) + love.math.random() * 0.6;
      const bx = p.x + (love.math.random() - 0.3) * 340;
      f.upBolts.push({ x: bx, y: FL.RIVER, vx: (love.math.random() - 0.5) * 40, vy: -(255 + love.math.random() * 130), r: 7, t: 0 });
    }
    updateFlightEnts(dt);
    PROC.lives = l5.lives; if (l5.gameOver) { PROC.gameOver = true; return; }
    if (p.x >= f.doorX - 100) { f.phase = 'enter'; f.t = 0; }
    return;
  }
  if (f.phase === 'enter') {
    p.x += 150 * dt; p.y = lerp(p.y, FL.ALT - 10, Math.min(1, dt * 2));
    cam.x = lerp(cam.x, p.x + 190, Math.min(1, dt * 4)); cam.y = FL.CAMY;
    f.whiteA = Math.min(1, (f.whiteA || 0) + dt * 0.7);
    updateFlightEnts(dt);
    PROC.lives = l5.lives;
    if (f.t > 2.0) { f.active = false; procStageComplete(); }
    return;
  }
}

// -------------------------------------------------------------- boss stage
function initProcBoss() {
  PROC.stageKind = 'boss';
  PROC.doorX = 0;
  applyProcDifficulty();
  if (PROC.bossType === 'castle') {
    // the six-armed guardian, fought in a lit keep hall (level=2 rendering, so
    // the Black-Halls darkness never dims it). Reuses the l3.boss machinery.
    PROC.theme = 'castle'; level = 2;
    const F = FLOOR3;
    PROC.plats = [{ x: SALOON_L - 120, y: F, w: (SALOON_R - SALOON_L) + 480, h: 1600 }];
    plats = PROC.plats;
    PROC.checkpoints = [{ x: SALOON_L + 260, y: F }]; checkpoints = PROC.checkpoints;
    respawn = { x: SALOON_L + 260, y: F };
    l2.gates = []; l3.gates = [];
    l3.cutscene = false; l3.end = { stage: 0, t: 0 }; l3.gameOver = false;
    l3.flash = 0; l3.windPush = 0; l3.lives = PROC.lives; l3.boss = null;
    spawnBoss(); l3.boss.hp = procBossHP(); l3.boss.x = SALOON_L + 1000;
    spawnProcPlayer(); player.x = SALOON_L + 340; player.safeX = player.x;
    cam.x = player.x + 70; cam.y = player.y - 130;
  } else {
    // the mounted Lava Knight, given real energy so it can be defeated.
    PROC.theme = 'lava'; level = 5;
    const F = FLOOR5;
    PROC.plats = [{ x: KNIGHT_L - 320, y: F, w: (KNIGHT_R - KNIGHT_L) + 760, h: 1400 }];
    plats = PROC.plats;
    PROC.checkpoints = [{ x: KNIGHT_L - 120, y: F }]; checkpoints = PROC.checkpoints;
    respawn = { x: KNIGHT_L - 120, y: F };
    l5.gates = []; l5.gameOver = false; l5.lives = PROC.lives; l5.balls = []; l5.lava = [];
    l5.bullets.length = 0; l5.wake = { active: false, stage: 0, t: 0, rise: 0 }; l5.flight = null;
    l5.knight = { x: KNIGHT_R - 60, y: F, dir: -1, hp: procBossHP(), state: 'gallop',
      active: true, dead: false, deadT: 0, hitCool: 0, ph: 0, flash: 0, swing: 0,
      volley: 3, fireCool: 2.6, pauseT: 0, bolts: [] };
    spawnProcPlayer(); player.x = KNIGHT_L - 120; player.lavaSword = true; player.lavaCharge = 3;
    cam.x = player.x + 70; cam.y = player.y - 130;
  }
  PROC.stageT = 0;
  saveProc();
}

function updateProcBoss(dt) {
  const p = player;
  if (PROC.bossType === 'castle') {
    updateBoss(dt, p);
    const b = l3.boss;
    // hero Fire-Sword bullets wound the guardian (ranged option, like the caverns)
    const arr = l5.bullets;
    for (let i = arr.length - 1; i >= 0; i--) {
      const bu = arr[i]; bu.t += dt; bu.x += bu.vx * dt; bu.y += bu.vy * dt;
      let gone = bu.t > 1.7 || bu.x < cam.x - VW * 0.72 || bu.x > cam.x + VW * 0.72;
      if (b && !b.dead && b.hitCool <= 0 && Math.abs(bu.x - b.x) < 50 && bu.y > b.y - 172 && bu.y < b.y - 6) {
        procHurtGuardian(b, bu.vx >= 0 ? 1 : -1); gone = true;
      }
      if (gone) arr.splice(i, 1);
    }
    const au = 1 - (p.atkT || 0) / ATK_DUR;
    if ((p.atkT || 0) > 0 && au > 0.30 && au < 0.56) {
      const emp = (p.riposte || 0) > 0 && (p.riposteHits || 0) > 0;
      if (tryHitBoss(p, emp) && emp) p.riposteHits = Math.max(0, p.riposteHits - 1);
    }
    if (b && b.dead) { l3.cutscene = false; procWin(); }
  } else {
    updateKnight(dt, p);
    const k = l5.knight;
    // hero fire bullets wound the knight
    const arr = l5.bullets;
    for (let i = arr.length - 1; i >= 0; i--) {
      const bu = arr[i]; bu.t += dt; bu.x += bu.vx * dt; bu.y += bu.vy * dt;
      let gone = bu.t > 1.7 || bu.x > cam.x + VW * 0.7;
      if (k && !k.dead && Math.abs(bu.x - k.x) < 42 && bu.y > FLOOR5 - 104 && bu.y < FLOOR5 + 6) {
        procHurtKnight(k, bu.vx >= 0 ? 1 : -1); gone = true;
      }
      if (gone) arr.splice(i, 1);
    }
    // melee blade also wounds it up close
    const au = 1 - (p.atkT || 0) / ATK_DUR;
    if ((p.atkT || 0) > 0 && au > 0.30 && au < 0.56 && k && !k.dead && k.hitCool <= 0
      && Math.abs(p.x - k.x) < 64 && p.facing === (k.x < p.x ? -1 : 1)) {
      procHurtKnight(k, p.x >= k.x ? 1 : -1);
      p.vx = (p.x >= k.x ? 1 : -1) * 300;
    }
    if (k && k.dead && k.deadT > 0.5) procWin();
  }
}

function procHurtGuardian(b, dir) {
  b.hp -= 1; b.hitCool = 0.5; b.armSwing = 0.18;
  if (sfxHit) sfxHit.play(0.6, 0.7 + love.math.random() * 0.12);
  spawnDust(b.x + dir * 28, b.y - 82, 8, 1.0);
  if (b.hp <= 0) {
    b.dead = true; b.deadT = 0; b.active = false; b.swords.length = 0;
    for (let i = 0; i < 6; i++) b.arms[i] = true;
    if (sfxThunder) sfxThunder.play(0.4, 0.9);
  }
}

function procHurtKnight(k, dir) {
  k.hp -= 1; k.flash = 0.3; k.hitCool = 0.32;
  spawnLavaSplash(k.x, FLOOR5 - 50, 6);
  if (sfxHit) sfxHit.play(0.55, 0.8 + love.math.random() * 0.12);
  if (k.hp <= 0) {
    k.dead = true; k.deadT = 0; k.bolts.length = 0;
    spawnDust(k.x, FLOOR5, 18, 1.6); spawnLavaSplash(k.x, FLOOR5 - 30, 14);
    if (sfxThunder) sfxThunder.play(0.4, 0.8);
  }
}

// -------------------------------------------------------------- run flow
function procStageComplete() {
  // clearing a carpet-flight section is worth a bonus; then bank the level's score
  if (PROC.stageKind === 'flight') PROC.levelScore += SCORE_FLIGHT;
  PROC.score = Math.max(0, PROC.score + PROC.levelScore); PROC.levelScore = 0;   // safely banked
  PROC.index += 1;
  saveProc();
  initProcStage(PROC.index);   // PROC.index === PROC_STAGES routes to the boss
}

function procWin() {
  if (PROC.won) return;
  PROC.score = Math.max(0, PROC.score + PROC.levelScore + SCORE_BOSS); PROC.levelScore = 0;   // boss-fight bonus
  PROC.won = true; PROC.wonT = 0;
  clearProc();
  if (sfxParry) sfxParry.play(0.5, 1.2);
}

// -------------------------------------------------------------- per-frame update
function updateProc(dt) {
  PROC.stageT += dt; T = T + dt;

  if (PROC.won) { PROC.wonT += dt; updateScarf(dt); updateParticles(dt); return; }
  if (PROC.gameOver) { updateParticles(dt); return; }

  if (PROC.stageKind === 'flight') { updateProcFlight(dt); return; }

  updatePlayer(dt, player);
  updateScarf(dt);
  updateParticles(dt);
  updateCamera(dt, player);
  updateFireCharge(player, dt);   // Fire-Sword block/parry + recharge (all biomes)
  procMusic(dt);

  if (PROC.stageKind === 'boss') { updateProcBoss(dt); return; }

  updateProcEnemies(dt);
  updateProcBullets(dt);

  // lava pools kill on contact (the fiery sink death), like the caverns
  if (!player.dying) {
    for (const L of PROC.lava) {
      if (player.x > L.x0 && player.x < L.x1 && player.y >= L.y - 8) {
        player.lavaSink = L.y; killPlayer(player); break;
      }
    }
  }
  // reaching the door of light clears the stage
  if (!player.dying && PROC.doorX && player.x >= PROC.doorX - 40) procStageComplete();
}

function updateProcEnemies(dt) {
  const p = player;
  for (const sk of PROC.skels) { updateSkel(sk, dt, p); if (sk.burning) sk.burnT = (sk.burnT || 0) + dt; }
  for (const bt of PROC.biters) updateBiter(bt, dt, p);
  for (const s of PROC.sentinels) updateSentinel(s, dt, p);
  // score each foe once, the moment it dies (shoved into lava/hole, or burned)
  for (const sk of PROC.skels) if (!sk.scored && (sk.state === 'gone' || sk.state === 'pile')) { sk.scored = true; PROC.levelScore += SCORE_SKELETON; }
  for (const bt of PROC.biters) if (!bt.scored && bt.state === 'dead') { bt.scored = true; PROC.levelScore += SCORE_BITER; }
  for (const s of PROC.sentinels) if (!s.scored && s.state === 'dead') { s.scored = true; PROC.levelScore += SCORE_SENTINEL; }

  const au = 1 - (p.atkT || 0) / ATK_DUR;
  if ((p.atkT || 0) > 0 && au > 0.30 && au < 0.56) {
    const emp = (p.riposte || 0) > 0 && (p.riposteHits || 0) > 0;
    let didHit = false;
    for (const bt of PROC.biters) {
      if (bt.state === 'dead') continue;
      const dx = bt.x - p.x;
      if (dx * p.facing > 0 && Math.abs(dx) < 56 && Math.abs(bt.y - (p.y - 30)) < 52) {
        bt.state = 'dead'; bt.dead = 0; spawnDust(bt.x, bt.y, 7, 1.0); didHit = true;
      }
    }
    for (const sk of PROC.skels) {
      // the plain blade only STUNS + knocks skeletons back (like the story) — they
      // die only by being shoved into a lava pit or a hole, never from melee alone
      if (sk.state === 'pile' || sk.state === 'gone' || sk.state === 'fall' || sk.state === 'stun') continue;
      const dx = sk.x - p.x;
      if (dx * p.facing > 0 && Math.abs(dx) < 52 && Math.abs(sk.y - p.y) < 60) {
        sk.state = 'stun'; sk.t = 0; sk.vx = p.facing * (emp ? 540 : 260);
        spawnDust(sk.x - p.facing * 8, sk.y - 34, emp ? 9 : 4, emp ? 1.3 : 0.8);
        didHit = true;
      }
    }
    const box = { x1: Math.min(p.x, p.x + p.facing * 62), y1: p.y - 74, x2: Math.max(p.x, p.x + p.facing * 62), y2: p.y };
    for (const s of PROC.sentinels) {
      if (s.state === 'dead') continue;
      if (rectsOverlap(box, sentinelBox(s)) && damageSentinel(s, p.facing)) didHit = true;
    }
    if (didHit && !PROC._hitSwing) {
      if (sfxHit) sfxHit.play(emp ? 0.6 : 0.5, emp ? 0.8 : (0.9 + love.math.random() * 0.18));
      if (emp) p.riposteHits = Math.max(0, p.riposteHits - 1);
      PROC._hitSwing = true;
    }
  }
  if ((p.atkT || 0) <= 0) PROC._hitSwing = false;
}

// hero fire-sword lava bullets vs. the stage's foes (all biomes carry the fire-sword)
function updateProcBullets(dt) {
  const arr = (level === 6) ? l6.bullets : l5.bullets;
  for (let i = arr.length - 1; i >= 0; i--) {
    const bu = arr[i];
    bu.t += dt; bu.x += bu.vx * dt; bu.y += bu.vy * dt;
    let gone = bu.t > 1.7 || bu.x < cam.x - VW * 0.72 || bu.x > cam.x + VW * 0.72;
    for (const s of PROC.sentinels) {
      if (s.state === 'dead') continue;
      if (rectsOverlap({ x1: bu.x - 6, y1: bu.y - 6, x2: bu.x + 6, y2: bu.y + 6 }, sentinelBox(s))) {
        if (damageSentinel(s, bu.vx >= 0 ? 1 : -1, true)) { gone = true; spawnDust(bu.x, bu.y, 4, 0.7); }
      }
    }
    for (const bt of PROC.biters) {
      if (bt.state !== 'dead' && Math.abs(bu.x - bt.x) < 22 && Math.abs(bu.y - bt.y) < 22) {
        bt.state = 'dead'; bt.dead = 0; spawnDust(bt.x, bt.y, 6, 0.9); gone = true;
      }
    }
    for (const sk of PROC.skels) {
      // a Fire-Sword bullet KILLS the skeleton and sets it ablaze (it burns away)
      if (sk.state !== 'pile' && sk.state !== 'gone' && Math.abs(bu.x - sk.x) < 24 && Math.abs(bu.y - (sk.y - 24)) < 40) {
        sk.state = 'pile'; sk.armed = false; sk.burning = true; sk.burnT = 0;
        gone = true; spawnDust(bu.x, bu.y, 6, 0.9); spawnLavaSplash(sk.x, sk.y - 24, 9);
        if (sfxThunder) sfxThunder.play(0.24, 1.3);
      }
    }
    if (gone) arr.splice(i, 1);
  }
}

// -------------------------------------------------------------- music (light-touch)
// The first THREE depths (index 0,1,2) play the lonely ambient score; from the
// fourth depth on (and the boss) the Middle-Eastern battle theme takes over. Used
// for every stage kind, flight included. (musicSrc is started in startProc/continue.)
function procBattleStage() { return PROC.stageKind === 'boss' || PROC.index >= 3; }
function procMusic(dt) {
  windVol = lerp(windVol, 0, Math.min(1, dt * 2.5)); if (windSrc) windSrc.setVolume(windVol);
  const battleOn = procBattleStage();
  musicVol = lerp(musicVol, battleOn ? 0 : 0.36, Math.min(1, dt * (battleOn ? 1.4 : 0.6)));
  if (musicSrc) musicSrc.setVolume(musicVol);
  if (battleSrc) {
    if (battleOn && !bossWasFighting && battleSrc.rewind) battleSrc.rewind();
    bossWasFighting = battleOn;
    battleVol = lerp(battleVol, battleOn ? 0.55 : 0, Math.min(1, dt * 0.9));
    battleSrc.setVolume(battleVol);
  }
}

// -------------------------------------------------------------- draw (in-camera)
function drawProc() {
  if (PROC.stageKind === 'flight') {
    drawFlightEnts();
    for (const bu of l5.bullets) drawFireBullet6(bu);
    return;
  }
  if (PROC.theme === 'lava' && PROC.stageKind !== 'boss') drawLava5();

  if (PROC.stageKind === 'boss') {
    if (PROC.bossType === 'castle') {
      if (l3.boss) drawBoss();
      for (const bu of l5.bullets) drawFireBullet6(bu);
    } else if (l5.knight) {
      drawKnight5();
      for (const b of (l5.knight.bolts || [])) {
        lg.setColor(1.0, 0.4, 0.1, 0.28); lg.circle('fill', b.x, b.y, b.r * 1.7);
        lg.setColor(0.98, 0.5, 0.12, 1); lg.circle('fill', b.x, b.y, b.r);
        lg.setColor(1.0, 0.85, 0.4, 1); lg.circle('fill', b.x - b.r * 0.3, b.y - b.r * 0.3, b.r * 0.45);
      }
      for (const bu of l5.bullets) drawFireBullet6(bu);
    }
    return;
  }

  for (const sk of PROC.skels) drawSkel(sk);
  for (const bt of PROC.biters) drawBiter(bt);
  for (const s of PROC.sentinels) { drawSentinel(s); for (const b of s.bolts) drawSentinelBolt(b); }
  const arr = (level === 6) ? l6.bullets : l5.bullets;
  for (const bu of arr) drawFireBullet6(bu);
  if (PROC.doorX) drawDoorOfLight(PROC.doorX);
}

// -------------------------------------------------------------- HUD / overlay
const PROC_THEME_LABEL = { castle: 'THE  KEEP', lava: 'THE  LAVA  CAVERNS', forest: 'THE  ENCHANTED  WOOD' };
function drawProcHearts() {
  lg.setFont(FONT_HUD);
  for (let i = 1; i <= difficultyMaxHp(); i++) {
    const hx = 30 + (i - 1) * 36, hy = 32;
    const full = (player.hp || 0) >= i;
    if (full) lg.setColor(0.85, 0.16, 0.22, 1); else lg.setColor(0.25, 0.10, 0.13, 0.8);
    lg.circle('fill', hx - 5, hy - 3, 6.5); lg.circle('fill', hx + 5, hy - 3, 6.5);
    lg.polygon('fill', hx - 11, hy - 0.5, hx + 11, hy - 0.5, hx, hy + 12);
    lg.setColor(1, 1, 1, full ? 0.35 : 0.12); lg.circle('fill', hx - 6.5, hy - 5, 2);
  }
  lg.setColor(0.86, 0.83, 0.9, 0.9); lg.print('LIVES', 30, 52, 0, 0.85, 0.85);
  for (let i = 0; i < Math.max(0, PROC.lives || 0); i++) {
    const lx = 108 + i * 22, ly = 60;
    lg.setColor(0.55, 0.52, 0.66, 1); lg.polygon('fill', lx - 6, ly + 6, lx + 6, ly + 6, lx, ly - 3);
    lg.setColor(0.9, 0.87, 0.94, 1); lg.circle('fill', lx, ly - 4, 3.2);
  }
  // Fire-Sword charge (three lava bullets); a charging meter while BLOCK is held
  const p = player;
  if (p && p.lavaSword) {
    lg.setColor(1.0, 0.5, 0.15, 0.9); lg.print('FIRE-SWORD', 30, 78, 0, 0.85, 0.85);
    const charged = p.lavaCharge || 0;
    for (let i = 0; i < 3; i++) {
      const cx = 118 + i * 16, cy = 84;
      if (i < charged) { lg.setColor(1.0, 0.45, 0.12, 1); lg.circle('fill', cx, cy, 5); lg.setColor(1.0, 0.9, 0.5, 1); lg.circle('fill', cx - 1.4, cy - 1.4, 2); }
      else { lg.setColor(0.4, 0.2, 0.12, 0.7); lg.circle('line', cx, cy, 5); }
    }
    if ((p.blockHold || 0) > 0) {
      lg.setColor(0.3, 0.15, 0.08, 0.8); lg.rectangle('fill', 178, 80, 90, 5);
      lg.setColor(1.0, 0.6, 0.15, 1); lg.rectangle('fill', 178, 80, 90 * clamp(p.blockHold / CHARGE_TIME, 0, 1), 5);
    } else {
      lg.setColor(0.85, 0.7, 0.6, 0.6); lg.print(charged > 0 ? 'ATTACK fire · BLOCK parry / hold 1s recharge' : 'BLOCK parry · hold 1s to recharge', 178, 76, 0, 0.78, 0.78);
    }
  }
}

function drawProcOverlay() {
  // fade to black as the hero dies (before the respawn / game-over)
  const black = player ? (player.deadFade || 0) : 0;
  if (black > 0) { lg.setColor(0, 0, 0, black); lg.rectangle('fill', 0, 0, VW, VH); }

  if (PROC.stageKind === 'flight') {
    if (l5.flight) drawFlightOverlay();
  } else {
    drawProcHearts();
    // boss energy bar
    if (PROC.stageKind === 'boss') {
      const alive = PROC.bossType === 'castle' ? (l3.boss && !l3.boss.dead) : (l5.knight && !l5.knight.dead);
      if (alive) {
        const hp = PROC.bossType === 'castle' ? l3.boss.hp : l5.knight.hp;
        lg.setFont(FONT_HUD);
        lg.setColor(0.9, 0.3, 0.25, 0.95);
        const gm = PROC.bossType === 'castle' ? 'THE  GUARDIAN' : 'THE  LAVA  KNIGHT';
        lg.print(gm, VW / 2 - FONT_HUD.getWidth(gm) / 2, 22);
        const bw = 360, bx = VW / 2 - bw / 2, by = 42;
        lg.setColor(0.2, 0.06, 0.06, 0.8); lg.rectangle('fill', bx, by, bw, 10);
        lg.setColor(0.85, 0.20, 0.18, 1); lg.rectangle('fill', bx, by, bw * clamp(hp / procBossHP(), 0, 1), 10);
        lg.setColor(1, 0.8, 0.5, 0.5); lg.rectangle('fill', bx, by, bw, 2);
      }
    }
  }

  // running score, top-right (banked stages + this stage's tentative points)
  lg.setFont(FONT_HUD);
  const st = 'SCORE  ' + procScore();
  lg.setColor(0.96, 0.90, 0.66, 0.95);
  lg.print(st, VW - 30 - FONT_HUD.getWidth(st), 30);

  // stage banner: "CASTLE · DEPTH 3 / 10" fading in at the start of each stage
  let a = 0;
  if (PROC.stageT > 0.4 && PROC.stageT < 4.6) a = Math.min((PROC.stageT - 0.4) / 1.0, 1) * Math.min((4.6 - PROC.stageT) / 1.0, 1);
  if (a > 0 && FONT_LOC) {
    lg.setFont(FONT_LOC);
    lg.setColor(0.94, 0.90, 0.84, a);
    const label = PROC.stageKind === 'boss' ? 'THE  FINAL  GUARDIAN'
      : (PROC.stageKind === 'flight' ? 'ACROSS  THE  RIVER  OF  FIRE'
        : (PROC_THEME_LABEL[PROC.theme] + '   ·   DEPTH  ' + (PROC.index + 1) + ' / ' + PROC_STAGES));
    printSpaced(label, VW / 2, VH * 0.16, FONT_LOC, 4, 1);
  }

  if (PROC.gameOver) {
    lg.setColor(0.03, 0.0, 0.02, 0.9); lg.rectangle('fill', 0, 0, VW, VH);
    lg.setFont(FONT_SUB); lg.setColor(0.72, 0.12, 0.14, 1);
    printSpaced('GAME  OVER', VW / 2, VH / 2 - 36, FONT_SUB, 6, 1);
    lg.setFont(FONT_HUD); lg.setColor(0.86, 0.82, 0.9, 0.9);
    printSpaced('SCORE  ' + PROC.score + '  ·  this depth lost', VW / 2, VH / 2 + 2, FONT_HUD, 3, 1);
    lg.setColor(0.9, 0.86, 0.82, 0.9);
    const m = 'Press  R  to  retry  this  depth  ·  ESC  to  quit';
    lg.print(m, VW / 2 - FONT_HUD.getWidth(m) / 2, VH / 2 + 30);
  }
  if (PROC.won) {
    const fade = smooth(clamp(PROC.wonT / 1.4, 0, 1));
    lg.setColor(0.02, 0.02, 0.04, 0.92 * fade); lg.rectangle('fill', 0, 0, VW, VH);
    if (FONT_SUB) {
      lg.setFont(FONT_SUB); lg.setColor(0.94, 0.89, 0.78, fade);
      printSpaced('THE  NIGHTMARE  IS  CONQUERED', VW / 2, VH / 2 - 30, FONT_SUB, 5, 1);
      lg.setColor(0.80, 0.78, 0.86, fade * 0.9);
      printSpaced('TEN  DEPTHS  ·  ' + PROC.difficulty.toUpperCase() + '  ·  A  BOSS  FELLED', VW / 2, VH / 2 + 6, FONT_HUD, 3, 1);
      lg.setColor(0.96, 0.90, 0.66, fade);
      printSpaced('FINAL  SCORE  ' + PROC.score, VW / 2, VH / 2 + 26, FONT_HUD, 3, 1);
      if (PROC.wonT > 2.0) {
        lg.setColor(0.9, 0.85, 0.8, 0.4 + 0.4 * (0.5 + 0.5 * Math.sin(T * 3)));
        const m = 'Press  ENTER  to  return  to  the  title';
        lg.print(m, VW / 2 - FONT_HUD.getWidth(m) / 2, VH / 2 + 44);
      }
    }
  }
}

// keypressed while a Nightmares run is being played; returns true if consumed
function procGameKey(key) {
  if (PROC.won) {
    if (key === 'return' || key === 'space' || key === 'z' || key === 'k' || key === 'x') {
      PROC.active = false; PROC.won = false;
      // stop the battle theme so it doesn't drone over the title / the next game
      battleVol = 0; bossWasFighting = false;
      if (battleSrc) battleSrc.setVolume(0);
      // hand back to the title screen (or the studio card for a clean state)
      titleMenu.active = true; titleMenu.sel = 0;
      titleMenu.savedLevel = loadProgress(); titleMenu.savedDifficulty = gameDifficulty; titleMenu.t = 0;
      rebuildTitleMenu();
    }
    return true;
  }
  if (PROC.gameOver) {
    if (key === 'r') { PROC.gameOver = false; PROC.lives = procMaxLives(); initProcStage(PROC.index); }
    return true;
  }
  if (key === 'r') { initProcStage(PROC.index); return true; }
  return false;   // let the shared sword/jump/block handlers run
}
