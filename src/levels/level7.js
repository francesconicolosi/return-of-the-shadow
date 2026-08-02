// ============================================================================
//  levels/level7.js — Level 7 "The House in the Forest": the mirror cutscene.
//
//  A fully scripted, non-playable finale to the story arc. The King steps into
//  the small firelit hut on the summit of the Enchanted Wood (continued from the
//  end of Level 6). As he nears the hearth the fire dies and the Witch, unseen,
//  walks him through the truth of his blood: his father's wars, the massacre of
//  her people, the death-curse that spared only him, the throne he took and the
//  wars he waged, and the queen whose heart the guilt — not any spell — broke.
//  A mirror turns his hair white and shows him he is the old, dying source of
//  the sorrow he has hunted for thirty years. He rises, and turns to face her.
//
//  Like Level 4 this is a screen-space cutscene: the camera is pinned at the
//  centre of the view (world coords == screen coords). The hero walks (slowly)
//  only in the two "house" beats; every other beat repositions him by script.
//  Resolves shared helpers (lerp/clamp/smooth/T, drawSubtitle, drawEmblem,
//  spawnDust, printSpaced, the FONT_* handles…) via the top-level scope.
// ============================================================================
'use strict';

const STOP_FIRE_X = 815;    // the invisible point before the hearth where he can walk no further
const FIRE_X = 1040;        // the hearth's centre (screen x)
const MIRROR_X = 640;       // the tall mirror in the middle of the hall
const WALK7 = 118;          // his slow, weary walking speed (no running here)

const l7 = {
  phase: 'intro', t: 0, sub: 0,
  fire: 1,                  // hearth flame level 0..1 (dies, then relights)
  hasMirror: false,         // the mirror only appears for the second house beat
  scene: 'house',           // which backdrop: house / war / deadpalace / river / warpalace
  blackA: 1,                // full-screen darkness (fades a scene in and out)
  fadeOut: false,           // ramping the darkness back up before the next scene
  dialog: null, queue: [],
  witch: null,              // the casting apparition in the river vision
  princess: null,           // the queen who leaps from the window
  heads: [], headCool: 0,   // the flying souls streaming off across the river
  reached: false, crossed: false, flash: 0,
  card: 0, _advanced: false,
};

// -------------------------------------------------------------- dialogue
function l7Line(who, text) {
  // auto-advance is a fallback (Enter skips); cap it so long monologues don't linger
  return { who: who, text: text, dur: clamp(3.0 + text.split(' ').length * 0.30, 4.5, 12) };
}
function l7Queue(lines) { l7.queue = lines.slice(); l7.dialog = null; }
function l7Dialog(dt) {
  if (l7.dialog) { l7.dialog.t += dt; if (l7.dialog.t >= l7.dialog.dur) l7.dialog = null; }
  if (!l7.dialog && l7.queue.length) l7.dialog = Object.assign({ t: 0 }, l7.queue.shift());
}
function l7DialogDone() { return !l7.dialog && l7.queue.length === 0; }
function l7Skip() { if (l7.dialog) l7.dialog.t = l7.dialog.dur + 1; }

// -------------------------------------------------------------- setup
function startL7() {
  const p = player;
  l7.phase = 'intro'; l7.t = 0; l7.sub = 0;
  l7.fire = 1; l7.hasMirror = false; l7.scene = 'house';
  l7.blackA = 1; l7.fadeOut = false;
  l7.dialog = null; l7.queue = [];
  l7.witch = null; l7.princess = null; l7.heads = []; l7.headCool = 0;
  l7.reached = false; l7.crossed = false; l7.flash = 0;
  l7.card = 0; l7._advanced = false;
  p.x = 200; p.y = GROUND7; p.vx = 0; p.vy = 0; p.facing = 1;
  p.state = 'ground'; p.onGround = true; p.started = true;
  p.hasSword = true; p.sheathed = true; p.swordIdle = 6; p.drawT = 0;
  p.whiteHair = false; p.walkCap = 0; p.crouch = false;
  cam.x = VW / 2; cam.y = VH / 2; cam.zoom = 1;
}

// advance the state machine into a new scripted beat, keeping the screen dark so
// the beat fades in cleanly
function l7Goto(phase) { l7.phase = phase; l7.t = 0; l7.sub = 0; l7.fadeOut = false; }

