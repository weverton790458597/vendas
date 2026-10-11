// mobile-ui.js
// Só cuida de 2 botões que existem apenas no layout mobile: o botão
// flutuante "Nova automação" e o "fechar" da folha que ele abre. Os dois
// simplesmente clicam nas sub-abas que já existem — quem decide o que
// mostrar/esconder continua sendo o automations-subtabs.js, sem duplicar
// lógica. Isolado — não depende de nenhum outro arquivo do projeto.

document.addEventListener("click", function (event) {
  const openBtn = event.target.closest("[data-open-new-automation]");
  if (openBtn) {
    document.querySelector('.subtab-btn[data-subtab="new"]')?.click();
    return;
  }
  const closeBtn = event.target.closest("[data-close-sheet]");
  if (closeBtn) {
    document.querySelector('.subtab-btn[data-subtab="list"]')?.click();
  }
});
