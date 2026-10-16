/* ============================================================
   main.js — interfaz, menús, bucle principal y protocolo de red
   ============================================================ */
(function (global) {
  'use strict';

  const C = Utils.C;
  const $ = (sel) => document.querySelector(sel);

  const ui = {
    canvas: $('#game'),
    topbar: $('#topbar'),
    tbRoom: $('#tb-room'),
    tbPing: $('#tb-ping'),
    btnMute: $('#btn-mute'),
    btnPause: $('#btn-pause'),
    btnQuit: $('#btn-quit'),
    ovMain: $('#ov-main'),
    ovHelp: $('#ov-help'),
    ovLobby: $('#ov-lobby'),
    ovJoin: $('#ov-join'),
    ovPause: $('#ov-pause'),
    ovEnd: $('#ov-end'),
    endTitle: $('#end-title'),
    endText: $('#end-text'),
    lobbyCode: $('#lobby-code'),
    lobbyPlayers: $('#lobby-players'),
    lobbyCount: $('#lobby-count'),
    lobbyStatus: $('#lobby-status'),
    btnStartHost: $('#btn-start-host'),
    joinCode: $('#join-code'),
    joinStatus: $('#join-status'),
    playerNameInput: $('#player-name'),
    joinName: $('#join-name'),
    charPicker: $('#char-picker'),
    charPickerJoin: $('#char-picker-join'),
    charDetail: $('#char-detail'),
    charDetailJoin: $('#char-detail-join'),
    menuAch: $('#menu-ach'),
    menuAchTotal: $('#menu-ach-total'),
    ovShop: $('#ov-shop'),
    ovChallenges: $('#ov-challenges'),
    ovProgress: $('#ov-progress'),
    ovUpgrades: $('#ov-upgrades'),
    shopGrid: $('#shop-grid'),
    rosterDetail: $('#roster-detail'),
    challList: $('#chall-list'),
    ovPreview: $('#ov-preview'),
    previewChars: $('#preview-chars'),
    previewInfo: $('#preview-info'),
    progStats: $('#prog-stats'),
    achList: $('#ach-list'),
    progAchCount: $('#prog-ach-count'),
    upgList: $('#upg-list'),
    achToasts: $('#ach-toasts'),
    endUnlocked: $('#end-unlocked'),
    toast: $('#toast'),
  };

  let ctx = null;
  let scene = 'menu';            // menu | lobby | playing | ended
  let isHosting = false;
  let roomCode = '';
  let playerName = 'Jugador';
  let playerSkin = 0;
  let playerChar = 'isaac';
  let lobbyPeers = [];           // {id, name, color, isHost}
  let myClientId = null;
  let hostSeed = 0, hostFloor = 1;
  let toastTimer = 0;
  let idleT = 0;
  let previewInfoAcc = 0;
  let endHandled = false;
  let runRewarded = false;

  // ---------------------------------------------------------
  // Utilidades de interfaz
  // ---------------------------------------------------------
  function show(el) { if (el) el.classList.remove('hidden'); }
  function hide(el) { if (el) el.classList.add('hidden'); }

  function toast(msg, ms) {
    ui.toast.textContent = msg;
    show(ui.toast);
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => hide(ui.toast), ms || 2600);
  }

  function showOverlay(which) {
    [ui.ovMain, ui.ovHelp, ui.ovLobby, ui.ovJoin, ui.ovPause, ui.ovEnd, ui.ovShop, ui.ovChallenges, ui.ovProgress, ui.ovPreview].forEach(hide);
    if (which) show(which);
  }

  function setScene(s) {
    scene = s;
    if (s === 'playing') { show(ui.topbar); showOverlay(null); }
    else { hide(ui.topbar); setUpgradesVisible(false); }
  }

  function updateTopbar(view) {
    if (!view) return;
    if (roomCode) {
      if (ui.tbRoom.dataset.code !== roomCode) {
        ui.tbRoom.dataset.code = roomCode;
        ui.tbRoom.innerHTML = 'Sala <b></b>';
        ui.tbRoom.querySelector('b').textContent = roomCode;
      }
      ui.tbRoom.style.display = '';
    } else {
      ui.tbRoom.dataset.code = '';
      ui.tbRoom.textContent = view.players.length > 1 ? (view.players.length + ' jugadores') : 'Un jugador';
      ui.tbRoom.style.display = '';
    }
    if (view.mode === 'client' || view.mode === 'host') {
      const me = view.players.find((p) => p.id === view.localId);
      const ping = me && me.ping;
      ui.tbPing.textContent = ping ? ping + ' ms' : 'conectado';
      ui.tbPing.style.display = '';
    } else {
      ui.tbPing.style.display = 'none';
    }
  }

  // ---------------------------------------------------------
  // Nombre del jugador
  // ---------------------------------------------------------
  function sanitizeName(v) {
    return String(v == null ? '' : v).replace(/\s+/g, ' ').trim().slice(0, 14);
  }

  // Nombre efectivo del jugador local (o el de reserva si está vacío)
  function myName(fallback) {
    return sanitizeName(playerName) || fallback;
  }

  function loadSavedName() {
    try { return localStorage.getItem('llanto-name') || ''; } catch (e) { return ''; }
  }

  function saveName(n) {
    try { localStorage.setItem('llanto-name', n); } catch (e) {}
  }

  // ---------------------------------------------------------
  // PERSONAJES (sustituyen a las skins) y PROGRESO persistente
  // Los módulos Characters y Meta son opcionales: si no están
  // cargados la interfaz se degrada con elegancia.
  // ---------------------------------------------------------
  const CH = () => ((global.Characters && global.Characters.LIST) ? global.Characters : null);
  const MT = () => global.Meta || null;

  function loadSavedChar() {
    const ch = CH(); if (!ch) return 'isaac';
    const mt = MT();
    let id = '';
    try { id = localStorage.getItem('llanto-char') || ''; } catch (e) {}
    const found = ch.byId(id);
    if (found && (!mt || mt.isUnlocked(found.id))) return found.id;
    const first = ch.LIST.find((c) => !mt || mt.isUnlocked(c.id));
    return first ? first.id : 'isaac';
  }

  function saveChar(id) {
    try { localStorage.setItem('llanto-char', id); } catch (e) {}
  }

  // Icono de personaje: la misma cara redonda que se dibuja en el juego.
  function faceSpan(char) {
    const f = document.createElement('canvas');
    f.className = 'face';
    const S = 64;
    f.width = S; f.height = S;
    const g = f.getContext ? f.getContext('2d') : null;
    if (g && global.Render && Render.drawFace) {
      try { Render.drawFace(g, char.skin, S / 2, S * 0.58, S * 0.30); } catch (e) { /* icono sin cara */ }
    }
    return f;
  }

  function setChar(id) {
    const ch = CH(); if (!ch) return;
    const c = ch.byId(id);
    if (!c) return;
    const mt = MT();
    if (mt && !mt.isUnlocked(id)) { toast('Ese personaje aún está bloqueado'); return; }
    playerChar = id;
    playerSkin = Entities.normSkin(c.skin);
    saveChar(id);
    Sfx.play('ui');
    renderCharPickers();
  }

  // Ficha de personaje: nombre, descripción, pasiva, activa y desbloqueo.
  function charInfoHtml(c) {
    const mt = MT();
    const st = mt ? mt.charStatus(c) : { state: 'owned' };
    const owned = st.state === 'owned';
    let h = '';
    h += '<div class="cd-name">' + Utils.escapeHtml(c.name) + (owned ? '' : ' 🔒') + '</div>';
    h += '<div class="cd-desc">' + Utils.escapeHtml(c.desc || '') + '</div>';
    h += '<div class="cd-line"><b>Pasiva · ' + Utils.escapeHtml(c.passive.name) + '</b><span>' + Utils.escapeHtml(c.passive.desc) + '</span></div>';
    h += '<div class="cd-line"><b>Activa · ' + Utils.escapeHtml(c.active.name) + '</b><span>' +
         Utils.escapeHtml(c.active.desc) + ' (1 carga · recarga solo con ' + (c.active.kills || 8) + ' bajas)</span></div>';
    if (owned) h += '<div class="cd-unlock owned">✓ Desbloqueado</div>';
    else h += '<div class="cd-unlock">🔒 Desbloqueo: ' + Utils.escapeHtml(st.reason || '???') + '</div>';
    return h;
  }

  function renderCharPickers() {
    const ch = CH();
    if (!ch) return;
    const mt = MT();
    [ui.charPicker, ui.charPickerJoin].forEach((box) => {
      if (!box) return;
      box.innerHTML = '';
      ch.LIST.forEach((c) => {
        const owned = !mt || mt.isUnlocked(c.id);
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'char-btn' + (c.id === playerChar ? ' selected' : '') + (owned ? '' : ' locked');
        b.title = c.name + (owned ? '' : ' — ' + (mt ? mt.charStatus(c).reason : 'Bloqueado'));
        b.setAttribute('data-char', c.id);
        b.setAttribute('aria-label', c.name);
        b.appendChild(faceSpan(c));
        const nm = document.createElement('span');
        nm.className = 'cname';
        nm.textContent = c.name;
        b.appendChild(nm);
        if (!owned) {
          const lk = document.createElement('span');
          lk.className = 'lock';
          lk.textContent = '🔒';
          b.appendChild(lk);
        }
        box.appendChild(b);
      });
    });
    const c = ch.byId(playerChar);
    if (ui.charDetail) ui.charDetail.innerHTML = charInfoHtml(c);
    if (ui.charDetailJoin) ui.charDetailJoin.innerHTML = charInfoHtml(c);
  }

  function renderMetaBar() {
    const mt = MT(); if (!mt) return;
    if (ui.menuAch) ui.menuAch.textContent = String(mt.achievementCount());
    if (ui.menuAchTotal) ui.menuAchTotal.textContent = String(mt.ACHIEVEMENTS.length);
  }

  // ---------------------------------------------------------
  // Personajes: galería + detalle (antes "tienda", ahora sin monedas)
  // ---------------------------------------------------------
  let rosterSel = null;

  function renderRosterDetail(id) {
    const ch = CH();
    if (!ch || !ui.rosterDetail) return;
    const c = ch.byId(id);
    const mt = MT();
    const owned = !mt || mt.isUnlocked(c.id);
    ui.rosterDetail.innerHTML = charInfoHtml(c) + '<div class="cd-actions"></div>';
    const actions = ui.rosterDetail.querySelector('.cd-actions');
    if (!actions) return;
    if (owned) {
      const b = document.createElement('button');
      b.className = 'btn small' + (c.id === playerChar ? '' : ' primary');
      b.setAttribute('data-char', c.id);
      b.textContent = c.id === playerChar ? '✓ Elegido' : 'Elegir';
      actions.appendChild(b);
    }
    const pv = document.createElement('button');
    pv.className = 'btn small ghost';
    pv.setAttribute('data-preview', c.id);
    pv.textContent = '🧪 Probar';
    actions.appendChild(pv);
  }

  function renderShop() {
    const ch = CH(); const mt = MT();
    if (!ch || !ui.shopGrid) return;
    if (!rosterSel || !ch.byId(rosterSel)) rosterSel = playerChar;
    ui.shopGrid.innerHTML = '';
    ch.LIST.forEach((c) => {
      const owned = !mt || mt.isUnlocked(c.id);
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'roster-char' + (c.id === rosterSel ? ' selected' : '') + (owned ? '' : ' locked');
      b.setAttribute('data-roster', c.id);
      b.setAttribute('aria-label', c.name);
      b.appendChild(faceSpan(c));
      const nm = document.createElement('span');
      nm.className = 'cname';
      nm.textContent = c.name;
      b.appendChild(nm);
      if (!owned) {
        const lk = document.createElement('span');
        lk.className = 'lock';
        lk.textContent = '🔒';
        b.appendChild(lk);
      }
      ui.shopGrid.appendChild(b);
    });
    renderRosterDetail(rosterSel);
  }

  // ---------------------------------------------------------
  // Zona de pruebas: barra lateral de personajes + panel de daño
  // ---------------------------------------------------------
  function renderPreviewChars(selectedId) {
    const ch = CH(); const mt = MT();
    if (!ui.previewChars) return;
    if (!ch) return;
    if (!selectedId && global.Preview) selectedId = Preview.stats().charId;
    ui.previewChars.innerHTML = '';
    ch.LIST.forEach((c) => {
      const owned = !mt || mt.isUnlocked(c.id);
      const b = document.createElement('button');
      b.className = 'preview-char' + (c.id === selectedId ? ' selected' : '');
      b.setAttribute('type', 'button');
      b.setAttribute('data-preview-char', c.id);
      b.appendChild(faceSpan(c));
      const nm = document.createElement('span');
      nm.className = 'cname';
      nm.textContent = c.name;
      b.appendChild(nm);
      if (!owned) {
        const lk = document.createElement('span');
        lk.className = 'lock';
        lk.textContent = '🔒';
        b.appendChild(lk);
      }
      ui.previewChars.appendChild(b);
    });
  }

  function renderPreviewInfo() {
    if (!ui.previewInfo || !global.Preview) return;
    const s = Preview.stats();
    const ch = CH();
    const c = ch && s.charId ? ch.byId(s.charId) : null;
    let html = '';
    if (c) {
      html += '<div class="nm">' + Utils.escapeHtml(c.name) + '</div>';
      html += '<div>Activa: ' + Utils.escapeHtml(c.active.name) + ' · Pasiva: ' + Utils.escapeHtml(c.passive.name) + '</div>';
    }
    html += '<div>Daño por disparo: <span class="dmg">' + s.damage.toFixed(1) + '</span></div>';
    html += '<div>Cadencia: <b>' + s.fireRate.toFixed(1) + '</b>/s · Velocidad: <b>' + Math.round(s.speed) + '</b> · Vida: <b>' + Math.round(s.hp) + '</b></div>';
    if (s.active && s.active.name) {
      const a = s.active;
      const st = a.charges > 0 ? '<span class="dmg">lista (' + a.charges + '/' + a.max + ')</span>'
        : '<span class="hint">recargando · faltan ' + Math.max(0, (a.killReq || 0) - (a.kills || 0)) + ' bajas</span>';
      html += '<div>Activa [Espacio]: ' + st + '</div>';
    }
    if (s.buffText) html += '<div class="hint">Buff activo: ' + Utils.escapeHtml(s.buffText) + '</div>';
    html += '<div>Último impacto: <b>' + s.lastHit.toFixed(1) + '</b> · Golpes: <b>' + s.hits + '</b></div>';
    html += '<div>Daño total: <b>' + s.total.toFixed(0) + '</b> · DPS: <b>' + s.dps.toFixed(1) + '</b></div>';
    html += '<span class="hint">WASD moverse · Flechas disparar · Espacio activa</span>';
    ui.previewInfo.innerHTML = html;
  }

  function openPreview(charId) {
    if (!global.Preview) return;
    const id = charId || playerChar;
    Preview.open(id);
    renderPreviewChars(id);
    renderPreviewInfo();
    setScene('preview');
    showOverlay(ui.ovPreview);
    toast('Sala de pruebas: dispara al muñeco', 2400);
  }

  function closePreview() {
    if (global.Preview) Preview.close();
    ctx = Render.init(ui.canvas);   // el lienzo principal vuelve a ser el del juego
    renderShop();
    renderCharPickers();
    setScene('menu');
    showOverlay(ui.ovShop);
  }

  function selectPreviewChar(id) {
    if (!global.Preview || !Preview.isOpen()) return;
    Preview.setChar(id);
    renderPreviewChars(id);
    renderPreviewInfo();
    // Solo se adopta como personaje propio si está desbloqueado.
    const mt = MT();
    const owned = !mt || mt.isUnlocked(id);
    if (owned) {
      saveChar(id);
      playerChar = id;
      const c = CH() && CH().byId(id);
      if (c) playerSkin = Entities.normSkin(c.skin);
    }
  }

  function renderProgress() {
    const mt = MT(); if (!mt) return;
    const s = mt.get().stats;
    if (ui.progStats) {
      ui.progStats.innerHTML = '';
      const chips = [
        ['Partidas', s.runs],
        ['Victorias', s.wins],
        ['Piso máximo', s.bestFloor],
        ['Enemigos', s.totalKills],
        ['Jefes', Object.keys(s.bosses || {}).length],
        ['Sucesos raros', s.events || 0],
        ['Desafíos', Object.keys(s.challenges || {}).length + '/' + ((global.Challenges && global.Challenges.LIST.length) || 0)],
        ['Logros', mt.achievementCount() + '/' + mt.ACHIEVEMENTS.length],
      ];
      for (const pair of chips) {
        const c = document.createElement('div');
        c.className = 'chip';
        c.innerHTML = pair[0] + ': <b>' + pair[1] + '</b>';
        ui.progStats.appendChild(c);
      }
    }
    if (ui.achList) {
      ui.achList.innerHTML = '';
      mt.ACHIEVEMENTS.forEach((a) => {
        const earned = mt.hasAchievement(a.id);
        const li = document.createElement('li');
        if (earned) li.className = 'earned';
        const ico = document.createElement('span');
        ico.className = 'ico';
        ico.textContent = earned ? '🏆' : '🔒';
        li.appendChild(ico);
        const wrap = document.createElement('div');
        const b = document.createElement('b'); b.textContent = a.name;
        const sp = document.createElement('span'); sp.textContent = a.desc;
        wrap.appendChild(b); wrap.appendChild(sp);
        li.appendChild(wrap);
        ui.achList.appendChild(li);
      });
    }
    if (ui.progAchCount) ui.progAchCount.textContent = mt.achievementCount() + '/' + mt.ACHIEVEMENTS.length;
  }

  // ---------------------------------------------------------
  // Desafíos (retos de partida con modificadores)
  // ---------------------------------------------------------
  function renderChallenges() {
    const cl = global.Challenges;
    if (!ui.challList || !cl) return;
    const mt = MT();
    ui.challList.innerHTML = '';
    cl.LIST.forEach((c) => {
      const done = mt && mt.challengeDone(c.id);
      const card = document.createElement('div');
      card.className = 'chall-card' + (done ? ' done' : '');
      const ico = document.createElement('div');
      ico.className = 'chall-icon';
      ico.textContent = c.icon || '🔥';
      card.appendChild(ico);
      const body = document.createElement('div');
      body.className = 'chall-body';
      const h = document.createElement('h4');
      h.textContent = c.name + (done ? ' ✓' : '');
      body.appendChild(h);
      const p = document.createElement('p');
      p.textContent = c.desc;
      body.appendChild(p);
      const rw = document.createElement('div');
      rw.className = 'chall-reward';
      const rc = c.reward && CH() && CH().byId(c.reward);
      rw.textContent = '★ Premio: ' + (rc ? rc.name : '—');
      body.appendChild(rw);
      card.appendChild(body);
      const b = document.createElement('button');
      b.className = 'btn small' + (done ? '' : ' primary');
      b.setAttribute('data-challenge', c.id);
      b.textContent = '▶ Jugar';
      card.appendChild(b);
      ui.challList.appendChild(card);
    });
  }

  function startChallenge(id) {
    const cl = global.Challenges;
    const c = cl && cl.byId(id);
    if (!c) return;
    playSolo({ challenge: id });
    toast('Desafío: ' + c.name, 2600);
  }

  // Avisos de personajes desbloqueados (por estadísticas o desafíos).
  function pollUnlocks() {
    const mt = MT();
    if (!mt || !mt.drainUnlocked) return;
    const newly = mt.drainUnlocked();
    for (const id of newly) {
      const c = CH() && CH().byId(id);
      if (c) {
        toast('🔓 ¡Personaje desbloqueado: ' + c.name + '!', 3400);
        Sfx.play('win');
      }
    }
    if (newly.length) { renderCharPickers(); renderMetaBar(); }
  }

  // ---------------------------------------------------------
  // Avisos de logro (abajo a la izquierda)
  // ---------------------------------------------------------
  function pollAchievements() {
    const mt = MT();
    if (!mt || !mt.drainToasts) return;
    const list = mt.drainToasts();
    for (const id of list) {
      const a = mt.ACH_BY_ID[id];
      if (a) showAchToast(a);
    }
  }

  function showAchToast(a) {
    if (!ui.achToasts) return;
    Sfx.play('win');
    const card = document.createElement('div');
    card.className = 'ach-toast';
    const ico = document.createElement('span');
    ico.className = 'ico'; ico.textContent = '🏆';
    const wrap = document.createElement('div');
    const b = document.createElement('b'); b.textContent = 'Logro: ' + a.name;
    const sp = document.createElement('span'); sp.textContent = a.desc;
    wrap.appendChild(b); wrap.appendChild(sp);
    card.appendChild(ico); card.appendChild(wrap);
    ui.achToasts.appendChild(card);
    setTimeout(() => {
      if (card.remove) card.remove();
      else if (ui.achToasts.removeChild) { try { ui.achToasts.removeChild(card); } catch (e) {} }
    }, 4400);
  }

  // ---------------------------------------------------------
  // Panel de mejoras (mantener Tab · solo para quien lo pulsa)
  // ---------------------------------------------------------
  let upgradesHeld = false;

  function renderUpgrades() {
    if (!ui.upgList) return;
    const view = Game.G.running ? Game.view() : null;
    if (!view) return;
    const me = view.players.find((p) => p.id === view.localId) || view.players[0];
    ui.upgList.innerHTML = '';
    const items = view.items || [];
    if (!items.length) {
      const p = document.createElement('p');
      p.className = 'subtitle';
      p.textContent = 'Todavía no tenéis ninguna mejora. ¡Abrid cofres y comprad en las tiendas!';
      ui.upgList.appendChild(p);
      return;
    }
    for (const id of items) {
      const item = Entities.itemById(id);
      if (!item) continue;
      const card = document.createElement('div');
      card.className = 'upg-card';
      const head = document.createElement('div');
      head.className = 'uname';
      const dot = document.createElement('span');
      dot.className = 'doti';
      dot.style.background = item.color || '#9fb3c8';
      head.appendChild(dot);
      const nm = document.createElement('span');
      nm.textContent = item.name;
      head.appendChild(nm);
      const tier = document.createElement('span');
      tier.className = 'tier';
      const td = Entities.tierOf(item);
      if (td) { tier.textContent = td.name; tier.style.color = td.color; }
      head.appendChild(tier);
      card.appendChild(head);

      const desc = document.createElement('div');
      desc.className = 'upg-desc';
      desc.textContent = item.desc || '';
      if (me) {
        const deltas = Entities.itemStatDeltas(item, me);
        for (const d of deltas) {
          const line = document.createElement('div');
          line.className = 'delta' + (d.positive ? '' : ' neg');
          line.textContent = '· ' + d.label + ' ' + d.text;
          desc.appendChild(line);
        }
        const syns = Entities.synergyWith(item, me);
        for (const s of syns.slice(0, 3)) {
          const line = document.createElement('div');
          line.className = 'syn';
          line.textContent = '⚡ ' + s.name;
          desc.appendChild(line);
        }
      }
      card.appendChild(desc);
      ui.upgList.appendChild(card);
    }
  }

  function setUpgradesVisible(v) {
    if (!ui.ovUpgrades) return;
    if (v) { renderUpgrades(); show(ui.ovUpgrades); }
    else hide(ui.ovUpgrades);
  }


  // ---------------------------------------------------------
  // Lobby
  // ---------------------------------------------------------
  function renderLobby() {
    ui.lobbyCode.textContent = roomCode || '----';
    ui.lobbyCount.textContent = lobbyPeers.length + '/4';
    ui.lobbyPlayers.innerHTML = '';
    lobbyPeers.forEach((p) => {
      const li = document.createElement('li');
      const dot = document.createElement('span');
      dot.className = 'dot';
      dot.style.background = Entities.skinColor(p.skin != null ? p.skin : 0);
      const nm = document.createElement('span');
      nm.textContent = p.name;
      li.appendChild(dot);
      li.appendChild(nm);
      if (p.isHost) {
        const t = document.createElement('span');
        t.className = 'host-tag';
        t.textContent = 'anfitrión';
        li.appendChild(t);
      }
      ui.lobbyPlayers.appendChild(li);
    });
  }

  function localHostPeer() {
    return { id: 'host', name: myName('Anfitrión'), skin: playerSkin, char: playerChar, isHost: true };
  }

  // ---------------------------------------------------------
  // Arranques de partida
  // ---------------------------------------------------------
  function playSolo(opts) {
    Sfx.unlock();
    roomCode = '';
    ctx = Render.init(ui.canvas);   // por si venimos de la zona de pruebas
    Game.setHandlers({ onEnd: onGameEnd, onPing: null });
    Game.start({
      mode: 'local',
      challenge: (opts && opts.challenge) || null,
      localPlayers: [{ id: 'p0', name: myName('Jugador'), skin: playerSkin, char: playerChar, slot: 0, scheme: 'p1' }],
    });
    setScene('playing');
  }

  // ---------------------------------------------------------
  // Anfitrión online
  // ---------------------------------------------------------
  function startHosting() {
    Sfx.unlock();
    if (!Net.available()) {
      toast('No se pudo cargar PeerJS. Revisa tu conexión e inténtalo de nuevo.', 4200);
      return;
    }
    roomCode = Utils.makeRoomCode(4);
    isHosting = true;
    lobbyPeers = [localHostPeer()];
    renderLobby();
    ui.lobbyStatus.textContent = 'Conectando con el servidor de emparejamiento…';
    ui.btnStartHost.disabled = true;
    showOverlay(ui.ovLobby);
    setScene('lobby');

    Net.host(roomCode, {
      onOpen(code) {
        roomCode = code;
        renderLobby();
        ui.lobbyStatus.textContent = 'Sala lista. Comparte el código.';
        ui.btnStartHost.disabled = false;
      },
      onRetry(newCode) {
        roomCode = newCode;
        renderLobby();
      },
      onPeerJoin() {
        ui.lobbyStatus.textContent = 'Jugador conectado, identificándose…';
      },
      onPeerLeave(peerId) {
        lobbyPeers = lobbyPeers.filter((p) => p.id !== peerId);
        renderLobby();
        Game.removePlayer(peerId);
        ui.lobbyStatus.textContent = 'Un jugador ha salido.';
      },
      onData(peerId, msg) {
        handleHostData(peerId, msg);
      },
      onError(type, err) {
        console.warn('[net host]', type, err);
        if (scene === 'lobby') ui.lobbyStatus.textContent = 'Error de red: ' + type;
        else toast('Error de red: ' + type);
      },
    });
  }

  function handleHostData(peerId, msg) {
    if (!msg || typeof msg !== 'object') return;
    switch (msg.t) {
      case 'hello': {
        if (lobbyPeers.find((p) => p.id === peerId)) break;
        const slot = lobbyPeers.length % C.MAX_PLAYERS;
        const entry = {
          id: peerId,
          name: String(msg.name || 'Jugador').slice(0, 14),
          skin: Entities.normSkin(msg.skin != null ? msg.skin : slot),
          char: (global.Characters && Characters.byId(msg.char)) ? msg.char : undefined,
          isHost: false,
        };
        lobbyPeers.push(entry);

        const running = Game.G.running && scene === 'playing';
        Net.sendTo(peerId, {
          t: 'welcome',
          id: peerId,
          name: entry.name,
          skin: entry.skin,
          char: entry.char,
          seed: Game.G.seed,
          floor: Game.G.floorNum,
          running,
          players: lobbyPeers.map((p) => ({ id: p.id, name: p.name, skin: p.skin, char: p.char, isHost: p.isHost })),
        });

        if (running) {
          Game.addRemotePlayer(peerId, entry.name, entry.skin, entry.char);
          Net.sendTo(peerId, { t: 'start', seed: Game.G.seed, floor: Game.G.floorNum });
          Net.sendTo(peerId, { t: 'state', s: Game.serialState() });
        } else {
          broadcastLobby();
        }
        renderLobby();
        Sfx.play('join');
        ui.lobbyStatus.textContent = entry.name + ' en la sala.';
        break;
      }
      case 'input':
        Game.setRemoteInput(peerId, msg.i || [0, 0, 0, 0, 0]);
        break;
      case 'ping':
        Net.sendTo(peerId, { t: 'pong', ts: msg.ts });
        break;
      case 'bye':
        lobbyPeers = lobbyPeers.filter((p) => p.id !== peerId);
        renderLobby();
        Game.removePlayer(peerId);
        break;
      default: break;
    }
  }

  function broadcastLobby() {
    Net.broadcast({
      t: 'lobby',
      players: lobbyPeers.map((p) => ({ id: p.id, name: p.name, skin: p.skin, char: p.char, isHost: p.isHost })),
    });
  }

  function startHostRun() {
    const remote = lobbyPeers.filter((p) => !p.isHost).map((p) => ({ id: p.id, name: p.name, skin: p.skin, char: p.char }));
    const seed = Utils.makeSeed();
    hostSeed = seed;
    hostFloor = 1;
    ctx = Render.init(ui.canvas);   // por si venimos de la zona de pruebas
    Game.setHandlers({ onEnd: onGameEnd, onPing: null });
    Game.start({
      mode: 'host',
      seed,
      floorNum: 1,
      localPlayers: [{ id: 'host', name: myName('Anfitrión'), skin: playerSkin, char: playerChar, slot: 0, scheme: 'p1' }],
      remotePlayers: remote,
    });
    Net.broadcast({ t: 'start', seed, floor: 1 });
    setScene('playing');
  }

  // ---------------------------------------------------------
  // Cliente online
  // ---------------------------------------------------------
  function tryJoin() {
    Sfx.unlock();
    const code = (ui.joinCode.value || '').trim().toUpperCase();
    if (code.length !== 4) {
      ui.joinStatus.textContent = 'El código debe tener 4 caracteres.';
      return;
    }
    if (!Net.available()) {
      ui.joinStatus.textContent = 'No se pudo cargar PeerJS. Revisa tu conexión.';
      return;
    }
    isHosting = false;
    ui.joinStatus.textContent = 'Conectando con la sala ' + code + '…';
    roomCode = code;

    Net.join(code, {
      onOpen() {
        ui.joinStatus.textContent = 'Conectado. Entrando…';
        Net.sendToHost({ t: 'hello', name: myName('Jugador'), skin: playerSkin, char: playerChar });
      },
      onData(msg) {
        handleClientData(msg);
      },
      onClose() {
        toast('Se perdió la conexión con el anfitrión.', 4000);
        quitToMenu();
      },
      onError(type) {
        const map = {
          'peer-unavailable': 'No existe ninguna sala con ese código.',
          'timeout': 'No se pudo conectar (tiempo agotado). Prueba otra red.',
          'connection': 'Fallo al establecer la conexión P2P.',
        };
        ui.joinStatus.textContent = map[type] || ('Error: ' + type);
        Net.disconnect();
      },
    });
  }

  function handleClientData(msg) {
    if (!msg || typeof msg !== 'object') return;
    switch (msg.t) {
      case 'welcome':
        myClientId = msg.id;
        hostSeed = msg.seed;
        hostFloor = msg.floor;
        lobbyPeers = (msg.players || []).map((p) => ({ ...p }));
        renderLobby();
        ui.btnStartHost.style.display = 'none';
        if (msg.running) {
          beginClientRun();
        } else {
          showOverlay(ui.ovLobby);
          setScene('lobby');
          ui.lobbyStatus.textContent = 'Esperando a que el anfitrión empiece…';
        }
        break;
      case 'lobby':
        lobbyPeers = (msg.players || []).map((p) => ({ ...p }));
        renderLobby();
        break;
      case 'start':
        hostSeed = msg.seed;
        hostFloor = msg.floor;
        if (scene !== 'playing') beginClientRun();
        break;
      case 'state':
        Game.applyState(msg.s);
        break;
      case 'pong':
        Game.applyPing(msg.ts);
        break;
      case 'full':
        toast('La sala está llena (máximo 4 jugadores).', 3600);
        Net.disconnect();
        showOverlay(ui.ovMain);
        setScene('menu');
        break;
      case 'bye':
        toast('El anfitrión cerró la sala.', 3600);
        quitToMenu();
        break;
      default: break;
    }
  }

  function beginClientRun() {
    ctx = Render.init(ui.canvas);   // por si venimos de la zona de pruebas
    Game.setHandlers({
      onEnd: onGameEnd,
      onPing: (rtt) => { ui.tbPing.textContent = rtt + ' ms'; },
    });
    Game.start({
      mode: 'client',
      seed: hostSeed,
      floorNum: hostFloor,
      localId: myClientId,
      localPlayers: [{ id: myClientId, name: myName('Jugador'), skin: playerSkin, char: playerChar, slot: 1, scheme: 'p1' }],
    });
    setScene('playing');
  }

  // ---------------------------------------------------------
  // Fin de partida
  // ---------------------------------------------------------
  function onGameEnd(kind) {
    if (endHandled) return;
    endHandled = true;
    const g = Game.G;
    if (kind === 'win') {
      ui.endTitle.textContent = '¡Victoria!';
      ui.endText.textContent = 'Has superado los ' + C.FLOORS + ' pisos. Enemigos eliminados: ' + g.stats.kills + '.';
    } else {
      ui.endTitle.textContent = 'Fin de la partida';
      ui.endText.textContent = 'Habéis caído en el piso ' + g.floorNum + '. Enemigos eliminados: ' + g.stats.kills + '.';
    }
    // Progreso persistente (una vez por partida). Ya no hay monedas: lo que
    // importa es si el reto/desafío desbloquea personajes.
    const mt = MT();
    if (mt && !runRewarded) {
      runRewarded = true;
      const r = mt.finishRun(Game.runSummary());
      if (ui.endUnlocked) {
        const names = (r.newly || []).map((id) => { const c = CH() && CH().byId(id); return c ? c.name : id; });
        ui.endUnlocked.textContent = names.length ? ('🔓 ¡Has desbloqueado: ' + names.join(', ') + '!') : '';
      }
      renderMetaBar();
    } else if (ui.endUnlocked) {
      ui.endUnlocked.textContent = '';
    }
    setTimeout(() => { if (scene === 'playing') { showOverlay(ui.ovEnd); } }, 900);
  }

  // ---------------------------------------------------------
  // Salir / reiniciar
  // ---------------------------------------------------------
  function quitToMenu() {
    endHandled = false;
    runRewarded = false;
    setUpgradesVisible(false);
    Game.stop();
    Game.setPaused(false);
    if (isHosting || Net.role) {
      try { Net.disconnect(); } catch (e) {}
    }
    isHosting = false;
    roomCode = '';
    myClientId = null;
    lobbyPeers = [];
    ui.btnStartHost.style.display = '';
    ui.btnStartHost.disabled = false;
    ui.joinStatus.textContent = '';
    setScene('menu');
    showOverlay(ui.ovMain);
    renderMetaBar();
  }

  function restart() {
    endHandled = false;
    runRewarded = false;
    const mode = Game.G.mode;
    if (mode === 'local') {
      playSolo();
    } else if (mode === 'host') {
      Game.stop();
      startHostRun();
    } else {
      // el cliente no puede reiniciar la partida: sale al menú
      toast('El anfitrión debe reiniciar la partida.', 3200);
      quitToMenu();
    }
  }

  // ---------------------------------------------------------
  // Bucle principal
  // ---------------------------------------------------------
  const STEP = 1 / 60;
  let last = performance.now();
  let acc = 0;

  function paintIdle(dt) {
    idleT += dt;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    const bg = ctx.createRadialGradient(C.VIEW_W / 2, C.VIEW_H / 2, 40, C.VIEW_W / 2, C.VIEW_H / 2, 620);
    bg.addColorStop(0, '#181322');
    bg.addColorStop(1, '#07050b');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, C.VIEW_W, C.VIEW_H);

    for (let i = 0; i < 26; i++) {
      const s = i * 12.9898;
      const x = ((Math.sin(s) * 43758.5) % 1 + 1) % 1 * C.VIEW_W;
      const y = ((((Math.cos(s * 1.7) * 12345.6) % 1) + 1) % 1) * C.VIEW_H;
      const r = 6 + (i % 5) * 5;
      const yy = (y + idleT * (8 + (i % 7) * 3)) % (C.VIEW_H + 80) - 40;
      ctx.globalAlpha = 0.05 + (i % 4) * 0.02;
      ctx.fillStyle = i % 3 === 0 ? '#7a5cff' : (i % 3 === 1 ? '#ff6b8a' : '#ffb648');
      ctx.beginPath();
      ctx.arc(x, yy, r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  function frame(now) {
    requestAnimationFrame(frame);
    let dt = (now - last) / 1000;
    last = now;
    if (dt > 0.25) dt = 0.25;

    if (Game.G.running && scene === 'playing') {
      acc += dt;
      let n = 0;
      while (acc >= STEP && n < 4) {
        Game.step(STEP);
        acc -= STEP;
        n++;
      }
      if (acc > STEP * 2) acc = 0;
      const view = Game.view();
      Render.frame(view);
      updateTopbar(view);
    } else if (scene === 'preview' && global.Preview && Preview.isOpen()) {
      acc = 0;
      Preview.step(dt);
      Preview.draw();
      previewInfoAcc += dt;
      if (previewInfoAcc > 0.1) { previewInfoAcc = 0; renderPreviewInfo(); }
    } else {
      acc = 0;
      paintIdle(dt);
    }

    pollAchievements();
    pollUnlocks();
    if (Input.consume('KeyM')) toggleMute();
    if (Input.consume('KeyH')) toggleHitboxes();
    if (Input.consume('Escape')) togglePause();
    Input.endFrame();
  }

  function toggleHitboxes() {
    if (typeof Render.toggleHitboxes !== 'function') return;
    const on = Render.toggleHitboxes();
    Sfx.play('ui');
    if (scene === 'playing') toast(on ? 'Hitboxes: activadas' : 'Hitboxes: desactivadas', 1200);
  }

  function togglePause() {
    if (scene !== 'playing' || !Game.G.running) return;
    const p = !Game.G.paused;
    Game.setPaused(p);
    if (p) { setUpgradesVisible(false); show(ui.ovPause); } else { hide(ui.ovPause); }
  }

  function toggleMute() {
    const m = !Sfx.isMuted();
    Sfx.setMuted(m);
    ui.btnMute.textContent = m ? '🔇' : '🔊';
    ui.btnMute.title = m ? 'Activar sonido (M)' : 'Silenciar (M)';
    toast(m ? 'Sonido silenciado' : 'Sonido activado', 1400);
  }

  // ---------------------------------------------------------
  // Eventos de la interfaz
  // ---------------------------------------------------------
  function onAction(action) {
    Sfx.unlock();
    Sfx.play('ui');
    switch (action) {
      case 'solo': playSolo(); break;
      case 'host': startHosting(); break;
      case 'join':
        ui.joinStatus.textContent = '';
        showOverlay(ui.ovJoin);
        setScene('lobby');
        ui.joinCode.focus();
        break;
      case 'help': showOverlay(ui.ovHelp); break;
      case 'shop': renderShop(); showOverlay(ui.ovShop); break;
      case 'challenges': renderChallenges(); showOverlay(ui.ovChallenges); break;
      case 'preview': openPreview(playerChar); break;
      case 'preview-back': closePreview(); break;
      case 'progress': renderProgress(); showOverlay(ui.ovProgress); break;
      case 'wipe-ach': {
        const mt = MT();
        if (mt) { mt.resetAchievements(); renderProgress(); renderMetaBar(); toast('Logros borrados'); }
        break;
      }
      case 'wipe-all': {
        const mt = MT();
        if (!mt) break;
        if (global.confirm && !global.confirm('¿Borrar TODO el progreso? Esta acción no se puede deshacer.')) break;
        mt.resetAll();
        playerChar = loadSavedChar();
        const c0 = CH() && CH().byId(playerChar);
        if (c0) playerSkin = Entities.normSkin(c0.skin);
        renderCharPickers(); renderShop(); renderProgress(); renderMetaBar();
        toast('Progreso borrado por completo');
        break;
      }
      case 'back': showOverlay(ui.ovMain); setScene('menu'); break;
      case 'do-join': tryJoin(); break;
      case 'start-host': startHostRun(); break;
      case 'leave': quitToMenu(); break;
      case 'resume': togglePause(); break;
      case 'quit': quitToMenu(); break;
      case 'retry': restart(); break;
      case 'menu': quitToMenu(); break;
      default: break;
    }
  }

  function bindUI() {
    document.addEventListener('click', (e) => {
      const rb = e.target.closest('[data-roster]');
      if (rb && rb.getAttribute('data-roster') != null) {
        rosterSel = rb.getAttribute('data-roster');
        renderShop();
        return;
      }
      const pvb = e.target.closest('[data-preview]');
      if (pvb && pvb.getAttribute('data-preview') != null) {
        openPreview(pvb.getAttribute('data-preview'));
        return;
      }
      const chb = e.target.closest('[data-challenge]');
      if (chb && chb.getAttribute('data-challenge') != null) {
        startChallenge(chb.getAttribute('data-challenge'));
        return;
      }
      const cb = e.target.closest('[data-char]');
      if (cb && cb.getAttribute('data-char') != null) {
        setChar(cb.getAttribute('data-char'));
        if (scene === 'menu' || scene === 'lobby') renderShop();
        return;
      }
      const pcb = e.target.closest('[data-preview-char]');
      if (pcb && pcb.getAttribute('data-preview-char') != null) {
        selectPreviewChar(pcb.getAttribute('data-preview-char'));
        return;
      }
      const btn = e.target.closest('[data-action]');
      if (btn) onAction(btn.getAttribute('data-action'));
    });

    // Mantener Tab muestra el panel de mejoras; al soltar se oculta.
    // Es solo para quien pulsa la tecla (overlay local, no toca la simulación).
    document.addEventListener('keydown', (e) => {
      if (e.code !== 'Tab' && e.key !== 'Tab') return;
      if (scene !== 'playing' || !Game.G.running || Game.G.paused || Game.G.over) return;
      if (e.preventDefault) e.preventDefault();
      if (!upgradesHeld) { upgradesHeld = true; setUpgradesVisible(true); }
    });
    document.addEventListener('keyup', (e) => {
      if (e.code !== 'Tab' && e.key !== 'Tab') return;
      if (upgradesHeld) { upgradesHeld = false; setUpgradesVisible(false); }
    });

    ui.btnMute.addEventListener('click', toggleMute);
    ui.btnPause.addEventListener('click', togglePause);
    ui.btnQuit.addEventListener('click', quitToMenu);

    ui.joinCode.addEventListener('input', () => {
      ui.joinCode.value = ui.joinCode.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 4);
    });
    ui.joinCode.addEventListener('keydown', (e) => { if (e.key === 'Enter') tryJoin(); });

    $('#btn-copy').addEventListener('click', () => {
      copyText(roomCode);
      toast('Código copiado: ' + roomCode);
    });
    $('#btn-copy-link').addEventListener('click', () => {
      const url = location.origin + location.pathname + '?sala=' + roomCode;
      copyText(url);
      toast('Enlace copiado.');
    });

    global.addEventListener('beforeunload', () => {
      try {
        if (Net.isHost) Net.broadcast({ t: 'bye' });
        else if (Net.isClient) Net.sendToHost({ t: 'bye' });
      } catch (e) {}
    });

    // nombre del jugador (editable y recordado; dos campos sincronizados)
    playerName = loadSavedName() || 'Jugador ' + (1 + Math.floor(Math.random() * 9));
    playerChar = loadSavedChar();
    const ch0 = CH() && CH().byId(playerChar);
    if (ch0) playerSkin = Entities.normSkin(ch0.skin);
    ui.playerNameInput.value = playerName;
    ui.joinName.value = playerName;
    renderCharPickers();
    renderMetaBar();
    ui.playerNameInput.addEventListener('input', () => {
      playerName = sanitizeName(ui.playerNameInput.value);
      ui.joinName.value = playerName;
    });
    ui.joinName.addEventListener('input', () => {
      playerName = sanitizeName(ui.joinName.value);
      ui.playerNameInput.value = playerName;
    });
    ui.playerNameInput.addEventListener('change', () => saveName(playerName));
    ui.joinName.addEventListener('change', () => saveName(playerName));
  }

  function copyText(txt) {
    if (!txt) return;
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(txt).catch(() => {});
    } else {
      const ta = document.createElement('textarea');
      ta.value = txt;
      document.body.appendChild(ta);
      ta.select();
      try { document.execCommand('copy'); } catch (e) {}
      document.body.removeChild(ta);
    }
  }

  // ---------------------------------------------------------
  // Arranque
  // ---------------------------------------------------------
  function boot() {
    ctx = Render.init(ui.canvas);
    Input.attach();
    bindUI();
    setScene('menu');
    showOverlay(ui.ovMain);

    // enlace directo: ?sala=ABCD
    const params = new URLSearchParams(location.search);
    const sala = (params.get('sala') || '').toUpperCase().slice(0, 4);
    if (sala && /^[A-Z0-9]{4}$/.test(sala)) {
      ui.joinCode.value = sala;
      showOverlay(ui.ovJoin);
      setScene('lobby');
      toast('Pulsa «Conectar» para entrar en la sala ' + sala);
    }

    requestAnimationFrame(frame);
    global.addEventListener('pointerdown', () => Sfx.unlock(), { once: true });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})(typeof window !== 'undefined' ? window : globalThis);