// -------------------------------------------------------------- per-frame logic
function updateL7(dt) {
  const p = player;
  l7.t += dt; p.t = (p.t || 0) + dt;
  l7.flash = Math.max(0, l7.flash - dt * 1.6);
  if (Math.abs(p.vx) > 8) p.runPhase += Math.abs(p.vx) * dt * 0.05;

  // the flying souls in the river vision drift steadily off to the right
  if (l7.scene === 'river') {
    l7.headCool -= dt;
    if (l7.headCool <= 0 && l7.witch && l7.witch.appear > 0.6) {
      l7.headCool = 0.45 + love.math.random() * 0.4;
      l7.heads.push({ x: l7.witch.x + 10, y: l7.witch.y - 40 - love.math.random() * 40, ph: love.math.random() * 6.28, sp: 150 + love.math.random() * 90 });
    }
  }
  for (let i = l7.heads.length - 1; i >= 0; i--) {
    const h = l7.heads[i]; h.x += h.sp * dt; h.y -= 14 * dt;
    if (h.x > VW + 60) l7.heads.splice(i, 1);
  }

  switch (l7.phase) {
    // ---- fade up on the hut interior, the hearth burning ------------------
    case 'intro': {
      p.vx = 0; p.facing = 1;
      l7.blackA = Math.max(0, 1 - l7.t / 1.1);
      if (l7.t > 2.6) l7Goto('walkFire');
      break;
    }

    // ---- the player walks (slowly) toward the fire, then is stopped -------
    case 'walkFire': {
      l7.blackA = 0;
      if (!l7.reached) {
        p.walkCap = WALK7;
        updatePlayer(dt, p);
        if (p.x < 150) { p.x = 150; p.vx = 0; }
        if (p.x >= STOP_FIRE_X) { p.x = STOP_FIRE_X; p.vx = 0; p.facing = 1; l7.reached = true; l7.t = 0; }
      } else {
        p.walkCap = 0; p.vx = 0; p.facing = 1;
        if (l7.t > 0.6) { l7Goto('fireOut'); }
      }
      break;
    }

    // ---- the hearth dies; the King lingers in the gloom, then it snaps dark ----
    case 'fireOut': {
      p.vx = 0; p.facing = 1;
      l7.fire = Math.max(0, 1 - l7.t / 0.7);            // the flames gutter out quickly
      l7.blackA = clamp((l7.t - 1.15) / 0.4, 0, 1);      // he stays visible a moment, then a fast fall to black
      if (l7.t > 1.75) {
        l7Queue([ l7Line('WITCH', 'War — and all the suffering it breeds — is the root of every tragedy that men endure in this world.') ]);
        l7Goto('dark1');
      }
      break;
    }

    // ---- her first words, spoken out of the dark -------------------------
    case 'dark1': {
      p.vx = 0; l7.blackA = 1;
      l7Dialog(dt);
      if (l7DialogDone() && l7.t > 1.0) {
        // set the balcony-over-the-war vision, then fade it in
        l7.scene = 'war'; p.x = 300; p.y = BALCONY_Y; p.facing = 1;
        l7Queue([
          l7Line('HERO', 'And what does any of this have to do with what you did to my family — to my queen?'),
          l7Line('WITCH', 'The war before you was fought decades ago, when you were still a child. You are the son of a king and queen who waged war on land after land in their hunger for conquest — until the day your father’s army came upon my people.'),
        ]);
        l7Goto('war');
      }
      break;
    }

    // ---- generic "vision" beats: fade in, speak, fade out, advance -------
    case 'war':       l7Vision(dt, function () {
      l7.scene = 'deadpalace'; p.x = 260; p.y = GROUND7; p.facing = 1;
      l7Queue([ l7Line('WITCH', 'Your kingdom’s soldiers cut my people down and seized our realm. But your father never knew the power we guarded — a power that outreaches death itself. And it took its vengeance.') ]);
      l7Goto('deadpalace');
    }); break;

    case 'deadpalace': l7Vision(dt, function () {
      l7.scene = 'river'; p.x = 250; p.y = GROUND7; p.facing = 1;
      l7.witch = { x: 760, y: 470, appear: 0 }; l7.heads = []; l7.headCool = 0.5;
      l7Queue([ l7Line('WITCH', 'The curse fell upon your kingdom, and none were spared — none but you. As an infant you were hidden away and cast out into the world, with death at your back. Wandering as a young man, you met the princess — and her kingdom took you in for the aid you gave the night the vizier wove his treason against the palace.') ]);
      l7Goto('river');
    }); break;

    case 'river': {
      if (l7.witch) l7.witch.appear = Math.min(1, l7.witch.appear + dt * 1.1);
      l7Vision(dt, function () {
        l7.scene = 'warpalace'; p.x = 320; p.y = GROUND7; p.facing = 1; l7.witch = null;
        l7Queue([ l7Line('WITCH', 'And when you took the throne — like your father before you, though you remembered nothing of him — you decided the surest way to shield your people was to carry war across the world.') ]);
        l7Goto('warpalace');
      });
      break;
    }

    // ---- the throne hall, war outside; the queen leaps from the window ---
    case 'warpalace': {
      p.vx = 0; p.facing = 1;
      // fade in
      if (!l7.fadeOut) l7.blackA = Math.max(0, l7.blackA - dt / 0.9);
      if (l7.blackA < 0.4) l7Dialog(dt);
      if (l7.sub === 0 && l7DialogDone()) {
        // the queen simply appears on the edge of the window, fading in
        l7.princess = { x: 1045, y: 500, phase: 'stand', t: 0, appear: 0 };
        l7.sub = 1;
      } else if (l7.sub === 1) {
        const pr = l7.princess; pr.t += dt;
        pr.appear = Math.min(1, pr.appear + dt * 1.2);             // fades into being on the sill
        if (pr.appear >= 1 && pr.t > 1.1) {
          l7.sub = 2;
          l7Queue([ l7Line('WITCH', 'The princess could not bear the weight of the grief your wars had sown. Her heart simply gave way.') ]);
        }
      } else if (l7.sub === 2) {
        l7Dialog(dt);
        if (l7DialogDone()) { l7.fadeOut = true; l7.sub = 3; }
      } else if (l7.sub === 3) {
        l7.blackA = Math.min(1, l7.blackA + dt / 0.9);
        if (l7.blackA >= 1) {
          l7.princess = null;
          l7Queue([ l7Line('HERO', 'No. It was your curse that drove her to it. You hunger for vengeance for my father’s sins — and you have spent it all upon my queen.') ]);
          l7Goto('dark2');
        }
      }
      break;
    }

    // ---- his denial in the dark, then home to the hut + the mirror -------
    case 'dark2': {
      p.vx = 0; l7.blackA = 1;
      l7Dialog(dt);
      if (l7DialogDone() && l7.t > 0.8) {
        l7.scene = 'house'; l7.fire = 1; l7.hasMirror = true;
        p.x = 220; p.y = GROUND7; p.facing = 1; p.whiteHair = false;
        l7Queue([ l7Line('WITCH', 'Your heart refuses the truth. So let me give you a gift.') ]);
        l7Goto('mirrorReveal');
      }
      break;
    }

    case 'mirrorReveal': {
      p.vx = 0; p.facing = 1;
      l7.blackA = Math.max(0, l7.blackA - dt / 0.9);
      if (l7.blackA < 0.4) l7Dialog(dt);
      if (l7DialogDone() && l7.blackA <= 0) l7Goto('walkMirror');
      break;
    }

    // ---- the player walks through the mirror; his hair turns white -------
    case 'walkMirror': {
      l7.blackA = 0;
      p.walkCap = WALK7;
      updatePlayer(dt, p);
      if (p.x < 180) { p.x = 180; p.vx = 0; }
      if (!l7.crossed && p.x >= MIRROR_X) {
        l7.crossed = true; l7.flash = 1; p.whiteHair = true;
        if (sfxParry) sfxParry.play(0.5, 1.3);
        spawnDust(MIRROR_X, GROUND7 - 60, 12, 1.2);
      }
      if (p.x >= 880) { p.x = 880; p.vx = 0; p.walkCap = 0; p.facing = 1; l7Goto('mirrorAfter'); }
      break;
    }

    // ---- the reckoning: her truth, his grief, and his answer -------------
    case 'mirrorAfter': {
      p.vx = 0; p.facing = 1;
      if (l7.sub === 0) {
        if (l7.queue.length === 0 && !l7.dialog) {
          l7Queue([ l7Line('WITCH', 'For thirty years you have hunted a culprit for your queen’s death. But the wellspring of that sorrow is within you. Life has moved on: your son is a king now, and a warlord, and without your hand to guide him he will repeat your every sin. Your own life is all but spent — you are old, and sick — and you will never find your queen’s soul imprisoned here, for she was never victim to any spell of mine.') ]);
        }
        l7Dialog(dt);
        if (l7DialogDone()) { l7.sub = 1; l7.t = 0; }
      } else if (l7.sub === 1) {          // he sinks down, weeping
        p.crouch = true;
        if (l7.t > 2.6) { l7.sub = 2; l7.t = 0; }
      } else if (l7.sub === 2) {          // and rises again
        p.crouch = false;
        if (l7.t > 0.7) {
          p.sheathed = false; p.swordIdle = 0; p.drawT = DRAW_DUR;   // he draws the blade to challenge her
          if (sfxSwing) sfxSwing.play(0.3, 1.2);
          l7Queue([ l7Line('HERO', 'Then I will end this spiral of hatred. I will free every soul your spells have bound, and put my legacy of death to rest. Face me, witch — I will break your power once and for all!') ]);
          l7.sub = 3;
        }
      } else if (l7.sub === 3) {
        // no physics runs during a cutscene beat, so tick the draw down ourselves;
        // once the quick draw finishes, hold the blade RAISED in defiance (the
        // guard pose sweeps it high-forward, fully "set" for blockT < BLOCK_DUR-0.10)
        p.drawT = Math.max(0, (p.drawT || 0) - dt);
        if (p.drawT <= 0) p.blockT = BLOCK_DUR - 0.12;
        l7Dialog(dt);
        if (l7DialogDone()) { l7.sub = 4; l7.t = 0; }
      } else if (l7.sub === 4) {          // fade out into the dark, blade still raised
        p.blockT = BLOCK_DUR - 0.12;
        l7.blackA = Math.min(1, l7.blackA + dt / 1.2);
        if (l7.blackA >= 1) l7Goto('done');
      }
      break;
    }

    case 'done': {
      p.vx = 0; l7.blackA = 1; l7.card += dt;
      break;
    }
  }
}

