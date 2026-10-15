/* ============================================================
   net.js — multijugador P2P con WebRTC (PeerJS)
   El anfitrión es autoritativo: simula y difunde el estado.
   Expone el global `Net`.
   ============================================================ */
(function (global) {
  'use strict';

  const PREFIX = 'llantoisaac-v1-';

  const PEER_OPTS = {
    debug: 0,
    config: {
      iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' },
        { urls: 'stun:global.stun.twilio.com:3478' },
      ],
    },
  };

  let peer = null;
  let role = null;                 // 'host' | 'client'
  const conns = new Map();         // host: peerId -> DataConnection
  let hostConn = null;             // client: DataConnection con el anfitrión
  let handlers = {};
  let closedByUs = false;

  const available = () => typeof global.Peer === 'function';

  function cleanup() {
    closedByUs = true;
    for (const c of conns.values()) { try { c.close(); } catch (e) {} }
    conns.clear();
    if (hostConn) { try { hostConn.close(); } catch (e) {} hostConn = null; }
    if (peer) { try { peer.destroy(); } catch (e) {} peer = null; }
    role = null;
    handlers = {};
  }

  function disconnect() {
    cleanup();
    closedByUs = false;
  }

  // ---------------------------------------------------------
  // ANFITRIÓN
  // ---------------------------------------------------------
  function host(code, h) {
    if (!available()) { h.onError && h.onError('no-peerjs'); return; }
    cleanup();
    closedByUs = false;
    role = 'host';
    handlers = h || {};
    conns.clear();

    let attempt = 0;
    const tryCreate = (roomCode) => {
      peer = new global.Peer(PREFIX + roomCode, PEER_OPTS);

      peer.on('open', (id) => {
        handlers.onOpen && handlers.onOpen(roomCode);
      });

      peer.on('connection', (conn) => {
        conn.on('open', () => {
          if (conns.size >= Utils.C.MAX_PLAYERS) {
            try { conn.send({ t: 'full' }); } catch (e) {}
            setTimeout(() => { try { conn.close(); } catch (e) {} }, 120);
            return;
          }
          conns.set(conn.peer, conn);
          handlers.onPeerJoin && handlers.onPeerJoin(conn.peer);
        });
        conn.on('data', (d) => handlers.onData && handlers.onData(conn.peer, d));
        conn.on('close', () => {
          conns.delete(conn.peer);
          handlers.onPeerLeave && handlers.onPeerLeave(conn.peer);
        });
        conn.on('error', () => {
          conns.delete(conn.peer);
          handlers.onPeerLeave && handlers.onPeerLeave(conn.peer);
        });
      });

      peer.on('disconnected', () => {
        if (!closedByUs) { try { peer.reconnect(); } catch (e) {} }
      });

      peer.on('error', (err) => {
        const type = err && err.type;
        if (type === 'unavailable-id' && attempt < 6) {
          attempt++;
          try { peer.destroy(); } catch (e) {}
          const nc = Utils.makeRoomCode(4);
          handlers.onRetry && handlers.onRetry(nc);
          setTimeout(() => tryCreate(nc), 300);
          return;
        }
        handlers.onError && handlers.onError(type || 'error', err);
      });
    };

    tryCreate(code);
  }

  // ---------------------------------------------------------
  // CLIENTE
  // ---------------------------------------------------------
  function join(code, h) {
    if (!available()) { h.onError && h.onError('no-peerjs'); return; }
    cleanup();
    closedByUs = false;
    role = 'client';
    handlers = h || {};

    let settled = false;
    const timeout = setTimeout(() => {
      if (!settled) {
        settled = true;
        handlers.onError && handlers.onError('timeout');
        disconnect();
      }
    }, 14000);

    peer = new global.Peer(null, PEER_OPTS);

    peer.on('open', () => {
      hostConn = peer.connect(PREFIX + code, {
        reliable: true,
        serialization: 'json',
        metadata: { v: 1 },
      });

      hostConn.on('open', () => {
        if (settled) return;
        settled = true;
        clearTimeout(timeout);
        handlers.onOpen && handlers.onOpen();
      });

      hostConn.on('data', (d) => handlers.onData && handlers.onData(d));

      hostConn.on('close', () => {
        clearTimeout(timeout);
        if (!closedByUs) handlers.onClose && handlers.onClose();
      });

      hostConn.on('error', () => {
        clearTimeout(timeout);
        if (!settled) { settled = true; handlers.onError && handlers.onError('connection'); }
      });
    });

    peer.on('error', (err) => {
      const type = err && err.type;
      clearTimeout(timeout);
      if (settled && type !== 'peer-unavailable') return;
      settled = true;
      handlers.onError && handlers.onError(type || 'error', err);
    });

    peer.on('disconnected', () => {
      if (!closedByUs && role === 'client') { try { peer.reconnect(); } catch (e) {} }
    });
  }

  // ---------------------------------------------------------
  // ENVÍO
  // ---------------------------------------------------------
  function sendTo(peerId, msg) {
    const c = conns.get(peerId);
    if (c && c.open) { try { c.send(msg); return true; } catch (e) { return false; } }
    return false;
  }

  function broadcast(msg) {
    for (const c of conns.values()) {
      if (c.open) { try { c.send(msg); } catch (e) {} }
    }
  }

  function sendToHost(msg) {
    if (hostConn && hostConn.open) { try { hostConn.send(msg); return true; } catch (e) {} }
    return false;
  }

  const peers = () => Array.from(conns.keys());
  const peerCount = () => conns.size;

  global.Net = {
    available, host, join, disconnect,
    sendTo, broadcast, sendToHost, peers, peerCount,
    get role() { return role; },
    get isHost() { return role === 'host'; },
    get isClient() { return role === 'client'; },
    PREFIX,
  };
})(typeof window !== 'undefined' ? window : globalThis);
