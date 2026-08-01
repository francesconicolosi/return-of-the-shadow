// ============================================================================
//  levels/level6.js — Level 6 "The Enchanted Wood": state, logic and scenario.
//
//  The King emerges from the realm of light onto the far shore of a deep magic
//  forest. He arrives on the freed carpet, drops into a mossy glade, and the
//  Witch appears one last time to try to turn him back. Beyond lie waterfalls
//  and a stepping-stone stream, tall climb-over trees used as vertical
//  platforms, antlered Forest Sentinels (enemies-l6.js), and pressure stones
//  that open vine gates. At the far end a small firelit hut ("capanna") waits —
//  he steps inside. TO BE CONTINUED.
//
//  Resolves shared helpers (lerp/clamp/smooth/T, drawFlyingCarpet, drawSubtitle,
//  drawEmblem, the Fire-Sword charge, floorAt, hurtPlayer…) via the top-level
//  scope. See plans/modularization-refactor.md.
// ============================================================================
'use strict';

const l6 = {
  sentinels: [], biters: [], buttons: [], gates: [], bridges: [], bullets: [], fireflies: [], souls: [],
  key: null,
  lives: 3, gameOver: false, msg: '', msgT: 0,
  arrival: null, carpet: null, witch: null,
  dialog: null, dialogQueue: [],
  end: { stage: 0, t: 0 },
  hints: {}, capannaNear: false, _hitThisSwing: false,
};
function l6toast(s) { l6.msg = s; l6.msgT = 3.4; }

// -------------------------------------------------------------- setup
function initEnts6() {
  // antlered Forest Sentinels — four blows each. All hold GROUND clearings (the
  // canopy limbs float, so sentinels can't stand on them).
  l6.sentinels = [
    newSentinel(1650, 1450, 1880, 'both'),   // S1
    newSentinel(2250, 2050, 2440, 'both'),   // S1 — a second, past gate A
    newSentinel(4600, 4380, 4860, 'both'),   // S2a
    newSentinel(5600, 5400, 5900, 'both'),   // S2b
    newSentinel(7950, 7720, 8280, 'both'),   // S3a
    newSentinel(9100, 8790, 9320, 'both'),   // S3b
    newSentinel(11150, 10870, 11700, 'both'),// giant-tree foot
    newSentinel(11700, 11400, 12300, 'both'),// giant-tree foot — the last stand
  ];
  for (const s of l6.sentinels) s.y = floorAt(s.x, 0) || FLOOR6;

  // the two BURN-THE-LIANA drawbridges. Each closes in TWO stages: burning the
  // first two lianas drops the NEAR half; the third liana drops the FAR half, and
  // only then can the whole span be crossed.
  function bridge(x0, x1, lianaXs) {
    return { x0: x0, x1: x1, y: FLOOR6, leftT: 0, rightT: 0, hinted: false,
      lianas: lianaXs.map(function (lx) { return { x: lx, burned: false, burnT: 0 }; }) };
  }
  l6.bridges = [
    bridge(4900, 5340, [4990, 5120, 5250]),
    bridge(8310, 8750, [8400, 8530, 8660]),
  ];

  // pressure stones (latch when stepped on) → vine gates
  l6.buttons = [
    { x: 1355, y: 230, w: 54, gate: 'A', pressed: false },       // on TREE 1's top
    { x: 4500, y: FLOOR6, w: 54, gate: 'B', pressed: false },    // S2a
    { x: 5650, y: FLOOR6, w: 54, gate: 'B', pressed: false },    // S2b (both open gate B — cross the bridge to reach it)
    { x: 6810, y: CANOPY6B, w: 54, gate: 'C', pressed: false },  // on a CANOPY #2 limb (opens the summit gate)
    { x: 7950, y: FLOOR6, w: 54, gate: 'D', pressed: false },    // S3a
    { x: 9050, y: FLOOR6, w: 54, gate: 'D', pressed: false },    // S3b (both open gate D)
  ];
  l6.gates = [
    { id: 'A', x: 1930, w: 22, yTop: 40, yBot: FLOOR6, openT: 0, open: false, locked: true },
    { id: 'B', x: 5880, w: 22, yTop: 40, yBot: FLOOR6, openT: 0, open: false, locked: true },
    { id: 'D', x: 9300, w: 22, yTop: 40, yBot: FLOOR6, openT: 0, open: false, locked: true },
    { id: 'C', x: 13100, w: 22, yTop: 20, yBot: CAPANNA_Y, openT: 0, open: false, locked: true },
  ];
  l6.bullets = [];

  // flying heads — MOST rise from the soul-rivers (hostile souls); `wy` marks the
  // water surface they were born from, so a killed one can rise again from it.
  function waterHead(x) { const b = newBiter(x, 452); b.fromWater = true; b.wy = 470; b.birth = 0.6; b.y = 500; b.hy = 430 + love.math.random() * 26; return b; }
  l6.biters = [
    waterHead(3050), waterHead(3550), waterHead(3900),   // ravine 1
    waterHead(5100),                                     // over bridge 1
    waterHead(6500), waterHead(7150),                    // ravine 2
    waterHead(8530),                                     // over bridge 2
    waterHead(9800), waterHead(10300),                   // ravine 3
    newBiter(11300, 100), newBiter(11400, -110), newBiter(11350, -260),  // the giant tree
  ];
  // the door KEY, on the top branch of the GIANT TREE, CAGED by lianas that must
  // be burnt with fire before it can be taken
  l6.key = { x: 11375, y: -326, taken: false,
    lianas: [{ x: 11335, burned: false, burnT: 0 }, { x: 11375, burned: false, burnT: 0 }, { x: 11415, burned: false, burnT: 0 }] };

  // ghostly SOULS swimming in the glowing rivers
  l6.souls = [];
  const srng = love.math.newRandomGenerator(919);
  for (const g of STREAM6.gaps) {
    const n = Math.max(4, Math.floor((g[1] - g[0]) / 340));
    for (let i = 0; i < n; i++) {
      l6.souls.push({ x0: g[0] + 30, x1: g[1] - 30, x: g[0] + 30 + srng.random() * (g[1] - g[0] - 60),
        y: STREAM6.y + 24 + srng.random() * 130, vx: (srng.random() < 0.5 ? -1 : 1) * (18 + srng.random() * 26),
        ph: srng.random() * 6.28, bob: 6 + srng.random() * 8 });
    }
  }

  // drifting fireflies spread across the wood
  l6.fireflies = [];
  const frng = love.math.newRandomGenerator(6061);
  for (let i = 0; i < 150; i++) {
    l6.fireflies.push({ x: -400 + frng.random() * 14400, y: -340 + frng.random() * 760,
      ph: frng.random() * 6.28, sp: 0.4 + frng.random() * 0.8 });
  }

  l6.lives = difficultyMaxLives(); l6.gameOver = false; l6.msg = ''; l6.msgT = 0;
  l6.dialog = null; l6.dialogQueue = [];
  l6.end = { stage: 0, t: 0 }; l6.hints = {}; l6.capannaNear = false; l6._hitThisSwing = false;
  l6.witch = null;
}

// -------------------------------------------------------------- arrival cutscene
function startArrival6() {
  l6.arrival = { active: true, phase: 'fly', t: 0 };
  l6.carpet = { x: -440, y: 130, gone: false };
  const p = player;
  p.state = 'cine'; p.facing = 1; p.vx = 0; p.vy = 0;
  p.x = -440; p.y = 130;
  p.sheathed = true; p.swordIdle = 6;   // the blade rides sheathed on his back
}