// the shared body of a talk-only "vision" beat: fade in → speak → fade out →
// run the caller's `next` to set up the following beat
function l7Vision(dt, next) {
  if (!l7.fadeOut) {
    l7.blackA = Math.max(0, l7.blackA - dt / 0.9);
    if (l7.blackA < 0.4) l7Dialog(dt);
    if (l7DialogDone() && l7.blackA <= 0 && l7.t > 1.2) l7.fadeOut = true;
  } else {
    l7.blackA = Math.min(1, l7.blackA + dt / 0.9);
    if (l7.blackA >= 1) next();
  }
}

// ============================================================================
//  SCENERY — every scene is drawn in screen space (the camera is pinned centre)
// ============================================================================

// -------------------------------------------------------------- the hut interior
function drawRoom7() {
  // warm dark wooden room
  lg.gradientRect(0, 0, VW, VH, [0.14, 0.10, 0.08], [0.07, 0.05, 0.04]);
  // back wall log courses
  lg.setColor(0.16, 0.11, 0.08, 1); lg.rectangle('fill', 0, 0, VW, GROUND7);
  lg.setColor(0.11, 0.08, 0.05, 1);
  for (let y = 40; y < GROUND7; y += 34) lg.rectangle('fill', 0, y, VW, 3);
  lg.setColor(0.22, 0.16, 0.10, 0.5);
  for (let y = 44; y < GROUND7; y += 34) lg.rectangle('fill', 0, y, VW, 1.4);
  // a couple of roof beams up top
  lg.setColor(0.09, 0.06, 0.04, 1);
  lg.rectangle('fill', 0, 26, VW, 20);
  for (let x = 90; x < VW; x += 230) { lg.push(); lg.translate(x, 0); lg.rotate(0.5); lg.rectangle('fill', -8, 20, 16, 150); lg.pop(); }
  // plank floor — horizontal boards receding toward the viewer
  lg.setColor(0.20, 0.14, 0.09, 1); lg.rectangle('fill', 0, GROUND7, VW, VH - GROUND7);
  lg.setColor(0.13, 0.09, 0.05, 1);
  for (let y = GROUND7 + 22; y < VH; y += 30) lg.rectangle('fill', 0, y, VW, 3);
  lg.setColor(0.26, 0.18, 0.11, 0.4);
  for (let y = GROUND7 + 24; y < VH; y += 30) lg.rectangle('fill', 0, y, VW, 1.2);
  for (let x = 60; x < VW; x += 190) { lg.setColor(0.10, 0.07, 0.04, 0.7); lg.rectangle('fill', x, GROUND7, 2, VH - GROUND7); }   // board seams
  lg.setColor(0.30, 0.20, 0.12, 0.6); lg.rectangle('fill', 0, GROUND7, VW, 3);

  drawHearth7();
  if (l7.hasMirror) {
    // a low warm rug hint under the mirror
    lg.setColor(0.35, 0.14, 0.12, 0.5); lg.ellipse('fill', MIRROR_X, GROUND7 + 6, 150, 22);
  }
}

