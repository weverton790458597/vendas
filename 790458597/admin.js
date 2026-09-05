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

    function getClient() {
        return new Promise((resolve, reject) => {
            // supabase.min.js agora é servido localmente (assets/js/supabase.min.js)
            // e carregado via <script> antes deste arquivo no admin.html, então
            // window.supabase já deve estar disponível de imediato — sem precisar
            // de CDN externo nem de timeout de rede.
            const client = initSupabase();
            if (client) resolve(client);
            else reject(new Error('Biblioteca do Supabase não encontrada. Verifique se assets/js/supabase.min.js está incluído antes de admin.js no admin.html.'));
        });
    }

    function escapeHtml(str) {
        const div = document.createElement('div');
        div.textContent = str == null ? '' : String(str);
        return div.innerHTML;
    }

    function showLock(title, msg) {
        const lock = document.getElementById('adminLockScreen');
        const content = document.getElementById('adminContent');
        if (!lock) return;
        lock.style.display = 'flex';
        if (content) content.style.display = 'none';

        const titleEl = lock.querySelector('h2');
        const msgEl = document.getElementById('lockMessage');
        if (titleEl) titleEl.textContent = title;
        if (msgEl) msgEl.textContent = msg;
    }

    async function checkAdminSession() {
        try {
            const client = await getClient();

            const getUserPromise = client.auth.getUser();
            const timeoutPromise = new Promise((_, reject) =>
                setTimeout(() => reject(new Error('Tempo de conexão esgotado.')), 10000)
            );

            const { data: { user }, error } = await Promise.race([getUserPromise, timeoutPromise]);

            if (error || !user) {
                showLock('Acesso Restrito', 'Faça login para continuar.');
                return false;
            }

            const lock = document.getElementById('adminLockScreen');
            const content = document.getElementById('adminContent');
            if (lock) lock.style.display = 'none';
            if (content) content.style.display = 'block';

            updateUserInfo(user);
            await loadProducts();
            return true;
        } catch (err) {
            console.error('[Admin] checkAdminSession falhou:', err);
            showLock('Erro de Conexão', (err && err.message) ? err.message : 'Não foi possível conectar ao Supabase.');
            return false;
        }
    }

    async function adminLoginSubmit(e) {
        e.preventDefault();
        const emailInput = document.getElementById('adminEmailInput');
        const passwordInput = document.getElementById('adminPasswordInput');
        const errorEl = document.getElementById('loginErrorMsg');

        if (!emailInput || !passwordInput || !errorEl) return;

        const email = emailInput.value.trim();
        const password = passwordInput.value.trim();

        errorEl.style.color = '#666';
        errorEl.textContent = 'Autenticando...';

        try {
            const client = await getClient();

            const authPromise = client.auth.signInWithPassword({ email, password });
            const timeoutPromise = new Promise((_, reject) =>
                setTimeout(() => reject(new Error('Tempo de conexão esgotado.')), 10000)
            );

            const { error } = await Promise.race([authPromise, timeoutPromise]);

            if (error) {
                errorEl.style.color = '#ff4d4d';
                errorEl.textContent = error.message;
                return;
            }

            errorEl.textContent = '';
            await checkAdminSession();
        } catch (err) {
            errorEl.style.color = '#ff4d4d';
            errorEl.textContent = err.message || 'Erro ao conectar ao Supabase.';
        }
    }

    async function adminLogout() {
        try {
            const client = await getClient();
            await client.auth.signOut();
            location.reload();
        } catch {
            location.reload();
        }
    }

    function updateUserInfo(user) {
        const el = document.getElementById('adminUserInfo');
        if (el && user) {
            el.innerHTML =
                '<img src="assets/img/avatar.png" alt="avatar" width="32" height="32" style="border-radius:50%">' +
                '<span>' + escapeHtml(user.email || '') + '</span>' +
                '<button class="logout-btn" onclick="window.adminLogout()">Sair</button>';
        }
    }

    async function loadProducts() {
        const grid = document.getElementById('productsGrid');
        if (!grid) return;

        grid.innerHTML = '<div class="admin-message loading">Carregando produtos...</div>';

        try {
            const client = await getClient();
            const { data, error } = await client
                .from('products')
                .select('*')
                .order('created_at', { ascending: false });

            if (error) throw error;

            if (!data || data.length === 0) {
                grid.innerHTML = '<div class="admin-message" style="color:var(--text-secondary);">Nenhum produto cadastrado ainda.</div>';
                return;
            }

            grid.innerHTML = '<table class="admin-table">' +
                '<thead><tr><th>#</th><th>Produto</th><th>Categoria</th><th>Preço</th><th>Status</th><th width="120">Ações</th></tr></thead>' +
                '<tbody>' +
                data.map((p, i) => {
                    const id = escapeHtml(p.id);
                    const title = escapeHtml(p.title || '');
                    const category = escapeHtml(p.category || '');
                    const price = escapeHtml(p.price_current || '');
                    const image = escapeHtml(p.image || '');
                    const isHot = !!p.is_hot;

                    return '<tr data-id="' + id + '">' +
                        '<td>' + (i + 1) + '</td>' +
                        '<td style="display:flex;align-items:center;gap:8px;">' +
                            '<img src="' + image + '" alt="' + title + '" class="product-thumb" onerror="this.src=\'assets/img/avatar.png\'">' +
                            title +
                        '</td>' +
                        '<td>' + category + '</td>' +
                        '<td>' + price + '</td>' +
                        '<td><span class="status-badge ' + (isHot ? 'hot' : 'normal') + '">' + (isHot ? 'Destaque' : 'Normal') + '</span></td>' +
                        '<td>' +
                            '<button class="btn-admin btn-admin-secondary" style="font-size:0.72rem;padding:4px 8px;" onclick="window.deleteProduct(' + id + ')">Excluir</button>' +
                        '</td>' +
                    '</tr>';
                }).join('') +
                '</tbody>' +
                '</table>';
        } catch (err) {
            grid.innerHTML = '<div class="admin-message" style="color:#EF4444;">Erro ao carregar produtos: ' + escapeHtml(err.message || '') + '</div>';
        }
    }

    window.deleteProduct = async function (id) {
        if (!confirm('Deseja excluir este produto?')) return;
        try {
            const client = await getClient();
            const { error } = await client.from('products').delete().eq('id', id);
            if (error) {
                alert('Erro: ' + error.message);
                return;
            }
            alert('Produto excluído!');
            loadProducts();
        } catch (e) {
            alert('Erro: ' + e.message);
        }
    };

    async function submitProductForm(e) {
        e.preventDefault();
        const form = e.target;
        const msgEl = document.getElementById('formMessage');

        const product = {
            title: form.title.value.trim(),
            price_current: form.price.value.trim(),
            price_old: form.priceOld.value.trim() || null,
            discount: form.discount.value.trim() || null,
            image: form.image.value.trim(),
            affiliate_url: form.affiliateUrl.value.trim(),
            category: form.category.value.trim() || 'outros',
            is_hot: form.isHot.checked,
            created_at: new Date().toISOString()
        };

        msgEl.innerHTML = '<div class="admin-message loading">Salvando produto...</div>';

        try {
            const client = await getClient();
            const { error } = await client.from('products').insert([product]);

            if (error) throw error;

            msgEl.innerHTML = '<div class="admin-message success">Produto salvo com sucesso!</div>';
            form.reset();
            setTimeout(loadProducts, 1000);
        } catch (err) {
            msgEl.innerHTML = '<div class="admin-message error">Erro: ' + escapeHtml(err.message || '') + '</div>';
        }
    }

    function initAdmin() {
        const loginForm = document.getElementById('adminLoginForm');
        if (loginForm) loginForm.addEventListener('submit', adminLoginSubmit);

        const form = document.getElementById('productForm');
        if (form) form.addEventListener('submit', submitProductForm);

        checkAdminSession();
    }

    window.adminLogout = adminLogout;

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initAdmin);
    } else {
        initAdmin();
    }
})();
