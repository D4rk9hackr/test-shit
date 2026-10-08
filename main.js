/* =========================================================================
   Motion + interaction
   Stack: GSAP + ScrollTrigger · Lenis as the sole smooth-scroll engine
   Everything degrades to fully readable static content when JS, GSAP, or
   motion preferences say no.
   ========================================================================= */

(() => {
  "use strict";

  const doc = document;
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
  const hasGSAP = typeof window.gsap !== "undefined";
  const hasST = typeof window.ScrollTrigger !== "undefined";
  const hasLenis = typeof window.Lenis !== "undefined";

  const cleanups = [];

  /* ------------------------------------------------------------- navigation */

  function initNav() {
    const toggle = doc.querySelector(".nav-toggle");
    const nav = doc.querySelector("#site-nav");
    if (!toggle || !nav) return;

    const setOpen = (open) => {
      nav.classList.toggle("is-open", open);
      toggle.setAttribute("aria-expanded", String(open));
    };

    toggle.addEventListener("click", () => {
      setOpen(toggle.getAttribute("aria-expanded") !== "true");
    });

    // Escape closes and returns focus to the control that opened it
    nav.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && nav.classList.contains("is-open")) {
        setOpen(false);
        toggle.focus();
      }
    });

    // Close after choosing a destination
    nav.addEventListener("click", (e) => {
      if (e.target.closest("a")) setOpen(false);
    });

    // Close when clicking away or on resize to desktop
    doc.addEventListener("click", (e) => {
      if (!nav.classList.contains("is-open")) return;
      if (!nav.contains(e.target) && !toggle.contains(e.target)) setOpen(false);
    });

    window.addEventListener("resize", () => {
      if (window.innerWidth > 760) setOpen(false);
    });
  }

  /* ------------------------------------------- current-section indication */

  function initSectionSpy() {
    const links = [...doc.querySelectorAll('.site-nav a[href^="#"]')];
    const sections = links
      .map((a) => doc.querySelector(a.getAttribute("href")))
      .filter(Boolean);
    if (!sections.length) return;

    const mark = (id) => {
      links.forEach((a) => {
        const on = a.getAttribute("href") === "#" + id;
        if (on) a.setAttribute("aria-current", "true");
        else a.removeAttribute("aria-current");
      });
    };

    const spy = new IntersectionObserver(
      (entries) => {
        entries.forEach((en) => en.isIntersecting && mark(en.target.id));
      },
      { rootMargin: "-45% 0px -50% 0px", threshold: 0 }
    );

    sections.forEach((s) => spy.observe(s));
    cleanups.push(() => spy.disconnect());
  }

  /* ----------------------------------------- semantic disclosure behaviour
     <details> already gives us state and keyboard operation for free; we only
     add Escape-to-close with focus returned to the summary.                  */

  function initDisclosures() {
    doc.querySelectorAll(".service").forEach((d) => {
      const summary = d.querySelector("summary");
      if (!summary) return;
      summary.addEventListener("keydown", (e) => {
        if (e.key === "Escape" && d.open) {
          d.open = false;
          summary.focus();
        }
      });
    });
  }

  /* ------------------------------------------------------------- smooth scroll
     Lenis is the only smooth-scroll engine on this page.                      */

  function initSmoothScroll() {
    if (reduced.matches || !hasLenis || !hasST) return null;

    const lenis = new window.Lenis({
      duration: 1.05,
      easing: (t) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
      smoothWheel: true,
      touchMultiplier: 1.6,
    });

    lenis.on("scroll", window.ScrollTrigger.update);

    const raf = (time) => lenis.raf(time * 1000);
    window.gsap.ticker.add(raf);
    window.gsap.ticker.lagSmoothing(0);

    // In-page anchors must go through Lenis, not the native jump
    const anchorClick = (e) => {
      const a = e.target.closest('a[href^="#"]');
      if (!a) return;
      const target = doc.querySelector(a.getAttribute("href"));
      if (!target) return;
      e.preventDefault();
      lenis.scrollTo(target, { offset: -70 });
      history.replaceState(null, "", a.getAttribute("href"));
    };
    doc.addEventListener("click", anchorClick);

    const teardown = () => {
      doc.removeEventListener("click", anchorClick);
      window.gsap.ticker.remove(raf);
      lenis.destroy();
    };
    cleanups.push(teardown);
    return lenis;
  }

  /* --------------------------------------------------------- split for stagger
     Wraps words in spans so headings can stagger line-by-line. The accessible
     name is preserved: we set aria-label on the heading (the full sentence) and
     mark the decorative word spans aria-hidden. Without JS the heading keeps its
     original plain text, so the name is never lost.                            */

  function splitWords(el) {
    const text = el.textContent.trim().replace(/\s+/g, " ");
    el.setAttribute("aria-label", text);

    const frag = doc.createDocumentFragment();
    text.split(" ").forEach((word, i, all) => {
      const mask = doc.createElement("span");
      mask.className = "split-word";
      mask.setAttribute("aria-hidden", "true");
      mask.textContent = word;
      frag.appendChild(mask);
      if (i < all.length - 1) frag.appendChild(doc.createTextNode(" "));
    });

    el.textContent = "";
    el.appendChild(frag);
    return [...el.querySelectorAll(".split-word")];
  }

  /* ------------------------------------------------------------- animation */

  function initMotion() {
    if (reduced.matches || !hasGSAP || !hasST) return;

    const gsap = window.gsap;
    gsap.registerPlugin(window.ScrollTrigger);
    const ST = window.ScrollTrigger;

    const EASE = "power3.out";
    const ENTER = 0.68;   // 680ms section entrances — inside 500–760ms
    const CTRL = 0.2;     // 200ms control feedback

    /* Hero intro — nav, identity, message and CTA all readable before and
       during the sequence; nothing is left hidden if it never completes. */
    const intro = gsap.timeline({ defaults: { ease: EASE } });

    /* Explicit fromTo everywhere: a `from()` infers its end value from the
       element's current state at render time, which is wrong if another tween
       has already zeroed it. Declared end states cannot be captured as 0. */
    intro
      .fromTo(".site-header", { y: -14, opacity: 0 }, { y: 0, opacity: 1, duration: CTRL })
      .fromTo(".hero__meta li",
        { y: 12, opacity: 0 },
        { y: 0, opacity: 1, duration: 0.5, stagger: 0.055 }, 0.1)
      .fromTo(".hero .eyebrow",
        { y: 12, opacity: 0 },
        { y: 0, opacity: 1, duration: 0.5 }, 0.2);

    const heroTitle = doc.querySelector(".hero__title");
    if (heroTitle) {
      const words = splitWords(heroTitle);
      intro.fromTo(words,
        { yPercent: 110 },
        { yPercent: 0, duration: 0.82, stagger: 0.05 }, 0.24);
    }

    intro.fromTo(".hero__lede",
      { y: 16, opacity: 0 },
      { y: 0, opacity: 1, duration: 0.6 }, 0.55);
    intro.fromTo(".hero__scrim", { opacity: 0 }, { opacity: 1, duration: 0.9 }, 0);

    // Parallax kept under 5% — the hero stays stable enough to study
    gsap.to(".hero__media img", {
      yPercent: 4,
      ease: "none",
      scrollTrigger: { trigger: ".hero", start: "top top", end: "bottom top", scrub: true },
    });

    /* Section entrances: headings reveal word by word, supporting copy and
       media follow with a restrained stagger. */
    doc.querySelectorAll("[data-split]").forEach((el) => {
      if (el === heroTitle) return;
      const words = splitWords(el);
      gsap.set(words, { yPercent: 105 });
      gsap.to(words, {
        yPercent: 0,
        duration: ENTER,
        ease: EASE,
        stagger: 0.055,
        scrollTrigger: { trigger: el, start: "top 86%", once: true },
      });
    });

    doc.querySelectorAll("[data-anim]").forEach((el) => {
      // The intro timeline already owns everything inside the hero; binding a
      // second tween to the same property makes each one record the other's
      // zeroed state as its end value, leaving the element stuck invisible.
      if (el.closest(".hero")) return;
      gsap.fromTo(el,
        { y: 22, opacity: 0 },
        {
          y: 0,
          opacity: 1,
          duration: ENTER,
          ease: EASE,
          scrollTrigger: { trigger: el, start: "top 88%", once: true },
        }
      );
    });

    /* Editorial project panel reveal — height is reserved by aspect-ratio in
       CSS, so we only animate the image layer inside its clip. Titles and
       metadata sit outside the clip and stay selectable throughout. */
    doc.querySelectorAll(".project").forEach((p, i) => {
      const img = p.querySelector(".project__media img");
      const body = p.querySelectorAll(".project__meta, .project__title, .project__role, .project__summary, .project__action");

      if (img) {
        gsap.fromTo(img,
          { yPercent: 12, scale: 1.06 },
          {
            yPercent: 0, scale: 1,
            duration: 0.76,
            ease: EASE,
            delay: (i % 2) * 0.05,
            scrollTrigger: { trigger: p, start: "top 82%", once: true },
          }
        );
      }

      gsap.fromTo(body,
        { y: 18, opacity: 0 },
        {
          y: 0, opacity: 1,
          duration: 0.6,
          ease: EASE,
          stagger: 0.06,
          scrollTrigger: { trigger: p, start: "top 82%", once: true },
        }
      );
    });

    /* Oversized service handoff — the mask retracts as each row enters, so the
       scale reads without any layout movement. */
    doc.querySelectorAll(".service__name").forEach((name) => {
      gsap.fromTo(
        name,
        { "--reveal": "0%" },
        {
          "--reveal": "100%",
          duration: 0.72,
          ease: EASE,
          scrollTrigger: { trigger: name, start: "top 88%", once: true },
        }
      );
    });

    /* Contact chapter — the one place the signal colour takes the page. */
    gsap.fromTo(".contact > *",
      { y: 26, opacity: 0 },
      {
        y: 0, opacity: 1,
        duration: 0.66,
        ease: EASE,
        stagger: 0.06,
        scrollTrigger: { trigger: ".contact", start: "top 78%", once: true },
      }
    );

    /* Refresh measurements once fonts and below-fold media settle, so pins and
       triggers line up after layout shifts. */
    const refresh = () => ST.refresh();
    if (doc.fonts && doc.fonts.ready) doc.fonts.ready.then(refresh);
    window.addEventListener("load", refresh);

    cleanups.push(() => {
      window.removeEventListener("load", refresh);
      ST.getAll().forEach((t) => t.kill());
      gsap.globalTimeline.clear();
    });
  }

  /* ------------------------------------------------------------------ boot */

  function boot() {
    initNav();
    initSectionSpy();
    initDisclosures();
    initSmoothScroll();
    initMotion();
  }

  if (doc.readyState === "loading") doc.addEventListener("DOMContentLoaded", boot);
  else boot();

  // Clean up timelines, observers and the scroll engine on page exit
  window.addEventListener("pagehide", () => cleanups.forEach((fn) => fn()));

  // If the preference flips mid-session, stop rather than keep animating
  reduced.addEventListener("change", (e) => {
    if (e.matches) cleanups.forEach((fn) => fn());
  });
})();