function drawHearth7() {
  const x = FIRE_X, gy = GROUND7;
  // stone surround
  lg.setColor(0.22, 0.21, 0.20, 1); lg.rectangle('fill', x - 118, gy - 210, 236, 210);
  lg.setColor(0.14, 0.13, 0.12, 1); lg.rectangle('fill', x - 86, gy - 150, 172, 150);   // the dark firebox recess
  // rough stone blocks
  lg.setColor(0.30, 0.28, 0.26, 1);
  for (let ry = gy - 206; ry < gy - 150; ry += 26) for (let rx = x - 116; rx < x + 100; rx += 40)
    lg.rectangle('fill', rx + ((ry / 26) % 2) * 8, ry, 34, 22);
  // mantel beam
  lg.setColor(0.30, 0.20, 0.12, 1); lg.rectangle('fill', x - 130, gy - 214, 260, 16);
  lg.setColor(0.40, 0.27, 0.16, 0.7); lg.rectangle('fill', x - 130, gy - 214, 260, 4);
  // logs
  lg.setColor(0.24, 0.15, 0.08, 1);
  lg.rectangle('fill', x - 52, gy - 22, 104, 16);
  lg.push(); lg.translate(x - 10, gy - 28); lg.rotate(0.3); lg.rectangle('fill', -50, 0, 100, 14); lg.pop();
  lg.setColor(0.36, 0.24, 0.14, 1); lg.circle('fill', x - 52, gy - 14, 8); lg.circle('fill', x + 52, gy - 14, 8);

  const f = l7.fire;
  // ember bed always glows a little while there's any fire
  lg.setColor(1.0, 0.4, 0.12, 0.3 + 0.5 * f); lg.ellipse('fill', x, gy - 8, 60, 10);
  if (f > 0.02) {
    // dancing flames, scaled by the fire level
    for (let i = 0; i < 7; i++) {
      const fx = x - 48 + i * 16 + Math.sin(T * 6 + i) * 4;
      const flick = (0.6 + 0.4 * Math.sin(T * 11 + i * 1.7)) * f;
      const h = (34 + (i % 3) * 14) * flick;
      lg.setColor(1.0, 0.32, 0.06, 0.5 * f); lg.polygon('fill', fx - 8, gy - 10, fx + 8, gy - 10, fx + 2, gy - 10 - h * 1.3, fx - 3, gy - 10 - h * 1.4);
      lg.setColor(1.0, 0.62, 0.16, 0.8 * f); lg.polygon('fill', fx - 5, gy - 10, fx + 5, gy - 10, fx, gy - 10 - h);
      lg.setColor(1.0, 0.92, 0.5, 0.9 * f); lg.polygon('fill', fx - 2.4, gy - 10, fx + 2.4, gy - 10, fx, gy - 10 - h * 0.55);
    }
    // firelight cast into the room
    lg.setColor(1.0, 0.55, 0.2, 0.10 * f + 0.04 * Math.sin(T * 5)); lg.ellipse('fill', x, gy - 40, 260, 200);
  } else {
    // a last curl of smoke once it's out
    lg.setColor(0.5, 0.5, 0.5, 0.10);
    for (let i = 0; i < 4; i++) { const sy = gy - 20 - ((T * 24 + i * 30) % 120); lg.circle('fill', x + Math.sin(sy * 0.05) * 12, sy, 6 + (gy - sy) * 0.05); }
  }
}

// the tall standing mirror in the middle of the hall (drawn in FRONT of the hero,
// so crossing it reads as passing INTO it)
function drawMirror7() {
  if (!l7.hasMirror) return;
  const x = MIRROR_X, gy = GROUND7, top = gy - 250, w = 96;
  // the reflective glass — a cold, faintly rippling sheet
  lg.setColor(0.10, 0.13, 0.18, 1); lg.rectangle('fill', x - w / 2, top, w, gy - top);
  for (let i = 0; i < 14; i++) {
    const k = i / 14;
    lg.setColor(0.24 - k * 0.14, 0.30 - k * 0.16, 0.40 - k * 0.20, 0.5);
    lg.rectangle('fill', x - w / 2, top + k * (gy - top), w, (gy - top) / 14 + 1);
  }
  // a pale sheen sliding across the glass
  lg.setColor(0.7, 0.85, 1.0, 0.10 + 0.06 * Math.sin(T * 1.3));
  const sh = ((T * 40) % (gy - top));
  lg.polygon('fill', x - w / 2, top + sh, x - w / 2 + 26, top + sh, x - w / 2 + 6, top + sh + 40, x - w / 2 - 20, top + sh + 40);
  // ornate gold frame
  const GOLD = [0.72, 0.56, 0.24], GOLDL = [0.95, 0.80, 0.40];
  setColA(GOLD); lg.setLineWidth(10);
  lg.rectangle('line', x - w / 2, top, w, gy - top);
  setColA(GOLDL); lg.setLineWidth(3); lg.rectangle('line', x - w / 2, top, w, gy - top);
  lg.setLineWidth(1);
  setColA(GOLD); lg.ellipse('fill', x, top - 6, w * 0.6, 14);          // crest
  lg.rectangle('fill', x - w / 2 - 8, gy - 6, w + 16, 10);             // foot
  // the flash of the crossing
  if (l7.flash > 0) {
    lg.setColor(1, 1, 1, l7.flash * 0.85); lg.rectangle('fill', x - w / 2 - 6, top - 6, w + 12, gy - top + 12);
    lg.setColor(1, 1, 1, l7.flash * 0.4); lg.ellipse('fill', x, (top + gy) / 2, w * 1.6, (gy - top) * 0.7);
  }
}

// -------------------------------------------------------------- the war balcony
// The King stands high on a balcony ledge (near the top of the view) and looks
// DOWN at a battlefield that fills the lower two-thirds of the screen.
const BALCONY_Y = 152;      // the ledge the hero stands on

