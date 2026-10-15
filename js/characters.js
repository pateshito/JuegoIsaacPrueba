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
      id: 'isaac', name: 'Isaac', skin: 0,
      desc: 'Equilibrado y fiable. Empieza con un corazón de más.',
      stats: {},
      passive: { id: 'faith', name: 'Fe', desc: '+1 contenedor de corazón.', apply(p) { p.maxHp += 2; } },
      active: { id: 'tears', name: 'Bomba de lágrimas', desc: 'Ráfaga de lágrimas en todas direcciones.', charges: 2, cd: 22 },
      cost: 0, unlocked: true,
    },
    {
      id: 'maggy', name: 'Magdalena', skin: 1,
      desc: 'Tanque lento. Su vitalidad la cura al limpiar salas.',
      stats: { maxHp: 2, speed: -34, damage: 0.4 },
      passive: { id: 'vitality', name: 'Vitalidad', desc: 'Al limpiar una sala, 15% de curarte 1 corazón.', apply(p) { p.roomHeal += 0.15; } },
      active: { id: 'heal', name: 'Abrazo', desc: 'Te curas 1 corazón y ganas inmunidad breve.', charges: 1, cd: 120 },
      cost: 0, unlocked: true,
    },
    {
      id: 'cain', name: 'Caín', skin: 2,
      desc: 'Rápido y con suerte, pero frágil. Su activa revela el piso.',
      stats: { maxHp: -2, speed: 26, luck: 2, damage: 0.2 },
      passive: { id: 'luck', name: 'Buena estrella', desc: '+2 de suerte: mejor botín.', apply(p) { p.luck += 2; } },
      active: { id: 'reveal', name: 'Ojo de Caín', desc: 'Revela todo el mapa del piso.', charges: 1, cd: 78 },
      cost: 120,
    },
    {
      id: 'judas', name: 'Judas', skin: 3,
      desc: 'Daño brutal a cambio de muy poca vida.',
      stats: { maxHp: -4, damage: 1.6, fireRate: -0.2 },
      passive: { id: 'zeal', name: 'Fervor', desc: '+0.6 de daño.', apply(p) { p.damage += 0.6; } },
      active: { id: 'dagger', name: 'Daga del pacto', desc: 'Lanza una daga perforante devastadora.', charges: 2, cd: 28 },
      cost: 150,
    },
    {
      id: 'azazel', name: 'Azazel', skin: 4,
      desc: 'Vuela y dispara corto pero fuerte.',
      stats: { maxHp: -2, damage: 0.9, range: -0.4, speed: 14 },
      passive: { id: 'fly', name: 'Alas', desc: 'Vuela: atraviesas obstáculos.', apply(p) { p.flying = true; } },
      active: { id: 'blast', name: 'Aliento demoníaco', desc: 'Explosión de daño en la dirección apuntada.', charges: 1, cd: 38 },
      cost: 200,
    },
    {
      id: 'eden', name: 'Edén', skin: 5,
      desc: 'Sus estadísticas son aleatorias en cada partida.',
      stats: {},
      passive: { id: 'random', name: 'Azar', desc: 'Empiezas con estadísticas aleatorias.', special: true, apply() {} },
      active: { id: 'reroll', name: 'Reciclar', desc: 'Cambia el objeto del pedestal más cercano.', charges: 1, cd: 66 },
      cost: 250,
    },
    {
      id: 'ghost', name: 'Fantasma', skin: 6,
      desc: 'Atraviesa obstáculos. Su activa lo hace intangible.',
      stats: { maxHp: -2, speed: 10 },
      passive: { id: 'spirit', name: 'Incorpóreo', desc: 'Atraviesas obstáculos.', apply(p) { p.flying = true; } },
      active: { id: 'phase', name: 'Espectral', desc: 'Inmune durante 3 s.', charges: 1, cd: 52 },
      cost: 300,
    },
    {
      id: 'robot', name: 'Robot', skin: 7,
      desc: 'Dispara rápido y regenera escudos.',
      stats: { fireRate: 0.3, damage: -0.3, bulletSpeed: 60 },
      passive: { id: 'shielding', name: 'Blindaje', desc: 'Recuperas un escudo con el tiempo.', apply(p) { p.shieldRegen = true; } },
      active: { id: 'overclock', name: 'Sobrecarga', desc: 'Disparas al doble de cadencia 4 s.', charges: 1, cd: 58 },
      cost: 320,
    },
    {
      id: 'devil', name: 'Diablillo', skin: 8,
      desc: 'Roba vida al matar.',
      stats: { maxHp: -2, damage: 0.5 },
      passive: { id: 'leech', name: 'Sanguijuela', desc: 'Robas vida al eliminar enemigos.', apply(p) { p.lifesteal = true; } },
      active: { id: 'pact', name: 'Pacto', desc: 'Sacrificas vida por daño temporal.', charges: 2, cd: 34 },
      cost: 350,
    },
    {
      id: 'angel', name: 'Ángel', skin: 9,
      desc: 'Protege al equipo.',
      stats: { maxHp: 2, damage: -0.4 },
      passive: { id: 'grace', name: 'Gracia', desc: 'Al limpiar una sala, 50% de curar medio corazón al equipo.', apply(p) { p.allyHeal = true; } },
      active: { id: 'bless', name: 'Bendición', desc: 'Todos ganan un escudo.', charges: 1, cd: 72 },
      cost: 400,
    },
    {
      id: 'samson', name: 'Sansón', skin: 3,
      desc: 'Se enfurece cuando le hacen daño.',
      stats: { maxHp: 2, damage: 0.9 },
      passive: { id: 'wrath', name: 'Ira', desc: 'Al recibir daño ganas +daño temporal.', apply(p) { p.rageOnHurt = true; } },
      active: { id: 'fury', name: 'Furia', desc: '+daño y velocidad durante 6 s.', charges: 2, cd: 38 },
      cost: 450, req: { type: 'bestFloor', value: 5, text: 'Llega al piso 5' },
    },
    {
      id: 'lilith', name: 'Lilit', skin: 1,
      desc: 'Empieza con una mosca familiar.',
      stats: { damage: 0.3, fireRate: 0.2 },
      passive: { id: 'brood', name: 'Prole', desc: 'Empiezas con una mosca familiar.', apply(p) { p.familiars += 1; } },
      active: { id: 'summon', name: 'Invoca', desc: 'Dos moscas familiares temporales.', charges: 1, cd: 62 },
      cost: 500, req: { type: 'bosses', value: 3, text: 'Derrota a 3 jefes' },
    },
    {
      id: 'keeper', name: 'Vigilante', skin: 7,
      desc: 'Las monedas lo curan.',
      stats: { maxHp: -2, damage: 0.7 },
      passive: { id: 'greed', name: 'Codicia', desc: 'Cada 6 monedas te curan medio corazón.', apply(p) { p.coinsHeal = true; } },
      active: { id: 'wealth', name: 'Riqueza', desc: 'Siembra monedas en la sala.', charges: 2, cd: 48 },
      cost: 600, req: { type: 'achievements', value: 8, text: 'Consigue 8 logros' },
    },
    {
      id: 'forgotten', name: 'El Olvidado', skin: 6,
      desc: 'Aparece tras un suceso extraño. Espinas y mucho aguante.',
      stats: { maxHp: 4, speed: -20, damage: 0.5 },
      passive: { id: 'clubs', name: 'Garrote', desc: 'Devuelves daño al ser tocado.', apply(p) { p.thorns += 2; } },
      active: { id: 'blast', name: 'Golpe sísmico', desc: 'Explosión de daño en la dirección apuntada.', charges: 1, cd: 40 },
      cost: 800, hidden: true,
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
