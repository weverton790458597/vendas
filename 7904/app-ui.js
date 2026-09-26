/* app-ui.js — camada visual isolada; não altera a lógica dos módulos existentes. */
(() => {
  const $ = (s) => document.querySelector(s);
  const $$ = (s) => [...document.querySelectorAll(s)];

  // Mantém o avatar superior sincronizado com o avatar real.
  const syncAvatar = () => {
    const avatar = $("#userAvatar")?.textContent || "U";
    if ($("#topAvatar")) $("#topAvatar").textContent = avatar;
    if ($("#mobileAvatar")) $("#mobileAvatar").textContent = avatar;
  };
  const observer = new MutationObserver(syncAvatar);
  if ($("#userAvatar")) observer.observe($("#userAvatar"), { childList:true, characterData:true, subtree:true });
  syncAvatar();

  // Título contextual.
  const titles = {dashboard:"Central de automações", accounts:"Contas do Instagram", admin:"Administração"};
  $$(".nav-item[data-tab]").forEach(btn => btn.addEventListener("click", () => {
    const tab = btn.dataset.tab;
    if ($("#pageTitle")) $("#pageTitle").textContent = titles[tab] || "AutoFlow";
    syncAvatar();
  }));

  // O app.js controla a visibilidade do botão de admin; espelhamos para a barra mobile.
  const adminDesktop = $("#adminTabBtn");
  const adminMobile = $("#mobileAdminNav");
  if (adminDesktop && adminMobile) {
    const mirrorAdmin = () => adminMobile.classList.toggle("hidden", adminDesktop.classList.contains("hidden"));
    new MutationObserver(mirrorAdmin).observe(adminDesktop, { attributes:true, attributeFilter:["class"] });
    mirrorAdmin();
  }

  // Botão "Conta" no mobile executa o mesmo logout da barra lateral.
  $("#mobileProfileBtn")?.addEventListener("click", () => $("#logoutBtn")?.click());

  // Prévia da palavra-chave em tempo real.
  const keyword = $("#palavraChave");
  const preview = $("#previewKeyword");
  if (keyword && preview) {
    keyword.addEventListener("input", () => preview.textContent = keyword.value.trim() || "sua palavra-chave");
  }

  // Reforça comportamento de modal para os modais estáticos.
  $$(".modal-overlay").forEach(modal => {
    modal.addEventListener("click", e => {
      if (e.target === modal && !modal.id.includes("produto")) modal.classList.add("hidden");
    });
  });

  // PWA install prompt.
  let deferredPrompt = null;
  const toast = $("#pwaInstallToast");
  const installButtons = [$("#installAppBtn"), $("#mobileInstallBtn"), $("#pwaInstallAction")].filter(Boolean);
  const closeToast = $("#pwaInstallClose");

  window.addEventListener("beforeinstallprompt", e => {
    e.preventDefault();
    deferredPrompt = e;
    if (toast && !localStorage.getItem("af-pwa-dismissed")) toast.classList.remove("hidden");
  });

  const install = async () => {
    if (!deferredPrompt) {
      // Em iOS/alguns navegadores não existe prompt programático.
      if (toast) toast.classList.remove("hidden");
      return;
    }
    deferredPrompt.prompt();
    await deferredPrompt.userChoice;
    deferredPrompt = null;
    if (toast) toast.classList.add("hidden");
  };
  installButtons.forEach(b => b.addEventListener("click", install));
  closeToast?.addEventListener("click", () => {
    toast?.classList.add("hidden");
    localStorage.setItem("af-pwa-dismissed","1");
  });
  window.addEventListener("appinstalled", () => {
    deferredPrompt = null;
    toast?.classList.add("hidden");
  });

  // Registra o Service Worker somente em contexto seguro.
  if ("serviceWorker" in navigator && (location.protocol === "https:" || location.hostname === "localhost")) {
    navigator.serviceWorker.register("./sw.js").catch(() => {});
  }
})();
