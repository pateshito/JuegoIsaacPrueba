/* ============================================================
   utils.js — constantes globales, matemáticas y utilidades
   Script clásico: expone el global `Utils`.
   ============================================================ */
(function (global) {
  'use strict';

  // ---------- Configuración del mundo ----------
  const C = {
    VIEW_W: 960,
    VIEW_H: 540,
    TILE: 56,
    COLS: 13,
    ROWS: 7,
    WALL: 26,          // grosor del muro dibujado
    DOOR_HALF: 58,     // semi-anchura de la boca de la puerta
    MAX_PLAYERS: 4,
    FLOORS: 9,
    RENDER_DELAY: 0.13, // segundos de retardo de interpolación en el cliente
  };
  C.ROOM_W = C.TILE * C.COLS;                        // 728
  C.ROOM_H = C.TILE * C.ROWS;                        // 392
  C.ROOM_X = Math.round((C.VIEW_W - C.ROOM_W) / 2);  // 116
  C.ROOM_Y = Math.round((C.VIEW_H - C.ROOM_H) / 2);  // 74
  C.INNER_L = C.ROOM_X + C.WALL;
  C.INNER_R = C.ROOM_X + C.ROOM_W - C.WALL;
  C.INNER_T = C.ROOM_Y + C.WALL;
  C.INNER_B = C.ROOM_Y + C.ROOM_H - C.WALL;
  C.CX = C.ROOM_X + C.ROOM_W / 2;
  C.CY = C.ROOM_Y + C.ROOM_H / 2;

  // ---------- Matemáticas ----------
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const lerp = (a, b, t) => a + (b - a) * t;
  const dist = (ax, ay, bx, by) => Math.hypot(ax - bx, ay - by);
  const dist2 = (ax, ay, bx, by) => {
    const dx = ax - bx, dy = ay - by;
    return dx * dx + dy * dy;
  };
  const len = (x, y) => Math.hypot(x, y);

  function norm(x, y) {
    const l = Math.hypot(x, y);
    if (l < 1e-6) return { x: 0, y: 0 };
    return { x: x / l, y: y / l };
  }

  // Redondeo a 1 decimal (para reducir el tamaño de los paquetes de red)
  const r1 = (n) => Math.round(n * 10) / 10;

  // Ángulo (radianes) -> dirección de 4 ejes dominante
  function dir4(x, y) {
    if (Math.abs(x) >= Math.abs(y)) return x >= 0 ? 'right' : 'left';
    return y >= 0 ? 'down' : 'up';
  }

  // ---------- Aleatoriedad determinista ----------
  function mulberry32(a) {
    a = a >>> 0;
    return function () {
      a |= 0;
      a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  const randInt = (rng, a, b) => a + Math.floor(rng() * (b - a + 1));
  const pick = (rng, arr) => arr[Math.floor(rng() * arr.length) % arr.length];
  const pickW = (rng, arr) => {           // elige respetando `w`
    let total = 0;
    for (const it of arr) total += (it.w || 1);
    let r = rng() * total;
    for (const it of arr) { r -= (it.w || 1); if (r <= 0) return it; }
    return arr[arr.length - 1];
  };

  function shuffle(rng, arr) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      const t = a[i]; a[i] = a[j]; a[j] = t;
    }
    return a;
  }

  // Hash de cadena -> entero de 32 bits (para semillas estables)
  function hash(str) {
    let h = 2166136261 >>> 0;
    for (let i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = Math.imul(h, 16777619) >>> 0;
    }
    return h >>> 0;
  }

  const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now()) / 1000;

  // ---------- Dibujo ----------
  function rrect(ctx, x, y, w, h, r) {
    const rr = Math.min(r, Math.abs(w) / 2, Math.abs(h) / 2);
    ctx.beginPath();
    ctx.moveTo(x + rr, y);
    ctx.arcTo(x + w, y, x + w, y + h, rr);
    ctx.arcTo(x + w, y + h, x, y + h, rr);
    ctx.arcTo(x, y + h, x, y, rr);
    ctx.arcTo(x, y, x + w, y, rr);
    ctx.closePath();
  }

  function circle(ctx, x, y, r) {
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.closePath();
  }

  const shadowBlob = (ctx, x, y, rx, ry, alpha) => {
    ctx.save();
    ctx.globalAlpha = alpha == null ? 0.32 : alpha;
    ctx.fillStyle = '#000';
    ctx.beginPath();
    ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  };

  // ---------- Varios ----------
  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, (c) => (
      { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
    ));
  }

  const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

  function makeRoomCode(n) {
    let s = '';
    for (let i = 0; i < (n || 4); i++) {
      s += CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)];
    }
    return s;
  }

  function makeSeed() {
    return (Math.random() * 0xffffffff) >>> 0;
  }

  function fmtTime(sec) {
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return m + ':' + String(s).padStart(2, '0');
  }

  global.Utils = {
    C, clamp, lerp, dist, dist2, len, norm, r1, dir4,
    mulberry32, randInt, pick, pickW, shuffle, hash, now,
    rrect, circle, shadowBlob,
    escapeHtml, makeRoomCode, makeSeed, fmtTime,
  };
})(typeof window !== 'undefined' ? window : globalThis);