function queueWitchDialog() {
  l6.dialogQueue = [
    { who: 'WITCH', text: 'Why have you come so far, little king? The one you seek is not here. Your family’s debt is paid — the ledger burned, your chains struck off. You are free. Turn back.', dur: 6.5 },
    { who: 'HERO',  text: 'You call it freedom, and yet you left the cage open only because you made the whole world its bars. I will find her soul — wherever you have buried it — and carry her home.', dur: 6.5 },
    { who: 'WITCH', text: 'Her soul lies beyond your reach. But walk on, stubborn king. These woods keep something else for you — something that still remembers your name.', dur: 6.0 },
  ];
}

function advanceDialog6(dt) {
  if (l6.dialog) { l6.dialog.t += dt; if (l6.dialog.t >= l6.dialog.dur) l6.dialog = null; }
  if (!l6.dialog && l6.dialogQueue.length) l6.dialog = Object.assign({ t: 0 }, l6.dialogQueue.shift());
}

function updateArrival6(dt) {
  const a = l6.arrival, p = player, cp = l6.carpet;
  a.t += dt;
  p.vx = 0; p.vy = 0;

  if (a.phase === 'fly') {
    const k = smooth(clamp(a.t / 3.0, 0, 1));
    p.x = lerp(-440, 320, k);
    p.y = lerp(130, FLOOR6 - 64, k);
    p.facing = 1; p.state = 'cine';
    cp.x = p.x; cp.y = p.y + 74;
    cam.x = lerp(cam.x, p.x + 80, Math.min(1, dt * 2.4));
    cam.y = lerp(cam.y, FLOOR6 - 150, Math.min(1, dt * 2.4)); cam.zoom = 1;
    if (a.t > 3.0) { a.phase = 'hop'; a.t = 0; }
  } else if (a.phase === 'hop') {
    const k = clamp(a.t / 0.7, 0, 1);
    p.x = lerp(320, 300, k);
    p.y = lerp(FLOOR6 - 64, FLOOR6, k) - Math.sin(k * Math.PI) * 46;
    p.facing = 1; p.state = 'air';
    cp.x = 320; cp.y = FLOOR6 - 64 + 74;
    cam.x = lerp(cam.x, p.x + 70, Math.min(1, dt * 3));
    cam.y = lerp(cam.y, FLOOR6 - 140, Math.min(1, dt * 3));
    if (k >= 1) { p.y = FLOOR6; p.state = 'ground'; a.phase = 'away'; a.t = 0; }
  } else if (a.phase === 'away') {
    p.state = 'ground'; p.y = FLOOR6; p.vx = 0; p.facing = 1;
    cp.x += 130 * dt; cp.y -= 78 * dt;
    if (a.t > 1.7) {
      cp.gone = true; a.phase = 'witch'; a.t = 0;
      l6.witch = { x: 620, y: FLOOR6, appear: 0, leave: 0, gone: false };
      queueWitchDialog();
    }
  } else if (a.phase === 'witch') {
    p.state = 'ground'; p.y = FLOOR6; p.vx = 0; p.facing = 1;
    l6.witch.appear = Math.min(1, l6.witch.appear + dt * 1.2);
    cam.x = lerp(cam.x, (p.x + l6.witch.x) / 2 + 30, Math.min(1, dt * 2));
    cam.y = lerp(cam.y, FLOOR6 - 150, Math.min(1, dt * 2));
    advanceDialog6(dt);
    if (!l6.dialog && l6.dialogQueue.length === 0) {
      l6.witch.leave = Math.min(1, l6.witch.leave + dt * 1.4);
      if (l6.witch.leave >= 1) {
        l6.witch.gone = true; l6.arrival.active = false;
        // the King draws his blade and the hunt begins
        p.state = 'ground'; p.sheathed = false; p.swordIdle = 0; p.drawT = DRAW_DUR;
        l6toast('The wood watches. Press on.');
      }
    }
  }
}

// -------------------------------------------------------------- gates / buttons
function recomputeGates6() {
  for (const g of l6.gates) {
    let any = false, all = true;
    for (const b of l6.buttons) if (b.gate === g.id) { any = true; if (!b.pressed) all = false; }
    if (any && all) { g.open = true; g.locked = false; }
  }
}
function gatePressMsg(id) {
  const g = l6.gates.find(function (x) { return x.id === id; });
  if (g && g.open) return 'The vines unknot and draw back — the way is open';
  return 'A pressure stone sinks with a green light — somewhere a gate stirs';
}

// -------------------------------------------------------------- ending
function startEnd6() {
  l6.end.stage = 1; l6.end.t = 0;
  player.state = 'cine'; player.vx = 0;
  l6.capannaNear = false;
}
function updateEnd6(dt) {
  const p = player, e = l6.end;
  e.t += dt;
  if (e.stage === 1) {
    p.state = 'ground'; p.onGround = true; p.vy = 0; p.facing = 1; p.vx = 30;
    p.x = lerp(p.x, CAPANNA_X + 4, Math.min(1, dt * 2.0));
    cam.x = lerp(cam.x, CAPANNA_X + 16, Math.min(1, dt * 2));
    cam.y = lerp(cam.y, CAPANNA_Y - 110, Math.min(1, dt * 2));
    if (e.t > 2.0) { e.stage = 2; e.t = 0; }
  }
}

// drift the floating platforms and carry any hero riding one (called from the
// engine BEFORE updatePlayer so collisions use the new positions)
function updateMovingPlats6() {
  const p = player;
  for (const pl of plats) {
    if (!pl.mv) continue;
    const nx = pl.bx + Math.sin(T * pl.mv.sp + pl.mv.ph) * pl.mv.ax;
    const ny = pl.by + Math.sin(T * pl.mv.sp * 0.85 + pl.mv.ph + 1.7) * pl.mv.ay;
    if (p && !p.dying && (p.onGround || p.onBeam) && p.x > pl.x - 12 && p.x < pl.x + pl.w + 12 && Math.abs(p.y - pl.y) < 8) {
      p.x += nx - pl.x; p.y += ny - pl.y;
    }
    pl.x = nx; pl.y = ny;
  }
}

