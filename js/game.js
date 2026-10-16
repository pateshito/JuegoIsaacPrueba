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

  // Número finito garantizado (evita que un NaN procedente de la red o de un
  // cálculo inesperado se propague a la simulación y al renderizado).
  const num = (v, d) => (typeof v === 'number' && isFinite(v) ? v : (d === undefined ? 0 : d));
  const n1 = (v, d) => r1(num(v, d));

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
    // ---- mejoras y recursos COMPARTIDOS por todo el equipo ----
    items: [],           // lista compartida de objetos (todos la comparten)
    coins: 0,            // monedero común
    keys: 0,             // llavero común
    theme: null,         // tema visual/diseño del piso
    revealed: false,     // el mapa del piso está revelado (habilidad de Caín)
    eventFlash: 0,
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
    // Desafío activo (id) y sus modificadores ya resueltos.
    challenge: null,
    modFlags: null,
  };

  let handlers = {};

  const simulating = () => G.mode === 'local' || G.mode === 'host';

  // ---------------------------------------------------------
  // Modificadores de desafío
  // ---------------------------------------------------------
  const modOn = (k) => !!(G.modFlags && G.modFlags[k]);
  const itemSpawnsDisabled = () => !!(G.modFlags && G.modFlags.items === false);

  // Crea un enemigo aplicando el multiplicador de velocidad del desafío.
  function spawnEnemy(type, x, y) {
    const e = E.createEnemy(type, x, y, G.floorNum);
    if (modOn('enemySpeed') && e) e.speed *= (G.modFlags.enemySpeed || 1);
    return e;
  }

  // ---------------------------------------------------------
  // Utilidades internas
  // ---------------------------------------------------------
  const alivePlayers = () => G.players.filter((p) => !p.dead);

  // ---------------------------------------------------------
  // Recursos y mejoras COMPARTIDAS
  // ---------------------------------------------------------
  const isCoop = () => G.players.length > 1;

  function countItem(id) {
    let n = 0;
    for (const it of G.items) if (it === id) n++;
    return n;
  }

  // Reanimaciones disponibles al empezar un piso (solo online):
  // 1 base + una por Vida extra + una por Pluma de fénix.
  function reviveBase() {
    // Solo se conceden reanimaciones en modo online/cooperativo.
    if (!isCoop()) return 0;
    return 1 + countItem('extra_life') + countItem('phoenix');
  }

  // Refresca las reanimaciones por piso. Solo en online/cooperativo.
  function refreshRevives() {
    for (const p of G.players) {
      if (isCoop()) p.revives = Math.max(p.revives, reviveBase());
      else p.revives = 0;
    }
  }

  // El monedero y el llavero son del equipo: se reflejan en cada jugador
  // para que la red y el HUD sigan mostrando lo mismo.
  function syncPool() {
    for (const p of G.players) { p.coins = G.coins; p.keys = G.keys; }
  }

  function addCoins(n) {
    G.coins = Math.max(0, G.coins + (n | 0));
    syncPool();
  }
  function spendCoins(n) {
    if (G.coins < n) return false;
    G.coins -= n;
    syncPool();
    return true;
  }
  function addKeys(n) {
    G.keys = Math.max(0, G.keys + (n | 0));
    syncPool();
  }
  function spendKey() {
    if (G.keys <= 0) return false;
    G.keys--;
    syncPool();
    return true;
  }

  // Aplica un objeto: si el jugador está muerto, no se le aplica.
  // En modo normal (1 jugador) aplica a ese jugador.
  // En cooperativo, los objetos son compartidos entre vivos? Según requisito:
  // "los muertos se quedan sin ese objeto" - si están muertos y otro agarra, solo se le aplica a vivos.
  function giveItemToAll(itemId) {
    G.items.push(itemId);
    for (const p of G.players) {
      if (!p.dead) {
        if (p.items.indexOf(itemId) < 0) {
          p.items.push(itemId);
        }
        E.recomputeStats(p);
      }
      // dead players do not receive the item
    }
    // conceder reanimaciones si aplica (solo online)
    if ((itemId === 'extra_life' || itemId === 'phoenix') && isCoop()) {
      for (const p of G.players) {
        if (!p.dead) p.revives = Math.max(p.revives, reviveBase());
      }
    }
  }

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

  // Elige un objeto de la pool indicada ('treasure' | 'shop' | 'boss'),
  // ponderando por tier y evitando repetir los que ya tiene el equipo.
  function pickPoolItem(pool, avoid) {
    return E.pickItem(pool, avoid);
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

  // Una puerta con llave bloquea el paso aunque la sala esté despejada.
  const doorLocked = (room, dir) => !!(room && room.locks && room.locks[dir]);
  const doorPassable = (room, dir) => !!room && doorOpen(room) && !!room.doors[dir] && !doorLocked(room, dir);

  // Limita al jugador dentro de la sala (permite asomarse a las puertas abiertas)
  function clampPlayerToRoom(p) {
    const room = G.room;
    let minX = C.INNER_L + p.r, maxX = C.INNER_R - p.r;
    let minY = C.INNER_T + p.r, maxY = C.INNER_B - p.r;
    const slack = C.DOOR_HALF - p.r - 2;

    if (doorPassable(room, 'left') && Math.abs(p.y - C.CY) < slack) minX = C.ROOM_X - 30;
    if (doorPassable(room, 'right') && Math.abs(p.y - C.CY) < slack) maxX = C.ROOM_X + C.ROOM_W + 30;
    if (doorPassable(room, 'up') && Math.abs(p.x - C.CX) < slack) minY = C.ROOM_Y - 30;
    if (doorPassable(room, 'down') && Math.abs(p.x - C.CX) < slack) maxY = C.ROOM_Y + C.ROOM_H + 30;

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
    // saneado defensivo (una posición no finita nunca debe propagarse)
    if (!p.face) p.face = { x: 0, y: 1 };
    if (!p.aim) p.aim = { x: 0, y: 1 };
    if (!isFinite(p.x) || !isFinite(p.y)) { p.x = C.CX; p.y = C.CY; }
    if (!isFinite(p.walkPhase)) p.walkPhase = 0;
    if (!isFinite(p.aim.x)) p.aim.x = 0;
    if (!isFinite(p.aim.y)) p.aim.y = 1;
    const sp = num(p.speed, 192) + ((p.buff && p.buff.spdT > 0) ? p.buff.spd : 0);
    p.vx = (input.mx || 0) * sp;
    p.vy = (input.my || 0) * sp;
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    clampPlayerToRoom(p);
    if (!p.flying) resolveObstacles(p);

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
  function playerShoot(p, charged, noBurst) {
    const pr = E.profile(p);
    const base = Math.atan2(p.aim.y, p.aim.x);
    const n = 1 + p.extraShots;
    const big = !!charged;
    const dmg = p.damage + pr.bonusDamage + ((p.buff && p.buff.dmgT > 0) ? p.buff.dmg : 0);
    for (let i = 0; i < n; i++) {
      const spread = n === 1 ? 0 : (i - (n - 1) / 2) * 0.2;
      const a = base + spread;
      const sp = p.bulletSpeed * (big ? 0.92 : 1);
      G.bullets.push(E.createBullet(
        p.x + Math.cos(a) * 16, p.y + Math.sin(a) * 16,
        Math.cos(a) * sp, Math.sin(a) * sp,
        {
          friendly: true,
          dmg: dmg * (big ? pr.chargeMul : 1),
          r: p.bulletSize * (big ? 1.75 : 1),
          color: big ? '#ffe08a' : '#dff1ff',
          life: p.range * (big ? 1.2 : 1),
          pierce: p.piercing,
          owner: p.id,
          bounce: p.bounce || 0,
          homing: !!p.homing,
          explode: pr.explodeR * (big ? 1.3 : 1),
          chain: pr.chain,
          burn: pr.burn, burnDps: pr.burnDps,
          poison: pr.poison, poisonDps: pr.poisonDps,
          freeze: pr.freezeTime, slowF: pr.slowF,
          cryo: pr.cryo,
          push: pr.push,
          shatter: pr.shatter,
          boomerang: pr.boomerang,
          shrapnel: pr.shrapnel,
        }
      ));
    }
    // Ráfaga doble (Doble intención): programa disparos extra muy seguidos.
    if (!noBurst && pr.doubleTap > 0 && Math.random() < pr.doubleTap) {
      p.burstTimes = (p.burstTimes || []).concat([G.time + 0.1, G.time + 0.2]);
      p.burstCharged = big;
    }
    G.fxQueue.push({ k: 'puff', x: p.x + Math.cos(base) * 18, y: p.y + Math.sin(base) * 18, c: big ? '#ffe08a' : '#cfe8ff', n: big ? 8 : 3 });
    Sfx.play('shoot');
  }

  function enemyShoot(e, target, aim) {
    const tx = aim ? aim.x : target.x;
    const ty = aim ? aim.y : target.y;
    const a = Math.atan2(ty - e.y, tx - e.x);
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
    // Resistencia nerfeada: como mucho 2 puntos y mínimo 1 de daño.
    dmg = Math.max(1, dmg - Math.min(p.armor || 0, 2));

    // Escudo: absorbe un golpe entero y se rompe.
    if (p.shield > 0) {
      p.shield--;
      p.invuln = 1.0;
      p.hurtFlash = 0.25;
      addShake(0.25);
      Sfx.play('hit');
      G.fxQueue.push({ k: 'boom', x: p.x, y: p.y, c: '#8fd3ff', n: 14 });
      setMessage(p.name + ': ¡el escudo aguantó!', 1.6);
      return;
    }

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

    // Sansón: al recibir daño entra en furia (+daño temporal).
    if (p.rageOnHurt) {
      const b = p.buff || (p.buff = { dmg: 0, dmgT: 0, fire: 0, fireT: 0, spd: 0, spdT: 0, fam: 0, famT: 0 });
      b.dmg = Math.max(b.dmg, 1.4);
      b.dmgT = Math.max(b.dmgT, 6);
    }

    // Corona de espinas: devuelve daño a quien te toca.
    const pr = E.profile(p);
    if (pr.thorns > 0) {
      G.fxQueue.push({ k: 'boom', x: p.x, y: p.y, c: '#d8b0c0', n: 10 });
      for (let i = G.enemies.length - 1; i >= 0; i--) {
        const e = G.enemies[i];
        if (e.spawnT > 0) continue;
        if (Math.hypot(e.x - p.x, e.y - p.y) < pr.thornsR + e.r) damageEnemy(e, pr.thorns, e.x, e.y);
      }
    }

    if (p.hp <= 0) {
      // No se reanima al morir. En online, los caídos vuelven al derrotar al
      // jefe del piso (ver onBossDefeated); en solitario, morir acaba la partida.
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
    if (global.Meta) global.Meta.killEnemy();
    // Recarga de la activa por enemigos eliminados (el logro es del equipo).
    for (const pl of G.players) creditAbilityKill(pl, e.isBoss ? 99 : 1);
    Sfx.play('kill');
    addShake(e.isBoss ? 1.0 : 0.16);
    G.fxQueue.push({ k: 'boom', x: e.x, y: e.y, c: e.color, n: e.isBoss ? 40 : 12 });

    // división (enemigos gordos)
    if (e.splits > 0) {
      for (let k = 0; k < e.splits; k++) {
        const a = (k / e.splits) * Math.PI * 2;
        const child = spawnEnemy('fly', e.x + Math.cos(a) * 22, e.y + Math.sin(a) * 22);
        G.enemies.push(child);
      }
    }

    // botín: los enemigos ya NO sueltan objetos. La recompensa llega al
    // despejar la habitación (ver checkRoomCleared / roomClearReward).

    // robo de vida (Colmillo de vampiro): nerfeado, cura medio corazón cada
    // dos enemigos (se acumula).
    for (const p of G.players) {
      const pr = E.profile(p);
      if (pr.lifestealHeal > 0 && !p.dead && p.hp < p.maxHp) {
        p._lifeAcc = (p._lifeAcc || 0) + pr.lifestealHeal * 0.5;
        while (p._lifeAcc >= 1 && p.hp < p.maxHp) {
          p._lifeAcc -= 1;
          p.hp = Math.min(p.maxHp, p.hp + 1);
          G.fxQueue.push({ k: 'puff', x: p.x, y: p.y, c: '#ff8fa8', n: 5 });
        }
      }
    }

    if (e.isBoss) {
      if (global.Meta) global.Meta.bossKilled(e.type);
      onBossDefeated();
    }
  }

  function bestLuck() {
    let l = 0;
    for (const p of G.players) l = Math.max(l, p.luck || 0);
    return l;
  }

  // Deja caer un recogible. Por defecto aparece "bloqueado" ~0.9 s para que
  // no se recoja en el mismo instante en que se genera.
  function dropPickup(type, x, y, lock) {
    if (!G.room.pickups) G.room.pickups = [];
    G.room.pickups.push(E.createPickup(type, x, y, { lock: lock == null ? 0.9 : lock }));
  }

  // Al abrir un cofre, los objetos NO van directos al inventario: aparecen en
  // un pedestal sellado (lock) para que el jugador tenga que acercarse y
  // tomarlos, igual que el botín del jefe.
  function spawnItemPedestal(itemId, x, y, lock) {
    if (!itemId) return;
    if (!G.room.pedestals) G.room.pedestals = [];
    G.room.pedestals.push(E.createPedestal(itemId, x, y, 0, lock == null ? 1 : lock));
  }

  // ---------------------------------------------------------
  // Recompensa al despejar una habitación (sustituye al botín de enemigos).
  // Nerfeada a propósito: la mayoría de salas NO sueltan nada. Solo ~60% deja
  // UN recogible, casi siempre una moneda; corazones y llaves son raros.
  // ---------------------------------------------------------
  function roomClearReward(room) {
    const luck = bestLuck();
    const hurt = G.players.some((p) => !p.dead && p.hp <= p.maxHp * 0.4);

    if (Math.random() < 0.60) {
      const r = Math.random();
      let type;
      if (hurt) type = r < 0.5 ? 'heart' : (r < 0.94 ? 'coin' : 'key');
      else type = r < 0.24 ? 'heart' : (r < 0.93 ? 'coin' : 'key');
      // la suerte empuja un poco hacia objetos útiles (llaves), no hacia monedas
      if (type === 'key' && Math.random() > 0.5 + luck * 0.05) type = 'coin';
      const a = Math.random() * Math.PI * 2;
      const rr = 16 + Math.random() * 34;
      dropPickup(type, C.CX + Math.cos(a) * rr, C.CY + Math.sin(a) * rr);
    }

    maybeChest(room);
    maybeGoldenChest(room);
  }

  // Cofres normales: raros. Casi siempre dan consumibles; rara vez un objeto.
  function maybeChest(room) {
    if (room.type !== 'normal') return;
    if (itemSpawnsDisabled()) return;
    if (Math.random() > 0.07 + bestLuck() * 0.01) return;
    const x = C.CX + (Math.random() < 0.5 ? -78 : 78);
    const y = C.CY - 46;
    if (!room.pickups) room.pickups = [];
    room.pickups.push(E.createPickup('chest', x, y, { keys: 0, pop: false, lock: 0.9 }));
    setMessage('¡Apareció un cofre!', 1.9);
  }

  // Cofres dorados: muy raros. Cuestan una llave y dan botín excelente.
  function maybeGoldenChest(room) {
    if (room.type !== 'normal') return;
    if (itemSpawnsDisabled()) return;
    if (Math.random() > 0.015) return;
    if (!room.pickups) room.pickups = [];
    room.pickups.push(E.createPickup('goldenchest', C.CX, C.CY - 46, { keys: 1, pop: false, lock: 1.1 }));
    bigMsg('✨ COFRE DORADO', 'Necesita una llave 🔑 para abrirse', 2.6);
    Sfx.play('boss');
  }

  // Intenta abrir un cofre. Devuelve true si se abrió (y hay que quitarlo).
  function openChest(p, chest) {
    const cost = chest.keys || 0;
    const golden = chest.type === 'goldenchest';
    if (cost > 0 && G.keys < cost) {
      if (!p._keyWarn || G.time - p._keyWarn > 1.5) {
        p._keyWarn = G.time;
        setMessage('Necesitas ' + cost + ' llave' + (cost > 1 ? 's' : '') + ' 🔑', 1.6);
      }
      return false;
    }
    if (cost > 0) spendKey();
    Sfx.play(cost > 0 ? 'unlock' : 'pickup');
    addShake(0.22);
    G.fxQueue.push({ k: 'boom', x: chest.x, y: chest.y, c: '#ffd166', n: 20 });

    const luck = bestLuck();
    if (golden) {
      // cofre dorado: el mejor botín del juego (objeto garantizado y generoso).
      // Los objetos aparecen en pedestales sellados, no directos al inventario.
      if (!itemSpawnsDisabled()) {
        const firstId = pickPoolItem('treasure', ownedItems());
        spawnItemPedestal(firstId, chest.x, chest.y - 6, 1.1);
        if (Math.random() < 0.5) {
          const secondId = pickPoolItem('treasure', ownedItems().concat(firstId ? [firstId] : []));
          if (secondId) {
            const side = chest.x < C.CX ? 44 : -44;
            spawnItemPedestal(secondId, chest.x + side, chest.y - 6, 1.1);
          }
        }
      }
      const n = 6 + Math.floor(Math.random() * 4);
      for (let i = 0; i < n; i++) {
        dropPickup('coin', chest.x + (Math.random() - 0.5) * 70, chest.y + (Math.random() - 0.5) * 56);
      }
      dropPickup('heart', chest.x + 18, chest.y);
      if (Math.random() < 0.5) dropPickup('key', chest.x - 18, chest.y + 12);
      setMessage('¡Cofre dorado! Objetos en los pedestales', 2.4);
    } else {
      // cofre normal: consumibles y, MUY rara vez, un objeto (que aparece en un
      // pedestal sellado, no directo al inventario).
      const n = 2 + Math.floor(Math.random() * 3);
      for (let i = 0; i < n; i++) {
        dropPickup('coin', chest.x + (Math.random() - 0.5) * 60, chest.y + (Math.random() - 0.5) * 48);
      }
      if (Math.random() < 0.3) dropPickup('heart', chest.x + 16, chest.y);
      if (Math.random() < 0.12 + luck * 0.02) dropPickup('key', chest.x - 16, chest.y + 10);
      if (!itemSpawnsDisabled() && Math.random() < 0.05) {
        spawnItemPedestal(pickPoolItem('treasure', ownedItems()), chest.x, chest.y - 6, 1);
        setMessage('¡Cofre abierto! ¡Apareció un objeto!', 2.2);
      } else {
        setMessage('¡Cofre abierto!', 1.6);
      }
    }
    return true;
  }

  // ---------------------------------------------------------
  // Salas
  // ---------------------------------------------------------
  function findSpawnPos(rng, avoidCenter, entrySide) {
    const pad = 46;
    const band = 120;
    for (let i = 0; i < 60; i++) {
      const x = C.INNER_L + pad + rng() * (C.INNER_R - C.INNER_L - pad * 2);
      const y = C.INNER_T + pad + rng() * (C.INNER_B - C.INNER_T - pad * 2);
      if (avoidCenter && Utils.dist(x, y, C.CX, C.CY) < 110) continue;
      // no aparecer pegado a la puerta por la que entran los jugadores
      if (entrySide === 'left' && x < C.INNER_L + band) continue;
      if (entrySide === 'right' && x > C.INNER_R - band) continue;
      if (entrySide === 'up' && y < C.INNER_T + band) continue;
      if (entrySide === 'down' && y > C.INNER_B - band) continue;
      let ok = true;
      for (const o of G.room.obstacles) {
        if (Utils.dist(x, y, o.x, o.y) < o.r + 26) { ok = false; break; }
      }
      if (ok) return { x, y };
    }
    // último recurso: lejos del lado de entrada
    return {
      x: C.CX + (entrySide === 'left' ? 100 : entrySide === 'right' ? -100 : 0),
      y: C.CY + (entrySide === 'up' ? 80 : entrySide === 'down' ? -80 : 0),
    };
  }

  function spawnEnemies(room, entrySide) {
    const rng = Utils.mulberry32(Utils.hash(room.key + '@' + G.seed + '@' + G.floorNum));
    const plan = Dungeon.enemyPlan(room, G.floorNum, G.seed);
    let total = 0;
    for (const entry of plan) {
      total += entry.count;
      for (let i = 0; i < entry.count; i++) {
        let pos;
        const tdef = E.ENEMY_TYPES[entry.type] || {};
        if (tdef.isBoss) {
          pos = { x: C.CX, y: C.INNER_T + 84 };
        } else {
          pos = findSpawnPos(rng, true, entrySide);
        }
        G.enemies.push(spawnEnemy(entry.type, pos.x, pos.y));
      }
    }
    room.enemyCount = total;
    if (plan.length) Sfx.play('door');
  }

  function enterRoom(room, entrySide) {
    G.room = room;
    room.visited = true;
    if (!room.pickups) room.pickups = [];
    if (!room.pedestals) room.pedestals = [];
    if (!room.locks) room.locks = { up: false, down: false, left: false, right: false };

    if (!simulating()) return;

    if (!room.spawned) {
      room.spawned = true;
      if (room.type === 'treasure') {
        if (!itemSpawnsDisabled()) {
          room.pedestals.push(E.createPedestal(pickPoolItem('treasure', ownedItems()), C.CX, C.CY, 0, 0.9));
          // las salas del tesoro traen además un cofre gratis
          room.pickups.push(E.createPickup('chest', C.CX + 120, C.CY, { keys: 0, pop: false, lock: 0.9 }));
        }
      } else if (room.type === 'shop') {
        if (!itemSpawnsDisabled()) {
          const firstId = pickPoolItem('shop', ownedItems());
          room.pedestals.push(E.createPedestal(firstId, C.CX - 120, C.CY, 12));
          room.pedestals.push(E.createPedestal(pickPoolItem('shop', ownedItems().concat([firstId])), C.CX, C.CY, 15));
        }
        // consumibles con precio (las llaves ahora sirven para abrir puertas)
        room.pickups.push(E.createPickup('key', C.CX + 120, C.CY - 26, { price: 5, pop: false }));
        room.pickups.push(E.createPickup('heart', C.CX + 120, C.CY + 26, { price: 3, pop: false }));
      } else {
        spawnEnemies(room, entrySide);
      }
      G.stats.rooms++;
    }
  }

  function ownedItems() {
    const s = new Set();
    for (const it of G.items) s.add(it);
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
    const room = G.room;
    if (p.x < C.ROOM_X - 6 && doorPassable(room, 'left')) return 'left';
    if (p.x > C.ROOM_X + C.ROOM_W + 6 && doorPassable(room, 'right')) return 'right';
    if (p.y < C.ROOM_Y - 6 && doorPassable(room, 'up')) return 'up';
    if (p.y > C.ROOM_Y + C.ROOM_H + 6 && doorPassable(room, 'down')) return 'down';
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
    const entry = OPP[dir];               // lado por el que aparecerán los jugadores
    enterRoom(next, entry);
    placePlayers(entry, false);
    // gracia al entrar: nada hace daño unos instantes
    G.players.forEach((p) => { if (!p.dead) p.invuln = Math.max(p.invuln, 1.2); });
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
    if (!room) return;
    if (!room.pickups) room.pickups = [];
    if (!room.pedestals) room.pedestals = [];
    if (room.cleared) return;
    room.cleared = true;
    Sfx.play('clear');
    addShake(0.2);

    if (room.type === 'boss') {
      bigMsg('¡JEFE DERROTADO!', 'Usa la trampilla para bajar', 3);
    } else {
      setMessage('¡Habitación despejada!', 1.8);
    }

    // recompensa del jefe: objeto (pool de jefe) + una llave + trampilla
    if (room.type === 'boss') {
      // Todo aparece "sellado" 2 s: primero sale un contador y luego se puede coger.
      if (!itemSpawnsDisabled()) {
        room.pedestals.push(E.createPedestal(pickPoolItem('boss', ownedItems()), C.CX - 90, C.CY, 0, 2));
      }
      room.pickups.push(E.createPickup('key', C.CX - 90, C.CY + 70, { pop: false, lock: 2 }));
      const last = G.floorNum >= C.FLOORS;
      room.pickups.push(E.createPickup('trapdoor', C.CX + 80, C.CY, { pop: false, lock: 2 }));
      setMessage('Recompensa sellada: espera 2 s', 2);
      if (last) setMessage('¡Trampilla final!', 2.4);    } else if (room.type === 'normal') {
      roomClearReward(room);
    }

    // Limpiar una sala NO resucita a los caídos: en cooperativo cada
    // jugador puede revivir una vez por piso (o muere, en solitario).

    // La habilidad activa solo se recarga eliminando enemigos: limpiar una
    // sala no reduce ninguna recarga.

    // Ángel (pasiva, nerfeada): 50% de curar medio corazón al equipo.
    if (G.players.some((p) => p.allyHeal) && Math.random() < 0.5) {
      for (const p of G.players) {
        if (p.dead || p.hp >= p.maxHp) continue;
        p.hp = Math.min(p.maxHp, p.hp + 1);
        G.fxQueue.push({ k: 'puff', x: p.x, y: p.y, c: '#dff1ff', n: 6 });
      }
    }

    // Tanque Santa (pasiva): al limpiar, 15% de curarse 1 corazón.
    for (const p of G.players) {
      if (p.dead || p.hp >= p.maxHp || !(p.roomHeal > 0)) continue;
      if (Math.random() < p.roomHeal) {
        p.hp = Math.min(p.maxHp, p.hp + 2);
        G.fxQueue.push({ k: 'boom', x: p.x, y: p.y, c: '#ff8fb0', n: 12 });
        setMessage(p.name + ': ¡Vitalidad! +1 corazón', 1.6);
        Sfx.play('heart');
      }
    }

    // Evento raro al azar (muy poco probable): recompensa de progreso.
    maybeRandomEvent();
  }

  // ---------------------------------------------------------
  // Eventos raros: en contadas ocasiones aparece un destello dorado
  // que regala un objeto al equipo.
  // ---------------------------------------------------------
  function maybeRandomEvent() {
    if (Math.random() > 0.02) return;   // ~2% por sala
    const room = G.room;
    if (!room || room.type === 'start') return;
    if (!room.pickups) room.pickups = [];
    if (room.pickups.some((k) => k.type === 'relic')) return;
    room.pickups.push(E.createPickup('relic', C.CX, C.CY, { pop: true }));
    G.eventFlash = 1;
    bigMsg('✨ SUCESO EXTRAÑO', 'Algo brilla en la sala', 2.6);
    Sfx.play('boss');
  }

  // Suceso raro: marca el logro y regala un objeto (salvo en «Manos vacías»).
  function applyRelic(p) {
    if (global.Meta) global.Meta.recordEvent();
    if (!itemSpawnsDisabled()) {
      giveItemToAll(pickPoolItem('treasure', ownedItems()));
      setMessage('¡Suceso extraño! Objeto para el equipo', 3);
    } else {
      setMessage('¡Suceso extraño!', 2.6);
    }
    G.fxQueue.push({ k: 'boom', x: p.x, y: p.y, c: '#ffd166', n: 30 });
    addShake(0.3);
  }

  function onBossDefeated() {
    // Al derrotar un jefe: revive a todos los caídos SOLO en modo online (cooperativo)
    if (G.players.length > 1) {
      const cx = C.CX;
      const cy = C.CY;
      let revived = false;
      for (const p of G.players) {
        // Cada caído vuelve con una reanimación disponible (mínimo una base
        // por piso en online) y a media vida máxima.
        if (p.dead && p.revives > 0) {
          p.revives--;
          p.dead = false;
          p.hp = Math.max(2, Math.floor(p.maxHp / 2));
          p.invuln = 3.0;
          p.reviveTimer = 0;
          p.x = cx;
          p.y = cy;
          if (G.room) {
            clampPlayerToRoom(p);
          }
          G.fxQueue.push({ k: 'boom', x: p.x, y: p.y, c: '#fff2c2', n: 28 });
          revived = true;
        }
      }
      if (revived) {
        setMessage('¡Los caídos han revivido con la mitad de su vida!', 3.2);
        Sfx.play('pickup');
      }
    }
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
    G.theme = (Dungeon.theme ? Dungeon.theme(G.floorNum) : null);
    G.revealed = false;
    const start = G.dungeon.rooms[G.dungeon.startKey];
    G.gx = start.gx; G.gy = start.gy;
    G.enemies.length = 0;
    G.bullets.length = 0;
    G.particles.length = 0;
    enterRoom(start);
    placePlayers(null, true);
    for (const p of G.players) {
      p.invuln = 1.5;
      if (!p.dead) p.hp = Math.min(p.maxHp, p.hp + 1);
      // Reponer reanimaciones por piso (solo cooperativo).
      if (isCoop()) p.revives = Math.max(p.revives, reviveBase());
    }
    if (global.Meta) global.Meta.reachFloor(G.floorNum);
    G.transition = 0.4;
    bigMsg('PISO ' + G.floorNum, G.theme ? G.theme.name : 'Todo se vuelve más peligroso', 3);
    Sfx.play('door');
  }

  // ---------------------------------------------------------
  // Actualización de jugadores
  // ---------------------------------------------------------
  // ¿Hay una puerta con llave delante y estamos empujando hacia ella?
  function lockedDoorNear(p, inp) {
    const room = G.room;
    if (!room || !room.locks) return null;
    const slack = C.DOOR_HALF + 8;
    if (inp.mx < 0 && room.locks.left && p.x < C.INNER_L + 30 && Math.abs(p.y - C.CY) < slack) return 'left';
    if (inp.mx > 0 && room.locks.right && p.x > C.INNER_R - 30 && Math.abs(p.y - C.CY) < slack) return 'right';
    if (inp.my < 0 && room.locks.up && p.y < C.INNER_T + 30 && Math.abs(p.x - C.CX) < slack) return 'up';
    if (inp.my > 0 && room.locks.down && p.y > C.INNER_B - 30 && Math.abs(p.x - C.CX) < slack) return 'down';
    return null;
  }

  function tryUnlockDoor(p, inp) {
    const dir = lockedDoorNear(p, inp);
    if (!dir) return false;
    if (G.keys > 0) {
      spendKey();
      const room = G.room;
      room.locks[dir] = false;
      const d = DELTA[dir];
      const nb = Dungeon.get(G.dungeon, G.gx + d[0], G.gy + d[1]);
      if (nb) { if (!nb.locks) nb.locks = { up: false, down: false, left: false, right: false }; nb.locks[OPP[dir]] = false; }
      Sfx.play('unlock');
      addShake(0.16);
      G.fxQueue.push({ k: 'boom', x: p.x, y: p.y, c: '#ffd166', n: 16 });
      setMessage('¡Puerta desbloqueada! (' + G.keys + ' llaves)', 1.8);
      return true;
    }
    if (!p._keyWarn || G.time - p._keyWarn > 1.5) {
      p._keyWarn = G.time;
      setMessage('Necesitas una llave 🔑', 1.6);
    }
    return false;
  }

  // ---------------------------------------------------------
  // HABILIDADES ACTIVAS
  // Cada personaje tiene una activa con cargas. Se recargan con el tiempo
  // y limpiar una habitación quita 15 s. Cuanto mejor es, más tarda.
  // ---------------------------------------------------------
  function spawnActiveBullet(p, x, y, vx, vy, o) {
    o = o || {};
    G.bullets.push(E.createBullet(x, y, vx, vy, Object.assign({
      friendly: true, owner: p.id, color: '#cfe0ff', dmg: p.damage, r: 7, life: 1.4,
    }, o)));
  }

  // Contexto de las habilidades activas. La partida real usa `gameActiveCtx`
  // (opera sobre `G`); la zona de pruebas inyecta su propio contexto para que
  // las activas funcionen igual sin tocar la partida de verdad.
  const gameActiveCtx = {
    get time() { return G.time; },
    get players() { return G.players; },
    get pedestals() { return (G.room && G.room.pedestals) || []; },
    spawnBullet: spawnActiveBullet,
    explode: explodeAt,
    fx(x, y, c, n) { G.fxQueue.push({ k: 'boom', x, y, c, n }); },
    message: setMessage,
    shake: addShake,
    reveal() { G.revealed = true; },
    rerollItem() { return pickPoolItem('treasure', ownedItems()); },
    spawnCoin(x, y) {
      if (!G.room) return;
      if (!G.room.pickups) G.room.pickups = [];
      G.room.pickups.push(E.createPickup('coin', x, y));
    },
  };

  const ACTIVES = {
    // Ráfaga circular de lágrimas.
    tears(p, ctx) {
      const n = 12;
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2 + ctx.time;
        ctx.spawnBullet(p, p.x + Math.cos(a) * 16, p.y + Math.sin(a) * 16,
          Math.cos(a) * p.bulletSpeed, Math.sin(a) * p.bulletSpeed,
          { dmg: p.damage * 1.1, r: p.bulletSize, color: '#dff1ff', life: p.range });
      }
    },
    // Curación + inmunidad (nerfeada: 1 corazón).
    heal(p, ctx) {
      p.hp = Math.min(p.maxHp, p.hp + 2);
      p.invuln = Math.max(p.invuln, 1.6);
      ctx.fx(p.x, p.y, '#ff8fb0', 24);
    },
    // Revela todo el mapa del piso.
    reveal(p, ctx) { ctx.reveal(); ctx.message('Mapa del piso revelado', 2.2); },
    // Daga perforante devastadora.
    dagger(p, ctx) {
      const a = Math.atan2(p.aim.y, p.aim.x);
      ctx.spawnBullet(p, p.x + Math.cos(a) * 18, p.y + Math.sin(a) * 18,
        Math.cos(a) * p.bulletSpeed * 1.2, Math.sin(a) * p.bulletSpeed * 1.2,
        { dmg: p.damage * 3.2, r: 11, color: '#ffd9e0', life: 1.8, pierce: true, explode: 20 });
    },
    // Explosión de daño en la dirección apuntada.
    blast(p, ctx) {
      const a = Math.atan2(p.aim.y, p.aim.x);
      const x = p.x + Math.cos(a) * 70, y = p.y + Math.sin(a) * 70;
      ctx.explode(x, y, 72, 6 + p.damage, { c: '#ff9a3c', self: false });
      ctx.shake(0.3);
    },
    // Cambia el objeto del pedestal más cercano.
    reroll(p, ctx) {
      let best = null, bd = 1e9;
      for (const d of (ctx.pedestals || [])) {
        if (d.taken) continue;
        const dd = Utils.dist2(p.x, p.y, d.x, d.y);
        if (dd < bd) { bd = dd; best = d; }
      }
      if (!best) { ctx.message('No hay ningún pedestal cerca', 1.6); return; }
      best.itemId = ctx.rerollItem();
      ctx.fx(best.x, best.y, '#a6f28a', 20);
      ctx.message('¡Objeto reciclado!', 2);
    },
    // Intangible: inmune y algo más rápido.
    phase(p, ctx) {
      p.invuln = Math.max(p.invuln, 3);
      const b = p.buff || (p.buff = { dmg: 0, dmgT: 0, fire: 0, fireT: 0, spd: 0, spdT: 0, fam: 0, famT: 0 });
      b.spd = Math.max(b.spd, 70); b.spdT = Math.max(b.spdT, 3);
      ctx.fx(p.x, p.y, '#dff1ff', 22);
    },
    // Doble cadencia temporal.
    overclock(p, ctx) {
      const b = p.buff || (p.buff = { dmg: 0, dmgT: 0, fire: 0, fireT: 0, spd: 0, spdT: 0, fam: 0, famT: 0 });
      b.fire = Math.max(b.fire, p.fireRate + 0.6); b.fireT = Math.max(b.fireT, 4);
      ctx.fx(p.x, p.y, '#ffd166', 20);
    },
    // Sacrifica 1 punto de vida por daño temporal.
    pact(p, ctx) {
      p.hp = Math.max(1, p.hp - 1);
      const b = p.buff || (p.buff = { dmg: 0, dmgT: 0, fire: 0, fireT: 0, spd: 0, spdT: 0, fam: 0, famT: 0 });
      b.dmg = Math.max(b.dmg, 2.6); b.dmgT = Math.max(b.dmgT, 8);
      ctx.fx(p.x, p.y, '#ff6b8a', 22);
    },
    // Escudo para todo el equipo.
    bless(p, ctx) {
      for (const q of ctx.players) { if (!q.dead) q.shield = Math.max(q.shield, 1); }
      ctx.fx(p.x, p.y, '#bfe3ff', 24);
      ctx.message('¡Bendición para el equipo!', 2);
    },
    // Furia: daño y velocidad temporales.
    fury(p, ctx) {
      const b = p.buff || (p.buff = { dmg: 0, dmgT: 0, fire: 0, fireT: 0, spd: 0, spdT: 0, fam: 0, famT: 0 });
      b.dmg = Math.max(b.dmg, 1.8); b.dmgT = Math.max(b.dmgT, 6);
      b.spd = Math.max(b.spd, 50); b.spdT = Math.max(b.spdT, 6);
      ctx.fx(p.x, p.y, '#ff9a3c', 22);
    },
    // Moscas familiares temporales.
    summon(p, ctx) {
      const b = p.buff || (p.buff = { dmg: 0, dmgT: 0, fire: 0, fireT: 0, spd: 0, spdT: 0, fam: 0, famT: 0 });
      b.fam = Math.max(b.fam, 2); b.famT = Math.max(b.famT, 10);
      ctx.fx(p.x, p.y, '#b58cff', 22);
    },
    // Siembra monedas y cura.
    wealth(p, ctx) {
      for (let i = 0; i < 5; i++) {
        const a = Math.random() * Math.PI * 2, r = 30 + Math.random() * 50;
        ctx.spawnCoin(p.x + Math.cos(a) * r, p.y + Math.sin(a) * r);
      }
      ctx.fx(p.x, p.y, '#ffd166', 20);
    },
  };

  // Suma bajas a la activa del jugador. Al alcanzar el requisito, recupera una
  // carga (las activas nunca acumulan más de una). El progreso se comparte en
  // equipo: cualquier baja cuenta para todos los jugadores vivos. Es la ÚNICA
  // forma de recargar una activa (nada de tiempo ni de limpiar salas).
  function creditAbilityKill(p, amount) {
    if (!p || p.dead || !p.abMax || p.abKillReq <= 0) return;
    if (p.abCharges >= p.abMax) { p.abKills = 0; return; }
    p.abKills = num(p.abKills, 0) + amount;
    let guard = 0;
    while (p.abKills >= p.abKillReq && p.abCharges < p.abMax && guard++ < 16) {
      p.abKills -= p.abKillReq;
      p.abCharges++;
    }
    if (p.abCharges >= p.abMax) p.abKills = 0;
  }

  function updateAbility(p, dt) {
    // Las activas NO se recargan con el tiempo: solo eliminando enemigos
    // (ver creditAbilityKill). Esta función se conserva por compatibilidad.
    if (!p.abMax) return;
  }

  function updateBuffs(p, dt) {
    const b = p.buff;
    if (!b) return;
    if (b.dmgT > 0) { b.dmgT -= dt; if (b.dmgT <= 0) { b.dmg = 0; b.dmgT = 0; } }
    if (b.fireT > 0) { b.fireT -= dt; if (b.fireT <= 0) { b.fire = 0; b.fireT = 0; } }
    if (b.spdT > 0) { b.spdT -= dt; if (b.spdT <= 0) { b.spd = 0; b.spdT = 0; } }
    if (b.famT > 0) { b.famT -= dt; if (b.famT <= 0) { b.fam = 0; b.famT = 0; } }
  }

  function tryUseAbility(p, ctx) {
    ctx = ctx || gameActiveCtx;
    if (p.dead || !p.abMax) return false;
    if (p.abCharges <= 0) {
      if (!p._abWarn || ctx.time - p._abWarn > 1.2) {
        p._abWarn = ctx.time;
        const falta = p.abKillReq ? Math.max(0, p.abKillReq - num(p.abKills, 0)) : 0;
        ctx.message('Habilidad recargándose (' + falta + ' bajas)', 1.4);
      }
      return false;
    }
    const ch = E.charOf({ char: p.charId });
    const act = ch && ch.active;
    if (!act) return false;
    p.abCharges--;
    p.abKills = 0;
    const fn = ACTIVES[act.id];
    if (fn) { try { fn(p, ctx); } catch (e) { /* activa sin efecto */ } }
    Sfx.play('pickup');
    ctx.fx(p.x, p.y, '#e8f0ff', 16);
    ctx.message(p.name + ': ' + act.name, 1.6);
    return true;
  }

  function updatePlayer(p, dt) {
    updateBuffs(p, dt);
    updateAbility(p, dt);
    if (p.invuln > 0) p.invuln -= dt;
    if (p.hurtFlash > 0) p.hurtFlash -= dt;
    if (p.dead) return;

    // Desafío «Corazón de cristal»: un único contenedor de vida.
    if (modOn('oneHeart')) {
      if (p.maxHp > 2) p.maxHp = 2;
      if (p.hp > p.maxHp) p.hp = p.maxHp;
    }

    // Robot (pasiva): recupera un escudo con el tiempo si no tiene ninguno.
    if (p.shieldRegen && p.shield < 1) {
      p._shieldAcc = (p._shieldAcc || 0) + dt;
      if (p._shieldAcc >= 18) {
        p._shieldAcc = 0;
        p.shield = Math.min(1, p.shield + 1);
        G.fxQueue.push({ k: 'puff', x: p.x, y: p.y, c: '#8fd3ff', n: 8 });
      }
    }

    // regeneración (Vendaje): acumula medios corazones
    if (p.regen > 0 && p.hp < p.maxHp) {
      p._regenAcc = (p._regenAcc || 0) + p.regen * dt;
      while (p._regenAcc >= 1) {
        p._regenAcc -= 1;
        p.hp = Math.min(p.maxHp, p.hp + 1);
        if (p.hp >= p.maxHp) { p._regenAcc = 0; break; }
      }
    }

    const inp = p.input || { mx: 0, my: 0, sx: 0, sy: 0, fire: false, use: false };
    movePlayer(p, inp, dt);

    // Habilidad activa (tecla propia de cada esquema).
    // Desafío «Manos atadas»: la activa queda deshabilitada.
    if (inp.use && !modOn('noActive')) tryUseAbility(p);

    p.shootCd -= dt;
    p.chargeT = (p.chargeT || 0) + dt;   // tiempo sin disparar (Golpe cargado)
    if (inp.fire && (inp.sx || inp.sy) && p.shootCd <= 0) {
      const pr = E.profile(p);
      const charged = pr.charger && p.chargeT >= pr.chargeTime;
      const fr = Math.max(0.4, p.fireRate + ((p.buff && p.buff.fireT > 0) ? p.buff.fire : 0));
      p.shootCd = 1 / fr;
      p.chargeT = 0;
      playerShoot(p, charged);
    }

    // ráfaga doble pendiente
    if (p.burstTimes && p.burstTimes.length) {
      p.burstTimes = p.burstTimes.filter((t) => {
        if (G.time >= t) { playerShoot(p, p.burstCharged, true); return false; }
        return true;
      });
    }

    // imán de monedas
    updateMagnet(p, dt);

    // recoger objetos
    pickupItems(p);
    // puertas con llave
    tryUnlockDoor(p, inp);
    // puertas
    const dir = checkTransition(p);
    if (dir) goThroughDoor(dir);
  }

  function pickupItems(p) {
    const room = G.room;
    if (room.pickups && room.pickups.length) {
      for (let i = room.pickups.length - 1; i >= 0; i--) {
        const k = room.pickups[i];
        if (k.lock > 0) continue;   // aún sellado tras aparecer
        if (Utils.dist(p.x, p.y, k.x, k.y) > p.r + k.r + 9) continue;   // +margen: la hitbox es pequeña
        if (k.type === 'trapdoor') {
          room.pickups.splice(i, 1);
          nextFloor();
          return;
        }
        if (k.type === 'chest' || k.type === 'goldenchest') {
          if (openChest(p, k)) room.pickups.splice(i, 1);
          continue;
        }
        if (k.price > 0) {
          if (G.coins < k.price) {
            if (!p._coinWarn || G.time - p._coinWarn > 1.5) {
              p._coinWarn = G.time;
              setMessage('Necesitas ' + k.price + ' monedas (compartidas)', 1.6);
            }
            continue;
          }
          spendCoins(k.price);
          room.pickups.splice(i, 1);
          applyPickup(p, k.type);
          setMessage(p.name + ' compró por ' + k.price + ' monedas', 1.8);
        } else {
          room.pickups.splice(i, 1);
          applyPickup(p, k.type);
        }
      }
    }

    if (room.pedestals && room.pedestals.length) {
      for (let i = room.pedestals.length - 1; i >= 0; i--) {
        const ped = room.pedestals[i];
        if (ped.taken) continue;
        if (ped.lock > 0) continue;   // aún sellado tras aparecer
        if (Utils.dist(p.x, p.y, ped.x, ped.y) > p.r + 28) continue;
        if (ped.price > 0) {
          if (G.coins >= ped.price) {
            spendCoins(ped.price);
            giveItem(p, ped.itemId);
            ped.taken = true;
            Sfx.play('pickup');
            setMessage(p.name + ' compró ' + E.itemById(ped.itemId).name + ' para todos', 2);
          } else if (!p._coinWarn || G.time - p._coinWarn > 1.5) {
            p._coinWarn = G.time;
            setMessage('Necesitas ' + ped.price + ' monedas (compartidas)', 1.6);
          }
        } else {
          giveItem(p, ped.itemId);
          ped.taken = true;
        }
      }
    }
  }

  function applyPickup(p, type) {
    if (type === 'heart' || type === 'halfheart') {
      // Los corazones son grupales: curan a todo el equipo (nerfeados).
      const amt = 1;
      let healed = false;
      for (const q of G.players) {
        if (q.dead || q.hp >= q.maxHp) continue;
        q.hp = Math.min(q.maxHp, q.hp + amt);
        healed = true;
        G.fxQueue.push({ k: 'puff', x: q.x, y: q.y, c: '#ff8fb0', n: 5 });
      }
      if (healed) Sfx.play('heart');
      else { addCoins(1); Sfx.play('coin'); }
    } else if (type === 'coin') {
      addCoins(1);
      // Mano generosa / Codicia: cada 6 monedas curan medio corazón.
      const pr = E.profile(p);
      if (pr.greedHeal > 0 || p.coinsHeal) {
        p._greedAcc = (p._greedAcc || 0) + 1;
        if (p._greedAcc >= 6) {
          p._greedAcc -= 6;
          for (const q of G.players) {
            if (q.dead || q.hp >= q.maxHp) continue;
            q.hp = Math.min(q.maxHp, q.hp + 1);
          }
          G.fxQueue.push({ k: 'puff', x: p.x, y: p.y, c: '#ffd166', n: 6 });
        }
      }
      Sfx.play('coin');
    } else if (type === 'key') {
      addKeys(1);
      Sfx.play('coin');
    } else if (type === 'relic') {
      applyRelic(p);
    }
  }

  function giveItem(p, itemId) {
    const item = E.itemById(itemId);
    // Las mejoras se aplican a jugadores vivos (no a los muertos)
    G.items.push(itemId);
    for (const q of G.players) {
      if (!q.dead) {
        if (q.items.indexOf(itemId) < 0) {
          q.items.push(itemId);
        }
        E.recomputeStats(q);
      }
    }
    if ((itemId === 'extra_life' || itemId === 'phoenix') && isCoop()) {
      for (const q of G.players) {
        if (!q.dead) q.revives = Math.max(q.revives, reviveBase());
      }
    }
    if (global.Meta) global.Meta.recordItems(G.items.length);
    Sfx.play('pickup');
    addShake(0.18);
    setMessage('¡' + item.name + '! para jugadores vivos · ' + item.desc, 3.2);
    G.fxQueue.push({ k: 'boom', x: p.x, y: p.y, c: item.color, n: 18 });
  }

  // ---------------------------------------------------------
  // Enemigos
  // ---------------------------------------------------------
  function moveEntity(e, dx, dy) {
    e.x += dx;
    e.y += dy;
    if (!e.phase) resolveObstacles(e); // los espectros atraviesan obstáculos
  }

  // Velocidad estimada del objetivo (para que la IA "lea" el movimiento).
  function targetVel(e, target, dt) {
    const vx = (e._tpx == null) ? 0 : (target.x - e._tpx) / Math.max(dt, 1e-3);
    const vy = (e._tpy == null) ? 0 : (target.y - e._tpy) / Math.max(dt, 1e-3);
    e._tpx = target.x; e._tpy = target.y;
    const m = Math.hypot(vx, vy);
    const cap = 420;
    if (m > cap) return { x: (vx / m) * cap, y: (vy / m) * cap };
    return { x: vx, y: vy };
  }

  function updateEnemy(e, dt) {
    const rawDt = dt;
    e.anim += dt;
    if (e.flash > 0) e.flash -= dt;
    if (e.spawnT > 0) { e.spawnT -= dt; return; }

    // Empuje (Vendaval, explosiones): se aplica y se va frenando.
    if (e.knock && (e.knock.x || e.knock.y)) {
      moveEntity(e, e.knock.x * dt, e.knock.y * dt);
      const kd = Math.pow(0.02, dt);
      e.knock.x *= kd; e.knock.y *= kd;
      if (Math.abs(e.knock.x) < 1 && Math.abs(e.knock.y) < 1) { e.knock.x = 0; e.knock.y = 0; }
    }

    // Congelado/ralentizado (hielo): el tiempo del enemigo corre más despacio.
    if (e.slow > 0) {
      e.slow -= dt;
      dt *= (1 - Math.max(0, Math.min(0.85, e.slowF || 0)));
    }

    const target = nearestPlayer(e.x, e.y);
    if (!target) { clampEnemyToRoom(e); return; }

    const dx = target.x - e.x, dy = target.y - e.y;
    const d = Math.hypot(dx, dy) || 0.001;
    e.dir.x = dx / d; e.dir.y = dy / d;

    // Lectura del movimiento del jugador (usada por varias IA).
    const tv = targetVel(e, target, rawDt);
    e._tv = tv;

    switch (e.ai) {
      case 'chase': {
        // Persigue anticipando un poco el movimiento del jugador.
        const lead = e.ghostly ? 0.16 : 0.1;
        const tx = target.x + tv.x * lead, ty = target.y + tv.y * lead;
        const wob = e.wobble ? Math.sin(e.anim * 4.5) * 0.55 : 0;
        const a = Math.atan2(ty - e.y, tx - e.x) + wob;
        moveEntity(e, Math.cos(a) * e.speed * dt, Math.sin(a) * e.speed * dt);
        break;
      }
      case 'charge': {
        // Embestida con aviso (se queda quieto apuntando) y posterior
        // recuperación: si falla, queda vulnerable un instante.
        if (e.chargeWind > 0) {
          e.chargeWind -= dt;
          if (e.chargeWind <= 0) {
            // bloquea dirección hacia donde estará el jugador
            const lead = Math.min(0.35, d / (e.speed * 1.85 || 1));
            const a = Math.atan2(target.y + tv.y * lead - e.y, target.x + tv.x * lead - e.x);
            e.dir.x = Math.cos(a); e.dir.y = Math.sin(a);
            e.chargeT = 0.5;
          }
        } else if (e.chargeT > 0) {
          e.chargeT -= dt;
          moveEntity(e, e.dir.x * e.speed * 1.85 * dt, e.dir.y * e.speed * 1.85 * dt);
          if (e.chargeT <= 0) e.chargeRecover = 0.45;
        } else if (e.chargeRecover > 0) {
          e.chargeRecover -= dt; // aturdido
        } else {
          e.chargeCd -= dt;
          if (e.chargeCd <= 0 && d < 340 && d > 90) {
            e.chargeWind = 0.32;
            e.chargeCd = 1.4 + Math.random() * 1.1;
            Sfx.play('hit');
          } else {
            moveEntity(e, e.dir.x * e.speed * 0.22 * dt, e.dir.y * e.speed * 0.22 * dt);
          }
        }
        break;
      }
      case 'hop': {
        e.hopCd -= dt;
        if (e.hopCd <= 0) {
          e.hopCd = 0.7 + Math.random() * 0.4;
          const lead = Math.min(0.35, d / (e.speed * 2.3 || 1));
          const a = Math.atan2(target.y + tv.y * lead - e.y, target.x + tv.x * lead - e.x)
            + (Math.random() - 0.5) * 0.35;
          e.hopV.x = Math.cos(a) * e.speed * 2.3;
          e.hopV.y = Math.sin(a) * e.speed * 2.3;
        }
        moveEntity(e, e.hopV.x * dt, e.hopV.y * dt);
        const damp = Math.pow(0.03, dt);
        e.hopV.x *= damp; e.hopV.y *= damp;
        break;
      }
      case 'shoot': {
        // Mantiene la distancia, orbita/serpentea y dispara con puntería.
        const want = e.keepDist || 165;
        const push = d > want + 40 ? 1 : (d < want - 40 ? -1 : 0);
        const px = -dy / d, py = dx / d;
        e.strafeDir = e.strafeDir || (Math.random() < 0.5 ? -1 : 1);
        if (Math.random() < 0.012) e.strafeDir *= -1;
        const strafe = e.strafeDir * (d < want ? 0.55 : 0.34);
        moveEntity(e,
          (e.dir.x * push + px * strafe) * e.speed * dt,
          (e.dir.y * push + py * strafe) * e.speed * dt);
        e.shotCd -= dt;
        const range = e.shootRange || 420;
        if (e.shotCd <= 0 && d < range) {
          e.shotCd = e.shotRate;
          const lead = Math.min(0.6, d / (e.shotSpeed || 200));
          enemyShoot(e, target, { x: target.x + tv.x * lead, y: target.y + tv.y * lead });
        }
        break;
      }
      case 'boss': bossAI(e, dt, target, d); break;
      default: break;
    }

    clampEnemyToRoom(e);
  }

  // ---------- Ayudas de disparo de jefes ----------
  function bossShootRing(e, n, speed, opt) {
    opt = opt || {};
    const off = opt.off || 0;
    for (let i = 0; i < n; i++) {
      const a = off + (i * Math.PI * 2) / n;
      G.bullets.push(E.createBullet(
        e.x + Math.cos(a) * e.r, e.y + Math.sin(a) * e.r,
        Math.cos(a) * speed, Math.sin(a) * speed,
        {
          friendly: false, dmg: e.bossDmg || 1,
          r: opt.r != null ? opt.r : 5,
          color: opt.color || '#ff7a9c',
          life: opt.life != null ? opt.life : 2.6,
          bounce: opt.bounce || 0,
        }
      ));
    }
    addShake(0.12);
  }

  function bossAim(e, target, n, spread, speed, opt) {
    opt = opt || {};
    const a = Math.atan2(target.y - e.y, target.x - e.x);
    for (let k = 0; k < n; k++) {
      const aa = a + (k - (n - 1) / 2) * spread;
      G.bullets.push(E.createBullet(
        e.x + Math.cos(aa) * e.r, e.y + Math.sin(aa) * e.r,
        Math.cos(aa) * speed, Math.sin(aa) * speed,
        { friendly: false, dmg: e.bossDmg || 1, r: 5, color: opt.color || '#ff9a5c', life: 2.4, bounce: opt.bounce || 0 }
      ));
    }
  }

  function bossSpiralShot(e, enraged, color) {
    e.bossSpin = (e.bossSpin || 0) + 0.26 * (enraged ? 1.5 : 1);
    const arms = enraged ? 3 : 2;
    for (let i = 0; i < arms; i++) {
      const a = e.bossSpin + (i * Math.PI * 2) / arms;
      G.bullets.push(E.createBullet(
        e.x + Math.cos(a) * e.r, e.y + Math.sin(a) * e.r,
        Math.cos(a) * e.shotSpeed, Math.sin(a) * e.shotSpeed,
        { friendly: false, dmg: e.bossDmg || 1, r: 5, color: color || '#c99cff', life: 2.6 }
      ));
    }
  }

  // Cadencia de jefe: los jefes de pisos profundos atacan más seguido.
  function bcd(e, base) { return base / (e.rateMul || 1); }

  // ---------- Telegrafiado ----------
  // Ningún jefe ataca por sorpresa: antes de cada ataque importante se queda
  // quieto "cargando" y muestra un aviso (aro, línea de mira, abanico, etc.).
  function bossWarn(e, kind, dur, angle) {
    e.warnT = dur;
    e.warnMax = dur;
    e.warnKind = kind;
    e.warnAngle = angle || 0;
    e.hasWarned = true;   // a partir de aquí ya puede hacer sus disparos de apoyo
    Sfx.play('hit');
  }

  // ---------- Patrones de jefe (todos con aviso previo) ----------
  // 1) Monstruo: se hincha (aviso) y suelta anillos expansivos + abanico.
  function bossBurst(e, dt, target, d, enraged) {
    if (e.warnT > 0) {
      e.warnT -= dt;
      moveEntity(e, e.dir.x * e.speed * 0.12 * dt, e.dir.y * e.speed * 0.12 * dt);
      if (e.warnT <= 0) {
        const rings = enraged ? 3 : 2;
        for (let r = 0; r < rings; r++) {
          bossShootRing(e, (enraged ? 22 : 16) + r * 4, e.shotSpeed * (0.9 + r * 0.12),
            { color: '#ff7a9c', off: e.bossSpin + r * 0.3 });
        }
        bossAim(e, target, enraged ? 9 : 6, 0.16, e.shotSpeed * 1.05, { color: '#ffd0e0' });
        e.bossSpin += 0.7;
        addShake(0.22);
        e.warnCd = bcd(e, enraged ? 1.7 : 2.5);
      }
      return;
    }
    moveEntity(e, e.dir.x * e.speed * dt, e.dir.y * e.speed * dt);
    e.warnCd -= dt;
    if (e.warnCd <= 0) bossWarn(e, 'ring', 0.6, 0);
  }

  // 2) Cargador: PRIMERO avisa con una línea de mira larga (sin sorpresas) y
  //    solo entonces embiste en línea recta. Al frenar suelta un anillo.
  function bossCharge(e, dt, target, d, enraged) {
    if (e.warnT > 0) {
      // Mantiene la mira durante la primera parte del aviso; luego la fija.
      if (e.warnT > e.warnMax * 0.4) {
        e.warnAngle = Math.atan2(target.y - e.y, target.x - e.x);
      }
      e.warnT -= dt;
      if (e.warnT <= 0) {
        e.dir.x = Math.cos(e.warnAngle);
        e.dir.y = Math.sin(e.warnAngle);
        e.dashT = enraged ? 0.62 : 0.52;
        addShake(0.25);
      }
      return;
    }
    if (e.dashT > 0) {
      e.dashT -= dt;
      moveEntity(e, e.dir.x * e.speed * 2.6 * dt, e.dir.y * e.speed * 2.6 * dt);
      if (e.dashT <= 0) {
        bossShootRing(e, enraged ? 20 : 14, e.shotSpeed, { color: '#ffca6a' });
        e.warnCd = bcd(e, enraged ? 1.3 : 2.0);
      }
      return;
    }
    moveEntity(e, e.dir.x * e.speed * 0.35 * dt, e.dir.y * e.speed * 0.35 * dt);
    e.shotCd -= dt;
    if (e.hasWarned && e.shotCd <= 0 && d < 520) {
      e.shotCd = bcd(e, enraged ? 1.5 : 2.2);
      bossAim(e, target, enraged ? 7 : 5, 0.2, e.shotSpeed * 0.9, { color: '#ffd27a' });
    }
    e.warnCd -= dt;
    if (e.warnCd <= 0 && d < 560 && d > 70) {
      bossWarn(e, 'line', enraged ? 0.7 : 0.9, Math.atan2(target.y - e.y, target.x - e.x));
    }
  }

  // 3) Devorador: avisa y gira soltando varias espirales de MUCHAS balas.
  function bossSpiral(e, dt, target, d, enraged) {
    if (e.warnT > 0) {
      e.warnT -= dt;
      moveEntity(e, e.dir.x * e.speed * 0.4 * dt, e.dir.y * e.speed * 0.4 * dt);
      if (e.warnT <= 0) e.spiralT = enraged ? 3.2 : 2.4;
      return;
    }
    if (e.spiralT > 0) {
      e.spiralT -= dt;
      e.bossShootCd -= dt;
      const arms = enraged ? 6 : 4;
      if (e.bossShootCd <= 0) {
        e.bossShootCd = bcd(e, 0.1);
        e.bossSpin = (e.bossSpin || 0) + 0.24;
        for (let k = 0; k < arms; k++) {
          const a = e.bossSpin + (k * Math.PI * 2) / arms;
          G.bullets.push(E.createBullet(
            e.x + Math.cos(a) * e.r, e.y + Math.sin(a) * e.r,
            Math.cos(a) * e.shotSpeed * 0.8, Math.sin(a) * e.shotSpeed * 0.8,
            { friendly: false, dmg: e.bossDmg || 1, r: 5, color: '#c99cff', life: 2.6 }
          ));
        }
      }
      moveEntity(e, e.dir.x * e.speed * 0.4 * dt, e.dir.y * e.speed * 0.4 * dt);
      if (e.spiralT <= 0) e.warnCd = bcd(e, enraged ? 1.2 : 1.8);
      return;
    }
    const want = 200;
    const push = d > want + 30 ? 1 : (d < want - 30 ? -1 : 0);
    moveEntity(e, e.dir.x * push * e.speed * 1.4 * dt, e.dir.y * push * e.speed * 1.4 * dt);
    e.warnCd -= dt;
    if (e.warnCd <= 0) bossWarn(e, 'spiral', 0.5, 0);
  }

  // 4) Espectro: avisa (se difumina), desaparece, reaparece en otro punto y
  //    estalla en anillos + abanico apuntado.
  function bossTeleport(e, dt, target, d, enraged) {
    if (e.warnT > 0) {
      e.warnT -= dt;
      moveEntity(e, e.dir.x * e.speed * 0.3 * dt, e.dir.y * e.speed * 0.3 * dt);
      if (e.warnT <= 0) {
        const pad = 92;
        e.x = C.INNER_L + pad + Math.random() * (C.INNER_R - C.INNER_L - pad * 2);
        e.y = C.INNER_T + pad + Math.random() * (C.INNER_B - C.INNER_T - pad * 2);
        G.fxQueue.push({ k: 'boom', x: e.x, y: e.y, c: '#9fd0e6', n: 20 });
        bossShootRing(e, enraged ? 24 : 16, e.shotSpeed * 0.85, { color: '#9fd0e6', off: Math.random() * 2 });
        bossAim(e, target, enraged ? 9 : 6, 0.16, e.shotSpeed, { color: '#bfe3ff' });
        e.warnCd = bcd(e, enraged ? 1.9 : 2.8);
      }
      return;
    }
    moveEntity(e, e.dir.x * e.speed * 0.5 * dt, e.dir.y * e.speed * 0.5 * dt);
    e.shotCd -= dt;
    if (e.hasWarned && e.shotCd <= 0 && d < 480) {
      e.shotCd = bcd(e, enraged ? 1.1 : 1.7);
      bossAim(e, target, enraged ? 7 : 5, 0.18, e.shotSpeed, { color: '#bfe3ff' });
    }
    e.warnCd -= dt;
    if (e.warnCd <= 0) bossWarn(e, 'tele', 0.55, 0);
  }

  // 5) Baboso: se agacha (aviso), salta hacia el jugador y al caer revienta en
  //    dos anillos. Mientras vuela se ve un marcador de aterrizaje.
  function bossHop(e, dt, target, d, enraged) {
    if (e.warnT > 0) {
      if (e.warnKind === 'land') {
        moveEntity(e, e.hopV.x * dt, e.hopV.y * dt);
        const damp = Math.pow(0.06, dt);
        e.hopV.x *= damp; e.hopV.y *= damp;
        e.warnT -= dt;
        if (e.warnT <= 0) {
          bossShootRing(e, enraged ? 24 : 16, e.shotSpeed, { color: '#b0f0c0' });
          bossShootRing(e, enraged ? 16 : 10, e.shotSpeed * 0.6, { color: '#7fd18a', off: 0.2 });
          addShake(0.3);
          G.fxQueue.push({ k: 'boom', x: e.x, y: e.y, c: '#7fd18a', n: 16 });
          e.warnCd = bcd(e, enraged ? 1.4 : 2.1);
        }
      } else { // 'slam': se agacha antes de saltar
        moveEntity(e, e.dir.x * e.speed * 0.1 * dt, e.dir.y * e.speed * 0.1 * dt);
        e.warnT -= dt;
        if (e.warnT <= 0) {
          const a = Math.atan2(target.y - e.y, target.x - e.x);
          e.hopV.x = Math.cos(a) * e.speed * 2.6;
          e.hopV.y = Math.sin(a) * e.speed * 2.6;
          e.warnKind = 'land'; e.warnMax = 0.45; e.warnT = 0.45;
        }
      }
      return;
    }
    moveEntity(e, e.dir.x * e.speed * 0.4 * dt, e.dir.y * e.speed * 0.4 * dt);
    e.shotCd -= dt;
    if (e.hasWarned && e.shotCd <= 0 && d < 460) {
      e.shotCd = bcd(e, enraged ? 1.5 : 2.2);
      bossAim(e, target, enraged ? 5 : 3, 0.22, e.shotSpeed * 0.8, { color: '#b0f0c0' });
    }
    e.warnCd -= dt;
    if (e.warnCd <= 0) bossWarn(e, 'slam', 0.55, 0);
  }

  // 6) Serafín: avisa abriendo las alas y lanza un abanico ancho de plumas
  //    explosivas (cada una estalla en un anillo de balas).
  function bossFeather(e, dt, target, d, enraged) {
    if (e.warnT > 0) {
      e.warnAngle = Math.atan2(target.y - e.y, target.x - e.x);
      e.warnT -= dt;
      moveEntity(e, e.dir.x * e.speed * 0.2 * dt, e.dir.y * e.speed * 0.2 * dt);
      if (e.warnT <= 0) {
        const n = enraged ? 13 : 9;
        for (let k = 0; k < n; k++) {
          const a = e.warnAngle + (k - (n - 1) / 2) * 0.14;
          G.bullets.push(E.createBullet(
            e.x + Math.cos(a) * e.r, e.y + Math.sin(a) * e.r,
            Math.cos(a) * e.shotSpeed * 0.9, Math.sin(a) * e.shotSpeed * 0.9,
            { friendly: false, dmg: e.bossDmg || 1, r: 5, color: '#ffe3a8', life: 3.6, fuse: 1.4, ring: enraged ? 14 : 10 }
          ));
        }
        e.warnCd = bcd(e, enraged ? 1.6 : 2.3);
      }
      return;
    }
    const want = 180;
    const push = d > want + 30 ? 1 : (d < want - 30 ? -1 : 0);
    moveEntity(e,
      e.dir.x * push * e.speed * dt + Math.cos(e.anim * 1.2) * e.speed * 0.35 * dt,
      e.dir.y * push * e.speed * dt + Math.sin(e.anim * 1.1) * e.speed * 0.35 * dt);
    e.warnCd -= dt;
    if (e.warnCd <= 0) bossWarn(e, 'fan', 0.55, Math.atan2(target.y - e.y, target.x - e.x));
  }

  // 7) Cráneo: avisa y dispara una andanada de huesos que rebotan + una cruz
  //    de huesos en todas direcciones.
  function bossSkull(e, dt, target, d, enraged) {
    if (e.warnT > 0) {
      e.warnAngle = Math.atan2(target.y - e.y, target.x - e.x);
      e.warnT -= dt;
      moveEntity(e, e.dir.x * e.speed * 0.2 * dt, e.dir.y * e.speed * 0.2 * dt);
      if (e.warnT <= 0) {
        bossAim(e, target, enraged ? 11 : 7, 0.16, e.shotSpeed, { color: '#e8e4d8', bounce: 2 });
        bossShootRing(e, enraged ? 18 : 12, e.shotSpeed * 0.85, { color: '#cfc7b0', bounce: 2, off: Math.random() * 2 });
        e.warnCd = bcd(e, enraged ? 1.7 : 2.4);
      }
      return;
    }
    const want = 220;
    const push = d > want + 40 ? 1 : (d < want - 40 ? -1 : 0);
    moveEntity(e, e.dir.x * push * e.speed * dt, e.dir.y * push * e.speed * dt);
    e.warnCd -= dt;
    if (e.warnCd <= 0) bossWarn(e, 'fan', 0.5, Math.atan2(target.y - e.y, target.x - e.x));
  }

  // 8) Colmena: avisa y revienta en espirales, además de invocar crías del piso.
  function bossSummon(e, dt, target, d, enraged) {
    if (e.warnT > 0) {
      e.warnT -= dt;
      moveEntity(e, e.dir.x * e.speed * 0.25 * dt, e.dir.y * e.speed * 0.25 * dt);
      if (e.warnT <= 0) {
        bossSpiralShot(e, enraged, '#ffd166');
        bossSpiralShot(e, enraged, '#ffd166');
        bossSpiralShot(e, enraged, '#ffd166');
        const n = enraged ? 4 : 3;
        const pools = (global.Dungeon && Dungeon.FLOOR_POOLS) ? Dungeon.FLOOR_POOLS : null;
        const allowed = pools ? pools[(G.floorNum - 1) % pools.length] : ['fly'];
        for (let i = 0; i < n; i++) {
          const a = Math.random() * Math.PI * 2;
          G.enemies.push(spawnEnemy(Utils.pick(Math.random, allowed), e.x + Math.cos(a) * 48, e.y + Math.sin(a) * 48));
        }
        setMessage('¡La colmena llama a sus crías!', 1.6);
        Sfx.play('door');
        e.warnCd = bcd(e, enraged ? 3.4 : 5);
      }
      return;
    }
    // Espiral continua (muchas balas) entre invocaciones.
    e.bossShootCd = (e.bossShootCd || 0) - dt;
    if (e.hasWarned && e.bossShootCd <= 0) { e.bossShootCd = bcd(e, enraged ? 0.09 : 0.12); bossSpiralShot(e, enraged, '#ffd166'); }
    moveEntity(e, Math.cos(e.anim * 0.8) * e.speed * 0.6 * dt, Math.sin(e.anim * 0.7) * e.speed * 0.6 * dt);
    e.warnCd -= dt;
    if (e.warnCd <= 0) bossWarn(e, 'summon', 0.65, 0);
  }

  function bossAI(e, dt, target, d) {
    const enraged = e.hp < e.maxHp * 0.5;
    e.bossPhase = enraged ? 1 : 0;
    const style = e.bossStyle || (e.type === 'boss' ? 'burst' : 'burst');
    switch (style) {
      case 'charge': return bossCharge(e, dt, target, d, enraged);
      case 'spiral': return bossSpiral(e, dt, target, d, enraged);
      case 'teleport': return bossTeleport(e, dt, target, d, enraged);
      case 'hop': return bossHop(e, dt, target, d, enraged);
      case 'feather': return bossFeather(e, dt, target, d, enraged);
      case 'skull': return bossSkull(e, dt, target, d, enraged);
      case 'summon': return bossSummon(e, dt, target, d, enraged);
      default: return bossBurst(e, dt, target, d, enraged);
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
  function nearestEnemyTo(x, y) {
    let best = null, bd = Infinity;
    for (const e of G.enemies) {
      if (e.spawnT > 0) continue;
      const d = Utils.dist2(x, y, e.x, e.y);
      if (d < bd) { bd = d; best = e; }
    }
    return best;
  }

  // ---------------------------------------------------------
  // Efectos únicos (fuego, veneno, hielo, rayos, familiares…)
  // ---------------------------------------------------------
  function pushEnemy(e, fromX, fromY, force) {
    if (!e || !force) return;
    const d = Math.hypot(e.x - fromX, e.y - fromY) || 1;
    const mass = e.isBoss ? 0.35 : (e.r > 20 ? 0.6 : 1);
    e.knock.x += ((e.x - fromX) / d) * force * mass;
    e.knock.y += ((e.y - fromY) / d) * force * mass;
  }

  function applyStatus(b, e) {
    if (b.burn > 0) {
      e.burn = Math.max(e.burn || 0, b.burn);
      e.burnDps = Math.max(e.burnDps || 0, b.burnDps);
    }
    if (b.poison > 0) {
      e.poison = Math.max(e.poison || 0, b.poison);
      e.poisonDps = Math.min(5, (e.poisonDps || 0) + b.poisonDps); // el veneno se acumula
    }
    if (b.slowF > 0) {
      e.slow = Math.max(e.slow || 0, b.freeze);
      e.slowF = Math.max(e.slowF || 0, b.slowF);
    }
  }

  function explodeAt(x, y, r, dmg, opts) {
    opts = opts || {};
    if (!(r > 0)) return;
    G.fxQueue.push({ k: 'boom', x, y, c: opts.color || '#ffb347', n: Math.min(34, 10 + Math.round(r / 2)) });
    addShake(Math.min(0.4, 0.05 + r / 420));
    Sfx.play('hit');
    for (let i = G.enemies.length - 1; i >= 0; i--) {
      const e = G.enemies[i];
      if (e.spawnT > 0) continue;
      if (Math.hypot(e.x - x, e.y - y) > r + e.r) continue;
      if (opts.cryo) { e.slow = Math.max(e.slow || 0, 1.5); e.slowF = Math.max(e.slowF || 0, 0.5); }
      pushEnemy(e, x, y, 150);
      damageEnemy(e, dmg, e.x, e.y);
    }
  }

  function chainLightning(from, jumps, dmg, push) {
    let src = from;
    const hitIds = [from.id];
    for (let j = 0; j < jumps; j++) {
      let best = null, bd = 200 * 200;
      for (const e of G.enemies) {
        if (e.spawnT > 0 || hitIds.indexOf(e.id) >= 0) continue;
        const d = Utils.dist2(src.x, src.y, e.x, e.y);
        if (d < bd) { bd = d; best = e; }
      }
      if (!best) break;
      G.fxQueue.push({ k: 'zap', x: src.x, y: src.y, x2: best.x, y2: best.y, c: '#cfe0ff' });
      if (push) pushEnemy(best, src.x, src.y, push);
      hitIds.push(best.id);
      damageEnemy(best, dmg, best.x, best.y);
      src = best;
    }
  }

  // Daño con el tiempo: fuego y veneno (con sus chispas).
  function updateStatuses(dt) {
    for (let i = G.enemies.length - 1; i >= 0; i--) {
      const e = G.enemies[i];
      if (e.spawnT > 0) continue;
      let dot = 0;
      if (e.burn > 0) {
        e.burn -= dt;
        dot += (e.burnDps || 0);
        if (!e._fxT || G.time - e._fxT > 0.14) {
          e._fxT = G.time;
          G.fxQueue.push({ k: 'puff', x: e.x + (Math.random() - 0.5) * e.r, y: e.y + (Math.random() - 0.5) * e.r, c: '#ff9a3c', n: 2 });
        }
      }
      if (e.poison > 0) {
        e.poison -= dt;
        dot += (e.poisonDps || 0);
        if (e.poison <= 0) e.poisonDps = 0;
        if (!e._fxP || G.time - e._fxP > 0.2) {
          e._fxP = G.time;
          G.fxQueue.push({ k: 'puff', x: e.x + (Math.random() - 0.5) * e.r, y: e.y - e.r * 0.4, c: '#9ae06a', n: 2 });
        }
      }
      if (dot > 0) {
        e.hp -= dot * dt;
        if (e.hp <= 0) killEnemy(e);
      }
    }
  }

  // Moscas familiares: orbitan al jugador y dañan al contacto.
  function updateFamiliars(dt) {
    for (const p of G.players) {
      if (p.dead) continue;
      const pr = E.profile(p);
      const n = pr.familiars;
      if (!n) continue;
      p._famCd = p._famCd || [];
      for (let i = 0; i < n; i++) {
        p._famCd[i] = Math.max(0, (p._famCd[i] || 0) - dt);
        const fp = E.familiarPos(p, i, n, G.time);
        for (const e of G.enemies) {
          if (e.spawnT > 0) continue;
          if (Utils.dist2(fp.x, fp.y, e.x, e.y) > (e.r + 9) * (e.r + 9)) continue;
          if (p._famCd[i] <= 0) {
            p._famCd[i] = 0.55;
            damageEnemy(e, pr.familiarDmg, fp.x, fp.y);
            G.fxQueue.push({ k: 'puff', x: fp.x, y: fp.y, c: '#b58cff', n: 4 });
          }
          break;
        }
      }
    }
  }

  // Imán: atrae los recogibles cercanos hacia el jugador.
  function updateMagnet(p, dt) {
    const pr = E.profile(p);
    if (!pr.magnet) return;
    const room = G.room;
    if (!room || !room.pickups) return;
    for (const k of room.pickups) {
      if (k.type === 'trapdoor' || k.type === 'chest' || k.type === 'goldenchest') continue;
      const d = Math.hypot(k.x - p.x, k.y - p.y);
      if (d > 6 && d < pr.magnetR) {
        const s = 170 * dt;
        k.x += ((p.x - k.x) / d) * s;
        k.y += ((p.y - k.y) / d) * s;
      }
    }
  }

  function updateBullets(dt) {
    const obs = G.room.obstacles;
    for (let i = G.bullets.length - 1; i >= 0; i--) {
      const b = G.bullets[i];

      // Bomba con mecha (Serafín): se frena y estalla en anillo.
      if (b.fuse > 0) {
        b.fuse -= dt;
        b.life -= dt;
        b.vx *= Math.pow(0.02, dt);
        b.vy *= Math.pow(0.02, dt);
        b.x += b.vx * dt;
        b.y += b.vy * dt;
        if (b.fuse <= 0) {
          bossShootRing(b, b.ring || 8, 150, { color: b.color, off: Math.random() * 2 });
          G.fxQueue.push({ k: 'boom', x: b.x, y: b.y, c: b.color, n: 12 });
          G.bullets.splice(i, 1);
        } else if (b.life <= 0) {
          G.bullets.splice(i, 1);
        }
        continue;
      }

      // Teledirigido: gira hacia el enemigo más cercano (solo balas amigas).
      if (b.friendly && b.homing) {
        const e = nearestEnemyTo(b.x, b.y);
        if (e) {
          const sp = Math.hypot(b.vx, b.vy) || 1;
          const ax = e.x - b.x, ay = e.y - b.y;
          const al = Math.hypot(ax, ay) || 1;
          const turn = Math.min(1, 7 * dt);
          b.vx = Utils.lerp(b.vx, (ax / al) * sp, turn);
          b.vy = Utils.lerp(b.vy, (ay / al) * sp, turn);
        }
      }

      b.x += b.vx * dt;
      b.y += b.vy * dt;
      b.life -= dt;
      b.spin += dt * 8;

      let dead = b.life <= 0;
      let bounced = false;

      // Bumerán: a mitad de camino da la vuelta y persigue a su dueño.
      if (b.friendly && b.boomerang && !dead) {
        if (!b.back && b.life < b.maxLife * 0.55) { b.back = true; b.hits.length = 0; }
        if (b.back) {
          const ow = G.players.find((q) => q.id === b.owner) || null;
          if (ow) {
            const dx = ow.x - b.x, dy = ow.y - b.y;
            const dd = Math.hypot(dx, dy) || 1;
            const sp = Math.hypot(b.vx, b.vy) || 260;
            const turn = Math.min(1, 7 * dt);
            b.vx = Utils.lerp(b.vx, (dx / dd) * sp, turn);
            b.vy = Utils.lerp(b.vy, (dy / dd) * sp, turn);
            if (dd < 20) dead = true;
          }
        }
      }

      // Paredes: rebotan si les quedan rebotes (o si vuelven), si no mueren al salir.
      if (!dead) {
        if (b.vx < 0 && b.x < C.INNER_L + b.r) {
          if (b.bounce > 0 || b.back) { if (b.bounce > 0) b.bounce--; b.vx = -b.vx; b.x = C.INNER_L + b.r; bounced = true; }
          else if (b.x < C.INNER_L - 40) dead = true;
        } else if (b.vx > 0 && b.x > C.INNER_R - b.r) {
          if (b.bounce > 0 || b.back) { if (b.bounce > 0) b.bounce--; b.vx = -b.vx; b.x = C.INNER_R - b.r; bounced = true; }
          else if (b.x > C.INNER_R + 40) dead = true;
        }
        if (!dead && b.vy < 0 && b.y < C.INNER_T + b.r) {
          if (b.bounce > 0 || b.back) { if (b.bounce > 0) b.bounce--; b.vy = -b.vy; b.y = C.INNER_T + b.r; bounced = true; }
          else if (b.y < C.INNER_T - 40) dead = true;
        } else if (!dead && b.vy > 0 && b.y > C.INNER_B - b.r) {
          if (b.bounce > 0 || b.back) { if (b.bounce > 0) b.bounce--; b.vy = -b.vy; b.y = C.INNER_B - b.r; bounced = true; }
          else if (b.y > C.INNER_B + 40) dead = true;
        }
      }

      // obstáculos (rebote o desaparición)
      if (!dead) {
        for (let o = 0; o < obs.length; o++) {
          const ob = obs[o];
          if (Utils.dist2(b.x, b.y, ob.x, ob.y) < (ob.r + b.r) * (ob.r + b.r)) {
            if (b.bounce > 0 || b.back) {
              if (b.bounce > 0) b.bounce--;
              const d = Math.sqrt(Utils.dist2(b.x, b.y, ob.x, ob.y)) || 0.001;
              const nx = (b.x - ob.x) / d, ny = (b.y - ob.y) / d;
              const dot = b.vx * nx + b.vy * ny;
              b.vx -= 2 * dot * nx;
              b.vy -= 2 * dot * ny;
              b.x = ob.x + nx * (ob.r + b.r + 0.5);
              b.y = ob.y + ny * (ob.r + b.r + 0.5);
              bounced = true;
            } else { dead = true; }
            break;
          }
        }
        if (dead) G.fxQueue.push({ k: 'puff', x: b.x, y: b.y, c: b.color, n: 4 });
      }

      // Sinergia Metralla: cada rebote suelta una explosión pequeña.
      if (!dead && bounced && b.shrapnel && b.explode > 0) {
        explodeAt(b.x, b.y, b.explode * 0.55, b.dmg * 0.5, { color: '#ffd28a' });
      }

      if (!dead && b.friendly) {
        for (let ei = 0; ei < G.enemies.length; ei++) {
          const e = G.enemies[ei];
          if (b.hits.indexOf(e.id) >= 0) continue;
          if (Utils.dist2(b.x, b.y, e.x, e.y) < (e.r + b.r) * (e.r + b.r)) {
            // Sinergia Escarcha cortante: más daño a enemigos congelados.
            let dmgEff = b.dmg;
            if (b.shatter > 1 && e.slow > 0) dmgEff *= b.shatter;
            damageEnemy(e, dmgEff, b.x, b.y);
            applyStatus(b, e);
            if (b.chain > 0) chainLightning(e, b.chain, b.dmg * 0.55, b.chainPush);
            if (b.push) pushEnemy(e, b.x, b.y, b.push);
            if (b.explode > 0) explodeAt(b.x, b.y, b.explode, b.dmg * 0.7, { cryo: b.cryo });
            if (b.pierce || b.back) { b.hits.push(e.id); }
            else { dead = true; }
            break;
          }
        }
      } else if (!dead && !b.friendly) {
        for (let pi = 0; pi < G.players.length; pi++) {
          const p = G.players[pi];
          if (p.dead) continue;
          const hy = p.y + C.PLAYER_HURT_DY;
          if (Utils.dist2(b.x, b.y, p.x, hy) < (p.r + b.r) * (p.r + b.r)) {
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
        const hy = p.y + C.PLAYER_HURT_DY;
        if (Utils.dist2(e.x, e.y, p.x, hy) < (e.r + p.r) * (e.r + p.r)) {
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
      } else if (f.k === 'zap') {
        // rayo en cadena: chispas a lo largo de la línea
        const n = 9;
        for (let i = 0; i <= n; i++) {
          const t = i / n;
          const jx = (Math.random() - 0.5) * 6, jy = (Math.random() - 0.5) * 6;
          E.spawnParticles(G.particles, f.x + (f.x2 - f.x) * t + jx, f.y + (f.y2 - f.y) * t + jy, 2, f.c || '#cfe0ff', { life: 0.22, speed: 50 });
        }
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

  // Botín y premios recién aparecidos: durante `lock` segundos no se pueden
  // coger ni abrir (con un contador visible encima si dura más de un segundo).
  function updateSpawnLocks(dt) {
    const room = G.room;
    if (!room) return;
    if (room.pickups) {
      for (const k of room.pickups) if (k.lock > 0) k.lock = Math.max(0, k.lock - dt);
    }
    if (room.pedestals) {
      for (const ped of room.pedestals) if (ped.lock > 0) ped.lock = Math.max(0, ped.lock - dt);
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
        p.input = G.remoteInputs[p.id] || { mx: 0, my: 0, sx: 0, sy: 0, fire: false, use: false };
      }
    }

    for (const p of G.players) updatePlayer(p, dt);
    updateBullets(dt);
    updateFamiliars(dt);

    for (const e of G.enemies) updateEnemy(e, dt);
    separateEnemies();
    for (const e of G.enemies) clampEnemyToRoom(e);

    updateStatuses(dt);
    contactsPlayers(dt);
    checkRoomCleared();

    applyFx(G.fxQueue);
    G.fxSend = G.fxSend.concat(G.fxQueue);
    G.fxQueue.length = 0;
    updateParticles(dt);
    updateTimers(dt);
    updateSpawnLocks(dt);

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
      Net.sendToHost({ t: 'input', i: [inp.mx, inp.my, inp.sx, inp.sy, inp.fire ? 1 : 0, inp.use ? 1 : 0] });
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
    const charIdx = (global.Characters ? Characters.indexOf(p.charId) : 0);
    return [
      p.id, p.name, p.color,
      n1(p.x), n1(p.y),
      num(p.hp), num(p.maxHp, 6),
      n1(p.aim.x), n1(p.aim.y),
      n1(p.face.x), n1(p.face.y, 1),
      n1(p.walkPhase),
      p.dead ? 1 : 0,
      p.invuln > 0 ? 1 : 0,
      p.slot, p.coins, p.items.join(','), p.ping || 0,
      num(p.skin, 0), (p.compass ? 1 : 0) | (p.hasMap ? 2 : 0),
      num(p.shield, 0), num(p.revives, 0), num(p.keys, 0),
      charIdx, num(p.abCharges, 0), num(p.abMax, 0),
      num(p.abKills, 0), num(p.abKillReq, 0),
    ];
  }

  function eser(e) {
    return [
      e.id, e.type, n1(e.x), n1(e.y), num(e.hp), num(e.maxHp), num(e.r, 14),
      n1(e.anim), n1(e.flash), n1(e.dir.x), n1(e.dir.y), e.isBoss ? 1 : 0,
      n1(e.spawnT),
      ((e.burn > 0) ? 1 : 0) | ((e.poison > 0) ? 2 : 0) | ((e.slow > 0) ? 4 : 0),
      // telegrafiado del jefe (a partir del índice 14; nunca antes del 13)
      n1(e.warnT || 0), n1(e.warnMax || 0), e.warnKind || '', n1(e.warnAngle || 0),
    ];
  }

  function bser(b) {
    return [b.id, n1(b.x), n1(b.y), Math.round(num(b.vx)), Math.round(num(b.vy)), num(b.r, 6), b.friendly ? 1 : 0, b.color];
  }

  function kser(k) {
    return [k.id, k.type, n1(k.x), n1(k.y), k.price || 0, k.keys || 0];
  }

  function dser(d) {
    return [d.id, d.itemId, n1(d.x), n1(d.y), d.taken ? 1 : 0, d.price || 0];
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
      lk: room && room.locks ? [
        room.locks.up ? 1 : 0, room.locks.down ? 1 : 0,
        room.locks.left ? 1 : 0, room.locks.right ? 1 : 0,
      ] : null,
      fx: G.fxSend,
      kills: G.stats.kills,
      cs: G.coins,
      ks: G.keys,
      rv: G.revealed ? 1 : 0,
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
      coins: num(s.cs, 0),
      keys: num(s.ks, 0),
      revealed: !!s.rv,
      players: (s.p || []).map((a) => ({
        kind: 'player',
        id: a[0], name: a[1], color: a[2],
        x: num(a[3]), y: num(a[4]), hp: num(a[5]), maxHp: num(a[6], 6),
        aim: { x: num(a[7]), y: num(a[8], 1) },
        face: { x: num(a[9]), y: num(a[10], 1) },
        walkPhase: num(a[11]),
        dead: !!a[12], invuln: a[13] ? 1 : 0,
        slot: a[14], coins: a[15],
        items: a[16] ? String(a[16]).split(',') : [],
        ping: a[17] || 0,
        skin: num(a[18]),
        armor: 0,
        compass: !!(a[19] & 1), hasMap: !!(a[19] & 2),
        shield: num(a[20]), revives: num(a[21]), keys: num(a[22]),
        charId: (global.Characters && a[23] != null) ? Characters.LIST[Characters.normIndex(a[23])].id : 'isaac',
        abCharges: num(a[24], 0), abMax: num(a[25], 0),
        abKills: num(a[26], 0), abKillReq: num(a[27], 0),
        r: 6,
      })),
      enemies: (s.e || []).map((a) => ({
        kind: 'enemy', id: a[0], type: a[1], x: num(a[2]), y: num(a[3]),
        hp: num(a[4], 1), maxHp: num(a[5], 1), r: num(a[6], 14),
        anim: num(a[7]), flash: num(a[8]),
        dir: { x: num(a[9]), y: num(a[10]) }, isBoss: !!a[11], spawnT: num(a[12]),
        st: a[13] || 0,
        warnT: num(a[14]), warnMax: num(a[15]),
        warnKind: a[16] || '', warnAngle: num(a[17]),
        color: (E.ENEMY_TYPES[a[1]] || E.ENEMY_TYPES.fly).color,
      })),
      bullets: (s.b || []).map((a) => ({
        kind: 'bullet', id: a[0], x: num(a[1]), y: num(a[2]), vx: num(a[3]), vy: num(a[4]),
        r: num(a[5], 6), friendly: !!a[6], color: a[7],
      })),
      pickups: (s.k || []).map((a) => ({
        kind: 'pickup', id: a[0], type: a[1], x: num(a[2]), y: num(a[3]),
        r: a[1] === 'trapdoor' ? 26 : ((a[1] === 'chest' || a[1] === 'goldenchest') ? 16 : 13),
        price: a[4], keys: a[5] || 0, bob: 0,
      })),
      pedestals: (s.d || []).map((a) => ({
        kind: 'pedestal', id: a[0], itemId: a[1], x: num(a[2]), y: num(a[3]), taken: !!a[4], price: a[5], bob: 0,
      })),
      locks: s.lk ? { up: !!s.lk[0], down: !!s.lk[1], left: !!s.lk[2], right: !!s.lk[3] } : null,
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
      G.theme = (Dungeon.theme ? Dungeon.theme(G.floorNum) : null);
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
      if (data.locks) G.room.locks = data.locks;
      else if (!G.room.locks) G.room.locks = { up: false, down: false, left: false, right: false };
    }
    if (roomChanged) {
      G.bullets = [];
      G.transition = 0.34;
    }

    // stats
    if (data.kills > G.stats.kills) { G.stats.kills = data.kills; }
    G.coins = data.coins; G.keys = data.keys; G.revealed = data.revealed;

    // estado del jugador local
    const mine = data.players.find((p) => p.id === G.localId);
    if (mine) {
      // El jugador local debe ser una entidad completa (con speed, cadencias…),
      // no el objeto plano serializado: si no, la predicción produce NaN.
      let lp = G.localPlayer || G.players.find((p) => p.id === G.localId);
      if (!lp) {
        lp = E.createPlayer(G.localId, {
          name: mine.name, color: mine.color, slot: mine.slot, scheme: 'p1', local: true,
        });
        G.players.push(lp);
      }
      G.localPlayer = lp;
      const fresh = lp.srvX == null;      // primer estado recibido
      const px = lp.x, py = lp.y;         // conservar la posición predicha
      Object.assign(lp, mine);            // aplicar hp, objetos, apuntado… del servidor
      if (E.recomputeStats) E.recomputeStats(lp); // números idénticos al anfitrión
      if (fresh || roomChanged) { lp.x = mine.x; lp.y = mine.y; }
      else { lp.x = px; lp.y = py; }
      lp.srvX = mine.x;
      lp.srvY = mine.y;
      lp.r = 6;    // hitbox del jugador (igual que en el anfitrión)
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
    const anyMap = G.players.some((p) => p.hasMap);
    const anyCompass = G.players.some((p) => p.compass);
    const bossRoom = G.dungeon.rooms[G.dungeon.bossKey];

    // una sala "frontera" es una sin explorar pegada a una explorada
    const isFrontier = (r) => {
      if (!r || r.visited) return false;
      for (const d of Dungeon.DIRS) {
        if (!r.doors[d.n]) continue;
        const nb = Dungeon.get(G.dungeon, r.gx + d.dx, r.gy + d.dy);
        if (nb && nb.visited) return true;
      }
      return false;
    };
    const bossHinted = (r) => !!(anyCompass && r === bossRoom && !r.visited && !anyMap);
    const include = (r) => !!(r && (r.visited || anyMap || isFrontier(r) || bossHinted(r)));

    const included = new Set();
    for (const r of G.dungeon.list) if (include(r)) included.add(r.key);

    const out = [];
    for (const r of G.dungeon.list) {
      if (!included.has(r.key)) continue;
      const visited = r.visited || anyMap;
      const north = Dungeon.get(G.dungeon, r.gx, r.gy - 1);
      const west = Dungeon.get(G.dungeon, r.gx - 1, r.gy);
      out.push({
        gx: r.gx, gy: r.gy,
        type: visited ? r.type : 'unknown',
        visited,
        frontier: !visited && isFrontier(r),
        bossHint: !visited && bossHinted(r),
        cleared: visited && r.cleared,
        doors: r.doors,
        locks: r.locks ? ((r.locks.up ? 1 : 0) | (r.locks.down ? 2 : 0) | (r.locks.left ? 4 : 0) | (r.locks.right ? 8 : 0)) : 0,
        northVisited: !!(r.doors.up && north && included.has(north.key)),
        westVisited: !!(r.doors.left && west && included.has(west.key)),
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
        items: G.items, coins: G.coins, keys: G.keys, revealed: G.revealed, theme: G.theme,
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
            // estadísticas reales (para el globo de objetos y el HUD)
            damage: G.localPlayer.damage, fireRate: G.localPlayer.fireRate,
            speed: G.localPlayer.speed, bulletSpeed: G.localPlayer.bulletSpeed,
            bulletSize: G.localPlayer.bulletSize, extraShots: G.localPlayer.extraShots,
            range: G.localPlayer.range, luck: G.localPlayer.luck,
            regen: G.localPlayer.regen, armor: G.localPlayer.armor,
            shield: G.localPlayer.shield, revives: G.localPlayer.revives,
            keys: G.localPlayer.keys,
            piercing: G.localPlayer.piercing, homing: G.localPlayer.homing,
            bounce: G.localPlayer.bounce, lifesteal: G.localPlayer.lifesteal,
            compass: G.localPlayer.compass, hasMap: G.localPlayer.hasMap,
            // efectos únicos (para el globo de sinergias y el HUD)
            burn: G.localPlayer.burn, poison: G.localPlayer.poison, freeze: G.localPlayer.freeze,
            chain: G.localPlayer.chain, explode: G.localPlayer.explode, boomerang: G.localPlayer.boomerang,
            familiars: G.localPlayer.familiars, magnet: G.localPlayer.magnet, charger: G.localPlayer.charger,
            thorns: G.localPlayer.thorns, doubleTap: G.localPlayer.doubleTap, greed: G.localPlayer.greed,
            pushback: G.localPlayer.pushback, potency: G.localPlayer.potency, prism: G.localPlayer.prism,
            coinsHeal: G.localPlayer.coinsHeal, flying: G.localPlayer.flying,
            // personaje y habilidad activa
            charId: G.localPlayer.charId,
            abCharges: G.localPlayer.abCharges, abMax: G.localPlayer.abMax,
            abKills: G.localPlayer.abKills, abKillReq: G.localPlayer.abKillReq,
            items: G.localPlayer.items,
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
      items: G.items, coins: G.coins, keys: G.keys, revealed: G.revealed, theme: G.theme,
      message: G.message, messageTimer: G.messageTimer,
      bigMessage: G.bigMessage, hintTimer: G.hintTimer,
      shake: G.shake, transition: G.transition,
    };
  }

  function view() {
    const base = {
      items: G.items,
      coins: G.coins,
      keys: G.keys,
      revealed: G.revealed,
      theme: G.theme,
      floorNum: G.floorNum, gx: G.gx, gy: G.gy,
      room: G.room, time: G.renderClock,
      minimap: minimapData(),
      localId: G.localId,
      message: G.message, messageTimer: G.messageTimer,
      bigMessage: G.bigMessage, hintTimer: G.hintTimer,
      shake: G.shake, transition: G.transition,
      challenge: G.challenge || null,
    };
    if (G.mode === 'client') {
      return Object.assign(clientView(), base, { room: G.room, time: G.renderClock });
    }
    return Object.assign(base, {
      mode: G.mode,
      players: G.players,
      enemies: G.enemies,
      bullets: G.bullets,
      pickups: (G.room && G.room.pickups) || [],
      pedestals: (G.room && G.room.pedestals) || [],
      particles: G.particles,
    });
  }

  // ---------------------------------------------------------
  // API pública
  // ---------------------------------------------------------
  function start(opts) {
    opts = opts || {};
    G.mode = opts.mode || 'local';
    G.seed = (opts.seed != null ? opts.seed : Utils.makeSeed()) >>> 0;
    G.floorNum = opts.floorNum || 1;
    // Desafío (opcional): id + modificadores resueltos.
    G.challenge = opts.challenge || null;
    G.modFlags = (G.challenge && global.Challenges) ? ((global.Challenges.byId(G.challenge) || {}).mods || null) : null;
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
    G.items = [];
    G.coins = 0;
    G.keys = 0;
    G.revealed = false;
    G.theme = (Dungeon.theme ? Dungeon.theme(G.floorNum) : null);
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
        color: lp.color || E.skinColor(lp.skin || i),
        skin: lp.skin != null ? lp.skin : i,
        char: lp.char,
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
      for (const rp of opts.remotePlayers) addRemotePlayer(rp.id, rp.name, rp.skin, rp.char);
    }

    // Mejoras de equipo: `G.items` es el registro común (lo que ha recogido el
    // grupo), pero cada jugador guarda su PROPIA lista para que los caídos no
    // reciban lo que se recoja mientras están muertos.
    for (const p of G.players) { p.items = []; p.coins = 0; p.keys = 0; }
    syncPool();
    // Reanimaciones iniciales (0 en solitario; en online, una por piso).
    for (const p of G.players) p.revives = reviveBase();
    if (global.Meta) {
      global.Meta.reachFloor(G.floorNum);
      if (isCoop()) global.Meta.recordCoop();
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

  function addRemotePlayer(id, name, skin, char) {
    if (G.players.find((p) => p.id === id)) return null;
    const slot = slotFree();
    const p = E.createPlayer(id, {
      name: name || ('Jugador ' + (G.players.length + 1)),
      skin: skin != null ? skin : (slot + 1),
      char: char,
      slot,
      scheme: 'p1',
      local: false,
    });
    p.remote = true;
    // Quien entra con la partida en marcha hereda las mejoras que ya tiene el
    // grupo (sigue vivo), en su propia lista.
    p.items = G.items.slice();
    E.recomputeStats(p);
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
      use: !!arr[5],
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

  function runSummary() {
    return {
      floor: G.floorNum,
      kills: G.stats.kills,
      win: !!G.victory,
      items: G.items.length,
      challenge: G.challenge || null,
    };
  }

  global.Game = {
    G, start, step, stop, view, setPaused,
    addRemotePlayer, removePlayer, setRemoteInput,
    applyState, applyPing, serialState,
    tryUseAbility, reviveBase, giveItemToAll, runSummary, onBossDefeated,
    updateAbility, updateBuffs,
    addCoins, spendCoins, addKeys, spendKey, syncPool, countItem,
    setHandlers(h) { handlers = h || {}; },
    get simulating() { return simulating(); },
  };
})(typeof window !== 'undefined' ? window : globalThis);
