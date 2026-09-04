/* ===== DADOS UNIFICADOS DOS PRODUTOS ===== */
/*
 * Base de dados unificada para todas as páginas.
 * - featuredProducts: produtos em destaque (Camada 1 - index.html)
 * - allProducts: catálogo completo (Camada 2 - loja.html)
 * - categories: definições de categoria com ícones SVG (sem emojis)
 *
 * Para adicionar um produto novo, copie um objeto dentro de allProducts
 * (e de featuredProducts, se ele também deve aparecer na home) e troque
 * os valores. O campo "image" aceita qualquer caminho dentro de assets/img/.
 */
window.ACHEI_E_POSTEI_DATA = {
    author: {
        name: "Achei e Postei",
        bio: "Curadoria de achados que valem a pena",
        avatar: "assets/img/avatar.png"
    },

    /* --- Produtos em destaque (Camada 1 - home) --- */
    featuredProducts: [
        {
            id: 1,
            title: "Power Bank 20000mAh Carregamento Rápido",
            category: "eletronicos",
            priceCurrent: "R$ 00,00",
            priceOld: "R$ 00,00",
            discount: "0%",
            image: "assets/img/powerbank.jpg",
            affiliateUrl: "https://shopee.com.br/SUBSTITUIR-LINK-AFILIADO",
            isHot: true
        }
    ],

    /* --- Todos os produtos da loja (Camada 2) --- */
    allProducts: [
        { id: 1, title: "Power Bank 20000mAh Carregamento Rápido", category: "eletronicos", priceCurrent: "R$ 00,00", priceOld: "R$ 00,00", discount: "0%", image: "assets/img/powerbank.jpg", affiliateUrl: "https://shopee.com.br/SUBSTITUIR-LINK-AFILIADO" }
    ],

    /* --- Categorias com ícones SVG profissionais (sem emojis) --- */
    categories: [
        { id: "all", name: "Todos", svg: '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12l2-2v8a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V10l2-2M5 12V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v7"/></svg>' },
        { id: "eletronicos", name: "Eletrônicos", svg: '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="12" rx="1.5"/><line x1="8" y1="20" x2="16" y2="20"/><line x1="12" y1="16" x2="12" y2="20"/></svg>' },
        { id: "beleza", name: "Beleza", svg: '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8 3h3v4H8z"/><path d="M8.5 7h2a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2h-2a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2z"/><path d="M15 12h3v9h-3z"/><path d="M15.5 12v-3a2 2 0 0 1 2-2h0a2 2 0 0 1 2 2v3"/></svg>' },
        { id: "casa", name: "Casa", svg: '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 11v8a1 1 0 0 0 1 1h3v-6h6v6h3a1 1 0 0 0 1-1v-8"/><path d="M5 11l7-6 7 6"/></svg>' },
        { id: "moda", name: "Moda", svg: '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 4 5 6.5 3 10l3 2v9h12v-9l3-2-2-3.5L16 4c0 1.5-1.5 3-4 3S9 5.5 9 4z"/></svg>' },
        { id: "esportes", name: "Esportes", svg: '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6.5 6.5 2 11l11 11 4.5-4.5"/><path d="M17.5 6.5 22 11l-2.3 2.3"/><path d="M4.5 8.5l2-2M15.5 19.5l2-2"/><path d="M8 12l4 4"/></svg>' },
        { id: "games", name: "Games", svg: '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="8" width="20" height="10" rx="5"/><line x1="7" y1="11" x2="7" y2="15"/><line x1="5" y1="13" x2="9" y2="13"/><circle cx="16" cy="12" r="1"/><circle cx="18.5" cy="14.5" r="1"/></svg>' }
    ],

    /* --- Ícones SVG para elementos UI (sem emojis) --- */
    uiIcons: {
        shopping: '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12l2-2v8a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V10l2-2M5 12V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v7"/></svg>',
        search: '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>',
        back: '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/></svg>',
        home: '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/></svg>',
        star: '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7.91 15.14 4 9.27z"/></svg>',
        fire: '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8.5 14.5A2.5 2.5 0 0 1 10 12c0-1.5-.5-3-1.4-4.2.8-.4 1.7-.6 2.6-.6 3.2 0 5.8 2.2 6.5 5.2A3.5 3.5 0 0 1 16.5 18c-1.7 0-3.2-.9-4-2.3"/></svg>',
        shopee: '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 11.5a10 10 0 1 1 6.2 9.1 3.5 3.5 0 0 0-5.2-4.2A3.5 3.5 0 0 1 5 8.5a3.5 3.5 0 1 1 6.9 1.3V14a3.5 3.5 0 1 1-3.5 3.5H13a3.5 3.5 0 0 0 0-7V4.5a3.5 3.5 0 0 0-7 0v8a1.5 1.5 0 0 0 1.5 1.5z"/><path d="M14 14l3.5-3.5M20 10V8a2 2 0 1 0-4 0v2M15 15l5 5"/></svg>'
    }
};
