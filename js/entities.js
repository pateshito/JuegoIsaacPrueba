/* ============================================================
   entities.js — jugadores, enemigos, balas, recogibles y objetos
   Expone el global `Entities`.
   ============================================================ */
(function (global) {
  'use strict';

  const C = Utils.C;

  let _id = 1;
  const newId = () => _id++;
  const resetIds = () => { _id = 1; };

  // Colores asignados por orden de entrada
  const COLORS = ['#8fd3ff', '#ffd166', '#a6f28a', '#f79ad3'];

  const NAMES_1 = ['Isaac', 'Magdalena', 'Caín', 'Judas'];

  // ---------------------------------------------------------
  // OBJETOS (items)
  // ---------------------------------------------------------
  const ITEMS = [
    {
      id: 'heart', name: 'Corazón de sobra',
      desc: '+1 corazón de vida máxima y cura completa.',
      color: '#ff5f7e',
      apply(p) { p.maxHp += 2; p.hp = p.maxHp; },
    },
    {
      id: 'blood', name: 'Sangre de mártir',
      desc: '+1.2 de daño.',
      color: '#c0392b',
      apply(p) { p.damage += 1.2; },
    },
    {
      id: 'boots', name: 'Pies ligeros',
      desc: '+36 de velocidad.',
      color: '#7fd18a',
      apply(p) { p.speed += 36; },
    },
    {
      id: 'trigger', name: 'Gatillo rápido',
      desc: 'Disparas más rápido.',
      color: '#ffd166',
      apply(p) { p.fireRate += 0.75; },
    },
    {
      id: 'tear', name: 'Lágrima gigante',
      desc: '+1.4 de daño y balas más grandes, pero más lentas.',
      color: '#68c7ff',
      apply(p) { p.damage += 1.4; p.bulletSize += 2.4; p.fireRate = Math.max(1.1, p.fireRate - 0.3); },
    },
    {
      id: 'trident', name: 'Tridente',
      desc: 'Dispara un proyectil extra en abanico.',
      color: '#b58cff',
      apply(p) { p.extraShots += 1; },
    },
    {
      id: 'horn', name: 'Cuerno perforante',
      desc: 'Tus lágrimas atraviesan enemigos.',
      color: '#f0e6d2',
      apply(p) { p.piercing = true; },
    },
    {
      id: 'lens', name: 'Lente de aumento',
      desc: 'Balas más veloces y de mayor alcance.',
      color: '#9be7ff',
      apply(p) { p.bulletSpeed += 90; p.range += 0.3; },
    },
    {
      id: 'clover', name: 'Trébol de la suerte',
      desc: 'Más probabilidad de botín al matar.',
      color: '#6ee7a8',
      apply(p) { p.luck += 1; },
    },
  ];

  const itemById = (id) => ITEMS.find((i) => i.id === id) || ITEMS[0];

  // ---------------------------------------------------------
  // JUGADOR
  // ---------------------------------------------------------
  function createPlayer(id, opts) {
    opts = opts || {};
    return {
      kind: 'player',
      id,
      name: opts.name || 'Jugador',
      slot: opts.slot || 0,
      color: opts.color || COLORS[0],
      scheme: opts.scheme || 'p1',
      local: !!opts.local,
      remote: !!opts.remote,

      x: opts.x != null ? opts.x : C.CX,
      y: opts.y != null ? opts.y : C.CY,
      r: 15,
      vx: 0, vy: 0,
      aim: { x: 0, y: 1 },
      face: { x: 0, y: 1 },
      walkPhase: 0,

      hp: 6, maxHp: 6,
      speed: 192,
      damage: 3.4,
      fireRate: 2.4,
      bulletSpeed: 440,
      bulletSize: 6.5,
      extraShots: 0,
      piercing: false,
      range: 0.85,
      luck: 0,

      shootCd: 0,
      invuln: 0,
      hurtFlash: 0,
      anim: 0,
      dead: false,
      reviveTimer: 0,

      coins: 0,
      keys: 0,
      items: [],

      input: { mx: 0, my: 0, sx: 0, sy: 0, fire: false },
      // predicción en cliente
      srvX: null, srvY: null,
      ping: 0,
    };
  }

  // ---------------------------------------------------------
  // ENEMIGOS
  // ---------------------------------------------------------
  const ENEMY_TYPES = {
    fly: {
      hp: 9, speed: 82, r: 14, dmg: 1, ai: 'chase', color: '#c76bd8',
      wobble: true, xp: 1,
    },
    gaper: {
      hp: 17, speed: 108, r: 16, dmg: 2, ai: 'chase', color: '#e0705a',
      xp: 1,
    },
    charger: {
      hp: 24, speed: 152, r: 17, dmg: 2, ai: 'charge', color: '#d9a441',
      xp: 2,
    },
    spitter: {
      hp: 14, speed: 52, r: 15, dmg: 2, ai: 'shoot', color: '#7fd18a',
      xp: 2, shotRate: 2.0, shotSpeed: 185,
    },
    hopper: {
      hp: 13, speed: 118, r: 15, dmg: 2, ai: 'hop', color: '#7aa8e0',
      xp: 1,
    },
    fat: {
      hp: 30, speed: 54, r: 22, dmg: 2, ai: 'chase', color: '#c98fb0',
      xp: 3, splits: 2,
    },
    boss: {
      hp: 160, speed: 74, r: 36, dmg: 2, ai: 'boss', color: '#b04a5e',
      xp: 10, shotRate: 2.2, shotSpeed: 175,
    },
  };

  function createEnemy(type, x, y, floorNum) {
    const t = ENEMY_TYPES[type] || ENEMY_TYPES.fly;
    const hpMul = 1 + (floorNum - 1) * 0.55;
    const spMul = 1 + (floorNum - 1) * 0.07;
    const hp = Math.round(t.hp * hpMul);
    return {
      kind: 'enemy',
      id: newId(),
      type,
      x, y,
      r: t.r,
      hp,
      maxHp: hp,
      speed: t.speed * spMul,
      dmg: t.dmg,
      ai: t.ai,
      color: t.color,
      wobble: !!t.wobble,
      xp: t.xp || 1,
      splits: t.splits || 0,
      shotRate: t.shotRate || 0,
      shotSpeed: t.shotSpeed || 0,
      shotCd: 0.6 + Math.random() * 0.9,
      // estado de IA
      dir: { x: 0, y: 0 },
      chargeT: 0,
      chargeCd: 0.7,
      hopCd: 0,
      hopV: { x: 0, y: 0 },
      anim: Math.random() * 10,
      flash: 0,
      spawnT: 0.65,          // gracia de aparición: no ataca ni se mueve
      knock: { x: 0, y: 0 },
      bossPhase: 0,
      bossTimer: 3,
      bossBurst: 0,
      isBoss: type === 'boss',
    };
  }

  // ---------------------------------------------------------
  // BALAS
  // ---------------------------------------------------------
  function createBullet(x, y, vx, vy, opts) {
    opts = opts || {};
    return {
      kind: 'bullet',
      id: newId(),
      x, y,
      vx, vy,
      r: opts.r != null ? opts.r : 6,
      dmg: opts.dmg != null ? opts.dmg : 3,
      friendly: !!opts.friendly,
      color: opts.color || (opts.friendly ? '#dff1ff' : '#ff9a5c'),
      life: opts.life != null ? opts.life : 1.2,
      maxLife: opts.life != null ? opts.life : 1.2,
      pierce: !!opts.pierce,
      hits: [],
      owner: opts.owner || null,
      spin: Math.random() * 6.28,
      trail: [],
    };
  }

  // ---------------------------------------------------------
  // RECOGIBLES
  // ---------------------------------------------------------
  function createPickup(type, x, y, opts) {
    opts = opts || {};
    const a = Math.random() * Math.PI * 2;
    const sp = opts.pop === false ? 0 : 60 + Math.random() * 70;
    return {
      kind: 'pickup',
      id: newId(),
      type, // 'heart' | 'halfheart' | 'coin' | 'key' | 'trapdoor'
      x, y,
      r: type === 'trapdoor' ? 26 : 13,
      vx: Math.cos(a) * sp,
      vy: Math.sin(a) * sp,
      life: opts.life || 0,   // 0 = permanente
      age: 0,
      price: opts.price || 0,
      bob: Math.random() * 6.28,
    };
  }

  // ---------------------------------------------------------
  // PEDESTALES (objetos)
  // ---------------------------------------------------------
  function createPedestal(itemId, x, y, price) {
    return {
      kind: 'pedestal',
      id: newId(),
      itemId,
      x, y,
      price: price || 0,
      taken: false,
      bob: Math.random() * 6.28,
    };
  }

  // ---------------------------------------------------------
  // PARTÍCULAS (solo visuales)
  // ---------------------------------------------------------
  function spawnParticles(list, x, y, n, color, opts) {
    opts = opts || {};
    const spd = opts.speed || 160;
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const s = spd * (0.35 + Math.random() * 0.9);
      list.push({
        x, y,
        vx: Math.cos(a) * s,
        vy: Math.sin(a) * s,
        life: opts.life || 0.45,
        max: opts.life || 0.45,
        r: opts.r || (2 + Math.random() * 3),
        color,
      });
    }
  }

  global.Entities = {
    COLORS, NAMES_1, ITEMS, ENEMY_TYPES,
    newId, resetIds, itemById,
    createPlayer, createEnemy, createBullet, createPickup, createPedestal,
    spawnParticles,
  };
})(typeof window !== 'undefined' ? window : globalThis);
