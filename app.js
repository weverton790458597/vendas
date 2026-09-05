(function () {
    'use strict';

    const SUPABASE_CONFIG = {
        url: 'https://abdliioyzkylccfylils.supabase.co',
        anonKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFiZGxpaW95emt5bGNjZnlsaWxzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjgwNzkxMzIsImV4cCI6MjA4MzY1NTEzMn0.5s0zEdAgxx92pbC9yx75hHMfysHr2Aad86GhC1-tEmU'
    };

    function initSupabase() {
        if (typeof supabase === 'undefined') return null;
        if (!window._supabaseClient) {
            window._supabaseClient = supabase.createClient(SUPABASE_CONFIG.url, SUPABASE_CONFIG.anonKey);
        }
        return window._supabaseClient;
    }

    async function getProducts() {
        const client = initSupabase();
        if (!client) return [];
        const { data, error } = await client
            .from('product')
            .select('*')
            .order('created_at', { ascending: false });
        if (error) {
            console.error('[Achei e Postei] Erro ao buscar produtos:', error);
            return [];
        }
        return data || [];
    }

    const categories = [
        { id: "all", name: "Todos", svg: '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12l2-2v8a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V10l2-2M5 12V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v7"/></svg>' },
        { id: "eletronicos", name: "Eletrônicos", svg: '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="12" rx="1.5"/><line x1="8" y1="20" x2="16" y2="20"/><line x1="12" y1="16" x2="12" y2="20"/></svg>' },
        { id: "beleza", name: "Beleza", svg: '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8 3h3v4H8z"/><path d="M8.5 7h2a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2h-2a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2z"/><path d="M15 12h3v9h-3z"/><path d="M15.5 12v-3a2 2 0 0 1 2-2h0a2 2 0 0 1 2 2v3"/></svg>' },
        { id: "casa", name: "Casa", svg: '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 11v8a1 1 0 0 0 1 1h3v-6h6v6h3a1 1 0 0 0 1-1v-8"/><path d="M5 11l7-6 7 6"/></svg>' },
        { id: "moda", name: "Moda", svg: '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 4 5 6.5 3 10l3 2v9h12v-9l3-2-2-3.5-4-2.5L9 4z"/></svg>' },
        { id: "esportes", name: "Esportes", svg: '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6.5 6.5 2 11l11 11 4.5-4.5"/><path d="M17.5 6.5 22 11l-2.3 2.3"/><path d="M4.5 8.5l2-2M15.5 19.5l2-2"/><path d="M8 12l4 4"/></svg>' },
        { id: "games", name: "Games", svg: '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="8" width="20" height="10" rx="5"/><line x1="7" y1="11" x2="7" y2="15"/><line x1="5" y1="13" x2="9" y2="13"/><circle cx="16" cy="12" r="1"/><circle cx="18.5" cy="14.5" r="1"/></svg>' }
    ];

    function escapeHtml(str) {
        const div = document.createElement('div');
        div.textContent = str == null ? '' : String(str);
        return div.innerHTML;
    }

    function normalizeProduct(p) {
        if (!p) return null;
        return {
            id: p.id,
            title: p.title || '',
            priceCurrent: p.price_current || 'R$ 00,00',
            priceOld: p.price_old || null,
            discount: p.discount || null,
            image: p.image || '',
            affiliateUrl: p.affiliate_url || '#',
            category: p.category || '',
            isHot: !!p.is_hot
        };
    }

    function createProductCard(product) {
        product = normalizeProduct(product);
        if (!product || product.id == null) return document.createDocumentFragment();

        const card = document.createElement('div');
        card.className = 'product-card';
        card.setAttribute('data-product', product.id);
        card.setAttribute('data-category', product.category || '');

        const hotBadge = product.isHot ? '<div class="hot-badge">Destaque</div>' : '';
        const discountBadge = product.discount
            ? '<div class="discount-badge">-' + escapeHtml(product.discount.replace('-', '')) + '</div>'
            : '';

        const productTitle = escapeHtml(product.title || '');
        const priceCurrent = escapeHtml(product.priceCurrent || 'R$ 00,00');
        const priceOld = product.priceOld ? escapeHtml(product.priceOld) : '';
        const affiliateUrl = escapeHtml(product.affiliateUrl || '#');
        const image = product.image || '';

        card.innerHTML = [
            hotBadge,
            discountBadge,
            '<div class="product-image-wrap">',
            '  <img src="' + escapeHtml(image) + '" alt="' + productTitle + '" class="product-image" loading="lazy">',
            '</div>',
            '<div class="product-info">',
            '  <h3 class="product-title">' + productTitle + '</h3>',
            '  <div class="price-container">',
            '    <span class="price-current">' + priceCurrent + '</span>',
            '    <span class="price-old">' + priceOld + '</span>',
            '  </div>',
            '  <button class="cta-button primary" data-url="' + affiliateUrl + '">',
            '    Ir para a loja <span class="shopee-tag">Shopee</span>',
            '  </button>',
            '</div>'
        ].join('');

        const img = card.querySelector('.product-image');
        if (img) {
            img.addEventListener('error', function () {
                this.closest('.product-image-wrap').innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12l2-2v8a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V10l2-2M5 12V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v7"/></svg>';
            });
        }

        const ctaButton = card.querySelector('.cta-button');
        if (ctaButton) {
            ctaButton.addEventListener('click', function (e) {
                e.preventDefault();
                window.open(affiliateUrl, '_blank', 'noopener,noreferrer');
            });
        }

        return card;
    }

    function animateCards(container) {
        const cards = container.querySelectorAll('.product-card');
        cards.forEach((card, i) => {
            card.style.animationDelay = (i * 0.08) + 's';
        });
    }

    async function renderFeaturedProducts() {
        const grid = document.getElementById('featuredProductsGrid');
        if (!grid) return;

        const products = (await getProducts()).map(normalizeProduct);

        if (!products.length) {
            grid.innerHTML = '<div class="empty-state"><p>Novidades chegando em breve!</p></div>';
            return;
        }

        const hotProducts = products.filter(p => p.isHot).slice(0, 4);
        const normalProducts = products.filter(p => !p.isHot).slice(0, 6);

        grid.innerHTML = '';
        hotProducts.forEach(p => grid.appendChild(createProductCard(p)));
        normalProducts.forEach(p => grid.appendChild(createProductCard(p)));
        animateCards(grid);
    }

    function renderCategoriesRow() {
        const container = document.getElementById('categoriesRow');
        if (!container) return;

        categories
            .filter(cat => cat.id !== 'all')
            .forEach(function (cat) {
                const item = document.createElement('a');
                item.className = 'category-item';
                item.href = 'loja.html?categoria=' + encodeURIComponent(cat.id);
                item.innerHTML = [
                    '<span class="category-icon-box">' + cat.svg + '</span>',
                    '<span class="category-label">' + escapeHtml(cat.name) + '</span>'
                ].join('');
                container.appendChild(item);
            });
    }

    function setupSearch() {
        const searchInput = document.getElementById('searchInput');
        const searchButton = document.getElementById('searchButton');
        if (!searchInput || !searchButton) return;

        function performSearch() {
            const term = searchInput.value.trim();
            window.location.href = term
                ? 'loja.html?busca=' + encodeURIComponent(term)
                : 'loja.html';
        }

        searchButton.addEventListener('click', performSearch);
        searchInput.addEventListener('keyup', function (e) {
            if (e.key === 'Enter') performSearch();
        });
    }

    function setupMobileMenu() {
        const menuBtn = document.getElementById('menuBtn');
        if (!menuBtn) return;

        const drawer = document.createElement('div');
        drawer.id = 'mobileMenuDrawer';
        Object.assign(drawer.style, {
            position: 'fixed',
            top: '0',
            left: '-100%',
            width: '80%',
            maxWidth: '280px',
            height: '100%',
            background: '#fff',
            boxShadow: '2px 0 12px rgba(0,0,0,0.15)',
            transition: 'left 0.3s ease',
            zIndex: '1000',
            padding: '56px 20px 20px',
            overflowY: 'auto',
            display: 'flex',
            flexDirection: 'column',
            gap: '16px'
        });
        drawer.innerHTML = [
            '<a href="index.html" class="mobile-menu-item">Início</a>',
            '<a href="loja.html" class="mobile-menu-item">Loja</a>'
        ].join('');
        document.body.appendChild(drawer);

        const overlay = document.createElement('div');
        overlay.id = 'mobileMenuOverlay';
        Object.assign(overlay.style, {
            position: 'fixed',
            top: '0',
            left: '0',
            width: '100%',
            height: '100%',
            background: 'rgba(0,0,0,0.4)',
            opacity: '0',
            visibility: 'hidden',
            transition: 'opacity 0.3s ease',
            zIndex: '999'
        });
        document.body.appendChild(overlay);

        overlay.addEventListener('click', function () {
            drawer.style.left = '-100%';
            overlay.style.opacity = '0';
            overlay.style.visibility = 'hidden';
        });

        menuBtn.addEventListener('click', function (e) {
            e.preventDefault();
            drawer.style.left = '0';
            overlay.style.opacity = '1';
            overlay.style.visibility = 'visible';
        });
    }

    function init() {
        renderFeaturedProducts();
        renderCategoriesRow();
        setupSearch();
        setupMobileMenu();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
