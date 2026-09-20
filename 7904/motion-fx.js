// motion-fx.js — Achei & Postei (Redesign 2026)
// Animações,reveal e micro-interações visuais. Usa GSAP quando disponível;
// fallback para animações CSS puras quando não.

(function () {
  "use strict";

  /* ------------------------------------------------------------------
     GSAP reveal timeline (auth screen)
  ------------------------------------------------------------------- */
  if (typeof gsap !== "undefined") {
    const tl = gsap.timeline({ defaults: { ease: "power3.out" } });
    tl.fromTo(
      ".brand-mark",
      { opacity: 0, y: -30, scale: 0.95 },
      { opacity: 1, y: 0, scale: 1, duration: 0.8 }
    )
      .fromTo(
        ".brand-headline",
        { opacity: 0, y: 30 },
        { opacity: 1, y: 0, duration: 0.9 },
        "-=0.4"
      )
      .fromTo(
        ".brand-copy",
        { opacity: 0, y: 20 },
        { opacity: 1, y: 0, duration: 0.8 },
        "-=0.6"
      )
      .fromTo(
        ".brand-stats",
        { opacity: 0, y: 20 },
        { opacity: 1, y: 0, duration: 0.7 },
        "-=0.5"
      )
      .fromTo(
        "#demoPhone",
        { opacity: 0, scale: 0.9, y: 40 },
        { opacity: 1, scale: 1, y: 0, duration: 1 },
        "-=0.4"
      )
      .fromTo(
        ".auth-form-card",
        { opacity: 0, x: 40, scale: 0.98 },
        { opacity: 1, x: 0, scale: 1, duration: 0.9 },
        "-=0.8"
      );
  }

  /* ------------------------------------------------------------------
     3D Tilt no demo phone
  ------------------------------------------------------------------- */
  const demoPhone = document.getElementById("demoPhone");
  if (demoPhone) {
    const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const canHover = window.matchMedia("(hover: hover) and (pointer: fine)").matches;

    if (!prefersReducedMotion && canHover) {
      const tiltZone = demoPhone.closest(".auth-brand") || demoPhone;
      function clamp(val, min, max) {
        return Math.min(Math.max(val, min), max);
      }
      let ticking = false;
      tiltZone.addEventListener("mousemove", (event) => {
        if (ticking) return;
        ticking = true;
        requestAnimationFrame(() => {
          const rect = demoPhone.getBoundingClientRect();
          const px = clamp((event.clientX - rect.left) / rect.width - 0.5, -0.5, 0.5);
          const py = clamp((event.clientY - rect.top) / rect.height - 0.5, -0.5, 0.5);
          demoPhone.style.setProperty("--tiltX", (px * 14).toFixed(2) + "deg");
          demoPhone.style.setProperty("--tiltY", (py * -14).toFixed(2) + "deg");
          ticking = false;
        });
      });
      tiltZone.addEventListener("mouseleave", () => {
        demoPhone.style.setProperty("--tiltX", "0deg");
        demoPhone.style.setProperty("--tiltY", "0deg");
      });
    }
  }

  /* ------------------------------------------------------------------
     Partículas de fundo do canvas (auth screen)
  ------------------------------------------------------------------- */
  const canvas = document.getElementById("motionCanvas");
  if (canvas) {
    const ctx = canvas.getContext("2d");
    let width, height;
    let particles = [];

    function resize() {
      width = canvas.width = canvas.parentElement.offsetWidth;
      height = canvas.height = canvas.parentElement.offsetHeight;
    }
    window.addEventListener("resize", resize);
    resize();

    class Particle {
      constructor() {
        this.reset();
      }
      reset() {
        this.x = Math.random() * width;
        this.y = Math.random() * height;
        this.vx = (Math.random() - 0.5) * 0.6;
        this.vy = (Math.random() - 0.5) * 0.6;
        this.radius = Math.random() * 2 + 1;
        this.alpha = Math.random() * 0.5 + 0.2;
      }
      update() {
        this.x += this.vx;
        this.y += this.vy;
        if (this.x < 0 || this.x > width || this.y < 0 || this.y > height) {
          this.reset();
        }
      }
      draw() {
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(255, 42, 133, ${this.alpha})`;
        ctx.fill();
      }
    }

    for (let i = 0; i < 45; i++) {
      particles.push(new Particle());
    }

    function animateParticles() {
      ctx.clearRect(0, 0, width, height);
      particles.forEach((p) => {
        p.update();
        p.draw();
      });
      // Linhas de conexão entre partículas próximas
      for (let i = 0; i < particles.length; i++) {
        for (let j = i + 1; j < particles.length; j++) {
          const dx = particles[i].x - particles[j].x;
          const dy = particles[i].y - particles[j].y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist < 110) {
            ctx.beginPath();
            ctx.moveTo(particles[i].x, particles[i].y);
            ctx.lineTo(particles[j].x, particles[j].y);
            ctx.strokeStyle = `rgba(0, 209, 138, ${0.15 * (1 - dist / 110)})`;
            ctx.lineWidth = 1;
            ctx.stroke();
          }
        }
      }
      requestAnimationFrame(animateParticles);
    }
    animateParticles();
  }

  /* ------------------------------------------------------------------
     Animações de entrada para cards e KPIs (IntersectionObserver)
  ------------------------------------------------------------------- */
  function initRevealAnimations() {
    if (typeof IntersectionObserver === "undefined") {
      // Fallback: mostra tudo imediatamente
      $$(".gsap-reveal, .kpi-card, .automation-card, .ig-tester-admin-row, .widget, .panel").forEach((el) => {
        el.classList.add("revealed");
      });
      return;
    }

    const revealElements = $$(".gsap-reveal, .kpi-card, .automation-card, .ig-tester-admin-row, .widget, .panel");
    if (!revealElements.length) return;

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add("revealed");
            observer.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.1, rootMargin: "0px 0px -40px 0px" }
    );

    revealElements.forEach((el) => observer.observe(el));
  }

  /* ------------------------------------------------------------------
     Micro-interação: botões de ação
  ------------------------------------------------------------------- */
  function initButtonInteractions() {
    // Botões primários: efeito ripple
    $$(".btn-primary").forEach((btn) => {
      btn.addEventListener("click", function (e) {
        const rect = this.getBoundingClientRect();
        const ripple = document.createElement("span");
        const size = Math.max(rect.width, rect.height);
        const x = e.clientX - rect.left - size / 2;
        const y = e.clientY - rect.top - size / 2;
        ripple.style.cssText = `
          position: absolute;
          border-radius: 50%;
          transform: scale(0);
          background: rgba(255, 255, 255, 0.4);
          animation: ripple 0.6s ease-out;
          left: ${x}px;
          top: ${y}px;
          width: ${size}px;
          height: ${size}px;
          pointer-events: none;
        `;
        this.style.position = "relative";
        this.style.overflow = "hidden";
        this.appendChild(ripple);
        setTimeout(() => ripple.remove(), 600);
      });
    });

    // Toggles de status (automation cards)
    $$(".toggle-slider").forEach((slider) => {
      slider.addEventListener("click", () => {
        const isOn = slider.getAttribute("data-on") === "true";
        slider.setAttribute("data-on", String(!isOn));
        slider.classList.add("pulse");
        setTimeout(() => slider.classList.remove("pulse"), 800);
      });
    });
  }

  /* ------------------------------------------------------------------
     Inicializa tudo após DOM pronto
  ------------------------------------------------------------------- */
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => {
      initRevealAnimations();
      initButtonInteractions();
    });
  } else {
    initRevealAnimations();
    initButtonInteractions();
  }

  // Helper: $ e $$ acessíveis dentro do módulo
  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => document.querySelectorAll(sel);
})();

/* ==========================================================================
   CSS de apoio para animações JS (inject dinâmico)
========================================================================== */
(function injectMotionCSS() {
  if (typeof document === "undefined") return;
  const style = document.createElement("style");
  style.textContent = `
    .gsap-reveal, .kpi-card, .automation-card, .ig-tester-admin-row, .widget, .panel {
      opacity: 0;
      transform: translateY(24px) scale(0.97);
      transition: opacity 0.5s var(--transition-smooth), transform 0.5s var(--transition-smooth);
    }
    .revealed,
    .gsap-reveal.revealed {
      opacity: 1;
      transform: translateY(0) scale(1);
    }
    @keyframes ripple {
      to { transform: scale(2.5); opacity: 0; }
    }
    .toggle-slider {
      display: inline-block;
      width: 42px;
      height: 24px;
      border-radius: 999px;
      background: var(--color-surface-2);
      border: 1px solid var(--color-border);
      position: relative;
      transition: background 0.25s var(--transition-smooth);
      cursor: pointer;
    }
    .toggle-slider::before {
      content: "";
      position: absolute;
      top: 2px;
      left: 2px;
      width: 20px;
      height: 20px;
      border-radius: 50%;
      background: var(--color-text);
      transition: transform 0.25s var(--transition-bounce);
    }
    .toggle-slider[data-on="true"]::before {
      transform: translateX(18px);
      background: var(--color-success);
    }
    .toggle-slider[data-on="true"] {
      background: var(--color-success-soft);
      border-color: var(--color-success);
    }
    .toggle-slider.pulse {
      animation: pulseActive 0.6s ease-in-out 2;
    }
    @keyframes pulseActive {
      0%, 100% { box-shadow: 0 0 0 0 var(--color-success-soft); }
      50% { box-shadow: 0 0 0 8px var(--color-success-soft); }
    }
  `;
  document.head.appendChild(style);
})();
