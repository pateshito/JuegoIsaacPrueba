/* ============================================================
   characters.js — personajes jugables con estadísticas propias,
   una PASIVA (siempre activa) y una ACTIVA (con cargas y recarga).
   Expone el global `Characters`.
   ------------------------------------------------------------
   Las activas solo definen su "id"; el efecto real vive en
   game.js (ACTIVES) para no crear dependencias circulares.
   ============================================================ */
(function (global) {
  'use strict';

  // Deltas aditivos sobre las estadísticas base del jugador.
  // Los campos especiales (flying, shieldRegen, coinsHeal, allyHeal,
  // rageOnHurt, familiars, thorns, lifesteal, regen, luck) los aplica
  // `Entities.recomputeStats` a través de la pasiva.
  const LIST = [
    {
      id: 'isaac', name: 'Devoto', skin: 0,
      desc: 'Equilibrado y fiel. Empieza con un corazón de más.',
      stats: {},
      passive: { id: 'faith', name: 'Fe', desc: '+1 contenedor de corazón.', apply(p) { p.maxHp += 2; } },
      active: { id: 'tears', name: 'Ráfaga de Lágrimas', desc: 'Ráfaga de lágrimas en todas direcciones.', charges: 1, kills: 4 },
      unlocked: true,
    },
    {
      id: 'maggy', name: 'Tanque Santa', skin: 1,
      desc: 'Tanque lento. Su vitalidad la cura al limpiar salas.',
      stats: { maxHp: 2, speed: -34, damage: 0.4 },
      passive: { id: 'vitality', name: 'Vitalidad', desc: 'Al limpiar una sala, 15% de curarte 1 corazón.', apply(p) { p.roomHeal += 0.15; } },
      active: { id: 'heal', name: 'Sanación', desc: 'Te curas 1 corazón y ganas inmunidad breve.', charges: 1, kills: 12 },
      unlocked: true,
    },
    {
      id: 'cain', name: 'Buscador', skin: 2,
      desc: 'Rápido y con suerte, pero frágil. Su activa revela el piso.',
      stats: { maxHp: -2, speed: 26, luck: 2, damage: 0.2 },
      passive: { id: 'luck', name: 'Buena Suerte', desc: '+2 de suerte: mejor botín.', apply(p) { p.luck += 2; } },
      active: { id: 'reveal', name: 'Cartógrafo', desc: 'Revela todo el mapa del piso.', charges: 1, kills: 5 },
      req: { type: 'bestFloor', value: 2, text: 'Llega al piso 2' },
    },
    {
      id: 'judas', name: 'Sacrificado', skin: 3,
      desc: 'Daño brutal a cambio de muy poca vida.',
      stats: { maxHp: -4, damage: 1.6, fireRate: -0.2 },
      passive: { id: 'zeal', name: 'Fervor', desc: '+0.6 de daño.', apply(p) { p.damage += 0.6; } },
      active: { id: 'dagger', name: 'Daga Perforante', desc: 'Lanza una daga perforante devastadora.', charges: 1, kills: 8 },
      req: { type: 'bosses', value: 1, text: 'Derrota a tu primer jefe' },
    },
    {
      id: 'azazel', name: 'Alado', skin: 4,
      desc: 'Vuela y dispara corto pero fuerte.',
      stats: { maxHp: -2, damage: 0.9, range: -0.4, speed: 14 },
      passive: { id: 'fly', name: 'Alas', desc: 'Vuela: atraviesas obstáculos.', apply(p) { p.flying = true; } },
      active: { id: 'blast', name: 'Aliento Explosivo', desc: 'Explosión de daño en la dirección apuntada.', charges: 1, kills: 12 },
      req: { type: 'bestFloor', value: 4, text: 'Llega al piso 4' },
    },
    {
      id: 'eden', name: 'Caos', skin: 5,
      desc: 'Sus estadísticas son aleatorias en cada partida.',
      stats: {},
      passive: { id: 'random', name: 'Azar', desc: 'Empiezas con estadísticas aleatorias.', special: true, apply() {} },
      active: { id: 'reroll', name: 'Reiniciar', desc: 'Cambia el objeto del pedestal más cercano.', charges: 1, kills: 6 },
      req: { type: 'challenge', value: 'rabia', text: 'Completa el desafío «Rabia»' },
    },
    {
      id: 'ghost', name: 'Espectro', skin: 6,
      desc: 'Atraviesa obstáculos. Su activa lo hace intangible.',
      stats: { maxHp: -2, speed: 10 },
      passive: { id: 'spirit', name: 'Incorpóreo', desc: 'Atraviesas obstáculos.', apply(p) { p.flying = true; } },
      active: { id: 'phase', name: 'Fase', desc: 'Inmune durante 3 s.', charges: 1, kills: 14 },
      req: { type: 'challenge', value: 'fragil', text: 'Completa el desafío «Corazón de cristal»' },
    },
    {
      id: 'robot', name: 'Autómata', skin: 7,
      desc: 'Dispara rápido y regenera escudos.',
      stats: { fireRate: 0.3, damage: -0.3, bulletSpeed: 60 },
      passive: { id: 'shielding', name: 'Blindaje', desc: 'Recuperas un escudo con el tiempo.', apply(p) { p.shieldRegen = true; } },
      active: { id: 'overclock', name: 'Sobrecarga', desc: 'Disparas al doble de cadencia 4 s.', charges: 1, kills: 12 },
      req: { type: 'challenge', value: 'desnudo', text: 'Completa el desafío «Manos vacías»' },
    },
    {
      id: 'devil', name: 'Chupasangre', skin: 8,
      desc: 'Roba vida al matar.',
      stats: { maxHp: -2, damage: 0.5 },
      passive: { id: 'leech', name: 'Sanguijuela', desc: 'Robas vida al eliminar enemigos.', apply(p) { p.lifesteal = true; } },
      active: { id: 'pact', name: 'Pacto Oscuro', desc: 'Sacrificas vida por daño temporal.', charges: 1, kills: 8 },
      req: { type: 'kills', value: 250, text: 'Elimina 250 enemigos en total' },
    },
    {
      id: 'angel', name: 'Protectora', skin: 9,
      desc: 'Protege al equipo.',
      stats: { maxHp: 2, damage: -0.4 },
      passive: { id: 'grace', name: 'Gracia', desc: 'Al limpiar una sala, 50% de curar medio corazón al equipo.', apply(p) { p.allyHeal = true; } },
      active: { id: 'bless', name: 'Bendición', desc: 'Todos ganan un escudo.', charges: 1, kills: 12 },
      req: { type: 'challenge', value: 'sin_activas', text: 'Completa el desafío «Manos atadas»' },
    },
    {
      id: 'samson', name: 'Furioso', skin: 3,
      desc: 'Se enfurece cuando le hacen daño.',
      stats: { maxHp: 2, damage: 0.9 },
      passive: { id: 'wrath', name: 'Ira', desc: 'Al recibir daño ganas +daño temporal.', apply(p) { p.rageOnHurt = true; } },
      active: { id: 'fury', name: 'Cólera', desc: '+daño y velocidad durante 6 s.', charges: 1, kills: 12 },
      req: { type: 'bestFloor', value: 5, text: 'Llega al piso 5' },
    },
    {
      id: 'lilith', name: 'Invocadora', skin: 1,
      desc: 'Empieza con una mosca familiar.',
      stats: { damage: 0.3, fireRate: 0.2 },
      passive: { id: 'brood', name: 'Prole', desc: 'Empiezas con una mosca familiar.', apply(p) { p.familiars += 1; } },
      active: { id: 'summon', name: 'Invocación', desc: 'Dos moscas familiares temporales.', charges: 1, kills: 8 },
      req: { type: 'bosses', value: 3, text: 'Derrota 3 jefes distintos' },
    },
    {
      id: 'keeper', name: 'Avaro', skin: 7,
      desc: 'Las monedas lo curan.',
      stats: { maxHp: -2, damage: 0.7 },
      passive: { id: 'greed', name: 'Codicia', desc: 'Cada 6 monedas te curan medio corazón.', apply(p) { p.coinsHeal = true; } },
      active: { id: 'wealth', name: 'Botín', desc: 'Siembra monedas en la sala.', charges: 1, kills: 8 },
      req: { type: 'achievements', value: 10, text: 'Consigue 10 logros' },
    },
    {
      id: 'forgotten', name: 'Olvidado', skin: 6,
      desc: 'Fuerte y resistente. Devuelve daño al recibirlo.',
      stats: { maxHp: 4, speed: -20, damage: 0.5 },
      passive: { id: 'clubs', name: 'Espinas', desc: 'Devuelves daño al ser tocado.', apply(p) { p.thorns += 2; } },
      active: { id: 'blast', name: 'Golpe Sísmico', desc: 'Explosión de daño en la dirección apuntada.', charges: 1, kills: 12 },
      req: { type: 'win', value: 1, text: 'Pasa el juego al completo (9 pisos)' },
    },
  ];

  const byId = (id) => LIST.find((c) => c.id === id) || LIST[0];
  const indexOf = (id) => { const i = LIST.findIndex((c) => c.id === id); return i < 0 ? 0 : i; };
  const normIndex = (i) => {
    i = (typeof i === 'number' && isFinite(i)) ? (i | 0) : 0;
    const n = LIST.length;
    return ((i % n) + n) % n;
  };

  global.Characters = {
    LIST, DEFAULT_ID: 'isaac',
    byId, indexOf, normIndex,
    default: () => byId('isaac'),
  };
})(typeof window !== 'undefined' ? window : globalThis);