function drawWarScene7() {
  // burning night sky above the ledge
  lg.gradientRect(0, 0, VW, VH, [0.24, 0.10, 0.06], [0.06, 0.03, 0.05]);
  lg.setColor(0.9, 0.5, 0.2, 0.10); lg.ellipse('fill', VW * 0.5, 70, 700, 130);
  // distant burning skyline on the horizon (just under the ledge, far away)
  lg.setColor(0.05, 0.03, 0.04, 1);
  const rng = love.math.newRandomGenerator(7001);
  for (let x = 0; x < VW; x += 44) { const h = 26 + rng.random() * 60; lg.rectangle('fill', x, 250 - h, 38, h); }

  // --- the war, far below ---
  const top = 250;
  lg.setColor(0.05, 0.03, 0.03, 1); lg.rectangle('fill', 0, top, VW, VH - top);   // the dark valley floor
  lg.setColor(0.85, 0.35, 0.1, 0.16); lg.rectangle('fill', 0, top, VW, 90);        // fire-glow haze over it
  // ranks of tiny soldiers clashing across the field (smaller further up = further away)
  for (let row = 0; row < 4; row++) {
    const gy = top + 70 + row * 95, sc = 0.6 + row * 0.16;
    for (let i = 0; i < 10; i++) {
      const gx = 40 + i * 128 + (row % 2) * 60, ph = i * 1.3 + row;
      // a duel: the two combatants FACE each other and swing their blades inward,
      // so the strokes meet in the middle (they're fighting one another)
      drawFighter7(gx, gy, 1, ph, [0.09, 0.08, 0.09], sc);              // left man strikes to the right
      drawFighter7(gx + 34 * sc, gy, -1, ph, [0.11, 0.07, 0.07], sc);   // right man strikes to the left
      // a bright clash spark between them at the peak of each swing
      if (Math.sin(T * 7 + ph) > 0.55) { lg.setColor(1, 0.92, 0.6, 0.85); lg.circle('fill', gx + 17 * sc, gy - 28 * sc, 2.4 * sc); }
    }
  }
  // scattered fires burning on the field
  for (let i = 0; i < 10; i++) { const fx = 70 + i * 128, fy = top + 120 + (i % 3) * 110, fl = 0.6 + 0.4 * Math.sin(T * 9 + i); lg.setColor(1, 0.5, 0.15, 0.8); lg.polygon('fill', fx - 6, fy, fx + 6, fy, fx, fy - 20 * fl); lg.setColor(1, 0.85, 0.4, 0.9); lg.polygon('fill', fx - 3, fy, fx + 3, fy, fx, fy - 11 * fl); }
  // smoke rising up toward the balcony
  lg.setColor(0.2, 0.15, 0.15, 0.4);
  for (let i = 0; i < 7; i++) { const bx = 110 + i * 175; for (let s = 0; s < 6; s++) { const sy = top + 40 - s * 30 - (T * 12 % 30); lg.circle('fill', bx + Math.sin(sy * 0.03 + i) * 24, sy, 14 + s * 7); } }

  // the stone balcony ledge the King stands on (near the top)
  lg.setColor(0.20, 0.19, 0.22, 1); lg.rectangle('fill', 0, BALCONY_Y, VW, 40);
  lg.setColor(0.28, 0.26, 0.30, 1); lg.rectangle('fill', 0, BALCONY_Y, VW, 4);
  lg.setColor(0.12, 0.11, 0.14, 1); lg.rectangle('fill', 0, BALCONY_Y + 36, VW, 6);
}

// a small silhouette combatant swinging a weapon
function drawFighter7(x, y, face, ph, col, sc) {
  sc = sc || 1;
  const sw = Math.sin(T * 7 + ph);   // quick, urgent sword-strokes
  setColA(col);
  lg.polygon('fill', x - 5 * sc, y, x + 5 * sc, y, x + 3 * sc, y - 22 * sc, x - 3 * sc, y - 22 * sc);   // body
  lg.circle('fill', x, y - 26 * sc, 4 * sc);                                        // head
  lg.setLineWidth(2.4 * sc); lg.line(x, y, x - 4 * face * sc, y + 12 * sc); lg.line(x, y, x + 5 * face * sc, y + 12 * sc);   // legs
  lg.line(x, y - 18 * sc, x + face * (10 + sw * 4) * sc, y - (24 + sw * 6) * sc);   // sword arm
  setColA([0.6, 0.62, 0.66]); lg.setLineWidth(1.6 * sc);
  lg.line(x + face * (10 + sw * 4) * sc, y - (24 + sw * 6) * sc, x + face * (20 + sw * 6) * sc, y - (30 + sw * 12) * sc);
  lg.setLineWidth(1);
}

// -------------------------------------------------------------- the dark palace of the dead
function drawDeadPalace7() {
  lg.gradientRect(0, 0, VW, VH, [0.07, 0.06, 0.10], [0.03, 0.03, 0.06]);
  // cold stone wall
  lg.setColor(0.10, 0.10, 0.15, 1); lg.rectangle('fill', 0, 0, VW, GROUND7);
  lg.setColor(0.06, 0.06, 0.10, 1);
  for (let y = 46; y < GROUND7; y += 40) lg.rectangle('fill', 0, y, VW, 3);
  for (let x = 60; x < VW; x += 90) lg.rectangle('fill', x, 0, 3, GROUND7);
  // the witch's emblem, hung as war-banners along the wall
  for (const bx of [230, 640, 1050]) {
    lg.setColor(0.05, 0.07, 0.08, 1); lg.rectangle('fill', bx - 40, 40, 80, 180);
    lg.setColor(0.09, 0.12, 0.13, 1); lg.rectangle('fill', bx - 40, 40, 80, 8);
    drawEmblem(bx, 130, 34, 0.85, null);
    lg.setColor(0.05, 0.07, 0.08, 1); lg.polygon('fill', bx - 40, 220, bx + 40, 220, bx, 244);
  }
  // dark stone floor
  lg.setColor(0.08, 0.08, 0.12, 1); lg.rectangle('fill', 0, GROUND7, VW, VH - GROUND7);
  lg.setColor(0.05, 0.05, 0.08, 1);
  for (let x = 0; x < VW; x += 120) lg.rectangle('fill', x, GROUND7, 2, VH - GROUND7);
  // spilled blood + the fallen: soldiers and women strewn across the flags
  const bodies = [
    { x: 430, w: 60, kind: 'soldier' }, { x: 560, w: 52, kind: 'woman' },
    { x: 720, w: 62, kind: 'soldier' }, { x: 900, w: 52, kind: 'woman' },
    { x: 1010, w: 60, kind: 'soldier' }, { x: 150, w: 52, kind: 'woman' },
  ];
  for (const b of bodies) drawCorpse7(b.x, GROUND7 + 22, b.kind);
}

