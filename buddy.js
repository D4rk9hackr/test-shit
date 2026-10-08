/* =========================================================================
   AI Icon Buddy — behaviour
   Eye tracking, blinking, moods, booping. No dependencies, no backend.
   Without JS the icon renders static and fully readable; reduced motion
   keeps the eyes working but removes every automatic movement.
   ========================================================================= */

(() => {
  "use strict";

  const doc = document;
  const html = doc.documentElement;
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");

  const face = doc.getElementById("face");
  const track = doc.getElementById("eyes-track");
  const leanEl = doc.getElementById("lean");
  const boopCountEl = doc.getElementById("boopCount");
  const blink = doc.getElementById("eyes-blink");
  const pet = doc.getElementById("pet");
  const pulse = doc.getElementById("pulse");
  const caption = doc.getElementById("caption");
  const watermark = doc.getElementById("watermark");
  const readoutState = doc.getElementById("readoutState");
  const dot = doc.querySelector(".readout__dot");
  const moodButtons = Array.from(doc.querySelectorAll(".moods button"));

  /* what the buddy can say, per mood */
  const LINES = {
    curious:     ["watching the cursor.", "hm?", "what's that?"],
    happy:       ["this is good.", "again.", "staying right here."],
    sleepy:      ["low power mode.", "wake me when it ships.", "…"],
    suspicious:  ["running diagnostics.", "that's a strange click.", "explain."],
    alert:       ["input received.", "all channels open.", "say more."],
    offline:     ["signal lost.", "reconnecting.", "…can anyone hear?"],
  };

  const MAX = 46;      // maximum eye travel, in the icon's 512 user units
  const FOLLOW = 0.13; // how eagerly the eyes chase the cursor

  /* Springs, not lerps. A lerp glides to a stop; a spring arrives with a
     little life in it. The eyes are quick and slightly springy, the face is
     slower — that lag is what makes a flat disc feel like it has depth. */
  const EYE_K = 0.16, EYE_DAMP = 0.72;
  const LEAN_K = 0.05, LEAN_DAMP = 0.8;
  const LEAN_ROT = 0.075;  // degrees of lean per unit of eye travel
  const LEAN_LIFT = 0.09;  // pixels per unit of eye travel
  /* The boop, carried as momentum. Values simulated rather than guessed: a
   ~9% squash that reads in a single frame, ~3% stretch on the rebound, and
   fully at rest by half a second. Below ~0.18 stiffness it rings for 800ms;
   above ~0.24 it feels stiff. */
  const SQUASH_K = 0.2, SQUASH_DAMP = 0.8;
  const SQUASH_IMPULSE = 0.06;
  const ZERO = { x: 0, y: 0 };

  let mood = "curious";
  const aim = { x: 0, y: 0 };  // where the eyes want to be
  const pos = { x: 0, y: 0 };  // where they are
  const vel = { x: 0, y: 0 };
  const lean = { x: 0, y: 0 };
  const leanVel = { x: 0, y: 0 };
  const squash = { x: 0, y: 0 };
  const squashVel = { x: 0, y: 0 };
  let lastT = 0;
  let lastInk = { track: "", lean: "", pet: "" };
  let lastPointer = -Infinity;
  let lastBoop = -Infinity;
  let raf = 0;

  let boops = 0;      // lifetime tally, shown in the readout
  let streak = 0;     // consecutive boops
  let autoMood = false; // true while WE drove the last mood change
  let manualMood = false; // true once a person picks a mood by hand
  let hiddenAt = 0;

  const t = {
    blink: 0, blinkOff: 0, wake: 0,
    dart: 0, dartHold: 0,
    line: 0, boop: 0, fade: 0,
    startled: 0, swap: 0, dot: 0,
    streak: 0, back: 0,
  };

  const rand = (arr) => arr[(Math.random() * arr.length) | 0];
  const poolFor = (m) => LINES[m] || LINES.curious;

  /* ------------------------------------------------- watermark fits the stage
     Every mood word is scaled to fill the same width, so swaps read as one
     banner changing rather than type jumping around.                        */

  const stage = doc.querySelector(".stage");

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

  /* ------------------------------------------------------- pointer tracking */

  function aimFromClient(clientX, clientY) {
    const ctm = face.getScreenCTM();
    if (!ctm) return;
    const p = new DOMPoint(clientX, clientY).matrixTransform(ctm.inverse());
    let x = (p.x - 256) * FOLLOW;
    let y = (p.y - 256) * FOLLOW;
    const len = Math.hypot(x, y);
    if (len > MAX) { x = (x / len) * MAX; y = (y / len) * MAX; }
    aim.x = x;
    aim.y = y;
  }

  function onPointer(e) {
    aimFromClient(e.clientX, e.clientY);
    lastPointer = performance.now();

    // attention: an ignored buddy gets sleepy, and wakes the moment you return
    if (autoMood && mood === "sleepy" && !manualMood) setMood("curious", { auto: true });
  }

  function recentre() {
    aim.x = 0;
    aim.y = 0;
  }

  function stepSpring(p, v, target, k, damp, f) {
    // f is elapsed time expressed in 60fps ticks, so the feel is identical on
    // 60Hz, 120Hz and 144Hz displays instead of running twice as fast there
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

    // only touch the DOM when a value actually moved — this loop runs forever
    const trackTf = "translate(" + pos.x.toFixed(2) + "px, " + pos.y.toFixed(2) + "px)";
    if (trackTf !== lastInk.track) {
      track.style.transform = trackTf;
      lastInk.track = trackTf;
    }

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

  /* ------------------------------------------------------------ idle life */

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
      const idleFor = performance.now() - lastPointer;
      const idle = idleFor > 2400;
      if (idle && !reduced.matches && !doc.hidden) {
        const a = Math.random() * Math.PI * 2;
        const r = 14 + Math.random() * 26;
        aim.x = Math.cos(a) * r;
        aim.y = Math.sin(a) * r;
        clearTimeout(t.dartHold);
        t.dartHold = setTimeout(() => { aim.x = 0; aim.y = 0; }, 620 + Math.random() * 700);
      }

      // left alone long enough and it winds down on its own
      if (idleFor > 45000 && !manualMood && mood !== "sleepy") {
        setMood("sleepy", { auto: true });
        setCaption("wake me when it ships.");
      }

      scheduleDart();
    }, 3200 + Math.random() * 4200);
  }

  function scheduleLines() {
    clearInterval(t.line);
    if (!caption || caption.dataset.autolines === "off") return;
    t.line = setInterval(() => {
      if (doc.hidden || performance.now() - lastBoop < 4500) return;
      const pool = poolFor(mood);
      const i = pool.indexOf(caption.textContent.trim());
      const next = pool[(i + 1 + ((Math.random() * (pool.length - 1)) | 0)) % pool.length];
      setCaption(next);
    }, 6800);
  }

  /* --------------------------------------------------------------- caption */

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

  /* ----------------------------------------------------------------- moods */

  function setMood(next, opts) {
    if (!LINES[next]) return;
    const auto = !!(opts && opts.auto);
    mood = next;
    // a mood chosen by a person (or by the chat) outranks anything we decide
    autoMood = auto;
    if (!auto) manualMood = opts && opts.manual ? true : manualMood;
    face.dataset.mood = next;

    moodButtons.forEach((b) => {
      b.setAttribute("aria-pressed", String(b.dataset.mood === next));
    });

    if (readoutState) readoutState.textContent = next;

    if (watermark && watermark.textContent !== next) {
      watermark.classList.add("is-swapping");
      clearTimeout(t.swap);
      t.swap = setTimeout(() => {
        watermark.textContent = next;
        watermark.classList.remove("is-swapping");
        fitWatermark();
      }, 170);
    }

    if (dot) {
      dot.getAnimations().forEach((a) => a.cancel());
      dot.animate(
        [{ transform: "scale(1)" }, { transform: "scale(2)", offset: 0.4 }, { transform: "scale(1)" }],
        { duration: 320, easing: "cubic-bezier(0.23, 1, 0.32, 1)" }
      );
    }

    setCaption(rand(poolFor(next)));
    scheduleLines();
  }

  /* ------------------------------------------------------------------ boop */

  /* The pulse ring runs on WAAPI: hardware accelerated, and restarting it needs
     no forced reflow. */
  let pulseAnim = null;
  function firePulse() {
    if (reduced.matches || !pulse) return;
    if (pulseAnim) pulseAnim.cancel();
    pulseAnim = pulse.animate(
      [{ transform: "scale(1)", opacity: 0.85 }, { transform: "scale(1.44)", opacity: 0 }],
      { duration: 520, easing: "cubic-bezier(0.23, 1, 0.32, 1)" }
    );
  }

  function boop() {
    lastBoop = performance.now();
    clearTimeout(t.boop);

    boops += 1;
    streak += 1;
    if (boopCountEl) boopCountEl.textContent = String(boops);

    // four in a row and it stops pretending to be neutral. If a person has
    // pinned a mood, it still blushes — but their eyes are left alone.
    if (streak >= 4) {
      face.classList.add("is-pleased");
      if (!manualMood) setMood("happy", { auto: true });
      setCaption("boop.");
    }

    clearTimeout(t.streak);
    t.streak = setTimeout(() => {
      streak = 0;
      face.classList.remove("is-pleased");
      if (autoMood && mood === "happy") setMood("curious", { auto: true });
    }, 6000);

    if (!reduced.matches) {
      // an impulse, not a keyframe: spamming boops builds momentum and each
      // one is picked up from wherever the face already is. Tuned to compress,
      // release and settle in roughly a third of a second — fast enough to feel
      // like a tap, slow enough to actually read as a squash.
      squashVel.x += SQUASH_IMPULSE;
      firePulse();

      face.classList.add("is-startled");
      clearTimeout(t.startled);
      t.startled = setTimeout(() => face.classList.remove("is-startled"), 340);
    }

    setCaption("boop.");
    t.boop = setTimeout(() => {
      setCaption(rand(poolFor(mood)));
    }, 1500);
  }

  /* ------------------------------------------------------------------ boot */

  function boot() {
    html.classList.add("is-ready");
    fitWatermark();
    if (doc.fonts && doc.fonts.ready) doc.fonts.ready.then(fitWatermark);

    let resizeRaf = 0;
    window.addEventListener("resize", () => {
      cancelAnimationFrame(resizeRaf);
      resizeRaf = requestAnimationFrame(fitWatermark);
    });

    // one wake-up blink, once the face has scaled in
    if (!reduced.matches) {
      t.wake = setTimeout(() => {
        blink.classList.add("is-waking");
        setTimeout(() => blink.classList.remove("is-waking"), 150);
      }, 340);
    }

    window.addEventListener("pointermove", onPointer, { passive: true });
    window.addEventListener("pointerdown", onPointer, { passive: true });
    doc.addEventListener("pointerleave", recentre);
    window.addEventListener("blur", recentre);

    pet.addEventListener("click", boop);
    moodButtons.forEach((b) => {
      b.addEventListener("click", () => {
        manualMood = true; // hands off from here on
        setMood(b.dataset.mood, { manual: true });
      });
    });

    raf = requestAnimationFrame(frame);
    scheduleBlink();
    scheduleDart();
    scheduleLines();
  }

  /* a small surface for sibling pages (the chat test) to drive the buddy */
  window.Buddy = {
    setMood,
    setCaption,
    boop,
    look: (x, y) => { aim.x = x; aim.y = y; },
    getMood: () => mood,
  };

  /* pause the automatic life while the tab is hidden — and notice the return */
  doc.addEventListener("visibilitychange", () => {
    if (doc.hidden) {
      hiddenAt = performance.now();
      clearTimeout(t.blink);
      clearTimeout(t.dart);
      clearTimeout(t.dartHold);
      return;
    }

    const away = hiddenAt ? performance.now() - hiddenAt : 0;
    hiddenAt = 0;
    scheduleBlink();
    scheduleDart();

    if (away > 20000 && !manualMood) {
      setMood("alert", { auto: true });
      setCaption("you came back.");
      firePulse();
      clearTimeout(t.back);
      t.back = setTimeout(() => {
        if (autoMood && mood === "alert") setMood("curious", { auto: true });
      }, 2800);
    }
  });

  /* if the preference flips mid-session, stop moving rather than keep going */
  reduced.addEventListener("change", (e) => {
    if (e.matches) {
      clearTimeout(t.blink);
      clearTimeout(t.dart);
      clearTimeout(t.dartHold);
      blink.classList.remove("is-blinking", "is-waking");
      recentre();
      pos.x = aim.x;
      pos.y = aim.y;
    } else {
      scheduleBlink();
      scheduleDart();
    }
  });

  window.addEventListener("pagehide", () => {
    cancelAnimationFrame(raf);
    Object.keys(t).forEach((k) => {
      clearTimeout(t[k]);
      clearInterval(t[k]);
    });
  });

  if (doc.readyState === "loading") doc.addEventListener("DOMContentLoaded", boot);
  else boot();
})();