// -------------------------------------------------------------- per-frame logic
function updateEnts6(dt) {
  const p = player;
  l6.msgT = Math.max(0, l6.msgT - dt);
  updateFireCharge(p, dt);   // the Fire-Sword recharge (generalized to L6)

  // souls drifting in the glowing rivers
  for (const so of l6.souls) {
    so.x += so.vx * dt;
    if (so.x < so.x0) { so.x = so.x0; so.vx = Math.abs(so.vx); }
    else if (so.x > so.x1) { so.x = so.x1; so.vx = -Math.abs(so.vx); }
  }

  // sentinels + flying heads
  for (const s of l6.sentinels) updateSentinel(s, dt, p);
  for (const bt of l6.biters) updateBiter(bt, dt, p);

  // hero sword swing — same active window as Levels 2/3/5
  const au = 1 - (p.atkT || 0) / ATK_DUR;
  if ((p.atkT || 0) > 0 && au > 0.30 && au < 0.56) {
    const box = heroSwordHitBox(p);
    for (const s of l6.sentinels) {
      if (s.state === 'dead') continue;
      if (rectsOverlap(box, sentinelBox(s)) && damageSentinel(s, p.facing)) l6._hitThisSwing = true;
    }
    for (const bt of l6.biters) {   // the blade also cuts down flying heads
      if (bt.state === 'dead') continue;
      const dx = bt.x - p.x;
      if (dx * p.facing > 0 && Math.abs(dx) < 60 && Math.abs(bt.y - (p.y - 30)) < 54) {
        bt.state = 'dead'; bt.dead = 0; spawnDust(bt.x, bt.y, 7, 1.0); l6._hitThisSwing = true;
      }
    }
  }
  if ((p.atkT || 0) <= 0) l6._hitThisSwing = false;

  // hero Fire-Sword lava bullets (a kill by fire sets the sentinel ablaze)
  for (let i = l6.bullets.length - 1; i >= 0; i--) {
    const bu = l6.bullets[i];
    bu.t += dt; bu.x += bu.vx * dt; bu.y += bu.vy * dt;
    let gone = bu.t > 1.7 || bu.x < cam.x - VW * 0.72 || bu.x > cam.x + VW * 0.72;
    for (const s of l6.sentinels) {
      if (s.state === 'dead') continue;
      if (rectsOverlap({ x1: bu.x - 6, y1: bu.y - 6, x2: bu.x + 6, y2: bu.y + 6 }, sentinelBox(s))) {
        if (damageSentinel(s, (bu.vx >= 0) ? 1 : -1, true)) { gone = true; spawnDust(bu.x, bu.y, 4, 0.7); }
      }
    }
    for (const bt of l6.biters) {
      if (bt.state !== 'dead' && Math.abs(bu.x - bt.x) < 22 && Math.abs(bu.y - bt.y) < 22) {
        bt.state = 'dead'; bt.dead = 0; spawnDust(bt.x, bt.y, 6, 0.9); gone = true;
      }
    }
    // fire burns the drawbridge lianas (a bullet passing through a liana)
    for (const br of l6.bridges) {
      if (br.rightT >= 1) continue;
      for (const li of br.lianas) {
        if (!li.burned && Math.abs(bu.x - li.x) < 15 && bu.y > 70 && bu.y < FLOOR6 + 4) {
          li.burned = true; li.burnT = 0; gone = true;
          spawnDust(li.x, bu.y, 7, 1.1); spawnLavaSplash(li.x, bu.y, 5);
          if (sfxHit) sfxHit.play(0.5, 0.6);
        }
      }
    }
    // fire burns the lianas caging the key at the top of the giant tree
    if (l6.key && l6.key.lianas) {
      for (const li of l6.key.lianas) {
        if (!li.burned && Math.abs(bu.x - li.x) < 15 && bu.y > l6.key.y - 34 && bu.y < l6.key.y + 46) {
          li.burned = true; li.burnT = 0; gone = true;
          spawnDust(li.x, bu.y, 7, 1.1); spawnLavaSplash(li.x, bu.y, 5);
          if (sfxHit) sfxHit.play(0.5, 0.6);
        }
      }
    }
    if (gone) l6.bullets.splice(i, 1);
  }

  // drawbridges close in TWO stages: the first two lianas drop the NEAR half, the
  // third drops the FAR half — only a whole span can be crossed
  for (const br of l6.bridges) {
    for (const li of br.lianas) if (li.burned) li.burnT += dt;
    const near2 = br.lianas[0].burned && br.lianas[1].burned;
    const all3 = near2 && br.lianas[2].burned;
    if (near2) br.leftT = Math.min(1, br.leftT + dt * 0.8);
    if (all3) br.rightT = Math.min(1, br.rightT + dt * 0.8);
    if (near2 && !br._leftDone && br.leftT >= 1) { br._leftDone = true; l6toast('The near half of the bridge drops — one liana still holds the far half'); }
    if (all3 && !br._done && br.rightT >= 1) { br._done = true; if (sfxThunder) sfxThunder.play(0.4, 0.8); l6toast('The bridge is whole — cross while it holds'); }
    if (!all3 && !br.hinted && p.onGround && p.x > br.x0 - 96 && p.x < br.x0 + 24) {
      br.hinted = true; l6toast('The bridge is drawn up, lashed by three living lianas — burn them all with the Fire-Sword!');
    }
  }

  // the KEY, caged behind lianas on the giant tree's top branch — burn them first
  const k = l6.key;
  if (k && !k.taken) {
    const caged = k.lianas && k.lianas.some(function (li) { return !li.burned; });
    if (Math.abs(p.x - k.x) < 40 && Math.abs(p.y - (k.y + 14)) < 34) {
      if (!caged) {
        k.taken = true;
        if (sfxParry) sfxParry.play(0.5, 1.4);
        spawnDust(k.x, k.y, 8, 1.0);
        l6toast('The iron key!  Now the hut on the summit can be opened');
      } else if (!l6.hints.keyCage) {
        l6.hints.keyCage = true;
        l6toast('The key is caged by lianas — burn them away with the Fire-Sword');
      }
    }
  }

  // hostile souls: a flying head killed over a river rises again from the water
  for (const bt of l6.biters) {
    if (bt.fromWater && bt.state === 'dead') {
      bt.reviveT = (bt.reviveT || 0) + dt;
      if (bt.reviveT > 5) {
        bt.reviveT = 0; bt.state = 'hover'; bt.dead = 0; bt.hurt = 0; bt.bite = 0; bt.cool = 0;
        bt.x = bt.hx; bt.y = bt.wy + 40; bt.vx = 0; bt.vy = 0;
      }
    }
  }

  // pressure stones latch and feed the vine gates
  for (const b of l6.buttons) {
    if (b.pressed) continue;
    const on = p.onGround && Math.abs(p.x - b.x) < b.w * 0.5 + 10 && Math.abs(p.y - b.y) < 16;
    if (on) {
      b.pressed = true; recomputeGates6();
      if (sfxHit) sfxHit.play(0.5, 0.7);
      spawnDust(b.x, b.y - 6, 6, 0.8);
      l6toast(gatePressMsg(b.gate));
    }
  }
  for (const g of l6.gates) g.openT = clamp(g.openT + (g.open ? 1 : -1) * dt * 1.6, 0, 1);
  for (const g of l6.gates) {
    if (!g.open && Math.abs(p.x - g.x) < 60 && p.onGround && !l6.hints[g.id]) {
      l6.hints[g.id] = true;
      l6toast('A wall of living vines, shut fast — find the pressure stone that feeds it');
    }
  }

  // the hut at the end of the wood — needs the key; prompt, then step inside
  const dxc = Math.abs(p.x - CAPANNA_X);
  l6.capannaNear = (dxc < 62 && p.onGround && l6.end.stage === 0 && !(l6.arrival && l6.arrival.active));
  if (l6.capannaNear && keyUp()) {
    if (l6.key && l6.key.taken) startEnd6();
    else if (!l6.hints.capLock) { l6.hints.capLock = true; l6toast('The door is locked — the key is hidden high in the branches back down the hill'); }
  }
}

// -------------------------------------------------------------- scenery draws
// tree trunks + forest ground are rendered in drawPlats() (level===6 branch).