function drawCorpse7(x, y, kind) {
  // pooled blood
  lg.setColor(0.30, 0.05, 0.06, 0.55); lg.ellipse('fill', x, y + 8, 42, 9);
  const robe = kind === 'woman' ? [0.55, 0.22, 0.40] : [0.24, 0.22, 0.28];
  // a body lying flat, head to one side (left)
  setColA(robe); lg.push(); lg.translate(x, y); lg.rotate(-0.05);
  lg.polygon('fill', -30, 0, 30, 0, 24, -13, -26, -13);
  lg.pop();
  const hxp = x - 34, hyp = y - 8;
  if (kind === 'woman') {
    // only the long hair shows (face turned away / hair spilled over the head)
    setColA([0.30, 0.16, 0.10]);
    lg.ellipse('fill', hxp - 2, hyp + 1, 9, 7);                                  // the head, veiled in hair
    lg.polygon('fill', hxp + 2, hyp - 6, hxp - 30, hyp - 1, hxp - 28, hyp + 8, hxp + 2, hyp + 4);
    lg.ellipse('fill', hxp - 14, hyp + 5, 15, 6);
    setColA(robe); lg.setLineWidth(5); lg.line(x + 6, y - 8, x + 30, y - 2); lg.setLineWidth(1);   // outflung arm
  } else {
    setColA([0.78, 0.58, 0.42]); lg.circle('fill', hxp, hyp, 7);                 // head
    // a steel helmet over it (dome + brow rim + noseguard)
    setColA([0.44, 0.46, 0.52]); lg.circle('fill', hxp, hyp - 3, 8);            // dome
    setColA([0.58, 0.60, 0.66]); lg.circle('fill', hxp - 2.6, hyp - 5, 2.6);    // highlight
    setColA([0.28, 0.30, 0.35]); lg.rectangle('fill', hxp - 9, hyp - 1.5, 18, 3);  // brow rim
    lg.rectangle('fill', hxp - 1.2, hyp - 1.5, 2.4, 8);                          // noseguard
    setColA(robe); lg.setLineWidth(5); lg.line(x + 6, y - 8, x + 24, y - 3); lg.setLineWidth(1);   // arm to the blade
    setColA([0.55, 0.55, 0.6]); lg.setLineWidth(3); lg.line(x + 18, y - 3, x + 48, y + 4); lg.setLineWidth(1);  // dropped sword
    setColA([0.35, 0.24, 0.14]); lg.circle('fill', x + 18, y - 3, 2.4);          // its hilt
  }
}

// -------------------------------------------------------------- the soul-river vision
function drawRiverScene7() {
  lg.gradientRect(0, 0, VW, VH, [0.04, 0.08, 0.07, 1], [0.02, 0.05, 0.05]);
  // far conifers
  lg.setColor(0.05, 0.09, 0.07, 1);
  for (let x = -20; x < VW; x += 120) { lg.polygon('fill', x, 300, x + 44, 90, x + 88, 300); lg.rectangle('fill', x + 38, 300, 12, 90); }
  // ground
  lg.setColor(0.06, 0.10, 0.08, 1); lg.rectangle('fill', 0, GROUND7, VW, VH - GROUND7);
  // the glowing river running along the mid-ground
  const ry = 470;
  for (let i = 0; i < 18; i++) { const k = i / 18; lg.setColor(lerp(0.08, 0.01, k), lerp(0.55, 0.05, k), lerp(0.60, 0.10, k), 1); lg.rectangle('fill', 0, ry + i * 6, VW, 7); }
  lg.setColor(0.35, 1.0, 0.9, 0.5); lg.rectangle('fill', 0, ry, VW, 8);
  lg.setColor(0.5, 1.0, 0.92, 0.22); lg.rectangle('fill', 0, ry - 5, VW, 6);
  for (let g = 0; g < 3; g++) { lg.setColor(0.35, 0.98, 0.85, 0.10 - g * 0.03); lg.rectangle('fill', 0, ry - 16 - g * 14, VW, 16); }
}

// the Witch, raising her staff over the river and loosing the death-souls
function drawWitchL7() {
  const w = l7.witch; if (!w) return;
  const a = clamp(w.appear, 0, 1); if (a <= 0) return;
  const float = Math.sin(T * 1.4) * 4;
  lg.push(); lg.translate(w.x, w.y - 20 + float); lg.scale(0.78, 0.78);
  lg.setColor(0.4, 0.8, 0.75, 0.12 * a); lg.circle('fill', 0, -20, 66);
  // robe
  lg.setColor(0.05, 0.09, 0.09, 0.9 * a); lg.polygon('fill', -26, 70, 26, 70, 13, -50, -13, -50);
  for (let i = -2; i <= 2; i++) lg.polygon('fill', i * 9 - 3, 70, i * 9 + 3, 70, i * 9, 82 + Math.sin(T * 2 + i) * 4);
  // raised staff arm
  lg.setColor(0.06, 0.10, 0.10, 0.9 * a); lg.polygon('fill', 8, -30, 30, -70, 24, -74, 2, -34);
  // hood + eyes
  lg.setColor(0.04, 0.08, 0.08, 0.95 * a); lg.circle('fill', 0, -54, 15); lg.polygon('fill', -15, -48, 15, -48, 10, -72, -10, -72);
  lg.setColor(0.6, 0.98, 0.9, a); lg.circle('fill', -4.5, -56, 2.1); lg.circle('fill', 4.5, -56, 2.1);
  // the staff, tipped with a cold star
  lg.setColor(0.20, 0.16, 0.12, a); lg.setLineWidth(3.6); lg.line(28, -20, 40, -96); lg.setLineWidth(1);
  const tw = 0.6 + 0.4 * Math.sin(T * 5); lg.setColor(0.5, 1.0, 0.9, a * tw); lg.circle('fill', 40, -100, 6);
  lg.setColor(0.7, 1.0, 0.95, a * 0.3 * tw); lg.circle('fill', 40, -100, 14);
  lg.pop();
}

// a flying soul-head streaming off across the river
function drawSoulHead7(h) {
  const a = 0.7;
  lg.setColor(0.6, 1.0, 0.95, 0.12 * a); lg.circle('fill', h.x, h.y, 14);
  lg.setColor(0.85, 1.0, 0.98, 0.8 * a); lg.circle('fill', h.x, h.y, 6);           // skull
  lg.setColor(0.1, 0.3, 0.3, 0.9 * a); lg.circle('fill', h.x - 2.4, h.y - 1, 1.6); lg.circle('fill', h.x + 2.4, h.y - 1, 1.6);  // eyes
  // a trailing wisp
  lg.setColor(0.6, 1.0, 0.95, 0.4 * a);
  lg.polygon('fill', h.x - 6, h.y + 2, h.x + 4, h.y + 2, h.x - 14, h.y + 10 + Math.sin(T * 6 + h.ph) * 3);
}

