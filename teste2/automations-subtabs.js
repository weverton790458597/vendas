// automations-subtabs.js
// Alterna entre as sub-abas horizontais dentro da aba "Automações"
// (Nova automação / Últimas publicações / Automações cadastradas / Produtos).
// Isolado — não depende de app.js nem dos outros módulos.

document.addEventListener("DOMContentLoaded", () => {
  const nav = document.getElementById("automationsSubtabNav");
  if (!nav) return; // markup não presente nesta página

  nav.querySelectorAll(".subtab-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      const target = btn.getAttribute("data-subtab");

      nav.querySelectorAll(".subtab-btn").forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");

      document.querySelectorAll(".subtab-panel").forEach((panel) => {
        panel.classList.toggle("hidden", panel.id !== "subtab-" + target);
      });
    });
  });
});
