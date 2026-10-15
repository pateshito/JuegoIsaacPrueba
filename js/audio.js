/* ============================================================
   audio.js — efectos de sonido procedurales (WebAudio)
   No usa archivos externos: todo se sintetiza.
   ============================================================ */
(function (global) {
  'use strict';

  let ctx = null;
  let master = null;
  let muted = false;
  let ready = false;

  function init() {
    if (ready) return;
    const AC = global.AudioContext || global.webkitAudioContext;
    if (!AC) return;
    try {
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = 0.32;
      master.connect(ctx.destination);
      ready = true;
    } catch (e) { ready = false; }
  }

  // Debe llamarse tras el primer gesto del usuario (política de autoplay)
  function unlock() {
    init();
    if (ctx && ctx.state === 'suspended') ctx.resume();
  }

  function tone(opts) {
    if (!ready || muted) return;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = opts.type || 'square';
    o.frequency.setValueAtTime(opts.f0, ctx.currentTime);
    if (opts.f1 != null) {
      o.frequency.exponentialRampToValueAtTime(Math.max(20, opts.f1), ctx.currentTime + opts.dur);
    }
    const vol = (opts.vol == null ? 0.3 : opts.vol);
    g.gain.setValueAtTime(0.0001, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(vol, ctx.currentTime + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + opts.dur);
    o.connect(g); g.connect(master);
    o.start();
    o.stop(ctx.currentTime + opts.dur + 0.02);
  }

  function noise(dur, vol, filterHz) {
    if (!ready || muted) return;
    const n = Math.floor(ctx.sampleRate * dur);
    const buf = ctx.createBuffer(1, n, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const bp = ctx.createBiquadFilter();
    bp.type = 'lowpass';
    bp.frequency.value = filterHz || 1200;
    const g = ctx.createGain();
    g.gain.value = vol == null ? 0.3 : vol;
    src.connect(bp); bp.connect(g); g.connect(master);
    src.start();
  }

  const SOUNDS = {
    shoot:   () => tone({ type: 'square', f0: 620, f1: 240, dur: 0.09, vol: 0.13 }),
    hit:     () => tone({ type: 'square', f0: 320, f1: 160, dur: 0.06, vol: 0.12 }),
    kill:    () => { tone({ type: 'sawtooth', f0: 260, f1: 70, dur: 0.16, vol: 0.16 }); noise(0.12, 0.16, 900); },
    hurt:    () => { tone({ type: 'sawtooth', f0: 240, f1: 90, dur: 0.22, vol: 0.22 }); noise(0.16, 0.18, 700); },
    pickup:  () => { tone({ type: 'triangle', f0: 780, f1: 1240, dur: 0.13, vol: 0.18 }); },
    heart:   () => { tone({ type: 'sine', f0: 520, f1: 900, dur: 0.2, vol: 0.2 }); },
    coin:    () => { tone({ type: 'triangle', f0: 1000, f1: 1500, dur: 0.09, vol: 0.14 }); },
    door:    () => { tone({ type: 'sine', f0: 300, f1: 150, dur: 0.16, vol: 0.16 }); },
    clear:   () => { [440, 660, 880].forEach((f, i) => setTimeout(() => tone({ type: 'triangle', f0: f, f1: f * 1.02, dur: 0.16, vol: 0.16 }), i * 80)); },
    explode: () => { noise(0.4, 0.34, 500); tone({ type: 'sawtooth', f0: 180, f1: 40, dur: 0.4, vol: 0.22 }); },
    boss:    () => { [110, 82, 110, 146].forEach((f, i) => setTimeout(() => tone({ type: 'sawtooth', f0: f, f1: f * 0.8, dur: 0.35, vol: 0.2 }), i * 170)); },
    win:     () => { [523, 659, 784, 1046].forEach((f, i) => setTimeout(() => tone({ type: 'triangle', f0: f, f1: f, dur: 0.28, vol: 0.2 }), i * 140)); },
    lose:    () => { [330, 262, 196, 131].forEach((f, i) => setTimeout(() => tone({ type: 'sawtooth', f0: f, f1: f * 0.9, dur: 0.35, vol: 0.2 }), i * 190)); },
    join:    () => { tone({ type: 'triangle', f0: 660, f1: 990, dur: 0.14, vol: 0.16 }); },
    ui:      () => { tone({ type: 'square', f0: 420, f1: 520, dur: 0.05, vol: 0.08 }); },
  };

  const last = {};
  function play(name) {
    if (muted) return;
    const fn = SOUNDS[name];
    if (!fn) return;
    // limitador sencillo para no saturar con ráfagas
    const t = Utils.now();
    const min = name === 'shoot' ? 0.045 : name === 'hit' ? 0.03 : 0.02;
    if (last[name] && t - last[name] < min) return;
    last[name] = t;
    try { fn(); } catch (e) { /* silencioso */ }
  }

  function setMuted(v) { muted = !!v; }
  function isMuted() { return muted; }

  global.Sfx = { init, unlock, play, setMuted, isMuted, get ready() { return ready; } };
})(typeof window !== 'undefined' ? window : globalThis);
