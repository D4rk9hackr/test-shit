/* =========================================================================
   ZN-01 White Verti — behaviour

   Eye tracking and the head lean run on springs, normalised for frame rate so
   the feel is identical on 60Hz, 120Hz and 144Hz displays. The waveform is
   genuinely audio-reactive when the microphone is enabled, and falls back to
   a synthetic pattern otherwise, so the character is never dead on screen.
   ========================================================================= */

(() => {
  "use strict";

  const doc = document;
  const html = doc.documentElement;
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");

  const face = doc.getElementById("face");
  const track = doc.getElementById("eyesTrack");
  const blink = doc.getElementById("eyesBlink");
  const pet = doc.getElementById("pet");
  const pulse = doc.getElementById("pulse");
  const caption = doc.getElementById("caption");
  const watermark = doc.getElementById("watermark");
  const readoutState = doc.getElementById("readoutState");
  const dot = doc.querySelector(".readout__dot");
  const barsGroup = doc.getElementById("waveBars");
  const micBtn = doc.getElementById("micBtn");
  const speakBtn = doc.getElementById("speakBtn");
  const compose = doc.getElementById("compose");
  const sayInput = doc.getElementById("say");
  const hint = doc.getElementById("hint");
  const stage = doc.querySelector(".stage");
  const stateButtons = Array.from(doc.querySelectorAll(".state"));

  /* ------------------------------------------------------------ copy */

  const LINES = {
    idle:      ["standing by.", "no input. all eyes on you.", "quiet channel open."],
    listening: ["i hear you.", "go on.", "listening."],
    thinking:  ["working on it.", "hm.", "one moment."],
    speaking:  ["signal out.", "transmitting.", "you heard that."],
  };

  /* ------------------------------------------------------ spring physics */

  const MAX = 44;
  const FOLLOW = 0.13;
  const EYE_K = 0.16, EYE_DAMP = 0.72;
  const LEAN_K = 0.05, LEAN_DAMP = 0.8;
  const LEAN_ROT = 0.07;
  const LEAN_LIFT = 0.08;
  const SQUASH_K = 0.2, SQUASH_DAMP = 0.8;
  const SQUASH_IMPULSE = 0.06;
  const ZERO = { x: 0, y: 0 };

  const aim = { x: 0, y: 0 };
  const pos = { x: 0, y: 0 };
  const vel = { x: 0, y: 0 };
  const lean = { x: 0, y: 0 };
  const leanVel = { x: 0, y: 0 };
  const squash = { x: 0, y: 0 };
  const squashVel = { x: 0, y: 0 };

  let lastT = 0;
  let raf = 0;
  const lastInk = { track: "", lean: "", pet: "" };

  const state = { name: "idle", manual: false, auto: false };
  let pulses = 0;
  const pulseCountEl = doc.getElementById("pulseCount");

  const t = {
    blink: 0, blinkOff: 0, wake: 0, dart: 0, dartHold: 0,
    line: 0, fade: 0, swap: 0, back: 0, speak: 0, think: 0,
  };

  const rand = (arr) => arr[(Math.random() * arr.length) | 0];
  const poolFor = (s) => LINES[s] || LINES.idle;

  function stepSpring(p, v, target, k, damp, f) {
    const kk = 1 - Math.pow(1 - k, f);
    const dd = Math.pow(damp, f);
    v.x = (v.x + (target.x - p.x) * kk) * dd;
    v.y = (v.y + (target.y - p.y) * kk) * dd;
    p.x += v.x;
    p.y += v.y;
  }

  function frame(now) {
    const clock = typeof now === "number" ? now : performance.now();
    const dt = lastT ? Math.min(64, clock - lastT) : 16.67;
    lastT = clock;
    const f = dt / 16.67;

    if (reduced.matches) {
      pos.x = aim.x; pos.y = aim.y;
      lean.x = aim.x; lean.y = aim.y;
      squash.x = 0;
    } else {
      stepSpring(pos, vel, aim, EYE_K, EYE_DAMP, f);
      stepSpring(lean, leanVel, aim, LEAN_K, LEAN_DAMP, f);
      stepSpring(squash, squashVel, ZERO, SQUASH_K, SQUASH_DAMP, f);
    }

    if (Math.abs(aim.x - pos.x) < 0.05) pos.x = aim.x;
    if (Math.abs(aim.y - pos.y) < 0.05) pos.y = aim.y;

    const trackTf = "translate(" + pos.x.toFixed(2) + "px, " + pos.y.toFixed(2) + "px)";
    if (trackTf !== lastInk.track) {
      track.style.transform = trackTf;
      lastInk.track = trackTf;
    }

    const leanEl = doc.getElementById("lean");
    if (leanEl) {
      const leanTf =
        "rotate(" + (lean.x * LEAN_ROT).toFixed(2) + "deg) translateY(" + (lean.y * LEAN_LIFT).toFixed(2) + "px)";
      if (leanTf !== lastInk.lean) {
        leanEl.style.transform = leanTf;
        lastInk.lean = leanTf;
      }
    }

    const s = squash.x;
    const petTf = Math.abs(s) > 0.004
      ? "scale(" + (1 + s).toFixed(3) + ", " + (1 - s * 0.85).toFixed(3) + ")"
      : "";
    if (petTf !== lastInk.pet) {
      pet.style.transform = petTf;
      lastInk.pet = petTf;
    }

    raf = requestAnimationFrame(frame);
  }

  /* --------------------------------------------------------- pointer aim */

  function aimFromClient(clientX, clientY) {
    const ctm = face.getScreenCTM();
    if (!ctm) return;
    const p = new DOMPoint(clientX, clientY).matrixTransform(ctm.inverse());
    // the face is r=180 here, so travel is clamped to that geometry
    let x = (p.x - 256) * FOLLOW * 1.28;
    let y = (p.y - 256) * FOLLOW * 1.28;
    const len = Math.hypot(x, y);
    if (len > MAX) { x = (x / len) * MAX; y = (y / len) * MAX; }
    aim.x = x;
    aim.y = y;
  }

  function onPointer(e) {
    aimFromClient(e.clientX, e.clientY);
  }

  /* -------------------------------------------------------------- audio */

  const BARS = 40;
  const bars = [];
  const levels = new Float32Array(BARS);
  let audioCtx = null;
  let analyser = null;
  let freqData = null;
  let micStream = null;
  let micOn = false;

  for (let i = 0; i < BARS; i++) {
    const rect = doc.createElementNS("http://www.w3.org/2000/svg", "rect");
    rect.setAttribute("x", (176 + i * 4).toFixed(2));
    rect.setAttribute("width", "2");
    rect.setAttribute("rx", "1");
    rect.setAttribute("y", "321");
    rect.setAttribute("height", "2");
    barsGroup.appendChild(rect);
    bars.push(rect);
  }

  /* Synthetic voice: three detuned sines plus a little noise. Deterministic
     enough to look like speech rhythm, never a random flicker. */
  function synthetic(tSec) {
    const a = Math.abs(Math.sin(tSec * 3.1) * 0.55 + Math.sin(tSec * 7.7 + 1.2) * 0.28
      + Math.sin(tSec * 13.3 + 0.4) * 0.14);
    const envelope = 0.35 + 0.65 * Math.abs(Math.sin(tSec * 0.7));
    return a * envelope;
  }

  function sampleMic() {
    if (!analyser || !freqData) return null;
    analyser.getByteFrequencyData(freqData);
    // speech energy lives in the lower bins; sample a band per bar
    const out = new Float32Array(BARS);
    const usable = Math.floor(freqData.length * 0.55);
    for (let i = 0; i < BARS; i++) {
      const from = Math.floor((i / BARS) * usable);
      const to = Math.max(from + 1, Math.floor(((i + 1) / BARS) * usable));
      let sum = 0;
      for (let j = from; j < to; j++) sum += freqData[j];
      out[i] = (sum / (to - from)) / 255;
    }
    return out;
  }

  function drawWave() {
    const tSec = performance.now() / 1000;
    const mic = micOn ? sampleMic() : null;

    for (let i = 0; i < BARS; i++) {
      let target;

      if (mic) {
        target = Math.pow(mic[i], 1.35);
      } else if (state.name === "thinking") {
        // a slow scan line rather than speech
        const d = Math.abs(i - (Math.sin(tSec * 0.9) * 0.5 + 0.5) * (BARS - 1));
        target = Math.max(0, 1 - d / 5) * 0.42;
      } else if (state.name === "speaking") {
        target = synthetic(tSec + i * 0.06) * 0.95;
      } else if (state.name === "listening") {
        target = synthetic(tSec * 1.35 + i * 0.09) * 0.5;
      } else {
        target = synthetic(tSec * 0.5 + i * 0.05) * 0.2;
      }

      // asymmetric smoothing: snap up, fall slowly, so it reads as audio
      const prev = levels[i];
      levels[i] = target > prev ? prev + (target - prev) * 0.55 : prev + (target - prev) * 0.14;

      const h = Math.max(2, levels[i] * 44);
      bars[i].setAttribute("y", (322 - h / 2).toFixed(2));
      bars[i].setAttribute("height", h.toFixed(2));
    }

    raf2 = requestAnimationFrame(drawWave);
  }

  let raf2 = 0;

  async function enableMic() {
    if (micOn) return;
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      hint.textContent = "this browser has no microphone api — running the synthetic pattern";
      return;
    }
    try {
      hint.textContent = "asking for the microphone…";
      micStream = await navigator.mediaDevices.getUserMedia({ audio: true });
      audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      const src = audioCtx.createMediaStreamSource(micStream);
      analyser = audioCtx.createAnalyser();
      analyser.fftSize = 256;
      analyser.smoothingTimeConstant = 0.75;
      src.connect(analyser);
      freqData = new Uint8Array(analyser.frequencyBinCount);
      micOn = true;
      micBtn.setAttribute("aria-pressed", "true");
      micBtn.textContent = "microphone on";
      hint.textContent = "the waveform is riding your voice";
      setState("listening", { auto: true });
    } catch (err) {
      micOn = false;
      hint.textContent = "no microphone — running the synthetic pattern instead";
    }
  }

  function disableMic() {
    if (micStream) micStream.getTracks().forEach((tr) => tr.stop());
    if (audioCtx && audioCtx.close) audioCtx.close();
    micStream = null; audioCtx = null; analyser = null; freqData = null;
    micOn = false;
    micBtn.setAttribute("aria-pressed", "false");
    micBtn.textContent = "use microphone";
    hint.textContent = "the waveform rides your microphone, or a synthetic pattern";
    setState("idle", { auto: true });
  }

  /* ------------------------------------------------------------- state */

  function setState(next, opts) {
    if (!LINES[next]) return;
    const auto = !!(opts && opts.auto);
    state.name = next;
    state.auto = auto;
    if (!auto && opts && opts.manual) state.manual = true;
    face.dataset.state = next;

    stateButtons.forEach((b) => {
      b.setAttribute("aria-pressed", String(b.dataset.state === next));
    });

    if (readoutState) readoutState.textContent = next;

    if (watermark && watermark.textContent !== next) {
      watermark.classList.add("is-swapping");
      clearTimeout(t.swap);
      t.swap = setTimeout(() => {
        watermark.textContent = next;
        watermark.classList.remove("is-swapping");
      }, 170);
    }

    if (dot && dot.getAnimations) {
      dot.getAnimations().forEach((a) => a.cancel());
      dot.animate(
        [{ transform: "scale(1)" }, { transform: "scale(2)", offset: 0.4 }, { transform: "scale(1)" }],
        { duration: 320, easing: "cubic-bezier(0.23, 1, 0.32, 1)" }
      );
    }

    setCaption(rand(poolFor(next)));
    scheduleLines();
  }

  /* ----------------------------------------------------------- caption */

  function setCaption(text) {
    if (!caption || caption.textContent === text) return;
    if (reduced.matches) { caption.textContent = text; return; }
    caption.classList.add("is-fading");
    clearTimeout(t.fade);
    t.fade = setTimeout(() => {
      caption.textContent = text;
      caption.classList.remove("is-fading");
    }, 170);
  }

  function scheduleLines() {
    clearInterval(t.line);
    t.line = setInterval(() => {
      if (doc.hidden) return;
      const pool = poolFor(state.name);
      const i = pool.indexOf(caption.textContent.trim());
      const next = pool[(i + 1 + ((Math.random() * (pool.length - 1)) | 0)) % pool.length];
      setCaption(next);
    }, 7000);
  }

  /* ------------------------------------------------------------- speech */

  let pulseAnim = null;
  function firePulse() {
    if (reduced.matches || !pulse) return;
    if (pulseAnim) pulseAnim.cancel();
    pulseAnim = pulse.animate(
      [{ transform: "scale(1)", opacity: .8 }, { transform: "scale(1.4)", opacity: 0 }],
      { duration: 520, easing: "cubic-bezier(0.23, 1, 0.32, 1)" }
    );
  }

  function speak() {
    pulses += 1;
    if (pulseCountEl) pulseCountEl.textContent = String(pulses);

    if (!reduced.matches) {
      squashVel.x += SQUASH_IMPULSE;
      firePulse();
    }

    clearTimeout(t.think);
    setState("speaking", { auto: true });
    setCaption("signal out.");

    clearTimeout(t.speak);
    t.speak = setTimeout(() => {
      if (micOn) return;               // stay in listening if the mic is live
      setState("idle", { auto: true });
    }, 2600);
  }

  /* typing anything makes it consider the problem before answering */
  function considerThenAnswer(text) {
    clearTimeout(t.speak);
    setState("thinking", { auto: true });
    setCaption(text ? "working on it." : "working on it.");

    clearTimeout(t.think);
    t.think = setTimeout(() => {
      speak();
    }, 900 + Math.random() * 700);
  }

  /* ------------------------------------------------------- idle life */

  function scheduleBlink() {
    clearTimeout(t.blink);
    t.blink = setTimeout(() => {
      const awake = !reduced.matches && !doc.hidden && html.classList.contains("is-ready");
      if (awake) {
        blink.classList.add("is-blinking");
        clearTimeout(t.blinkOff);
        t.blinkOff = setTimeout(() => blink.classList.remove("is-blinking"), 140);
      }
      scheduleBlink();
    }, 1800 + Math.random() * 4200);
  }

  function scheduleDart() {
    clearTimeout(t.dart);
    t.dart = setTimeout(() => {
      if (!reduced.matches && !doc.hidden) {
        const a = Math.random() * Math.PI * 2;
        const r = 12 + Math.random() * 24;
        aim.x = Math.cos(a) * r;
        aim.y = Math.sin(a) * r;
        clearTimeout(t.dartHold);
        t.dartHold = setTimeout(() => { aim.x = 0; aim.y = 0; }, 620 + Math.random() * 700);
      }
      scheduleDart();
    }, 3200 + Math.random() * 4200);
  }

  /* ------------------------------------------------------- watermark fit */

  function fitWatermark() {
    if (!stage || !watermark) return;
    watermark.style.fontSize = "";
    const avail = stage.clientWidth * 0.88;
    const w = watermark.scrollWidth;
    if (!avail || !w) return;
    const current = parseFloat(getComputedStyle(watermark).fontSize);
    const size = Math.max(40, Math.min(240, current * (avail / w)));
    watermark.style.fontSize = size + "px";
  }

  /* ---------------------------------------------------------------- boot */

  function boot() {
    html.classList.add("is-ready");
    fitWatermark();
    if (doc.fonts && doc.fonts.ready) doc.fonts.ready.then(fitWatermark);

    let resizeRaf = 0;
    window.addEventListener("resize", () => {
      cancelAnimationFrame(resizeRaf);
      resizeRaf = requestAnimationFrame(fitWatermark);
    });

    if (!reduced.matches) {
      t.wake = setTimeout(() => {
        blink.classList.add("is-waking");
        setTimeout(() => blink.classList.remove("is-waking"), 150);
      }, 320);
    }

    window.addEventListener("pointermove", onPointer, { passive: true });
    window.addEventListener("pointerdown", onPointer, { passive: true });
    doc.addEventListener("pointerleave", () => { aim.x = 0; aim.y = 0; });
    window.addEventListener("blur", () => { aim.x = 0; aim.y = 0; });

    pet.addEventListener("click", speak);

    stateButtons.forEach((b) => {
      b.addEventListener("click", () => {
        clearTimeout(t.think);
        clearTimeout(t.speak);
        const next = b.dataset.state;
        setState(next, { manual: true });
        if (next === "speaking") {
          pulses += 1;
          if (pulseCountEl) pulseCountEl.textContent = String(pulses);
        }
      });
    });

    micBtn.addEventListener("click", () => (micOn ? disableMic() : enableMic()));
    speakBtn.addEventListener("click", speak);

    compose.addEventListener("submit", (e) => {
      e.preventDefault();
      const text = sayInput.value.trim();
      sayInput.value = "";
      sayInput.focus();
      considerThenAnswer(text);
    });

    raf = requestAnimationFrame(frame);
    raf2 = requestAnimationFrame(drawWave);
    scheduleBlink();
    scheduleDart();
    scheduleLines();
  }

  doc.addEventListener("visibilitychange", () => {
    if (doc.hidden) {
      clearTimeout(t.blink);
      clearTimeout(t.dart);
      clearTimeout(t.dartHold);
    } else {
      scheduleBlink();
      scheduleDart();
    }
  });

  reduced.addEventListener("change", (e) => {
    if (e.matches) {
      clearTimeout(t.blink);
      clearTimeout(t.dart);
      clearTimeout(t.dartHold);
      blink.classList.remove("is-blinking", "is-waking");
      aim.x = 0; aim.y = 0;
      pos.x = aim.x; pos.y = aim.y;
    } else {
      scheduleBlink();
      scheduleDart();
    }
  });

  window.addEventListener("pagehide", () => {
    cancelAnimationFrame(raf);
    cancelAnimationFrame(raf2);
    Object.keys(t).forEach((k) => { clearTimeout(t[k]); clearInterval(t[k]); });
    if (micStream) micStream.getTracks().forEach((tr) => tr.stop());
    if (audioCtx && audioCtx.close) audioCtx.close();
  });

  if (doc.readyState === "loading") doc.addEventListener("DOMContentLoaded", boot);
  else boot();
})();