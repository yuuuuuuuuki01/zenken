const API_BASE = window.location.origin;

// Force stateless: Clear old SPA tokens to prevent redirect loops or bugs
if (localStorage.getItem('giga_client_token')) {
    localStorage.removeItem('giga_client_token');
}

// Elements
const tabLogin = document.getElementById('tab-login');
const tabRegister = document.getElementById('tab-register');
const formLogin = document.getElementById('form-login');
const formRegister = document.getElementById('form-register');
const registerBtn = document.getElementById('register-btn');
const authMsg = document.getElementById('auth-msg');

// Parse URL for server-side errors
const urlParams = new URLSearchParams(window.location.search);
const authError = urlParams.get('error');
const authSuccess = urlParams.get('msg');
if (authError === 'invalid_credentials') authMsg.textContent = 'メールアドレスまたはパスワードが正しくありません。';
if (authError === 'no_api_key_found') authMsg.textContent = 'APIキーが見つかりません。サポートへご連絡ください。';
if (authError === 'server_error') authMsg.textContent = 'サーバーエラーが発生しました。';
if (authSuccess === 'registered') {
    authMsg.style.color = '#00ff7f';
    authMsg.textContent = 'アカウントを作成しました。ログインしてください。';
}

// Tab Switching
tabLogin.addEventListener('click', () => {
    tabLogin.style.borderBottomColor = 'var(--accent-client)';
    tabLogin.style.color = 'var(--accent-client)';
    tabRegister.style.borderBottomColor = 'transparent';
    tabRegister.style.color = 'var(--text-muted)';
    formLogin.style.display = 'block';
    formRegister.style.display = 'none';
    authMsg.textContent = '';
});

tabRegister.addEventListener('click', () => {
    tabRegister.style.borderBottomColor = 'var(--accent-client)';
    tabRegister.style.color = 'var(--accent-client)';
    tabLogin.style.borderBottomColor = 'transparent';
    tabLogin.style.color = 'var(--text-muted)';
    formRegister.style.display = 'block';
    formLogin.style.display = 'none';
    authMsg.textContent = '';
});

// Standard form submission handles login, so JS interception is removed.

// Register
registerBtn.addEventListener('click', async () => {
    const email = document.getElementById('reg-email').value;
    const password = document.getElementById('reg-password').value;
    const name = document.getElementById('reg-name').value;
    const consent = document.getElementById('reg-terms-consent').checked;

    if (!consent) return authMsg.textContent = 'You must agree to the terms to proceed.';
    if (!email || !password || !name) return authMsg.textContent = 'Please fill all fields.';

    const btn = registerBtn;
    btn.textContent = 'CREATING...';
    btn.disabled = true;

    try {
        const res = await fetch(`${API_BASE}/auth/register`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, password, name })
        });
        const data = await res.json();
        if (res.ok && data.token) {
            // Registration successful. Clear any token and redirect to login state.
            localStorage.removeItem('giga_client_token');
            window.location.href = '/client-portal/index.html?msg=registered';
        } else {
            authMsg.textContent = data.error || 'Registration failed';
            btn.textContent = 'CREATE ACCOUNT';
            btn.disabled = false;
        }
    } catch (e) {
        authMsg.textContent = 'Network error';
        btn.textContent = 'CREATE ACCOUNT';
        btn.disabled = false;
    }
});
