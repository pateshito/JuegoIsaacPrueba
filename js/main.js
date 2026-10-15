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
    toast: $('#toast'),
  };

  let ctx = null;
  let scene = 'menu';            // menu | lobby | playing | ended
  let isHosting = false;
  let roomCode = '';
  let playerName = 'Jugador';
  let lobbyPeers = [];           // {id, name, color, isHost}
  let myClientId = null;
  let hostSeed = 0, hostFloor = 1;
  let toastTimer = 0;
  let idleT = 0;
  let endHandled = false;

  // ---------------------------------------------------------
  // Utilidades de interfaz
  // ---------------------------------------------------------
  function show(el) { el.classList.remove('hidden'); }
  function hide(el) { el.classList.add('hidden'); }

  function toast(msg, ms) {
    ui.toast.textContent = msg;
    show(ui.toast);
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => hide(ui.toast), ms || 2600);
  }

  function showOverlay(which) {
    [ui.ovMain, ui.ovHelp, ui.ovLobby, ui.ovJoin, ui.ovPause, ui.ovEnd].forEach(hide);
    if (which) show(which);
  }

  function setScene(s) {
    scene = s;
    if (s === 'playing') { show(ui.topbar); showOverlay(null); }
    else hide(ui.topbar);
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
      ui.tbRoom.textContent = view.mode === 'local' && view.players.length > 1 ? 'Coop local' : 'Un jugador';
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
      dot.style.background = p.color || '#888';
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
    return { id: 'host', name: 'Tú (anfitrión)', color: Entities.COLORS[0], isHost: true };
  }

  // ---------------------------------------------------------
  // Arranques de partida
  // ---------------------------------------------------------
  function playSolo() {
    Sfx.unlock();
    roomCode = '';
    Game.setHandlers({ onEnd: onGameEnd, onPing: null });
    Game.start({
      mode: 'local',
      localPlayers: [{ id: 'p0', name: 'Isaac', color: Entities.COLORS[0], slot: 0, scheme: 'p1' }],
    });
    setScene('playing');
  }

  function playCoop() {
    Sfx.unlock();
    roomCode = '';
    Game.setHandlers({ onEnd: onGameEnd, onPing: null });
    Game.start({
      mode: 'local',
      localPlayers: [
        { id: 'p0', name: 'Isaac', color: Entities.COLORS[0], slot: 0, scheme: 'p1' },
        { id: 'p1', name: 'Magdalena', color: Entities.COLORS[1], slot: 1, scheme: 'p2' },
      ],
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
          color: Entities.COLORS[slot % Entities.COLORS.length],
          isHost: false,
        };
        lobbyPeers.push(entry);

        const running = Game.G.running && scene === 'playing';
        Net.sendTo(peerId, {
          t: 'welcome',
          id: peerId,
          name: entry.name,
          color: entry.color,
          seed: Game.G.seed,
          floor: Game.G.floorNum,
          running,
          players: lobbyPeers.map((p) => ({ id: p.id, name: p.name, color: p.color, isHost: p.isHost })),
        });

        if (running) {
          Game.addRemotePlayer(peerId, entry.name);
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
      players: lobbyPeers.map((p) => ({ id: p.id, name: p.name, color: p.color, isHost: p.isHost })),
    });
  }

  function startHostRun() {
    const remote = lobbyPeers.filter((p) => !p.isHost).map((p) => ({ id: p.id, name: p.name }));
    const seed = Utils.makeSeed();
    hostSeed = seed;
    hostFloor = 1;
    Game.setHandlers({ onEnd: onGameEnd, onPing: null });
    Game.start({
      mode: 'host',
      seed,
      floorNum: 1,
      localPlayers: [{ id: 'host', name: 'Anfitrión', color: Entities.COLORS[0], slot: 0, scheme: 'p1' }],
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
        Net.sendToHost({ t: 'hello', name: playerName });
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
    Game.setHandlers({
      onEnd: onGameEnd,
      onPing: (rtt) => { ui.tbPing.textContent = rtt + ' ms'; },
    });
    Game.start({
      mode: 'client',
      seed: hostSeed,
      floorNum: hostFloor,
      localId: myClientId,
      localPlayers: [{ id: myClientId, name: playerName, color: Entities.COLORS[1], slot: 1, scheme: 'p1' }],
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
    setTimeout(() => { if (scene === 'playing') { showOverlay(ui.ovEnd); } }, 900);
  }

  // ---------------------------------------------------------
  // Salir / reiniciar
  // ---------------------------------------------------------
  function quitToMenu() {
    endHandled = false;
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
  }

  function restart() {
    endHandled = false;
    const mode = Game.G.mode;
    if (mode === 'local') {
      if (Game.G.players.length > 1) playCoop(); else playSolo();
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
    } else {
      acc = 0;
      paintIdle(dt);
    }

    if (Input.consume('Escape')) togglePause();
    Input.endFrame();
  }

  function togglePause() {
    if (scene !== 'playing' || !Game.G.running) return;
    const p = !Game.G.paused;
    Game.setPaused(p);
    if (p) { show(ui.ovPause); } else { hide(ui.ovPause); }
  }

  // ---------------------------------------------------------
  // Eventos de la interfaz
  // ---------------------------------------------------------
  function onAction(action) {
    Sfx.unlock();
    Sfx.play('ui');
    switch (action) {
      case 'solo': playSolo(); break;
      case 'coop': playCoop(); break;
      case 'host': startHosting(); break;
      case 'join':
        ui.joinStatus.textContent = '';
        showOverlay(ui.ovJoin);
        setScene('lobby');
        ui.joinCode.focus();
        break;
      case 'help': showOverlay(ui.ovHelp); break;
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
      const btn = e.target.closest('[data-action]');
      if (btn) onAction(btn.getAttribute('data-action'));
    });

    ui.btnMute.addEventListener('click', () => {
      const m = !Sfx.isMuted();
      Sfx.setMuted(m);
      ui.btnMute.textContent = m ? '🔇' : '🔊';
    });
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

    // nombre aleatorio de jugador
    playerName = 'Jugador ' + (1 + Math.floor(Math.random() * 9));
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