// -------------------------------------------------------------- the throne hall at war
function drawWarPalace7() {
  lg.gradientRect(0, 0, VW, VH, [0.16, 0.12, 0.20], [0.07, 0.05, 0.10]);
  // hall wall
  lg.setColor(0.14, 0.11, 0.18, 1); lg.rectangle('fill', 0, 0, VW, GROUND7);
  // columns
  lg.setColor(0.20, 0.16, 0.24, 1);
  for (const cx of [120, 380, 900]) { lg.rectangle('fill', cx - 16, 40, 32, GROUND7 - 40); lg.setColor(0.26, 0.20, 0.30, 0.6); lg.rectangle('fill', cx - 16, 40, 6, GROUND7 - 40); lg.setColor(0.20, 0.16, 0.24, 1); }
  // a big arched window on the right, war raging beyond it
  const wx = 1080, wt = 70, wb = GROUND7 - 10, ww = 150;
  lg.setColor(0.32, 0.12, 0.06, 1); lg.rectangle('fill', wx - ww / 2, wt, ww, wb - wt);        // fiery sky
  lg.setColor(0.9, 0.5, 0.2, 0.25); lg.ellipse('fill', wx, wt + 80, ww, 120);
  lg.setColor(0.06, 0.03, 0.04, 1);                                                            // city burning outside
  for (let x = wx - ww / 2; x < wx + ww / 2; x += 26) { const h = 30 + ((x * 7) % 60); lg.rectangle('fill', x, wb - h, 22, h); }
  for (let i = 0; i < 5; i++) { const fx = wx - 50 + i * 26, fl = 0.6 + 0.4 * Math.sin(T * 8 + i); lg.setColor(1, 0.55, 0.18, 0.8); lg.polygon('fill', fx - 4, wb, fx + 4, wb, fx, wb - 22 * fl); }
  // gold window frame + mullions
  setColA([0.72, 0.56, 0.24]); lg.setLineWidth(8); lg.rectangle('line', wx - ww / 2, wt, ww, wb - wt);
  lg.line(wx, wt, wx, wb); lg.setLineWidth(4); lg.line(wx - ww / 2, (wt + wb) / 2, wx + ww / 2, (wt + wb) / 2);
  lg.setLineWidth(1);
  // throne on the left
  lg.setColor(0.30, 0.22, 0.10, 1); lg.rectangle('fill', 200, GROUND7 - 150, 90, 150);
  lg.setColor(0.42, 0.32, 0.14, 1); lg.rectangle('fill', 200, GROUND7 - 150, 90, 12);
  lg.setColor(0.7, 0.15, 0.15, 1); lg.rectangle('fill', 214, GROUND7 - 130, 62, 90);
  // floor
  lg.setColor(0.12, 0.09, 0.16, 1); lg.rectangle('fill', 0, GROUND7, VW, VH - GROUND7);
  lg.setColor(0.7, 0.15, 0.15, 0.5); lg.rectangle('fill', VW / 2 - 70, GROUND7, 140, VH - GROUND7);   // red carpet
}

// the queen: an articulated PROFILE figure built like the hero (thigh+shin legs,
// upper+fore arms), reskinned as a long-haired woman in a long dress — no cape.
// She simply appears on the window sill, fading in (pr.appear), and stands there.
function drawPrincess7() {
  const pr = l7.princess; if (!pr) return;
  const walking = pr.phase === 'walk';
  const step = pr.t * 9;
  const bob = walking ? Math.abs(Math.sin(step)) * 1.4 : Math.sin(T * 1.3) * 0.5;
  const A = pr.appear != null ? pr.appear : 1;   // fade-in alpha on the sill
  if (A <= 0) return;
  const skin = [0.90, 0.68, 0.52, A], dress = [0.80, 0.30, 0.46, A], dressL = [0.93, 0.52, 0.66, A], hair = [0.30, 0.16, 0.09, A];
  lg.push();
  lg.translate(pr.x, pr.y - bob);
  lg.scale(1, 1);   // she faces right (into the hall, then the burning window)
  const hipY = -40, chY = -58;

  // --- legs: thigh + shin, hero-style walk cycle (shins show below the hem) ---
  for (const side of [-1, 1]) {
    const sw = walking ? Math.sin(step + (side > 0 ? 0 : Math.PI)) : (side * 0.10);
    const hipX = side * 1.5;
    const kneeX = hipX + sw * 4, kneeY = hipY + 18;
    const footX = hipX + sw * 9, footY = -0.5 - Math.max(0, sw) * 1.6;
    segment(hipX, hipY, kneeX, kneeY, 2.6, 2.1, skin);
    segment(kneeX, kneeY, footX, footY, 2.1, 1.7, skin);
    setColA([0.42, 0.28, 0.32, A]); lg.rectangle('fill', footX - 1.5, footY - 1, 6, 2.4);   // slipper
  }

  // --- long dress: bodice + a flaring skirt to mid-shin, swaying as she moves ---
  const sway = walking ? Math.sin(step) * 3 : Math.sin(T * 1.2) * 1.5;
  setColA(dress);
  lg.polygon('fill', -7, hipY - 2, 7, hipY - 2, 15 + sway, -16, -13 + sway, -16);   // skirt
  setColA(mul(dress, 0.82, A)); lg.polygon('fill', 1, hipY - 2, 7, hipY - 2, 15 + sway, -16, 5 + sway, -16);
  setColA(dress); lg.polygon('fill', -6, hipY + 1, 6, hipY + 1, 6, chY + 2, -6, chY + 2);   // bodice
  setColA(dressL); lg.polygon('fill', -6, chY + 2, 2, chY + 1, 2, hipY + 1, -6, hipY + 1);   // lit front

  // --- arms: upper + fore, swinging opposite the legs ---
  for (const side of [1, -1]) {
    const sw = walking ? Math.sin(step + (side > 0 ? Math.PI : 0)) : 0.12;
    const shX = side * 1.0, shY = chY + 2;
    const elX = shX + sw * 5, elY = shY + 12;
    const haX = elX + sw * 4 + 2, haY = elY + 9;
    const col = side > 0 ? dress : mul(dress, 0.78, A);
    segment(shX, shY, elX, elY, 2.1, 1.7, col);
    segment(elX, elY, haX, haY, 1.7, 1.4, col);
    setColA(skin); lg.circle('fill', haX, haY, 2);   // hand
  }

  // --- head (profile) + long flowing hair, no cape ---
  const hX = 1.2, hY = chY - 8;
  segment(0, chY - 1, hX, hY + 2, 2.0, 1.7, skin);                                     // neck
  setColA(skin); lg.circle('fill', hX, hY, 5.4);
  lg.polygon('fill', hX + 2.4, hY + 0.4, hX + 5.6, hY + 1.2, hX + 2.8, hY + 3.6);      // nose
  const hs = walking ? Math.sin(step) * 2 : Math.sin(T * 1.6) * 1.4;
  setColA(hair);
  lg.circle('fill', hX - 1.6, hY - 1.6, 5.8);                                          // crown of hair
  lg.polygon('fill', hX - 5, hY - 3, hX - 1, hY - 4, hX - 3 + hs, hipY - 2, hX - 9 + hs, hipY - 4);   // long tresses
  lg.polygon('fill', hX - 5, hY + 1, hX - 1, hY + 1, hX - 4 + hs, hipY - 6, hX - 10 + hs, hipY - 8);
  lg.pop();
}

