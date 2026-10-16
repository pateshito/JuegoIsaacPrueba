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
  // TEMAS por piso: color y "diseño" del mapa. Cada piso se ve y se
  // genera distinto.
  // ---------------------------------------------------------
  const THEMES = [
    { name: 'Sótano',       wall: '#2b2440', floor: '#1a1526', accent: '#6d5aa0', target: 11, branch: 2, obs: 'grid',   density: 1.0, tint: 'rgba(120,90,180,0.10)' },
    { name: 'Cuevas',       wall: '#3a3023', floor: '#221b12', accent: '#9a7f52', target: 13, branch: 2, obs: 'blobs',  density: 1.1, tint: 'rgba(180,140,80,0.10)' },
    { name: 'Catacumbas',   wall: '#26303a', floor: '#161d24', accent: '#54839a', target: 15, branch: 3, obs: 'ring',   density: 0.9, tint: 'rgba(90,150,180,0.10)' },
    { name: 'Vientre',      wall: '#3a1f2a', floor: '#220f16', accent: '#a04a63', target: 16, branch: 2, obs: 'blobs',  density: 1.2, tint: 'rgba(190,70,100,0.10)' },
    { name: 'Desierto',     wall: '#40361f', floor: '#281f10', accent: '#c9a24a', target: 17, branch: 3, obs: 'sparse', density: 0.7, tint: 'rgba(220,190,90,0.10)' },
    { name: 'Criohielo',    wall: '#223a44', floor: '#102028', accent: '#5fb0c9', target: 18, branch: 3, obs: 'grid',   density: 1.0, tint: 'rgba(120,210,240,0.12)' },
    { name: 'Infierno',     wall: '#451c14', floor: '#2a0d08', accent: '#e0622c', target: 19, branch: 3, obs: 'dense',  density: 1.3, tint: 'rgba(255,120,50,0.12)' },
    { name: 'Vacío',        wall: '#1c1c26', floor: '#0c0c12', accent: '#8a6cc9', target: 20, branch: 4, obs: 'sparse', density: 0.6, tint: 'rgba(140,110,220,0.14)' },
    { name: 'Cielo',        wall: '#2a3550', floor: '#161d30', accent: '#bcd4ff', target: 21, branch: 4, obs: 'ring',   density: 0.9, tint: 'rgba(200,220,255,0.14)' },
  ];
  const theme = (floorNum) => THEMES[((Math.max(1, floorNum | 0) - 1) % THEMES.length + THEMES.length) % THEMES.length];

  // ---------------------------------------------------------
  // Obstáculos de una habitación
  // ---------------------------------------------------------
  // Conjunto de "diseños" según el tema del piso. Cada sala elige uno al
  // azar, así dentro de un mismo piso las habitaciones se ven distintas.
  function layoutSet(th) {
    const base = (th && th.obs) || 'grid';
    if (base === 'ring')   return ['ring', 'corners', 'cross', 'pillars'];
    if (base === 'blobs')  return ['blobs', 'pillars', 'corners', 'scatter'];
    if (base === 'sparse') return ['sparse', 'cross', 'arena', 'corners'];
    if (base === 'dense')  return ['dense', 'grid', 'pillars', 'scatter'];
    return ['grid', 'pillars', 'corners', 'cross', 'scatter', 'arena'];
  }

  function makeObstacles(rng, type, th) {
    const obs = [];
    if (type === 'start' || type === 'treasure' || type === 'shop') return obs;

    const density = (th && th.density) || 1;

    // Rejilla de candidatos dentro del área jugable.
    const cols = 7, rows = 5;
    const padX = 74, padY = 58;
    const x0 = C.INNER_L + padX, x1 = C.INNER_R - padX;
    const y0 = C.INNER_T + padY, y1 = C.INNER_B - padY;

    const clearBand = 76; // deja libre la cruz central (pasillo a las puertas)
    const grid = [];
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const px = cols === 1 ? (x0 + x1) / 2 : x0 + (c * (x1 - x0)) / (cols - 1);
        const py = rows === 1 ? (y0 + y1) / 2 : y0 + (r * (y1 - y0)) / (rows - 1);
        grid.push({
          x: px, y: py, col: c, row: r,
          cross: (Math.abs(px - C.CX) < clearBand || Math.abs(py - C.CY) < clearBand),
          edge: (c === 0 || c === cols - 1 || r === 0 || r === rows - 1),
        });
      }
    }
    const free = grid.filter((p) => !p.cross);

    // Zona del jefe: pocos obstáculos, repartidos.
    if (type === 'boss') {
      const pool = Utils.shuffle(rng, free);
      const n = Math.min(4, pool.length);
      for (let i = 0; i < n; i++) {
        const rad = 17 + rng() * 7;
        obs.push({ x: pool[i].x, y: pool[i].y, r: rad, type: rng() < 0.22 ? 'bone' : 'rock', seed: rng() });
      }
      return obs;
    }

    const layout = Utils.pick(rng, layoutSet(th));
    let chosen = [];
    if (layout === 'sparse') {
      chosen = Utils.shuffle(rng, free).slice(0, Utils.randInt(rng, 2, 4));
    } else if (layout === 'dense') {
      chosen = free.slice();
    } else if (layout === 'grid') {
      chosen = Utils.shuffle(rng, free).slice(0, Utils.randInt(rng, 5, 9));
    } else if (layout === 'ring') {
      chosen = grid.filter((p) => p.edge && !p.cross);
    } else if (layout === 'pillars') {
      chosen = free.filter((p) => p.col % 2 === 0);
    } else if (layout === 'corners') {
      chosen = free.filter((p) => (p.col <= 1 || p.col >= cols - 2) && (p.row <= 1 || p.row >= rows - 2));
    } else if (layout === 'cross') {
      chosen = free.filter((p) => p.col === (cols - 1) / 2 || p.row === Math.floor(rows / 2));
    } else if (layout === 'arena') {
      chosen = Utils.shuffle(rng, free).slice(0, Utils.randInt(rng, 3, 5));
    } else if (layout === 'blobs') {
      const seeds = Utils.shuffle(rng, free).slice(0, Utils.randInt(rng, 2, 3));
      chosen = free.filter((p) => seeds.some((s) => Math.abs(s.col - p.col) <= 1 && Math.abs(s.row - p.row) <= 1));
    } else { // 'scatter'
      chosen = Utils.shuffle(rng, free).slice(0, Utils.randInt(rng, 4, 7));
    }

    // La densidad del tema adelgaza (o deja igual) el resultado.
    if (density < 1) chosen = chosen.filter(() => rng() < density + 0.25);

    const big = layout === 'arena';
    for (const p of chosen) {
      const rad = (big ? 22 : 17) + rng() * 7;
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
    const th = theme(floorNum);
    const rooms = Object.create(null);
    const list = [];
    const startGX = 4, startGY = 4;

    function addRoom(gx, gy, type) {
      const room = {
        gx, gy, type,
        doors: { up: false, down: false, left: false, right: false },
        locks: { up: false, down: false, left: false, right: false },
        bossDoor: { up: false, down: false, left: false, right: false },
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

    // El tamaño y la forma del piso dependen del tema (diseño por piso).
    const target = Math.min(22, th.target + Math.floor(floorNum / 2));
    const maxBranch = th.branch || 2;
    const frontier = [[startGX, startGY]];
    let guard = 0;

    while (list.length < target && frontier.length && guard++ < 900) {
      const [cx, cy] = frontier.splice(Math.floor(rng() * frontier.length), 1)[0];
      const dirs = Utils.shuffle(rng, DIRS);
      const cur = rooms[key(cx, cy)];
      let branches = 0;

      for (const d of dirs) {
        if (list.length >= target || branches >= maxBranch) break;
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

    // ---------- Puerta del jefe ----------
    // Marcamos la puerta que lleva a la sala del jefe (en ambos lados del vano)
    // para que se dibuje con un marco propio y se reconozca a distancia.
    for (const d of DIRS) {
      if (!boss.doors[d.n]) continue;
      boss.bossDoor[d.n] = true;
      const nb = rooms[key(boss.gx + d.dx, boss.gy + d.dy)];
      if (nb) nb.bossDoor[OPPOSITE[d.n]] = true;
    }

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
      r.obstacles = makeObstacles(rr, r.type, th);
    }

    return {
      seed, floorNum,
      rooms, list,
      theme: th,
      startKey: key(startGX, startGY),
      bossKey: boss.key,
      distance: (r) => r.dist,
    };
  }

  const get = (floorObj, gx, gy) => floorObj.rooms[key(gx, gy)] || null;

  // ---------------------------------------------------------
  // Enemigos por piso: cada piso estrena una mezcla COMPLETAMENTE distinta a
  // la del piso anterior (no repite tipos dos pisos seguidos); los enemigos
  // más duros (francotirador) solo salen en pisos avanzados.
  // ---------------------------------------------------------
  const FLOOR_POOLS = [
    ['fly', 'gaper'],                       // 1 · Sótano
    ['hopper', 'spitter'],                  // 2 · Cuevas
    ['charger', 'fat'],                     // 3 · Catacumbas
    ['ghost', 'sniper'],                    // 4 · Vientre
    ['fly', 'gaper', 'hopper'],             // 5 · Desierto
    ['spitter', 'charger', 'fat'],          // 6 · Criohielo
    ['ghost', 'sniper', 'fly'],             // 7 · Infierno
    ['gaper', 'hopper', 'charger'],         // 8 · Vacío
    ['spitter', 'fat', 'ghost', 'sniper'],  // 9 · Cielo
  ];

  // Plan de enemigos de una habitación (lo usa el anfitrión al entrar)
  function enemyPlan(room, floorNum, seed) {
    if (room.type === 'start' || room.type === 'treasure' || room.type === 'shop') return [];
    const f = Math.max(1, floorNum | 0);
    const rng = Utils.mulberry32(Utils.hash(room.key + '#e' + seed + '#' + floorNum));
    const allowed = FLOOR_POOLS[(f - 1) % FLOOR_POOLS.length];

    if (room.type === 'boss') {
      const roster = (typeof Entities !== 'undefined' && Entities.BOSS_ROSTER) || ['boss'];
      const pools = (typeof Entities !== 'undefined' && Entities.BOSS_POOLS) || null;
      let bType;
      if (pools && pools.length) {
        const pool = pools[(f - 1) % pools.length];
        bType = Utils.pick(rng, pool);
      } else {
        bType = roster[(f - 1) % roster.length];
      }
      const plan = [{ type: bType, count: 1 }];
      // Los esbirros del jefe son del propio piso (nunca de otro piso) y se
      // prefieren los cuerpo a cuerpo para no castigar en exceso.
      const melee = allowed.filter((t) => t !== 'spitter' && t !== 'sniper');
      const spawnPool = melee.length ? melee : allowed;
      const n = Math.min(2, Math.floor((f - 1) / 2));
      for (let i = 0; i < n; i++) plan.push({ type: Utils.pick(rng, spawnPool), count: 2 });
      return plan;
    }

    let budget = 2 + f * 1.7 + room.dist * 0.6;
    const all = {
      fly: { type: 'fly', cost: 1, w: 3 },
      gaper: { type: 'gaper', cost: 1.4, w: 3 },
      hopper: { type: 'hopper', cost: 1.4, w: 2 },
      spitter: { type: 'spitter', cost: 2, w: 1.6 + f * 0.35 },
      charger: { type: 'charger', cost: 2.4, w: 1 + f * 0.4 },
      fat: { type: 'fat', cost: 3.2, w: 0.4 + f * 0.35 },
      ghost: { type: 'ghost', cost: 2, w: 0.5 + f * 0.3 },
      sniper: { type: 'sniper', cost: 2.6, w: 0.3 + f * 0.28 },
    };
    const pool = allowed.map((t) => all[t]).filter(Boolean);

    const picked = [];
    let guard = 0;
    while (budget > 1.2 && guard++ < 40) {
      const p = Utils.pickW(rng, pool);
      if (p.cost > budget + 0.6) continue;
      budget -= p.cost;
      picked.push(p.type);
    }
    if (!picked.length) picked.push(allowed[0] || 'fly');

    const counts = {};
    for (const t of picked) counts[t] = (counts[t] || 0) + 1;
    return Object.keys(counts).map((t) => ({ type: t, count: counts[t] }));
  }

  global.Dungeon = { generate, get, enemyPlan, DIRS, OPPOSITE, THEMES, theme, FLOOR_POOLS };
})(typeof window !== 'undefined' ? window : globalThis);