// A large STRAIGHT waterfall: a solid blue column with dense vertical striping,
// a white foam crest and a foaming base pool. Works in whatever coordinate space
// is active. `w` is its width; falls read as thick sheets, not thin lines.
function drawCascade(cx, top, bot, w, near) {
  const H = Math.max(1, bot - top);
  const x0 = cx - w / 2;
  // solid blue body (a straight column)
  lg.setColor(0.16, 0.40, 0.80, near ? 0.7 : 0.34); lg.rectangle('fill', x0, top, w, H);
  // brighter inner core
  lg.setColor(0.36, 0.62, 0.94, near ? 0.5 : 0.24); lg.rectangle('fill', cx - w * 0.28, top, w * 0.56, H);
  // dense scrolling vertical strands (bright light-blue striping)
  const nS = Math.max(5, Math.floor(w / 5));
  for (let k = 0; k < nS; k++) {
    const x = x0 + 2 + (k + 0.5) * (w - 4) / nS;
    for (let d = 0; d < H; d += (near ? 26 : 36)) {
      const yy = top + (((d + T * (near ? 320 : 200) + k * 29) % H) + H) % H;
      lg.setColor(0.74, 0.92, 1.0, (near ? 0.6 : 0.3) * (0.4 + 0.4 * Math.sin(k * 1.3 + T)));
      lg.rectangle('fill', x - 0.9, yy, 1.8, near ? 12 : 8);
    }
  }
  // darker seams between the strands (gives the ribbed water look)
  lg.setColor(0.10, 0.26, 0.6, near ? 0.4 : 0.2);
  for (let k = 1; k < nS; k += 2) { const x = x0 + k * (w) / nS; lg.rectangle('fill', x, top, 1.2, H); }
  // white foam crest at the lip
  lg.setColor(0.97, 1.0, 1.0, near ? 0.95 : 0.55); lg.ellipse('fill', cx, top + 3, w * 0.6, near ? 6 : 4);
  lg.rectangle('fill', x0, top, w, near ? 4 : 2);
  // foaming base pool + rising spray
  lg.setColor(0.22, 0.46, 0.82, near ? 0.6 : 0.28); lg.ellipse('fill', cx, bot + 3, w * 0.82, near ? 12 : 7);
  lg.setColor(0.95, 1.0, 1.0, near ? 0.65 : 0.3); lg.ellipse('fill', cx, bot - 1, w * 0.5, near ? 6 : 4);
  for (let i = 0; i < 8; i++) { const ph = (T * 26 + i * 5) % 46; lg.setColor(0.92, 0.99, 1.0, (near ? 0.36 : 0.16) * (1 - ph / 46)); lg.circle('fill', cx + (i - 3.5) * w * 0.16, bot - ph * 0.6, 2.5 + (1 - ph / 46) * 5); }
}

// A glowing, fluorescent soul-river filling one ravine. The column runs deep and
// fades to near-black so the eye never finds a bottom (it looks endless), with
// wisp-souls swimming in it.
function drawSoulRiver(x0, x1) {
  const y = STREAM6.y, w = x1 - x0;
  // endless glowing body: bright fluorescent teal at the surface → deep blue →
  // near-black far below (drawn very deep so no bottom is ever visible)
  const DEPTH = 2000, N = 30;
  for (let i = 0; i < N; i++) {
    const k = i / N;
    lg.setColor(lerp(0.08, 0.005, k), lerp(0.55, 0.03, k), lerp(0.60, 0.07, k), 1);
    lg.rectangle('fill', x0, y + i * (DEPTH / N), w, DEPTH / N + 1);
  }
  // faint fluorescent light-shafts descending through the water
  lg.setColor(0.3, 0.95, 0.85, 0.07);
  for (let x = Math.floor(x0 / 44) * 44; x < x1; x += 44) { lg.rectangle('fill', x + Math.sin(T + x) * 2, y, 2, 520); }
  // bright fluorescent surface band + glow
  lg.setColor(0.35, 1.0, 0.9, 0.55); lg.rectangle('fill', x0, y, w, 9);
  lg.setColor(0.5, 1.0, 0.92, 0.28); lg.rectangle('fill', x0, y - 4, w, 6);
  // rising fluorescent haze above the water (marks it as unnatural)
  for (let g = 0; g < 4; g++) {
    lg.setColor(0.35, 0.98, 0.85, (0.12 - g * 0.026) + 0.03 * Math.sin(T * 1.7 + x0 + g));
    lg.rectangle('fill', x0, y - 18 - g * 16, w, 18);
  }
  // shimmering fluorescent ripples on the surface
  lg.setColor(0.65, 1.0, 0.95, 0.6);
  for (let x = x0; x < x1; x += 12) { const yy = y + Math.sin(x * 0.11 + T * 3) * 2.5; lg.rectangle('fill', x, yy, 8, 3); }
  // the souls swimming within (only the on-screen slice)
  const camL = cam.x - VW * 0.62 / cam.zoom - 40, camR = cam.x + VW * 0.62 / cam.zoom + 40;
  for (const so of l6.souls) {
    if (so.x < x0 || so.x > x1) continue;
    if (so.x < camL || so.x > camR) continue;
    const sx = so.x, sy = so.y + Math.sin(T * 1.4 + so.ph) * so.bob, face = so.vx < 0 ? -1 : 1;
    const a = 0.5 + 0.3 * Math.sin(T * 2 + so.ph);
    // ghostly aura
    lg.setColor(0.6, 1.0, 0.95, 0.10 * a); lg.circle('fill', sx, sy, 16);
    // a pale drifting spirit: hooded head + trailing wispy body
    lg.setColor(0.75, 1.0, 0.98, 0.5 * a);
    lg.circle('fill', sx, sy - 5, 5);                                  // head
    lg.polygon('fill', sx - 6, sy - 3, sx + 6, sy - 3, sx + 3 * face, sy + 16, sx - 9 * face, sy + 12); // trailing robe
    // faint hollow eyes
    lg.setColor(0.2, 0.5, 0.55, 0.6 * a); lg.circle('fill', sx - 2 * face, sy - 6, 1); lg.circle('fill', sx + 2 * face, sy - 6, 1);
    // little rising soul-motes
    lg.setColor(0.7, 1.0, 0.95, 0.4 * a); lg.circle('fill', sx + Math.sin(T * 3 + so.ph) * 6, sy - 12 - (T * 10 % 14), 1.3);
  }
}

function drawStream6() {
  for (const gap of STREAM6.gaps) drawSoulRiver(gap[0], gap[1]);
  // huge straight cascades pouring from far above into the rivers
  for (const wf of FALLS6) drawCascade(wf.x, -400, STREAM6.y + 8, wf.w, true);
}

// the GIANT TREE that holds the key — a massive trunk + canopy drawn behind the
// climbing branch-beams
function drawGiantTree6() {
  const cx = 11350, footY = FLOOR6, topY = -380;
  // roots spreading at the base
  lg.setColor(0.18, 0.13, 0.09, 1);
  for (let i = -3; i <= 3; i++) lg.polygon('fill', cx + i * 34, footY - 6, cx + i * 34 + 20, footY, cx + i * 34 + 46, footY + 34, cx + i * 34 + 8, footY + 12);
  // the massive trunk (widens at the base)
  lg.setColor(0.23, 0.17, 0.12, 1);
  lg.polygon('fill', cx - 78, footY + 30, cx - 44, topY + 140, cx - 32, topY, cx + 32, topY, cx + 44, topY + 140, cx + 78, footY + 30);
  lg.setColor(0.16, 0.11, 0.07, 1);   // shaded right side
  lg.polygon('fill', cx + 6, footY + 30, cx + 24, topY + 140, cx + 32, topY, cx + 44, topY + 140, cx + 78, footY + 30);
  lg.setColor(0.30, 0.24, 0.15, 0.5);  // lit left edge
  lg.setLineWidth(3); lg.line(cx - 60, footY, cx - 34, topY + 120); lg.setLineWidth(1);
  // vertical bark grooves
  lg.setColor(0.12, 0.08, 0.05, 0.8); lg.setLineWidth(2);
  for (let i = -2; i <= 2; i++) lg.line(cx + i * 20, topY + 80, cx + i * 26, footY);
  lg.setLineWidth(1);
  // a vast leafy canopy at the top
  lg.setColor(0.13, 0.21, 0.11, 1);
  for (let i = 0; i < 12; i++) { const a = i / 12 * Math.PI * 2; lg.circle('fill', cx + Math.cos(a) * 150, topY - 10 + Math.sin(a) * 70, 70); }
  lg.setColor(0.19, 0.29, 0.15, 1);
  for (let i = 0; i < 16; i++) lg.circle('fill', cx + Math.sin(i * 2.3) * 170, topY - 40 - ((i * 41) % 110), 44);
  lg.setColor(0.26, 0.38, 0.20, 0.8);
  for (let i = 0; i < 14; i++) lg.circle('fill', cx + Math.sin(i * 1.7) * 150, topY - 60 - ((i * 53) % 120), 20);
}

