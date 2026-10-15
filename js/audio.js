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
    if (musicWanted && !musicOn) playMusic(musicWanted);
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

  // ---------------------------------------------------------
  // Música procedural (sin archivos): un pequeño secuenciador
  // ---------------------------------------------------------
  let musicBus = null;
  let drumBus = null;
  let bassBus = null;
  let chordBus = null;
  let leadBus = null;
  let musicTimer = null;
  let musicOn = false;
  let musicTrack = null;
  let musicWanted = null;
  let musicStep = 0;
  let musicTime = 0;

  const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);

  // ---------------------------------------------------------
  // PISTAS: batería + bajo + acordes de potencia + melodía.
  // Un compás de 16 corcheas (len). Los arrays de batería usan 1/0;
  // bass/lead usan semitonos (null = silencio); prog son acordes de
  // potencia (offsets respecto a root).
  // ---------------------------------------------------------
  const MUSIC = {
    menu: {
      bpm: 104, root: 45, gain: 0.9, leadWave: 'triangle', chordEvery: 4,
      kick:   [1, 0, 0, 0, 0, 0, 1, 0, 1, 0, 0, 0, 0, 0, 1, 0],
      snare:  [0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 1],
      hat:    [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
      openhat:[0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1],
      bass:   [0, null, 0, 0, null, 0, 0, null, -2, null, -2, -2, null, -2, -3, null],
      prog:   [[0, 7], [5, 12], [8, 15], [3, 10]],
      lead:   [12, null, 15, null, 19, null, 15, 12, 12, null, 17, null, 15, null, 12, null],
    },
    floor: {
      bpm: 138, root: 40, gain: 1, leadWave: 'square', chordEvery: 4,
      kick:   [1, 0, 0, 0, 0, 0, 1, 0, 1, 0, 0, 0, 1, 0, 1, 0],
      snare:  [0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 1],
      hat:    [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
      openhat:[0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1],
      bass:   [0, 0, 0, 0, -2, -2, -2, -2, -4, -4, -4, -4, -5, -5, -5, -5],
      prog:   [[0, 7], [8, 15], [3, 10], [10, 17]],
      lead:   [12, 15, 19, 15, 12, 15, 19, 22, 10, 13, 17, 13, 8, 12, 15, 12],
    },
    boss: {
      bpm: 176, root: 38, gain: 1.1, leadWave: 'sawtooth', chordEvery: 4,
      kick:   [1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 1, 1, 1],
      snare:  [0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 1, 0],
      hat:    [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
      openhat:[0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
      bass:   [0, 0, 12, 0, 0, 0, 12, 0, -2, -2, 10, -2, -4, -4, 8, -4],
      prog:   [[0, 7], [0, 7], [10, 17], [5, 12]],
      lead:   [24, 27, 31, 27, 24, 27, 31, 34, 22, 25, 29, 25, 20, 24, 27, 24],
    },
  };

  // ---------- Buses, ruido y distorsión ----------
  const noiseCache = {};
  function noiseBuf(kind) {
    if (noiseCache[kind]) return noiseCache[kind];
    const dur = kind === 'snare' ? 0.22 : kind === 'hat' ? 0.12 : 0.35;
    const n = Math.max(1, Math.floor(ctx.sampleRate * dur));
    const buf = ctx.createBuffer(1, n, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
    noiseCache[kind] = buf;
    return buf;
  }

  function makeCurve(amount) {
    const n = 1024, curve = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const x = (i * 2) / n - 1;
      curve[i] = ((3 + amount) * x * 20 * Math.PI / 180) / (Math.PI + amount * Math.abs(x));
    }
    return curve;
  }

  function ensureMusicBus() {
    if (musicBus) return;
    let out = master;
    // limitador suave: la batería suena fuerte sin saturar
    if (typeof ctx.createDynamicsCompressor === 'function') {
      const comp = ctx.createDynamicsCompressor();
      if (comp.threshold) comp.threshold.value = -14;
      if (comp.knee) comp.knee.value = 10;
      if (comp.ratio) comp.ratio.value = 10;
      if (comp.attack) comp.attack.value = 0.003;
      if (comp.release) comp.release.value = 0.15;
      comp.connect(master);
      out = comp;
    }
    musicBus = ctx.createGain();
    musicBus.gain.value = 0.5;
    musicBus.connect(out);

    drumBus = ctx.createGain(); drumBus.gain.value = 1.0; drumBus.connect(musicBus);
    leadBus = ctx.createGain(); leadBus.gain.value = 0.85; leadBus.connect(musicBus);
    bassBus = ctx.createGain(); bassBus.gain.value = 1.0;
    chordBus = ctx.createGain(); chordBus.gain.value = 1.0;

    // Distorsión tipo guitarra para el bajo y los acordes (si existe).
    if (typeof ctx.createWaveShaper === 'function') {
      const shaper = ctx.createWaveShaper();
      shaper.curve = makeCurve(80);
      shaper.oversample = '2x';
      const post = ctx.createBiquadFilter();
      post.type = 'lowpass';
      post.frequency.value = 3400;
      bassBus.connect(shaper);
      chordBus.connect(shaper);
      shaper.connect(post);
      post.connect(musicBus);
    } else {
      bassBus.connect(musicBus);
      chordBus.connect(musicBus);
    }
  }

  // ---------- Instrumentos ----------
  function drumKick(when) {
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = 'sine';
    o.frequency.setValueAtTime(160, when);
    o.frequency.exponentialRampToValueAtTime(44, when + 0.14);
    g.gain.setValueAtTime(0.0001, when);
    g.gain.exponentialRampToValueAtTime(0.95, when + 0.006);
    g.gain.exponentialRampToValueAtTime(0.0001, when + 0.26);
    o.connect(g); g.connect(drumBus);
    o.start(when); o.stop(when + 0.3);
  }

  function drumSnare(when) {
    const src = ctx.createBufferSource();
    src.buffer = noiseBuf('snare');
    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass'; hp.frequency.value = 1300;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, when);
    g.gain.exponentialRampToValueAtTime(0.6, when + 0.005);
    g.gain.exponentialRampToValueAtTime(0.0001, when + 0.19);
    src.connect(hp); hp.connect(g); g.connect(drumBus);
    src.start(when);

    const o = ctx.createOscillator();
    const g2 = ctx.createGain();
    o.type = 'triangle';
    o.frequency.setValueAtTime(200, when);
    o.frequency.exponentialRampToValueAtTime(120, when + 0.1);
    g2.gain.setValueAtTime(0.45, when);
    g2.gain.exponentialRampToValueAtTime(0.0001, when + 0.12);
    o.connect(g2); g2.connect(drumBus);
    o.start(when); o.stop(when + 0.14);
  }

  function drumHat(when, open) {
    const src = ctx.createBufferSource();
    src.buffer = noiseBuf('hat');
    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass'; hp.frequency.value = 7500;
    const g = ctx.createGain();
    const dur = open ? 0.16 : 0.045;
    g.gain.setValueAtTime(0.0001, when);
    g.gain.exponentialRampToValueAtTime(open ? 0.26 : 0.2, when + 0.003);
    g.gain.exponentialRampToValueAtTime(0.0001, when + dur);
    src.connect(hp); hp.connect(g); g.connect(drumBus);
    src.start(when);
  }

  function bassNote(midi, when, dur, vol) {
    const o = ctx.createOscillator();
    o.type = 'sawtooth';
    o.frequency.setValueAtTime(mtof(midi), when);
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.setValueAtTime(1100, when);
    lp.frequency.exponentialRampToValueAtTime(240, when + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, when);
    g.gain.exponentialRampToValueAtTime(Math.max(0.02, vol), when + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, when + Math.max(0.09, dur));
    o.connect(lp); lp.connect(g); g.connect(bassBus);
    o.start(when); o.stop(when + dur + 0.06);
  }

  function chordStab(midis, when, dur, vol) {
    for (let k = 0; k < midis.length; k++) {
      const o = ctx.createOscillator();
      o.type = 'sawtooth';
      const det = (k - (midis.length - 1) / 2) * 8;
      o.frequency.setValueAtTime(mtof(midis[k]) * (1 + det / 1200), when);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, when);
      g.gain.exponentialRampToValueAtTime(Math.max(0.02, vol), when + 0.014);
      g.gain.exponentialRampToValueAtTime(0.0001, when + Math.max(0.1, dur));
      o.connect(g); g.connect(chordBus);
      o.start(when); o.stop(when + dur + 0.06);
    }
  }

  function leadNote(midi, when, dur, wave, vol) {
    const o = ctx.createOscillator();
    o.type = wave || 'square';
    o.frequency.setValueAtTime(mtof(midi), when);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, when);
    g.gain.exponentialRampToValueAtTime(Math.max(0.02, vol), when + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, when + Math.max(0.08, dur));
    o.connect(g); g.connect(leadBus);
    o.start(when); o.stop(when + dur + 0.06);
  }

  function musicScheduleStep(i, when, tr, stepDur) {
    const L = tr.len || 16;
    const idx = i % L;

    if (tr.kick && tr.kick[idx]) drumKick(when);
    if (tr.snare && tr.snare[idx]) drumSnare(when);
    if (tr.hat && tr.hat[idx]) drumHat(when, !!(tr.openhat && tr.openhat[idx]));

    const b = tr.bass ? tr.bass[idx] : null;
    if (b != null) bassNote(tr.root - 12 + b, when, stepDur * 0.9, 0.3 * tr.gain);

    const every = tr.chordEvery || 4;
    if (tr.prog && idx % every === 0) {
      const ch = tr.prog[Math.floor(idx / every) % tr.prog.length];
      chordStab(ch.map((m) => tr.root + m), when, stepDur * every * 0.9, 0.1 * tr.gain);
    }

    const lead = tr.lead ? tr.lead[idx] : null;
    if (lead != null) leadNote(tr.root + 12 + lead, when, stepDur * 0.9, tr.leadWave, 0.08 * tr.gain);
  }

  function musicTick() {
    if (!musicOn || !ready || muted || !musicBus) return;
    const tr = MUSIC[musicTrack];
    if (!tr) return;
    const len = tr.len || 16;
    const stepDur = 30 / tr.bpm; // corchea
    if (musicTime < ctx.currentTime) musicTime = ctx.currentTime + 0.03; // reajustar tras un parón
    let guard = 0;
    while (musicTime < ctx.currentTime + 0.25 && guard++ < 64) {
      musicScheduleStep(musicStep, musicTime, tr, stepDur);
      musicStep = (musicStep + 1) % len;
      musicTime += stepDur;
    }
  }

  // Cambia (o arranca) la pista de música. Ignora si ya está sonando.
  function playMusic(name) {
    if (!MUSIC[name]) return;
    musicWanted = name;
    if (!ready || muted) return;             // se arrancará al desbloquear el audio
    if (musicOn && musicTrack === name) return;
    musicTrack = name;
    ensureMusicBus();
    musicStep = 0;
    musicTime = 0;
    musicOn = true;
    if (!musicTimer) musicTimer = setInterval(musicTick, 40);
    musicTick();
  }

  function stopMusic() {
    musicOn = false;
    musicWanted = null;
    if (musicTimer) { clearInterval(musicTimer); musicTimer = null; }
  }

  function setMuted(v) {
    muted = !!v;
    if (master) master.gain.value = muted ? 0 : 0.32;
    if (muted) {
      musicOn = false;
      if (musicTimer) { clearInterval(musicTimer); musicTimer = null; }
    } else if (musicWanted && ready) {
      const w = musicWanted;
      musicTrack = null;
      playMusic(w);
    }
  }
  function isMuted() { return muted; }

  global.Sfx = {
    init, unlock, play, setMuted, isMuted,
    playMusic, stopMusic,
    get ready() { return ready; },
    get music() { return musicOn ? musicTrack : null; },
  };
})(typeof window !== 'undefined' ? window : globalThis);
