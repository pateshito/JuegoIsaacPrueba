/* ============================================================
   render.js — dibujo de todo el juego en canvas 2D
   Expone el global `Render`.
   ============================================================ */
(function (global) {
  'use strict';

  const C = Utils.C;
  const { clamp, lerp, rrect, circle, shadowBlob } = Utils;

  let canvas = null;
  let ctx = null;
  let roomCache = new Map();
  let cacheFloorTag = '';

  function init(cv) {
    canvas = cv;
    ctx = cv.getContext('2d');
    ctx.imageSmoothingEnabled = false;
    return ctx;
  }

  // ---------------------------------------------------------
  // Utilidades de dibujo
  // ---------------------------------------------------------
  function text(str, x, y, opts) {
    opts = opts || {};
    ctx.save();
    ctx.font = opts.font || 'bold 14px ui-monospace, monospace';
    ctx.textAlign = opts.align || 'center';
    ctx.textBaseline = opts.baseline || 'middle';
    if (opts.shadow !== false) {
      ctx.fillStyle = 'rgba(0,0,0,.72)';
      ctx.fillText(str, x + (opts.sx || 1), y + (opts.sy || 2));
    }
    ctx.fillStyle = opts.color || '#fff';
    ctx.fillText(str, x, y);
    ctx.restore();
  }

  function hash01(x, y, s) {
    let h = Math.imul(x * 374761393 + y * 668265263 + (s || 0) * 2246822519, 3266489917);
    h = (h ^ (h >>> 13)) >>> 0;
    return h / 4294967296;
  }

  // ---------------------------------------------------------
  // Habitación pre-renderizada (suelo + muros + obstáculos + puertas)
  // ---------------------------------------------------------
  function roomSignature(view) {
    const r = view.room;
    let d = '';
    for (const n of ['up', 'down', 'left', 'right']) d += r.doors[n] ? '1' : '0';
    return view.floorNum + '|' + r.key + '|' + d + '|' + (r.cleared ? 1 : 0) + '|' + r.type;
  }

  function buildRoomCanvas(view) {
    const r = view.room;
    const cv = document.createElement('canvas');
    cv.width = C.ROOM_W;
    cv.height = C.ROOM_H;
    const g = cv.getContext('2d');
    g.translate(-C.ROOM_X, -C.ROOM_Y);

    const open = r.cleared || r.type === 'start';

    // --- Suelo ---
    for (let ty = 0; ty < C.ROWS; ty++) {
      for (let tx = 0; tx < C.COLS; tx++) {
        const x = C.ROOM_X + tx * C.TILE;
        const y = C.ROOM_Y + ty * C.TILE;
        const h = hash01(tx, ty, view.floorNum * 31 + r.gx * 7 + r.gy);
        const base = (tx + ty) % 2 === 0 ? 40 : 34;
        const l = base + Math.floor(h * 12);
        g.fillStyle = `rgb(${l + 18},${l + 8},${l + 22})`;
        g.fillRect(x, y, C.TILE, C.TILE);

        // motas / grietas
        if (h > 0.72) {
          g.fillStyle = `rgba(255,235,220,${0.03 + h * 0.04})`;
          g.fillRect(x + 6 + h * 20, y + 8 + h * 24, 3 + h * 5, 2 + h * 3);
        }
        if (h < 0.1) {
          g.strokeStyle = 'rgba(0,0,0,.22)';
          g.lineWidth = 1;
          g.beginPath();
          g.moveTo(x + 8, y + 12); g.lineTo(x + 22, y + 30);
          g.lineTo(x + 14, y + 44);
          g.stroke();
        }
      }
    }

    // --- Muros ---
    const wallGrad = g.createLinearGradient(0, C.ROOM_Y, 0, C.ROOM_Y + C.ROOM_H);
    wallGrad.addColorStop(0, '#6a5a86');
    wallGrad.addColorStop(1, '#3d3352');
    g.fillStyle = wallGrad;
    g.fillRect(C.ROOM_X, C.ROOM_Y, C.ROOM_W, C.WALL);                    // arriba
    g.fillRect(C.ROOM_X, C.ROOM_Y + C.ROOM_H - C.WALL, C.ROOM_W, C.WALL); // abajo
    g.fillRect(C.ROOM_X, C.ROOM_Y, C.WALL, C.ROOM_H);                    // izq
    g.fillRect(C.ROOM_X + C.ROOM_W - C.WALL, C.ROOM_Y, C.WALL, C.ROOM_H);// der

    // textura de ladrillos en muros
    g.save();
    g.globalAlpha = 0.18;
    g.strokeStyle = '#1a1426';
    g.lineWidth = 2;
    for (let ty = 0; ty < C.ROWS; ty++) {
      const y = C.ROOM_Y + ty * C.TILE;
      g.beginPath(); g.moveTo(C.ROOM_X, y); g.lineTo(C.ROOM_X + C.WALL, y); g.stroke();
      g.beginPath(); g.moveTo(C.ROOM_X + C.ROOM_W - C.WALL, y); g.lineTo(C.ROOM_X + C.ROOM_W, y); g.stroke();
    }
    for (let tx = 0; tx < C.COLS; tx++) {
      const x = C.ROOM_X + tx * C.TILE;
      g.beginPath(); g.moveTo(x, C.ROOM_Y); g.lineTo(x, C.ROOM_Y + C.WALL); g.stroke();
      g.beginPath(); g.moveTo(x, C.ROOM_Y + C.ROOM_H - C.WALL); g.lineTo(x, C.ROOM_Y + C.ROOM_H); g.stroke();
    }
    g.restore();

    // borde interior iluminado
    g.strokeStyle = 'rgba(255,255,255,.10)';
    g.lineWidth = 2;
    g.strokeRect(C.INNER_L - 1, C.INNER_T - 1, C.INNER_R - C.INNER_L + 2, C.INNER_B - C.INNER_T + 2);

    // --- Puertas ---
    drawDoor(g, r, 'up', open);
    drawDoor(g, r, 'down', open);
    drawDoor(g, r, 'left', open);
    drawDoor(g, r, 'right', open);

    // --- Obstáculos ---
    for (const o of r.obstacles) drawObstacle(g, o);

    // --- Decoración especial por tipo de habitación ---
    if (r.type === 'treasure') {
      g.save();
      g.globalAlpha = 0.12;
      g.fillStyle = '#ffd166';
      g.fillRect(C.INNER_L, C.INNER_T, C.INNER_R - C.INNER_L, C.INNER_B - C.INNER_T);
      g.restore();
    } else if (r.type === 'boss') {
      g.save();
      g.globalAlpha = 0.13;
      g.fillStyle = '#c0392b';
      g.fillRect(C.INNER_L, C.INNER_T, C.INNER_R - C.INNER_L, C.INNER_B - C.INNER_T);
      g.restore();
    } else if (r.type === 'shop') {
      g.save();
      g.globalAlpha = 0.1;
      g.fillStyle = '#6ee7a8';
      g.fillRect(C.INNER_L, C.INNER_T, C.INNER_R - C.INNER_L, C.INNER_B - C.INNER_T);
      g.restore();
    }

    return cv;
  }

  function doorGeometry(dir) {
    switch (dir) {
      case 'up':    return { x: C.CX, y: C.ROOM_Y, w: C.DOOR_HALF * 2, h: C.WALL, horiz: true };
      case 'down':  return { x: C.CX, y: C.ROOM_Y + C.ROOM_H - C.WALL, w: C.DOOR_HALF * 2, h: C.WALL, horiz: true };
      case 'left':  return { x: C.ROOM_X, y: C.CY, w: C.WALL, h: C.DOOR_HALF * 2, horiz: false };
      case 'right': return { x: C.ROOM_X + C.ROOM_W - C.WALL, y: C.CY, w: C.WALL, h: C.DOOR_HALF * 2, horiz: false };
    }
  }

  function drawDoor(g, r, dir, open) {
    if (!r.doors[dir]) return;
    const d = doorGeometry(dir);
    const rx = d.x - d.w / 2, ry = d.y - d.h / 2;

    // vano excavado en el muro
    g.fillStyle = open ? '#2a2237' : '#241d31';
    g.fillRect(rx, ry, d.w, d.h);

    if (open) {
      // marco
      g.strokeStyle = '#8a6f4a';
      g.lineWidth = 4;
      g.beginPath();
      if (d.horiz) {
        g.moveTo(rx, ry + 2); g.lineTo(rx, ry + d.h); g.lineTo(rx + d.w, ry + d.h); g.lineTo(rx + d.w, ry + 2);
      } else {
        g.moveTo(rx + 2, ry); g.lineTo(rx + d.w, ry); g.lineTo(rx + d.w, ry + d.h); g.lineTo(rx + 2, ry + d.h);
      }
      g.stroke();

      // interior oscuro del pasillo
      g.fillStyle = '#141019';
      if (d.horiz) g.fillRect(rx + 4, ry + d.h * 0.35, d.w - 8, d.h * 0.65);
      else g.fillRect(rx + d.w * 0.35, ry + 4, d.w * 0.65, d.h - 8);
    } else {
      // puerta cerrada con barrotes
      g.fillStyle = '#5d5470';
      g.fillRect(rx, ry, d.w, d.h);
      g.strokeStyle = '#2b2438';
      g.lineWidth = 5;
      g.strokeRect(rx + 2, ry + 2, d.w - 4, d.h - 4);
      // candado
      g.fillStyle = '#e0b070';
      const cx = d.x, cy = d.y;
      if (d.horiz) circle(g, cx, cy + (dir === 'up' ? 2 : -2), 5);
      else circle(g, cx + (dir === 'left' ? 2 : -2), cy, 5);
      g.fill();
    }
  }

  function drawObstacle(g, o) {
    if (o.type === 'bone') {
      g.save();
      g.fillStyle = '#cfc4b0';
      g.beginPath();
      g.ellipse(o.x, o.y, o.r * 0.95, o.r * 0.75, o.seed * 3, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = 'rgba(0,0,0,.18)';
      g.beginPath();
      g.ellipse(o.x + o.r * 0.15, o.y + o.r * 0.2, o.r * 0.7, o.r * 0.5, 0, 0, Math.PI * 2);
      g.fill();
      g.restore();
      return;
    }
    // roca
    g.save();
    shadowBlob(g, o.x, o.y + o.r * 0.55, o.r * 1.05, o.r * 0.45, 0.4);
    const grad = g.createRadialGradient(o.x - o.r * 0.35, o.y - o.r * 0.4, 1, o.x, o.y, o.r * 1.15);
    grad.addColorStop(0, '#8d8296');
    grad.addColorStop(1, '#4a4257');
    g.fillStyle = grad;
    g.beginPath();
    const sides = 7;
    for (let i = 0; i <= sides; i++) {
      const a = (i / sides) * Math.PI * 2 + o.seed * 2;
      const rr = o.r * (0.82 + hash01(i, Math.round(o.x), Math.round(o.y)) * 0.3);
      const px = o.x + Math.cos(a) * rr;
      const py = o.y + Math.sin(a) * rr * 0.88;
      if (i === 0) g.moveTo(px, py); else g.lineTo(px, py);
    }
    g.closePath();
    g.fill();
    g.strokeStyle = 'rgba(20,14,26,.55)';
    g.lineWidth = 2;
    g.stroke();
    // brillo
    g.fillStyle = 'rgba(255,255,255,.14)';
    g.beginPath();
    g.ellipse(o.x - o.r * 0.3, o.y - o.r * 0.42, o.r * 0.34, o.r * 0.2, -0.5, 0, Math.PI * 2);
    g.fill();
    g.restore();
  }

  function getRoomCanvas(view) {
    const tag = view.floorNum + '|' + view.room.key;
    if (tag !== cacheFloorTag) { roomCache.clear(); cacheFloorTag = tag; }
    const sig = roomSignature(view);
    let cv = roomCache.get(sig);
    if (!cv) {
      cv = buildRoomCanvas(view);
      if (roomCache.size > 24) roomCache.clear();
      roomCache.set(sig, cv);
    }
    return cv;
  }

  // ---------------------------------------------------------
  // Entidades
  // ---------------------------------------------------------
  function drawPlayer(p, view, local) {
    const dead = p.dead;
    const alpha = dead ? 0.4 : (p.invuln > 0 && Math.floor(p.invuln * 14) % 2 === 0 ? 0.42 : 1);
    const bob = dead ? 0 : Math.sin(p.walkPhase * 3) * 1.4;

    ctx.save();
    ctx.globalAlpha = alpha;

    if (!dead) shadowBlob(ctx, p.x, p.y + 15, 13, 6, 0.34);

    // marca del jugador local
    if (local && !dead) {
      ctx.save();
      ctx.globalAlpha = 0.5 + Math.sin(Utils.now() * 4) * 0.16;
      ctx.strokeStyle = p.color;
      ctx.lineWidth = 2;
      circle(ctx, p.x, p.y + 11, 19);
      ctx.stroke();
      ctx.restore();
    }

    const bx = p.x;
    const by = p.y + bob;

    if (dead) {
      // ánima
      ctx.fillStyle = 'rgba(220,230,255,.35)';
      circle(ctx, bx, by - 6, 11);
      ctx.fill();
      ctx.fillStyle = 'rgba(20,16,30,.6)';
      circle(ctx, bx - 4, by - 8, 2.1); ctx.fill();
      circle(ctx, bx + 4, by - 8, 2.1); ctx.fill();
      ctx.restore();
      return;
    }

    const fx = p.face ? p.face.x : 0;
    const fy = p.face ? p.face.y : 1;

    // cuerpo
    const bodyGrad = ctx.createLinearGradient(bx, by - 4, bx, by + 16);
    bodyGrad.addColorStop(0, p.color);
    bodyGrad.addColorStop(1, shade(p.color, -0.35));
    ctx.fillStyle = bodyGrad;
    rrect(ctx, bx - 10, by - 2, 20, 18, 7);
    ctx.fill();
    // piernas
    ctx.fillStyle = shade(p.color, -0.5);
    const swing = Math.sin(p.walkPhase * 3) * 3;
    rrect(ctx, bx - 8, by + 12, 6, 6 + Math.abs(swing) * 0.3, 3); ctx.fill();
    rrect(ctx, bx + 2, by + 12, 6, 6 + Math.abs(swing) * 0.3, 3); ctx.fill();

    // cabeza
    ctx.fillStyle = '#f2d0a4';
    circle(ctx, bx, by - 9, 11.5);
    ctx.fill();
    ctx.fillStyle = 'rgba(0,0,0,.12)';
    ctx.beginPath();
    ctx.ellipse(bx, by - 4, 9, 3.2, 0, 0, Math.PI * 2);
    ctx.fill();

    // ojos mirando hacia donde apunta
    const ex = clamp(fx, -1, 1) * 3.2;
    const ey = clamp(fy, -1, 1) * 2.4;
    ctx.fillStyle = '#fff';
    circle(ctx, bx - 4.2, by - 10.5, 3.5); ctx.fill();
    circle(ctx, bx + 4.2, by - 10.5, 3.5); ctx.fill();
    ctx.fillStyle = '#20182b';
    circle(ctx, bx - 4.2 + ex, by - 10.5 + ey, 1.9); ctx.fill();
    circle(ctx, bx + 4.2 + ex, by - 10.5 + ey, 1.9); ctx.fill();

    // boca
    ctx.strokeStyle = 'rgba(90,40,50,.75)';
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.arc(bx, by - 4.5, 3.4, 0.25 * Math.PI, 0.75 * Math.PI);
    ctx.stroke();

    // lágrima
    ctx.fillStyle = 'rgba(180,225,255,.9)';
    const ty = by - 14 - ((Utils.now() * 22 + p.slot * 9) % 8);
    circle(ctx, bx - 8.5, ty, 1.8); ctx.fill();

    ctx.restore();

    // nombre + corazones encima
    if (view.mode !== 'single') {
      text(p.name, p.x, p.y - 32, {
        font: 'bold 10px ui-monospace, monospace',
        color: p.color,
      });
    }
    if (view.mode === 'local' || dead) {
      drawMiniHearts(p, p.x, p.y - 44);
    }
  }

  function drawMiniHearts(p, cx, cy) {
    const n = Math.ceil(p.maxHp / 2);
    const w = 8;
    const total = n * w;
    let x = cx - total / 2 + w / 2;
    for (let i = 0; i < n; i++) {
      const val = clamp(p.hp - i * 2, 0, 2);
      drawHeartShape(x, cy, 6, val);
      x += w;
    }
  }

  function drawHeartShape(x, y, s, val) {
    // val: 0 vacío, 1 medio, 2 lleno
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(s / 10, s / 10);
    const path = () => {
      ctx.beginPath();
      ctx.moveTo(0, 6);
      ctx.bezierCurveTo(-11, -2, -7, -11, 0, -5);
      ctx.bezierCurveTo(7, -11, 11, -2, 0, 6);
      ctx.closePath();
    };
    ctx.fillStyle = 'rgba(0,0,0,.55)';
    path(); ctx.fill();
    if (val > 0) {
      ctx.save();
      if (val === 1) { ctx.beginPath(); ctx.rect(-12, -14, 12, 26); ctx.clip(); }
      ctx.fillStyle = '#ff4d6d';
      path(); ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,.45)';
      ctx.beginPath();
      ctx.ellipse(-3, -4, 2.2, 3, -0.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
    ctx.strokeStyle = 'rgba(255,255,255,.35)';
    ctx.lineWidth = 1.4;
    path(); ctx.stroke();
    ctx.restore();
  }

  function drawEnemy(e) {
    const t = e.type;
    ctx.save();
    if (e.spawnT > 0) ctx.globalAlpha = Math.max(0.05, 1 - e.spawnT / 0.65);
    if (e.flash > 0) { ctx.globalAlpha = 1; }

    if (t !== 'fly') shadowBlob(ctx, e.x, e.y + e.r * 0.85, e.r * 0.9, e.r * 0.36, 0.34);

    const wob = e.wobble ? Math.sin(e.anim * 5) * 2 : 0;

    if (t === 'fly') {
      const fy = e.y + wob;
      shadowBlob(ctx, e.x, e.y + 18, 10, 4, 0.26);
      // alas
      const flap = Math.sin(e.anim * 16) * 4;
      ctx.fillStyle = 'rgba(220,190,255,.55)';
      ctx.beginPath();
      ctx.ellipse(e.x - 12, fy - 6 - flap * 0.3, 8, 5, -0.5, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath();
      ctx.ellipse(e.x + 12, fy - 6 - flap * 0.3, 8, 5, 0.5, 0, Math.PI * 2); ctx.fill();
      drawBlobBody(e.x, fy, e.r, '#c76bd8', '#7d3a91');
      drawEyes(e.x, fy, 4.4, 1.4, '#fff', '#2a1533');
      drawMouth(e.x, fy + 5, 4.5, '#5a2b66');
    } else if (t === 'gaper') {
      drawBlobBody(e.x, e.y, e.r, '#e0705a', '#93382a');
      ctx.fillStyle = '#f2d0a4';
      circle(ctx, e.x, e.y - e.r * 0.15, e.r * 0.62); ctx.fill();
      drawEyes(e.x, e.y - e.r * 0.2, 4.6, 1.2, '#fff', '#3a1414');
      // boca abierta
      ctx.fillStyle = '#3a0f16';
      ctx.beginPath();
      ctx.ellipse(e.x, e.y + e.r * 0.42, 5.5, 5, 0, 0, Math.PI * 2);
      ctx.fill();
    } else if (t === 'charger') {
      // cuerpo alargado apuntando en su dirección
      const ang = Math.atan2(e.dir.y, e.dir.x);
      ctx.save();
      ctx.translate(e.x, e.y);
      ctx.rotate(ang);
      ctx.fillStyle = '#d9a441';
      rrect(ctx, -e.r, -e.r * 0.75, e.r * 2, e.r * 1.5, e.r * 0.7);
      ctx.fill();
      ctx.fillStyle = '#8d6420';
      rrect(ctx, -e.r * 0.9, -e.r * 0.5, e.r * 0.9, e.r, e.r * 0.4);
      ctx.fill();
      ctx.fillStyle = '#fff';
      circle(ctx, e.r * 0.4, -e.r * 0.3, 4); ctx.fill();
      circle(ctx, e.r * 0.4, e.r * 0.3, 4); ctx.fill();
      ctx.fillStyle = '#2a1a05';
      circle(ctx, e.r * 0.55, -e.r * 0.3, 2); ctx.fill();
      circle(ctx, e.r * 0.55, e.r * 0.3, 2); ctx.fill();
      // cuernos
      ctx.fillStyle = '#f0e0b0';
      ctx.beginPath();
      ctx.moveTo(-e.r * 0.9, -e.r * 0.7); ctx.lineTo(-e.r * 1.4, -e.r * 0.2); ctx.lineTo(-e.r * 0.85, -e.r * 0.2);
      ctx.closePath(); ctx.fill();
      ctx.beginPath();
      ctx.moveTo(-e.r * 0.9, e.r * 0.7); ctx.lineTo(-e.r * 1.4, e.r * 0.2); ctx.lineTo(-e.r * 0.85, e.r * 0.2);
      ctx.closePath(); ctx.fill();
      ctx.restore();
    } else if (t === 'spitter') {
      drawBlobBody(e.x, e.y, e.r * 1.05, '#7fd18a', '#3f7a4c');
      drawEyes(e.x, e.y - 3, 4.6, 1.5, '#fff', '#12351c');
      // pico
      ctx.fillStyle = '#2f6b3c';
      ctx.beginPath();
      ctx.moveTo(e.x - 6, e.y + 5); ctx.lineTo(e.x + 6, e.y + 5); ctx.lineTo(e.x, e.y + 12);
      ctx.closePath(); ctx.fill();
    } else if (t === 'hopper') {
      const sq = Math.max(0, Math.sin(e.anim * 6)) * 6;
      drawBlobBody(e.x, e.y - sq, e.r, '#7aa8e0', '#3d5f8f');
      ctx.fillStyle = 'rgba(0,0,0,.25)';
      circle(ctx, e.x - 5, e.y - sq - 3, 2.4); ctx.fill();
      circle(ctx, e.x + 5, e.y - sq - 3, 2.4); ctx.fill();
    } else if (t === 'fat') {
      ctx.fillStyle = '#c98fb0';
      circle(ctx, e.x, e.y, e.r); ctx.fill();
      ctx.fillStyle = '#8f5d7c';
      circle(ctx, e.x, e.y + e.r * 0.45, e.r * 0.62); ctx.fill();
      drawEyes(e.x, e.y - 6, 5, 1.6, '#fff', '#3a1f2e');
      drawMouth(e.x, e.y + 6, 6, '#4a2436');
    } else if (t === 'boss') {
      drawBoss(e);
    } else {
      drawBlobBody(e.x, e.y, e.r, '#c76bd8', '#7d3a91');
    }

    if (e.flash > 0) {
      ctx.globalAlpha = Math.min(1, e.flash * 6) * 0.8;
      ctx.globalCompositeOperation = 'lighter';
      ctx.fillStyle = '#fff';
      circle(ctx, e.x, e.y, e.r * 1.05);
      ctx.fill();
    }
    ctx.restore();

    // barra de vida de enemigos grandes
    if (e.maxHp > 30) {
      const w = e.r * 2.4;
      const x = e.x - w / 2, y = e.y - e.r - 14;
      ctx.fillStyle = 'rgba(0,0,0,.6)';
      rrect(ctx, x, y, w, 6, 3); ctx.fill();
      ctx.fillStyle = e.isBoss ? '#ff5470' : '#ffb648';
      rrect(ctx, x + 1, y + 1, (w - 2) * clamp(e.hp / e.maxHp, 0, 1), 4, 2); ctx.fill();
    }
  }

  function drawBlobBody(x, y, r, c1, c2) {
    const grad = ctx.createRadialGradient(x - r * 0.35, y - r * 0.4, 1, x, y, r * 1.15);
    grad.addColorStop(0, c1);
    grad.addColorStop(1, c2);
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.ellipse(x, y, r, r * 0.94, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,.28)';
    ctx.lineWidth = 2;
    ctx.stroke();
  }

  function drawEyes(x, y, sep, r, white, pupil) {
    ctx.fillStyle = white;
    circle(ctx, x - sep, y, r * 1.5); ctx.fill();
    circle(ctx, x + sep, y, r * 1.5); ctx.fill();
    ctx.fillStyle = pupil;
    circle(ctx, x - sep, y, r * 0.62); ctx.fill();
    circle(ctx, x + sep, y, r * 0.62); ctx.fill();
  }

  function drawMouth(x, y, r, color) {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.ellipse(x, y, r, r * 0.62, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  function drawBoss(e) {
    const r = e.r;
    const wob = Math.sin(e.anim * 3) * 2;
    // cuerpo
    const grad = ctx.createRadialGradient(e.x - r * 0.3, e.y - r * 0.4, 4, e.x, e.y, r * 1.2);
    grad.addColorStop(0, '#d4647a');
    grad.addColorStop(1, '#6d2333');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.ellipse(e.x, e.y, r, r * 0.95 + wob, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,.35)';
    ctx.lineWidth = 3; ctx.stroke();

    // cuernos
    ctx.fillStyle = '#f0e2c8';
    ctx.beginPath();
    ctx.moveTo(e.x - r * 0.7, e.y - r * 0.6);
    ctx.lineTo(e.x - r * 1.25, e.y - r * 1.45);
    ctx.lineTo(e.x - r * 0.32, e.y - r * 0.85);
    ctx.closePath(); ctx.fill();
    ctx.beginPath();
    ctx.moveTo(e.x + r * 0.7, e.y - r * 0.6);
    ctx.lineTo(e.x + r * 1.25, e.y - r * 1.45);
    ctx.lineTo(e.x + r * 0.32, e.y - r * 0.85);
    ctx.closePath(); ctx.fill();

    // ojos
    ctx.fillStyle = '#fff8e0';
    circle(ctx, e.x - r * 0.34, e.y - r * 0.2, r * 0.24); ctx.fill();
    circle(ctx, e.x + r * 0.34, e.y - r * 0.2, r * 0.24); ctx.fill();
    ctx.fillStyle = '#2a0a12';
    const ex = clamp(e.dir.x, -1, 1) * 3, ey = clamp(e.dir.y, -1, 1) * 2;
    circle(ctx, e.x - r * 0.34 + ex, e.y - r * 0.2 + ey, r * 0.1); ctx.fill();
    circle(ctx, e.x + r * 0.34 + ex, e.y - r * 0.2 + ey, r * 0.1); ctx.fill();

    // boca con dientes
    ctx.fillStyle = '#3a0a14';
    ctx.beginPath();
    ctx.ellipse(e.x, e.y + r * 0.38, r * 0.42, r * 0.3, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#fff';
    for (let i = -2; i <= 2; i++) {
      ctx.beginPath();
      ctx.moveTo(e.x + i * r * 0.15 - 3, e.y + r * 0.14);
      ctx.lineTo(e.x + i * r * 0.15 + 3, e.y + r * 0.14);
      ctx.lineTo(e.x + i * r * 0.15, e.y + r * 0.32);
      ctx.closePath(); ctx.fill();
    }
  }

  function drawBullet(b) {
    ctx.save();
    // estela
    const l = Math.hypot(b.vx, b.vy);
    if (l > 1) {
      const ux = b.vx / l, uy = b.vy / l;
      for (let i = 0; i < 3; i++) {
        const a = 0.18 - i * 0.05;
        if (a <= 0) break;
        ctx.globalAlpha = a;
        ctx.fillStyle = b.color;
        circle(ctx, b.x - ux * (i + 1) * 5, b.y - uy * (i + 1) * 5, b.r * (1 - i * 0.2));
        ctx.fill();
      }
    }
    ctx.globalAlpha = 0.35;
    ctx.fillStyle = b.color;
    circle(ctx, b.x, b.y, b.r * 1.9); ctx.fill();

    ctx.globalAlpha = 1;
    const grad = ctx.createRadialGradient(b.x - b.r * 0.3, b.y - b.r * 0.3, 1, b.x, b.y, b.r);
    grad.addColorStop(0, '#ffffff');
    grad.addColorStop(0.55, b.color);
    grad.addColorStop(1, shade(b.color, -0.25));
    ctx.fillStyle = grad;
    circle(ctx, b.x, b.y, b.r);
    ctx.fill();
    ctx.restore();
  }

  function drawPickup(k, view) {
    const bob = Math.sin(view.time * 3 + k.bob) * 2;
    if (k.type === 'trapdoor') {
      ctx.save();
      ctx.translate(k.x, k.y);
      ctx.fillStyle = 'rgba(0,0,0,.55)';
      circle(ctx, 0, 0, 30); ctx.fill();
      ctx.fillStyle = '#2a2036';
      circle(ctx, 0, 0, 26); ctx.fill();
      ctx.strokeStyle = '#8a6f4a';
      ctx.lineWidth = 4;
      circle(ctx, 0, 0, 26); ctx.stroke();
      // escaleras
      ctx.strokeStyle = 'rgba(255,255,255,.22)';
      ctx.lineWidth = 3;
      for (let i = -2; i <= 2; i++) {
        ctx.beginPath();
        ctx.moveTo(-12 + i * 3, i * 8 - 6);
        ctx.lineTo(12 + i * 3, i * 8 - 6);
        ctx.stroke();
      }
      ctx.restore();
      // haz de luz
      ctx.save();
      ctx.globalAlpha = 0.15 + Math.sin(view.time * 2) * 0.06;
      ctx.fillStyle = '#ffd166';
      circle(ctx, k.x, k.y, 40); ctx.fill();
      ctx.restore();
      text('↓', k.x, k.y - 34 + bob, { font: 'bold 18px sans-serif', color: '#ffd166' });
      return;
    }

    shadowBlob(ctx, k.x, k.y + 10, 8, 3.5, 0.3);
    ctx.save();
    ctx.translate(k.x, k.y + bob);

    if (k.type === 'heart') {
      ctx.scale(1.35, 1.35);
      drawHeartLocal(2);
    } else if (k.type === 'halfheart') {
      ctx.scale(1.2, 1.2);
      drawHeartLocal(1);
    } else if (k.type === 'coin') {
      const g = ctx.createLinearGradient(-8, -8, 8, 8);
      g.addColorStop(0, '#ffe58a');
      g.addColorStop(1, '#d99b1c');
      ctx.fillStyle = g;
      circle(ctx, 0, 0, 9); ctx.fill();
      ctx.strokeStyle = '#8a6010'; ctx.lineWidth = 2;
      circle(ctx, 0, 0, 9); ctx.stroke();
      ctx.fillStyle = '#8a6010';
      ctx.font = 'bold 11px ui-monospace, monospace';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText('$', 0, 0.5);
    } else if (k.type === 'key') {
      ctx.strokeStyle = '#ffd166'; ctx.lineWidth = 4;
      circle(ctx, 0, -4, 5); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0, 1); ctx.lineTo(0, 11); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0, 8); ctx.lineTo(5, 8); ctx.stroke();
    }
    ctx.restore();

    if (k.price > 0) {
      text(k.price + '$', k.x, k.y - 18, { font: 'bold 12px ui-monospace, monospace', color: '#ffe58a' });
    }
  }

  function drawHeartLocal(val) {
    ctx.save();
    const path = () => {
      ctx.beginPath();
      ctx.moveTo(0, 6);
      ctx.bezierCurveTo(-11, -2, -7, -11, 0, -5);
      ctx.bezierCurveTo(7, -11, 11, -2, 0, 6);
      ctx.closePath();
    };
    ctx.fillStyle = 'rgba(0,0,0,.5)';
    path(); ctx.fill();
    if (val > 0) {
      ctx.save();
      if (val === 1) { ctx.beginPath(); ctx.rect(-12, -14, 12, 26); ctx.clip(); }
      ctx.fillStyle = '#ff4d6d'; path(); ctx.fill();
      ctx.restore();
    }
    ctx.strokeStyle = 'rgba(255,255,255,.5)'; ctx.lineWidth = 1.4;
    path(); ctx.stroke();
    ctx.restore();
  }

  function drawPedestal(ped, view) {
    ctx.save();
    shadowBlob(ctx, ped.x, ped.y + 18, 22, 8, 0.4);
    // base
    ctx.fillStyle = '#5a4f70';
    rrect(ctx, ped.x - 20, ped.y + 4, 40, 14, 4); ctx.fill();
    ctx.fillStyle = '#7a6d94';
    rrect(ctx, ped.x - 20, ped.y + 4, 40, 5, 3); ctx.fill();
    ctx.fillStyle = '#403653';
    rrect(ctx, ped.x - 14, ped.y + 16, 28, 8, 3); ctx.fill();

    if (!ped.taken) {
      const bob = Math.sin(view.time * 2.4 + ped.bob) * 3;
      // halo
      const item = Entities.itemById(ped.itemId);
      ctx.save();
      ctx.globalAlpha = 0.22 + Math.sin(view.time * 3) * 0.07;
      ctx.fillStyle = item.color;
      circle(ctx, ped.x, ped.y - 14 + bob, 24); ctx.fill();
      ctx.restore();
      drawItemIcon(ped.itemId, ped.x, ped.y - 14 + bob, 12);
      // rayos
      ctx.save();
      ctx.globalAlpha = 0.4;
      ctx.strokeStyle = item.color;
      ctx.lineWidth = 1.5;
      for (let i = 0; i < 4; i++) {
        const a = view.time * 1.2 + i * Math.PI / 2;
        ctx.beginPath();
        ctx.moveTo(ped.x + Math.cos(a) * 20, ped.y - 14 + bob + Math.sin(a) * 20);
        ctx.lineTo(ped.x + Math.cos(a) * 28, ped.y - 14 + bob + Math.sin(a) * 28);
        ctx.stroke();
      }
      ctx.restore();
    }
    ctx.restore();
  }

  function drawItemIcon(id, x, y, s) {
    ctx.save();
    ctx.translate(x, y);
    const k = s / 12;
    ctx.scale(k, k);
    switch (id) {
      case 'heart':
        ctx.save(); ctx.scale(1.15, 1.15); drawHeartLocal(2); ctx.restore();
        break;
      case 'blood':
        ctx.fillStyle = '#c0392b';
        ctx.beginPath();
        ctx.moveTo(0, -11); ctx.bezierCurveTo(9, 0, 8, 9, 0, 9);
        ctx.bezierCurveTo(-8, 9, -9, 0, 0, -11); ctx.fill();
        break;
      case 'boots':
        ctx.fillStyle = '#7fd18a';
        rrect(ctx, -8, -9, 7, 15, 2); ctx.fill();
        rrect(ctx, -8, 2, 15, 7, 2); ctx.fill();
        break;
      case 'trigger':
        ctx.fillStyle = '#ffd166';
        ctx.beginPath();
        ctx.moveTo(-9, 0); ctx.lineTo(-2, -5); ctx.lineTo(3, -5);
        ctx.lineTo(3, 5); ctx.lineTo(-2, 5); ctx.closePath(); ctx.fill();
        ctx.fillStyle = '#fff';
        circle(ctx, 6, 0, 4); ctx.fill();
        break;
      case 'tear':
        ctx.fillStyle = '#68c7ff';
        ctx.beginPath();
        ctx.moveTo(0, -11); ctx.bezierCurveTo(9, 0, 8, 9, 0, 9);
        ctx.bezierCurveTo(-8, 9, -9, 0, 0, -11); ctx.fill();
        break;
      case 'trident':
        ctx.strokeStyle = '#b58cff'; ctx.lineWidth = 3;
        ctx.beginPath(); ctx.moveTo(0, 9); ctx.lineTo(0, -3); ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(-7, -10); ctx.lineTo(-7, -4); ctx.moveTo(7, -10); ctx.lineTo(7, -4);
        ctx.moveTo(0, -11); ctx.lineTo(0, -5);
        ctx.stroke();
        ctx.beginPath(); ctx.moveTo(-7, -4); ctx.quadraticCurveTo(0, 2, 7, -4); ctx.stroke();
        break;
      case 'horn':
        ctx.fillStyle = '#f0e6d2';
        ctx.beginPath();
        ctx.moveTo(-8, 8); ctx.quadraticCurveTo(-2, -4, 8, -10);
        ctx.quadraticCurveTo(0, 2, -4, 9); ctx.closePath(); ctx.fill();
        break;
      case 'lens':
        ctx.strokeStyle = '#9be7ff'; ctx.lineWidth = 3;
        circle(ctx, -2, -2, 7); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(3, 3); ctx.lineTo(9, 9); ctx.stroke();
        break;
      case 'clover':
        ctx.fillStyle = '#6ee7a8';
        circle(ctx, -5, -5, 5); ctx.fill();
        circle(ctx, 5, -5, 5); ctx.fill();
        circle(ctx, -5, 5, 5); ctx.fill();
        circle(ctx, 5, 5, 5); ctx.fill();
        ctx.strokeStyle = '#2f8a5a'; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(0, 0); ctx.quadraticCurveTo(4, 8, 1, 12); ctx.stroke();
        break;
      default:
        ctx.fillStyle = '#fff';
        circle(ctx, 0, 0, 7); ctx.fill();
    }
    ctx.restore();
  }

  // ---------------------------------------------------------
  // HUD
  // ---------------------------------------------------------
  function drawHUD(view) {
    // --- Corazones por jugador ---
    let y = 26;
    const players = view.players.slice().sort((a, b) => a.slot - b.slot);
    for (const p of players) {
      const hearts = Math.ceil(p.maxHp / 2);
      const x0 = 88;
      ctx.save();
      ctx.fillStyle = 'rgba(10,7,16,.55)';
      rrect(ctx, 12, y - 15, 300, 30, 9); ctx.fill();
      ctx.restore();

      // retrato / color
      ctx.fillStyle = p.color;
      circle(ctx, 28, y, 9); ctx.fill();
      ctx.fillStyle = 'rgba(0,0,0,.35)';
      circle(ctx, 28, y, 9);
      ctx.strokeStyle = 'rgba(255,255,255,.4)'; ctx.lineWidth = 1.5; ctx.stroke();
      if (p.dead) {
        ctx.strokeStyle = '#ff5c6c'; ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(21, y - 7); ctx.lineTo(35, y + 7);
        ctx.moveTo(35, y - 7); ctx.lineTo(21, y + 7);
        ctx.stroke();
      }

      const hx = x0;
      for (let i = 0; i < hearts; i++) {
        const val = clamp(p.hp - i * 2, 0, 2);
        drawHeartShape(hx + i * 17, y, 9, val);
      }

      // monedas
      ctx.save();
      ctx.fillStyle = '#ffd166';
      circle(ctx, x0 + hearts * 17 + 16, y, 6); ctx.fill();
      ctx.restore();
      text(String(p.coins), x0 + hearts * 17 + 26, y + 1, {
        font: 'bold 12px ui-monospace, monospace', color: '#ffe9b0', align: 'left',
      });

      y += 36;
    }

    // --- Objetos del jugador local ---
    const me = view.players.find((p) => p.id === view.localId) || view.players[0];
    if (me && me.items.length) {
      const iy = C.VIEW_H - 26;
      ctx.save();
      ctx.fillStyle = 'rgba(10,7,16,.55)';
      rrect(ctx, 12, iy - 17, Math.max(60, me.items.length * 30 + 14), 34, 9); ctx.fill();
      ctx.restore();
      me.items.forEach((itId, i) => {
        const item = Entities.itemById(itId);
        drawItemIcon(itId, 30 + i * 30, iy, 11);
      });
    }

    // --- Piso ---
    text('PISO ' + view.floorNum + ' / ' + C.FLOORS, C.VIEW_W / 2, 24, {
      font: 'bold 15px ui-monospace, monospace', letterSpacing: '2px', color: '#e7ddf5',
    });

    // --- Objetivo de la sala ---
    if (view.room.type === 'boss' && !view.room.cleared) {
      text('¡JEFE!', C.VIEW_W / 2, 48, { font: 'bold 16px ui-monospace, monospace', color: '#ff6b8a' });
    } else if (!view.room.cleared && view.enemies.length) {
      text('Enemigos: ' + view.enemies.length, C.VIEW_W / 2, 48, {
        font: 'bold 13px ui-monospace, monospace', color: '#a294bb',
      });
    }

    drawMinimap(view);

    // --- Mensaje central ---
    if (view.messageTimer > 0 && view.message) {
      const a = clamp(view.messageTimer, 0, 1);
      ctx.save();
      ctx.globalAlpha = a;
      ctx.fillStyle = 'rgba(8,6,14,.72)';
      rrect(ctx, C.VIEW_W / 2 - 210, 92, 420, 34, 10); ctx.fill();
      text(view.message, C.VIEW_W / 2, 110, { font: 'bold 16px ui-monospace, monospace', color: '#ffe9b0' });
      ctx.restore();
    }

    // --- Ayuda breve ---
    if (view.hintTimer > 0) {
      ctx.save();
      ctx.globalAlpha = clamp(view.hintTimer / 2, 0, 1) * 0.9;
      text('WASD mover · Flechas disparar · Esc pausa', C.VIEW_W / 2, C.VIEW_H - 16, {
        font: 'bold 12px ui-monospace, monospace', color: '#8b7ba6',
      });
      ctx.restore();
    }

    // --- Ping online ---
    if (view.mode === 'host' || view.mode === 'client') {
      const meP = view.players.find((p) => p.id === view.localId);
      if (meP && meP.ping) {
        text(meP.ping + ' ms', C.VIEW_W - 12, C.VIEW_H - 14, {
          font: 'bold 11px ui-monospace, monospace', color: '#6f6285', align: 'right',
        });
      }
    }
  }

  function drawMinimap(view) {
    const rooms = view.minimap || [];
    if (!rooms.length) return;
    const W = 190, H = 108;
    const X = C.VIEW_W - W - 12, Y = 12;

    ctx.save();
    ctx.fillStyle = 'rgba(10,7,16,.6)';
    rrect(ctx, X, Y, W, H, 10); ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,.1)';
    ctx.lineWidth = 1;
    rrect(ctx, X, Y, W, H, 10); ctx.stroke();

    const cw = 20, ch = 15, gapx = 24, gapy = 19;
    // centrar el conjunto de habitaciones
    let minx = 99, maxx = -99, miny = 99, maxy = -99;
    for (const r of rooms) {
      minx = Math.min(minx, r.gx); maxx = Math.max(maxx, r.gx);
      miny = Math.min(miny, r.gy); maxy = Math.max(maxy, r.gy);
    }
    const spanW = (maxx - minx) * gapx + cw;
    const spanH = (maxy - miny) * gapy + ch;
    const ox = X + (W - spanW) / 2 - minx * gapx;
    const oy = Y + (H - spanH) / 2 - miny * gapy;

    for (const r of rooms) {
      if (!r.visited) continue;
      const x = ox + r.gx * gapx;
      const y = oy + r.gy * gapy;

      // conexiones
      ctx.strokeStyle = 'rgba(180,160,220,.35)';
      ctx.lineWidth = 3;
      if (r.doors.up && r.northVisited) { ctx.beginPath(); ctx.moveTo(x + cw / 2, y); ctx.lineTo(x + cw / 2, y - gapy + ch); ctx.stroke(); }
      if (r.doors.left && r.westVisited) { ctx.beginPath(); ctx.moveTo(x, y + ch / 2); ctx.lineTo(x - gapx + cw, y + ch / 2); ctx.stroke(); }

      let fill = '#3a2f52';
      if (r.type === 'treasure') fill = '#a5822f';
      else if (r.type === 'boss') fill = '#7d2c3d';
      else if (r.type === 'shop') fill = '#2f6b4c';
      else if (r.type === 'start') fill = '#3d4a6b';

      ctx.fillStyle = fill;
      rrect(ctx, x, y, cw, ch, 4); ctx.fill();

      if (r.cleared) {
        ctx.strokeStyle = 'rgba(255,255,255,.25)';
        ctx.lineWidth = 1.5;
        rrect(ctx, x + 2, y + 2, cw - 4, ch - 4, 3); ctx.stroke();
      }

      if (r.current) {
        ctx.strokeStyle = '#ffd166';
        ctx.lineWidth = 2.5;
        rrect(ctx, x - 2, y - 2, cw + 4, ch + 4, 5); ctx.stroke();
        ctx.fillStyle = '#fff';
        circle(ctx, x + cw / 2, y + ch / 2, 2.6); ctx.fill();
      }
      if (r.type === 'boss' && r.visited) {
        text('☠', x + cw / 2, y + ch / 2 + 1, { font: 'bold 11px sans-serif', color: '#ffdce2', shadow: false });
      }
    }
    ctx.restore();
  }

  // ---------------------------------------------------------
  // Color helper
  // ---------------------------------------------------------
  const shadeCache = new Map();
  function shade(hex, amt) {
    const key = hex + amt;
    if (shadeCache.has(key)) return shadeCache.get(key);
    let h = hex.replace('#', '');
    if (h.length === 3) h = h.split('').map((c) => c + c).join('');
    let r = parseInt(h.slice(0, 2), 16);
    let g = parseInt(h.slice(2, 4), 16);
    let b = parseInt(h.slice(4, 6), 16);
    const f = (v) => clamp(Math.round(amt > 0 ? v + (255 - v) * amt : v * (1 + amt)), 0, 255);
    const out = '#' + [f(r), f(g), f(b)].map((v) => v.toString(16).padStart(2, '0')).join('');
    shadeCache.set(key, out);
    return out;
  }

  // ---------------------------------------------------------
  // Frame completo
  // ---------------------------------------------------------
  function frame(view) {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, C.VIEW_W, C.VIEW_H);

    // fondo
    const bg = ctx.createRadialGradient(C.VIEW_W / 2, C.VIEW_H / 2, 60, C.VIEW_W / 2, C.VIEW_H / 2, 620);
    bg.addColorStop(0, '#181322');
    bg.addColorStop(1, '#07050b');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, C.VIEW_W, C.VIEW_H);

    // sacudida de cámara
    if (view.shake > 0) {
      const s = view.shake;
      ctx.translate((Math.random() - 0.5) * s * 12, (Math.random() - 0.5) * s * 12);
    }

    // habitación cacheada
    const roomCv = getRoomCanvas(view);
    ctx.drawImage(roomCv, C.ROOM_X, C.ROOM_Y, C.ROOM_W, C.ROOM_H);

    // transición entre habitaciones
    if (view.transition > 0) {
      const t = view.transition;
      ctx.save();
      ctx.globalAlpha = clamp(t, 0, 1) * 0.95;
      ctx.fillStyle = '#07050b';
      ctx.fillRect(C.ROOM_X, C.ROOM_Y, C.ROOM_W, C.ROOM_H);
      ctx.restore();
    }

    // pedestales
    for (const p of view.pedestals) drawPedestal(p, view);
    // recogibles
    for (const k of view.pickups) drawPickup(k, view);
    // enemigos
    for (const e of view.enemies) drawEnemy(e);
    // jugadores
    for (const p of view.players) drawPlayer(p, view, p.id === view.localId);
    // balas
    for (const b of view.bullets) drawBullet(b);
    // partículas
    ctx.save();
    for (const pt of view.particles) {
      const a = clamp(pt.life / pt.max, 0, 1);
      ctx.globalAlpha = a;
      ctx.fillStyle = pt.color;
      ctx.fillRect(pt.x - pt.r / 2, pt.y - pt.r / 2, pt.r, pt.r);
    }
    ctx.restore();

    // viñeta
    const vg = ctx.createRadialGradient(C.VIEW_W / 2, C.VIEW_H / 2, 220, C.VIEW_W / 2, C.VIEW_H / 2, 620);
    vg.addColorStop(0, 'rgba(0,0,0,0)');
    vg.addColorStop(1, 'rgba(0,0,0,.6)');
    ctx.fillStyle = vg;
    ctx.fillRect(0, 0, C.VIEW_W, C.VIEW_H);

    ctx.setTransform(1, 0, 0, 1, 0, 0);

    // HUD (sin sacudida)
    drawHUD(view);

    // mensaje de piso
    if (view.bigMessage && view.bigMessage.t > 0) {
      const a = clamp(view.bigMessage.t, 0, 1);
      ctx.save();
      ctx.globalAlpha = a;
      ctx.fillStyle = 'rgba(6,4,10,.66)';
      ctx.fillRect(0, C.VIEW_H / 2 - 52, C.VIEW_W, 104);
      text(view.bigMessage.text, C.VIEW_W / 2, C.VIEW_H / 2 - 12, {
        font: 'bold 32px ui-monospace, monospace', color: '#ffd166',
      });
      if (view.bigMessage.sub) {
        text(view.bigMessage.sub, C.VIEW_W / 2, C.VIEW_H / 2 + 22, {
          font: 'bold 14px ui-monospace, monospace', color: '#d9cfe8',
        });
      }
      ctx.restore();
    }
  }

  global.Render = { init, frame, drawItemIcon, shade };
})(typeof window !== 'undefined' ? window : globalThis);
