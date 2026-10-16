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
  let showHitboxes = true;   // ¿se muestran las cajas de colisión? (tecla H)

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
  // Decoración procedural de suelos y muros (una por piso).
  // Cada tema trae `decor` (suelo) y `wallStyle` (muro) que eligen
  // aquí una rutina distinta; así ningún piso se ve igual.
  // ---------------------------------------------------------
  function paintFloor(g, view, th) {
    th = th || {};
    const decor = th.decor || 'tile';
    const floorCol = th.floor || '#241c33';

    for (let ty = 0; ty < C.ROWS; ty++) {
      for (let tx = 0; tx < C.COLS; tx++) {
        const x = C.ROOM_X + tx * C.TILE;
        const y = C.ROOM_Y + ty * C.TILE;
        const h = hash01(tx, ty, view.floorNum * 31 + view.room.gx * 7 + view.room.gy);
        const l = Math.floor(h * 12);
        g.fillStyle = shade(floorCol, ((tx + ty) % 2 === 0 ? 0.05 : -0.03) + (l - 6) / 180);
        g.fillRect(x, y, C.TILE, C.TILE);

        switch (decor) {
          case 'tile': { // Sótano: losas grandes con junta y bisel
            if (tx % 2 === 0) { g.fillStyle = 'rgba(0,0,0,.22)'; g.fillRect(x, y, 2, C.TILE); }
            if (ty % 2 === 0) { g.fillStyle = 'rgba(0,0,0,.22)'; g.fillRect(x, y, C.TILE, 2); }
            if (tx % 2 === 0 && ty % 2 === 0) {
              g.fillStyle = 'rgba(255,255,255,.05)';
              g.fillRect(x + 2, y + 2, C.TILE - 2, 2);
              g.fillRect(x + 2, y + 2, 2, C.TILE - 2);
            }
            break;
          }
          case 'cave': { // Cuevas: tierra con piedras y grietas
            if (h > 0.68) {
              g.fillStyle = 'rgba(0,0,0,.20)';
              g.beginPath(); g.ellipse(x + 10 + h * 30, y + 12 + h * 30, 3 + h * 4, 2 + h * 3, h * 3, 0, Math.PI * 2); g.fill();
            }
            if (h < 0.16) {
              g.strokeStyle = 'rgba(0,0,0,.28)'; g.lineWidth = 1.5;
              g.beginPath(); g.moveTo(x + 6, y + 8); g.lineTo(x + 26, y + 24); g.lineTo(x + 16, y + 46); g.stroke();
            }
            break;
          }
          case 'tomb': { // Catacumbas: losas con juntas y huesos
            g.fillStyle = 'rgba(0,0,0,.28)';
            if (tx % 3 === 0) g.fillRect(x, y, 2, C.TILE);
            if (ty % 2 === 0) g.fillRect(x, y, C.TILE, 2);
            if (h > 0.85) {
              g.fillStyle = '#c9c0ac';
              g.fillRect(x + 12, y + 22, 22, 5);
              g.fillRect(x + 15, y + 16, 4, 7); g.fillRect(x + 27, y + 16, 4, 7);
            }
            break;
          }
          case 'flesh': { // Vientre: membrana y venas
            g.fillStyle = `rgba(120,30,55,${0.10 + h * 0.12})`;
            g.beginPath(); g.ellipse(x + 18 + Math.sin(h * 6) * 12, y + 28, 16 + h * 8, 10 + h * 6, h * 3, 0, Math.PI * 2); g.fill();
            g.strokeStyle = 'rgba(200,80,120,.18)'; g.lineWidth = 1.4;
            g.beginPath(); g.moveTo(x, y + 10 + h * 30);
            g.bezierCurveTo(x + 20, y + 5, x + 30, y + 50, x + C.TILE, y + 30 + h * 10); g.stroke();
            break;
          }
          case 'sand': { // Desierto: ondulaciones de arena
            g.strokeStyle = 'rgba(255,235,190,.10)'; g.lineWidth = 2;
            for (let i = 0; i < 3; i++) {
              const yy = y + 8 + i * 18 + Math.sin((tx + i) * 1.3) * 4;
              g.beginPath(); g.moveTo(x, yy);
              g.quadraticCurveTo(x + 26, yy - 6, x + C.TILE, yy); g.stroke();
            }
            break;
          }
          case 'ice': { // Criohielo: grietas heladas y destellos
            if (h > 0.6) {
              g.strokeStyle = 'rgba(200,240,255,.15)'; g.lineWidth = 1.4;
              g.beginPath(); g.moveTo(x + h * 40, y); g.lineTo(x + 10 + h * 20, y + C.TILE); g.stroke();
            }
            if (h < 0.12) { g.fillStyle = 'rgba(230,250,255,.5)'; g.fillRect(x + 10 + h * 30, y + 12 + h * 26, 2, 2); }
            break;
          }
          case 'ember': { // Infierno: roca con grietas de lava
            g.strokeStyle = `rgba(255,${90 + Math.floor(h * 60)},30,${0.22 + h * 0.3})`;
            g.lineWidth = 2;
            g.beginPath(); g.moveTo(x + h * 50, y); g.lineTo(x + 20 + h * 10, y + 30); g.lineTo(x + 40 + h * 10, y + C.TILE); g.stroke();
            if (h > 0.78) { g.fillStyle = '#ffb14a'; g.fillRect(x + 12 + h * 26, y + 20 + h * 10, 3, 3); }
            break;
          }
          case 'void': { // Vacío: casi negro con estrellas
            if (h > 0.82) { g.fillStyle = `rgba(190,170,255,${0.2 + h * 0.4})`; g.fillRect(x + 8 + h * 36, y + 8 + h * 36, 2, 2); }
            if (h < 0.06) {
              g.strokeStyle = 'rgba(140,110,220,.25)'; g.lineWidth = 1;
              g.beginPath(); g.moveTo(x + 8, y + 8); g.lineTo(x + 44, y + 44); g.stroke();
            }
            break;
          }
          case 'cloud': { // Cielo: nubes suaves
            g.fillStyle = `rgba(230,240,255,${0.05 + h * 0.06})`;
            g.beginPath();
            g.ellipse(x + 12, y + 34, 18, 8, 0, 0, Math.PI * 2);
            g.ellipse(x + 34, y + 28, 16, 9, 0, 0, Math.PI * 2);
            g.fill();
            break;
          }
        }
      }
    }
  }

  function paintWalls(g, view, th) {
    th = th || {};
    const wallCol = th.wall || '#5a4b78';
    const wallDark = th.wall2 || shade(wallCol, -0.28);
    const style = th.wallStyle || 'brick';
    const ax = C.ROOM_X, ay = C.ROOM_Y, aw = C.ROOM_W, ah = C.ROOM_H;
    const bands = [
      [C.ROOM_X, C.ROOM_Y, C.ROOM_W, C.WALL],
      [C.ROOM_X, C.ROOM_Y + C.ROOM_H - C.WALL, C.ROOM_W, C.WALL],
      [C.ROOM_X, C.ROOM_Y, C.WALL, C.ROOM_H],
      [C.ROOM_X + C.ROOM_W - C.WALL, C.ROOM_Y, C.WALL, C.ROOM_H],
    ];

    // base con degradado
    for (const b of bands) {
      const grad = g.createLinearGradient(b[0], b[1], b[0], b[1] + b[3]);
      grad.addColorStop(0, shade(wallCol, 0.2));
      grad.addColorStop(1, wallDark);
      g.fillStyle = grad;
      g.fillRect(b[0], b[1], b[2], b[3]);
    }

    g.save();
    g.beginPath();
    for (const b of bands) g.rect(b[0], b[1], b[2], b[3]);
    g.clip();

    switch (style) {
      case 'brick': { // Sótano
        g.strokeStyle = 'rgba(0,0,0,.32)'; g.lineWidth = 2;
        const bh = 13, bw = 26;
        for (let yy = ay, row = 0; yy < ay + ah; yy += bh, row++) {
          g.beginPath(); g.moveTo(ax, yy); g.lineTo(ax + aw, yy); g.stroke();
          for (let xx = ax - (row % 2) * (bw / 2); xx < ax + aw; xx += bw) {
            g.beginPath(); g.moveTo(xx, yy); g.lineTo(xx, yy + bh); g.stroke();
          }
        }
        break;
      }
      case 'rock': { // Cuevas
        for (let yy = ay; yy < ay + ah; yy += 22) {
          for (let xx = ax; xx < ax + aw; xx += 30) {
            const h = hash01(xx | 0, yy | 0, view.floorNum * 13 + 7);
            g.fillStyle = shade(wallCol, h > 0.5 ? 0.09 : -0.13);
            g.beginPath(); g.ellipse(xx + 15, yy + 11, 16 + h * 6, 11 + h * 4, h, 0, Math.PI * 2); g.fill();
            g.strokeStyle = 'rgba(0,0,0,.3)'; g.lineWidth = 1.4; g.stroke();
          }
        }
        break;
      }
      case 'crypt': { // Catacumbas
        g.strokeStyle = 'rgba(0,0,0,.34)'; g.lineWidth = 2;
        const bh = 20, bw = 34;
        for (let yy = ay, row = 0; yy < ay + ah; yy += bh, row++) {
          g.beginPath(); g.moveTo(ax, yy); g.lineTo(ax + aw, yy); g.stroke();
          for (let xx = ax - (row % 2) * (bw / 2); xx < ax + aw; xx += bw) {
            g.beginPath(); g.moveTo(xx, yy); g.lineTo(xx, yy + bh); g.stroke();
          }
        }
        for (let xx = ax + 44; xx < ax + aw - 40; xx += 128) { // nichos con calaveras
          g.fillStyle = '#12171c'; g.fillRect(xx, ay + C.WALL - 17, 22, 17);
          g.fillStyle = '#d8d2c2'; circle(g, xx + 11, ay + C.WALL - 9, 6); g.fill();
          g.fillStyle = '#10151a';
          circle(g, xx + 8.5, ay + C.WALL - 10, 1.6); g.fill();
          circle(g, xx + 13.5, ay + C.WALL - 10, 1.6); g.fill();
          g.fillRect(xx + 8, ay + C.WALL - 5, 6, 2);
        }
        break;
      }
      case 'flesh': { // Vientre
        g.strokeStyle = 'rgba(190,70,110,.35)'; g.lineWidth = 2;
        for (let i = 0; i < 30; i++) {
          const h = hash01(i, view.floorNum, 5);
          const xx = ax + h * aw;
          g.beginPath(); g.moveTo(xx, ay);
          g.bezierCurveTo(xx + 20, ay + 40, xx - 20, ay + 90, xx + 10, ay + ah); g.stroke();
        }
        for (let i = 0; i < 24; i++) {
          const h = hash01(i, 3, view.floorNum);
          g.fillStyle = `rgba(255,120,160,${0.06 + h * 0.08})`;
          g.beginPath(); g.ellipse(ax + h * aw, ay + hash01(i, 9, 1) * ah, 6 + h * 8, 4 + h * 5, h * 3, 0, Math.PI * 2); g.fill();
        }
        break;
      }
      case 'sandstone': { // Desierto
        g.strokeStyle = 'rgba(0,0,0,.26)'; g.lineWidth = 2;
        const bh = C.WALL, bw = 52;
        for (let yy = ay, row = 0; yy < ay + ah; yy += bh, row++) {
          g.beginPath(); g.moveTo(ax, yy); g.lineTo(ax + aw, yy); g.stroke();
          for (let xx = ax - (row % 2) * (bw / 2); xx < ax + aw; xx += bw) {
            g.beginPath(); g.moveTo(xx, yy); g.lineTo(xx, yy + bh); g.stroke();
            const h = hash01(xx | 0, yy | 0, 11);
            if (h > 0.6) {
              g.fillStyle = 'rgba(70,50,20,.4)';
              g.fillRect(xx + 20, yy + 9, 3, 3); g.fillRect(xx + 27, yy + 9, 3, 3); g.fillRect(xx + 23, yy + 15, 5, 3);
            }
          }
        }
        break;
      }
      case 'ice': { // Criohielo
        g.strokeStyle = 'rgba(200,245,255,.14)'; g.lineWidth = 2;
        for (let xx = ax; xx < ax + aw; xx += 26) {
          g.beginPath(); g.moveTo(xx, ay); g.lineTo(xx + 10, ay + ah); g.stroke();
        }
        g.strokeStyle = 'rgba(0,0,0,.22)';
        for (let yy = ay; yy < ay + ah; yy += 26) {
          g.beginPath(); g.moveTo(ax, yy); g.lineTo(ax + aw, yy); g.stroke();
        }
        g.fillStyle = 'rgba(255,255,255,.10)';
        g.fillRect(ax, ay, aw, 4); g.fillRect(ax, ay + ah - C.WALL, aw, 4);
        break;
      }
      case 'obsidian': { // Infierno
        g.fillStyle = 'rgba(0,0,0,.36)';
        for (let xx = ax; xx < ax + aw; xx += 46) {
          g.beginPath(); g.moveTo(xx, ay); g.lineTo(xx + 20, ay + ah);
          g.lineTo(xx + 24, ay + ah); g.lineTo(xx + 4, ay); g.closePath(); g.fill();
        }
        g.strokeStyle = 'rgba(255,110,40,.5)'; g.lineWidth = 2;
        for (let xx = ax + 23; xx < ax + aw; xx += 46) {
          g.beginPath(); g.moveTo(xx, ay); g.lineTo(xx - 10, ay + ah); g.stroke();
        }
        break;
      }
      case 'void': { // Vacío
        g.strokeStyle = 'rgba(140,110,220,.20)'; g.lineWidth = 2;
        for (let xx = ax; xx < ax + aw; xx += 52) {
          g.beginPath(); g.moveTo(xx, ay); g.lineTo(xx, ay + ah); g.stroke();
        }
        for (let i = 0; i < 46; i++) {
          const h = hash01(i, view.floorNum, 21);
          g.fillStyle = `rgba(200,180,255,${0.15 + h * 0.5})`;
          g.fillRect(ax + h * aw, ay + hash01(i, 7, 3) * ah, 2, 2);
        }
        break;
      }
      case 'marble': { // Cielo
        g.strokeStyle = 'rgba(255,255,255,.10)'; g.lineWidth = 2;
        for (let i = 0; i < 24; i++) {
          const h = hash01(i, view.floorNum, 31);
          g.beginPath(); g.moveTo(ax, ay + h * ah);
          g.bezierCurveTo(ax + aw * 0.3, ay + h * ah + 14, ax + aw * 0.6, ay + h * ah - 14, ax + aw, ay + h * ah);
          g.stroke();
        }
        g.fillStyle = 'rgba(255,220,140,.5)';
        g.fillRect(ax, ay + C.WALL - 3, aw, 2);
        g.fillRect(ax, ay + ah - C.WALL + 1, aw, 2);
        g.fillRect(ax + C.WALL - 3, ay, 2, ah);
        g.fillRect(ax + aw - C.WALL + 1, ay, 2, ah);
        break;
      }
    }
    g.restore();

    // remaches/antorchas a lo largo del muro superior
    const propCol = th.prop || th.accent || '#ffb648';
    for (let xx = ax + 72; xx < ax + aw - 40; xx += 146) {
      const cy2 = ay + C.WALL - 6;
      g.fillStyle = shade(propCol, -0.45);
      g.fillRect(xx - 2, cy2 + 2, 4, 6);
      g.fillStyle = propCol;
      if (style === 'sandstone' || style === 'brick' || style === 'crypt' || style === 'obsidian' || style === 'marble') {
        g.beginPath(); g.ellipse(xx, cy2, 3, 4.5, 0, 0, Math.PI * 2); g.fill();       // llama
        g.fillStyle = 'rgba(255,240,190,.8)';
        g.beginPath(); g.ellipse(xx, cy2 + 1, 1.4, 2.2, 0, 0, Math.PI * 2); g.fill();
      } else {
        g.beginPath(); g.moveTo(xx, cy2 - 5); g.lineTo(xx + 3.5, cy2); g.lineTo(xx, cy2 + 5); g.lineTo(xx - 3.5, cy2); g.closePath(); g.fill(); // cristal
      }
    }
  }

  // ---------------------------------------------------------
  // Habitación pre-renderizada (suelo + muros + obstáculos + puertas)
  // ---------------------------------------------------------
  function roomSignature(view) {
    const r = view.room;
    let d = '';
    for (const n of ['up', 'down', 'left', 'right']) d += r.doors[n] ? '1' : '0';
    let l = '';
    for (const n of ['up', 'down', 'left', 'right']) l += (r.locks && r.locks[n]) ? '1' : '0';
    let bd = '';
    for (const n of ['up', 'down', 'left', 'right']) bd += (r.bossDoor && r.bossDoor[n]) ? '1' : '0';
    return view.floorNum + '|' + r.key + '|' + d + '|' + (r.cleared ? 1 : 0) + '|' + r.type + '|' + l + '|' + bd;
  }

  function buildRoomCanvas(view) {
    const r = view.room;
    const cv = document.createElement('canvas');
    cv.width = C.ROOM_W;
    cv.height = C.ROOM_H;
    const g = cv.getContext('2d');
    g.translate(-C.ROOM_X, -C.ROOM_Y);

    const open = r.cleared || r.type === 'start';
    const th = view.theme || null;

    // --- Suelo y muros: decoración propia de cada piso ---
    paintFloor(g, view, th);
    paintWalls(g, view, th);

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

    // tinte ambiental del piso
    if (th && th.tint) {
      g.save();
      g.fillStyle = th.tint;
      g.fillRect(C.ROOM_X, C.ROOM_Y, C.ROOM_W, C.ROOM_H);
      g.restore();
    }

    return cv;
  }

  // Marco propio de la PUERTA que lleva a la sala del jefe: filo rojo, pinchos
  // y una calavera. Se dibuja encima del vano (abierto o cerrado) para que se
  // reconozca a distancia.
  function drawBossDoorFrame(g, d, dir) {
    const rx = d.x - d.w / 2, ry = d.y - d.h / 2;
    const horiz = d.horiz;
    g.save();
    g.lineJoin = 'round';

    // banda roja alrededor del vano
    g.strokeStyle = '#3a0d14';
    g.lineWidth = 8;
    g.strokeRect(rx + 2, ry + 2, d.w - 4, d.h - 4);
    g.strokeStyle = '#d6394f';
    g.lineWidth = 2.5;
    g.strokeRect(rx + 1, ry + 1, d.w - 2, d.h - 2);

    // pinchos en los bordes largos del vano
    g.fillStyle = '#e0503f';
    const n = 4;
    for (let i = 0; i < n; i++) {
      const t = (i + 1) / (n + 1);
      const px = rx + (horiz ? d.w * t : 0);
      const py = ry + (horiz ? 0 : d.h * t);
      const s = 6;
      g.beginPath();
      if (horiz) { g.moveTo(px - s, ry + 1); g.lineTo(px, ry + 1 + s); g.lineTo(px + s, ry + 1); }
      else { g.moveTo(rx + 1, py - s); g.lineTo(rx + 1 + s, py); g.lineTo(rx + 1, py + s); }
      g.closePath(); g.fill();
      g.beginPath();
      if (horiz) { g.moveTo(px - s, ry + d.h - 1); g.lineTo(px, ry + d.h - 1 - s); g.lineTo(px + s, ry + d.h - 1); }
      else { g.moveTo(rx + d.w - 1, py - s); g.lineTo(rx + d.w - 1 - s, py); g.lineTo(rx + d.w - 1, py + s); }
      g.closePath(); g.fill();
    }

    // calavera en el centro del vano
    const cxs = d.x, cys = d.y;
    g.fillStyle = '#f0ead8';
    circle(g, cxs, cys, 7); g.fill();
    g.fillStyle = '#241018';
    circle(g, cxs - 2.4, cys - 1.5, 1.7); g.fill();
    circle(g, cxs + 2.4, cys - 1.5, 1.7); g.fill();
    g.fillRect(cxs - 3.5, cys + 2.5, 7, 2.2);
    g.strokeStyle = '#d6394f';
    g.lineWidth = 1.5;
    circle(g, cxs, cys, 9); g.stroke();
    g.restore();
  }

  // Marco propio de las puertas de las salas opcionales con llave. La del
  // TESORO es dorada (con una gema) y la de la TIENDA es verde (con una moneda):
  // se distinguen entre sí y de la puerta del jefe (roja con calavera).
  function drawSpecialDoorFrame(g, d, dir, kind) {
    const rx = d.x - d.w / 2, ry = d.y - d.h / 2;
    const gold = kind === 'treasure';
    const dark = gold ? '#4a3608' : '#0f3b24';
    const mid = gold ? '#f2b705' : '#2fae74';
    const light = gold ? '#ffe79a' : '#9df3c8';
    g.save();
    g.lineJoin = 'round';

    // banda de color alrededor del vano
    g.strokeStyle = dark;
    g.lineWidth = 8;
    g.strokeRect(rx + 2, ry + 2, d.w - 4, d.h - 4);
    g.strokeStyle = mid;
    g.lineWidth = 2.5;
    g.strokeRect(rx + 1, ry + 1, d.w - 2, d.h - 2);

    // tachuelas en las cuatro esquinas
    g.fillStyle = light;
    const cs = [[rx + 1, ry + 1], [rx + d.w - 1, ry + 1], [rx + 1, ry + d.h - 1], [rx + d.w - 1, ry + d.h - 1]];
    for (const c of cs) { circle(g, c[0], c[1], 3.2); g.fill(); }

    // emblema central: gema (tesoro) o moneda (tienda)
    const cxs = d.x, cys = d.y;
    g.fillStyle = dark;
    circle(g, cxs, cys, 9); g.fill();
    g.fillStyle = mid;
    circle(g, cxs, cys, 7); g.fill();
    g.fillStyle = light;
    if (gold) {
      g.beginPath();
      g.moveTo(cxs, cys - 5); g.lineTo(cxs + 4.2, cys); g.lineTo(cxs, cys + 5); g.lineTo(cxs - 4.2, cys);
      g.closePath(); g.fill();
      g.strokeStyle = dark; g.lineWidth = 1.2; g.stroke();
    } else {
      circle(g, cxs, cys, 4); g.fill();
      g.strokeStyle = dark; g.lineWidth = 1.4; g.stroke();
      g.beginPath(); g.moveTo(cxs, cys - 2.4); g.lineTo(cxs, cys + 2.4); g.stroke();
    }
    g.restore();
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
    const locked = !!(r.locks && r.locks[dir]);
    const isBossDoor = !!(r.bossDoor && r.bossDoor[dir]);
    const kind = r.doorKinds ? r.doorKinds[dir] : null;
    const d = doorGeometry(dir);
    const rx = d.x - d.w / 2, ry = d.y - d.h / 2;

    // vano excavado en el muro
    g.fillStyle = (open && !locked) ? '#2a2237' : '#241d31';
    g.fillRect(rx, ry, d.w, d.h);

    if (open && !locked) {
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
      // puerta cerrada (o con llave) con barrotes
      g.fillStyle = locked ? '#6b5a2e' : '#5d5470';
      g.fillRect(rx, ry, d.w, d.h);
      g.strokeStyle = locked ? '#3a2f12' : '#2b2438';
      g.lineWidth = 5;
      g.strokeRect(rx + 2, ry + 2, d.w - 4, d.h - 4);
      // candado
      const cx = d.x, cy = d.y;
      g.fillStyle = locked ? '#ffe08a' : '#e0b070';
      if (d.horiz) circle(g, cx, cy + (dir === 'up' ? 2 : -2), 5);
      else circle(g, cx + (dir === 'left' ? 2 : -2), cy, 5);
      g.fill();
      if (locked) {
        // arco del candado
        g.strokeStyle = '#fff0b0';
        g.lineWidth = 3;
        g.beginPath();
        g.arc(cx, cy - 5, 4, Math.PI, 0);
        g.stroke();
      }
    }

    // la puerta que lleva al jefe lleva su propio marco
    if (isBossDoor) drawBossDoorFrame(g, d, dir);
    // las puertas con llave de la tienda y del tesoro tienen marcos propios
    else if (kind === 'treasure' || kind === 'shop') drawSpecialDoorFrame(g, d, dir, kind);
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
    // nunca dibujar entidades con posición no finita (evita que un NaN rompa el frame)
    if (!isFinite(p.x) || !isFinite(p.y) || !isFinite(p.walkPhase)) return;
    const sk = (typeof Entities !== 'undefined' && Entities.skinAt) ? Entities.skinAt(p.skin) : null;
    const dead = p.dead;
    const alpha = dead ? 0.4 : (p.invuln > 0 && Math.floor(p.invuln * 14) % 2 === 0 ? 0.42 : 1);
    const bob = dead ? 0 : Math.sin(p.walkPhase * 3) * 1.4;

    ctx.save();
    ctx.globalAlpha = alpha;
    if (sk && sk.ghost) ctx.globalAlpha *= 0.82;

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

    // cuerpo (bloques: tapa clara + banda oscura abajo)
    pbox(bx - 10, by - 2, 20, 18, p.color);
    pbox(bx - 10, by + 8, 20, 8, shade(p.color, -0.35));
    // piernas (se balancean al caminar)
    const swing = Math.sin(p.walkPhase * 3) * 3;
    pbox(bx - 8, by + 13, 6, 6 + Math.abs(swing) * 0.3, shade(p.color, -0.5));
    pbox(bx + 2, by + 13, 6, 6 + Math.abs(swing) * 0.3, shade(p.color, -0.5));

    // cabeza redonda (+ ojos, boca y accesorio de la piel)
    drawHeadFace(ctx, bx, by - 9, 11.5, sk, fx, fy);

    // lágrima
    ctx.fillStyle = 'rgba(180,225,255,.9)';
    const ty = by - 14 - ((Utils.now() * 22 + p.slot * 9) % 8);
    circle(ctx, bx - 8.5, ty, 1.8); ctx.fill();

    ctx.restore();

    // Moscas familiares orbitando (misma órbita que usa la simulación).
    if (!dead && typeof Entities.familiarPos === 'function') {
      const fam = Entities.profile(p).familiars;
      for (let i = 0; i < fam; i++) {
        const fp = Entities.familiarPos(p, i, fam, (view && view.time) || 0);
        const flap = Math.sin(Utils.now() * 16 + i) * 3;
        ctx.save();
        shadowBlob(ctx, fp.x, fp.y + 9, 6, 2.5, 0.22);
        ctx.fillStyle = 'rgba(200,170,255,.55)';
        ctx.beginPath();
        ctx.ellipse(fp.x - 6, fp.y - 3 - flap * 0.3, 4.5, 2.8, -0.5, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath();
        ctx.ellipse(fp.x + 6, fp.y - 3 - flap * 0.3, 4.5, 2.8, 0.5, 0, Math.PI * 2); ctx.fill();
        drawBlobBody(fp.x, fp.y, 6, '#c76bd8', '#7d3a91');
        drawEyes(fp.x, fp.y, 2.2, 0.9, '#fff', '#2a1533');
        ctx.restore();
      }
    }

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

  // Cabeza del personaje reutilizable (se usa en el juego y en los iconos de
  // selección). hx,hy = centro de la cabeza; r = radio. fx,fy = mirada.
  function drawHeadFace(g, hx, hy, r, sk, fx, fy) {
    const skinCol = (sk && sk.skin) || '#f2d0a4';
    const eyeCol = (sk && sk.eye) || '#20182b';
    // cara redonda
    g.fillStyle = skinCol;
    circle(g, hx, hy, r); g.fill();
    g.fillStyle = 'rgba(0,0,0,.12)';
    g.fillRect(hx - r * 0.7, hy + r * 0.5, r * 1.4, r * 0.26);
    // ojos redondos mirando hacia donde apunta
    const ex = clamp(fx, -1, 1) * r * 0.28;
    const ey = clamp(fy, -1, 1) * r * 0.21;
    g.fillStyle = '#fff';
    circle(g, hx - r * 0.365, hy - r * 0.13, r * 0.304); g.fill();
    circle(g, hx + r * 0.365, hy - r * 0.13, r * 0.304); g.fill();
    g.fillStyle = eyeCol;
    circle(g, hx - r * 0.365 + ex, hy - r * 0.13 + ey, r * 0.165); g.fill();
    circle(g, hx + r * 0.365 + ex, hy - r * 0.13 + ey, r * 0.165); g.fill();
    // boca
    g.strokeStyle = 'rgba(90,40,50,.75)';
    g.lineWidth = Math.max(1, r * 0.14);
    g.beginPath();
    g.arc(hx, hy + r * 0.39, r * 0.3, 0.25 * Math.PI, 0.75 * Math.PI);
    g.stroke();
    // accesorio de la piel
    if (sk && sk.acc) drawSkinAcc(g, sk.acc, hx, hy, r, sk);
  }

  // Accesorio de la piel, relativo al centro de la cabeza (r = 11.5 base).
  function drawSkinAcc(g, acc, hx, hy, r, sk) {
    const s = r / 11.5;
    const X = (v) => hx + v * s;
    const Y = (v) => hy + v * s;
    const R = (v) => v * s;
    g.save();
    if (acc === 'halo') {
      g.strokeStyle = '#ffe98a';
      g.lineWidth = 2.4 * s;
      g.beginPath();
      g.ellipse(X(0), Y(-12), R(9), R(3.2), 0, 0, Math.PI * 2);
      g.stroke();
    } else if (acc === 'horns') {
      g.fillStyle = '#efe6dc';
      g.beginPath();
      g.moveTo(X(-9), Y(-6)); g.lineTo(X(-4), Y(-18)); g.lineTo(X(-5), Y(-5));
      g.closePath(); g.fill();
      g.beginPath();
      g.moveTo(X(9), Y(-6)); g.lineTo(X(4), Y(-18)); g.lineTo(X(5), Y(-5));
      g.closePath(); g.fill();
    } else if (acc === 'bow') {
      g.fillStyle = '#ff8fb0';
      circle(g, X(-8), Y(-10), R(3.4)); g.fill();
      circle(g, X(-2.5), Y(-11.5), R(2.6)); g.fill();
    } else if (acc === 'headphones') {
      g.strokeStyle = '#3a3350';
      g.lineWidth = 2.2 * s;
      g.beginPath();
      g.arc(X(0), Y(-1), R(12.5), Math.PI * 1.04, Math.PI * 1.96);
      g.stroke();
      g.fillStyle = '#3a3350';
      circle(g, X(-12), Y(-1), R(3.2)); g.fill();
      circle(g, X(12), Y(-1), R(3.2)); g.fill();
    } else if (acc === 'antenna') {
      g.strokeStyle = '#7f8ea3';
      g.lineWidth = 1.6 * s;
      g.beginPath();
      g.moveTo(X(0), Y(-10.5)); g.lineTo(X(3), Y(-19));
      g.stroke();
      g.fillStyle = (sk && sk.eye) || '#39ff88';
      circle(g, X(3), Y(-20), R(2.2)); g.fill();
    }
    g.restore();
  }

  // Cara redonda para los iconos de la interfaz (misma que en el juego).
  function drawFace(g, skinIdx, x, y, r) {
    const sk = (typeof Entities !== 'undefined' && Entities.skinAt) ? Entities.skinAt(skinIdx) : null;
    drawHeadFace(g, x, y, r, sk, 0, 0);
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

  // Aviso de ataque del jefe: un indicador claro para poder esquivarlo.
  // Ningún jefe ataca sin haber mostrado antes uno de estos.
  function drawTelegraph(e) {
    if (!(e.warnT > 0) || !e.warnKind) return;
    const max = e.warnMax > 0 ? e.warnMax : 1;
    const p = clamp(1 - e.warnT / max, 0, 1);   // 0 → 1 conforme se acerca el golpe
    const ang = e.warnAngle || 0;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';

    if (e.warnKind === 'line') {
      const len = 780;
      ctx.translate(e.x, e.y);
      ctx.rotate(ang);
      const lg = ctx.createLinearGradient(0, 0, len, 0);
      lg.addColorStop(0, 'rgba(255,120,90,' + (0.5 + 0.4 * p) + ')');
      lg.addColorStop(1, 'rgba(255,60,60,0)');
      ctx.fillStyle = lg;
      ctx.fillRect(0, -14, len, 28);
      ctx.fillStyle = 'rgba(255,240,210,' + (0.5 + 0.45 * p) + ')';
      ctx.fillRect(0, -3, len, 6);
    } else if (e.warnKind === 'fan') {
      const reach = 230 + 130 * p;
      const half = 0.5;
      ctx.beginPath();
      ctx.moveTo(e.x, e.y);
      ctx.arc(e.x, e.y, reach, ang - half, ang + half);
      ctx.closePath();
      ctx.fillStyle = 'rgba(255,190,110,' + (0.16 + 0.22 * p) + ')';
      ctx.fill();
      ctx.strokeStyle = 'rgba(255,230,170,' + (0.4 + 0.4 * p) + ')';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(e.x, e.y);
      ctx.arc(e.x, e.y, reach, ang - half, ang + half);
      ctx.closePath();
      ctx.stroke();
    } else if (e.warnKind === 'land') {
      const rr = 42 + 62 * p;
      ctx.strokeStyle = 'rgba(150,255,170,0.65)';
      ctx.lineWidth = 3;
      circle(ctx, e.x, e.y, rr); ctx.stroke();
      ctx.strokeStyle = 'rgba(120,240,150,.5)';
      circle(ctx, e.x, e.y, rr * 0.55); ctx.stroke();
    } else if (e.warnKind === 'summon') {
      const rr = e.r + 10 + 22 * p;
      ctx.strokeStyle = 'rgba(255,210,90,' + (0.5 + 0.4 * (1 - p)) + ')';
      ctx.lineWidth = 4;
      circle(ctx, e.x, e.y, rr); ctx.stroke();
    } else if (e.warnKind === 'tele') {
      ctx.strokeStyle = 'rgba(160,210,255,' + (0.4 + 0.5 * p) + ')';
      ctx.lineWidth = 3;
      circle(ctx, e.x, e.y, e.r + 6 + 30 * (1 - p)); ctx.stroke();
    } else if (e.warnKind === 'spiral') {
      ctx.strokeStyle = 'rgba(200,150,255,' + (0.4 + 0.5 * p) + ')';
      ctx.lineWidth = 3;
      circle(ctx, e.x, e.y, e.r + 4 + 18 * p); ctx.stroke();
    } else { // 'ring' | 'slam'
      const base = e.r + 6;
      const grow = 34 * p;
      ctx.strokeStyle = 'rgba(255,90,120,' + (0.5 + 0.4 * (1 - p)) + ')';
      ctx.lineWidth = 3;
      circle(ctx, e.x, e.y, base + grow); ctx.stroke();
      ctx.lineWidth = 1.5;
      circle(ctx, e.x, e.y, base + grow * 0.5); ctx.stroke();
    }
    ctx.restore();
  }

  // Paleta base por tipo de enemigo. Se mezcla con el color del piso
  // (`theme.accent`) para que el mismo enemigo cambie de aspecto según piso.
  const ENEMY_PALETTE = {
    fly:     { c1: '#c76bd8', c2: '#5a2b7a', mouth: '#7a4a96' },
    gaper:   { c1: '#e0705a', c2: '#7a2a1e', skin: '#e8c39a', mouth: '#3a0f16' },
    charger: { c1: '#d9a441', c2: '#8d6420', horn: '#f0e0b0' },
    spitter: { c1: '#7fd18a', c2: '#3f7a4c', tube: '#2f6b3c' },
    hopper:  { c1: '#7aa8e0', c2: '#3d5f8f' },
    fat:     { c1: '#c98fb0', c2: '#8f5d7c', skin: '#e0b8cc' },
    ghost:   { c1: '#dfeaff', c2: '#8aa8dc', mouth: '#5a6fa0' },
    sniper:  { c1: '#e0b0ff', c2: '#7a4ea0', cloak: '#4a2f66' },
  };

  function hexRgb(hex) {
    let h = String(hex).replace('#', '');
    if (h.length === 3) h = h.split('').map((c) => c + c).join('');
    return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
  }
  function mixHex(a, b, t) {
    const A = hexRgb(a), B = hexRgb(b);
    const m = (i) => clamp(Math.round(A[i] + (B[i] - A[i]) * t), 0, 255);
    return '#' + [m(0), m(1), m(2)].map((v) => v.toString(16).padStart(2, '0')).join('');
  }
  function drawEnemy(e, view) {
    if (!isFinite(e.x) || !isFinite(e.y)) return;
    const t = e.type;
    const accent = view && view.theme && view.theme.accent;
    if (accent) {
      // aura del piso: cada piso tiñe a sus enemigos con su color característico
      ctx.save();
      ctx.globalAlpha = 0.16;
      ctx.fillStyle = accent;
      circle(ctx, e.x, e.y, e.r * 1.7); ctx.fill();
      ctx.restore();
    }
    // Aviso de ataque (telegrafiado): se dibuja BAJO el cuerpo del jefe.
    if (e.warnT > 0) drawTelegraph(e);
    ctx.save();
    if (e.spawnT > 0) ctx.globalAlpha = Math.max(0.05, 1 - e.spawnT / 0.65);
    if (e.flash > 0) { ctx.globalAlpha = 1; }

    if (t !== 'fly') shadowBlob(ctx, e.x, e.y + e.r * 0.85, e.r * 0.9, e.r * 0.36, 0.34);

    const wob = e.wobble ? Math.sin(e.anim * 5) * 2 : 0;

    // Paleta del enemigo mezclada con el color del piso: el mismo tipo
    // se ve distinto según dónde aparezca.
    const acc = (view && view.theme && view.theme.accent) || null;
    const base = ENEMY_PALETTE[t] || ENEMY_PALETTE.fly;
    const c1 = acc ? mixHex(base.c1, acc, 0.3) : base.c1;
    const c2 = acc ? mixHex(base.c2, acc, 0.3) : base.c2;

    if (t === 'fly') {
      // Mosca: cuerpo pequeño, alas translúcidas y ojos compuestos grandes.
      const fy = e.y + wob;
      shadowBlob(ctx, e.x, e.y + 18, 10, 4, 0.26);
      const flap = Math.sin(e.anim * 16) * 5;
      ctx.fillStyle = 'rgba(230,205,255,.5)';
      ctx.beginPath(); ctx.ellipse(e.x - 13, fy - 7 - flap * 0.3, 9, 5, -0.5, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.ellipse(e.x + 13, fy - 7 - flap * 0.3, 9, 5, 0.5, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = 'rgba(90,40,120,.45)'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(e.x - 4, fy - 4); ctx.lineTo(e.x - 18, fy - 8 - flap * 0.3); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(e.x + 4, fy - 4); ctx.lineTo(e.x + 18, fy - 8 - flap * 0.3); ctx.stroke();
      drawBlobBody(e.x, fy, e.r, c1, c2);
      ctx.fillStyle = '#ff5566';
      circle(ctx, e.x - 5, fy - 2, 3.6); ctx.fill();
      circle(ctx, e.x + 5, fy - 2, 3.6); ctx.fill();
      ctx.fillStyle = '#3a0a14';
      circle(ctx, e.x - 5, fy - 2, 1.5); ctx.fill();
      circle(ctx, e.x + 5, fy - 2, 1.5); ctx.fill();
      ctx.fillStyle = c2;
      rrect(ctx, e.x - 1.6, fy + 6, 3.2, 7, 1.5); ctx.fill();
    } else if (t === 'gaper') {
      // Bocón: una cabeza que grita con la boca enorme.
      ctx.fillStyle = c2;
      circle(ctx, e.x, e.y, e.r * 1.02); ctx.fill();
      ctx.fillStyle = base.skin;
      circle(ctx, e.x, e.y - e.r * 0.12, e.r * 0.86); ctx.fill();
      ctx.fillStyle = 'rgba(0,0,0,.14)';
      ctx.beginPath(); ctx.ellipse(e.x, e.y - e.r * 0.6, e.r * 0.7, e.r * 0.24, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#fff';
      circle(ctx, e.x - e.r * 0.34, e.y - e.r * 0.3, e.r * 0.16); ctx.fill();
      circle(ctx, e.x + e.r * 0.34, e.y - e.r * 0.3, e.r * 0.16); ctx.fill();
      ctx.fillStyle = '#3a1414';
      circle(ctx, e.x - e.r * 0.34, e.y - e.r * 0.28, e.r * 0.08); ctx.fill();
      circle(ctx, e.x + e.r * 0.34, e.y - e.r * 0.28, e.r * 0.08); ctx.fill();
      ctx.fillStyle = base.mouth;
      ctx.beginPath(); ctx.ellipse(e.x, e.y + e.r * 0.3, e.r * 0.5, e.r * 0.46, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#f0ead8';
      for (let i = -2; i <= 2; i++) {
        const tx = e.x + i * e.r * 0.2;
        ctx.beginPath();
        ctx.moveTo(tx - 2, e.y + e.r * 0.08); ctx.lineTo(tx + 2, e.y + e.r * 0.08); ctx.lineTo(tx, e.y + e.r * 0.22);
        ctx.closePath(); ctx.fill();
      }
    } else if (t === 'charger') {
      // Embestidor: bestia con cuatro patas y cuernos, gira hacia su objetivo.
      const ang = Math.atan2(e.dir.y, e.dir.x);
      const charging = e.dashT > 0 || e.chargeT > 0;
      ctx.save();
      ctx.translate(e.x, e.y);
      ctx.rotate(ang);
      ctx.fillStyle = shade(c2, -0.2);
      const legSwing = charging ? Math.sin(e.anim * 18) * 3 : 0;
      rrect(ctx, -e.r * 0.6, -e.r * 0.95, e.r * 0.34, e.r * 0.5, 3); ctx.fill();
      rrect(ctx, -e.r * 0.6, e.r * 0.45 + legSwing, e.r * 0.34, e.r * 0.5, 3); ctx.fill();
      rrect(ctx, e.r * 0.25, -e.r * 0.95 - legSwing, e.r * 0.34, e.r * 0.5, 3); ctx.fill();
      rrect(ctx, e.r * 0.25, e.r * 0.45, e.r * 0.34, e.r * 0.5, 3); ctx.fill();
      ctx.fillStyle = c1;
      rrect(ctx, -e.r, -e.r * 0.72, e.r * 2, e.r * 1.44, e.r * 0.7); ctx.fill();
      ctx.fillStyle = c2;
      rrect(ctx, -e.r * 0.9, -e.r * 0.5, e.r * 0.9, e.r, e.r * 0.4); ctx.fill();
      ctx.fillStyle = shade(c2, -0.15);
      rrect(ctx, e.r * 0.7, -e.r * 0.34, e.r * 0.5, e.r * 0.68, e.r * 0.28); ctx.fill();
      ctx.fillStyle = '#fff';
      circle(ctx, e.r * 0.35, -e.r * 0.28, 4); ctx.fill();
      circle(ctx, e.r * 0.35, e.r * 0.28, 4); ctx.fill();
      ctx.fillStyle = charging ? '#ff3a3a' : '#2a1a05';
      circle(ctx, e.r * 0.5, -e.r * 0.28, 2); ctx.fill();
      circle(ctx, e.r * 0.5, e.r * 0.28, 2); ctx.fill();
      ctx.fillStyle = base.horn;
      ctx.beginPath();
      ctx.moveTo(-e.r * 0.7, -e.r * 0.72); ctx.lineTo(-e.r * 1.5, -e.r * 0.1); ctx.lineTo(-e.r * 0.6, -e.r * 0.15);
      ctx.closePath(); ctx.fill();
      ctx.beginPath();
      ctx.moveTo(-e.r * 0.7, e.r * 0.72); ctx.lineTo(-e.r * 1.5, e.r * 0.1); ctx.lineTo(-e.r * 0.6, e.r * 0.15);
      ctx.closePath(); ctx.fill();
      ctx.restore();
    } else if (t === 'spitter') {
      // Escupidor: planta/ooze con túbulo y raíces.
      ctx.fillStyle = c2;
      circle(ctx, e.x, e.y + e.r * 0.4, e.r * 1.02); ctx.fill();
      ctx.fillStyle = c1;
      circle(ctx, e.x, e.y + e.r * 0.2, e.r * 0.74); ctx.fill();
      ctx.strokeStyle = shade(c2, -0.25); ctx.lineWidth = 3;
      for (let i = -1; i <= 1; i++) {
        ctx.beginPath(); ctx.moveTo(e.x + i * e.r * 0.5, e.y + e.r * 0.7);
        ctx.quadraticCurveTo(e.x + i * e.r * 0.8, e.y + e.r * 1.1, e.x + i * e.r * 0.5, e.y + e.r * 1.35);
        ctx.stroke();
      }
      ctx.fillStyle = c1;
      circle(ctx, e.x, e.y - e.r * 0.5, e.r * 0.55); ctx.fill();
      drawEyes(e.x, e.y - e.r * 0.6, e.r * 0.3, 1.4, '#fff', '#12351c');
      ctx.fillStyle = base.tube;
      rrect(ctx, e.x - 3, e.y - e.r * 0.2, 6, e.r * 0.55, 3); ctx.fill();
      ctx.beginPath(); ctx.ellipse(e.x, e.y + e.r * 0.35, 5, 4, 0, 0, Math.PI * 2); ctx.fill();
    } else if (t === 'hopper') {
      // Saltarín: rana con patas y ojos saltones.
      const sq = Math.max(0, Math.sin(e.anim * 6)) * 7;
      const fy = e.y - sq;
      ctx.fillStyle = shade(c2, -0.1);
      ctx.beginPath(); ctx.ellipse(e.x - e.r * 0.75, fy + e.r * 0.5, e.r * 0.34, e.r * 0.5, 0.5, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.ellipse(e.x + e.r * 0.75, fy + e.r * 0.5, e.r * 0.34, e.r * 0.5, -0.5, 0, Math.PI * 2); ctx.fill();
      drawBlobBody(e.x, fy + e.r * 0.1, e.r, c1, c2);
      ctx.fillStyle = c1;
      circle(ctx, e.x - e.r * 0.4, fy - e.r * 0.7, e.r * 0.34); ctx.fill();
      circle(ctx, e.x + e.r * 0.4, fy - e.r * 0.7, e.r * 0.34); ctx.fill();
      ctx.fillStyle = '#fff';
      circle(ctx, e.x - e.r * 0.4, fy - e.r * 0.75, e.r * 0.2); ctx.fill();
      circle(ctx, e.x + e.r * 0.4, fy - e.r * 0.75, e.r * 0.2); ctx.fill();
      ctx.fillStyle = '#1a2334';
      circle(ctx, e.x - e.r * 0.42, fy - e.r * 0.75, e.r * 0.1); ctx.fill();
      circle(ctx, e.x + e.r * 0.38, fy - e.r * 0.75, e.r * 0.1); ctx.fill();
    } else if (t === 'fat') {
      // Gordo: barriga enorme con cabecita y bracitos.
      ctx.fillStyle = c2;
      circle(ctx, e.x, e.y + e.r * 0.1, e.r * 1.02); ctx.fill();
      ctx.fillStyle = c1;
      circle(ctx, e.x, e.y - e.r * 0.05, e.r * 0.88); ctx.fill();
      ctx.fillStyle = c2;
      circle(ctx, e.x - e.r * 0.85, e.y + e.r * 0.15, e.r * 0.24); ctx.fill();
      circle(ctx, e.x + e.r * 0.85, e.y + e.r * 0.15, e.r * 0.24); ctx.fill();
      ctx.fillStyle = base.skin;
      circle(ctx, e.x, e.y - e.r * 0.72, e.r * 0.4); ctx.fill();
      drawEyes(e.x, e.y - e.r * 0.78, e.r * 0.16, 1.2, '#fff', '#3a1f2e');
      drawMouth(e.x, e.y - e.r * 0.5, e.r * 0.1, '#4a2436');
      ctx.fillStyle = 'rgba(0,0,0,.14)';
      ctx.beginPath(); ctx.ellipse(e.x, e.y + e.r * 0.28, e.r * 0.42, e.r * 0.3, 0, 0, Math.PI * 2); ctx.fill();
    } else if (t === 'ghost') {
      // Espectro: sábana translúcida con cola ondulada y ojos huecos.
      ctx.save();
      ctx.globalAlpha *= 0.82;
      ctx.fillStyle = c2;
      ctx.beginPath();
      ctx.moveTo(e.x - e.r * 0.95, e.y + e.r * 0.2);
      const n = 5;
      for (let i = 0; i <= n; i++) {
        const xx = e.x - e.r * 0.95 + (i / n) * e.r * 1.9;
        const yy = e.y + e.r * 0.7 + (i % 2 === 0 ? 0 : e.r * 0.35) + Math.sin(e.anim * 5 + i) * 2;
        ctx.lineTo(xx, yy);
      }
      ctx.lineTo(e.x + e.r * 0.95, e.y - e.r * 0.3);
      ctx.arc(e.x, e.y - e.r * 0.25, e.r * 0.95, 0, Math.PI, true);
      ctx.closePath(); ctx.fill();
      ctx.fillStyle = c1;
      ctx.beginPath(); ctx.arc(e.x, e.y - e.r * 0.25, e.r * 0.8, Math.PI, 0); ctx.fill();
      ctx.fillRect(e.x - e.r * 0.8, e.y - e.r * 0.25, e.r * 1.6, e.r * 0.6);
      ctx.fillStyle = '#2a3a55';
      ctx.beginPath(); ctx.ellipse(e.x - e.r * 0.32, e.y - e.r * 0.35, e.r * 0.16, e.r * 0.22, 0, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.ellipse(e.x + e.r * 0.32, e.y - e.r * 0.35, e.r * 0.16, e.r * 0.22, 0, 0, Math.PI * 2); ctx.fill();
      drawMouth(e.x, e.y + e.r * 0.05, 3.5, base.mouth);
      ctx.restore();
    } else if (t === 'sniper') {
      // Francotirador: figura encapuchada con rifle que apunta.
      const ang = Math.atan2(e.dir.y, e.dir.x);
      ctx.fillStyle = base.cloak;
      ctx.beginPath();
      ctx.moveTo(e.x, e.y - e.r * 0.95);
      ctx.lineTo(e.x + e.r * 0.8, e.y + e.r * 0.8);
      ctx.lineTo(e.x, e.y + e.r * 0.5);
      ctx.lineTo(e.x - e.r * 0.8, e.y + e.r * 0.8);
      ctx.closePath(); ctx.fill();
      ctx.fillStyle = c1;
      circle(ctx, e.x, e.y - e.r * 0.5, e.r * 0.5); ctx.fill();
      ctx.fillStyle = '#1a1030';
      ctx.beginPath(); ctx.ellipse(e.x, e.y - e.r * 0.42, e.r * 0.34, e.r * 0.4, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#ff5a7a';
      circle(ctx, e.x + Math.cos(ang) * 3, e.y - e.r * 0.42 + Math.sin(ang) * 3, 2.4); ctx.fill();
      ctx.save();
      ctx.translate(e.x, e.y - e.r * 0.3); ctx.rotate(ang);
      ctx.fillStyle = '#3a2740';
      rrect(ctx, 0, -3, e.r + 16, 6, 2); ctx.fill();
      ctx.fillStyle = c2;
      rrect(ctx, e.r + 6, -4, 8, 8, 2); ctx.fill();
      ctx.restore();
    } else if (e.isBoss || (Entities.ENEMY_TYPES[t] && Entities.ENEMY_TYPES[t].isBoss)) {
      drawBoss(e);
    } else {
      drawBlobBody(e.x, e.y, e.r, c1, c2);
    }

    if (e.flash > 0) {
      ctx.globalAlpha = Math.min(1, e.flash * 6) * 0.8;
      ctx.globalCompositeOperation = 'lighter';
      ctx.fillStyle = '#fff';
      circle(ctx, e.x, e.y, e.r * 1.05);
      ctx.fill();
    }

    // Tinte de estados alterados: fuego, veneno y hielo.
    const st = e.st != null ? e.st : (((e.burn > 0) ? 1 : 0) | ((e.poison > 0) ? 2 : 0) | ((e.slow > 0) ? 4 : 0));
    if (st) {
      const now = Utils.now();
      ctx.globalCompositeOperation = 'lighter';
      if (st & 1) {
        ctx.globalAlpha = 0.26 + Math.abs(Math.sin(now * 9)) * 0.12;
        ctx.fillStyle = '#ff6b24';
        circle(ctx, e.x, e.y - Math.abs(Math.sin(now * 6)) * e.r * 0.3, e.r * 1.14);
        ctx.fill();
      }
      if (st & 2) {
        ctx.globalAlpha = 0.2;
        ctx.fillStyle = '#7ede52';
        circle(ctx, e.x, e.y, e.r * 1.07);
        ctx.fill();
      }
      if (st & 4) {
        ctx.globalAlpha = 0.3;
        ctx.fillStyle = '#7ad4ff';
        circle(ctx, e.x, e.y, e.r * 1.03);
        ctx.fill();
      }
      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = 1;
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

  // Cuerpo "blob" rasterizado en bloques (aspecto pixel-art).
  function drawBlobBody(x, y, r, c1, c2) {
    const ry = r * 0.94;
    const s = Math.max(2, Math.round(r * 0.32));
    const hw = (yy) => r * Math.sqrt(Math.max(0, 1 - (yy * yy) / (ry * ry)));
    // contorno pixelado
    ctx.fillStyle = 'rgba(0,0,0,.30)';
    for (let yy = -ry; yy <= ry; yy += s) {
      const w = hw(yy) + 2;
      ctx.fillRect(Math.round(x - w), Math.round(y + yy - s / 2), Math.round(w * 2), Math.round(s) + 1);
    }
    // cuerpo: banda clara arriba, oscura abajo
    for (let yy = -ry; yy <= ry; yy += s) {
      const w = hw(yy);
      ctx.fillStyle = yy < -ry * 0.15 ? c1 : c2;
      ctx.fillRect(Math.round(x - w), Math.round(y + yy - s / 2), Math.round(w * 2), Math.round(s));
    }
    // brillo superior-izquierda
    ctx.fillStyle = 'rgba(255,255,255,.16)';
    ctx.fillRect(Math.round(x - r * 0.5), Math.round(y - ry * 0.55), Math.round(r * 0.5), Math.round(s));
  }

  function drawEyes(x, y, sep, r, white, pupil) {
    const ew = Math.max(3, Math.round(r * 3));
    const eh = Math.max(4, Math.round(r * 3.2));
    const pw = Math.max(2, Math.round(r * 1.3));
    ctx.fillStyle = white;
    ctx.fillRect(Math.round(x - sep - ew / 2), Math.round(y - eh / 2), ew, eh);
    ctx.fillRect(Math.round(x + sep - ew / 2), Math.round(y - eh / 2), ew, eh);
    ctx.fillStyle = pupil;
    ctx.fillRect(Math.round(x - sep - pw / 2), Math.round(y - pw / 2), pw, pw);
    ctx.fillRect(Math.round(x + sep - pw / 2), Math.round(y - pw / 2), pw, pw);
  }

  function drawMouth(x, y, r, color) {
    ctx.fillStyle = color;
    const w = Math.max(3, Math.round(r * 2));
    const h = Math.max(2, Math.round(r * 1.1));
    ctx.fillRect(Math.round(x - w / 2), Math.round(y - h / 2), w, h);
  }

  function bossLook(e) {
    const t = Entities.ENEMY_TYPES[e.type];
    if (t && t.look) return t.look;
    return { c1: '#d4647a', c2: '#6d2333', horns: true };
  }

  // ---------------------------------------------------------
  // Jefes: cada uno tiene una SILUETA propia, dibujada con bloques
  // al estilo pixel-art (antes eran todos "una pelota con cara").
  // ---------------------------------------------------------
  function pbox(x, y, w, h, col) {
    ctx.fillStyle = col;
    ctx.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h));
  }
  function ptri(x1, y1, x2, y2, x3, y3, col) {
    ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.lineTo(x3, y3);
    ctx.closePath(); ctx.fillStyle = col; ctx.fill();
  }
  function ppoly(pts, col, outline) {
    ctx.beginPath(); ctx.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
    ctx.closePath();
    ctx.fillStyle = col; ctx.fill();
    if (outline) { ctx.strokeStyle = outline; ctx.lineWidth = 3; ctx.stroke(); }
  }
  function pixEyes(cx, cy, sep, s, white, pupil, ex) {
    for (const sgn of [-1, 1]) {
      pbox(cx + sgn * sep - s + ex, cy - s, s * 2, s * 2, white);
      pbox(cx + sgn * sep - s * 0.5 + ex, cy - s * 0.5, s, s, pupil);
    }
  }
  function pixTeeth(cx, y, w, n, col) {
    const gap = w / n;
    for (let i = 0; i < n; i++) {
      ptri(cx - w / 2 + i * gap, y, cx - w / 2 + (i + 1) * gap, y,
        cx - w / 2 + (i + 0.5) * gap, y + gap * 0.9, col);
    }
  }

  function drawBoss(e) {
    const r = e.r;
    const L = bossLook(e);
    const x = e.x, y = e.y;
    const wob = Math.sin(e.anim * 3) * (r * 0.05);
    const c1 = L.c1 || '#d4647a';
    const c2 = L.c2 || '#6d2333';
    const ex = clamp(e.dir.x, -1, 1) * 2.5, ey = clamp(e.dir.y, -1, 1) * 2;
    const st = (Entities.ENEMY_TYPES[e.type] || {}).bossStyle || 'burst';
    ctx.save();
    if (L.ghost) ctx.globalAlpha = 0.8;

    switch (st) {
      // Demonio estallido: masa de pinchos con cuernos.
      case 'burst': {
        const R = r * 1.05;
        const N = 16;
        const pts = [];
        for (let i = 0; i < N; i++) {
          const a = (i / N) * Math.PI * 2 + e.anim * 0.5;
          const rr = (i % 2 === 0) ? R * 1.15 : R * 0.8;
          pts.push([x + Math.cos(a) * rr, y + wob + Math.sin(a) * rr * 0.95]);
        }
        ppoly(pts, c2, '#160b12');
        const b = [];
        for (let i = 0; i < N; i++) {
          const a = (i / N) * Math.PI * 2 + e.anim * 0.5;
          const rr = (i % 2 === 0) ? R * 0.86 : R * 0.66;
          b.push([x + Math.cos(a) * rr, y + wob + Math.sin(a) * rr * 0.95]);
        }
        ppoly(b, c1, null);
        pbox(x - R * 0.5, y - R * 0.55 + wob, R * 0.5, R * 0.3, 'rgba(255,255,255,.18)');
        ptri(x - R * 0.7, y - R * 0.6, x - R * 1.15, y - R * 1.5, x - R * 0.25, y - R * 0.85, '#f0e2c8');
        ptri(x + R * 0.7, y - R * 0.6, x + R * 1.15, y - R * 1.5, x + R * 0.25, y - R * 0.85, '#f0e2c8');
        pixEyes(x, y - R * 0.18 + ey, R * 0.34, R * 0.2, '#fff2d0', '#2a0a12', ex);
        pbox(x - R * 0.4, y + R * 0.28 + wob, R * 0.8, R * 0.3, '#3a0a14');
        pixTeeth(x, y + R * 0.28 + wob, R * 0.8, 5, '#fff');
        break;
      }
      // Cargador acorazado: cuerpo trapezoidal, cuerno frontal y púas.
      case 'charge': {
        const R = r * 1.05;
        ppoly([
          [x - R * 0.95, y + R * 0.55], [x + R * 0.85, y + R * 0.55],
          [x + R * 1.05, y - R * 0.15], [x + R * 0.55, y - R * 0.85],
          [x - R * 0.55, y - R * 0.85], [x - R * 1.05, y - R * 0.15],
        ], c2, '#160b12');
        ppoly([
          [x - R * 0.7, y + R * 0.42], [x + R * 0.6, y + R * 0.42],
          [x + R * 0.8, y - R * 0.1], [x + R * 0.4, y - R * 0.65],
          [x - R * 0.4, y - R * 0.65], [x - R * 0.8, y - R * 0.1],
        ], c1, null);
        for (let i = -2; i <= 2; i++) {
          ptri(x + i * R * 0.42 - R * 0.12, y - R * 0.6, x + i * R * 0.42 + R * 0.12, y - R * 0.6,
            x + i * R * 0.42, y - R * 1.15, '#f6e6c8');
        }
        ptri(x + R * 0.7, y - R * 0.2, x + R * 1.7, y + R * 0.05, x + R * 0.7, y + R * 0.35, '#f0e2c8');
        pbox(x - R * 0.7, y + R * 0.5, R * 0.35, R * 0.35, '#160b12');
        pbox(x + R * 0.35, y + R * 0.5, R * 0.35, R * 0.35, '#160b12');
        pixEyes(x, y - R * 0.2, R * 0.3, R * 0.16, '#fff2d0', '#3a1a04', ex);
        break;
      }
      // Devorador: vórtice con aspas giratorias y ojo central gigante.
      case 'spiral': {
        const R = r * 1.0;
        for (let i = 0; i < 3; i++) {
          const a = e.anim * 1.6 + i * (Math.PI * 2 / 3);
          ptri(
            x + Math.cos(a) * R * 0.55, y + Math.sin(a) * R * 0.55,
            x + Math.cos(a + 0.7) * R * 1.5, y + Math.sin(a + 0.7) * R * 1.5,
            x + Math.cos(a + 0.25) * R * 0.9, y + Math.sin(a + 0.25) * R * 0.9, c2);
        }
        ctx.beginPath(); ctx.arc(x, y, R * 0.95, 0, Math.PI * 2);
        ctx.fillStyle = c1; ctx.fill();
        ctx.strokeStyle = '#160b12'; ctx.lineWidth = 3; ctx.stroke();
        ctx.beginPath(); ctx.arc(x, y, R * 0.62, 0, Math.PI * 2);
        ctx.strokeStyle = 'rgba(0,0,0,.3)'; ctx.lineWidth = 3; ctx.stroke();
        pbox(x - R * 0.33 + ex, y - R * 0.33 + ey, R * 0.66, R * 0.66, '#fff8e0');
        pbox(x - R * 0.16 + ex * 1.4, y - R * 0.16 + ey * 1.4, R * 0.32, R * 0.32, '#2a0a2e');
        pixEyes(x, y + R * 0.58, R * 0.44, R * 0.11, '#fff8e0', '#2a0a2e', ex);
        break;
      }
      // Espectro: capa flotante con jirones y fragmentos orbitando.
      case 'teleport': {
        const R = r * 1.0;
        for (let i = 0; i < 5; i++) {
          const a = e.anim * 0.8 + i * 1.3;
          pbox(x + Math.cos(a) * R * 1.4 - 3, y + Math.sin(a) * R * 1.4 - 3, 6, 6, 'rgba(200,235,255,.5)');
        }
        ppoly([
          [x, y - R * 1.05], [x + R * 0.85, y - R * 0.45], [x + R * 0.75, y + R * 0.6],
          [x + R * 0.42, y + R * 0.9], [x + R * 0.14, y + R * 0.6], [x - R * 0.14, y + R * 0.9],
          [x - R * 0.42, y + R * 0.6], [x - R * 0.75, y + R * 0.6], [x - R * 0.85, y - R * 0.45],
        ], c1, '#2a4a5e');
        pbox(x - R * 0.55, y - R * 0.7, R * 1.1, R * 0.3, 'rgba(0,0,0,.18)');
        pbox(x - R * 0.5 + ex, y - R * 0.35 + ey, R * 0.32, R * 0.4, '#12283a');
        pbox(x + R * 0.18 + ex, y - R * 0.35 + ey, R * 0.32, R * 0.4, '#12283a');
        pbox(x - R * 0.22, y + R * 0.12, R * 0.44, R * 0.16, '#12283a');
        break;
      }
      // Baboso: gota ancha que se aplasta, con un ojo enorme.
      case 'hop': {
        const R = r * 1.05;
        const sq = 1 + Math.sin(e.anim * 3) * 0.05;
        ppoly([
          [x, y - R * 1.1 * sq], [x + R * 0.9, y - R * 0.2], [x + R * 0.95, y + R * 0.55],
          [x + R * 0.5, y + R * 0.8], [x, y + R * 0.72], [x - R * 0.5, y + R * 0.8],
          [x - R * 0.95, y + R * 0.55], [x - R * 0.9, y - R * 0.2],
        ], c1, '#1c4a28');
        pbox(x - R * 0.5, y - R * 0.55, R * 0.35, R * 0.3, 'rgba(255,255,255,.28)');
        pbox(x - R * 0.7, y + R * 0.62, R * 0.18, R * 0.18, c2);
        pbox(x + R * 0.5, y + R * 0.66, R * 0.18, R * 0.18, c2);
        pbox(x - R * 0.45 + ex, y - R * 0.5 + ey, R * 0.9, R * 0.7, '#fff8e0');
        pbox(x - R * 0.16 + ex * 1.4, y - R * 0.24 + ey * 1.4, R * 0.32, R * 0.32, '#1a3a12');
        break;
      }
      // Serafín: alas escalonadas, aureola y corona.
      case 'feather': {
        const R = r * 1.0;
        const flap = Math.sin(e.anim * 5) * R * 0.12;
        for (const s of [-1, 1]) {
          const bx = x + s * R * 1.05;
          pbox(bx - R * 0.4, y - R * 0.5 - flap, R * 0.8, R * 0.5, '#fffaf0');
          pbox(bx - R * 0.28, y + flap, R * 0.56, R * 0.5, '#ffeccb');
          pbox(bx - R * 0.16, y + R * 0.5 - flap, R * 0.32, R * 0.4, '#f5dcae');
        }
        ppoly([
          [x, y - R * 0.75], [x + R * 0.6, y - R * 0.1], [x + R * 0.5, y + R * 0.85],
          [x - R * 0.5, y + R * 0.85], [x - R * 0.6, y - R * 0.1],
        ], c1, '#a06a18');
        ctx.strokeStyle = '#ffe680'; ctx.lineWidth = 4;
        ctx.beginPath(); ctx.ellipse(x, y - R * 1.15, R * 0.6, R * 0.18, 0, 0, Math.PI * 2); ctx.stroke();
        for (let i = -1; i <= 1; i++) {
          ptri(x + i * R * 0.3 - R * 0.09, y - R * 0.7, x + i * R * 0.3 + R * 0.09, y - R * 0.7,
            x + i * R * 0.3, y - R * 1.0, '#ffe680');
        }
        pixEyes(x, y - R * 0.35, R * 0.28, R * 0.15, '#fff', '#3a2408', ex);
        break;
      }
      // Cráneo: bóveda, cuencas huecas, nariz y mandíbula con dientes.
      case 'skull': {
        const R = r * 1.0;
        ppoly([
          [x - R * 0.55, y - R * 1.0], [x + R * 0.55, y - R * 1.0], [x + R * 0.95, y - R * 0.45],
          [x + R * 0.95, y + R * 0.25], [x - R * 0.95, y + R * 0.25], [x - R * 0.95, y - R * 0.45],
        ], c1, '#4a4438');
        pbox(x - R * 0.62, y + R * 0.25, R * 1.24, R * 0.42, '#c9c4b6');
        pbox(x - R * 0.68 + ex, y - R * 0.62 + ey, R * 0.5, R * 0.5, '#17130f');
        pbox(x + R * 0.18 + ex, y - R * 0.62 + ey, R * 0.5, R * 0.5, '#17130f');
        ptri(x, y - R * 0.05, x - R * 0.14, y + R * 0.18, x + R * 0.14, y + R * 0.18, '#17130f');
        pixTeeth(x, y + R * 0.3, R * 1.1, 6, '#efe9dc');
        pbox(x - R * 0.8, y - R * 0.9, R * 0.5, 3, '#4a4438');
        break;
      }
      // Colmena: hexágono con celdas de panal y tres ojos.
      case 'summon': {
        const R = r * 1.05;
        const hex = [];
        for (let i = 0; i < 6; i++) {
          const a = (i / 6) * Math.PI * 2 - Math.PI / 2;
          hex.push([x + Math.cos(a) * R, y + Math.sin(a) * R]);
        }
        ppoly(hex, c2, '#5a3608');
        for (let gy = -1; gy <= 1; gy++) {
          for (let gx = -1; gx <= 1; gx++) {
            if (gx === 0 && gy === 0) continue;
            ctx.strokeStyle = 'rgba(255,240,170,.7)'; ctx.lineWidth = 2;
            ctx.beginPath(); ctx.arc(x + gx * R * 0.42, y + gy * R * 0.42, R * 0.2, 0, Math.PI * 2); ctx.stroke();
          }
        }
        pbox(x - R * 0.4, y - R * 0.4, R * 0.8, R * 0.8, c1);
        pbox(x - R * 0.12 + ex, y - R * 0.34 + ey, R * 0.24, R * 0.24, '#fff8e0');
        pbox(x - R * 0.5 + ex, y + R * 0.02 + ey, R * 0.22, R * 0.22, '#fff8e0');
        pbox(x + R * 0.28 + ex, y + R * 0.02 + ey, R * 0.22, R * 0.22, '#fff8e0');
        pbox(x - R * 0.08 + ex * 1.4, y - R * 0.3 + ey * 1.4, R * 0.16, R * 0.16, '#2a1a04');
        pbox(x - R * 0.45 + ex * 1.4, y + R * 0.07 + ey * 1.4, R * 0.14, R * 0.14, '#2a1a04');
        pbox(x + R * 0.33 + ex * 1.4, y + R * 0.07 + ey * 1.4, R * 0.14, R * 0.14, '#2a1a04');
        break;
      }
      default: {
        const R = r * 1.0;
        ctx.beginPath(); ctx.arc(x, y + wob, R, 0, Math.PI * 2);
        ctx.fillStyle = c1; ctx.fill();
        ctx.strokeStyle = '#160b12'; ctx.lineWidth = 3; ctx.stroke();
        pixEyes(x, y - R * 0.18 + ey, R * 0.34, R * 0.2, '#fff8e0', '#2a0a12', ex);
        pbox(x - R * 0.4, y + R * 0.3 + wob, R * 0.8, R * 0.3, '#3a0a14');
        pixTeeth(x, y + R * 0.3 + wob, R * 0.8, 5, '#fff');
        break;
      }
    }

    ctx.restore();
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

  // Hitboxes: cuando hay enemigos o proyectiles cerca, se marca su caja de
  // colisión real. La del jugador local va sobre su torso y se muestra siempre
  // que está activada (se activa y desactiva con la tecla H).
  function drawHitboxes(view) {
    if (!showHitboxes) return;
    const me = view.players.find((p) => p.id === view.localId) || view.players[0];
    if (!me || me.dead) return;
    const NEAR = 155;
    const pulse = 0.72 + Math.sin(Utils.now() * 6) * 0.28;
    const dash = (on) => { if (ctx.setLineDash) ctx.setLineDash(on ? [4, 3] : []); };
    ctx.save();
    ctx.lineJoin = 'round';

    // hitbox del jugador: un circulito RELLENO sobre el torso, brillante y
    // palpitante (no un aro vacío).
    const hy = me.y + C.PLAYER_HURT_DY;
    ctx.save();
    ctx.shadowColor = '#7fe3ff';
    ctx.shadowBlur = 18 * pulse;
    // relleno translúcido con degradado (efecto "cristal" brillante)
    const pg = ctx.createRadialGradient(me.x, hy, 0, me.x, hy, me.r);
    pg.addColorStop(0, 'rgba(255,255,255,0.95)');
    pg.addColorStop(0.5, 'rgba(150,235,255,0.85)');
    pg.addColorStop(1, 'rgba(90,200,255,0.55)');
    ctx.globalAlpha = 0.72 + 0.24 * pulse;
    ctx.fillStyle = pg;
    circle(ctx, me.x, hy, me.r); ctx.fill();
    // contorno fino y nítido
    ctx.globalAlpha = 0.95;
    ctx.strokeStyle = '#eaffff';
    ctx.lineWidth = 1.6;
    circle(ctx, me.x, hy, me.r + 0.6); ctx.stroke();
    ctx.restore();

    // enemigos cercanos
    for (const e of view.enemies) {
      if (!isFinite(e.x) || !isFinite(e.y)) continue;
      const d = Math.hypot(e.x - me.x, e.y - hy);
      if (d > NEAR + e.r) continue;
      const a = clamp(1 - (d - NEAR * 0.55) / (NEAR * 0.55), 0.35, 1);
      ctx.save();
      ctx.globalAlpha = a;
      ctx.shadowColor = e.isBoss ? '#ff4d6d' : '#ffb347';
      ctx.shadowBlur = (e.isBoss ? 14 : 9) * pulse;
      ctx.strokeStyle = e.isBoss ? '#ff6b86' : '#ffd08a';
      ctx.lineWidth = e.isBoss ? 2.4 : 1.6;
      circle(ctx, e.x, e.y, e.r); ctx.stroke();
      ctx.restore();
    }

    // proyectiles cercanos
    for (const b of view.bullets) {
      if (!isFinite(b.x) || !isFinite(b.y)) continue;
      const d = Math.hypot(b.x - me.x, b.y - hy);
      if (d > NEAR) continue;
      ctx.save();
      ctx.globalAlpha = 0.85;
      ctx.shadowColor = b.friendly ? '#8fe0d0' : '#ff6b8a';
      ctx.shadowBlur = 8 * pulse;
      ctx.strokeStyle = b.friendly ? '#c7fff2' : '#ffd0da';
      ctx.lineWidth = 1.3;
      circle(ctx, b.x, b.y, b.r); ctx.stroke();
      ctx.restore();
    }

    ctx.restore();
    dash(false);
  }

  // Contador de "sellado" que se dibuja encima del botín recién aparecido.
  function drawLockBadge(x, y, lock) {
    const s = (Math.ceil(lock * 10) / 10).toFixed(1);
    ctx.save();
    ctx.fillStyle = 'rgba(10,7,16,.82)';
    rrect(ctx, x - 15, y - 10, 30, 18, 8); ctx.fill();
    ctx.strokeStyle = 'rgba(255,214,102,.75)'; ctx.lineWidth = 1.4;
    rrect(ctx, x - 15, y - 10, 30, 18, 8); ctx.stroke();
    ctx.fillStyle = '#ffe58a';
    ctx.font = 'bold 12px ui-monospace, monospace';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(s, x, y);
    ctx.restore();
  }

  function drawPickup(k, view) {
    const bob = Math.sin(view.time * 3 + k.bob) * 2;
    const lock = k.lock || 0;
    const sealed = lock > 0;
    const showCount = lock > 1;
    if (k.type === 'trapdoor') {
      ctx.save();
      if (sealed) ctx.globalAlpha = 0.5;
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
      ctx.globalAlpha = (0.15 + Math.sin(view.time * 2) * 0.06) * (sealed ? 0.5 : 1);
      ctx.fillStyle = '#ffd166';
      circle(ctx, k.x, k.y, 40); ctx.fill();
      ctx.restore();
      text('↓', k.x, k.y - 34 + bob, { font: 'bold 18px sans-serif', color: '#ffd166' });
      if (showCount) drawLockBadge(k.x, k.y - 48, lock);
      return;
    }

    shadowBlob(ctx, k.x, k.y + 10, 8, 3.5, 0.3);
    ctx.save();
    ctx.translate(k.x, k.y + bob);
    if (sealed) ctx.globalAlpha = 0.55;

    if (k.type === 'chest' || k.type === 'goldenchest') {
      const golden = k.type === 'goldenchest';
      const locked = (k.keys || 0) > 0;
      const gl = ctx.createRadialGradient(0, 0, 2, 0, 0, 28);
      gl.addColorStop(0, golden ? 'rgba(255,214,102,.45)' : (locked ? 'rgba(255,150,120,.30)' : 'rgba(150,255,200,.28)'));
      gl.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = gl; circle(ctx, 0, 0, 28); ctx.fill();
      // base
      ctx.fillStyle = golden ? '#c58a1e' : '#6b4a22';
      rrect(ctx, -15, -4, 30, 16, 3); ctx.fill();
      ctx.strokeStyle = golden ? '#5a3a08' : '#3a2711'; ctx.lineWidth = 2;
      rrect(ctx, -15, -4, 30, 16, 3); ctx.stroke();
      // tapa
      ctx.fillStyle = golden ? '#ffcf5c' : (locked ? '#8a5a20' : '#7a5a2a');
      rrect(ctx, -15, -13, 30, 10, 3); ctx.fill();
      ctx.stroke();
      // banda central
      ctx.fillStyle = golden ? '#8a5a10' : (locked ? '#ffcf5c' : '#caa24a');
      ctx.fillRect(-2, -13, 4, 25);
      if (golden) {
        // gemas y corona del cofre dorado
        ctx.fillStyle = '#ff5a6e';
        circle(ctx, -8, -8, 2.6); ctx.fill();
        circle(ctx, 8, -8, 2.6); ctx.fill();
        ctx.fillStyle = '#fff3b0';
        ctx.beginPath();
        ctx.moveTo(-6, -13); ctx.lineTo(-3, -18); ctx.lineTo(0, -13);
        ctx.lineTo(3, -18); ctx.lineTo(6, -13);
        ctx.closePath(); ctx.fill();
      }
      // cerradura / brillo
      if (locked) {
        ctx.fillStyle = golden ? '#5a3a08' : '#3a2711';
        circle(ctx, 0, -1, 3.2); ctx.fill();
        ctx.fillStyle = '#ffd166';
        ctx.font = 'bold 14px sans-serif';
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText('🔑', 0, -26);
      } else {
        ctx.fillStyle = '#ffe9a8';
        circle(ctx, 0, -2, 2.6); ctx.fill();
      }
    } else if (k.type === 'heart') {
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
    } else if (k.type === 'relic') {
      // cofre dorado de suceso raro: llama la atención
      const gl = ctx.createRadialGradient(0, 0, 2, 0, 0, 24);
      gl.addColorStop(0, 'rgba(255,214,102,.85)');
      gl.addColorStop(1, 'rgba(255,214,102,0)');
      ctx.fillStyle = gl; circle(ctx, 0, 0, 24); ctx.fill();
      ctx.scale(1.3, 1.3);
      ctx.fillStyle = '#7a4e18';
      ctx.fillRect(-11, -6, 22, 14);
      ctx.fillStyle = '#ffcf5c';
      ctx.fillRect(-11, -6, 22, 5);
      ctx.strokeStyle = '#4a2f0c'; ctx.lineWidth = 2;
      ctx.strokeRect(-11, -6, 22, 14);
      ctx.fillStyle = '#4a2f0c';
      ctx.fillRect(-2, -1, 4, 6);
    }
    ctx.restore();

    if (sealed && showCount) drawLockBadge(k.x, k.y - 30, lock);
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
      const lock = ped.lock || 0;
      const sealed = lock > 0;
      // halo
      const item = Entities.itemById(ped.itemId);
      ctx.save();
      ctx.globalAlpha = 0.22 + Math.sin(view.time * 3) * 0.07;
      ctx.fillStyle = item.color;
      circle(ctx, ped.x, ped.y - 14 + bob, 24); ctx.fill();
      ctx.restore();
      if (sealed) { ctx.save(); ctx.globalAlpha = 0.45; }
      drawItemIcon(ped.itemId, ped.x, ped.y - 14 + bob, 12);
      if (sealed) ctx.restore();
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

      // precio (tienda)
      if (ped.price > 0) {
        const meP = view.players.find((q) => q.id === view.localId);
        const afford = !meP || meP.coins >= ped.price;
        text(ped.price + '$', ped.x, ped.y + 27, {
          font: 'bold 12px ui-monospace, monospace',
          color: afford ? '#ffe58a' : '#ff8f9c',
        });
      }
      if (sealed && lock > 1) drawLockBadge(ped.x, ped.y - 40 + bob, lock);
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

      // ---- lágrimas y emociones ----
      case 'sad':
        ctx.fillStyle = '#8fd3ff';
        ctx.beginPath();
        ctx.moveTo(0, -11); ctx.bezierCurveTo(9, 0, 8, 9, 0, 9);
        ctx.bezierCurveTo(-8, 9, -9, 0, 0, -11); ctx.fill();
        ctx.fillStyle = '#20405a';
        circle(ctx, -3, -1, 1.4); ctx.fill();
        circle(ctx, 3, -1, 1.4); ctx.fill();
        ctx.strokeStyle = '#20405a'; ctx.lineWidth = 1.4;
        ctx.beginPath(); ctx.arc(0, 7, 3.4, Math.PI * 1.12, Math.PI * 1.88); ctx.stroke();
        break;
      case 'rage':
        ctx.fillStyle = '#ff5f7e'; circle(ctx, 0, 0, 9); ctx.fill();
        ctx.strokeStyle = '#5a1220'; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(-6.5, -5); ctx.lineTo(-1.5, -2.5); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(6.5, -5); ctx.lineTo(1.5, -2.5); ctx.stroke();
        ctx.fillStyle = '#3a0f16';
        circle(ctx, -3, 1.5, 1.6); ctx.fill();
        circle(ctx, 3, 1.5, 1.6); ctx.fill();
        break;

      // ---- disparo / cucharas ----
      case 'spoon':
        ctx.strokeStyle = '#d8dced'; ctx.lineWidth = 3;
        ctx.beginPath(); ctx.moveTo(-8, 8); ctx.quadraticCurveTo(0, 3, 3, -5); ctx.stroke();
        ctx.fillStyle = '#eef1fa';
        ctx.beginPath(); ctx.ellipse(4, -7, 3.6, 4.6, -0.5, 0, Math.PI * 2); ctx.fill();
        break;
      case 'wings':
        ctx.fillStyle = '#bfe3ff';
        ctx.beginPath(); ctx.moveTo(-1, 1); ctx.quadraticCurveTo(-11, -9, -11, 3); ctx.quadraticCurveTo(-6, 2, -1, 4); ctx.closePath(); ctx.fill();
        ctx.beginPath(); ctx.moveTo(1, 1); ctx.quadraticCurveTo(11, -9, 11, 3); ctx.quadraticCurveTo(6, 2, 1, 4); ctx.closePath(); ctx.fill();
        break;
      case 'firerate':
        ctx.strokeStyle = '#ffe08a'; ctx.lineWidth = 3;
        for (let i = 0; i < 3; i++) { ctx.beginPath(); ctx.moveTo(-9, -7 + i * 7); ctx.lineTo(-2, -7 + i * 7); ctx.stroke(); }
        ctx.fillStyle = '#ffe08a';
        ctx.beginPath(); ctx.moveTo(1, -3); ctx.lineTo(10, 0); ctx.lineTo(1, 3); ctx.closePath(); ctx.fill();
        break;
      case 'quad':
        ctx.fillStyle = '#ffa8e0';
        circle(ctx, -5, -5, 3.2); ctx.fill();
        circle(ctx, 5, -5, 3.2); ctx.fill();
        circle(ctx, -5, 5, 3.2); ctx.fill();
        circle(ctx, 5, 5, 3.2); ctx.fill();
        break;
      case 'scatter':
        ctx.fillStyle = '#ff9a5c';
        circle(ctx, -6, -4, 3); ctx.fill();
        circle(ctx, 0, 4, 3); ctx.fill();
        circle(ctx, 6, -4, 3); ctx.fill();
        break;
      case 'doubletap':
        ctx.fillStyle = '#ffe3a0';
        circle(ctx, -3, -4, 3.4); ctx.fill();
        circle(ctx, -3, 4, 3.4); ctx.fill();
        ctx.fillStyle = '#ffb347';
        circle(ctx, 6, 0, 3.4); ctx.fill();
        break;
      case 'boomerang':
        ctx.strokeStyle = '#8fe0d0'; ctx.lineWidth = 3.4;
        ctx.beginPath(); ctx.moveTo(-8, -7); ctx.quadraticCurveTo(9, -3, 3, 9); ctx.stroke();
        break;

      // ---- defensa ----
      case 'shield':
        ctx.fillStyle = '#8fd3ff';
        ctx.beginPath(); ctx.moveTo(0, -10); ctx.lineTo(9, -6); ctx.lineTo(9, 2);
        ctx.quadraticCurveTo(0, 11, -9, 2); ctx.lineTo(-9, -6); ctx.closePath(); ctx.fill();
        ctx.strokeStyle = '#3a7aa8'; ctx.lineWidth = 1.4; ctx.stroke();
        ctx.fillStyle = '#fff';
        ctx.fillRect(-1.4, -6, 2.8, 12); ctx.fillRect(-5, -1.4, 10, 2.8);
        break;
      case 'iron':
        ctx.fillStyle = '#9fb3c8';
        ctx.beginPath(); ctx.moveTo(0, -10); ctx.lineTo(9, -6); ctx.lineTo(9, 2);
        ctx.quadraticCurveTo(0, 11, -9, 2); ctx.lineTo(-9, -6); ctx.closePath(); ctx.fill();
        ctx.strokeStyle = '#5f7285'; ctx.lineWidth = 1.4;
        ctx.beginPath(); ctx.moveTo(0, -8); ctx.lineTo(0, 8); ctx.moveTo(-8, -1); ctx.lineTo(8, -1); ctx.stroke();
        break;
      case 'armor2':
        ctx.fillStyle = '#c0ccd8';
        ctx.beginPath(); ctx.moveTo(-9, -8); ctx.lineTo(-1, -5); ctx.lineTo(-1, 6); ctx.quadraticCurveTo(-5, 10, -9, 6); ctx.closePath(); ctx.fill();
        ctx.beginPath(); ctx.moveTo(9, -8); ctx.lineTo(1, -5); ctx.lineTo(1, 6); ctx.quadraticCurveTo(5, 10, 9, 6); ctx.closePath(); ctx.fill();
        ctx.strokeStyle = '#6b7a8a'; ctx.lineWidth = 1.2;
        ctx.beginPath(); ctx.moveTo(-1, -5); ctx.lineTo(-1, 6); ctx.moveTo(1, -5); ctx.lineTo(1, 6); ctx.stroke();
        break;
      case 'thorns':
        ctx.strokeStyle = '#d8b0c0'; ctx.lineWidth = 2;
        circle(ctx, 0, 0, 6); ctx.stroke();
        ctx.beginPath();
        for (let i = 0; i < 8; i++) {
          const a = (i / 8) * Math.PI * 2;
          ctx.moveTo(Math.cos(a) * 6, Math.sin(a) * 6);
          ctx.lineTo(Math.cos(a) * 11, Math.sin(a) * 11);
        }
        ctx.stroke();
        break;

      // ---- vida / revivir ----
      case 'bigheart':
        ctx.fillStyle = '#ffd166';
        ctx.beginPath(); ctx.moveTo(0, 7); ctx.bezierCurveTo(-12, -2, -8, -12, 0, -5); ctx.bezierCurveTo(8, -12, 12, -2, 0, 7); ctx.fill();
        ctx.strokeStyle = '#a8791a'; ctx.lineWidth = 1.1; ctx.stroke();
        ctx.fillStyle = '#fff'; circle(ctx, 6, -7, 1.4); ctx.fill();
        break;
      case 'extra_life':
        ctx.fillStyle = '#fff2c2';
        ctx.fillRect(-2.6, -10, 5.2, 20);
        ctx.fillRect(-8, -3.4, 16, 5.2);
        ctx.strokeStyle = '#c9a24a'; ctx.lineWidth = 1.2;
        ctx.strokeRect(-2.6, -10, 5.2, 20); ctx.strokeRect(-8, -3.4, 16, 5.2);
        break;
      case 'vampire':
        ctx.fillStyle = '#b03a4a';
        ctx.beginPath(); ctx.moveTo(-7, -6); ctx.lineTo(-1, -6); ctx.lineTo(-4, 7); ctx.closePath(); ctx.fill();
        ctx.beginPath(); ctx.moveTo(7, -6); ctx.lineTo(1, -6); ctx.lineTo(4, 7); ctx.closePath(); ctx.fill();
        ctx.fillStyle = '#fff'; circle(ctx, -4, -8, 1.6); ctx.fill(); circle(ctx, 4, -8, 1.6); ctx.fill();
        break;

      // ---- daño / crítico ----
      case 'dmgup':
        ctx.fillStyle = '#ff6b6b';
        ctx.beginPath();
        ctx.moveTo(0, -11); ctx.lineTo(7, -1); ctx.lineTo(2, -1); ctx.lineTo(2, 9);
        ctx.lineTo(-2, 9); ctx.lineTo(-2, -1); ctx.lineTo(-7, -1); ctx.closePath(); ctx.fill();
        break;
      case 'glass':
        ctx.fillStyle = '#a0ffe0';
        ctx.beginPath(); ctx.moveTo(0, -11); ctx.lineTo(7, -2); ctx.lineTo(0, 10); ctx.lineTo(-7, -2); ctx.closePath(); ctx.fill();
        ctx.strokeStyle = '#3fa88a'; ctx.lineWidth = 1.2; ctx.stroke();
        ctx.beginPath(); ctx.moveTo(0, -11); ctx.lineTo(0, 10); ctx.moveTo(-7, -2); ctx.lineTo(7, -2); ctx.stroke();
        break;

      // ---- utilidad / suerte ----
      case 'compass':
        ctx.strokeStyle = '#e8d9a0'; ctx.lineWidth = 2.4; circle(ctx, 0, 0, 9); ctx.stroke();
        ctx.fillStyle = '#e8b23a';
        ctx.beginPath(); ctx.moveTo(0, -6); ctx.lineTo(3, 0); ctx.lineTo(0, 6); ctx.lineTo(-3, 0); ctx.closePath(); ctx.fill();
        ctx.fillStyle = '#8a6a1a'; circle(ctx, 0, 0, 1.4); ctx.fill();
        break;
      case 'atlas':
        ctx.fillStyle = '#c9a26b';
        ctx.beginPath(); ctx.moveTo(-10, -7); ctx.lineTo(-3, -9); ctx.lineTo(3, -7); ctx.lineTo(10, -9);
        ctx.lineTo(10, 7); ctx.lineTo(3, 9); ctx.lineTo(-3, 7); ctx.lineTo(-10, 9); ctx.closePath(); ctx.fill();
        ctx.strokeStyle = '#7a5a2a'; ctx.lineWidth = 1.2;
        ctx.beginPath(); ctx.moveTo(-3, -9); ctx.lineTo(-3, 7); ctx.moveTo(3, -7); ctx.lineTo(3, 9); ctx.stroke();
        break;
      case 'coinbag':
        ctx.fillStyle = '#8a6a2a';
        ctx.beginPath(); ctx.moveTo(-2, -9); ctx.lineTo(2, -9); ctx.lineTo(6, 2);
        ctx.quadraticCurveTo(6, 9, 0, 9); ctx.quadraticCurveTo(-6, 9, -6, 2); ctx.closePath(); ctx.fill();
        ctx.fillStyle = '#ffd166';
        ctx.font = 'bold 10px ui-monospace, monospace'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText('$', 0, 3);
        break;
      case 'keychain':
        ctx.strokeStyle = '#e8c46a'; ctx.lineWidth = 2.6;
        circle(ctx, -4, -4, 3.4); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(-1.5, -1.5); ctx.lineTo(7, 7); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(4, 4); ctx.lineTo(7, 1); ctx.moveTo(6, 6); ctx.lineTo(9, 3); ctx.stroke();
        break;
      case 'herradura':
        ctx.strokeStyle = '#d8cfa0'; ctx.lineWidth = 3.2;
        ctx.beginPath();
        ctx.moveTo(7, -8); ctx.lineTo(7, 1);
        ctx.arc(0, 1, 7, 0, Math.PI, false);
        ctx.lineTo(-7, -8);
        ctx.stroke();
        ctx.fillStyle = '#9a9068';
        circle(ctx, 7, -8, 1.4); ctx.fill(); circle(ctx, -7, -8, 1.4); ctx.fill();
        break;
      case 'magnet':
        ctx.strokeStyle = '#e05a6a'; ctx.lineWidth = 4;
        ctx.beginPath(); ctx.arc(0, 0, 7, Math.PI * 0.12, Math.PI * 0.88, true); ctx.stroke();
        ctx.fillStyle = '#e05a6a'; ctx.fillRect(-9, 0, 4, 6); ctx.fillRect(5, 0, 4, 6);
        ctx.fillStyle = '#cfd6e6'; ctx.fillRect(-9, 4, 4, 4); ctx.fillRect(5, 4, 4, 4);
        break;
      case 'eye':
        ctx.fillStyle = '#e6d0ff';
        ctx.beginPath(); ctx.ellipse(0, 0, 10, 6, 0, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#7a5aa8'; circle(ctx, 0, 0, 4); ctx.fill();
        ctx.fillStyle = '#20182b'; circle(ctx, 0, 0, 1.9); ctx.fill();
        break;

      // ---- efectos elementales ----
      case 'torch':
        ctx.fillStyle = '#7a4e18'; ctx.fillRect(-2, 1, 4, 9);
        ctx.fillStyle = '#ff9a3c';
        ctx.beginPath(); ctx.moveTo(0, -11); ctx.quadraticCurveTo(7, -2, 0, 3); ctx.quadraticCurveTo(-7, -2, 0, -11); ctx.fill();
        ctx.fillStyle = '#ffe08a';
        ctx.beginPath(); ctx.moveTo(0, -7); ctx.quadraticCurveTo(3.5, -1, 0, 2); ctx.quadraticCurveTo(-3.5, -1, 0, -7); ctx.fill();
        break;
      case 'acid':
        ctx.fillStyle = '#9ae06a';
        ctx.beginPath(); ctx.moveTo(0, -10); ctx.lineTo(6, 4); ctx.quadraticCurveTo(0, 12, -6, 4); ctx.closePath(); ctx.fill();
        ctx.strokeStyle = '#3f7a24'; ctx.lineWidth = 1.3; ctx.stroke();
        ctx.fillStyle = '#dfffb0'; circle(ctx, -2, 2, 1.4); ctx.fill(); circle(ctx, 2, 4, 1); ctx.fill();
        break;
      case 'frost':
        ctx.strokeStyle = '#a8e8ff'; ctx.lineWidth = 2;
        ctx.beginPath();
        for (let i = 0; i < 6; i++) {
          const a = (i / 6) * Math.PI * 2;
          ctx.moveTo(0, 0); ctx.lineTo(Math.cos(a) * 10, Math.sin(a) * 10);
        }
        ctx.stroke();
        ctx.fillStyle = '#eafcff'; circle(ctx, 0, 0, 2.4); ctx.fill();
        break;
      case 'chain':
        ctx.fillStyle = '#cfe0ff';
        ctx.beginPath();
        ctx.moveTo(2, -11); ctx.lineTo(-6, 1); ctx.lineTo(-1, 1); ctx.lineTo(-3, 11);
        ctx.lineTo(6, -2); ctx.lineTo(1, -2); ctx.closePath(); ctx.fill();
        break;
      case 'powder':
        ctx.fillStyle = '#3a2f26'; circle(ctx, 0, 2, 8); ctx.fill();
        ctx.strokeStyle = '#b08050'; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(2, -6); ctx.quadraticCurveTo(7, -10, 6, -13); ctx.stroke();
        ctx.fillStyle = '#ffb347';
        ctx.beginPath(); ctx.moveTo(6, -13); ctx.lineTo(9, -11); ctx.lineTo(6.5, -9); ctx.closePath(); ctx.fill();
        break;
      case 'catalyst':
        ctx.fillStyle = '#ff7ae0';
        ctx.beginPath(); ctx.moveTo(-4, -10); ctx.lineTo(4, -10); ctx.lineTo(2, -4); ctx.lineTo(5, 6);
        ctx.quadraticCurveTo(0, 12, -5, 6); ctx.lineTo(-2, -4); ctx.closePath(); ctx.fill();
        ctx.fillStyle = '#fff';
        circle(ctx, -3, -12, 1.4); ctx.fill(); circle(ctx, 4, -4, 1.2); ctx.fill();
        break;
      case 'prism':
        ctx.fillStyle = '#b0f0ff';
        ctx.beginPath(); ctx.moveTo(0, -10); ctx.lineTo(9, 8); ctx.lineTo(-9, 8); ctx.closePath(); ctx.fill();
        ctx.strokeStyle = '#4fa0c0'; ctx.lineWidth = 1.2; ctx.stroke();
        ctx.strokeStyle = '#ff8fb0'; ctx.lineWidth = 1.6;
        ctx.beginPath(); ctx.moveTo(2, -6); ctx.lineTo(11, -1); ctx.stroke();
        break;
      case 'phoenix':
        ctx.fillStyle = '#ffcf5c';
        ctx.beginPath(); ctx.moveTo(0, -11); ctx.quadraticCurveTo(6, 0, 0, 10); ctx.quadraticCurveTo(-6, 0, 0, -11); ctx.fill();
        ctx.strokeStyle = '#ff9a3c'; ctx.lineWidth = 1.2;
        ctx.beginPath(); ctx.moveTo(0, -11); ctx.lineTo(0, 10); ctx.stroke();
        ctx.fillStyle = '#fff2c2'; circle(ctx, 0, 6, 1.6); ctx.fill();
        break;

      // ---- velocidad / botín ----
      case 'tacon':
        ctx.fillStyle = '#ffb0d0';
        ctx.beginPath(); ctx.moveTo(-9, 5); ctx.lineTo(2, 5); ctx.lineTo(8, -7); ctx.lineTo(4, -7);
        ctx.lineTo(-4, 2); ctx.lineTo(-9, 2); ctx.closePath(); ctx.fill();
        ctx.fillStyle = '#d97fa8'; ctx.fillRect(2, 5, 3, 4);
        break;
      case 'alcance':
        ctx.strokeStyle = '#a0e0ff'; ctx.lineWidth = 2.4;
        ctx.beginPath(); ctx.moveTo(-9, 6); ctx.lineTo(6, -6); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(6, -6); ctx.lineTo(2, -6); ctx.moveTo(6, -6); ctx.lineTo(6, -2); ctx.stroke();
        ctx.globalAlpha = 0.6; circle(ctx, -9, 6, 2); ctx.stroke(); ctx.globalAlpha = 1;
        break;
      case 'crown':
        ctx.fillStyle = '#ffd166';
        ctx.beginPath();
        ctx.moveTo(-9, 6); ctx.lineTo(-9, -5); ctx.lineTo(-4, 0); ctx.lineTo(0, -7);
        ctx.lineTo(4, 0); ctx.lineTo(9, -5); ctx.lineTo(9, 6); ctx.closePath(); ctx.fill();
        ctx.strokeStyle = '#a8791a'; ctx.lineWidth = 1.1; ctx.stroke();
        break;
      case 'bandage':
        ctx.save(); ctx.rotate(-0.5);
        ctx.fillStyle = '#f0d9d9'; rrect(ctx, -9, -5, 18, 10, 4); ctx.fill();
        ctx.fillStyle = '#e0b8b8'; ctx.fillRect(-3, -5, 6, 10);
        ctx.strokeStyle = '#c99'; ctx.lineWidth = 1; rrect(ctx, -9, -5, 18, 10, 4); ctx.stroke();
        ctx.restore();
        break;
      case 'bouncy':
        ctx.fillStyle = '#8fe0d0'; circle(ctx, 0, 2, 7); ctx.fill();
        ctx.strokeStyle = '#4aa898'; ctx.lineWidth = 1.6;
        ctx.beginPath(); ctx.arc(-9, -6, 3, -0.4, 1.6); ctx.stroke();
        ctx.beginPath(); ctx.arc(9, -6, 3, 1.5, 3.6); ctx.stroke();
        break;
      case 'gust':
        ctx.strokeStyle = '#c8e6ff'; ctx.lineWidth = 2.2;
        ctx.beginPath(); ctx.moveTo(-10, -4); ctx.lineTo(6, -4); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(-6, 1); ctx.lineTo(10, 1); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(-10, 6); ctx.lineTo(3, 6); ctx.stroke();
        break;

      // ---- familiares / varios ----
      case 'familiar':
        ctx.fillStyle = '#b58cff';
        ctx.beginPath(); ctx.ellipse(0, 1, 6, 5, 0, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = 'rgba(220,200,255,.7)';
        ctx.beginPath(); ctx.ellipse(-7, -4, 5, 3, -0.5, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.ellipse(7, -4, 5, 3, 0.5, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#2a1533';
        circle(ctx, -2, 0, 1.2); ctx.fill(); circle(ctx, 2, 0, 1.2); ctx.fill();
        break;
      case 'charger':
        ctx.strokeStyle = '#ffe08a'; ctx.lineWidth = 2;
        for (let i = 0; i < 3; i++) { ctx.beginPath(); ctx.moveTo(-10, -6 + i * 6); ctx.lineTo(-4, -6 + i * 6); ctx.stroke(); }
        ctx.fillStyle = '#ffe08a';
        ctx.beginPath(); ctx.moveTo(2, 0); ctx.lineTo(11, -6); ctx.lineTo(11, 6); ctx.closePath(); ctx.fill();
        break;
      case 'greed':
        ctx.fillStyle = '#ffcf5c';
        ctx.beginPath(); ctx.moveTo(-8, 4); ctx.quadraticCurveTo(-8, -6, 0, -6); ctx.quadraticCurveTo(8, -6, 8, 4);
        ctx.lineTo(5, 4); ctx.lineTo(5, -1); ctx.lineTo(-5, -1); ctx.lineTo(-5, 4); ctx.closePath(); ctx.fill();
        ctx.fillStyle = '#e8b23a';
        circle(ctx, 0, -12, 4); ctx.fill();
        ctx.fillStyle = '#8a6010';
        ctx.font = 'bold 7px ui-monospace, monospace'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText('$', 0, -11.5);
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
      rrect(ctx, 12, y - 15, 372, 30, 9); ctx.fill();
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
      const cx0 = x0 + hearts * 17 + 16;
      ctx.save();
      ctx.fillStyle = '#ffd166';
      circle(ctx, cx0, y, 6); ctx.fill();
      ctx.restore();
      text(String(p.coins), cx0 + 10, y + 1, {
        font: 'bold 12px ui-monospace, monospace', color: '#ffe9b0', align: 'left',
      });

      // llaves
      const kx = cx0 + 34;
      ctx.save();
      ctx.strokeStyle = '#ffd166'; ctx.lineWidth = 2.5;
      circle(ctx, kx, y - 2, 4); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(kx, y + 2); ctx.lineTo(kx, y + 8); ctx.stroke();
      ctx.restore();
      text(String(p.keys || 0), kx + 10, y + 1, {
        font: 'bold 12px ui-monospace, monospace', color: '#ffe9b0', align: 'left',
      });

      // escudos y vidas extra
      let bx = kx + 32;
      if (p.shield > 0) {
        ctx.save();
        ctx.fillStyle = '#8fd3ff';
        circle(ctx, bx, y, 7); ctx.fill();
        ctx.restore();
        text(String(p.shield), bx, y + 1, { font: 'bold 11px ui-monospace, monospace', color: '#0a0a12' });
        bx += 20;
      }
      if (p.revives > 0) {
        ctx.save();
        ctx.fillStyle = '#fff2c2';
        circle(ctx, bx, y, 7); ctx.fill();
        ctx.restore();
        text(String(p.revives), bx, y + 1, { font: 'bold 11px ui-monospace, monospace', color: '#0a0a12' });
        bx += 20;
      }

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

    // --- Habilidad activa del jugador local ---
    if (me && me.abMax) {
      const ch = (typeof Characters !== 'undefined' && Characters.byId) ? Characters.byId(me.charId) : null;
      const act = ch && ch.active;
      const bw = 196, bh = 42;
      const bx = C.VIEW_W - bw - 12, by = C.VIEW_H - bh - 12;
      ctx.save();
      ctx.fillStyle = 'rgba(10,7,16,.62)';
      rrect(ctx, bx, by, bw, bh, 10); ctx.fill();
      ctx.restore();
      const ready = me.abCharges > 0;
      text((act ? act.name : 'Habilidad') + '   ' + me.abCharges + '/' + me.abMax,
        bx + 10, by + 14, { font: 'bold 12px ui-monospace, monospace', color: ready ? '#cfe6ff' : '#8a93a8', align: 'left' });
      const killReq = me.abKillReq || 0;
      const frac = ready ? 1 : (killReq > 0 ? clamp((me.abKills || 0) / killReq, 0, 1) : 1);
      ctx.save();
      ctx.fillStyle = 'rgba(255,255,255,.12)';
      rrect(ctx, bx + 10, by + 25, bw - 20, 8, 4); ctx.fill();
      ctx.fillStyle = ready ? '#8fd3ff' : '#5a7bb0';
      rrect(ctx, bx + 10, by + 25, (bw - 20) * frac, 8, 4); ctx.fill();
      ctx.restore();
      if (!ready) {
        const lbl = killReq > 0 ? (Math.max(0, killReq - (me.abKills || 0)) + ' bajas') : 'sin requisito';
        text(lbl, bx + bw - 10, by + 14,
          { font: 'bold 11px ui-monospace, monospace', color: '#8a93a8', align: 'right' });
      }
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
    ctx.strokeStyle = (view.theme && view.theme.accent) || 'rgba(255,255,255,.1)';
    ctx.globalAlpha = 0.6;
    ctx.lineWidth = 1;
    rrect(ctx, X, Y, W, H, 10); ctx.stroke();
    ctx.globalAlpha = 1;

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
      const x = ox + r.gx * gapx;
      const y = oy + r.gy * gapy;

      // conexiones
      const dim = !r.visited;
      ctx.strokeStyle = dim ? 'rgba(150,140,190,.2)' : 'rgba(180,160,220,.35)';
      ctx.lineWidth = 3;
      if (r.northVisited) { ctx.beginPath(); ctx.moveTo(x + cw / 2, y); ctx.lineTo(x + cw / 2, y - gapy + ch); ctx.stroke(); }
      if (r.westVisited) { ctx.beginPath(); ctx.moveTo(x, y + ch / 2); ctx.lineTo(x - gapx + cw, y + ch / 2); ctx.stroke(); }

      if (r.visited) {
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
      } else {
        // sala conocida pero aún sin explorar
        ctx.fillStyle = r.bossHint ? 'rgba(125,44,61,.3)' : 'rgba(120,110,150,.16)';
        rrect(ctx, x, y, cw, ch, 4); ctx.fill();
        ctx.setLineDash([4, 3]);
        ctx.strokeStyle = 'rgba(190,180,220,.35)';
        ctx.lineWidth = 1.4;
        rrect(ctx, x, y, cw, ch, 4); ctx.stroke();
        ctx.setLineDash([]);
        text('?', x + cw / 2, y + ch / 2 + 1, {
          font: 'bold 11px sans-serif', color: 'rgba(220,214,240,.55)', shadow: false,
        });
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
      if (r.bossHint) {
        text('☠', x + cw / 2, y + ch / 2 + 1, { font: 'bold 11px sans-serif', color: 'rgba(255,120,150,.85)', shadow: false });
      }

      // puertas con llave (marca dorada en el lado cerrado)
      if (r.locks) {
        ctx.fillStyle = '#ffd166';
        const lx = x + cw / 2, ly = y + ch / 2;
        if (r.locks & 1) { circle(ctx, lx, y - 1.5, 2.2); ctx.fill(); }
        if (r.locks & 2) { circle(ctx, lx, y + ch + 1.5, 2.2); ctx.fill(); }
        if (r.locks & 4) { circle(ctx, x - 1.5, ly, 2.2); ctx.fill(); }
        if (r.locks & 8) { circle(ctx, x + cw + 1.5, ly, 2.2); ctx.fill(); }
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
  // Globo con la información del objeto cercano (funciona también
  // para los clientes online, porque se dibuja sobre el canvas).
  // ---------------------------------------------------------
  function nearestPedestal(view) {
    const me = view.players.find((p) => p.id === view.localId) || view.players[0];
    if (!me) return null;
    let best = null, bd = 1e9;
    for (const ped of view.pedestals || []) {
      if (ped.taken) continue;
      const d = Math.hypot(me.x - ped.x, me.y - ped.y);
      if (d < 92 && d < bd) { bd = d; best = ped; }
    }
    return best ? { ped: best, me } : null;
  }

  function drawItemTooltip(view) {
    const hit = nearestPedestal(view);
    if (!hit) return;
    const ped = hit.ped;
    const item = Entities.findItem(ped.itemId);
    if (!item) return;
    const tier = Entities.tierOf(item);
    const lines = Entities.itemStatDeltas(item, hit.me).slice(0, 9);
    const syns = (typeof Entities.synergyWith === 'function') ? Entities.synergyWith(item, hit.me) : [];

    const w = 240;
    const h = 52 + Math.max(1, lines.length) * 17 + (ped.price > 0 ? 19 : 0) + (syns.length ? 20 + syns.length * 17 : 0);
    let x = clamp(ped.x - w / 2, 8, C.VIEW_W - w - 8);
    let y = ped.y - 52 - h;
    if (y < 8) y = ped.y + 40;
    y = clamp(y, 8, C.VIEW_H - h - 8);

    ctx.save();
    ctx.fillStyle = 'rgba(10,7,16,.94)';
    rrect(ctx, x, y, w, h, 10); ctx.fill();
    ctx.strokeStyle = tier.color;
    ctx.lineWidth = 2;
    rrect(ctx, x, y, w, h, 10); ctx.stroke();

    text(item.name, x + 12, y + 19, {
      font: 'bold 14px ui-monospace, monospace', color: '#f4efff', align: 'left',
    });
    text(tier.name, x + w - 12, y + 19, {
      font: 'bold 11px ui-monospace, monospace', color: tier.color, align: 'right',
    });
    ctx.strokeStyle = 'rgba(255,255,255,.16)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x + 10, y + 28); ctx.lineTo(x + w - 10, y + 28);
    ctx.stroke();

    let ly = y + 45;
    if (!lines.length) {
      text('Sin cambios de estadísticas', x + 12, ly, {
        font: '12px ui-monospace, monospace', color: '#a294bb', align: 'left',
      });
      ly += 17;
    }
    for (const l of lines) {
      text(l.label, x + 12, ly, {
        font: '12px ui-monospace, monospace', color: '#cbbfe0', align: 'left',
      });
      text(l.text, x + w - 12, ly, {
        font: 'bold 12px ui-monospace, monospace',
        color: l.positive ? '#7ee08a' : '#ff8f9c', align: 'right',
      });
      ly += 17;
    }

    if (ped.price > 0) {
      const afford = hit.me.coins >= ped.price;
      text('Precio', x + 12, ly, {
        font: '12px ui-monospace, monospace', color: '#cbbfe0', align: 'left',
      });
      text(ped.price + '$', x + w - 12, ly, {
        font: 'bold 13px ui-monospace, monospace',
        color: afford ? '#ffe58a' : '#ff7a7a', align: 'right',
      });
      ly += 19;
    }

    if (syns.length) {
      text('Sinergia', x + 12, ly, {
        font: 'bold 11px ui-monospace, monospace', color: '#ffd166', align: 'left',
      });
      ly += 17;
      for (const s of syns.slice(0, 3)) {
        text('⚡ ' + s.name, x + 14, ly, {
          font: 'bold 12px ui-monospace, monospace', color: '#ffe6a8', align: 'left',
        });
        ly += 17;
      }
    }
    ctx.restore();
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
    for (const e of view.enemies) drawEnemy(e, view);
    // jugadores
    for (const p of view.players) drawPlayer(p, view, p.id === view.localId);
    // balas
    for (const b of view.bullets) drawBullet(b);
    // hitboxes (solo cerca del jugador local)
    drawHitboxes(view);
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

    // globo del objeto cercano
    drawItemTooltip(view);

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

  function setHitboxes(on) { showHitboxes = !!on; return showHitboxes; }
  function toggleHitboxes() { showHitboxes = !showHitboxes; return showHitboxes; }
  function hitboxesOn() { return showHitboxes; }

  global.Render = { init, frame, drawItemIcon, shade, setHitboxes, toggleHitboxes, hitboxesOn, drawPlayer, drawBullet, drawFace };
})(typeof window !== 'undefined' ? window : globalThis);