function drawGate6(g) {
  if (g.openT >= 1) return;
  const rise = (g.yBot - g.yTop) * smooth(g.openT);
  const x = g.x, top = g.yTop - rise, bot = g.yBot - rise;
  // a stone lintel the vines hang from
  lg.setColor(0.20, 0.18, 0.16, 1);
  lg.rectangle('fill', x - 10, g.yTop - 16, g.w + 20, 16);
  // thick woven vines (a few strands with a slight sway), knotted with thorns
  const nStr = 4;
  for (let i = 0; i < nStr; i++) {
    const bx = x + 2 + i * (g.w - 4) / (nStr - 1);
    lg.setColor(0.18, 0.30, 0.16, 1); lg.setLineWidth(3.4);
    let px = bx, py = top;
    lg.push();
    for (let yy = top; yy < bot; yy += 12) {
      const nx = bx + Math.sin(yy * 0.06 + i * 1.3 + T * 1.2) * 3;
      lg.line(px, py, nx, yy); px = nx; py = yy;
    }
    lg.pop();
    // leaves
    lg.setColor(0.30, 0.46, 0.22, 1);
    for (let yy = top + 8; yy < bot; yy += 30) {
      const lx = bx + Math.sin(yy * 0.06 + i) * 3;
      lg.polygon('fill', lx, yy, lx + 6, yy - 3, lx + 2, yy + 4);
      lg.polygon('fill', lx, yy + 12, lx - 6, yy + 9, lx - 2, yy + 16);
    }
  }
  // cross-weave
  lg.setColor(0.16, 0.26, 0.14, 1); lg.setLineWidth(2.4);
  for (let cy = top + 16; cy < bot; cy += 30) lg.line(x, cy, x + g.w, cy);
  lg.setLineWidth(1);
  // a faint teal sigil-lock while shut
  if (!g.open) {
    lg.setColor(0.5, 0.9, 0.85, 0.35 + 0.2 * Math.sin(T * 3));
    lg.circle('line', x + g.w / 2, (top + bot) / 2, 6);
  }
}

function drawButton6(b) {
  // a mossy pressure stone that glows teal, sinking a touch when pressed
  const pressed = b.pressed;
  const h = pressed ? 3 : 8;
  lg.setColor(0.14, 0.12, 0.10, 1);
  lg.rectangle('fill', b.x - b.w / 2 - 4, b.y - 3, b.w + 8, 5);
  lg.setColor(0.26, 0.30, 0.20, 1);
  lg.rectangle('fill', b.x - b.w / 2, b.y - h, b.w, h);
  lg.setColor(0.32, 0.44, 0.24, 1);
  lg.rectangle('fill', b.x - b.w / 2, b.y - h, b.w, 2.4);
  lg.setColor(0.5, 0.9, 0.85, pressed ? 0.85 : 0.35 + 0.35 * Math.sin(T * 4));
  lg.circle('fill', b.x, b.y - h + 1.6, 3.2);
  lg.setColor(0.5, 0.9, 0.85, pressed ? 0.25 : 0.12 + 0.08 * Math.sin(T * 4));
  lg.circle('fill', b.x, b.y - h + 1.6, 9);
}
function drawButtons6() { for (const b of l6.buttons) drawButton6(b); }

function drawFireBullet6(bu) {
  lg.setColor(1.0, 0.45, 0.1, 0.2); lg.circle('fill', bu.x - bu.vx * 0.012, bu.y - bu.vy * 0.012, bu.r * 1.7);
  lg.setColor(1.0, 0.55, 0.12, 0.42); lg.circle('fill', bu.x, bu.y, bu.r * 1.7);
  lg.setColor(1.0, 0.35, 0.08, 1); lg.circle('fill', bu.x, bu.y, bu.r);
  lg.setColor(1.0, 0.92, 0.5, 1); lg.circle('fill', bu.x - 1.5, bu.y - 1.5, bu.r * 0.45);
}

function drawCapanna6() {
  const x = CAPANNA_X, gy = CAPANNA_Y;
  // draw the whole hut at DOUBLE size, anchored on its base (the summit ground)
  lg.push();
  lg.translate(x, gy); lg.scale(2, 2); lg.translate(-x, -gy);
  // ground shadow
  lg.setColor(0, 0, 0, 0.3); lg.ellipse('fill', x, gy + 2, 95, 10);
  // log walls
  lg.setColor(0.28, 0.20, 0.13, 1);
  lg.rectangle('fill', x - 74, gy - 96, 148, 96);
  // horizontal log courses
  lg.setColor(0.20, 0.14, 0.09, 1);
  for (let yy = gy - 88; yy < gy; yy += 15) lg.rectangle('fill', x - 74, yy, 148, 2);
  lg.setColor(0.34, 0.25, 0.16, 0.7);
  for (let yy = gy - 84; yy < gy; yy += 15) lg.rectangle('fill', x - 74, yy, 148, 1.4);
  // thatched, mossy roof
  lg.setColor(0.22, 0.28, 0.15, 1);
  lg.polygon('fill', x - 90, gy - 92, x, gy - 150, x + 90, gy - 92);
  lg.setColor(0.30, 0.40, 0.20, 1);
  lg.polygon('fill', x - 90, gy - 92, x, gy - 150, x + 90, gy - 92, x + 78, gy - 92, x, gy - 140, x - 78, gy - 92);
  lg.setColor(0.16, 0.20, 0.11, 1);
  for (let i = -4; i <= 4; i++) lg.line(x, gy - 148, x + i * 20, gy - 92);
  const flick = 0.6 + 0.25 * Math.sin(T * 7.3) + 0.12 * Math.sin(T * 13.1);
  const open = l6.end.stage >= 1;   // the door opens only as the hero enters
  // the dark door recess
  lg.setColor(0.05, 0.03, 0.02, 1); lg.rectangle('fill', x - 22, gy - 60, 44, 60);
  if (open) {
    // an open, fire-lit doorway
    lg.setColor(1.0, 0.62, 0.25, flick); lg.rectangle('fill', x - 18, gy - 54, 36, 54);
    lg.setColor(1.0, 0.82, 0.4, flick * 0.85); lg.polygon('fill', x - 10, gy, x, gy - 30 - flick * 8, x + 10, gy);
    lg.setColor(1.0, 0.5, 0.15, flick * 0.5); lg.rectangle('fill', x - 26, gy - 62, 52, 62);
  } else {
    // a CLOSED plank door with iron bands, a ring handle and a keyhole
    lg.setColor(0.30, 0.20, 0.12, 1); lg.rectangle('fill', x - 19, gy - 57, 38, 57);
    lg.setColor(0.20, 0.13, 0.08, 1);
    for (let px = x - 13; px < x + 16; px += 9) lg.rectangle('fill', px, gy - 57, 1.5, 57);   // plank seams
    lg.setColor(0.14, 0.12, 0.11, 1);
    lg.rectangle('fill', x - 19, gy - 48, 38, 4); lg.rectangle('fill', x - 19, gy - 18, 38, 4); // iron bands
    lg.setColor(0.42, 0.38, 0.3, 1); lg.setLineWidth(2); lg.circle('line', x + 11, gy - 30, 4); lg.setLineWidth(1); // ring handle
    lg.setColor(0.05, 0.04, 0.03, 1); lg.circle('fill', x - 8, gy - 30, 2); lg.rectangle('fill', x - 8.8, gy - 30, 1.6, 5); // keyhole
  }
  // warm glow on the grass (bright when open, faint when shut)
  lg.setColor(1.0, 0.6, 0.25, (open ? 0.12 : 0.04) + 0.05 * Math.sin(T * 5));
  lg.ellipse('fill', x, gy, open ? 120 : 70, open ? 30 : 18);
  // a small window always catching the firelight from within
  lg.setColor(0.05, 0.03, 0.02, 1); lg.rectangle('fill', x + 40, gy - 66, 20, 20);
  lg.setColor(1.0, 0.65, 0.28, flick * 0.9); lg.rectangle('fill', x + 43, gy - 63, 14, 14);
  lg.setColor(0.2, 0.14, 0.09, 1); lg.rectangle('fill', x + 49.5, gy - 66, 1.4, 20); lg.rectangle('fill', x + 40, gy - 57, 20, 1.4); // muntins
  lg.pop();
}

