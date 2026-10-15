/* ============================================================
   dungeon.js — generación procedural del piso (determinista por semilla)
   Expone el global `Dungeon`.
   ============================================================ */
(function (global) {
  'use strict';

  const C = Utils.C;
  const key = (x, y) => x + ',' + y;

  const DIRS = [
    { n: 'up', dx: 0, dy: -1, ox: 0, oy: -1 },
    { n: 'down', dx: 0, dy: 1, ox: 0, oy: 1 },
    { n: 'left', dx: -1, dy: 0, ox: -1, oy: 0 },
    { n: 'right', dx: 1, dy: 0, ox: 1, oy: 0 },
  ];
  const OPPOSITE = { up: 'down', down: 'up', left: 'right', right: 'left' };

  // ---------------------------------------------------------
  // Obstáculos de una habitación
  // ---------------------------------------------------------
  function makeObstacles(rng, type) {
    const obs = [];
    if (type === 'start' || type === 'treasure' || type === 'shop') return obs;

    // Rejilla de candidatos dentro del área jugable
    const cols = 6, rows = 4;
    const padX = 74, padY = 62;
    const x0 = C.INNER_L + padX, x1 = C.INNER_R - padX;
    const y0 = C.INNER_T + padY, y1 = C.INNER_B - padY;

    const clearBand = 76; // deja libre la cruz central (pasillo a las puertas)
    const pts = [];
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const px = cols === 1 ? (x0 + x1) / 2 : x0 + (c * (x1 - x0)) / (cols - 1);
        const py = rows === 1 ? (y0 + y1) / 2 : y0 + (r * (y1 - y0)) / (rows - 1);
        if (Math.abs(px - C.CX) < clearBand) continue;
        if (Math.abs(py - C.CY) < clearBand) continue;
        pts.push({ x: px, y: py });
      }
    }

    const shuffled = Utils.shuffle(rng, pts);
    const pattern = rng();
    let count;

    if (type === 'boss') {
      count = Math.min(4, shuffled.length);
    } else if (pattern < 0.18) {
      count = 0;                                   // habitación despejada
    } else if (pattern < 0.45) {
      count = Utils.randInt(rng, 2, 4);            // pocos
    } else if (pattern < 0.8) {
      count = Utils.randInt(rng, 5, 8);            // media
    } else {
      count = Math.min(12, shuffled.length);       // muchos
    }

    // Si hay muchos, se colocan sobre la rejilla completa
    const use = (count > 8 ? shuffled : shuffled.slice(0, count));
    for (const p of use) {
      const rad = 17 + rng() * 7;
      obs.push({ x: p.x, y: p.y, r: rad, type: rng() < 0.22 ? 'bone' : 'rock', seed: rng() });
    }
    return obs;
  }

  // ---------------------------------------------------------
  // Generación completa del piso
  // ---------------------------------------------------------
  function generate(seed, floorNum) {
    const rng = Utils.mulberry32((seed ^ (floorNum * 2654435761)) >>> 0);
    rng(); rng(); // calentar

    const W = 9, H = 9;
    const rooms = Object.create(null);
    const list = [];
    const startGX = 4, startGY = 4;

    function addRoom(gx, gy, type) {
      const room = {
        gx, gy, type,
        doors: { up: false, down: false, left: false, right: false },
        locks: { up: false, down: false, left: false, right: false },
        obstacles: [],
        visited: false,
        cleared: type === 'start' || type === 'treasure' || type === 'shop',
        spawned: false,
        key: key(gx, gy),
      };
      rooms[room.key] = room;
      list.push(room);
      return room;
    }
    function link(a, b, dirName) {
      a.doors[dirName] = true;
      b.doors[OPPOSITE[dirName]] = true;
    }

    addRoom(startGX, startGY, 'start');

    const target = Math.min(22, 8 + floorNum * 2); // 10 / 12 / 14 … hasta 22
    const frontier = [[startGX, startGY]];
    let guard = 0;

    while (list.length < target && frontier.length && guard++ < 600) {
      const [cx, cy] = frontier.splice(Math.floor(rng() * frontier.length), 1)[0];
      const dirs = Utils.shuffle(rng, DIRS);
      const cur = rooms[key(cx, cy)];
      let branches = 0;

      for (const d of dirs) {
        if (list.length >= target || branches >= 2) break;
        const nx = cx + d.dx, ny = cy + d.dy;
        if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
        if (rooms[key(nx, ny)]) continue;

        // evita crear bucles: como máximo 1 vecino ya existente
        let neighbours = 0;
        for (const dd of DIRS) if (rooms[key(nx + dd.dx, ny + dd.dy)]) neighbours++;
        if (neighbours > 1) continue;

        const room = addRoom(nx, ny, 'normal');
        link(cur, room, d.n);
        frontier.push([nx, ny]);
        branches++;
      }
    }

    // ---------- Distancias desde el inicio ----------
    for (const r of list) r.dist = Infinity;
    const start = rooms[key(startGX, startGY)];
    start.dist = 0;
    const q = [start];
    while (q.length) {
      const r = q.shift();
      for (const d of DIRS) {
        if (!r.doors[d.n]) continue;
        const nb = rooms[key(r.gx + d.dx, r.gy + d.dy)];
        if (nb && nb.dist > r.dist + 1) { nb.dist = r.dist + 1; q.push(nb); }
      }
    }

    // ---------- Jefe: la habitación más lejana ----------
    let boss = start;
    for (const r of list) if (r.dist > boss.dist) boss = r;
    if (boss !== start) boss.type = 'boss';

    // ---------- Habitaciones especiales en los callejones ----------
    const degree = (r) => DIRS.reduce((n, d) => n + (r.doors[d.n] ? 1 : 0), 0);
    let deadEnds = list.filter((r) => r !== start && r !== boss && degree(r) === 1);
    if (!deadEnds.length) deadEnds = list.filter((r) => r !== start && r !== boss);
    deadEnds = Utils.shuffle(rng, deadEnds);

    if (deadEnds[0]) { deadEnds[0].type = 'treasure'; deadEnds[0].cleared = true; }
    if (deadEnds[1]) { deadEnds[1].type = 'shop'; deadEnds[1].cleared = true; }

    // ---------- Puertas con llave ----------
    // Se cierran con llave las entradas a las salas opcionales: usar una llave
    // para entrar en el tesoro (siempre) y en la tienda (según el piso). Así las
    // llaves tienen utilidad sin bloquear nunca el camino hacia el jefe.
    function lockRoom(room) {
      for (const d of DIRS) {
        if (!room.doors[d.n]) continue;
        room.locks[d.n] = true;
        const nb = rooms[key(room.gx + d.dx, room.gy + d.dy)];
        if (nb) nb.locks[OPPOSITE[d.n]] = true;
      }
    }
    if (deadEnds[0] && deadEnds[0].type === 'treasure') lockRoom(deadEnds[0]);
    if (deadEnds[1] && deadEnds[1].type === 'shop' && (floorNum >= 2 || rng() < 0.5)) {
      lockRoom(deadEnds[1]);
    }

    // ---------- Obstáculos ----------
    for (const r of list) {
      const rr = Utils.mulberry32(Utils.hash(r.key + ':' + seed + ':' + floorNum));
      r.obstacles = makeObstacles(rr, r.type);
    }

    return {
      seed, floorNum,
      rooms, list,
      startKey: key(startGX, startGY),
      bossKey: boss.key,
      distance: (r) => r.dist,
    };
  }

  const get = (floorObj, gx, gy) => floorObj.rooms[key(gx, gy)] || null;

  // Plan de enemigos de una habitación (lo usa el anfitrión al entrar)
  function enemyPlan(room, floorNum, seed) {
    if (room.type === 'start' || room.type === 'treasure' || room.type === 'shop') return [];
    const rng = Utils.mulberry32(Utils.hash(room.key + '#e' + seed + '#' + floorNum));

    if (room.type === 'boss') {
      const roster = (typeof Entities !== 'undefined' && Entities.BOSS_ROSTER) || ['boss'];
      const bType = roster[(floorNum - 1) % roster.length];
      const plan = [{ type: bType, count: 1 }];
      const n = Math.min(2, Math.floor((floorNum - 1) / 2));
      for (let i = 0; i < n; i++) plan.push({ type: 'gaper', count: 2 });
      return plan;
    }

    let budget = 2 + floorNum * 1.7 + room.dist * 0.6;
    const pool = [
      { type: 'fly', cost: 1, w: 3 },
      { type: 'gaper', cost: 1.4, w: 3 },
      { type: 'hopper', cost: 1.4, w: 2 },
      { type: 'spitter', cost: 2, w: 1.6 + floorNum * 0.35 },
      { type: 'charger', cost: 2.4, w: 1 + floorNum * 0.4 },
      { type: 'fat', cost: 3.2, w: 0.4 + floorNum * 0.35 },
    ];

    const picked = [];
    let guard = 0;
    while (budget > 1.2 && guard++ < 40) {
      const p = Utils.pickW(rng, pool);
      if (p.cost > budget + 0.6) continue;
      budget -= p.cost;
      picked.push(p.type);
    }
    if (!picked.length) picked.push('fly');

    const counts = {};
    for (const t of picked) counts[t] = (counts[t] || 0) + 1;
    return Object.keys(counts).map((t) => ({ type: t, count: counts[t] }));
  }

  global.Dungeon = { generate, get, enemyPlan, DIRS, OPPOSITE };
})(typeof window !== 'undefined' ? window : globalThis);
