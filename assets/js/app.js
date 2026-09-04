/* ===== LÓGICA UNIFICADA - app.js (Camada 1 + Camada 2) ===== */
/*
 * Todos os eventos, renderização e filtros vivem aqui.
 */
(function () {
    'use strict';

    const data = window.ACHEI_E_POSTEI_DATA;
    if (!data) {
        console.error('[Achei e Postei] data.js não carregado.');
        return;
    }

    /* ============================================================
       UTILITÁRIOS
       ============================================================ */

    function getCategoryName(id) {
        const cat = data.categories.find(c => c.id === id);
        return cat ? cat.name : id;
    }

    function escapeHtml(str) {
        const div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    }

    /**
     * Cria um card de produto reutilizável.
     */
    function createProductCard(product) {
        const card = document.createElement('div');
        card.className = 'product-card';
        card.setAttribute('data-product', product.id);
        card.setAttribute('data-category', product.category);

        const discountBadge = product.discount
            ? `<div class="discount-badge">-${escapeHtml(product.discount.replace('-', ''))}</div>`
            : '';

        const productTitle = escapeHtml(product.title);
        const imgAlt = escapeHtml(product.title);
        const priceCurrent = escapeHtml(product.priceCurrent);
        const priceOld = product.priceOld ? escapeHtml(product.priceOld) : '';
        const affiliateUrl = escapeHtml(product.affiliateUrl);

        card.innerHTML = `
            ${discountBadge}
            <div class="product-image-wrap">
                <img src="${product.image}" alt="${imgAlt}" class="product-image" loading="lazy">
            </div>
            <div class="product-info">
                <h3 class="product-title">${productTitle}</h3>
                <div class="price-container">
                    <span class="price-current">${priceCurrent}</span>
                    <span class="price-old">${priceOld}</span>
                </div>
                <button class="cta-button primary" data-url="${affiliateUrl}">
                    Ir para a loja
                </button>
            </div>
        `;

        /* Fallback caso a imagem do produto não seja encontrada */
        const img = card.querySelector('.product-image');
        img.addEventListener('error', function () {
            this.closest('.product-image-wrap').innerHTML = data.uiIcons.shopping;
        });

        /* Botão de CTA abre link de afiliado em nova aba */
        const ctaButton = card.querySelector('.cta-button');
        ctaButton.addEventListener('click', function (e) {
            e.preventDefault();
            window.open(product.affiliateUrl, '_blank', 'noopener,noreferrer');
        });

        return card;
    }

    function animateCards(container) {
        const cards = container.querySelectorAll('.product-card');
        cards.forEach((card, i) => {
            card.style.animationDelay = `${i * 0.08}s`;
        });
    }

    /* ============================================================
       RENDER: INDEX PAGE (Camada 1)
       ============================================================ */

    function renderFeaturedProducts() {
        const grid = document.getElementById('featuredProductsGrid');
        if (!grid) return;

        data.featuredProducts.forEach(function (product) {
            grid.appendChild(createProductCard(product));
        });
        animateCards(grid);
    }

    function renderCategoriesRow() {
        const container = document.getElementById('categoriesRow');
        if (!container) return;

        data.categories
            .filter(cat => cat.id !== 'all')
            .forEach(function (cat) {
                const item = document.createElement('a');
                item.className = 'category-item';
                item.href = `loja.html?categoria=${encodeURIComponent(cat.id)}`;
                item.innerHTML = `
                    <span class="category-icon-box">${cat.svg}</span>
                    <span class="category-label">${escapeHtml(cat.name)}</span>
                `;
                container.appendChild(item);
            });
    }

    /* ============================================================
       RENDER: LOJA PAGE (Camada 2)
       ============================================================ */

    function renderAllProducts() {
        const grid = document.getElementById('productsGrid');
        if (!grid) return;
        grid.innerHTML = '';

        data.allProducts.forEach(function (product) {
            grid.appendChild(createProductCard(product));
        });
        animateCards(grid);
    }

    function renderProductList(products) {
        const grid = document.getElementById('productsGrid');
        if (!grid) return;
        grid.innerHTML = '';

        if (products.length === 0) {
            grid.innerHTML = `
                <div class="empty-state">
                    <div class="empty-icon">
                        <svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                            <circle cx="11" cy="11" r="8"/>
                            <line x1="21" y1="21" x2="21" y2="21"/>
                        </svg>
                    </div>
                    <p>Nenhum achado encontrado. Tente outro termo ou categoria.</p>
                </div>
            `;
            return;
        }

        products.forEach(function (product) {
            grid.appendChild(createProductCard(product));
        });
        animateCards(grid);
    }

    /* ============================================================
       FILTROS DE CATEGORIA
       ============================================================ */

    function setupCategoryFilters() {
        const container = document.getElementById('categoryFilters');
        if (!container) return;

        container.innerHTML = '';

        const params = new URLSearchParams(window.location.search);
        const initialCategory = params.get('categoria') || 'all';

        data.categories.forEach(function (cat) {
            const btn = document.createElement('button');
            btn.className = 'filter-btn';
            btn.setAttribute('data-filter', cat.id);
            btn.innerHTML = `${cat.svg} <span>${escapeHtml(cat.name)}</span>`;

            if (cat.id === initialCategory) {
                btn.classList.add('active');
            }

            btn.addEventListener('click', function () {
                const activeBtn = container.querySelector('.filter-btn.active');
                if (activeBtn) {
                    activeBtn.classList.remove('active');
                }
                this.classList.add('active');
                filterProducts(cat.id);
            });

            container.appendChild(btn);
        });

        filterProducts(initialCategory);
    }

    function filterProducts(categoryId) {
        let products = data.allProducts;

        if (categoryId !== 'all') {
            products = products.filter(function (p) {
                return p.category === categoryId;
            });
        }

        renderProductList(products);
    }

    /* ============================================================
       BUSCA
       ============================================================ */

    function setupSearch() {
        const searchInput = document.getElementById('searchInput');
        const searchButton = document.getElementById('searchButton');
        if (!searchInput || !searchButton) return;

        const isLoja = !!document.getElementById('categoryFilters');

        searchButton.addEventListener('click', performSearch);
        searchInput.addEventListener('keyup', function (e) {
            if (e.key === 'Enter') {
                performSearch();
            }
        });

        function performSearch() {
            const term = searchInput.value.trim().toLowerCase();

            if (!isLoja) {
                /* Na home, a busca leva o usuário para a loja já filtrada */
                if (term) {
                    window.location.href = `loja.html?busca=${encodeURIComponent(term)}`;
                } else {
                    window.location.href = 'loja.html';
                }
                return;
            }

            if (!term) {
                renderAllProducts();
                return;
            }

            const results = data.allProducts.filter(function (p) {
                return (
                    p.title.toLowerCase().includes(term) ||
                    getCategoryName(p.category).toLowerCase().includes(term) ||
                    p.category.toLowerCase().includes(term)
                );
            });

            renderProductList(results);
        }

        /* Se chegou na loja com ?busca=..., já aplica o termo */
        const params = new URLSearchParams(window.location.search);
        const preSearch = params.get('busca');
        if (isLoja && preSearch) {
            searchInput.value = preSearch;
            performSearch();
        }
    }

    /* ============================================================
       INICIALIZAÇÃO
       ============================================================ */

    document.addEventListener('DOMContentLoaded', function () {
        const isIndex = !!document.getElementById('featuredProductsGrid');
        const isLoja = !!document.getElementById('categoryFilters');

        if (isIndex) {
            renderFeaturedProducts();
            renderCategoriesRow();
        }

        if (isLoja) {
            renderAllProducts();
            setupCategoryFilters();
        }

        setupSearch();

        /* Analytics simples de clique em produtos */
        document.addEventListener('click', function (e) {
            const ctaBtn = e.target.closest('.cta-button');
            if (ctaBtn) {
                const card = ctaBtn.closest('.product-card');
                const productId = card ? card.dataset.product : 'unknown';
                console.log('[Achei e Postei] Clique no produto ID:', productId);
            }
        });
    });
})();
