// produtos.js
// Painel de gestão de produtos (nome, link de afiliado, imagem, preço) e o
// seletor de produto reaproveitável (window.openProdutoPicker) usado tanto
// pelo formulário de "Nova automação" quanto pelos cards de "Últimas
// publicações". Isolado — usa o próprio client do Supabase.

import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";

const SUPABASE_URL = "https://abdliioyzkylccfylils.supabase.co";
const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFiZGxpaW95emt5bGNjZnlsaWxzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjgwNzkxMzIsImV4cCI6MjA4MzY1NTEzMn0.5s0zEdAgxx92pbC9yx75hHMfysHr2Aad86GhC1-tEmU";

// IMPORTANTE: só o app.js pode processar o token do link de convite/recuperação
// (detectSessionInUrl). Aqui a gente só LÊ a sessão que ele já estabeleceu.
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: false,
    detectSessionInUrl: false,
  },
});

const TABLE = "produtos";
let currentUserId = null;
let cachedProdutos = [];

function $(sel) {
  return document.querySelector(sel);
}

function escapeHtml(str) {
  return String(str || "").replace(/[&<>"']/g, (c) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  }[c]));
}

async function fetchProdutos() {
  if (!currentUserId) return [];
  const { data, error } = await supabase
    .from(TABLE)
    .select("id, nome, link_afiliado, link_imagem, preco, created_at")
    .eq("user_id", currentUserId)
    .order("created_at", { ascending: false });
  if (error) {
    console.error("Erro ao buscar produtos:", error.message);
    return [];
  }
  cachedProdutos = data || [];
  return cachedProdutos;
}

function produtoCardHtml(produto, mode) {
  const img = produto.link_imagem
    ? '<img src="' + escapeHtml(produto.link_imagem) + '" alt="" class="produto-thumb" />'
    : '<div class="produto-thumb produto-thumb-empty">Sem imagem</div>';
  const preco = produto.preco ? '<span class="produto-preco">' + escapeHtml(produto.preco) + "</span>" : "";

  if (mode === "picker") {
    return (
      '<button type="button" class="produto-card produto-card-pick" data-id="' + produto.id + '">' +
      img +
      '<div class="produto-info">' +
      "<strong>" + escapeHtml(produto.nome) + "</strong>" +
      preco +
      "</div></button>"
    );
  }

  return (
    '<div class="produto-card" data-id="' + produto.id + '">' +
    img +
    '<div class="produto-info">' +
    "<strong>" + escapeHtml(produto.nome) + "</strong>" +
    preco +
    "</div>" +
    '<div class="produto-actions">' +
    '<button type="button" class="btn btn-outline btn-sm produto-edit-btn" data-id="' + produto.id + '">Editar</button>' +
    '<button type="button" class="btn btn-danger-ghost btn-sm produto-delete-btn" data-id="' + produto.id + '">Excluir</button>' +
    "</div></div>"
  );
}

function renderProdutosGrid(produtos) {
  const grid = $("#produtosGrid");
  if (!grid) return;
  if (!produtos || produtos.length === 0) {
    grid.innerHTML = '<div class="empty-state">Nenhum produto cadastrado ainda.</div>';
    return;
  }
  grid.innerHTML = produtos.map((p) => produtoCardHtml(p, "manage")).join("");

  grid.querySelectorAll(".produto-edit-btn").forEach((btn) =>
    btn.addEventListener("click", () => openProdutoModal(btn.getAttribute("data-id")))
  );
  grid.querySelectorAll(".produto-delete-btn").forEach((btn) =>
    btn.addEventListener("click", () => deleteProduto(btn.getAttribute("data-id")))
  );
}

async function loadAndRenderProdutos() {
  const grid = $("#produtosGrid");
  if (grid) grid.innerHTML = '<div class="loading-row">Carregando produtos…</div>';
  const produtos = await fetchProdutos();
  renderProdutosGrid(produtos);
}

// ---------- Modal de cadastro/edição ----------

function openProdutoModal(editId) {
  const modal = $("#produtoModal");
  if (!modal) return;
  const title = $("#produtoModalTitle");
  const idInput = $("#produtoEditId");
  const nomeInput = $("#produtoNomeInput");
  const linkInput = $("#produtoLinkInput");
  const imgInput = $("#produtoImgInput");
  const precoInput = $("#produtoPrecoInput");
  $("#produtoModalError").classList.add("hidden");

  if (editId) {
    const produto = cachedProdutos.find((p) => String(p.id) === String(editId));
    if (!produto) return;
    title.textContent = "Editar produto";
    idInput.value = produto.id;
    nomeInput.value = produto.nome || "";
    linkInput.value = produto.link_afiliado || "";
    imgInput.value = produto.link_imagem || "";
    precoInput.value = produto.preco || "";
  } else {
    title.textContent = "Cadastrar produto";
    idInput.value = "";
    nomeInput.value = "";
    linkInput.value = "";
    imgInput.value = "";
    precoInput.value = "";
  }
  modal.classList.remove("hidden");
}

function closeProdutoModal() {
  const modal = $("#produtoModal");
  if (modal) modal.classList.add("hidden");
}

async function saveProduto() {
  const idInput = $("#produtoEditId");
  const nomeInput = $("#produtoNomeInput");
  const linkInput = $("#produtoLinkInput");
  const imgInput = $("#produtoImgInput");
  const precoInput = $("#produtoPrecoInput");
  const errorEl = $("#produtoModalError");

  const nome = nomeInput.value.trim();
  const link = linkInput.value.trim();
  const imagem = imgInput.value.trim() || null;
  const preco = precoInput.value.trim() || null;

  if (!nome || !link) {
    errorEl.textContent = "Nome e link de afiliado são obrigatórios.";
    errorEl.classList.remove("hidden");
    return;
  }
  if (!currentUserId) {
    errorEl.textContent = "Sua sessão expirou. Atualize a página.";
    errorEl.classList.remove("hidden");
    return;
  }

  const saveBtn = $("#saveProdutoBtn");
  if (saveBtn) saveBtn.disabled = true;

  try {
    const editId = idInput.value;
    const payload = {
      user_id: currentUserId,
      nome,
      link_afiliado: link,
      link_imagem: imagem,
      preco,
    };
    const { error } = editId
      ? await supabase.from(TABLE).update(payload).eq("id", editId)
      : await supabase.from(TABLE).insert(payload);
    if (error) throw error;

    closeProdutoModal();
    await loadAndRenderProdutos();
  } catch (error) {
    errorEl.textContent = "Erro ao salvar: " + error.message;
    errorEl.classList.remove("hidden");
  } finally {
    if (saveBtn) saveBtn.disabled = false;
  }
}

async function deleteProduto(id) {
  const produto = cachedProdutos.find((p) => String(p.id) === String(id));
  if (!produto) return;
  if (!confirm('Excluir o produto "' + produto.nome + '"? Isso não afeta automações já criadas com ele.')) return;

  try {
    const { error } = await supabase.from(TABLE).delete().eq("id", id);
    if (error) throw error;
    await loadAndRenderProdutos();
  } catch (error) {
    alert("Erro ao excluir: " + error.message);
  }
}

function filterAndRenderMain() {
  const query = ($("#produtoSearch")?.value || "").toLowerCase().trim();
  const filtered = query
    ? cachedProdutos.filter((p) => (p.nome || "").toLowerCase().includes(query))
    : cachedProdutos;
  renderProdutosGrid(filtered);
}

// ---------- Seletor reaproveitável (usado por outros módulos) ----------

let pickerCallback = null;

function renderPickerList(produtos) {
  const list = $("#produtoPickerList");
  if (!list) return;
  if (!produtos || produtos.length === 0) {
    list.innerHTML = '<div class="empty-state">Nenhum produto cadastrado ainda.</div>';
    return;
  }
  list.innerHTML = produtos.map((p) => produtoCardHtml(p, "picker")).join("");
  list.querySelectorAll(".produto-card-pick").forEach((btn) =>
    btn.addEventListener("click", () => {
      const produto = cachedProdutos.find((p) => String(p.id) === btn.getAttribute("data-id"));
      if (produto && pickerCallback) pickerCallback(produto);
      closeProdutoPicker();
    })
  );
}

async function openProdutoPicker(callback) {
  const modal = $("#produtoPickerModal");
  if (!modal) return;
  pickerCallback = callback;
  modal.classList.remove("hidden");
  const list = $("#produtoPickerList");
  if (list) list.innerHTML = '<div class="loading-row">Carregando produtos…</div>';
  const searchInput = $("#produtoPickerSearch");
  if (searchInput) searchInput.value = "";
  const produtos = cachedProdutos.length ? cachedProdutos : await fetchProdutos();
  renderPickerList(produtos);
}

function closeProdutoPicker() {
  const modal = $("#produtoPickerModal");
  if (modal) modal.classList.add("hidden");
  pickerCallback = null;
}

// Exposto globalmente de propósito: instagram-latest-posts.js e o botão
// "Escolher produto cadastrado" do formulário de Nova automação chamam
// isso diretamente — são scripts isolados, sem import entre si.
window.openProdutoPicker = openProdutoPicker;

// ---------- Bootstrap ----------

async function bootstrap() {
  const grid = $("#produtosGrid");
  const pickerModal = $("#produtoPickerModal");
  if (!grid && !pickerModal) return; // markup não presente nesta página

  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session || !session.user) return;
  currentUserId = session.user.id;

  if (grid) {
    await loadAndRenderProdutos();

    $("#newProdutoBtn")?.addEventListener("click", () => openProdutoModal(null));
    $("#closeProdutoModalBtn")?.addEventListener("click", closeProdutoModal);
    $("#cancelProdutoModalBtn")?.addEventListener("click", closeProdutoModal);
    $("#saveProdutoBtn")?.addEventListener("click", saveProduto);
    $("#produtoSearch")?.addEventListener("input", filterAndRenderMain);
  }

  $("#closeProdutoPickerBtn")?.addEventListener("click", closeProdutoPicker);
  $("#produtoPickerSearch")?.addEventListener("input", () => {
    const query = $("#produtoPickerSearch").value.toLowerCase().trim();
    const filtered = query
      ? cachedProdutos.filter((p) => (p.nome || "").toLowerCase().includes(query))
      : cachedProdutos;
    renderPickerList(filtered);
  });

  // Botão "Escolher produto cadastrado" do formulário de Nova automação.
  $("#pickProdutoBtn")?.addEventListener("click", () => {
    openProdutoPicker((produto) => {
      const produtoUrlInput = document.getElementById("produtoUrl");
      const tituloInput = document.getElementById("tituloProduto");
      const imagemInput = document.getElementById("imagemUrl");
      const precoInput = document.getElementById("precoProduto");
      if (produtoUrlInput) produtoUrlInput.value = produto.link_afiliado || "";
      if (tituloInput) tituloInput.value = produto.nome || "";
      if (imagemInput) imagemInput.value = produto.link_imagem || "";
      if (precoInput) precoInput.value = produto.preco || "";
      // Revela o bloco de personalização, já que acabamos de preenchê-lo.
      document.getElementById("imagemUrlField")?.classList.remove("hidden");
    });
  });
}

document.addEventListener("DOMContentLoaded", bootstrap);

/* ============================================================
   Markup esperado (index.html): ver seção "Produtos" dentro de
   #tab-dashboard, o modal #produtoModal e o modal #produtoPickerModal.

   Script:
   <script type="module" src="produtos.js"></script>
   (precisa vir ANTES de instagram-latest-posts.js na ordem das tags,
   pois expõe window.openProdutoPicker que o outro módulo usa)
   ============================================================ */