// ============================================================================
//  DISPATCH ENTRY POINTS (called from engine.js)
// ============================================================================

// the far backdrop (drawn in screen space, before the world push)
function drawBackground7(cam) {
  switch (l7.scene) {
    case 'war': drawWarScene7(); break;
    case 'deadpalace': drawDeadPalace7(); break;
    case 'river': drawRiverScene7(); break;
    case 'warpalace': drawWarPalace7(); break;
    default: drawRoom7(); break;   // 'house'
  }
}

// mid-ground props that sit BEHIND the hero (world layer, identity transform)
function drawL7Mid() {
  if (l7.scene === 'river') { drawWitchL7(); for (const h of l7.heads) drawSoulHead7(h); }
  if (l7.scene === 'warpalace' && l7.princess) drawPrincess7();
}

// occluders that sit IN FRONT of the hero (world layer)
function drawL7Front() {
  if (l7.scene === 'war') drawBalconyRail7();
  if (l7.scene === 'house') drawMirror7();
}

// the low balustrade at the outer edge of the ledge, in front of the King's feet
function drawBalconyRail7() {
  const y = BALCONY_Y + 20;   // sits just in front of / below his feet, over the drop
  setColA([0.30, 0.28, 0.33]); lg.rectangle('fill', 0, y, VW, 8);            // top rail
  setColA([0.40, 0.38, 0.44]); lg.rectangle('fill', 0, y, VW, 3);
  for (let x = 16; x < VW; x += 38) { setColA([0.24, 0.22, 0.27]); lg.ellipse('fill', x, y + 22, 6, 16); }   // balusters
  setColA([0.20, 0.19, 0.23]); lg.rectangle('fill', 0, y + 34, VW, 6);      // base rail
}

// -------------------------------------------------------------- HUD / overlay
function drawL7Overlay() {
  // the darkness that fades scenes in and out (covers the hero too)
  if (l7.blackA > 0) { lg.setColor(0.02, 0.02, 0.03, l7.blackA); lg.rectangle('fill', 0, 0, VW, VH); }

  // location card on the opening
  if (l7.phase === 'intro' && FONT_LOC) {
    const a = clamp((l7.t - 0.6) / 1.0, 0, 1) * clamp((2.6 - l7.t) / 0.8, 0, 1);
    if (a > 0) { lg.setFont(FONT_LOC); lg.setColor(0.94, 0.86, 0.72, a); printSpaced('THE  HOUSE  IN  THE  FOREST', VW / 2, VH * 0.16, FONT_LOC, 5, 1); }
  }

  // a soft "walk" hint the first time control is his
  if ((l7.phase === 'walkFire' && !l7.reached && l7.t < 4.0) || (l7.phase === 'walkMirror' && !l7.crossed && l7.t < 4.0)) {
    const m = l7.phase === 'walkFire' ? 'Walk to the hearth  ·  ◂ ▸' : 'Walk into the mirror  ·  ◂ ▸';
    lg.setFont(FONT_HUD);
    lg.setColor(0.9, 0.86, 0.78, 0.35 + 0.25 * Math.sin(T * 3));
    lg.print(m, VW / 2 - FONT_HUD.getWidth(m) / 2, VH - 92);
  }

  // the crossing flash bleeds over the whole screen
  if (l7.flash > 0) { lg.setColor(1, 1, 1, l7.flash * 0.5); lg.rectangle('fill', 0, 0, VW, VH); }

  // dialogue subtitle (shared drawSubtitle; markers off for level 7)
  if (l7.dialog) drawSubtitle({ who: l7.dialog.who, text: l7.dialog.text });

  // the closing card
  if (l7.phase === 'done' && FONT_SUB) {
    lg.setColor(0.02, 0.02, 0.03, clamp(l7.card / 1.0, 0, 1)); lg.rectangle('fill', 0, 0, VW, VH);
    const a = clamp((l7.card - 0.8) / 1.2, 0, 1);
    if (a > 0) {
      lg.setFont(FONT_SUB);
      lg.setColor(0.55, 0.9, 0.82, a);
      printSpaced('AND  HE  TURNED  TO  FACE  HER', VW / 2, VH / 2 - 22, FONT_SUB, 4, 0.88);
      lg.setColor(0.92, 0.88, 0.82, a);
      printSpaced('TO  BE  CONTINUED', VW / 2, VH / 2 + 18, FONT_SUB, 6, 1);
      lg.setFont(FONT_HUD);
      lg.setColor(0.78, 0.72, 0.66, a * 0.85);
      const m = 'press  R  to  replay';
      lg.print(m, VW / 2 - FONT_HUD.getWidth(m) / 2, VH / 2 + 54);
    }
  }
}
