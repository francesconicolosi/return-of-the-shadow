// ============================================================================
//  characters/enemies-l6.js — Level 6 ("The Enchanted Wood") Forest Sentinel.
//
//  An antlered guardian of wood and moss: it duels at close range with a long
//  branch-lance (a blockable overhead slash, same choreography as the skeletons)
//  and, at mid range, charges its staff-orb and looses a bolt of blue forest
//  energy (parryable). It takes FOUR blows — from the hero's sword OR the
//  Fire-Sword's lava bullets — before it dissolves back into the wood.
//
//  Reuses rectsOverlap / heroSwordHitBox from enemies-l5.js and the shared
//  segment / swingBladeAngle / drawSlashTrail / drawSwordAt helpers. Resolves the
//  l6 state via the top-level scope. See plans/modularization-refactor.md.
// ============================================================================
'use strict';

const SENT_HP = 4;
// Palette from the concept sheet: muted grey-green armour, mossy bark, pale
// antler bone, weathered bronze, and a cold teal magic glow.
const SENT = {
  wood:   [0.30, 0.25, 0.18],   // bark limbs / spear haft
  woodD:  [0.20, 0.17, 0.12],
  plate:  [0.34, 0.38, 0.34],   // armour plate (grey-green)
  plateL: [0.47, 0.51, 0.45],
  plateD: [0.19, 0.23, 0.21],
  cloak:  [0.25, 0.33, 0.32],   // teal-grey cloak
  cloakD: [0.14, 0.20, 0.20],
  antler: [0.75, 0.72, 0.60],   // pale bone antlers
  bronze: [0.62, 0.50, 0.28],
  glow:   [0.46, 0.92, 0.96],   // cold teal forest energy
};

function newSentinel(x, x0, x1, kind) {
  return {
    x: x, y: 0, vx: 0, vy: 0, dir: -1, t: 0, cool: 0, fireCool: 0.4 + love.math.random() * 0.5,
    x0: x0, x1: x1, hp: SENT_HP, state: 'patrol', kind: kind || 'both',
    flash: 0, hitCool: 0, orb: 0.3, phase: love.math.random() * 6, deadT: 0, bolts: [], burning: false,
  };
}

// The hit volume of a standing sentinel — now reaches up to include the head.
function sentinelBox(s) {
  return { x1: s.x - 18, y1: s.y - 136, x2: s.x + 18, y2: s.y - 2 };
}

// Apply one blow (sword touch or lava bullet). Four blows fell it. A kill by the
// Fire-Sword's lava bullet sets it ablaze — it burns away instead of dissolving.
function damageSentinel(s, dirFromAttacker, fromFire) {
  if (s.state === 'dead' || s.hitCool > 0) return false;
  s.hp -= 1; s.hitCool = 0.42; s.flash = 0.3;
  s.state = 'stun'; s.t = 0; s.vx = dirFromAttacker * 300;
  spawnDust(s.x, s.y - 54, 7, 1.0);
  if (sfxHit) sfxHit.play(0.55, 0.9 + love.math.random() * 0.12);
  if (s.hp <= 0) {
    s.state = 'dead'; s.deadT = 0; s.bolts.length = 0; s.burning = !!fromFire;
    spawnDust(s.x, s.y - 40, 16, 1.5);
    if (fromFire) { spawnLavaSplash(s.x, s.y - 40, 10); if (sfxHit) sfxHit.play(0.5, 0.6); }
    if (sfxThunder) sfxThunder.play(0.28, 1.3);
    l6toast(fromFire ? 'The Sentinel is set ablaze and burns away!' : 'A Forest Sentinel dissolves back into the wood');
  } else {
    l6toast('Sentinel struck!  ' + s.hp + ' blow' + (s.hp === 1 ? '' : 's') + ' remain');
  }
  return true;
}

