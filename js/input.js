/* ============================================================
   input.js — teclado y esquemas de control
   Expone el global `Input`.
   ============================================================ */
(function (global) {
  'use strict';

  const keys = Object.create(null);
  const pressedOnce = Object.create(null);
  let attached = false;

  // Esquemas: cada jugador local tiene su propio mapa de teclas.
  const SCHEMES = {
    p1: {
      up: 'KeyW', down: 'KeyS', left: 'KeyA', right: 'KeyD',
      su: 'ArrowUp', sd: 'ArrowDown', sl: 'ArrowLeft', sr: 'ArrowRight',
      use: 'Space',
    },
    p2: {
      up: 'KeyI', down: 'KeyK', left: 'KeyJ', right: 'KeyL',
      su: 'KeyT', sd: 'KeyG', sl: 'KeyF', sr: 'KeyH',
      use: 'KeyY',
    },
  };

  const BLOCK = new Set([
    'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space', 'Tab',
  ]);

  function onKeyDown(e) {
    if (e.repeat) {
      if (BLOCK.has(e.code)) e.preventDefault();
      return;
    }
    keys[e.code] = true;
    pressedOnce[e.code] = true;
    if (BLOCK.has(e.code)) e.preventDefault();
  }

  function onKeyUp(e) {
    keys[e.code] = false;
    if (BLOCK.has(e.code)) e.preventDefault();
  }

  function onBlur() {
    for (const k in keys) keys[k] = false;
  }

  function attach() {
    if (attached) return;
    attached = true;
    global.addEventListener('keydown', onKeyDown, { passive: false });
    global.addEventListener('keyup', onKeyUp, { passive: false });
    global.addEventListener('blur', onBlur);
    document.addEventListener('visibilitychange', () => { if (document.hidden) onBlur(); });
  }

  const down = (code) => !!keys[code];

  // Devuelve el estado de entrada de un jugador local.
  function poll(schemeName) {
    const s = SCHEMES[schemeName] || SCHEMES.p1;
    let mx = 0, my = 0, sx = 0, sy = 0;
    if (down(s.left)) mx -= 1;
    if (down(s.right)) mx += 1;
    if (down(s.up)) my -= 1;
    if (down(s.down)) my += 1;

    if (down(s.sl)) sx -= 1;
    if (down(s.sr)) sx += 1;
    if (down(s.su)) sy -= 1;
    if (down(s.sd)) sy += 1;

    if (mx && my) { const k = Math.SQRT1_2; mx *= k; my *= k; }
    if (sx && sy) { const k = Math.SQRT1_2; sx *= k; sy *= k; }

    return {
      mx: Utils.r1(mx), my: Utils.r1(my),
      sx: Utils.r1(sx), sy: Utils.r1(sy),
      fire: !!(sx || sy),
    };
  }

  // Consumo de pulsaciones únicas (para menús / acciones)
  function consume(code) {
    if (pressedOnce[code]) { pressedOnce[code] = false; return true; }
    return false;
  }
  function endFrame() { for (const k in pressedOnce) pressedOnce[k] = false; }

  global.Input = { attach, poll, down, consume, endFrame, SCHEMES, keys };
})(typeof window !== 'undefined' ? window : globalThis);