// the hero stepping into the hut: a backlit silhouette that walks to the door
// and dissolves into the firelight (played during the ending, end.stage === 1)
function drawCapannaEnter6() {
  if (l6.end.stage !== 1) return;
  const e = l6.end, p = player;
  const prog = clamp(e.t / 2.0, 0, 1);
  const dis = clamp((prog - 0.55) / 0.45, 0, 1);   // dissolve into the doorway
  const fade = 1 - dis;
  const sc = 2 * (1 - dis * 0.5);                    // hero is ~2x like the hut
  if (fade <= 0) return;
  const walking = prog < 0.6;
  const step = e.t * 7, bob = walking ? Math.abs(Math.sin(step)) * 1.6 : 0;
  const dark = [0.08, 0.06, 0.05, fade];
  lg.push(); lg.translate(p.x, CAPANNA_Y - bob); lg.scale(sc, sc);
  // two properly articulated legs (thigh + shin), striding out of phase
  for (const side of [-1, 1]) {
    const sw = walking ? Math.sin(step + (side > 0 ? 0 : Math.PI)) : 0;
    const hipX = side * 2.5, hipY = -18;
    const kneeX = hipX + sw * 4, kneeY = -9;
    const footX = hipX + sw * 8, footY = -0.5 - Math.max(0, sw) * 1.5;
    segment(hipX, hipY, kneeX, kneeY, 3.0, 2.4, dark);
    segment(kneeX, kneeY, footX, footY, 2.4, 2.0, dark);
    lg.setColor(dark[0], dark[1], dark[2], fade); lg.rectangle('fill', footX - 1.5, footY - 1, 6, 2.4);  // boot
  }
  // cloak / body + a hint of a swinging arm
  lg.setColor(dark[0], dark[1], dark[2], fade);
  lg.polygon('fill', -7, -16, 7, -16, 5, -46, -5, -46);
  const arm = walking ? Math.sin(step + Math.PI) * 4 : 0;
  segment(3, -40, 4 + arm, -26, 2.2, 1.8, dark);
  lg.circle('fill', 0, -52, 6);                                        // head
  lg.setColor(0.7, 0.3, 0.15, fade * 0.9); lg.setLineWidth(2);
  lg.line(2, -46, 7, -40 + arm * 0.3);                                 // scarf catching the firelight
  lg.setLineWidth(1); lg.pop();
}

// one plank span of a drawbridge deck, from (ax,ay) to (bx,by)
function drawDeckSpan(ax, ay, bx, by) {
  const dx = bx - ax, dy = by - ay, d = Math.hypot(dx, dy) || 1, ux = dx / d, uy = dy / d, nx = -uy, ny = ux;
  lg.setColor(0.30, 0.21, 0.13, 1);
  lg.polygon('fill', ax + nx * 5, ay + ny * 5, bx + nx * 5, by + ny * 5, bx - nx * 5, by - ny * 5, ax - nx * 5, ay - ny * 5);
  lg.setColor(0.18, 0.12, 0.08, 1); lg.setLineWidth(1.5);
  const n = Math.max(2, Math.floor(d / 16));
  for (let i = 1; i < n; i++) { const px = ax + ux * d * i / n, py = ay + uy * d * i / n; lg.line(px + nx * 5, py + ny * 5, px - nx * 5, py - ny * 5); }
  lg.setColor(0.42, 0.31, 0.18, 0.6); lg.line(ax + nx * 4.5, ay + ny * 4.5, bx + nx * 4.5, by + ny * 4.5);
  lg.setLineWidth(1);
}

// a single burnable liana between topY and botY: a wavy green rope with leaves
// and a burnable-hint glow, or a charred stub + running flame once burnt
function drawLiana6(li, topY, botY) {
  if (li.burned) {
    if (li.burnT < 0.7) {   // flame running down as it snaps
      const a = 1 - li.burnT / 0.7, span = botY - topY;
      for (let f = 0; f < 4; f++) {
        const fy = topY + 24 + f * (span / 4), flick = 0.5 + 0.5 * Math.sin(T * 18 + f);
        lg.setColor(1.0, 0.35, 0.06, 0.5 * a); lg.polygon('fill', li.x - 5, fy, li.x + 5, fy, li.x + 2, fy - 24 * flick, li.x - 3, fy - 26 * flick);
        lg.setColor(1.0, 0.8, 0.3, 0.7 * a); lg.polygon('fill', li.x - 2.5, fy, li.x + 2.5, fy, li.x, fy - 16 * flick);
      }
    }
    lg.setColor(0.10, 0.09, 0.07, 1); lg.setLineWidth(2.4);   // charred stub
    let py = topY; for (let yy = topY; yy < topY + 44; yy += 8) { const nx = li.x + Math.sin(yy * 0.2) * 2; lg.line(li.x, py, nx, yy); py = yy; }
    lg.setLineWidth(1);
  } else {
    lg.setColor(0.19, 0.33, 0.15, 1); lg.setLineWidth(3.8);   // taut green liana
    let px = li.x, py = topY;
    for (let yy = topY; yy < botY; yy += 10) { const nx = li.x + Math.sin(yy * 0.06 + T * 1.1 + li.x) * 3; lg.line(px, py, nx, yy); px = nx; py = yy; }
    lg.setLineWidth(1);
    lg.setColor(0.30, 0.46, 0.22, 1);
    for (let yy = topY + 24; yy < botY; yy += 32) { const lx = li.x + Math.sin(yy * 0.06 + li.x) * 3; lg.polygon('fill', lx, yy, lx + 6, yy - 3, lx + 2, yy + 4); lg.polygon('fill', lx, yy + 10, lx - 6, yy + 8, lx - 2, yy + 14); }
    lg.setColor(1.0, 0.6, 0.2, 0.10 + 0.07 * Math.sin(T * 3 + li.x)); lg.circle('fill', li.x, (topY + botY) / 2, 6);   // burnable-hint glow
  }
}

// a two-stage burn-the-lianas drawbridge: two raised half-decks, each held up by
// its lianas, dropping flat as they burn (near half → far half)
function drawBridge6(br) {
  const x0 = br.x0, x1 = br.x1, y = br.y, mid = (x0 + x1) / 2;
  const peakL = lerp(y - 150, y, smooth(br.leftT)), peakR = lerp(y - 150, y, smooth(br.rightT));
  lg.setColor(0.22, 0.16, 0.11, 1); lg.rectangle('fill', x0 - 8, y - 16, 8, 18); lg.rectangle('fill', x1, y - 16, 8, 18);  // bank posts
  drawDeckSpan(x0, y, mid, peakL);   // NEAR half (hinge at x0)
  drawDeckSpan(x1, y, mid, peakR);   // FAR half (hinge at x1)
  // the anchor branch the lianas hang from
  lg.setColor(0.22, 0.16, 0.10, 1); lg.rectangle('fill', x0 - 12, 62, (x1 - x0) + 24, 9);
  lg.setColor(0.30, 0.40, 0.20, 1); lg.rectangle('fill', x0 - 12, 60, (x1 - x0) + 24, 3);
  for (const li of br.lianas) drawLiana6(li, 72, y);
}

