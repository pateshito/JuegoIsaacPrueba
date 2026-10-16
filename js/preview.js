/* ============================================================
   preview.js — sala de pruebas de personajes
   ------------------------------------------------------------
   Se abre desde la galería de Personajes (botón inferior). Muestra
   una sala VACÍA con un muñeco de práctica: puedes moverte, disparar,
   USAR LA ACTIVA (barra espaciadora) y ver el DAÑO por impacto del
   personaje elegido. A la izquierda hay una barra con TODOS los
   personajes (se eligen con el ratón) y, encima de la barra, un botón
   para volver a Personajes.

   Es totalmente local: no toca la partida ni la red. Expone
   el global `Preview`.
   ============================================================ */
(function (global) {
  'use strict';

  const C = Utils.C;
  const E = Entities;

  const state = {
    open: false,
    canvas: null,
    ctx: null,
    player: null,
    dummy: null,
    bullets: [],
    floats: [],
    fx: [],          // destellos de las activas {x, y, c, n, t}
    booms: [],       // explosiones {x, y, r, t}
    coins: [],       // monedas decorativas de la activa "Fortuna" {x, y, t}
    message: null,   // aviso flotante {text, t}
    time: 0,
    shootCd: 0,
    hits: 0,
    total: 0,
    lastHit: 0,
    roll: [],        // ventana móvil de impactos {t, dmg} para el DPS
    view: null,
  };

  const rand = Math.random;

  // ---------------------------------------------------------
  // Personaje en práctica
  // ---------------------------------------------------------
  function makePlayer(charId) {
    const p = E.createPlayer('preview', {
      name: 'Tú',
      char: charId,
      skin: 0,
      color: E.COLORS[0],
      scheme: 'p1',
      local: true,
      slot: 0,
    });
    p.x = C.CX - 120;
    p.y = C.CY;
    p.face = { x: 1, y: 0 };
    p.aim = { x: 1, y: 0 };
    return p;
  }

  function setChar(charId) {
    if (!state.player) return;
    const old = state.player;
    const p = makePlayer(charId);
    p.x = old.x; p.y = old.y;
    p.face = old.face; p.aim = old.aim;
    p.walkPhase = old.walkPhase;
    state.player = p;
    state.bullets.length = 0;
    state.floats.length = 0;
    state.fx.length = 0;
    state.booms.length = 0;
    state.coins.length = 0;
    state.message = null;
    state.hits = 0; state.total = 0; state.lastHit = 0;
    state.roll.length = 0;
    state.shootCd = 0;
  }

  // ---------------------------------------------------------
  // Ciclo
  // ---------------------------------------------------------
  function open(charId) {
    const cv = (document.querySelector ? document.querySelector('#preview-canvas') : null) ||
               (document.getElementById ? document.getElementById('preview-canvas') : null);
    if (!cv) return;
    state.canvas = cv;
    state.ctx = Render.init(cv);   // Render dibuja en este lienzo mientras dure la vista previa
    state.open = true;
    state.time = 0;
    state.player = makePlayer(charId || 'isaac');
    state.bullets.length = 0;
    state.floats.length = 0;
    state.fx.length = 0;
    state.booms.length = 0;
    state.coins.length = 0;
    state.message = null;
    state.hits = 0; state.total = 0; state.lastHit = 0;
    state.roll.length = 0;
    state.shootCd = 0;
    state.dummy = { x: C.CX + 150, y: C.CY, r: 26, flash: 0, anim: 0 };
    state.view = {
      mode: 'single',
      time: 0,
      theme: null,
      floorNum: 1,
      room: null,
      players: [state.player],
      enemies: [],
      bullets: state.bullets,
      items: [],
    };
  }

  function close() {
    state.open = false;
    state.bullets.length = 0;
    state.floats.length = 0;
    state.fx.length = 0;
    state.booms.length = 0;
    state.coins.length = 0;
    state.message = null;
  }

  const isOpen = () => state.open;

  function damagePerShot() {
    const p = state.player;
    if (!p) return 0;
    let d = p.damage;
    try { d += E.profile(p).bonusDamage || 0; } catch (e) {}
    if (p.buff && p.buff.dmgT > 0) d += p.buff.dmg;
    return d;
  }

  function shoot(p) {
    const dmg = damagePerShot();
    const rate = Math.max(0.4, p.fireRate + ((p.buff && p.buff.fireT > 0) ? p.buff.fire : 0));
    const sp = p.bulletSpeed;
    const n = 1 + (p.extraShots || 0);
    const base = Math.atan2(p.aim.y, p.aim.x);
    for (let i = 0; i < n; i++) {
      const spread = n === 1 ? 0 : (i - (n - 1) / 2) * 0.2;
      const a = base + spread;
      state.bullets.push({
        x: p.x + Math.cos(a) * 16,
        y: p.y + Math.sin(a) * 16,
        vx: Math.cos(a) * sp,
        vy: Math.sin(a) * sp,
        r: p.bulletSize,
        color: '#dff1ff',
        dmg: dmg,
        life: p.range * 1.2,
      });
    }
    state.shootCd = 1 / rate;
    if (global.Sfx) Sfx.play('shoot');
  }

  function damageDummy(dmg, x, y) {
    const d = state.dummy;
    d.flash = 0.14;
    state.hits++;
    state.total += dmg;
    state.lastHit = dmg;
    state.roll.push({ t: state.time, dmg: dmg });
    state.floats.push({ x: x, y: y, t: 0.9, dmg: dmg });
  }

  // Explosión de las activas: daña el muñeco si está en el radio y deja un anillo.
  function explodePreview(x, y, r, dmg) {
    state.booms.push({ x: x, y: y, r: r, t: 0.42 });
    const d = state.dummy;
    if (d && Math.hypot(d.x - x, d.y - y) <= r + d.r) {
      damageDummy(dmg, d.x, d.y - d.r - 6);
    }
  }

  function showMessage(text) {
    state.message = { text: text, t: 2.2 };
  }

  // Contexto que usan las activas reales (Game.tryUseAbility) dentro de la sala
  // de pruebas: mismas fórmulas que en la partida, pero sobre este mundo local.
  const previewCtx = {
    get time() { return state.time; },
    get players() { return state.player ? [state.player] : []; },
    get pedestals() { return []; },
    spawnBullet(p, x, y, vx, vy, o) {
      o = o || {};
      state.bullets.push({
        x: x, y: y, vx: vx, vy: vy,
        r: o.r != null ? o.r : 7,
        color: o.color || '#cfe0ff',
        dmg: o.dmg != null ? o.dmg : p.damage,
        pierce: !!o.pierce,
        explode: o.explode || 0,
        life: o.life != null ? o.life : 1.4,
      });
    },
    explode(x, y, r, dmg) { explodePreview(x, y, r, dmg); },
    fx(x, y, c, n) { state.fx.push({ x: x, y: y, c: c || '#fff', n: n || 12, t: 0.4 }); },
    message(text) { showMessage(text); },
    shake() { /* sin sacudida en la sala de pruebas */ },
    reveal() { /* no hay mapa que revelar aquí */ },
    rerollItem() { return null; },
    spawnCoin(x, y) { state.coins.push({ x: x, y: y, t: 6 }); },
  };

  function step(dt) {
    if (!state.open || !state.player) return;
    state.time += dt;
    state.view.time = state.time;

    const p = state.player;

    // temporizadores de la activa (mismas fórmulas que en la partida real)
    if (global.Game && Game.updateBuffs) Game.updateBuffs(p, dt);
    if (global.Game && Game.updateAbility) Game.updateAbility(p, dt);

    const inp = Input.poll('p1');
    const sp = p.speed + ((p.buff && p.buff.spdT > 0) ? p.buff.spd : 0);
    p.x += inp.mx * sp * dt;
    p.y += inp.my * sp * dt;
    p.x = Utils.clamp(p.x, C.INNER_L + p.r, C.INNER_R - p.r);
    p.y = Utils.clamp(p.y, C.INNER_T + p.r, C.INNER_B - p.r);

    if (inp.fire && (inp.sx || inp.sy)) { p.aim.x = inp.sx; p.aim.y = inp.sy; }
    const moving = !!(inp.mx || inp.my);
    p.walkPhase += dt * (moving ? 9 : 2.4);
    const k = 1 - Math.exp(-14 * dt);
    p.face.x = Utils.lerp(p.face.x, p.aim.x, k);
    p.face.y = Utils.lerp(p.face.y, p.aim.y, k);

    // usar la habilidad activa (barra espaciadora)
    if (inp.use && global.Game && Game.tryUseAbility) {
      Game.tryUseAbility(p, previewCtx);
    }

    // disparo automático manteniendo las flechas
    state.shootCd -= dt;
    if (inp.fire && state.shootCd <= 0) shoot(p);

    // balas
    const d = state.dummy;
    for (let i = state.bullets.length - 1; i >= 0; i--) {
      const b = state.bullets[i];
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      b.life -= dt;
      const hit = Math.hypot(b.x - d.x, b.y - d.y) < d.r + b.r;
      const out = b.x < C.ROOM_X - 40 || b.x > C.ROOM_X + C.ROOM_W + 40 ||
                  b.y < C.ROOM_Y - 40 || b.y > C.ROOM_Y + C.ROOM_H + 40;
      if (hit && !b._hit) {
        b._hit = true;
        damageDummy(b.dmg, d.x, d.y - d.r - 6);
        if (b.explode) explodePreview(b.x, b.y, b.explode, b.dmg * 0.6);
        if (!b.pierce) { state.bullets.splice(i, 1); continue; }
      }
      if (out || b.life <= 0) state.bullets.splice(i, 1);
    }

    // números flotantes
    for (let i = state.floats.length - 1; i >= 0; i--) {
      const f = state.floats[i];
      f.t -= dt;
      f.y -= dt * 26;
      if (f.t <= 0) state.floats.splice(i, 1);
    }

    // destellos y explosiones de las activas
    for (let i = state.fx.length - 1; i >= 0; i--) {
      state.fx[i].t -= dt;
      if (state.fx[i].t <= 0) state.fx.splice(i, 1);
    }
    for (let i = state.booms.length - 1; i >= 0; i--) {
      state.booms[i].t -= dt;
      if (state.booms[i].t <= 0) state.booms.splice(i, 1);
    }

    // monedas decorativas: se recogen al pasar por encima
    for (let i = state.coins.length - 1; i >= 0; i--) {
      const c = state.coins[i];
      c.t -= dt;
      if (Math.hypot(c.x - p.x, c.y - p.y) < 18) {
        state.fx.push({ x: c.x, y: c.y, c: '#ffd166', n: 6, t: 0.3 });
        state.coins.splice(i, 1);
      } else if (c.t <= 0) state.coins.splice(i, 1);
    }

    // aviso flotante
    if (state.message) { state.message.t -= dt; if (state.message.t <= 0) state.message = null; }

    // ventana móvil para el DPS (últimos 3 s)
    while (state.roll.length && state.time - state.roll[0].t > 3) state.roll.shift();

    if (d.flash > 0) d.flash -= dt;
    d.anim += dt;
  }

  // ---------------------------------------------------------
  // Dibujo
  // ---------------------------------------------------------
  function drawRoom(ctx) {
    const x0 = C.ROOM_X, y0 = C.ROOM_Y, w = C.ROOM_W, h = C.ROOM_H;
    // suelo a cuadros
    for (let ty = 0; ty < C.ROWS; ty++) {
      for (let tx = 0; tx < C.COLS; tx++) {
        const x = x0 + tx * C.TILE, y = y0 + ty * C.TILE;
        const alt = (tx + ty) % 2 === 0;
        ctx.fillStyle = alt ? '#241c33' : '#1f182c';
        ctx.fillRect(x, y, C.TILE, C.TILE);
      }
    }
    // junta sutil del mosaico
    ctx.strokeStyle = 'rgba(0,0,0,.25)';
    ctx.lineWidth = 1;
    for (let tx = 0; tx <= C.COLS; tx++) {
      ctx.beginPath(); ctx.moveTo(x0 + tx * C.TILE, y0); ctx.lineTo(x0 + tx * C.TILE, y0 + h); ctx.stroke();
    }
    for (let ty = 0; ty <= C.ROWS; ty++) {
      ctx.beginPath(); ctx.moveTo(x0, y0 + ty * C.TILE); ctx.lineTo(x0 + w, y0 + ty * C.TILE); ctx.stroke();
    }
    // muros
    const wallGrad = ctx.createLinearGradient(0, y0, 0, y0 + h);
    wallGrad.addColorStop(0, '#6d5a90');
    wallGrad.addColorStop(1, '#38294f');
    ctx.fillStyle = wallGrad;
    ctx.fillRect(x0, y0, w, C.WALL);
    ctx.fillRect(x0, y0 + h - C.WALL, w, C.WALL);
    ctx.fillRect(x0, y0, C.WALL, h);
    ctx.fillRect(x0 + w - C.WALL, y0, C.WALL, h);
    // borde interior
    ctx.strokeStyle = 'rgba(255,255,255,.10)';
    ctx.lineWidth = 2;
    ctx.strokeRect(C.INNER_L - 1, C.INNER_T - 1, C.INNER_R - C.INNER_L + 2, C.INNER_B - C.INNER_T + 2);

    // cartel de la sala
    ctx.save();
    ctx.globalAlpha = 0.5;
    ctx.fillStyle = '#ffd166';
    ctx.font = 'bold 12px ui-monospace, monospace';
    ctx.textAlign = 'center';
    ctx.fillText('SALA DE PRUEBA · dispara al muñeco', C.CX, C.ROOM_Y + 17);
    ctx.restore();
  }

  function drawDummy(ctx, d) {
    ctx.save();
    Utils.shadowBlob(ctx, d.x, d.y + d.r * 0.9, d.r * 0.9, d.r * 0.34, 0.34);
    // poste
    ctx.fillStyle = '#4a3524';
    ctx.fillRect(d.x - 5, d.y - d.r * 0.2, 10, d.r * 1.3);
    // cuerpo (saco)
    const g = ctx.createRadialGradient(d.x - 8, d.y - 10, 2, d.x, d.y, d.r * 1.2);
    g.addColorStop(0, '#c9a06a');
    g.addColorStop(1, '#7a5735');
    ctx.fillStyle = g;
    Utils.circle(ctx, d.x, d.y, d.r);
    ctx.fill();
    // diana
    ctx.strokeStyle = 'rgba(120,40,40,.85)';
    ctx.lineWidth = 3;
    Utils.circle(ctx, d.x, d.y, d.r * 0.72); ctx.stroke();
    ctx.strokeStyle = 'rgba(230,90,90,.9)';
    ctx.lineWidth = 3;
    Utils.circle(ctx, d.x, d.y, d.r * 0.42); ctx.stroke();
    ctx.fillStyle = 'rgba(230,90,90,.9)';
    Utils.circle(ctx, d.x, d.y, d.r * 0.16); ctx.fill();
    // cuerdas
    ctx.strokeStyle = 'rgba(60,40,25,.8)';
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(d.x - d.r * 0.6, d.y - d.r * 0.75); ctx.lineTo(d.x + d.r * 0.6, d.y - d.r * 0.75); ctx.stroke();
    // destello de impacto
    if (d.flash > 0) {
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = Math.min(1, d.flash * 6) * 0.8;
      ctx.fillStyle = '#fff';
      Utils.circle(ctx, d.x, d.y, d.r * 1.05);
      ctx.fill();
      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = 1;
    }
    ctx.restore();
  }

  function draw() {
    const ctx = state.ctx;
    if (!ctx) return;
    ctx.setTransform(1, 0, 0, 1, 0, 0);

    // fondo
    const bg = ctx.createRadialGradient(C.VIEW_W / 2, C.VIEW_H / 2, 40, C.VIEW_W / 2, C.VIEW_H / 2, 620);
    bg.addColorStop(0, '#17121f');
    bg.addColorStop(1, '#07050b');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, C.VIEW_W, C.VIEW_H);

    drawRoom(ctx);
    drawDummy(ctx, state.dummy);

    // monedas decorativas (activa "Fortuna")
    for (const c of state.coins) {
      ctx.save();
      ctx.globalAlpha = Utils.clamp(c.t / 1.2, 0, 1);
      Utils.shadowBlob(ctx, c.x, c.y + 6, 7, 3, 0.3);
      const g = ctx.createRadialGradient(c.x - 2, c.y - 2, 1, c.x, c.y, 7);
      g.addColorStop(0, '#ffe9a8');
      g.addColorStop(1, '#d99b1f');
      ctx.fillStyle = g;
      Utils.circle(ctx, c.x, c.y, 6.5); ctx.fill();
      ctx.strokeStyle = 'rgba(120,80,10,.7)';
      ctx.lineWidth = 1.5;
      Utils.circle(ctx, c.x, c.y, 6.5); ctx.stroke();
      ctx.restore();
    }

    // balas
    if (typeof Render.drawBullet === 'function') {
      for (const b of state.bullets) Render.drawBullet(b);
    } else {
      for (const b of state.bullets) {
        ctx.fillStyle = b.color;
        Utils.circle(ctx, b.x, b.y, b.r);
        ctx.fill();
      }
    }

    // jugador
    if (state.player && typeof Render.drawPlayer === 'function') {
      Render.drawPlayer(state.player, state.view, true);
    }

    // explosiones de las activas
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (const bm of state.booms) {
      const k = 1 - Utils.clamp(bm.t / 0.42, 0, 1);
      ctx.globalAlpha = (1 - k) * 0.8;
      ctx.strokeStyle = '#ffb066';
      ctx.lineWidth = 4 * (1 - k) + 1;
      Utils.circle(ctx, bm.x, bm.y, bm.r * (0.35 + k * 0.9)); ctx.stroke();
      ctx.fillStyle = 'rgba(255,180,90,.25)';
      Utils.circle(ctx, bm.x, bm.y, bm.r * (0.3 + k * 0.7)); ctx.fill();
    }
    for (const f of state.fx) {
      const k = 1 - Utils.clamp(f.t / 0.4, 0, 1);
      ctx.globalAlpha = (1 - k) * 0.9;
      ctx.fillStyle = f.c;
      for (let i = 0; i < f.n; i++) {
        const a = (i / f.n) * Math.PI * 2;
        const rr = 8 + k * 34;
        Utils.circle(ctx, f.x + Math.cos(a) * rr, f.y + Math.sin(a) * rr, 2.3 * (1 - k) + 1);
        ctx.fill();
      }
    }
    ctx.restore();

    // números de daño
    ctx.save();
    ctx.textAlign = 'center';
    ctx.font = 'bold 15px ui-monospace, monospace';
    for (const f of state.floats) {
      const a = Utils.clamp(f.t / 0.9, 0, 1);
      ctx.globalAlpha = a;
      ctx.fillStyle = '#0a0a12';
      ctx.fillText('-' + f.dmg.toFixed(1), f.x + 1, f.y + 1);
      ctx.fillStyle = '#ffe08a';
      ctx.fillText('-' + f.dmg.toFixed(1), f.x, f.y);
    }
    ctx.restore();

    // aviso flotante (activas: recarga, sin pedestal, etc.)
    if (state.message) {
      const m = state.message;
      ctx.save();
      ctx.textAlign = 'center';
      ctx.font = 'bold 15px ui-monospace, monospace';
      ctx.globalAlpha = Utils.clamp(m.t / 0.5, 0, 1);
      const tx = C.CX, ty = C.ROOM_Y + C.ROOM_H - 18;
      ctx.fillStyle = 'rgba(0,0,0,.55)';
      const w = ctx.measureText(m.text).width + 24;
      ctx.fillRect(tx - w / 2, ty - 15, w, 22);
      ctx.fillStyle = '#ffe08a';
      ctx.fillText(m.text, tx, ty);
      ctx.restore();
    }
  }

  // ---------------------------------------------------------
  // Datos para el panel (lo lee main.js al refrescar la interfaz)
  // ---------------------------------------------------------
  function stats() {
    const p = state.player;
    let dps = 0;
    for (const h of state.roll) dps += h.dmg;
    dps = state.roll.length ? dps / Math.min(3, Math.max(0.6, state.time)) : 0;
    let active = null;
    if (p) {
      let ch = null;
      try { ch = E.charOf({ char: p.charId }); } catch (e) {}
      const act = ch && ch.active;
      active = {
        name: act ? act.name : null,
        id: act ? act.id : null,
        charges: p.abCharges,
        max: p.abMax,
        kills: p.abKills || 0,
        killReq: p.abKillReq || 0,
        ready: !!(p.abMax && p.abCharges > 0),
      };
    }
    const b = p && p.buff;
    const buffText = b && b.dmgT > 0 ? ('daño +' + b.dmg.toFixed(1) + ' (' + b.dmgT.toFixed(0) + 's)')
      : (b && b.fireT > 0 ? ('cadencia +' + b.fire.toFixed(1) + ' (' + b.fireT.toFixed(0) + 's)')
      : (b && b.spdT > 0 ? ('velocidad +' + b.spd.toFixed(0) + ' (' + b.spdT.toFixed(0) + 's)')
      : (b && b.famT > 0 ? ('familiares (' + b.famT.toFixed(0) + 's)') : '')));
    return {
      charId: p ? p.charId : null,
      damage: p ? damagePerShot() : 0,
      fireRate: p ? Math.max(0.4, p.fireRate + ((b && b.fireT > 0) ? b.fire : 0)) : 0,
      speed: p ? Math.round(p.speed + ((b && b.spdT > 0) ? b.spd : 0)) : 0,
      hp: p ? p.maxHp : 0,
      lastHit: state.lastHit,
      hits: state.hits,
      total: state.total,
      dps: dps,
      shots: p && p.fireRate ? p.fireRate : 0,
      active: active,
      buffText: buffText,
    };
  }

  global.Preview = { open, close, isOpen, setChar, step, draw, stats };
})(typeof window !== 'undefined' ? window : globalThis);
