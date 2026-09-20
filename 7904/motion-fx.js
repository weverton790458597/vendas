document.addEventListener("DOMContentLoaded", () => {
  if (typeof gsap !== "undefined") {
    const tl = gsap.timeline({ defaults: { ease: "power3.out" } });
    tl.fromTo(".brand-mark",
      { opacity: 0, y: -30, scale: 0.95 },
      { opacity: 1, y: 0, scale: 1, duration: 0.8 }
    )
    .fromTo(".brand-headline",
      { opacity: 0, y: 30 },
      { opacity: 1, y: 0, duration: 0.9 },
      "-=0.4"
    )
    .fromTo(".brand-copy",
      { opacity: 0, y: 20 },
      { opacity: 1, y: 0, duration: 0.8 },
      "-=0.6"
    )
    .fromTo(".brand-stats",
      { opacity: 0, y: 20 },
      { opacity: 1, y: 0, duration: 0.7 },
      "-=0.5"
    )
    .fromTo("#demoPhone",
      { opacity: 0, scale: 0.9, y: 40 },
      { opacity: 1, scale: 1, y: 0, duration: 1 },
      "-=0.4"
    )
    .fromTo(".auth-form-card",
      { opacity: 0, x: 40, scale: 0.98 },
      { opacity: 1, x: 0, scale: 1, duration: 0.9 },
      "-=0.8"
    );
  }
  const demoPhone = document.getElementById("demoPhone");
  if (demoPhone) {
    const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const canHover = window.matchMedia("(hover: hover) and (pointer: fine)").matches;
    if (!prefersReducedMotion && canHover) {
      const tiltZone = demoPhone.closest(".auth-brand") || demoPhone;
      const clamp = (val, min, max) => Math.min(Math.max(val, min), max);
      tiltZone.addEventListener("mousemove", (event) => {
        const rect = demoPhone.getBoundingClientRect();
        const px = clamp((event.clientX - rect.left) / rect.width - 0.5, -0.5, 0.5);
        const py = clamp((event.clientY - rect.top) / rect.height - 0.5, -0.5, 0.5);
        demoPhone.style.setProperty("--tiltX", (px * 14).toFixed(2) + "deg");
        demoPhone.style.setProperty("--tiltY", (py * -14).toFixed(2) + "deg");
      });
      tiltZone.addEventListener("mouseleave", () => {
        demoPhone.style.setProperty("--tiltX", "0deg");
        demoPhone.style.setProperty("--tiltY", "0deg");
      });
    }
  }
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
        ctx.fillStyle = `rgba(201, 138, 31, ${this.alpha})`;
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
      for (let i = 0; i < particles.length; i++) {
        for (let j = i + 1; j < particles.length; j++) {
          const dx = particles[i].x - particles[j].x;
          const dy = particles[i].y - particles[j].y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist < 110) {
            ctx.beginPath();
            ctx.moveTo(particles[i].x, particles[i].y);
            ctx.lineTo(particles[j].x, particles[j].y);
            ctx.strokeStyle = `rgba(30, 79, 216, ${0.15 * (1 - dist / 110)})`;
            ctx.lineWidth = 1;
            ctx.stroke();
          }
        }
      }
      requestAnimationFrame(animateParticles);
    }
    animateParticles();
  }
});