function drawWitch6() {
  const w = l6.witch;
  if (!w || w.gone) return;
  const a = clamp(w.appear - w.leave, 0, 1);
  if (a <= 0) return;
  const float = Math.sin(T * 1.5) * 4;
  lg.push();
  // drawn at ~hero scale (she is not a giant): scale 0.42 about her feet
  lg.translate(w.x, w.y - 28 + float);
  lg.scale(0.42, 0.42);
  // cold aura
  lg.setColor(0.4, 0.8, 0.75, 0.12 * a); lg.circle('fill', 0, -18, 62);
  // ragged spectral robe
  lg.setColor(0.05, 0.09, 0.09, 0.85 * a);
  lg.polygon('fill', -24, 66, 24, 66, 12, -48, -12, -48);
  lg.setColor(0.08, 0.13, 0.13, 0.8 * a);
  for (let i = -2; i <= 2; i++) lg.polygon('fill', i * 9 - 3, 66, i * 9 + 3, 66, i * 9, 78 + Math.sin(T * 2 + i) * 4);
  // sleeves hinting at hands
  lg.setColor(0.06, 0.10, 0.10, 0.85 * a);
  lg.polygon('fill', -12, -30, -26, 6, -18, 8, -8, -22);
  lg.polygon('fill', 12, -30, 26, 6, 18, 8, 8, -22);
  // hood
  lg.setColor(0.04, 0.08, 0.08, 0.92 * a);
  lg.circle('fill', 0, -52, 15);
  lg.polygon('fill', -15, -46, 15, -46, 10, -70, -10, -70);
  // glowing eyes
  lg.setColor(0.6, 0.98, 0.9, a);
  lg.circle('fill', -4.5, -54, 2.1); lg.circle('fill', 4.5, -54, 2.1);
  // her sigil hovering above
  drawEmblem(0, -104 - float * 0.4, 22, 0.7 * a, null);
  lg.pop();
}

function drawFireflies6() {
  const camL = cam.x - VW * 0.62 / cam.zoom - 40, camR = cam.x + VW * 0.62 / cam.zoom + 40;
  for (const f of l6.fireflies) {
    if (f.x < camL || f.x > camR) continue;
    const gx = f.x + Math.sin(T * f.sp + f.ph) * 14;
    const gy = f.y + Math.cos(T * f.sp * 0.8 + f.ph) * 10;
    const tw = 0.4 + 0.6 * (0.5 + 0.5 * Math.sin(T * 3 + f.ph));
    lg.setColor(0.7, 1.0, 0.7, 0.10 * tw); lg.circle('fill', gx, gy, 5);
    lg.setColor(0.85, 1.0, 0.6, 0.9 * tw); lg.circle('fill', gx, gy, 1.4);
  }
}

// the iron key at the top of the giant tree, CAGED behind burnable lianas
function drawKey6() {
  const k = l6.key;
  if (!k || k.taken) return;
  const caged = k.lianas && k.lianas.some(function (li) { return !li.burned; });
  const bob = Math.sin(T * 2) * 3, x = k.x, y = k.y + bob, dim = caged ? 0.55 : 1;
  lg.setColor(0.95, 0.85, 0.45, (0.14 + 0.1 * Math.sin(T * 4)) * dim); lg.circle('fill', x, y + 3, 17);
  lg.setColor(0.86 * dim + 0.1, 0.72 * dim + 0.08, 0.32 * dim + 0.04, 1);
  lg.setLineWidth(3); lg.circle('line', x, y - 6, 5);       // bow
  lg.rectangle('fill', x - 1.4, y - 2, 2.8, 17);            // shaft
  lg.rectangle('fill', x + 1.4, y + 9, 6, 2.6);             // teeth
  lg.rectangle('fill', x + 1.4, y + 13, 4.5, 2.6);
  lg.setLineWidth(1);
  const tw = 0.5 + 0.5 * Math.sin(T * 5); lg.setColor(1, 1, 0.9, tw * dim); lg.circle('fill', x + 4, y - 8, 1.2);
  // the caging lianas, in front of the key
  if (k.lianas) for (const li of k.lianas) drawLiana6(li, k.y - 34, k.y + 46);
}

function drawEnts6() {
  for (const br of l6.bridges) drawBridge6(br);
  for (const g of l6.gates) drawGate6(g);
  drawButtons6();
  drawCapanna6();
  drawCapannaEnter6();
  drawKey6();
  for (const s of l6.sentinels) drawSentinel(s);
  for (const s of l6.sentinels) for (const b of s.bolts) drawSentinelBolt(b);
  for (const bt of l6.biters) drawBiter(bt);
  for (const bu of l6.bullets) drawFireBullet6(bu);
  if (l6.carpet && !l6.carpet.gone) drawFlyingCarpet(l6.carpet.x, l6.carpet.y, 1.5);
  drawWitch6();
  drawFireflies6();
}

// deep, misty forest backdrop with distant waterfalls and shafts of light
function drawBackground6(cam) {
  for (let i = 0; i <= 16; i++) {
    const k = i / 16;
    lg.setColor(0.04 + 0.03 * k, 0.09 + 0.06 * k, 0.08 + 0.05 * k, 1);
    lg.rectangle('fill', 0, VH * k, VW, VH / 16 + 1);
  }
  // far tree-line silhouettes (two parallax layers)
  for (let layer = 0; layer < 2; layer++) {
    const par = 0.18 + layer * 0.16, period = 300 + layer * 120;
    let ox = (-cam.x * par) % period; if (ox < 0) ox += period;
    const shade = layer === 0 ? 0.07 : 0.10;
    lg.setColor(shade, shade + 0.05, shade, 1);
    for (let i = -1; i <= Math.ceil(VW / period) + 1; i++) {
      const ax = ox + i * period;
      // a tall conifer / broadleaf blob
      lg.rectangle('fill', ax + period * 0.42, VH * 0.35, 14 + layer * 6, VH);
      lg.polygon('fill', ax + period * 0.2, VH * 0.55, ax + period * 0.48, VH * 0.16, ax + period * 0.76, VH * 0.55);
      lg.polygon('fill', ax + period * 0.26, VH * 0.72, ax + period * 0.48, VH * 0.34, ax + period * 0.70, VH * 0.72);
    }
  }
  // pale shafts of light slanting through the canopy
  lg.setColor(0.7, 0.95, 0.7, 0.03);
  for (let k = 0; k < 4; k++) {
    const bx = ((k * 340 - cam.x * 0.3) % 1360 + 1360) % 1360 - 40;
    lg.polygon('fill', bx, 0, bx + 90, 0, bx + 230, VH, bx + 140, VH);
  }
  // (the cascades live in the world layer now, feeding the soul-rivers)
  // low ground mist
  lg.setColor(0.5, 0.7, 0.6, 0.05 + 0.02 * Math.sin(T * 0.7));
  lg.rectangle('fill', 0, VH * 0.74, VW, VH * 0.26);
}

