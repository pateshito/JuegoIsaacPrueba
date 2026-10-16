/* ============================================================
   meta.js — progreso persistente del jugador (localStorage)
   Guarda: personajes desbloqueados, estadísticas acumuladas,
   desafíos completados y logros. YA NO HAY MONEDAS DE PROGRESO:
   los personajes se consiguen cumpliendo retos concretos dentro
   de la partida o completando desafíos.
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
    { id: 'strange', name: 'Suceso extraño', desc: 'Presencia un evento raro.' },
    { id: 'challenger', name: 'Desafiante', desc: 'Completa un desafío.' },
    { id: 'challenger_all', name: 'Leyenda', desc: 'Completa todos los desafíos.' },
    { id: 'unlockall', name: 'Roster completo', desc: 'Desbloquea todos los personajes.' },
  ];
  const ACH_BY_ID = {};
  for (const a of ACHIEVEMENTS) ACH_BY_ID[a.id] = a;

  function defaults() {
    return {
      unlocked: ['isaac', 'maggy'],
      stats: {
        runs: 0, wins: 0, totalKills: 0, bestFloor: 0,
        bosses: {}, events: 0, itemsMax: 0, charsPlayed: {}, challenges: {},
      },
    };
  }

  let data = defaults();
  let achievements = {};   // id -> timestamp
  let loaded = false;
  const pending = [];        // logros recién conseguidos (para avisos)
  const pendingChars = [];   // personajes recién desbloqueados (para avisos)

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
          if (!data.stats.bosses || typeof data.stats.bosses !== 'object') data.stats.bosses = {};
          if (!data.stats.charsPlayed || typeof data.stats.charsPlayed !== 'object') data.stats.charsPlayed = {};
          if (!data.stats.challenges || typeof data.stats.challenges !== 'object') data.stats.challenges = {};
          // Migración: versiones antiguas guardaban monedas de progreso.
          delete data.coins;
          delete data.shopUnlocked;
          if (data.stats) delete data.stats.coinsEarned;
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
  // Personajes: desbloqueo por requisitos (sin monedas)
  // ---------------------------------------------------------
  const isUnlocked = (id) => (load(), data.unlocked.indexOf(id) >= 0);

  function unlockChar(id) {
    load();
    if (data.unlocked.indexOf(id) < 0) {
      data.unlocked.push(id);
      pendingChars.push(id);
      checkUnlockAll();
      save();
      return true;
    }
    return false;
  }

  function checkUnlockAll() {
    const chars = (global.Characters && global.Characters.LIST) || [];
    if (chars.length && data.unlocked.length >= chars.length) grantIf(true, 'unlockall');
  }

  const challengeDone = (id) => (load(), !!(data.stats.challenges && data.stats.challenges[id]));

  // ¿Se cumple un requisito de desbloqueo?
  function reqMet(req) {
    load();
    if (!req) return true;
    const s = data.stats;
    switch (req.type) {
      case 'bestFloor': return s.bestFloor >= req.value;
      case 'bosses': return Object.keys(s.bosses || {}).length >= req.value;
      case 'achievements': return achievementCount() >= req.value;
      case 'events': return (s.events || 0) >= req.value;
      case 'kills': return s.totalKills >= req.value;
      case 'runs': return s.runs >= req.value;
      case 'wins': return s.wins >= req.value;
      case 'win': return s.wins >= (req.value || 1);
      case 'challenge': return challengeDone(req.value);
      default: return true;
    }
  }

  // Estado de un personaje: owned | locked (con motivo).
  function charStatus(char) {
    load();
    if (isUnlocked(char.id)) return { state: 'owned' };
    const req = char.req;
    if (req && reqMet(req)) { unlockChar(char.id); return { state: 'owned' }; }
    return { state: 'locked', reason: (req && req.text) || 'Bloqueado', req: req || null };
  }

  // Desbloquea automáticamente los personajes cuyo requisito ya se cumple.
  function refreshUnlocks() {
    load();
    const chars = (global.Characters && global.Characters.LIST) || [];
    let changed = false;
    for (const c of chars) {
      if (isUnlocked(c.id)) continue;
      if (c.unlocked) { data.unlocked.push(c.id); changed = true; continue; }
      if (c.req && reqMet(c.req)) { data.unlocked.push(c.id); pendingChars.push(c.id); changed = true; }
    }
    if (changed) { checkUnlockAll(); save(); }
    return changed;
  }

  // Devuelve (y vacía) los personajes desbloqueados desde la última consulta.
  function drainUnlocked() {
    const out = pendingChars.slice();
    pendingChars.length = 0;
    return out;
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
    refreshUnlocks();
    save();
  }
  function reachFloor(f) {
    load();
    if (f > data.stats.bestFloor) data.stats.bestFloor = f;
    grantIf(f >= 5, 'floor5');
    refreshUnlocks();
    save();
  }
  function bossKilled(type) {
    load();
    data.stats.bosses[type] = (data.stats.bosses[type] || 0) + 1;
    const n = Object.keys(data.stats.bosses).length;
    grantIf(n >= 3, 'bosses3');
    grantIf(n >= 8, 'allbosses');
    refreshUnlocks();
    save();
  }
  function recordItems(n) {
    load();
    if (n > data.stats.itemsMax) data.stats.itemsMax = n;
    grantIf(n >= 15, 'collector');
    refreshUnlocks();
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
    refreshUnlocks();
    save();
  }

  // Marca un desafío como completado (y desbloquea lo que corresponda).
  function recordChallenge(id) {
    load();
    if (!id) return false;
    if (!data.stats.challenges) data.stats.challenges = {};
    const first = !data.stats.challenges[id];
    data.stats.challenges[id] = Date.now();
    grant('challenger');
    const all = (global.Challenges && global.Challenges.LIST) || [];
    if (all.length && all.every((c) => data.stats.challenges[c.id])) grant('challenger_all');
    refreshUnlocks();
    save();
    return first;
  }

  // ---------------------------------------------------------
  // Fin de partida: resumen (sin monedas)
  // ---------------------------------------------------------
  function finishRun(summary) {
    load();
    summary = summary || {};
    const floor = Math.max(1, summary.floor || 1);
    const win = !!summary.win;
    data.stats.runs++;
    reachFloor(floor);
    if (win) recordWin();
    if (win && summary.challenge) recordChallenge(summary.challenge);
    recordItems(summary.items || 0);
    refreshUnlocks();
    save();
    return { newly: drainUnlocked() };
  }

  // ---------------------------------------------------------
  // Reinicios
  // ---------------------------------------------------------
  function resetAll() {
    data = defaults();
    achievements = {};
    pending.length = 0;
    pendingChars.length = 0;
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
    load, save, get,
    isUnlocked, unlockChar, charStatus, reqMet, refreshUnlocks, drainUnlocked,
    challengeDone, recordChallenge,
    grant, hasAchievement, achievementCount, drainToasts,
    killEnemy, reachFloor, bossKilled, recordItems, recordEvent, recordCoop, recordWin,
    finishRun, resetAll, resetAchievements,
  };
})(typeof window !== 'undefined' ? window : globalThis);
