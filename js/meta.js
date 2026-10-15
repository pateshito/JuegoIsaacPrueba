/* ============================================================
   meta.js — progreso persistente del jugador (localStorage)
   Guarda: monedas de progreso, personajes desbloqueados/comprables,
   estadísticas acumuladas y logros.
   Expone el global `Meta`.
   ============================================================ */
(function (global) {
  'use strict';

  const KEY = 'llanto-meta-v1';
  const KEY_ACH = 'llanto-ach-v1';

  // ---------------------------------------------------------
  // Logros (solo se consiguen una vez)
  // ---------------------------------------------------------
  const ACHIEVEMENTS = [
    { id: 'first_blood', name: 'Primera sangre', desc: 'Elimina a tu primer enemigo.' },
    { id: 'floor5', name: 'Cinco pisos', desc: 'Llega al piso 5.' },
    { id: 'win', name: 'Liberación', desc: 'Supera los 9 pisos.' },
    { id: 'bosses3', name: 'Cazajefes', desc: 'Derrota a 3 jefes.' },
    { id: 'allbosses', name: 'Todos los jefes', desc: 'Derrota a los 8 jefes distintos.' },
    { id: 'kills50', name: 'Verdugo', desc: 'Elimina 50 enemigos en total.' },
    { id: 'kills250', name: 'Aniquilador', desc: 'Elimina 250 enemigos en total.' },
    { id: 'collector', name: 'Coleccionista', desc: 'Ten 15 objetos en una partida.' },
    { id: 'team', name: 'En equipo', desc: 'Juega una partida cooperativa.' },
    { id: 'rich', name: 'Ahorrador', desc: 'Reúne 300 monedas de progreso.' },
    { id: 'strange', name: 'Suceso extraño', desc: 'Presencia un evento raro.' },
    { id: 'unlockall', name: 'Roster completo', desc: 'Desbloquea todos los personajes.' },
  ];
  const ACH_BY_ID = {};
  for (const a of ACHIEVEMENTS) ACH_BY_ID[a.id] = a;

  function defaults() {
    return {
      coins: 0,
      unlocked: ['isaac', 'maggy'],
      shopUnlocked: [],          // personajes ocultos cuya compra se habilitó
      stats: { runs: 0, wins: 0, totalKills: 0, bestFloor: 0, bosses: {}, events: 0, itemsMax: 0, coinsEarned: 0 },
    };
  }

  let data = defaults();
  let achievements = {};   // id -> timestamp
  let loaded = false;
  const pending = [];      // logros recién conseguidos (para avisos)

  function safeGet(k) {
    try { return global.localStorage ? global.localStorage.getItem(k) : null; } catch (e) { return null; }
  }
  function safeSet(k, v) {
    try { if (global.localStorage) global.localStorage.setItem(k, v); } catch (e) {}
  }
  function safeDel(k) {
    try { if (global.localStorage) global.localStorage.removeItem(k); } catch (e) {}
  }

  function load() {
    if (loaded) return;
    loaded = true;
    try {
      const raw = safeGet(KEY);
      if (raw) {
        const d = JSON.parse(raw);
        if (d && typeof d === 'object') {
          data = Object.assign(defaults(), d);
          data.stats = Object.assign(defaults().stats, d.stats || {});
          if (!Array.isArray(data.unlocked) || !data.unlocked.length) data.unlocked = ['isaac', 'maggy'];
          if (!Array.isArray(data.shopUnlocked)) data.shopUnlocked = [];
        }
      }
      const rawA = safeGet(KEY_ACH);
      if (rawA) { const a = JSON.parse(rawA); if (a && typeof a === 'object') achievements = a; }
    } catch (e) { data = defaults(); achievements = {}; }
  }

  function save() {
    safeSet(KEY, JSON.stringify(data));
    safeSet(KEY_ACH, JSON.stringify(achievements));
  }

  const get = () => (load(), data);

  // ---------------------------------------------------------
  // Monedas y desbloqueos
  // ---------------------------------------------------------
  function addCoins(n) {
    load();
    n = Math.max(0, Math.floor(n || 0));
    data.coins += n;
    data.stats.coinsEarned += n;
    grantIf(data.stats.coinsEarned >= 300, 'rich');
    save();
    return n;
  }

  function spend(n) {
    load();
    n = Math.max(0, Math.floor(n || 0));
    if (data.coins < n) return false;
    data.coins -= n;
    save();
    return true;
  }

  const isUnlocked = (id) => (load(), data.unlocked.indexOf(id) >= 0);

  function unlockChar(id) {
    load();
    if (data.unlocked.indexOf(id) < 0) {
      data.unlocked.push(id);
      checkUnlockAll();
      save();
      return true;
    }
    return false;
  }

  const isShopUnlocked = (id) => (load(), data.shopUnlocked.indexOf(id) >= 0);
  function unlockShop(id) {
    load();
    if (data.shopUnlocked.indexOf(id) < 0) { data.shopUnlocked.push(id); save(); return true; }
    return false;
  }

  function checkUnlockAll() {
    const chars = (global.Characters && global.Characters.LIST) || [];
    if (chars.length && data.unlocked.length >= chars.length) grantIf(true, 'unlockall');
  }

  // ¿Se puede comprar este personaje? (dinero + requisito + visible)
  function charStatus(char) {
    load();
    if (isUnlocked(char.id)) return { state: 'owned' };
    if (char.hidden && !isShopUnlocked(char.id)) return { state: 'hidden' };
    const req = char.req;
    let ok = true, reason = '';
    if (req) {
      ok = reqMet(req);
      reason = ok ? '' : (req.text || 'Requisito no cumplido');
    }
    if (!ok) return { state: 'locked', reason };
    return { state: 'buyable', cost: char.cost || 0, affordable: data.coins >= (char.cost || 0) };
  }

  function reqMet(req) {
    load();
    const s = data.stats;
    switch (req.type) {
      case 'bestFloor': return s.bestFloor >= req.value;
      case 'bosses': return Object.keys(s.bosses || {}).length >= req.value;
      case 'achievements': return achievementCount() >= req.value;
      case 'events': return (s.events || 0) >= req.value;
      default: return true;
    }
  }

  // Compra: gasta monedas y desbloquea (si cumple lo anterior).
  function buyChar(char) {
    const st = charStatus(char);
    if (st.state === 'owned') return { ok: true, already: true };
    if (st.state !== 'buyable') return { ok: false, reason: st.reason || 'No disponible' };
    if (!spend(st.cost)) return { ok: false, reason: 'Te faltan monedas' };
    unlockChar(char.id);
    return { ok: true };
  }

  // ---------------------------------------------------------
  // Estadísticas y logros
  // ---------------------------------------------------------
  function achievementCount() { load(); return Object.keys(achievements).length; }
  const hasAchievement = (id) => (load(), !!achievements[id]);

  function grant(id) {
    load();
    if (!id || achievements[id]) return false;
    if (!ACH_BY_ID[id]) return false;
    achievements[id] = Date.now();
    pending.push(id);
    save();
    return true;
  }
  function grantIf(cond, id) { if (cond) return grant(id); return false; }

  // Devuelve (y vacía) los logros conseguidos desde la última consulta.
  function drainToasts() {
    const out = pending.slice();
    pending.length = 0;
    return out;
  }

  function killEnemy() {
    load();
    data.stats.totalKills++;
    grantIf(data.stats.totalKills >= 1, 'first_blood');
    grantIf(data.stats.totalKills >= 50, 'kills50');
    grantIf(data.stats.totalKills >= 250, 'kills250');
    save();
  }
  function reachFloor(f) {
    load();
    if (f > data.stats.bestFloor) data.stats.bestFloor = f;
    grantIf(f >= 5, 'floor5');
    save();
  }
  function bossKilled(type) {
    load();
    data.stats.bosses[type] = (data.stats.bosses[type] || 0) + 1;
    const n = Object.keys(data.stats.bosses).length;
    grantIf(n >= 3, 'bosses3');
    grantIf(n >= 8, 'allbosses');
    save();
  }
  function recordItems(n) {
    load();
    if (n > data.stats.itemsMax) data.stats.itemsMax = n;
    grantIf(n >= 15, 'collector');
    save();
  }
  function recordEvent() {
    load();
    data.stats.events = (data.stats.events || 0) + 1;
    grant('strange');
    save();
  }
  function recordCoop() { load(); grant('team'); save(); }
  function recordWin() {
    load();
    data.stats.wins++;
    grant('win');
    save();
  }

  // ---------------------------------------------------------
  // Fin de partida: recompensa y resumen
  // ---------------------------------------------------------
  function finishRun(summary) {
    load();
    const floor = Math.max(1, summary.floor || 1);
    const kills = Math.max(0, summary.kills || 0);
    const win = !!summary.win;
    const reward = floor * 6 + Math.floor(kills / 2) + (win ? 200 : 0);
    addCoins(reward);
    data.stats.runs++;
    reachFloor(floor);
    if (win) recordWin();
    recordItems(summary.items || 0);
    save();
    return {
      coins: reward,
      total: data.coins,
      newly: [],
    };
  }

  // ---------------------------------------------------------
  // Reinicios
  // ---------------------------------------------------------
  function resetAll() {
    data = defaults();
    achievements = {};
    pending.length = 0;
    safeDel(KEY);
    safeDel(KEY_ACH);
    save();
  }
  function resetAchievements() {
    achievements = {};
    pending.length = 0;
    safeDel(KEY_ACH);
    save();
  }

  global.Meta = {
    ACHIEVEMENTS, ACH_BY_ID,
    load, save, get, addCoins, spend,
    isUnlocked, unlockChar, isShopUnlocked, unlockShop, charStatus, buyChar, reqMet,
    grant, hasAchievement, achievementCount, drainToasts,
    killEnemy, reachFloor, bossKilled, recordItems, recordEvent, recordCoop, recordWin,
    finishRun, resetAll, resetAchievements,
    get coins() { return get().coins; },
  };
})(typeof window !== 'undefined' ? window : globalThis);
