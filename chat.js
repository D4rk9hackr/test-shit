/* =========================================================================
   AI Icon Buddy — chat test
   A local, canned-reply engine for judging the mascot in conversation.
   No network, no model: every reply below is written by hand on purpose,
   and the page says so.
   ========================================================================= */

(() => {
  "use strict";

  const doc = document;
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");

  const thread = doc.getElementById("thread");
  const empty = doc.getElementById("empty");
  const form = doc.getElementById("composer");
  const input = doc.getElementById("msg");
  const Buddy = window.Buddy || {};

  let thinking = false;

  /* --------------------------------------------------------- reply engine */

  const pick = (arr) => arr[(Math.random() * arr.length) | 0];

  const RULES = [
    {
      re: /^\s*(hi|hello|hey|yo|hola|salam)\b/i,
      mood: "happy", cap: "happy.",
      lines: ["hey. all channels open.", "hi. i was watching the cursor anyway.", "hello. you have my attention."],
    },
    {
      re: /(what can you do|how do you work|features|capabilities)/i,
      mood: "alert", cap: "input received.",
      lines: [
        "i watch your cursor, blink, and change mood when you talk to me. no cloud, no model — two ovals and good intentions.",
        "i can look, squint, go wide, and invert when the signal drops. that's the whole spec.",
      ],
    },
    {
      re: /(cute|love|adorable|pretty|beautiful|good bot|adorable|amazing|awesome)/i,
      mood: "happy", cap: "happy.",
      lines: ["i know. two shapes, zero effort.", "again.", "you're not wrong."],
    },
    {
      re: /(stupid|dumb|ugly|hate|bad bot|shut up|useless)/i,
      mood: "suspicious", cap: "running diagnostics.",
      lines: ["running diagnostics on that take.", "noted. filed under hostile input.", "that's a strange click. explain."],
    },
    {
      re: /(sleep|bored|boring|tired|meh|snore|nap)/i,
      mood: "sleepy", cap: "low power.",
      lines: ["low power mode engaged. wake me when it ships.", "i was resting my ovals.", "…call me when it matters."],
    },
    {
      re: /(joke|funny|laugh)/i,
      mood: "happy", cap: "heh.",
      lines: [
        "what did the ellipse say to the circle? nothing — they don't talk across aspect ratios.",
        "i'd tell you a joke about white space, but there isn't any.",
      ],
    },
    {
      re: /(are you (an )?ai|are you real|human|robot|alive|conscious|who made you|what are you|your name)/i,
      mood: "curious", cap: "curious.",
      lines: ["i'm an svg with opinions — one circle, two ellipses.", "you picked the name. i'm the icon that looks back."],
    },
    {
      re: /(how are you|you ok|feeling)/i,
      mood: "alert", cap: "all channels open.",
      lines: ["all channels open. you?", "curious, tracking, fully rendered."],
    },
    {
      re: /^\s*(bye|goodbye|see ya|later|goodnight)\b/i,
      mood: "sleepy", cap: "signing off.",
      lines: ["signing off. i'll be here — same two shapes.", "see you. i'll keep the cursor warm."],
    },
  ];

  const FALLBACK = {
    mood: "curious", cap: "listening.",
    lines: ["hm.", "go on.", "i only have two shapes, but i'm listening.", "noted. filed under input."],
  };

  function respond(text) {
    if (!/[\p{L}]/u.test(text)) {
      return { mood: "offline", cap: "signal lost.", lines: ["…i don't have hands for that.", "i can blink at it, if that helps."] };
    }
    if (text.length > 140) {
      return { mood: "suspicious", cap: "running diagnostics.",
        lines: ["that's a lot of input for two ovals. give me less.", "short version, please — i only have two shapes."] };
    }
    for (const rule of RULES) {
      if (rule.re.test(text)) return { ...rule, line: pick(rule.lines) };
    }
    if (/\?|^(why|how|what|when|where|who)\b/i.test(text.trim())) {
      return { mood: "alert", cap: "listening.",
        lines: ["say more.", "hm — elaborate. i only see shapes, but i'm listening."] };
    }
    return { ...FALLBACK, line: pick(FALLBACK.lines) };
  }

  /* ---------------------------------------------------------- thread input */

  function scrollThread() {
    thread.scrollTop = thread.scrollHeight;
  }

  function addMsg(who, text) {
    if (empty && empty.parentNode) empty.remove();
    const li = doc.createElement("li");
    li.className = "msg msg--" + who;

    const whoEl = doc.createElement("span");
    whoEl.className = "msg__who";
    whoEl.textContent = who === "user" ? "you" : "buddy";

    const bubble = doc.createElement("span");
    bubble.className = "msg__bubble";
    bubble.textContent = text;

    li.append(whoEl, bubble);
    thread.appendChild(li);
    scrollThread();
  }

  function showTyping() {
    const li = doc.createElement("li");
    li.className = "typing";
    li.id = "typing";
    li.setAttribute("aria-hidden", "true");
    li.innerHTML = '<span class="typing__bubble"><i></i><i></i><i></i></span>';
    thread.appendChild(li);
    scrollThread();
  }

  function hideTyping() {
    const el = doc.getElementById("typing");
    if (el) el.remove();
  }

  /* ------------------------------------------------------------- sending */

  function send(raw) {
    const text = raw.trim();
    if (!text || thinking) return;

    thinking = true;
    addMsg("user", text);
    input.value = "";
    input.focus();

    showTyping();
    if (Buddy.setCaption) Buddy.setCaption("…");
    if (Buddy.look) Buddy.look(0, -42);

    const reply = respond(text);
    const delay = reduced.matches ? 140 : 560 + Math.random() * 640;

    setTimeout(() => {
      hideTyping();
      addMsg("bot", reply.line);
      if (Buddy.setMood) Buddy.setMood(reply.mood);
      if (Buddy.setCaption) Buddy.setCaption(reply.cap);
      if (Buddy.look) Buddy.look(0, 0);
      thinking = false;
    }, delay);
  }

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    send(input.value);
  });

  doc.querySelectorAll(".suggest button").forEach((btn) => {
    btn.addEventListener("click", () => send(btn.textContent));
  });
})();
