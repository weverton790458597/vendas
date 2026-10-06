(function () {
    'use strict';

    // ====== CONFIGURAÇÃO ======
    const CONFIG = {
        url: 'https://abdliioyzkylccfylils.supabase.co',
        anonKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFiZGxpaW95emt5bGNjZnlsaWxzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjgwNzkxMzIsImV4cCI6MjA4MzY1NTEzMn0.5s0zEdAgxx92pbC9yx75hHMfysHr2Aad86GhC1-tEmU',
        table: 'produtos',
        userId: 'f40f6e5c-de60-4f52-82e7-9ef2a17f5fc3'
    };

    const SKELETON_COUNT = 10;
    let allProducts = [];

    // ====== SUPABASE ======
    function initSupabase() {
        if (typeof supabase === 'undefined') return null;
        if (!window._supabaseClient) {
            window._supabaseClient = supabase.createClient(CONFIG.url, CONFIG.anonKey);
        }
        return window._supabaseClient;
    }

    async function fetchProducts() {
        const client = initSupabase();
        if (!client) return null;

        const { data, error } = await client
            .from(CONFIG.table)
            .select('id, nome, link_afiliado, link_imagem, preco, created_at')
            .eq('user_id', CONFIG.userId)
            .order('created_at', { ascending: false });

        if (error) {
            console.error('[Achei e Postei] Erro ao buscar produtos:', error);
            return null;
        }
        return data || [];
    }

    // ====== HELPERS ======
    function escapeHtml(str) {
        const div = document.createElement('div');
        div.textContent = str == null ? '' : String(str);
        return div.innerHTML;
    }

    function formatPrice(v) {
        if (v == null) return 'Ver preço';
        const s = String(v).trim();
        if (!s) return 'Ver preço';
        return /^R\$/i.test(s) ? s : 'R$ ' + s;
    }

    function safeUrl(url) {
        try {
            const u = new URL(url, window.location.href);
            return (u.protocol === 'http:' || u.protocol === 'https:') ? u.href : '#';
        } catch (e) {
            return '#';
        }
    }

    function normalizeText(s) {
        return String(s || '')
            .toLowerCase()
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .trim();
    }

    // ====== RENDER ======
    const ICON_IMG = '<svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="M21 15l-5-5L5 21"/></svg>';
    const ICON_SEARCH = '<svg xmlns="http://www.w3.org/2000/svg" width="44" height="44" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>';

    function createProductCard(p, index) {
        if (!p || p.id == null) return null;

        const card = document.createElement('article');
        card.className = 'product-card';
        card.style.animationDelay = Math.min(index, 12) * 0.04 + 's';

        const title = escapeHtml(p.nome || '');
        const image = p.link_imagem || '';
        const url = safeUrl(p.link_afiliado);

        card.innerHTML =
            '<div class="product-image-wrap">' +
                (image
                    ? '<img src="' + escapeHtml(image) + '" alt="' + title + '" class="product-image" loading="lazy" decoding="async" referrerpolicy="no-referrer">'
                    : ICON_IMG) +
            '</div>' +
            '<div class="product-info">' +
                '<h3 class="product-title">' + title + '</h3>' +
                '<div class="price-container">' +
                    '<span class="price-current">' + escapeHtml(formatPrice(p.preco)) + '</span>' +
                '</div>' +
                '<a class="cta-button" href="' + escapeHtml(url) + '" target="_blank" rel="noopener noreferrer sponsored">' +
                    'Ir para a loja <span class="shopee-tag">Shopee</span>' +
                '</a>' +
            '</div>';

        const img = card.querySelector('.product-image');
        if (img) {
            img.addEventListener('error', function () {
                this.closest('.product-image-wrap').innerHTML = ICON_IMG;
            });
        }

        return card;
    }

    function renderSkeletons(grid) {
        let html = '';
        for (let i = 0; i < SKELETON_COUNT; i++) {
            html +=
                '<div class="skeleton-card" aria-hidden="true">' +
                    '<div class="sk sk-img"></div>' +
                    '<div class="sk-body">' +
                        '<div class="sk sk-line"></div>' +
                        '<div class="sk sk-line short"></div>' +
                        '<div class="sk sk-btn"></div>' +
                    '</div>' +
                '</div>';
        }
        grid.innerHTML = html;
    }

    function renderEmpty(grid, title, text) {
        grid.innerHTML =
            '<div class="empty-state">' + ICON_SEARCH +
            '<strong>' + escapeHtml(title) + '</strong>' +
            '<p>' + escapeHtml(text) + '</p></div>';
    }

    function renderProducts(list, term) {
        const grid = document.getElementById('productsGrid');
        const count = document.getElementById('resultsCount');
        if (!grid) return;

        grid.innerHTML = '';

        if (!list.length) {
            count.textContent = '';
            if (term) {
                renderEmpty(grid, 'Nenhum produto encontrado', 'Não achamos nada para "' + term + '". Tente outro nome.');
            } else {
                renderEmpty(grid, 'Novidades chegando em breve!', 'Ainda não há produtos por aqui.');
            }
            return;
        }

        const frag = document.createDocumentFragment();
        list.forEach(function (p, i) {
            const card = createProductCard(p, i);
            if (card) frag.appendChild(card);
        });
        grid.appendChild(frag);

        count.textContent = list.length + (list.length === 1 ? ' produto' : ' produtos');
    }

    // ====== BUSCA ======
    function applySearch() {
        const input = document.getElementById('searchInput');
        const clear = document.getElementById('searchClear');
        const raw = input.value.trim();
        const term = normalizeText(raw);

        clear.hidden = raw.length === 0;

        if (!term) {
            renderProducts(allProducts, '');
            return;
        }

        const words = term.split(/\s+/);
        const filtered = allProducts.filter(function (p) {
            const name = normalizeText(p.nome);
            return words.every(function (w) { return name.includes(w); });
        });

        renderProducts(filtered, raw);
    }

    function setupSearch() {
        const form = document.getElementById('searchForm');
        const input = document.getElementById('searchInput');
        const clear = document.getElementById('searchClear');
        if (!form || !input) return;

        let timer = null;
        input.addEventListener('input', function () {
            clearTimeout(timer);
            timer = setTimeout(applySearch, 150);
        });

        form.addEventListener('submit', function (e) {
            e.preventDefault();
            clearTimeout(timer);
            applySearch();
            input.blur();
        });

        clear.addEventListener('click', function () {
            input.value = '';
            applySearch();
            input.focus();
        });
    }

    // ====== INIT ======
    async function init() {
        const grid = document.getElementById('productsGrid');
        if (!grid) return;

        setupSearch();
        renderSkeletons(grid);

        const products = await fetchProducts();

        if (products === null) {
            renderEmpty(grid, 'Não foi possível carregar', 'Tente atualizar a página em instantes.');
            return;
        }

        allProducts = products;
        applySearch();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