// -------------------------------------------------------------- HUD / overlay
function drawL6Overlay() {
  const p = player;
  // final card — the King steps into the firelit hut
  if (l6.end.stage >= 2) {
    lg.setColor(0.06, 0.03, 0.02, clamp(l6.end.t / 1.4, 0, 1) * 0.97);
    lg.rectangle('fill', 0, 0, VW, VH);
    // a low ember glow at the base
    lg.setColor(1.0, 0.5, 0.16, 0.10 + 0.05 * Math.sin(T * 5));
    lg.rectangle('fill', 0, VH * 0.8, VW, VH * 0.2);
    const a = clamp((l6.end.t - 1.0) / 1.2, 0, 1);
    if (a > 0 && FONT_SUB) {
      lg.setFont(FONT_SUB);
      lg.setColor(0.97, 0.74, 0.44, a);
      printSpaced('INTO  THE  FIRELIT  HUT', VW / 2, VH / 2 - 22, FONT_SUB, 4, 0.9);
      lg.setColor(0.92, 0.88, 0.82, a);
      printSpaced('TO  BE  CONTINUED', VW / 2, VH / 2 + 18, FONT_SUB, 6, 1);
      lg.setFont(FONT_HUD);
      lg.setColor(0.78, 0.72, 0.66, a * 0.85);
      const m = 'press  R  to  replay';
      lg.print(m, VW / 2 - FONT_HUD.getWidth(m) / 2, VH / 2 + 54);
    }
    return;
  }

  const scripted = !!(l6.arrival && l6.arrival.active);

  // HUD (hidden during the arrival cutscene / game over)
  if (!scripted && !l6.gameOver) {
    lg.setFont(FONT_HUD);
    for (let i = 1; i <= difficultyMaxHp(); i++) {
      const hx = 30 + (i - 1) * 36, hy = 32;
      const full = (p.hp || 0) >= i;
      if (full) lg.setColor(0.85, 0.16, 0.22, 1); else lg.setColor(0.25, 0.10, 0.13, 0.8);
      lg.circle('fill', hx - 5, hy - 3, 6.5); lg.circle('fill', hx + 5, hy - 3, 6.5);
      lg.polygon('fill', hx - 11, hy - 0.5, hx + 11, hy - 0.5, hx, hy + 12);
      lg.setColor(1, 1, 1, full ? 0.35 : 0.12); lg.circle('fill', hx - 6.5, hy - 5, 2);
    }
    lg.setColor(0.86, 0.9, 0.84, 0.9); lg.print('LIVES', 30, 52, 0, 0.85, 0.85);
    for (let i = 0; i < Math.max(0, l6.lives || 0); i++) {
      const lx = 108 + i * 22, ly = 60;
      lg.setColor(0.5, 0.6, 0.5, 1); lg.polygon('fill', lx - 6, ly + 6, lx + 6, ly + 6, lx, ly - 3);
      lg.setColor(0.9, 0.94, 0.88, 1); lg.circle('fill', lx, ly - 4, 3.2);
    }
    if (p.lavaSword) {
      lg.setColor(1.0, 0.5, 0.15, 0.9); lg.print('FIRE-SWORD', 30, 78, 0, 0.85, 0.85);
      const charged = p.lavaCharge || 0;
      for (let i = 0; i < 3; i++) {
        const cx = 118 + i * 16, cy = 84;
        if (i < charged) { lg.setColor(1.0, 0.45, 0.12, 1); lg.circle('fill', cx, cy, 5); lg.setColor(1.0, 0.9, 0.5, 1); lg.circle('fill', cx - 1.4, cy - 1.4, 2); }
        else { lg.setColor(0.4, 0.2, 0.12, 0.7); lg.circle('line', cx, cy, 5); }
      }
      if ((p.blockHold || 0) > 0) {
        lg.setColor(0.85, 0.7, 0.6, 0.7); lg.print('CHARGING…', 178, 78, 0, 0.8, 0.8);
        lg.setColor(0.3, 0.15, 0.08, 0.8); lg.rectangle('fill', 178, 90, 90, 5);
        lg.setColor(1.0, 0.6, 0.15, 1); lg.rectangle('fill', 178, 90, 90 * clamp((p.blockHold || 0) / CHARGE_TIME, 0, 1), 5);
      } else {
        lg.setColor(0.85, 0.7, 0.6, 0.7); lg.print(charged > 0 ? 'ATTACK to fire' : 'hold BLOCK 1s to charge', 178, 78, 0, 0.8, 0.8);
      }
    }
    // the door key, once found
    if (l6.key && l6.key.taken) {
      const kx = 34, ky = 108;
      lg.setColor(0.86, 0.72, 0.32, 1);
      lg.setLineWidth(2); lg.circle('line', kx, ky - 4, 4); lg.setLineWidth(1);
      lg.rectangle('fill', kx - 1, ky - 1, 2, 13); lg.rectangle('fill', kx + 1, ky + 8, 4, 2);
      lg.setColor(0.9, 0.86, 0.66, 0.95); lg.print('KEY', kx + 14, ky - 8, 0, 0.85, 0.85);
    }
  }

  // toast
  if (l6.msgT > 0) {
    lg.setColor(0.9, 0.96, 0.86, Math.min(1, l6.msgT));
    lg.print(l6.msg, VW / 2 - FONT_HUD.getWidth(l6.msg) / 2, VH - 96);
  }

  // dialogue subtitle (the witch / the King)
  if (l6.dialog) drawSubtitle({ who: l6.dialog.who, text: l6.dialog.text });

  // "press UP to enter the hut" prompt (or a locked note without the key)
  if (l6.capannaNear) {
    const hasKey = l6.key && l6.key.taken;
    const sx = VW / 2 + (CAPANNA_X - cam.x) * cam.zoom;
    const sy = VH / 2 + (CAPANNA_Y - 300 - cam.y) * cam.zoom;
    const m = hasKey ? 'Press  ▲  to unlock and enter the hut' : 'Locked — the key is hidden in the high branches';
    lg.setFont(FONT_HUD);
    const tw = FONT_HUD.getWidth(m), bob = Math.sin(T * 4) * 3;
    lg.setColor(0.04, 0.03, 0.02, 0.8);
    lg.rectangle('fill', sx - tw / 2 - 10, sy - 14 + bob, tw + 20, 26);
    lg.setColor(1.0, 0.72, 0.4, 0.95);
    lg.rectangle('fill', sx - tw / 2 - 10, sy - 14 + bob, tw + 20, 2);
    lg.setColor(0.98, 0.92, 0.82, 0.6 + 0.4 * (0.5 + 0.5 * Math.sin(T * 4)));
    lg.print(m, sx - tw / 2, sy - 8 + bob);
  }

  // arrival cinematic — thin bands + a location card
  if (scripted) {
    const band = 40;
    lg.setColor(0.02, 0.03, 0.02, 0.94);
    lg.rectangle('fill', 0, 0, VW, band); lg.rectangle('fill', 0, VH - band, VW, band);
    const ph = l6.arrival.phase;
    if ((ph === 'fly' || ph === 'hop') && FONT_LOC) {
      const a = clamp(l6.arrival.t / 1.0, 0, 1) * (ph === 'hop' ? clamp((0.7 - l6.arrival.t) / 0.5, 0, 1) : 1);
      lg.setFont(FONT_LOC);
      lg.setColor(0.8, 0.94, 0.82, a);
      printSpaced('THE  ENCHANTED  WOOD  ·  THE  FAR  SHORE', VW / 2, VH * 0.18, FONT_LOC, 5, 1);
    }
  }

  // game over
  if (l6.gameOver) {
    lg.setColor(0.02, 0.03, 0.02, 0.9); lg.rectangle('fill', 0, 0, VW, VH);
    lg.setFont(FONT_SUB); lg.setColor(0.4, 0.85, 0.6, 1);
    printSpaced('GAME  OVER', VW / 2, VH / 2 - 28, FONT_SUB, 6, 1);
    lg.setFont(FONT_HUD); lg.setColor(0.9, 0.9, 0.86, 0.9);
    const m = 'Press  R  to  try  again';
    lg.print(m, VW / 2 - FONT_HUD.getWidth(m) / 2, VH / 2 + 24);
  }
}