function sentinelShoot(s, p) {
  const ox = s.x + s.dir * 22, oy = s.y - 104;     // raised spear-tip / conjured orb
  const tx = p.x, ty = p.y - 30;
  const dx = tx - ox, dy = ty - oy, d = Math.hypot(dx, dy) || 1;
  const spd = 440;   // faster, deadlier bolts
  s.bolts.push({ x: ox, y: oy, vx: dx / d * spd, vy: dy / d * spd, t: 0, r: 8 });
  // sometimes a second bolt in a slight spread (harder to dodge)
  if (love.math.random() < 0.45) {
    const a = Math.atan2(dy, dx) + (love.math.random() - 0.5) * 0.22;
    s.bolts.push({ x: ox, y: oy, vx: Math.cos(a) * spd, vy: Math.sin(a) * spd, t: 0, r: 7 });
  }
  if (sfxSwing) sfxSwing.play(0.34, 1.35);
}

function updateSentinel(s, dt, p) {
  s.t += dt;
  s.flash = Math.max(0, s.flash - dt);
  s.hitCool = Math.max(0, s.hitCool - dt);
  s.cool = Math.max(0, s.cool - dt);
  s.fireCool = Math.max(0, s.fireCool - dt);
  // orb glow eases toward its state target
  const orbTarget = (s.state === 'aim') ? clamp(s.t / 0.55, 0, 1) : 0.3 + 0.12 * Math.sin(T * 3 + s.phase);
  s.orb = lerp(s.orb, orbTarget, Math.min(1, dt * 8));

  // keep the sentinel standing on its floor (a fixed canopy beam, or the ground)
  if (s.fixedY != null) { s.y = s.fixedY; }
  else { const g = floorAt(s.x, 0); s.y = (g !== undefined) ? g : FLOOR6; }

  // move its bolts regardless of state
  for (let i = s.bolts.length - 1; i >= 0; i--) {
    const b = s.bolts[i];
    b.t += dt; b.x += b.vx * dt; b.y += b.vy * dt;
    if (b.t > 3.2 || b.x < cam.x - VW * 0.72 || b.x > cam.x + VW * 0.72) { s.bolts.splice(i, 1); continue; }
    if (p.dying) continue;
    if (Math.abs(b.x - p.x) < b.r + 11 && b.y > heroTop(p) && b.y < p.y) {
      const dir = b.vx > 0 ? 1 : -1;
      if ((p.blockT || 0) > 0 && p.facing === -dir) {         // parry: disperse the bolt
        p.blockFlash = 0.25;
        if (sfxParry) sfxParry.play(0.45, 1.3 + love.math.random() * 0.1);
        spawnDust(b.x, b.y, 4, 0.8);
        s.bolts.splice(i, 1);
        continue;
      }
      if ((p.inv || 0) <= 0) { hurtPlayer(p, dir); spawnDust(b.x, b.y, 4, 0.8); s.bolts.splice(i, 1); }
    }
  }

  if (s.state === 'dead') { s.deadT += dt; return; }

  const dx = p.x - s.x, dy = p.y - s.y;
  const near = Math.abs(dx) < 460 && Math.abs(dy) < 130 && !p.dying;

  // CONTACT DAMAGE: brushing against the guardian's thorny bark hurts (the hero
  // must strike from sword-reach, not walk into it)
  if (!p.dying && (p.inv || 0) <= 0 && Math.abs(dx) < 20 && p.y > s.y - 100 && p.y < s.y + 20) {
    hurtPlayer(p, p.x < s.x ? -1 : 1);
    spawnDust(p.x, p.y - 30, 5, 0.9);
  }

  if (s.state === 'stun') {
    const nx = s.x + s.vx * dt;
    if (s.fixedY != null || floorAt(nx, s.y) !== undefined) s.x = nx;
    if (s.fixedY != null) s.x = clamp(s.x, s.x0 - 30, s.x1 + 30);
    s.vx *= (1 - Math.min(1, dt * 6));
    if (s.t > 0.5) { s.state = 'patrol'; s.t = 0; }
    return;
  }
  if (s.state === 'aim') {                                     // ranged telegraph → loose a bolt
    s.dir = dx >= 0 ? 1 : -1;
    if (s.t > 0.42) { sentinelShoot(s, p); s.state = 'patrol'; s.t = 0; s.fireCool = 0.5 + love.math.random() * 0.5; s.cool = 0.35; }
    return;
  }
  if (s.state === 'windup') {                                  // melee telegraph → strike
    s.dir = dx >= 0 ? 1 : -1;
    if (s.t > 0.4) {
      s.state = 'strike'; s.t = 0;
      if (Math.abs(dx) < 58 && Math.abs(dy) < 60) {
        if (tryParry(p, s.dir)) { s.state = 'stun'; s.t = 0; s.vx = -s.dir * 240; }
        else hurtPlayer(p, s.dir);
      }
    }
    return;
  }
  if (s.state === 'strike') {
    if (s.t > 0.24) { s.state = 'patrol'; s.t = 0; s.cool = 0.7; }
    return;
  }

  // patrol / approach
  if (near) {
    s.dir = dx >= 0 ? 1 : -1;
    const adx = Math.abs(dx);
    if (adx < 58 && s.cool <= 0) { s.state = 'windup'; s.t = 0; }
    else if (adx >= 96 && adx < 420 && s.fireCool <= 0 && s.kind !== 'melee') { s.state = 'aim'; s.t = 0; }
    else {
      // sidle to hold a firing distance: close in if far, back off if crowded
      const want = (adx > 240) ? s.dir : (adx < 80 ? -s.dir : 0);
      const nx = s.x + want * 48 * dt;
      if (want !== 0 && (s.fixedY != null ? (nx > s.x0 && nx < s.x1) : floorAt(nx + want * 12, s.y) !== undefined)) s.x = nx;
    }
  } else {
    s.x += s.dir * 30 * dt;
    if (s.x < s.x0) s.dir = 1; else if (s.x > s.x1) s.dir = -1;
    if (s.fixedY == null && floorAt(s.x + s.dir * 14, s.y) === undefined) s.dir = -s.dir;
  }
}

