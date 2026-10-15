/* ============================================================
   game.js — simulación, reglas y estado del juego
   Modos: 'local' (1-2 jugadores en el mismo teclado), 'host'
   (anfitrión autoritativo de una sala online) y 'client'.
   Expone el global `Game`.
   ============================================================ */
(function (global) {
  'use strict';

  const C = Utils.C;
  const E = Entities;
  const r1 = Utils.r1;
  const SEND_HZ = 1 / 20;
  const INPUT_HZ = 1 / 30;

  const G = {
    mode: 'local',
    running: false,
    paused: false,
    over: false,
    victory: false,
    time: 0,
    renderClock: 0,
    floorNum: 1,
    seed: 0,
    dungeon: null,
    gx: 0, gy: 0,
    room: null,
    players: [],
    enemies: [],
    bullets: [],
    particles: [],
    localPlayers: [],
    localId: null,
    remoteInputs: Object.create(null),
    buffer: [],
    fxQueue: [],
    fxSend: [],
    stats: { kills: 0, rooms: 0 },
    message: '', messageTimer: 0,
    bigMessage: null,
    hintTimer: 0,
    shake: 0,
    transition: 0,
    // temporizadores de red
    sendAccum: 0,
    inputAccum: 0,
    pingAccum: 0,
    localShootCd: 0,
    localPlayer: null,
    awaitingState: false,
  };

  let handlers = {};

  const simulating = () => G.mode === 'local' || G.mode === 'host';

  // ---------------------------------------------------------
  // Utilidades internas
  // ---------------------------------------------------------
  const alivePlayers = () => G.players.filter((p) => !p.dead);

  function nearestPlayer(x, y) {
    let best = null, bd = Infinity;
    for (const p of alivePlayers()) {
      const d = Utils.dist2(x, y, p.x, p.y);
      if (d < bd) { bd = d; best = p; }
    }
    return best;
  }

  function slotFree() {
    const used = new Set(G.players.map((p) => p.slot));
    for (let i = 0; i < C.MAX_PLAYERS; i++) if (!used.has(i)) return i;
    return G.players.length % C.MAX_PLAYERS;
  }

  function randomItemId(avoid) {
    const pool = E.ITEMS.filter((i) => !avoid || !avoid.includes(i.id));
    const list = pool.length ? pool : E.ITEMS;
    return list[Math.floor(Math.random() * list.length)].id;
  }

  function setMessage(txt, dur) {
    G.message = txt;
    G.messageTimer = dur || 2.2;
  }

  function bigMsg(text, sub, t) {
    G.bigMessage = { text, sub: sub || '', t: t || 2.6 };
  }

  function addShake(v) { G.shake = Math.min(1.2, G.shake + v); }

  // ---------------------------------------------------------
  // Colisiones de escenario
  // ---------------------------------------------------------
  function resolveObstacles(e) {
    const obs = G.room ? G.room.obstacles : null;
    if (!obs || !obs.length) return;
    for (let i = 0; i < obs.length; i++) {
      const o = obs[i];
      const dx = e.x - o.x, dy = e.y - o.y;
      const min = o.r + e.r;
      const d2 = dx * dx + dy * dy;
      if (d2 < min * min) {
        const d = Math.sqrt(d2) || 0.001;
        const push = min - d;
        e.x += (dx / d) * push;
        e.y += (dy / d) * push;
      }
    }
  }

  function doorOpen(room) {
    return room.cleared || room.type === 'start' || room.type === 'treasure' || room.type === 'shop';
  }

  // Limita al jugador dentro de la sala (permite asomarse a las puertas abiertas)
  function clampPlayerToRoom(p) {
    const room = G.room;
    const open = doorOpen(room);
    let minX = C.INNER_L + p.r, maxX = C.INNER_R - p.r;
    let minY = C.INNER_T + p.r, maxY = C.INNER_B - p.r;
    const slack = C.DOOR_HALF - p.r - 2;

    if (open && room.doors.left && Math.abs(p.y - C.CY) < slack) minX = C.ROOM_X - 30;
    if (open && room.doors.right && Math.abs(p.y - C.CY) < slack) maxX = C.ROOM_X + C.ROOM_W + 30;
    if (open && room.doors.up && Math.abs(p.x - C.CX) < slack) minY = C.ROOM_Y - 30;
    if (open && room.doors.down && Math.abs(p.x - C.CX) < slack) maxY = C.ROOM_Y + C.ROOM_H + 30;

    p.x = Utils.clamp(p.x, minX, maxX);
    p.y = Utils.clamp(p.y, minY, maxY);
  }

  function clampEnemyToRoom(e) {
    e.x = Utils.clamp(e.x, C.INNER_L + e.r, C.INNER_R - e.r);
    e.y = Utils.clamp(e.y, C.INNER_T + e.r, C.INNER_B - e.r);
  }

  // ---------------------------------------------------------
  // Movimiento compartido (lo usa también la predicción del cliente)
  // ---------------------------------------------------------
  function movePlayer(p, input, dt) {
    if (p.dead) return;
    const sp = p.speed;
    p.vx = (input.mx || 0) * sp;
    p.vy = (input.my || 0) * sp;
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    clampPlayerToRoom(p);
    resolveObstacles(p);

    const moving = !!(input.mx || input.my);
    p.walkPhase += dt * (moving ? 9 : 2.4);

    if (input.fire && (input.sx || input.sy)) {
      p.aim.x = input.sx;
      p.aim.y = input.sy;
    }
    const k = 1 - Math.exp(-14 * dt);
    p.face.x = Utils.lerp(p.face.x, p.aim.x, k);
    p.face.y = Utils.lerp(p.face.y, p.aim.y, k);
  }

  // ---------------------------------------------------------
  // Disparos
  // ---------------------------------------------------------
  function playerShoot(p) {
    const base = Math.atan2(p.aim.y, p.aim.x);
    const n = 1 + p.extraShots;
    for (let i = 0; i < n; i++) {
      const spread = n === 1 ? 0 : (i - (n - 1) / 2) * 0.2;
      const a = base + spread;
      G.bullets.push(E.createBullet(
        p.x + Math.cos(a) * 16, p.y + Math.sin(a) * 16,
        Math.cos(a) * p.bulletSpeed, Math.sin(a) * p.bulletSpeed,
        { friendly: true, dmg: p.damage, r: p.bulletSize, color: '#dff1ff', life: p.range, pierce: p.piercing, owner: p.id }
      ));
    }
    G.fxQueue.push({ k: 'puff', x: p.x + Math.cos(base) * 18, y: p.y + Math.sin(base) * 18, c: '#cfe8ff', n: 3 });
    Sfx.play('shoot');
  }

  function enemyShoot(e, target) {
    const a = Math.atan2(target.y - e.y, target.x - e.x);
    G.bullets.push(E.createBullet(
      e.x + Math.cos(a) * e.r, e.y + Math.sin(a) * e.r,
      Math.cos(a) * e.shotSpeed, Math.sin(a) * e.shotSpeed,
      { friendly: false, dmg: 2, r: 7, color: '#ff9a5c', life: 2.4 }
    ));
    Sfx.play('hit');
  }

  // ---------------------------------------------------------
  // Daño
  // ---------------------------------------------------------
  function hurtPlayer(p, dmg, fromX, fromY) {
    if (p.dead || p.invuln > 0) return;
    p.hp -= dmg;
    p.invuln = 1.35;
    p.hurtFlash = 0.3;
    addShake(0.35);
    Sfx.play('hurt');
    G.fxQueue.push({ k: 'boom', x: p.x, y: p.y, c: '#ff6b8a', n: 10 });

    if (fromX != null) {
      const d = Math.hypot(p.x - fromX, p.y - fromY) || 1;
      p.x += ((p.x - fromX) / d) * 14;
      p.y += ((p.y - fromY) / d) * 14;
    }

    if (p.hp <= 0) {
      p.hp = 0;
      p.dead = true;
      p.reviveTimer = 0;
      G.fxQueue.push({ k: 'boom', x: p.x, y: p.y, c: p.color, n: 22 });
      addShake(0.8);
      setMessage(p.name + ' ha caído', 2.4);
    }
  }

  function damageEnemy(e, dmg, bx, by) {
    e.hp -= dmg;
    e.flash = 0.14;
    G.fxQueue.push({ k: 'puff', x: bx, y: by, c: '#ffffff', n: 4 });
    Sfx.play('hit');
    if (e.hp <= 0) killEnemy(e);
  }

  function killEnemy(e) {
    const i = G.enemies.indexOf(e);
    if (i >= 0) G.enemies.splice(i, 1);
    G.stats.kills++;
    Sfx.play('kill');
    addShake(e.isBoss ? 1.0 : 0.16);
    G.fxQueue.push({ k: 'boom', x: e.x, y: e.y, c: e.color, n: e.isBoss ? 40 : 12 });

    // división (enemigos gordos)
    if (e.splits > 0) {
      for (let k = 0; k < e.splits; k++) {
        const a = (k / e.splits) * Math.PI * 2;
        const child = E.createEnemy('fly', e.x + Math.cos(a) * 22, e.y + Math.sin(a) * 22, G.floorNum);
        G.enemies.push(child);
      }
    }

    // botín
    const luck = bestLuck();
    if (Math.random() < 0.15 + luck * 0.05) dropPickup('heart', e.x, e.y);
    else if (Math.random() < 0.28 + luck * 0.08) dropPickup('coin', e.x, e.y);
    if (Math.random() < 0.045) dropPickup('key', e.x, e.y);

    if (e.isBoss) onBossDefeated();
  }

  function bestLuck() {
    let l = 0;
    for (const p of G.players) l = Math.max(l, p.luck || 0);
    return l;
  }

  function dropPickup(type, x, y) {
    if (!G.room.pickups) G.room.pickups = [];
    G.room.pickups.push(E.createPickup(type, x, y));
  }

  // ---------------------------------------------------------
  // Salas
  // ---------------------------------------------------------
  function findSpawnPos(rng, avoidCenter) {
    const pad = 46;
    for (let i = 0; i < 40; i++) {
      const x = C.INNER_L + pad + rng() * (C.INNER_R - C.INNER_L - pad * 2);
      const y = C.INNER_T + pad + rng() * (C.INNER_B - C.INNER_T - pad * 2);
      if (avoidCenter && Utils.dist(x, y, C.CX, C.CY) < 110) continue;
      let ok = true;
      for (const o of G.room.obstacles) {
        if (Utils.dist(x, y, o.x, o.y) < o.r + 26) { ok = false; break; }
      }
      if (ok) return { x, y };
    }
    return { x: C.INNER_L + pad + rng() * 200, y: C.INNER_T + pad };
  }

  function spawnEnemies(room) {
    const rng = Utils.mulberry32(Utils.hash(room.key + '@' + G.seed + '@' + G.floorNum));
    const plan = Dungeon.enemyPlan(room, G.floorNum, G.seed);
    for (const entry of plan) {
      for (let i = 0; i < entry.count; i++) {
        let pos;
        if (entry.type === 'boss') {
          pos = { x: C.CX, y: C.INNER_T + 84 };
        } else {
          pos = findSpawnPos(rng, true);
        }
        G.enemies.push(E.createEnemy(entry.type, pos.x, pos.y, G.floorNum));
      }
    }
    if (plan.length) Sfx.play('door');
  }

  function enterRoom(room) {
    G.room = room;
    room.visited = true;
    if (!room.pickups) room.pickups = [];
    if (!room.pedestals) room.pedestals = [];

    if (!simulating()) return;

    if (!room.spawned) {
      room.spawned = true;
      if (room.type === 'treasure') {
        room.pedestals.push(E.createPedestal(randomItemId(ownedItems()), C.CX, C.CY));
      } else if (room.type === 'shop') {
        room.pedestals.push(E.createPedestal('heart', C.CX - 110, C.CY, 7));
        room.pedestals.push(E.createPedestal(randomItemId(ownedItems()), C.CX, C.CY, 12));
        room.pedestals.push(E.createPedestal(randomItemId(ownedItems()), C.CX + 110, C.CY, 15));
      } else {
        spawnEnemies(room);
      }
      G.stats.rooms++;
    }
  }

  function ownedItems() {
    const s = new Set();
    for (const p of G.players) for (const it of p.items) s.add(it);
    return Array.from(s);
  }

  function placePlayers(entrySide, atCenter) {
    const n = G.players.length;
    G.players.forEach((p, i) => {
      if (p.dead) return;
      const off = (i - (n - 1) / 2) * 40;
      if (atCenter || !entrySide) {
        p.x = C.CX + off;
        p.y = C.CY + 22;
      } else if (entrySide === 'left') {
        p.x = C.INNER_L + 34;
        p.y = C.CY + off;
      } else if (entrySide === 'right') {
        p.x = C.INNER_R - 34;
        p.y = C.CY + off;
      } else if (entrySide === 'up') {
        p.y = C.INNER_T + 34;
        p.x = C.CX + off;
      } else {
        p.y = C.INNER_B - 34;
        p.x = C.CX + off;
      }
      clampPlayerToRoom(p);
    });
  }

  function checkTransition(p) {
    if (!doorOpen(G.room)) return null;
    const room = G.room;
    if (p.x < C.ROOM_X - 6 && room.doors.left) return 'left';
    if (p.x > C.ROOM_X + C.ROOM_W + 6 && room.doors.right) return 'right';
    if (p.y < C.ROOM_Y - 6 && room.doors.up) return 'up';
    if (p.y > C.ROOM_Y + C.ROOM_H + 6 && room.doors.down) return 'down';
    return null;
  }

  const OPP = { left: 'right', right: 'left', up: 'down', down: 'up' };
  const DELTA = { left: [-1, 0], right: [1, 0], up: [0, -1], down: [0, 1] };

  function goThroughDoor(dir) {
    const d = DELTA[dir];
    const next = Dungeon.get(G.dungeon, G.gx + d[0], G.gy + d[1]);
    if (!next) return;
    G.gx = next.gx;
    G.gy = next.gy;
    G.bullets.length = 0;
    G.enemies.length = 0;
    enterRoom(next);
    placePlayers(OPP[dir], false);
    // empujar un poco hacia dentro
    G.players.forEach((p) => { if (!p.dead) p.invuln = Math.max(p.invuln, 0.35); });
    G.transition = 0.34;
    Sfx.play('door');
    if (next.type === 'boss' && !next.cleared) {
      Sfx.play('boss');
      bigMsg('¡JEFE!', 'Derrótalo para bajar de piso', 2.2);
    }
  }

  function checkRoomCleared() {
    if (G.enemies.length > 0) return;
    const room = G.room;
    if (room.cleared) return;
    room.cleared = true;
    Sfx.play('clear');
    addShake(0.2);

    if (room.type === 'boss') {
      bigMsg('¡JEFE DERROTADO!', 'Usa la trampilla para bajar', 3);
    } else {
      setMessage('¡Habitación despejada!', 1.8);
    }

    // recompensa del jefe: objeto + trampilla
    if (room.type === 'boss') {
      room.pedestals.push(E.createPedestal(randomItemId(ownedItems()), C.CX - 90, C.CY));
      const last = G.floorNum >= C.FLOORS;
      room.pickups.push(E.createPickup('trapdoor', C.CX + 80, C.CY, { pop: false }));
      if (last) setMessage('¡Trampilla final!', 2.4);
    } else if (room.type === 'normal') {
      const hurt = G.players.some((p) => p.hp <= p.maxHp * 0.45);
      if (hurt || Math.random() < 0.45) {
        const kind = (hurt && Math.random() < 0.75) ? 'heart' : (Math.random() < 0.5 ? 'heart' : 'coin');
        room.pickups.push(E.createPickup(kind, C.CX, C.CY, { pop: true }));
      }
    }

    // revivir jugadores caídos al limpiar la sala
    let revived = false;
    for (const p of G.players) {
      if (p.dead) {
        p.dead = false;
        p.hp = Math.max(2, Math.floor(p.maxHp / 4));
        p.invuln = 2;
        p.x = C.CX;
        p.y = C.CY + 24;
        revived = true;
      }
    }
    if (revived) setMessage('Un jugador ha vuelto a la vida', 2.2);
  }

  function onBossDefeated() {
    // se gestiona en checkRoomCleared
  }

  function nextFloor() {
    if (G.floorNum >= C.FLOORS) {
      G.victory = true;
      G.over = true;
      Sfx.play('win');
      handlers.onEnd && handlers.onEnd('win');
      return;
    }
    G.floorNum++;
    G.seed = (G.seed * 1664525 + 1013904223) >>> 0;
    G.dungeon = Dungeon.generate(G.seed, G.floorNum);
    const start = G.dungeon.rooms[G.dungeon.startKey];
    G.gx = start.gx; G.gy = start.gy;
    G.enemies.length = 0;
    G.bullets.length = 0;
    G.particles.length = 0;
    enterRoom(start);
    placePlayers(null, true);
    for (const p of G.players) {
      p.invuln = 1.5;
      if (!p.dead) p.hp = Math.min(p.maxHp, p.hp + 2);
    }
    G.transition = 0.4;
    bigMsg('PISO ' + G.floorNum, 'Todo se vuelve más peligroso', 3);
    Sfx.play('door');
  }

  // ---------------------------------------------------------
  // Actualización de jugadores
  // ---------------------------------------------------------
  function updatePlayer(p, dt) {
    if (p.invuln > 0) p.invuln -= dt;
    if (p.hurtFlash > 0) p.hurtFlash -= dt;
    if (p.dead) return;

    const inp = p.input || { mx: 0, my: 0, sx: 0, sy: 0, fire: false };
    movePlayer(p, inp, dt);

    p.shootCd -= dt;
    if (inp.fire && (inp.sx || inp.sy) && p.shootCd <= 0) {
      p.shootCd = 1 / p.fireRate;
      playerShoot(p);
    }

    // recoger objetos
    pickupItems(p);
    // puertas
    const dir = checkTransition(p);
    if (dir) goThroughDoor(dir);
  }

  function pickupItems(p) {
    const room = G.room;
    if (room.pickups && room.pickups.length) {
      for (let i = room.pickups.length - 1; i >= 0; i--) {
        const k = room.pickups[i];
        if (Utils.dist(p.x, p.y, k.x, k.y) > p.r + k.r + 4) continue;
        if (k.type === 'trapdoor') {
          room.pickups.splice(i, 1);
          nextFloor();
          return;
        }
        room.pickups.splice(i, 1);
        applyPickup(p, k.type);
      }
    }

    if (room.pedestals && room.pedestals.length) {
      for (let i = room.pedestals.length - 1; i >= 0; i--) {
        const ped = room.pedestals[i];
        if (ped.taken) continue;
        if (Utils.dist(p.x, p.y, ped.x, ped.y) > p.r + 24) continue;
        if (ped.price > 0) {
          if (p.coins >= ped.price) {
            p.coins -= ped.price;
            giveItem(p, ped.itemId);
            ped.taken = true;
            Sfx.play('pickup');
            setMessage(p.name + ' compró ' + E.itemById(ped.itemId).name, 2);
          } else if (!p._coinWarn || G.time - p._coinWarn > 1.5) {
            p._coinWarn = G.time;
            setMessage('Necesitas ' + ped.price + ' monedas', 1.6);
          }
        } else {
          giveItem(p, ped.itemId);
          ped.taken = true;
        }
      }
    }
  }

  function applyPickup(p, type) {
    if (type === 'heart') {
      if (p.hp < p.maxHp) { p.hp = Math.min(p.maxHp, p.hp + 2); Sfx.play('heart'); }
      else { p.coins += 1; Sfx.play('coin'); }
    } else if (type === 'halfheart') {
      if (p.hp < p.maxHp) { p.hp = Math.min(p.maxHp, p.hp + 1); Sfx.play('heart'); }
      else { p.coins += 1; Sfx.play('coin'); }
    } else if (type === 'coin') {
      p.coins += 1;
      Sfx.play('coin');
    } else if (type === 'key') {
      p.keys += 1;
      Sfx.play('coin');
    }
  }

  function giveItem(p, itemId) {
    const item = E.itemById(itemId);
    p.items.push(itemId);
    item.apply(p);
    Sfx.play('pickup');
    addShake(0.18);
    setMessage('¡' + item.name + '! ' + item.desc, 3);
    G.fxQueue.push({ k: 'boom', x: p.x, y: p.y, c: item.color, n: 18 });
  }

  // ---------------------------------------------------------
  // Enemigos
  // ---------------------------------------------------------
  function moveEntity(e, dx, dy) {
    e.x += dx;
    e.y += dy;
    resolveObstacles(e);
  }

  function updateEnemy(e, dt) {
    e.anim += dt;
    if (e.flash > 0) e.flash -= dt;
    if (e.spawnT > 0) { e.spawnT -= dt; return; }

    const target = nearestPlayer(e.x, e.y);
    if (!target) { clampEnemyToRoom(e); return; }

    const dx = target.x - e.x, dy = target.y - e.y;
    const d = Math.hypot(dx, dy) || 0.001;
    e.dir.x = dx / d; e.dir.y = dy / d;

    switch (e.ai) {
      case 'chase': {
        const wob = e.wobble ? Math.sin(e.anim * 4.5) * 0.55 : 0;
        const a = Math.atan2(dy, dx) + wob;
        moveEntity(e, Math.cos(a) * e.speed * dt, Math.sin(a) * e.speed * dt);
        break;
      }
      case 'charge': {
        if (e.chargeT > 0) {
          e.chargeT -= dt;
          moveEntity(e, e.dir.x * e.speed * 1.85 * dt, e.dir.y * e.speed * 1.85 * dt);
        } else {
          e.chargeCd -= dt;
          if (e.chargeCd <= 0 && d < 340) {
            e.chargeT = 0.5;
            e.chargeCd = 1.1 + Math.random() * 0.9;
          } else {
            moveEntity(e, e.dir.x * e.speed * 0.22 * dt, e.dir.y * e.speed * 0.22 * dt);
          }
        }
        break;
      }
      case 'hop': {
        e.hopCd -= dt;
        if (e.hopCd <= 0) {
          e.hopCd = 0.7 + Math.random() * 0.5;
          const a = Math.atan2(dy, dx) + (Math.random() - 0.5) * 0.7;
          e.hopV.x = Math.cos(a) * e.speed * 2.3;
          e.hopV.y = Math.sin(a) * e.speed * 2.3;
        }
        moveEntity(e, e.hopV.x * dt, e.hopV.y * dt);
        const damp = Math.pow(0.03, dt);
        e.hopV.x *= damp; e.hopV.y *= damp;
        break;
      }
      case 'shoot': {
        const want = 165;
        const push = d > want + 40 ? 1 : (d < want - 40 ? -1 : 0);
        const px = -dy / d, py = dx / d;
        const strafe = Math.sin(e.anim * 1.1) * 0.32;
        moveEntity(e, (e.dir.x * push + px * strafe) * e.speed * dt, (e.dir.y * push + py * strafe) * e.speed * dt);
        e.shotCd -= dt;
        if (e.shotCd <= 0 && d < 420) { e.shotCd = e.shotRate; enemyShoot(e, target); }
        break;
      }
      case 'boss': bossAI(e, dt, target, d); break;
      default: break;
    }

    clampEnemyToRoom(e);
  }

  function bossAI(e, dt, target, d) {
    const enraged = e.hp < e.maxHp * 0.5;
    e.bossPhase = enraged ? 1 : 0;

    if (e.bossBurst > 0) {
      e.bossBurst -= dt;
      e.bossShootCd = (e.bossShootCd || 0) - dt;
      if (e.bossShootCd <= 0) {
        e.bossShootCd = 0.11;
        const n = enraged ? 12 : 8;
        const off = e.anim * 1.4;
        for (let i = 0; i < n; i++) {
          const a = off + (i * Math.PI * 2) / n;
          G.bullets.push(E.createBullet(
            e.x + Math.cos(a) * e.r, e.y + Math.sin(a) * e.r,
            Math.cos(a) * e.shotSpeed, Math.sin(a) * e.shotSpeed,
            { friendly: false, dmg: 2, r: 7, color: '#ff7a9c', life: 2.6 }
          ));
        }
        addShake(0.18);
      }
      moveEntity(e, e.dir.x * e.speed * 0.3 * dt, e.dir.y * e.speed * 0.3 * dt);
      if (e.bossBurst <= 0) e.bossTimer = enraged ? 1.4 : 2.2;
    } else if (e.bossTimer <= 0) {
      e.bossBurst = 1.05;
      e.bossShootCd = 0;
      Sfx.play('hit');
    } else {
      e.bossTimer -= dt;
      moveEntity(e, e.dir.x * e.speed * dt, e.dir.y * e.speed * dt);
      e.shotCd -= dt;
      if (e.shotCd <= 0 && d < 520) {
        e.shotCd = enraged ? 1.1 : 1.8;
        const a = Math.atan2(target.y - e.y, target.x - e.x);
        for (let k = -1; k <= 1; k++) {
          const aa = a + k * 0.24;
          G.bullets.push(E.createBullet(
            e.x + Math.cos(aa) * e.r, e.y + Math.sin(aa) * e.r,
            Math.cos(aa) * e.shotSpeed, Math.sin(aa) * e.shotSpeed,
            { friendly: false, dmg: 2, r: 7, color: '#ff9a5c', life: 2.4 }
          ));
        }
      }
    }
  }

  function separateEnemies() {
    const n = G.enemies.length;
    for (let i = 0; i < n; i++) {
      const a = G.enemies[i];
      for (let j = i + 1; j < n; j++) {
        const b = G.enemies[j];
        const dx = b.x - a.x, dy = b.y - a.y;
        const min = a.r + b.r;
        const d2 = dx * dx + dy * dy;
        if (d2 > 0.01 && d2 < min * min) {
          const d = Math.sqrt(d2);
          const push = (min - d) * 0.5;
          const nx = dx / d, ny = dy / d;
          a.x -= nx * push; a.y -= ny * push;
          b.x += nx * push; b.y += ny * push;
        }
      }
    }
  }

  // ---------------------------------------------------------
  // Balas
  // ---------------------------------------------------------
  function updateBullets(dt) {
    const obs = G.room.obstacles;
    for (let i = G.bullets.length - 1; i >= 0; i--) {
      const b = G.bullets[i];
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      b.life -= dt;
      b.spin += dt * 8;

      let dead = b.life <= 0;

      if (!dead && (b.x < C.INNER_L - 40 || b.x > C.INNER_R + 40 || b.y < C.INNER_T - 40 || b.y > C.INNER_B + 40)) {
        dead = true;
      }

      // obstáculos
      if (!dead) {
        for (let o = 0; o < obs.length; o++) {
          const ob = obs[o];
          if (Utils.dist2(b.x, b.y, ob.x, ob.y) < (ob.r + b.r) * (ob.r + b.r)) { dead = true; break; }
        }
        if (dead) G.fxQueue.push({ k: 'puff', x: b.x, y: b.y, c: b.color, n: 4 });
      }

      if (!dead && b.friendly) {
        for (let ei = 0; ei < G.enemies.length; ei++) {
          const e = G.enemies[ei];
          if (b.hits.indexOf(e.id) >= 0) continue;
          if (Utils.dist2(b.x, b.y, e.x, e.y) < (e.r + b.r) * (e.r + b.r)) {
            damageEnemy(e, b.dmg, b.x, b.y);
            if (b.pierce) { b.hits.push(e.id); }
            else { dead = true; }
            break;
          }
        }
      } else if (!dead && !b.friendly) {
        for (let pi = 0; pi < G.players.length; pi++) {
          const p = G.players[pi];
          if (p.dead) continue;
          if (Utils.dist2(b.x, b.y, p.x, p.y) < (p.r + b.r) * (p.r + b.r)) {
            hurtPlayer(p, b.dmg, b.x, b.y);
            dead = true;
            break;
          }
        }
      }

      if (dead) G.bullets.splice(i, 1);
    }
  }

  function contactsPlayers(dt) {
    for (const e of G.enemies) {
      if (e.spawnT > 0) continue;
      for (const p of G.players) {
        if (p.dead) continue;
        if (Utils.dist2(e.x, e.y, p.x, p.y) < (e.r + p.r) * (e.r + p.r)) {
          hurtPlayer(p, e.dmg, e.x, e.y);
        }
      }
    }
  }

  // ---------------------------------------------------------
  // Efectos locales
  // ---------------------------------------------------------
  function applyFx(list) {
    for (const f of list || []) {
      if (f.k === 'puff') E.spawnParticles(G.particles, f.x, f.y, f.n || 4, f.c || '#fff', { life: 0.3, speed: 120 });
      else if (f.k === 'boom') {
        E.spawnParticles(G.particles, f.x, f.y, f.n || 10, f.c || '#fff', { life: 0.55, speed: 230 });
      }
    }
  }

  function updateParticles(dt) {
    for (let i = G.particles.length - 1; i >= 0; i--) {
      const p = G.particles[i];
      p.life -= dt;
      if (p.life <= 0) { G.particles.splice(i, 1); continue; }
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      const d = Math.pow(0.12, dt);
      p.vx *= d; p.vy *= d;
    }
  }

  function updateTimers(dt) {
    if (G.shake > 0) G.shake = Math.max(0, G.shake - dt * 2.6);
    if (G.transition > 0) G.transition = Math.max(0, G.transition - dt * 2.8);
    if (G.messageTimer > 0) G.messageTimer -= dt;
    if (G.hintTimer > 0) G.hintTimer -= dt;
    if (G.bigMessage) {
      G.bigMessage.t -= dt;
      if (G.bigMessage.t <= 0) G.bigMessage = null;
    }
  }

  // ---------------------------------------------------------
  // Paso de simulación (local y anfitrión)
  // ---------------------------------------------------------
  function simStep(dt) {
    G.time += dt;

    // entradas de los jugadores
    for (const p of G.players) {
      if (p.local) {
        p.input = Input.poll(p.scheme);
      } else {
        p.input = G.remoteInputs[p.id] || { mx: 0, my: 0, sx: 0, sy: 0, fire: false };
      }
    }

    for (const p of G.players) updatePlayer(p, dt);
    updateBullets(dt);

    for (const e of G.enemies) updateEnemy(e, dt);
    separateEnemies();
    for (const e of G.enemies) clampEnemyToRoom(e);

    contactsPlayers(dt);
    checkRoomCleared();

    applyFx(G.fxQueue);
    G.fxSend = G.fxSend.concat(G.fxQueue);
    G.fxQueue.length = 0;
    updateParticles(dt);
    updateTimers(dt);

    // fin de partida
    if (!G.over && alivePlayers().length === 0) {
      G.over = true;
      Sfx.play('lose');
      handlers.onEnd && handlers.onEnd('lose');
    }

    // red: difundir estado
    if (G.mode === 'host') {
      G.sendAccum += dt;
      if (G.sendAccum >= SEND_HZ) {
        G.sendAccum = 0;
        Net.broadcast({ t: 'state', s: serialState() });
      }
    }
  }

  // ---------------------------------------------------------
  // Paso del cliente
  // ---------------------------------------------------------
  function clientStep(dt) {
    G.renderClock += dt;
    G.time = G.renderClock;

    // limpiar búfer antiguo
    while (G.buffer.length > 2 && G.buffer[0].rt < G.renderClock - 1.6) G.buffer.shift();

    // entrada propia
    const inp = Input.poll('p1');
    G.inputAccum += dt;
    if (G.inputAccum >= INPUT_HZ) {
      G.inputAccum = 0;
      Net.sendToHost({ t: 'input', i: [inp.mx, inp.my, inp.sx, inp.sy, inp.fire ? 1 : 0] });
    }

    // predicción local
    const lp = G.localPlayer;
    if (lp && !lp.dead && G.room) {
      movePlayer(lp, inp, dt);
      if (lp.srvX != null) {
        const ex = lp.srvX - lp.x, ey = lp.srvY - lp.y;
        const dist = Math.hypot(ex, ey);
        if (dist > 110) { lp.x = lp.srvX; lp.y = lp.srvY; }
        else {
          const k = 1 - Math.exp(-10 * dt);
          lp.x += ex * k; lp.y += ey * k;
        }
      }
      // sonido local de disparo (los proyectiles los genera el anfitrión)
      lp.shootCd = (lp.shootCd || 0) - dt;
      if (inp.fire && (inp.sx || inp.sy) && lp.shootCd <= 0) {
        lp.shootCd = 1 / (lp.fireRate || 2.4);
        Sfx.play('shoot');
      }
    }

    updateParticles(dt);
    updateTimers(dt);

    // ping
    G.pingAccum += dt;
    if (G.pingAccum > 1.5) {
      G.pingAccum = 0;
      Net.sendToHost({ t: 'ping', ts: Date.now() });
    }
  }

  // ---------------------------------------------------------
  // Serialización de estado
  // ---------------------------------------------------------
  function pser(p) {
    return [
      p.id, p.name, p.color,
      r1(p.x), r1(p.y),
      p.hp, p.maxHp,
      r1(p.aim.x), r1(p.aim.y),
      r1(p.face.x), r1(p.face.y),
      r1(p.walkPhase),
      p.dead ? 1 : 0,
      p.invuln > 0 ? 1 : 0,
      p.slot, p.coins, p.items.join(','), p.ping || 0,
    ];
  }

  function eser(e) {
    return [
      e.id, e.type, r1(e.x), r1(e.y), e.hp, e.maxHp, e.r,
      r1(e.anim), r1(e.flash), r1(e.dir.x), r1(e.dir.y), e.isBoss ? 1 : 0,
      r1(e.spawnT || 0),
    ];
  }

  function bser(b) {
    return [b.id, r1(b.x), r1(b.y), Math.round(b.vx), Math.round(b.vy), b.r, b.friendly ? 1 : 0, b.color];
  }

  function kser(k) {
    return [k.id, k.type, r1(k.x), r1(k.y), k.price || 0];
  }

  function dser(d) {
    return [d.id, d.itemId, r1(d.x), r1(d.y), d.taken ? 1 : 0, d.price || 0];
  }

  function serialState() {
    const room = G.room;
    const out = {
      t: r1(G.time),
      f: G.floorNum,
      sd: G.seed,
      x: G.gx, y: G.gy,
      cl: room && room.cleared ? 1 : 0,
      ov: G.over ? 1 : 0,
      vi: G.victory ? 1 : 0,
      p: G.players.map(pser),
      e: G.enemies.map(eser),
      b: G.bullets.map(bser),
      k: (room && room.pickups || []).map(kser),
      d: (room && room.pedestals || []).map(dser),
      fx: G.fxSend,
      kills: G.stats.kills,
    };
    G.fxSend = [];
    return out;
  }

  function deserialState(s) {
    return {
      floorNum: s.f,
      seed: s.sd >>> 0,
      gx: s.x, gy: s.y,
      cleared: !!s.cl,
      over: !!s.ov,
      victory: !!s.vi,
      kills: s.kills || 0,
      players: (s.p || []).map((a) => ({
        kind: 'player',
        id: a[0], name: a[1], color: a[2],
        x: a[3], y: a[4], hp: a[5], maxHp: a[6],
        aim: { x: a[7], y: a[8] },
        face: { x: a[9], y: a[10] },
        walkPhase: a[11],
        dead: !!a[12], invuln: a[13] ? 1 : 0,
        slot: a[14], coins: a[15],
        items: a[16] ? String(a[16]).split(',') : [],
        ping: a[17] || 0,
        r: 15,
      })),
      enemies: (s.e || []).map((a) => ({
        kind: 'enemy', id: a[0], type: a[1], x: a[2], y: a[3],
        hp: a[4], maxHp: a[5], r: a[6], anim: a[7], flash: a[8],
        dir: { x: a[9], y: a[10] }, isBoss: !!a[11], spawnT: a[12] || 0,
        color: (E.ENEMY_TYPES[a[1]] || E.ENEMY_TYPES.fly).color,
      })),
      bullets: (s.b || []).map((a) => ({
        kind: 'bullet', id: a[0], x: a[1], y: a[2], vx: a[3], vy: a[4],
        r: a[5], friendly: !!a[6], color: a[7],
      })),
      pickups: (s.k || []).map((a) => ({
        kind: 'pickup', id: a[0], type: a[1], x: a[2], y: a[3], r: a[1] === 'trapdoor' ? 26 : 13,
        price: a[4], bob: 0,
      })),
      pedestals: (s.d || []).map((a) => ({
        kind: 'pedestal', id: a[0], itemId: a[1], x: a[2], y: a[3], taken: !!a[4], price: a[5], bob: 0,
      })),
      fx: s.fx || [],
    };
  }

  function buildMaps(data) {
    const map = (arr) => {
      const m = new Map();
      for (const e of arr) m.set(e.id, e);
      return m;
    };
    return {
      players: map(data.players),
      enemies: map(data.enemies),
      bullets: map(data.bullets),
      pickups: map(data.pickups),
      pedestals: map(data.pedestals),
    };
  }

  function blend(curArr, prevMap, alpha) {
    const out = new Array(curArr.length);
    for (let i = 0; i < curArr.length; i++) {
      const c = curArr[i];
      const prev = prevMap ? prevMap.get(c.id) : null;
      if (prev) {
        const e = Object.assign({}, c);
        e.x = Utils.lerp(prev.x, c.x, alpha);
        e.y = Utils.lerp(prev.y, c.y, alpha);
        out[i] = e;
      } else {
        out[i] = c;
      }
    }
    return out;
  }

  function applyState(s) {
    if (G.mode !== 'client') return;
    const data = deserialState(s);
    G.awaitingState = false;

    // cambio de semilla o de piso: regenerar el calabozo idéntico al anfitrión
    if (data.seed !== G.seed || data.floorNum !== G.floorNum) {
      const floorChanged = data.floorNum !== G.floorNum;
      G.seed = data.seed;
      G.floorNum = data.floorNum;
      G.dungeon = Dungeon.generate(G.seed, G.floorNum);
      G._bossAnnounced = false;
      if (floorChanged) {
        G.transition = 0.4;
        bigMsg('PISO ' + G.floorNum, '', 2.4);
      }
    }

    const roomChanged = data.gx !== G.gx || data.gy !== G.gy;
    G.gx = data.gx; G.gy = data.gy;
    G.room = Dungeon.get(G.dungeon, G.gx, G.gy);

    if (G.room) {
      G.room.visited = true;
      G.room.cleared = data.cleared;
      G.room.pickups = data.pickups;
      G.room.pedestals = data.pedestals;
    }
    if (roomChanged) {
      G.bullets = [];
      G.transition = 0.34;
    }

    // stats
    if (data.kills > G.stats.kills) { G.stats.kills = data.kills; }

    // estado del jugador local
    const mine = data.players.find((p) => p.id === G.localId);
    if (mine) {
      if (!G.localPlayer) G.localPlayer = mine;
      else {
        const px = G.localPlayer.x, py = G.localPlayer.y;
        Object.assign(G.localPlayer, mine);
        G.localPlayer.x = px; G.localPlayer.y = py;
        if (roomChanged || G.localPlayer.srvX == null) {
          G.localPlayer.x = mine.x; G.localPlayer.y = mine.y;
        }
      }
      G.localPlayer.srvX = mine.x;
      G.localPlayer.srvY = mine.y;
      G.localPlayer.r = 15;
    }

    // avisos de muerte / jefe
    if (G.room && G.room.type === 'boss' && !G.room.cleared && !G._bossAnnounced) {
      G._bossAnnounced = true;
      Sfx.play('boss');
      bigMsg('¡JEFE!', '', 2);
    }
    if (G.room && G.room.type !== 'boss') G._bossAnnounced = false;

    applyFx(data.fx);

    G.buffer.push({ rt: G.renderClock, data, maps: buildMaps(data) });
    if (G.buffer.length > 48) G.buffer.shift();

    // fin de partida decretado por el anfitrión
    if (!G.over && (data.over || (data.players.length && data.players.every((p) => p.dead)))) {
      G.over = true;
      G.victory = data.victory;
      Sfx.play(data.victory ? 'win' : 'lose');
      handlers.onEnd && handlers.onEnd(data.victory ? 'win' : 'lose');
    }
  }

  function applyPing(ts) {
    if (G.mode !== 'client') return;
    const rtt = Math.max(0, Date.now() - ts);
    if (G.localPlayer) G.localPlayer.ping = rtt;
    handlers.onPing && handlers.onPing(rtt);
  }

  // ---------------------------------------------------------
  // Vista para el renderizador
  // ---------------------------------------------------------
  function minimapData() {
    if (!G.dungeon) return [];
    const out = [];
    for (const r of G.dungeon.list) {
      if (!r.visited) continue;
      const north = Dungeon.get(G.dungeon, r.gx, r.gy - 1);
      const west = Dungeon.get(G.dungeon, r.gx - 1, r.gy);
      out.push({
        gx: r.gx, gy: r.gy, type: r.type,
        visited: r.visited, cleared: r.cleared,
        doors: r.doors,
        northVisited: !!(north && north.visited),
        westVisited: !!(west && west.visited),
        current: r.gx === G.gx && r.gy === G.gy,
      });
    }
    return out;
  }

  function clientView() {
    const buf = G.buffer;
    let cur = null, prev = null, alpha = 0;

    if (buf.length === 1) { cur = buf[0]; }
    else if (buf.length > 1) {
      const t = G.renderClock - C.RENDER_DELAY;
      let i = buf.length - 1;
      while (i > 0 && buf[i].rt > t) i--;
      const a = buf[i];
      const b = buf[Math.min(i + 1, buf.length - 1)];
      prev = a;
      cur = b;
      alpha = b.rt > a.rt ? Utils.clamp((t - a.rt) / (b.rt - a.rt), 0, 1) : 1;
    }

    if (!cur) {
      return {
        mode: 'client', floorNum: G.floorNum, gx: G.gx, gy: G.gy,
        room: G.room, time: G.renderClock,
        players: [], enemies: [], bullets: [], pickups: [], pedestals: [], particles: G.particles,
        minimap: minimapData(), localId: G.localId,
        message: 'Conectando…', messageTimer: 1, bigMessage: null, hintTimer: 0,
        shake: G.shake, transition: G.transition,
      };
    }

    const pm = prev ? prev.maps : null;
    const players = blend(cur.data.players, pm && pm.players, alpha);
    const enemies = blend(cur.data.enemies, pm && pm.enemies, alpha);
    const bullets = blend(cur.data.bullets, pm && pm.bullets, 1);
    const pickups = cur.data.pickups;
    const pedestals = cur.data.pedestals;

    // sustituir la posición del jugador local por la predicha
    if (G.localPlayer) {
      for (let i = 0; i < players.length; i++) {
        if (players[i].id === G.localId) {
          players[i] = Object.assign({}, players[i], {
            x: G.localPlayer.x, y: G.localPlayer.y,
            face: G.localPlayer.face, aim: G.localPlayer.aim,
            walkPhase: G.localPlayer.walkPhase,
          });
        }
      }
    }

    return {
      mode: 'client',
      floorNum: cur.data.floorNum, gx: cur.data.gx, gy: cur.data.gy,
      room: G.room, time: G.renderClock,
      players, enemies, bullets, pickups, pedestals,
      particles: G.particles,
      minimap: minimapData(), localId: G.localId,
      message: G.message, messageTimer: G.messageTimer,
      bigMessage: G.bigMessage, hintTimer: G.hintTimer,
      shake: G.shake, transition: G.transition,
    };
  }

  function view() {
    if (G.mode === 'client') return clientView();
    return {
      mode: G.mode,
      floorNum: G.floorNum, gx: G.gx, gy: G.gy,
      room: G.room, time: G.renderClock,
      players: G.players,
      enemies: G.enemies,
      bullets: G.bullets,
      pickups: (G.room && G.room.pickups) || [],
      pedestals: (G.room && G.room.pedestals) || [],
      particles: G.particles,
      minimap: minimapData(),
      localId: G.localId,
      message: G.message, messageTimer: G.messageTimer,
      bigMessage: G.bigMessage, hintTimer: G.hintTimer,
      shake: G.shake, transition: G.transition,
    };
  }

  // ---------------------------------------------------------
  // API pública
  // ---------------------------------------------------------
  function start(opts) {
    opts = opts || {};
    G.mode = opts.mode || 'local';
    G.seed = (opts.seed != null ? opts.seed : Utils.makeSeed()) >>> 0;
    G.floorNum = opts.floorNum || 1;
    G.time = 0;
    G.renderClock = 0;
    G.over = false;
    G.victory = false;
    G.paused = false;
    G.running = true;
    G.awaitingState = G.mode === 'client';
    G.stats = { kills: 0, rooms: 0 };
    G.players = [];
    G.enemies = [];
    G.bullets = [];
    G.particles = [];
    G.buffer = [];
    G.fxQueue = [];
    G.fxSend = [];
    G.remoteInputs = Object.create(null);
    G.localPlayers = [];
    G.localPlayer = null;
    G.localId = opts.localId || null;
    G.message = ''; G.messageTimer = 0;
    G.bigMessage = null;
    G.shake = 0; G.transition = 0.5;
    G.hintTimer = 9;
    G._bossAnnounced = false;
    E.resetIds();

    G.dungeon = Dungeon.generate(G.seed, G.floorNum);
    const startRoom = G.dungeon.rooms[G.dungeon.startKey];
    G.gx = startRoom.gx; G.gy = startRoom.gy;
    G.room = null;
    G.enemies.length = 0;

    const lps = opts.localPlayers || [{ id: 'p0', name: 'Jugador 1', color: E.COLORS[0], slot: 0, scheme: 'p1' }];
    lps.forEach((lp, i) => {
      const p = E.createPlayer(lp.id, {
        name: lp.name,
        color: lp.color || E.COLORS[i % E.COLORS.length],
        slot: lp.slot != null ? lp.slot : i,
        scheme: lp.scheme || 'p1',
        local: true,
      });
      G.players.push(p);
      G.localPlayers.push(p.id);
    });
    if (!G.localId) G.localId = G.localPlayers[0] || null;

    // 'host' recibe además los jugadores remotos por red
    if (opts.remotePlayers) {
      for (const rp of opts.remotePlayers) addRemotePlayer(rp.id, rp.name);
    }

    enterRoom(startRoom);
    G.players.forEach((p) => { p.x = C.CX; p.y = C.CY + 22; });
    placePlayers(null, true);
    if (G.mode === 'client') {
      G.localPlayer = null;
      bigMsg('Conectando…', '', 2);
    } else {
      bigMsg('PISO ' + G.floorNum, G.floorNum === 1 ? 'Explora y encuentra al jefe' : 'Más difícil todavía', 2.8);
    }
  }

  function addRemotePlayer(id, name) {
    if (G.players.find((p) => p.id === id)) return null;
    const slot = slotFree();
    const p = E.createPlayer(id, {
      name: name || ('Jugador ' + (G.players.length + 1)),
      color: E.COLORS[slot % E.COLORS.length],
      slot,
      scheme: 'p1',
      local: false,
    });
    p.remote = true;
    p.x = C.CX + (Math.random() - 0.5) * 60;
    p.y = C.CY + 30 + (Math.random() - 0.5) * 30;
    if (G.room) { clampPlayerToRoom(p); resolveObstacles(p); }
    G.players.push(p);
    setMessage(p.name + ' se ha unido', 2.4);
    Sfx.play('join');
    return p;
  }

  function removePlayer(id) {
    const i = G.players.findIndex((p) => p.id === id);
    if (i >= 0) {
      const p = G.players[i];
      G.players.splice(i, 1);
      delete G.remoteInputs[id];
      setMessage(p.name + ' ha salido', 2);
      if (simulating() && G.players.length && alivePlayers().length === 0 && !G.over) {
        G.over = true;
        handlers.onEnd && handlers.onEnd('lose');
      }
    }
  }

  function setRemoteInput(id, arr) {
    G.remoteInputs[id] = {
      mx: arr[0] || 0, my: arr[1] || 0,
      sx: arr[2] || 0, sy: arr[3] || 0,
      fire: !!arr[4],
    };
  }

  function step(dt) {
    if (!G.running || G.paused) return;

    if (G.mode === 'client') { clientStep(dt); return; }

    G.renderClock += dt;

    // partida terminada: seguir enviando estado para que los clientes lo vean
    if (G.over) {
      updateTimers(dt);
      updateParticles(dt);
      if (G.mode === 'host') {
        G.sendAccum += dt;
        if (G.sendAccum >= SEND_HZ) {
          G.sendAccum = 0;
          Net.broadcast({ t: 'state', s: serialState() });
        }
      }
      return;
    }

    simStep(dt);
  }

  function setPaused(v) {
    G.paused = !!v;
    G.sendAccum = 0;
  }

  function stop() {
    G.running = false;
    G.players = [];
    G.enemies = [];
    G.bullets = [];
    G.particles = [];
    G.buffer = [];
  }

  global.Game = {
    G, start, step, stop, view, setPaused,
    addRemotePlayer, removePlayer, setRemoteInput,
    applyState, applyPing, serialState,
    setHandlers(h) { handlers = h || {}; },
    get simulating() { return simulating(); },
  };
})(typeof window !== 'undefined' ? window : globalThis);
