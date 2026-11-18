// audio.js — Solmara sound: 100% WebAudio synthesis, no audio files.
// All sounds are generated live with oscillators / filtered noise.
// The AudioContext is created lazily and resumed on the first user
// gesture (browser autoplay rule); everything degrades silently when
// WebAudio is unavailable.

export function createAudio() {
  let ctx = null;
  let master = null;
  let noiseBuf = null;
  let mutedState = false;
  let gestureSeen = false;

  // Engine hum: two detuned sawtooths through a low-pass filter.
  let engineNodes = null; // {osc1, osc2, filter, gain}
  // Police siren: square wave alternating between two tones.
  let sirenNodes = null; // {osc, gain, timer, high}

  function audioAvailable() {
    if (typeof window === "undefined") return false;
    return !!(window.AudioContext || window.webkitAudioContext);
  }

  // Gesture listeners are hooked at creation time (not lazily): the
  // game loop calls engine() every frame, and without this gate the
  // first engine() call would create a *suspended* AudioContext before
  // any user gesture. Instead we wait for a real gesture, then create
  // (or resume) the context right away so a click() fired by that same
  // user event already has audio.
  function hookGesture() {
    if (typeof window === "undefined") return;
    const wake = () => {
      gestureSeen = true;
      if (ctx && ctx.state === "suspended") ctx.resume().catch(() => {});
    };
    window.addEventListener("pointerdown", wake, { passive: true });
    window.addEventListener("keydown", wake);
  }

  hookGesture();

  // Create (or resume) the context. Returns null when unavailable or
  // when no user gesture has happened yet (autoplay rule).
  function ensure() {
    if (!audioAvailable() || !gestureSeen) return null;
    if (!ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      try {
        ctx = new AC();
      } catch (e) {
        ctx = null;
        return null;
      }
      master = ctx.createGain();
      master.gain.value = mutedState ? 0 : 0.5;
      master.connect(ctx.destination);
      // White-noise buffer, shared by the gunshot / impact sounds.
      const len = Math.floor(ctx.sampleRate * 0.5);
      noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
      const data = noiseBuf.getChannelData(0);
      for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    }
    if (ctx.state === "suspended") {
      // resume() returns a promise; a rejection just means "not yet".
      ctx.resume().catch(() => {});
    }
    return ctx;
  }

  function now() {
    return ctx ? ctx.currentTime : 0;
  }

  // Short one-shot oscillator note with an exponential decay envelope.
  function blip(type, freq0, freq1, dur, vol, when = 0) {
    if (!ensure()) return;
    const t = now() + when;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq0, t);
    if (freq1 !== null && freq1 !== freq0) {
      osc.frequency.exponentialRampToValueAtTime(Math.max(1, freq1), t + dur);
    }
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(g);
    g.connect(master);
    osc.start(t);
    osc.stop(t + dur + 0.02);
  }

  // Short burst of filtered white noise with a fast decay.
  function noiseBurst(dur, vol, filterType, filterFreq, when = 0) {
    if (!ensure()) return;
    const t = now() + when;
    const src = ctx.createBufferSource();
    src.buffer = noiseBuf;
    const filter = ctx.createBiquadFilter();
    filter.type = filterType;
    filter.frequency.value = filterFreq;
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(filter);
    filter.connect(g);
    g.connect(master);
    src.start(t);
    src.stop(t + dur + 0.02);
  }

  function startEngine() {
    if (!ensure() || engineNodes) return;
    const osc1 = ctx.createOscillator();
    const osc2 = ctx.createOscillator();
    osc1.type = "sawtooth";
    osc2.type = "sawtooth";
    osc1.frequency.value = 55;
    osc2.frequency.value = 55 * 1.007; // slight detune for warmth
    const filter = ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = 320;
    filter.Q.value = 1.2;
    const gain = ctx.createGain();
    gain.gain.value = 0.0;
    osc1.connect(filter);
    osc2.connect(filter);
    filter.connect(gain);
    gain.connect(master);
    osc1.start();
    osc2.start();
    engineNodes = { osc1, osc2, filter, gain };
  }

  function stopEngine() {
    if (!engineNodes) return;
    const { osc1, osc2, gain } = engineNodes;
    engineNodes = null;
    try {
      gain.gain.setTargetAtTime(0, ctx.currentTime, 0.05);
      osc1.stop(ctx.currentTime + 0.3);
      osc2.stop(ctx.currentTime + 0.3);
    } catch (e) {
      // Context already closed; nothing to stop.
    }
  }

  function startSiren() {
    if (!ensure() || sirenNodes) return;
    const osc = ctx.createOscillator();
    osc.type = "square";
    osc.frequency.value = 720;
    const gain = ctx.createGain();
    gain.gain.value = 0.045;
    osc.connect(gain);
    gain.connect(master);
    osc.start();
    let high = false;
    const timer = setInterval(() => {
      if (!sirenNodes) return;
      high = !high;
      try {
        osc.frequency.setValueAtTime(high ? 960 : 720, ctx.currentTime);
      } catch (e) {
        // Context closed mid-siren; stopSiren() will clean up.
      }
    }, 380);
    sirenNodes = { osc, gain, timer, high };
  }

  function stopSiren() {
    if (!sirenNodes) return;
    const { osc, gain, timer } = sirenNodes;
    sirenNodes = null;
    clearInterval(timer);
    try {
      gain.gain.setTargetAtTime(0, ctx.currentTime, 0.03);
      osc.stop(ctx.currentTime + 0.2);
    } catch (e) {
      // Context already closed; nothing to stop.
    }
  }

  const api = {
    // Continuous engine hum. speed01: 0 (idle) .. 1 (top speed).
    // on=false fades the hum out and stops the oscillators.
    engine(speed01, on) {
      if (!on) {
        stopEngine();
        return;
      }
      startEngine();
      if (!engineNodes || !ctx) return;
      const s = Math.max(0, Math.min(1, speed01 || 0));
      const t = ctx.currentTime;
      const freq = 55 + s * 165; // idle ~55 Hz, top speed ~220 Hz
      engineNodes.osc1.frequency.setTargetAtTime(freq, t, 0.08);
      engineNodes.osc2.frequency.setTargetAtTime(freq * 1.007, t, 0.08);
      engineNodes.filter.frequency.setTargetAtTime(300 + s * 900, t, 0.1);
      engineNodes.gain.gain.setTargetAtTime(0.05 + s * 0.09, t, 0.1);
    },

    // Two-tone police siren. on=false stops it.
    siren(on) {
      if (on) startSiren();
      else stopSiren();
    },

    // Gunshot: sharp noise crack + low thump.
    shot() {
      noiseBurst(0.16, 0.5, "highpass", 900);
      blip("sine", 160, 45, 0.12, 0.35);
    },

    // Punch: low sine thump with a touch of noise.
    punch() {
      blip("sine", 130, 48, 0.14, 0.5);
      noiseBurst(0.07, 0.18, "lowpass", 500);
    },

    // Pickup chime: bright two-note ping (E6 -> A6).
    pickup() {
      blip("sine", 1318, null, 0.14, 0.22);
      blip("sine", 1760, null, 0.22, 0.22, 0.09);
    },

    // Mission-complete sting: C-E-G-C arpeggio, triangle wave.
    sting() {
      const notes = [523.25, 659.25, 783.99, 1046.5];
      notes.forEach((f, i) => blip("triangle", f, null, 0.34, 0.25, i * 0.11));
      blip("triangle", 1318.5, null, 0.5, 0.18, 0.48);
    },

    // UI click: tiny 1.2 kHz square blip.
    click() {
      blip("square", 1200, 900, 0.045, 0.12);
    },

    setMuted(b) {
      mutedState = !!b;
      if (master && ctx) {
        master.gain.setTargetAtTime(mutedState ? 0 : 0.5, ctx.currentTime, 0.02);
      }
    },

    get muted() {
      return mutedState;
    },
  };

  return api;
}