// ------------------------------------------------------------------ L6 art
function drawSentinelBolt(b) {
  const G = SENT.glow;
  // comet tail of fading orbs
  for (let i = 1; i <= 4; i++) {
    lg.setColor(G[0], G[1], G[2], 0.12 * (1 - i / 5));
    lg.circle('fill', b.x - b.vx * 0.012 * i, b.y - b.vy * 0.012 * i, b.r * (1.5 - i * 0.22));
  }
  lg.setColor(G[0], G[1], G[2], 0.22); lg.circle('fill', b.x, b.y, b.r * 2.0);
  lg.setColor(0.28, 0.62, 0.8, 1); lg.circle('fill', b.x, b.y, b.r);
  lg.setColor(0.9, 1.0, 1.0, 1); lg.circle('fill', b.x - 1.3, b.y - 1.3, b.r * 0.5);
  // crackling arcs
  lg.setColor(G[0], G[1], G[2], 0.6); lg.setLineWidth(1);
  for (let k = 0; k < 3; k++) { const a = T * 8 + k * 2.1 + b.t * 10; lg.line(b.x, b.y, b.x + Math.cos(a) * b.r * 1.9, b.y + Math.sin(a) * b.r * 1.9); }
  lg.setLineWidth(1);
}

// A tall, elegant armoured guardian (see the concept sheet): antler crown, a
// carved wooden mask with teal eyes, layered grey-green plate over bark limbs,
// a long flowing cloak, and a branch-spear it THRUSTS in melee or raises to
// conjure a magic orb. Drawn in profile, mirrored by s.dir.
function drawSentinel(s) {
  const burning = s.state === 'dead' && s.burning;
  if (s.state === 'dead' && s.deadT > (burning ? 1.5 : 0.9)) return;
  const fade = s.state === 'dead' ? clamp(1 - s.deadT * (burning ? 0.66 : 1.05), 0, 1) : 1;
  const fl = s.flash > 0 ? 1.8 : (burning ? 0.5 : 1);   // burning corpse chars dark
  const wood  = [SENT.wood[0] * fl,  SENT.wood[1] * fl,  SENT.wood[2] * fl,  fade];
  const woodD = [SENT.woodD[0] * fl, SENT.woodD[1] * fl, SENT.woodD[2] * fl, fade];
  const plate = [SENT.plate[0] * fl, SENT.plate[1] * fl, SENT.plate[2] * fl, fade];
  const plateL = [SENT.plateL[0] * fl, SENT.plateL[1] * fl, SENT.plateL[2] * fl, fade];
  const plateD = [SENT.plateD[0], SENT.plateD[1], SENT.plateD[2], fade];
  const cloak = [SENT.cloak[0], SENT.cloak[1], SENT.cloak[2], fade];
  const cloakD = [SENT.cloakD[0], SENT.cloakD[1], SENT.cloakD[2], fade];
  const G = SENT.glow;

  const walk = (s.state === 'patrol') ? Math.sin(s.t * 6 + s.phase) : 0;
  const breath = Math.sin((T + s.phase) * 1.6);

  // pose per action
  let lunge = 0, lean = 0, spearMode = 'hold', strikeU = 0;
  if (s.state === 'strike')      { strikeU = clamp(s.t / 0.24, 0, 1); lunge = Math.sin(strikeU * Math.PI) * 16; lean = Math.sin(strikeU * Math.PI) * 0.14; spearMode = 'thrust'; }
  else if (s.state === 'windup') { const u = clamp(s.t / 0.4, 0, 1); lunge = -4 * u; lean = -0.10 * u; spearMode = 'cock'; }
  else if (s.state === 'aim')    { spearMode = 'cast'; lean = -0.04; }
  else if (s.state === 'stun')   { lunge = -5; lean = -0.24; spearMode = 'hold'; }

  lg.push();
  lg.translate(s.x, s.y);
  lg.scale(s.dir, 1);

  // ground shadow (feet planted)
  lg.setColor(0, 0, 0, 0.24 * fade); lg.ellipse('fill', 0, 2, 26, 6);

  // ---- flowing cloak, behind everything ----
  {
    const topY = -100, sway = Math.sin(T * 1.3 + s.phase) * 6 + walk * 4;
    setColA(cloakD);
    lg.polygon('fill', -10, topY + 6, -22 + sway * 0.4, -40, -30 + sway, 8, -12 + sway * 0.5, 14, -4, topY + 30);
    setColA(cloak);
    lg.polygon('fill', -9, topY + 2, 6, topY + 2, 9, -40, -6 + sway * 0.5, 10, -18 + sway, 4, -15, -40);
    setColA(cloakD);
    for (let i = -2; i <= 1; i++) { const hx = -14 + i * 8 + sway * 0.6; lg.polygon('fill', hx, 6, hx + 6, 6, hx + 3, 16 + Math.sin(T * 2 + i) * 3); }
  }

  // greaved leg helper
  function drawGreave(hipX, footX, shade) {
    const col = shade ? plateD : plate, limb = shade ? woodD : wood;
    const kneeX = (hipX + footX) / 2, kneeY = -24;
    segment(hipX, -48, kneeX, kneeY, 5.0, 4.0, limb);
    segment(kneeX, kneeY, footX, -1, 4.2, 3.2, limb);
    setColA(col);
    lg.polygon('fill', kneeX - 4, kneeY, kneeX + 4, kneeY, footX + 3, -2, footX - 3, -2);
    setColA(limb);
    lg.polygon('fill', footX - 3, -1, footX + 9, -1, footX + 8, 4, footX - 3, 4);
    lg.setColor(G[0], G[1], G[2], 0.45 * fade); lg.circle('fill', kneeX, kneeY, 1.3);
  }
  const frontFootX = 7 + walk * 4 + (s.state === 'strike' ? lunge * 0.8 : 0);
  const backFootX = -9 - walk * 2;
  drawGreave(-4, backFootX, true);   // back leg first (shaded)

  // ---- torso (leans / lunges) ----
  lg.push();
  lg.translate(0, -48);
  lg.rotate(lean);
  lg.translate(lunge * 0.4, 0);

  setColA(woodD); lg.polygon('fill', -6, 2, 6, 2, 5, -9, -5, -9);           // waist
  setColA(plate); lg.polygon('fill', -9, -6, 9, -6, 7, -44, 0, -50, -7, -44); // breastplate
  setColA(plateL); lg.polygon('fill', -2, -49, 3, -45, 1, -10, -1, -10);      // central ridge
  setColA(plateD); lg.setLineWidth(1.4); lg.line(-8, -16, 8, -16); lg.line(-8, -28, 8, -28); lg.setLineWidth(1);
  lg.setColor(G[0], G[1], G[2], (0.7 + 0.3 * Math.sin(T * 3)) * fade); lg.circle('fill', 0, -34, 2.6); // chest gem
  lg.setColor(0.9, 1, 1, fade); lg.circle('fill', 0, -34, 1.1);
  setColA(plate);  lg.polygon('fill', -12, -42, -2, -46, -1, -33, -11, -33);  // back pauldron
  setColA(plateL); lg.polygon('fill', 2, -46, 13, -43, 12, -32, 2, -34);      // front pauldron

  // head + mask + antlers
  lg.push();
  lg.translate(1, -52);
  setColA(woodD); lg.rectangle('fill', -2.5, -6, 5, 8);                        // neck
  setColA(wood); lg.polygon('fill', -5, -6, 4, -8, 8, -14, 6, -22, -3, -24, -6, -16); // mask
  setColA(woodD); lg.polygon('fill', 2, -10, 8, -14, 6, -20, 2, -18);         // cheek shadow
  setColA(plateD); lg.polygon('fill', -5, -18, 6, -20, 6, -16, -5, -14);      // brow ridge
  const eg = (s.state === 'windup' || s.state === 'strike' || s.state === 'aim') ? 1 : 0.75;
  lg.setColor(G[0], G[1], G[2], eg * fade);
  lg.circle('fill', 3, -16, 1.7); lg.circle('fill', -1, -15, 1.3);
  lg.setColor(0.9, 1, 1, eg * fade); lg.circle('fill', 3.4, -16.4, 0.7);
  setColA([SENT.antler[0], SENT.antler[1], SENT.antler[2], fade]); lg.setLineWidth(2.2);
  for (const side of [-1, 1]) {
    const bx = side * 2, by = -22;
    lg.line(bx, by, bx + side * 6, by - 14);
    lg.line(bx + side * 6, by - 14, bx + side * 2, by - 26);
    lg.line(bx + side * 6, by - 14, bx + side * 13, by - 20);
    lg.line(bx + side * 13, by - 20, bx + side * 11, by - 30);
    lg.line(bx + side * 3, by - 6, bx + side * 10, by - 9);
  }
  lg.setLineWidth(1);
  lg.pop();

  // ---- near arm + branch-spear, in front ----
  const shX = 6, shY = -44;
  let handX, handY, tipX, tipY, buttX, buttY;
  if (spearMode === 'thrust')      { const ext = 6 + strikeU * 26; handX = shX + ext; handY = shY + 2; tipX = handX + 40; tipY = handY - 2; buttX = handX - 16; buttY = handY + 4; }
  else if (spearMode === 'cock')   { handX = shX - 5; handY = shY + 4; tipX = handX + 28; tipY = handY - 12; buttX = handX - 16; buttY = handY + 9; }
  else if (spearMode === 'cast')   { handX = shX + 6; handY = shY - 6; tipX = handX + 18; tipY = handY - 34; buttX = handX - 10; buttY = handY + 10; }
  else                             { handX = shX + 4; handY = shY + 6 + breath * 0.3; tipX = handX + 4; tipY = handY - 50; buttX = handX - 2; buttY = handY + 16; }
  segment(shX, shY, (shX + handX) / 2, (shY + handY) / 2 - 3, 3.6, 3.0, wood);
  segment((shX + handX) / 2, (shY + handY) / 2 - 3, handX, handY, 3.0, 2.4, wood);
  setColA(plate); lg.circle('fill', handX, handY, 2.4);
  segment(buttX, buttY, tipX, tipY, 2.4, 2.0, [0.27, 0.22, 0.15, fade]);       // spear haft
  setColA(woodD); lg.circle('fill', lerp(buttX, tipX, 0.4), lerp(buttY, tipY, 0.4), 1.5); // knot
  { const dx = tipX - handX, dy = tipY - handY, d = Math.hypot(dx, dy) || 1, ux = dx / d, uy = dy / d, nx = -uy, ny = ux; // spearhead
    setColA([SENT.bronze[0], SENT.bronze[1], SENT.bronze[2], fade]);
    lg.polygon('fill', tipX + ux * 9, tipY + uy * 9, tipX + nx * 3.4, tipY + ny * 3.4, tipX - ux * 3, tipY - uy * 3, tipX - nx * 3.4, tipY - ny * 3.4);
    lg.setColor(0.86, 0.76, 0.46, fade); lg.line(tipX + ux * 9, tipY + uy * 9, tipX - ux * 3, tipY - uy * 3);
  }
  if (spearMode === 'thrust' && strikeU > 0.12 && strikeU < 0.7) {            // thrust streak
    lg.setColor(0.7, 0.95, 0.95, 0.42 * (1 - Math.abs(strikeU - 0.4) / 0.3));
    lg.setLineWidth(3); lg.line(handX - 22, handY, tipX, tipY); lg.setLineWidth(1);
  }
  if (spearMode === 'cast') {                                                  // conjured orb
    const orb = clamp(s.orb, 0, 1.2);
    lg.setColor(G[0], G[1], G[2], 0.2 * fade * (0.6 + orb)); lg.circle('fill', tipX, tipY, 8 + orb * 7);
    lg.setColor(G[0], G[1], G[2], 0.85 * fade); lg.circle('fill', tipX, tipY, 3.5 + orb * 2.5);
    lg.setColor(0.9, 1, 1, fade); lg.circle('fill', tipX - 1, tipY - 1, 1.4 + orb);
    lg.setColor(G[0], G[1], G[2], 0.5 * fade);
    for (let k = 0; k < 3; k++) { const a = T * 7 + k * 2.1; lg.line(tipX, tipY, tipX + Math.cos(a) * (9 + orb * 4), tipY + Math.sin(a) * (9 + orb * 4)); }
  }

  lg.pop();   // torso

  drawGreave(4, frontFootX, false);   // front leg, over the torso

  lg.pop();   // sentinel

  // burning away: flames engulf the felled guardian and rise off it
  if (burning) {
    const a = clamp(1 - s.deadT / 1.5, 0, 1), nfl = 7;
    for (let i = 0; i < nfl; i++) {
      const fx = s.x + (i - (nfl - 1) / 2) * 6 + Math.sin(T * 9 + i) * 3;
      const baseY = s.y - 4;
      const flick = 0.55 + 0.45 * Math.sin(T * 18 + i * 2.1);
      const h = (34 + Math.sin(T * 12 + i * 1.7) * 14) * (0.45 + a * 0.85) * (1 - Math.abs(i - (nfl - 1) / 2) / nfl);
      lg.setColor(1.0, 0.32, 0.05, 0.5 * a);
      lg.polygon('fill', fx - 5, baseY, fx + 5, baseY, fx + 2, baseY - h * flick, fx - 3, baseY - h * flick * 1.05);
      lg.setColor(1.0, 0.78, 0.28, 0.72 * a);
      lg.polygon('fill', fx - 2.6, baseY, fx + 2.6, baseY, fx, baseY - h * 0.66 * flick);
    }
    for (let i = 0; i < 5; i++) { const t = (T * 42 + i * 13) % 64; lg.setColor(1.0, 0.6, 0.2, a * (1 - t / 64)); lg.circle('fill', s.x + Math.sin(T * 3 + i) * 11, s.y - 12 - t, 1.6); }
    lg.setColor(0.16, 0.14, 0.13, 0.16 * a); lg.circle('fill', s.x, s.y - 44 - (1 - a) * 24, 14 + (1 - a) * 18);
  }

  // 4-pip health bar above a wounded, living sentinel
  if (s.state !== 'dead' && s.hp < SENT_HP) {
    const bx = s.x - 16, by = s.y - 134;
    for (let i = 0; i < SENT_HP; i++) {
      if (i < s.hp) lg.setColor(0.55, 0.9, 0.95, 0.95); else lg.setColor(0.2, 0.28, 0.28, 0.7);
      lg.rectangle('fill', bx + i * 9, by, 7, 4);
    }
  }
}
