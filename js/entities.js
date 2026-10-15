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
  // SKINS (aspecto del personaje; solo visual)
  // color  = ropa / cuerpo
  // skin   = tono de cara
  // eye    = color de ojos
  // acc    = accesorio dibujado sobre la cabeza
  // ---------------------------------------------------------
  const SKINS = [
    { id: 'isaac',  name: 'Isaac',     color: '#cfe3ff', skin: '#f2d0a4', eye: '#20182b', acc: null },
    { id: 'maggy',  name: 'Magdalena', color: '#ffe3c2', skin: '#f6d3b0', eye: '#20182b', acc: 'bow' },
    { id: 'cain',   name: 'Caín',      color: '#8e7bff', skin: '#e8c9a0', eye: '#20182b', acc: 'headphones' },
    { id: 'judas',  name: 'Judas',     color: '#ff6b8a', skin: '#e8c9a0', eye: '#20182b', acc: 'horns' },
    { id: 'azazel', name: 'Azazel',    color: '#5a3568', skin: '#2b1c3a', eye: '#ff4d6d', acc: 'horns' },
    { id: 'eden',   name: 'Edén',      color: '#a6f28a', skin: '#a8e6cf', eye: '#20182b', acc: 'halo' },
    { id: 'ghost',  name: 'Fantasma',  color: '#dff1ff', skin: '#eef6ff', eye: '#3a3350', acc: null, ghost: true },
    { id: 'robot',  name: 'Robot',     color: '#9fb3c8', skin: '#c7d3de', eye: '#39ff88', acc: 'antenna' },
    { id: 'devil',  name: 'Diablillo', color: '#c0392b', skin: '#e07a5a', eye: '#ffd166', acc: 'horns' },
    { id: 'angel',  name: 'Ángel',     color: '#fff1c2', skin: '#ffe0b8', eye: '#4a6fa5', acc: 'halo' },
  ];

  const normSkin = (i) => {
    const n = SKINS.length;
    i = (typeof i === 'number' && isFinite(i)) ? (i | 0) : 0;
    return ((i % n) + n) % n;
  };
  const skinAt = (i) => SKINS[normSkin(i)];
  const skinColor = (i) => skinAt(i).color;

  // ---------------------------------------------------------
  // OBJETOS (items)
  // ---------------------------------------------------------
  const ITEMS = [
    {
      id: 'heart', name: 'Corazón de sobra',
      desc: '+1 corazón de vida máxima y te cura medio corazón.',
      color: '#ff5f7e',
      apply(p) { p.maxHp += 2; p.hp = Math.min(p.maxHp, p.hp + 2); },
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
    {
      id: 'sad', name: 'Lágrima amarga',
      desc: '+0.8 de daño.',
      color: '#8fd3ff',
      apply(p) { p.damage += 0.8; },
    },
    {
      id: 'rage', name: 'Furia',
      desc: '+2 de daño pero disparas algo más despacio.',
      color: '#ff5f7e',
      apply(p) { p.damage += 2; p.fireRate = Math.max(1.2, p.fireRate - 0.2); },
    },
    {
      id: 'spoon', name: 'Cuchara doblada',
      desc: 'Disparas bastante más rápido.',
      color: '#d8dced',
      apply(p) { p.fireRate += 0.9; },
    },
    {
      id: 'wings', name: 'Alas de ángel',
      desc: '+40 de velocidad.',
      color: '#bfe3ff',
      apply(p) { p.speed += 40; },
    },
    {
      id: 'crown', name: 'Corona rota',
      desc: '+1 corazón de vida máxima y te cura un poco.',
      color: '#ffd166',
      apply(p) { p.maxHp += 2; p.hp = Math.min(p.maxHp, p.hp + 1); },
    },
    {
      id: 'iron', name: 'Piel de hierro',
      desc: 'Recibes 1 punto menos de daño (mínimo 1).',
      color: '#9fb3c8',
      apply(p) { p.armor += 1; },
    },
    {
      id: 'scatter', name: 'Perdigones',
      desc: 'Disparas dos lágrimas extra en abanico.',
      color: '#ff9a5c',
      apply(p) { p.extraShots += 2; },
    },
    {
      id: 'compass', name: 'Brújula',
      desc: 'Marca la sala del jefe en el minimapa.',
      color: '#e8d9a0',
      apply(p) { p.compass = true; },
    },
    {
      id: 'atlas', name: 'Mapa del piso',
      desc: 'Revela todas las habitaciones del piso en el minimapa.',
      color: '#c9a26b',
      apply(p) { p.hasMap = true; },
    },
  ];

  const itemById = (id) => ITEMS.find((i) => i.id === id) || ITEMS[0];
  const findItem = (id) => ITEMS.find((i) => i.id === id) || null;

  // ---------------------------------------------------------
  // TIERS: rareza de cada objeto. Cuanto más raro, menos probable
  // es que salga al elegir dentro de una pool.
  // ---------------------------------------------------------
  const TIERS = {
    common:   { id: 'common',   name: 'Común',      color: '#9fb3c8', w: 62 },
    uncommon: { id: 'uncommon', name: 'Poco común', color: '#6ee7a8', w: 26 },
    rare:     { id: 'rare',     name: 'Raro',       color: '#68c7ff', w: 10 },
    epic:     { id: 'epic',     name: 'Épico',      color: '#c78bff', w: 3 },
    legendary:{ id: 'legendary',name: 'Legendario', color: '#ffcf5c', w: 1 },
  };
  const tierOf = (item) => TIERS[(item && item.tier) || 'common'] || TIERS.common;

  // Pools: dónde puede aparecer cada objeto. Varios comparten varias pools.
  //   treasure = sala del tesoro · shop = tienda · boss = recompensa de jefe
  const ITEM_META = {
    heart:   { tier: 'common',   pools: ['treasure', 'shop'] },
    blood:   { tier: 'common',   pools: ['treasure'] },
    boots:   { tier: 'common',   pools: ['treasure', 'shop'] },
    sad:     { tier: 'common',   pools: ['treasure'] },
    trigger: { tier: 'uncommon', pools: ['treasure'] },
    tear:    { tier: 'uncommon', pools: ['treasure'] },
    lens:    { tier: 'uncommon', pools: ['treasure', 'shop'] },
    clover:  { tier: 'uncommon', pools: ['treasure', 'shop'] },
    rage:    { tier: 'uncommon', pools: ['treasure', 'shop'] },
    spoon:   { tier: 'uncommon', pools: ['treasure'] },
    wings:   { tier: 'uncommon', pools: ['treasure'] },
    compass: { tier: 'uncommon', pools: ['shop', 'treasure'] },
    atlas:   { tier: 'uncommon', pools: ['shop'] },
    trident: { tier: 'rare',     pools: ['treasure', 'boss'] },
    horn:    { tier: 'rare',     pools: ['treasure', 'boss'] },
    crown:   { tier: 'rare',     pools: ['treasure', 'boss'] },
    iron:    { tier: 'rare',     pools: ['treasure', 'boss'] },
    scatter: { tier: 'rare',     pools: ['treasure', 'boss'] },
  };
  for (const it of ITEMS) {
    const m = ITEM_META[it.id] || { tier: 'common', pools: ['treasure'] };
    it.tier = m.tier;
    it.pools = m.pools;
  }

  // ---------------- Objetos nuevos ----------------
  ITEMS.push(
    {
      id: 'coinbag', name: 'Bolsa de monedas', tier: 'common', pools: ['shop', 'treasure'],
      desc: '+8 monedas al instante.',
      color: '#ffd166',
      apply(p) { p.coins += 8; },
    },
    {
      id: 'keychain', name: 'Llavero oxidado', tier: 'uncommon', pools: ['shop'],
      desc: '+2 llaves para abrir puertas cerradas.',
      color: '#e8c46a',
      apply(p) { p.keys += 2; },
    },
    {
      id: 'bandage', name: 'Vendaje', tier: 'uncommon', pools: ['treasure', 'shop'],
      desc: 'Regeneras vida lentamente con el tiempo.',
      color: '#f0d9d9',
      apply(p) { p.regen += 0.25; },
    },
    {
      id: 'tacon', name: 'Tacón puntiagudo', tier: 'uncommon', pools: ['treasure', 'shop'],
      desc: '+70 de velocidad de tus lágrimas.',
      color: '#ffb0d0',
      apply(p) { p.bulletSpeed += 70; },
    },
    {
      id: 'alcance', name: 'Alcance eterno', tier: 'uncommon', pools: ['treasure', 'shop'],
      desc: '+0.55 de alcance de las lágrimas.',
      color: '#a0e0ff',
      apply(p) { p.range += 0.55; },
    },
    {
      id: 'herradura', name: 'Herradura', tier: 'uncommon', pools: ['treasure', 'shop'],
      desc: '+2 de suerte.',
      color: '#d8cfa0',
      apply(p) { p.luck += 2; },
    },
    {
      id: 'bouncy', name: 'Pelota rebotona', tier: 'uncommon', pools: ['treasure', 'shop'],
      desc: 'Tus lágrimas rebotan en las paredes.',
      color: '#8fe0d0',
      apply(p) { p.bounce += 1; },
    },
    {
      id: 'shield', name: 'Escudo sagrado', tier: 'rare', pools: ['treasure', 'boss'],
      desc: 'Bloquea el próximo golpe recibido.',
      color: '#8fd3ff',
      apply(p) { p.shield += 1; },
    },
    {
      id: 'eye', name: 'Ojo que todo lo ve', tier: 'rare', pools: ['treasure', 'boss'],
      desc: 'Tus lágrimas persiguen a los enemigos.',
      color: '#e6d0ff',
      apply(p) { p.homing = true; },
    },
    {
      id: 'bigheart', name: 'Corazón de oro', tier: 'rare', pools: ['treasure', 'boss'],
      desc: '+2 corazones de vida máxima y te cura un poco.',
      color: '#ffd166',
      apply(p) { p.maxHp += 4; p.hp = Math.min(p.maxHp, p.hp + 2); },
    },
    {
      id: 'dmgup', name: 'Furia divina', tier: 'rare', pools: ['treasure', 'boss'],
      desc: '+2.5 de daño.',
      color: '#ff6b6b',
      apply(p) { p.damage += 2.5; },
    },
    {
      id: 'firerate', name: 'Metralleta', tier: 'rare', pools: ['treasure', 'boss'],
      desc: '+1.6 de cadencia de disparo.',
      color: '#ffe08a',
      apply(p) { p.fireRate += 1.6; },
    },
    {
      id: 'armor2', name: 'Coraza de placas', tier: 'rare', pools: ['treasure', 'boss'],
      desc: 'Recibes 1 punto menos de daño (mínimo 1).',
      color: '#c0ccd8',
      apply(p) { p.armor += 1; },
    },
    {
      id: 'vampire', name: 'Colmillo de vampiro', tier: 'epic', pools: ['treasure', 'boss'],
      desc: 'Recuperas medio corazón cada dos enemigos eliminados.',
      color: '#b03a4a',
      apply(p) { p.lifesteal = true; },
    },
    {
      id: 'glass', name: 'Cañón de cristal', tier: 'epic', pools: ['treasure', 'boss'],
      desc: '+5 de daño, pero -1 corazón de vida máxima.',
      color: '#a0ffe0',
      apply(p) { p.damage += 5; p.maxHp = Math.max(2, p.maxHp - 2); p.hp = Math.min(p.hp, p.maxHp); },
    },
    {
      id: 'extra_life', name: 'Cordero pascual', tier: 'epic', pools: ['boss'],
      desc: 'Revives una vez con medio corazón al morir.',
      color: '#fff2c2',
      // Marcador: `Game.reviveBase()` cuenta este objeto para calcular las
      // reanimaciones (así recomputeStats lo reaplica sin duplicar vidas).
      apply(p) { p.reviveMark = true; },
    },
    {
      id: 'quad', name: 'Cuádruple', tier: 'epic', pools: ['boss'],
      desc: 'Dispara tres lágrimas extra en abanico.',
      color: '#ffa8e0',
      apply(p) { p.extraShots += 3; },
    },
  );

  // ---------------- Objetos con habilidad única ----------------
  // No dan solo estadísticas: añaden efectos de verdad (fuego, veneno,
  // hielo, explosiones, rayos, familiares…) que se combinan entre sí.
  ITEMS.push(
    {
      id: 'torch', name: 'Antorcha', tier: 'uncommon', pools: ['treasure', 'shop'],
      desc: 'Tus lágrimas prenden fuego a los enemigos (daño con el tiempo).',
      color: '#ff9a3c',
      apply(p) { p.burn += 2.6; },
    },
    {
      id: 'acid', name: 'Bomba ácida', tier: 'uncommon', pools: ['treasure', 'shop'],
      desc: 'Tus lágrimas envenenan: daño lento que se acumula.',
      color: '#9ae06a',
      apply(p) { p.poison += 3.2; },
    },
    {
      id: 'frost', name: 'Aliento gélido', tier: 'rare', pools: ['treasure', 'boss'],
      desc: 'Tus lágrimas congelan y ralentizan a los enemigos.',
      color: '#a8e8ff',
      apply(p) { p.freeze += 0.6; },
    },
    {
      id: 'chain', name: 'Rayo en cadena', tier: 'rare', pools: ['treasure', 'boss'],
      desc: 'Al acertar, un rayo salta a otro enemigo cercano.',
      color: '#cfe0ff',
      apply(p) { p.chain += 1; },
    },
    {
      id: 'powder', name: 'Pólvora negra', tier: 'rare', pools: ['treasure', 'boss'],
      desc: 'Tus lágrimas explotan al impactar y dañan en área.',
      color: '#ffb347',
      apply(p) { p.explode += 34; },
    },
    {
      id: 'boomerang', name: 'Bumerán', tier: 'rare', pools: ['treasure', 'boss'],
      desc: 'Tus lágrimas vuelven hacia ti, pudiendo golpear dos veces.',
      color: '#8fe0d0',
      apply(p) { p.boomerang += 1; },
    },
    {
      id: 'familiar', name: 'Mosca compañera', tier: 'uncommon', pools: ['treasure', 'shop'],
      desc: 'Una mosca orbita a tu alrededor y daña al contacto.',
      color: '#b58cff',
      apply(p) { p.familiars += 1; },
    },
    {
      id: 'magnet', name: 'Imán de monedas', tier: 'uncommon', pools: ['shop', 'treasure'],
      desc: 'Atraes las monedas y objetos cercanos hacia ti.',
      color: '#ffd166',
      apply(p) { p.magnet = true; },
    },
    {
      id: 'charger', name: 'Golpe cargado', tier: 'rare', pools: ['treasure', 'boss'],
      desc: 'Si dejas de disparar un instante, el siguiente disparo es enorme.',
      color: '#ffe08a',
      apply(p) { p.charger = true; },
    },
    {
      id: 'thorns', name: 'Corona de espinas', tier: 'rare', pools: ['treasure', 'boss'],
      desc: 'Devuelves daño a quien te toca.',
      color: '#d8b0c0',
      apply(p) { p.thorns += 3; },
    },
    {
      id: 'doubletap', name: 'Doble intención', tier: 'uncommon', pools: ['treasure', 'shop'],
      desc: 'Probabilidad de soltar una ráfaga doble al disparar.',
      color: '#ffe3a0',
      apply(p) { p.doubleTap += 0.3; },
    },
    {
      id: 'greed', name: 'Mano generosa', tier: 'rare', pools: ['shop', 'boss'],
      desc: 'Cada 6 monedas que recoges te curan medio corazón.',
      color: '#ffcf5c',
      apply(p) { p.greed = true; },
    },
    {
      id: 'gust', name: 'Vendaval', tier: 'uncommon', pools: ['treasure', 'shop'],
      desc: 'Tus lágrimas empujan a los enemigos hacia atrás.',
      color: '#c8e6ff',
      apply(p) { p.pushback += 110; },
    },
    {
      id: 'catalyst', name: 'Catalizador', tier: 'epic', pools: ['boss'],
      desc: 'Potencia TODOS tus efectos (fuego, veneno, hielo, explosiones…).',
      color: '#ff7ae0',
      apply(p) { p.potency += 0.6; },
    },
    {
      id: 'prism', name: 'Prisma', tier: 'epic', pools: ['boss'],
      desc: '+0.7 de daño por cada efecto único que lleves.',
      color: '#b0f0ff',
      apply(p) { p.prism += 0.7; },
    },
    {
      id: 'phoenix', name: 'Pluma de fénix', tier: 'legendary', pools: ['shop'],
      desc: 'Revives una vez MÁS por piso. Muy rara: solo en la tienda.',
      color: '#ffcf5c',
      // Marcador: reviveBase() lo cuenta para las reanimaciones por piso.
      apply(p) { p.reviveMark = true; },
    },
  );

  // Formatea una diferencia numérica con signo.
  const fnum = (v, d) => {
    const n = Math.abs(v) < 5e-4 ? 0 : v;
    return (n >= 0 ? '+' : '') + n.toFixed(d);
  };

  // Elige un objeto de una pool ponderando por tier y evitando repetir los ya
  // poseídos (si es posible).
  function pickItem(pool, avoid) {
    const owned = avoid || [];
    const inPool = (i) => i.pools && i.pools.indexOf(pool) >= 0;
    let cand = ITEMS.filter((i) => inPool(i) && owned.indexOf(i.id) < 0);
    if (!cand.length) cand = ITEMS.filter(inPool);
    if (!cand.length) cand = ITEMS.filter((i) => owned.indexOf(i.id) < 0);
    if (!cand.length) cand = ITEMS.slice();
    const weighted = cand.map((i) => ({ it: i, w: tierOf(i).w }));
    return Utils.pickW(Math.random, weighted).it.id;
  }

  // Estadísticas que tocaría un objeto (para el aviso flotante). Se aplica
  // sobre una copia del jugador para no alterarlo de verdad.
  const STAT_SPEC = [
    { k: 'damage', label: 'Daño', fmt: (v) => fnum(v, 1) },
    { k: 'fireRate', label: 'Cadencia', fmt: (v) => fnum(v, 2) + '/s' },
    { k: 'speed', label: 'Velocidad', fmt: (v) => fnum(v, 0) },
    { k: 'maxHp', label: 'Vida máxima', fmt: (v) => fnum(v / 2, 1) + ' ♥' },
    { k: 'extraShots', label: 'Proyectiles', fmt: (v) => fnum(v, 0) },
    { k: 'bulletSpeed', label: 'Vel. de bala', fmt: (v) => fnum(v, 0) },
    { k: 'bulletSize', label: 'Tamaño de bala', fmt: (v) => fnum(v, 1) },
    { k: 'range', label: 'Alcance', fmt: (v) => fnum(v, 2) },
    { k: 'luck', label: 'Suerte', fmt: (v) => fnum(v, 0) },
    { k: 'armor', label: 'Armadura', fmt: (v) => fnum(v, 0) },
    { k: 'regen', label: 'Regeneración', fmt: (v) => fnum(v, 2) },
    { k: 'shield', label: 'Escudos', fmt: (v) => fnum(v, 0) },
    { k: 'revives', label: 'Vidas extra', fmt: (v) => fnum(v, 0) },
    { k: 'bounce', label: 'Rebotes', fmt: (v) => fnum(v, 0) },
    { k: 'coins', label: 'Monedas', fmt: (v) => fnum(v, 0) + '$' },
    { k: 'keys', label: 'Llaves', fmt: (v) => fnum(v, 0) },
    // efectos únicos
    { k: 'burn', label: 'Quemadura', fmt: (v) => fnum(v, 1) + ' s' },
    { k: 'poison', label: 'Veneno', fmt: (v) => fnum(v, 1) + ' s' },
    { k: 'freeze', label: 'Congelar', fmt: (v) => fnum(v, 1) },
    { k: 'chain', label: 'Cadena', fmt: (v) => fnum(v, 0) },
    { k: 'explode', label: 'Explosión', fmt: (v) => fnum(v, 0) },
    { k: 'boomerang', label: 'Bumerán', fmt: (v) => fnum(v, 0) },
    { k: 'familiars', label: 'Familiares', fmt: (v) => fnum(v, 0) },
    { k: 'thorns', label: 'Espinas', fmt: (v) => fnum(v, 0) },
    { k: 'doubleTap', label: 'Ráfaga doble', fmt: (v) => fnum(v * 100, 0) + '%' },
    { k: 'pushback', label: 'Empuje', fmt: (v) => fnum(v, 0) },
    { k: 'potency', label: 'Potencia', fmt: (v) => fnum(v, 2) + 'x' },
    { k: 'prism', label: 'Prisma', fmt: (v) => fnum(v, 2) },
  ];
  const BOOL_SPEC = [
    { k: 'piercing', label: 'Perforante' },
    { k: 'homing', label: 'Teledirigido' },
    { k: 'compass', label: 'Brújula' },
    { k: 'hasMap', label: 'Mapa del piso' },
    { k: 'lifesteal', label: 'Robo de vida' },
    { k: 'magnet', label: 'Imán' },
    { k: 'charger', label: 'Golpe cargado' },
    { k: 'greed', label: 'Codicia' },
  ];

  function itemStatDeltas(item, p) {
    if (!item || !p) return [];
    const before = {}, bBefore = {};
    for (const s of STAT_SPEC) before[s.k] = (typeof p[s.k] === 'number') ? p[s.k] : 0;
    for (const s of BOOL_SPEC) bBefore[s.k] = !!p[s.k];
    const clone = Object.assign({}, p);
    try { item.apply(clone); } catch (e) { /* objeto sin efecto aplicable */ }
    const out = [];
    for (const s of STAT_SPEC) {
      const after = (typeof clone[s.k] === 'number') ? clone[s.k] : 0;
      const d = after - before[s.k];
      if (Math.abs(d) > 5e-4) out.push({ label: s.label, text: s.fmt(d), positive: d > 0 });
    }
    for (const s of BOOL_SPEC) {
      if (!bBefore[s.k] && clone[s.k]) out.push({ label: s.label, text: '✓', positive: true });
    }
    return out;
  }

  // ---------------------------------------------------------
  // SINERGIAS: cuando llevas dos efectos que combinan, se activa una
  // mejora extra. Así los objetos se potencian entre sí.
  // ---------------------------------------------------------
  const SYNERGIES = [
    { id: 'toxicfire', name: 'Nube tóxica ardiente', need: ['burn', 'poison'], desc: 'Los enemigos que arden y están envenenados reciben el doble de daño por segundo.' },
    { id: 'shrapnel',  name: 'Metralla',             need: ['explode', 'bounce'], desc: 'Cada rebote de tus lágrimas suelta una explosión.' },
    { id: 'shatter',   name: 'Escarcha cortante',    need: ['freeze', 'piercing'], desc: 'Los enemigos congelados reciben un 50% más de daño.' },
    { id: 'storm',     name: 'Tormenta dirigida',    need: ['chain', 'homing'], desc: 'El rayo en cadena salta a un enemigo más.' },
    { id: 'volt',      name: 'Puño de trueno',       need: ['chain', 'pushback'], desc: 'El rayo también empuja a los enemigos.' },
    { id: 'bark',      name: 'Corteza viva',         need: ['thorns', 'armor'], desc: 'Duplica el daño de tus espinas y su alcance.' },
    { id: 'feast',     name: 'Banquete',             need: ['greed', 'lifesteal'], desc: 'Las monedas y el robo de vida curan el doble.' },
    { id: 'swarm',     name: 'Enjambre',             need: ['familiars2'], desc: 'Cada mosca extra hace mucho más daño.' },
    { id: 'minefield', name: 'Campo de minas',       need: ['boomerang', 'explode'], desc: 'Las explosiones son más grandes.' },
    { id: 'cryo',      name: 'Bomba de hielo',       need: ['freeze', 'explode'], desc: 'Las explosiones congelan a los enemigos.' },
    { id: 'overclock', name: 'Sobrecarga',           need: ['doubleTap', 'fastfire'], desc: 'Disparas ráfagas dobles mucho más a menudo.' },
    { id: 'rainbow',   name: 'Prisma total',         need: ['prism', 'manyEffects'], desc: 'El Prisma duplica su daño por efecto.' },
  ];

  const EFFECT_KEYS = ['burn', 'poison', 'freeze', 'chain', 'explode', 'boomerang', 'familiars', 'magnet', 'charger', 'thorns', 'doubleTap', 'greed', 'pushback'];

  // Cuenta cuántos efectos distintos lleva el jugador.
  function effectCount(p) {
    p = p || {};
    let n = 0;
    for (const k of EFFECT_KEYS) {
      const v = p[k];
      if (typeof v === 'boolean' ? v : (v || 0) > 0) n++;
    }
    return n;
  }

  // ¿Qué efectos "tiene" el jugador? (para decidir sinergias)
  function effectFlags(p) {
    p = p || {};
    return {
      burn: (p.burn || 0) > 0,
      poison: (p.poison || 0) > 0,
      freeze: (p.freeze || 0) > 0,
      chain: (p.chain || 0) > 0,
      explode: (p.explode || 0) > 0,
      boomerang: (p.boomerang || 0) > 0,
      familiars: (p.familiars || 0) > 0,
      familiars2: (p.familiars || 0) >= 2,
      magnet: !!p.magnet,
      charger: !!p.charger,
      thorns: (p.thorns || 0) > 0,
      doubleTap: (p.doubleTap || 0) > 0,
      greed: !!p.greed,
      pushback: (p.pushback || 0) > 0,
      potency: (p.potency || 1) > 1,
      prism: (p.prism || 0) > 0,
      homing: !!p.homing,
      piercing: !!p.piercing,
      bounce: (p.bounce || 0) > 0,
      armor: (p.armor || 0) > 0,
      lifesteal: !!p.lifesteal,
      fastfire: (p.fireRate || 0) >= 3.4,
      manyEffects: effectCount(p) >= 4,
    };
  }

  function activeSynergies(p) {
    const f = effectFlags(p);
    return SYNERGIES.filter((s) => s.need.every((k) => f[k]));
  }

  // Perfil de efectos efectivos: aquí es donde las sinergias cambian los
  // números de verdad. Todo lo que hace el juego consulta este perfil.
  function profile(p) {
    p = p || {};
    const syn = activeSynergies(p);
    const ids = syn.map((s) => s.id);
    const has = (id) => ids.indexOf(id) >= 0;
    const pot = Math.max(1, p.potency || 1);
    const f = effectFlags(p);
    const sizeBonus = Math.max(0, (p.bulletSize || 6.5) - 6.5) * 2;
    const explodeR = f.explode
      ? ((p.explode || 0) * (1 + (has('minefield') ? 0.35 : 0)) * (1 + (f.potency ? 0.4 : 0)) + sizeBonus)
      : 0;
    return {
      burn: f.burn ? (p.burn || 0) * pot : 0,
      burnDps: 1.3 * pot * (has('toxicfire') ? 2 : 1),
      poison: f.poison ? (p.poison || 0) * pot : 0,
      poisonDps: 0.9 * pot * (has('toxicfire') ? 2 : 1),
      freezeTime: f.freeze ? 1.8 * pot : 0,
      slowF: f.freeze ? Math.min(0.7, (p.freeze || 0) * 0.7) : 0,
      chain: f.chain ? (p.chain | 0) + (has('storm') ? 1 : 0) : 0,
      chainDmg: 0.55,
      chainPush: has('volt') ? 130 : 0,
      explodeR,
      explodeDmg: 0.7,
      cryo: has('cryo'),
      shrapnel: has('shrapnel'),
      shatter: has('shatter') ? 1.5 : 1,
      boomerang: f.boomerang ? 1 : 0,
      familiars: Math.min(3, p.familiars | 0),
      familiarDmg: f.familiars ? 3 + Math.max(0, (p.familiars | 0) - 1) * (has('swarm') ? 3 : 1.5) : 0,
      magnet: !!f.magnet,
      magnetR: has('feast') ? 170 : 125,
      charger: !!f.charger,
      chargeTime: has('overclock') ? 0.55 : 0.85,
      chargeMul: 2.4,
      thorns: f.thorns ? (p.thorns || 0) * (has('bark') ? 2 : 1) : 0,
      thornsR: has('bark') ? 64 : 46,
      doubleTap: f.doubleTap ? Math.min(1, (p.doubleTap || 0) * (has('overclock') ? 2 : 1)) : 0,
      greedHeal: f.greed ? (has('feast') ? 2 : 1) : 0,
      lifestealHeal: f.lifesteal ? (has('feast') ? 2 : 1) : 0,
      push: f.pushback ? (p.pushback || 0) : 0,
      bonusDamage: (p.prism || 0) * effectCount(p) * (has('rainbow') ? 2 : 1),
      effectCount: effectCount(p),
      synergies: syn,
    };
  }

  // Sinergias que se ACTIVARÍAN al coger este objeto (para el globo).
  function synergyWith(item, p) {
    if (!item || !p) return [];
    const before = activeSynergies(p).map((s) => s.id);
    const clone = Object.assign({}, p);
    try { item.apply(clone); } catch (e) { /* objeto sin efecto aplicable */ }
    return activeSynergies(clone).filter((s) => before.indexOf(s.id) < 0);
  }

  // Posición de una mosca familiar alrededor de su dueño: la usan tanto la
  // simulación como el dibujo, así siempre coinciden.
  function familiarPos(owner, i, n, time) {
    const a = time * 1.9 + (i / Math.max(1, n)) * Math.PI * 2;
    const r = 46 + Math.sin(time * 3 + i * 1.7) * 4;
    return { x: owner.x + Math.cos(a) * r, y: owner.y + Math.sin(a) * r * 0.85 };
  }

  // Recalcula las estadísticas derivadas a partir de la lista de objetos.
  // Se usa en los clientes online para tener los mismos números que el
  // anfitrión (el globo de objetos necesita valores reales).
  function recomputeStats(p) {
    if (!p) return p;
    const hp = (typeof p.hp === 'number') ? p.hp : 6;
    // Base del personaje (estadísticas propias + su pasiva).
    resetStats(p);
    // compass/hasMap, shield, revives, coins y keys los manda el anfitrión:
    // no se recalculan para no deshacer los gastos ni las banderas.
    for (const id of p.items || []) {
      const it = findItem(id);
      if (it && typeof it.apply === 'function') {
        try { it.apply(p); } catch (e) { /* objeto sin efecto aplicable */ }
      }
    }
    p.hp = Math.min(hp, p.maxHp);
    return p;
  }

  // ---------------------------------------------------------
  // JUGADOR
  // ---------------------------------------------------------
  function charOf(opts) {
    const CH = global.Characters;
    const id = opts && opts.char != null ? opts.char : 'isaac';
    if (CH) return CH.byId(id);
    return { id: id, skin: 0, stats: {}, passive: null, active: null };
  }
  const charIdOf = (p) => (p && p.charId) || 'isaac';

  // Valores base comunes a todos los personajes (los mismos para todos).
  const BASE_STATS = {
    maxHp: 6, speed: 192, damage: 3.4, fireRate: 2.4, bulletSpeed: 440, bulletSize: 6.5,
    extraShots: 0, piercing: false, range: 0.85, luck: 0, armor: 0,
    regen: 0, homing: false, bounce: 0, lifesteal: false,
    flying: false, shieldRegen: false, coinsHeal: false, allyHeal: false, rageOnHurt: false,
    burn: 0, poison: 0, freeze: 0, chain: 0, explode: 0, boomerang: 0,
    familiars: 0, magnet: false, charger: false, thorns: 0, doubleTap: 0,
    greed: false, pushback: 0, potency: 1, prism: 0, roomHeal: 0,
  };

  // Estadísticas base del personaje (incluye sus deltas, el azar de Edén y
  // su pasiva). NO toca los campos consumibles/sincronizados.
  function resetStats(p) {
    const ch = charOf({ char: charIdOf(p) });
    for (const k in BASE_STATS) p[k] = BASE_STATS[k];
    const st = ch.stats || {};
    for (const k in st) p[k] = (p[k] || 0) + st[k];
    if (ch.id === 'eden') {
      if (!p.randStats) p.randStats = rollEdenStats(p);
      for (const k in p.randStats) p[k] = (p[k] || 0) + p.randStats[k];
    }
    if (ch.passive && typeof ch.passive.apply === 'function') {
      try { ch.passive.apply(p); } catch (e) { /* pasiva inocua */ }
    }
    return p;
  }

  // Estadísticas aleatorias de Edén (una vez por partida).
  function rollEdenStats(p) {
    const rng = Utils.mulberry32(Utils.hash('eden:' + (p.id || '') + ':' + Math.floor(Math.random() * 1e9)));
    const out = {};
    out.maxHp = (Utils.randInt(rng, 0, 4) - 2) * 2;       // -2..+2 corazones
    out.damage = (rng() * 3 - 1.2);                        // -1.2..+1.8
    out.fireRate = (rng() * 1.4 - 0.4);
    out.speed = (rng() * 80 - 30);
    out.range = (rng() * 0.4 - 0.15);
    out.luck = (rng() * 4 - 1) | 0;
    out.bulletSize = (rng() * 3 - 1);
    for (const k in out) out[k] = Math.round(out[k] * 100) / 100;
    return out;
  }

  function createPlayer(id, opts) {
    opts = opts || {};
    const ch = charOf(opts);
    const skin = normSkin(opts.char != null ? ch.skin : (opts.skin != null ? opts.skin : 0));
    const sk = SKINS[skin];
    const p = {
      kind: 'player',
      id,
      name: opts.name || 'Jugador',
      slot: opts.slot || 0,
      color: opts.color || sk.color,
      skin,
      charId: ch.id,
      scheme: opts.scheme || 'p1',
      local: !!opts.local,
      remote: !!opts.remote,

      x: opts.x != null ? opts.x : C.CX,
      y: opts.y != null ? opts.y : C.CY,
      r: 12,
      vx: 0, vy: 0,
      aim: { x: 0, y: 1 },
      face: { x: 0, y: 1 },
      walkPhase: 0,

      // ---- estadísticas derivadas (las rellena resetStats) ----
      hp: 6, maxHp: 6,
      speed: 192, damage: 3.4, fireRate: 2.4, bulletSpeed: 440, bulletSize: 6.5,
      extraShots: 0, piercing: false, range: 0.85, luck: 0, armor: 0,
      regen: 0, homing: false, bounce: 0, lifesteal: false,
      flying: false, shieldRegen: false, coinsHeal: false, allyHeal: false, rageOnHurt: false,
      roomHeal: 0,

      // ---- efectos únicos ----
      burn: 0, poison: 0, freeze: 0, chain: 0, explode: 0, boomerang: 0,
      familiars: 0, magnet: false, charger: false, thorns: 0, doubleTap: 0,
      greed: false, pushback: 0, potency: 1, prism: 0,

      // ---- habilidad activa ----
      abCharges: 0, abMax: 0, abCd: 0, abCdMax: 1,

      // ---- mejoras temporales (activas) ----
      buff: { dmg: 0, dmgT: 0, fire: 0, fireT: 0, spd: 0, spdT: 0, fam: 0, famT: 0 },

      shootCd: 0,
      invuln: 0,
      hurtFlash: 0,
      anim: 0,
      dead: false,
      reviveTimer: 0,

      // consumibles y estado de partida (recomputeStats NO los toca)
      coins: 0,
      keys: 0,
      shield: 0,
      revives: 0,
      compass: false,
      hasMap: false,
      items: [],

      input: { mx: 0, my: 0, sx: 0, sy: 0, fire: false, use: false },
      // predicción en cliente
      srvX: null, srvY: null,
      ping: 0,
    };
    resetStats(p);
    p.hp = p.maxHp;
    if (opts.hp != null) p.hp = opts.hp;
    p.abMax = ch.active ? ch.active.charges : 0;
    p.abCharges = p.abMax;
    p.abCdMax = ch.active ? ch.active.cd : 1;
    if (opts.abCharges != null) p.abCharges = opts.abCharges;
    return p;
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
    ghost: {
      // Espectro: persigue sin chocar con nada (atraviesa obstáculos).
      hp: 11, speed: 99, r: 15, dmg: 1, ai: 'chase', color: '#bcd4ff',
      xp: 2, phase: true, ghostly: true,
    },
    sniper: {
      // Francotirador: se mantiene lejos y dispara rápido y con puntería.
      hp: 16, speed: 44, r: 16, dmg: 2, ai: 'shoot', color: '#e0b0ff',
      xp: 3, shotRate: 2.6, shotSpeed: 300, keepDist: 265, shootRange: 560,
    },
    boss: {
      hp: 150, speed: 62, r: 30, dmg: 1, ai: 'boss', color: '#b04a5e',
      xp: 10, shotRate: 2.2, shotSpeed: 150, isBoss: true, bossStyle: 'burst',
      look: { c1: '#d4647a', c2: '#6d2333', horns: true },
    },
    boss2: {
      // Cargador: embiste en línea recta y suelta un anillo al frenar.
      hp: 170, speed: 150, r: 30, dmg: 1, ai: 'boss', color: '#e0a53a',
      xp: 11, shotRate: 2.0, shotSpeed: 145, isBoss: true, bossStyle: 'charge',
      look: { c1: '#e0a53a', c2: '#7a4e08', horns: true, spikes: true },
    },
    boss3: {
      // Devorador: gira soltando un chorro en espiral de balas lentas.
      hp: 185, speed: 42, r: 32, dmg: 1, ai: 'boss', color: '#8f5fd0',
      xp: 12, shotRate: 2.0, shotSpeed: 132, isBoss: true, bossStyle: 'spiral',
      look: { c1: '#9a6ada', c2: '#43236b', eyes: 3 },
    },
    boss4: {
      // Espectro: se teletransporta y dispara en abanico apuntado.
      hp: 155, speed: 72, r: 28, dmg: 1, ai: 'boss', color: '#9fd0e6',
      xp: 12, shotRate: 2.0, shotSpeed: 162, isBoss: true, bossStyle: 'teleport',
      look: { c1: '#a8d6ea', c2: '#3d6a8a', ghost: true, eyes: 2 },
    },
    boss5: {
      // Baboso: salta y al caer suelta un anillo; al morir se parte en moscas.
      hp: 200, speed: 112, r: 34, dmg: 1, ai: 'boss', color: '#7fd18a',
      xp: 13, shotRate: 2.2, shotSpeed: 138, isBoss: true, bossStyle: 'hop',
      splits: 4, look: { c1: '#7fd18a', c2: '#3b7a4a', blobby: true, eyes: 1 },
    },
    boss6: {
      // Serafín: vuela y deja bombas de plumas que estallan en anillo.
      hp: 175, speed: 80, r: 30, dmg: 1, ai: 'boss', color: '#ffe3a8',
      xp: 13, shotRate: 2.0, shotSpeed: 150, isBoss: true, bossStyle: 'feather',
      look: { c1: '#ffe3a8', c2: '#c08a2a', wings: true, halo: true },
    },
    boss7: {
      // Cráneo: dispara huesos que rebotan en las paredes.
      hp: 190, speed: 56, r: 30, dmg: 1, ai: 'boss', color: '#d8d4c8',
      xp: 14, shotRate: 2.2, shotSpeed: 172, isBoss: true, bossStyle: 'skull',
      look: { c1: '#e2ddd0', c2: '#6a6458', skull: true },
    },
    boss8: {
      // Colmena: espiral de proyectiles e invoca moscas sin parar.
      hp: 215, speed: 50, r: 34, dmg: 1, ai: 'boss', color: '#e8bd4a',
      xp: 15, shotRate: 2.2, shotSpeed: 130, isBoss: true, bossStyle: 'summon',
      look: { c1: '#e8bd4a', c2: '#7a4a10', eyes: 3, honey: true },
    },
  };

  // Orden de jefes por piso (el piso 1 usa el primero, etc.).
  const BOSS_ROSTER = ['boss', 'boss2', 'boss3', 'boss4', 'boss5', 'boss6', 'boss7', 'boss8'];

  // Cada piso dispone de una bolsa de AL MENOS 3 jefes; al entrar en su sala
  // se elige UNO al azar (de forma determinista por semilla). Los primeros
  // pisos traen jefes "básicos" y los últimos a los más peligrosos, de modo
  // que la dificultad sube piso a piso aunque el jefe sea aleatorio.
  const BOSS_POOLS = [
    ['boss', 'boss2', 'boss4'],
    ['boss2', 'boss3', 'boss5'],
    ['boss3', 'boss4', 'boss6'],
    ['boss4', 'boss5', 'boss7'],
    ['boss5', 'boss6', 'boss8'],
    ['boss6', 'boss7', 'boss1'],
    ['boss7', 'boss8', 'boss2'],
    ['boss8', 'boss1', 'boss3'],
    ['boss1', 'boss2', 'boss3', 'boss4', 'boss5', 'boss6', 'boss7', 'boss8'],
  ];

  // Vida objetivo de un jefe según el piso (progresión clara de dificultad).
  function bossTargetHp(floorNum) {
    const f = Math.max(1, floorNum | 0);
    return 150 * (1 + (f - 1) * 0.55);
  }

  function createEnemy(type, x, y, floorNum) {
    const t = ENEMY_TYPES[type] || ENEMY_TYPES.fly;
    const f = Math.max(1, floorNum | 0);
    let hp, spMul, shotMul = 1;
    if (t.isBoss) {
      // Todos los jefes del mismo piso comparten vida objetivo; el orden en la
      // rotación sólo añade un pequeño matiz, nunca rompe la progresión.
      const idx = Math.max(0, BOSS_ROSTER.indexOf(type));
      hp = Math.round(bossTargetHp(f) * (1 + idx * 0.04));
      spMul = 1 + (f - 1) * 0.045;
      shotMul = 1 + (f - 1) * 0.03;
    } else {
      hp = Math.round(t.hp * (1 + (f - 1) * 0.55));
      spMul = 1 + (f - 1) * 0.07;
    }
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
      phase: !!t.phase,
      xp: t.xp || 1,
      splits: t.splits || 0,
      shotRate: t.shotRate || 0,
      shotSpeed: t.shotSpeed ? t.shotSpeed * shotMul : 0,
      keepDist: t.keepDist || 0,
      shootRange: t.shootRange || 0,
      shotCd: 0.6 + Math.random() * 0.9,
      // estado de IA
      dir: { x: 0, y: 0 },
      chargeT: 0,
      chargeCd: 0.7,
      hopCd: 0,
      hopV: { x: 0, y: 0 },
      anim: Math.random() * 10,
      flash: 0,
      spawnT: 1.0,           // gracia de aparición: no ataca ni se mueve
      knock: { x: 0, y: 0 },
      bossPhase: 0,
      bossTimer: 3,
      bossBurst: 0,
      bossSpin: 0,
      bossShootCd: 0,
      bossTele: 0,
      bossAir: false,
      sumCd: 2.5,
      isBoss: !!t.isBoss,
      bossStyle: t.bossStyle || null,
      look: t.look || null,
      bounce: t.bounce || 0,
      // estados alterados (fuego, veneno, hielo)
      burn: 0, burnDps: 0,
      poison: 0, poisonDps: 0,
      slow: 0, slowF: 0,
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
      bounce: opts.bounce || 0,
      homing: !!opts.homing,
      fuse: opts.fuse != null ? opts.fuse : 0,
      ring: opts.ring || 8,
      // efectos de la lágrima (fuego, veneno, hielo, explosión, rayo…)
      explode: opts.explode || 0,
      chain: opts.chain || 0,
      burn: opts.burn || 0, burnDps: opts.burnDps || 0,
      poison: opts.poison || 0, poisonDps: opts.poisonDps || 0,
      freeze: opts.freeze || 0, slowF: opts.slowF || 0,
      cryo: !!opts.cryo,
      push: opts.push || 0,
      shatter: opts.shatter || 1,
      boomerang: opts.boomerang || 0,
      shrapnel: !!opts.shrapnel,
      back: false,
      backT: 0,
    };
  }

  // ---------------------------------------------------------
  // RECOGIBLES
  // ---------------------------------------------------------
  function createPickup(type, x, y, opts) {
    opts = opts || {};
    const a = Math.random() * Math.PI * 2;
    const sp = opts.pop === false ? 0 : 60 + Math.random() * 70;
    const isChest = type === 'chest';
    return {
      kind: 'pickup',
      id: newId(),
      type, // 'heart' | 'halfheart' | 'coin' | 'key' | 'trapdoor' | 'relic' | 'chest'
      x, y,
      r: type === 'trapdoor' ? 26 : (isChest ? 16 : 13),
      vx: Math.cos(a) * sp,
      vy: Math.sin(a) * sp,
      life: opts.life || 0,   // 0 = permanente
      age: 0,
      price: opts.price || 0, // monedas (tienda)
      keys: opts.keys || 0,   // llaves necesarias para abrir un cofre (0 = gratis)
      bob: Math.random() * 6.28,
      lock: opts.lock || 0,   // segundos de bloqueo tras aparecer (no se puede coger)
    };
  }

  // ---------------------------------------------------------
  // PEDESTALES (objetos)
  // ---------------------------------------------------------
  function createPedestal(itemId, x, y, price, lock) {
    return {
      kind: 'pedestal',
      id: newId(),
      itemId,
      x, y,
      price: price || 0,
      taken: false,
      bob: Math.random() * 6.28,
      lock: lock || 0,   // segundos de bloqueo tras aparecer
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
    COLORS, NAMES_1, ITEMS, ENEMY_TYPES, SKINS, skinAt, skinColor, normSkin,
    newId, resetIds, itemById, findItem,
    TIERS, tierOf, ITEM_META, pickItem, itemStatDeltas, BOSS_ROSTER, BOSS_POOLS, bossTargetHp, recomputeStats,
    SYNERGIES, activeSynergies, synergyWith, profile, effectCount, familiarPos,
    STAT_SPEC, BOOL_SPEC, BASE_STATS, resetStats, charOf, charIdOf, rollEdenStats,
    createPlayer, createEnemy, createBullet, createPickup, createPedestal,
    spawnParticles,
  };
})(typeof window !== 'undefined' ? window : globalThis);
