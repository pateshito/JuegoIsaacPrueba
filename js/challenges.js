/* ============================================================
   challenges.js — retos de partida con modificadores.
   Cada desafío cambia las reglas de una partida para hacerla más
   difícil; si la ganas (superas los 9 pisos), queda completado y
   desbloquea un personaje.
   Expone el global `Challenges`.
   ------------------------------------------------------------
   Los `mods` los aplica game.js al arrancar la partida:
     items:false      → no aparece ningún objeto en pedestales
     oneHeart:true    → un único contenedor de vida
     enemySpeed:1.5   → multiplica la velocidad de los enemigos
     noActive:true    → la habilidad activa queda desactivada
   ============================================================ */
(function (global) {
  'use strict';

  const LIST = [
    {
      id: 'desnudo', name: 'Manos vacías', icon: '🎒',
      desc: 'No aparece ningún objeto en los pedestales. Sobrevive solo con lo que traes.',
      mods: { items: false },
      reward: 'robot',
    },
    {
      id: 'fragil', name: 'Corazón de cristal', icon: '💠',
      desc: 'Empiezas (y sigues) con un único contenedor de vida.',
      mods: { oneHeart: true },
      reward: 'ghost',
    },
    {
      id: 'rabia', name: 'Rabia', icon: '🔥',
      desc: 'Todos los enemigos se mueven mucho más rápido.',
      mods: { enemySpeed: 1.5 },
      reward: 'eden',
    },
    {
      id: 'sin_activas', name: 'Manos atadas', icon: '⛓️',
      desc: 'Tu habilidad activa está desactivada durante toda la partida.',
      mods: { noActive: true },
      reward: 'angel',
    },
  ];

  const byId = (id) => LIST.find((c) => c.id === id) || null;

  global.Challenges = { LIST, byId };
})(typeof window !== 'undefined' ? window : globalThis);
