const loginForm = document.getElementById('login-form');
const registerForm = document.getElementById('register-form');
const tabLogin = document.getElementById('tab-login');
const tabRegister = document.getElementById('tab-register');
const errorEl = document.getElementById('auth-error');

function showTab(isLogin) {
  tabLogin.classList.toggle('active', isLogin);
  tabRegister.classList.toggle('active', !isLogin);
  loginForm.hidden = !isLogin;
  registerForm.hidden = isLogin;
  errorEl.textContent = '';
}

tabLogin.addEventListener('click', () => showTab(true));
tabRegister.addEventListener('click', () => showTab(false));

// Envía el formulario a la API; si todo va bien guarda el token y abre el dashboard
async function submitAuth(form, path, body) {
  const button = form.querySelector('button[type="submit"]');
  button.disabled = true;
  errorEl.textContent = '';

  try {
    const { token } = await apiRequest('POST', path, body);
    saveToken(token);
    window.location.href = '/dashboard/';
  } catch (error) {
    errorEl.textContent = error.message;
    button.disabled = false;
  }
}

loginForm.addEventListener('submit', (event) => {
  event.preventDefault(); // evita que el navegador recargue la página
  submitAuth(loginForm, '/api/auth/login', {
    email: document.getElementById('login-email').value,
    password: document.getElementById('login-password').value,
  });
});

registerForm.addEventListener('submit', (event) => {
  event.preventDefault();
  submitAuth(registerForm, '/api/auth/register', {
    name: document.getElementById('register-name').value,
    email: document.getElementById('register-email').value,
    password: document.getElementById('register-password').value,
  });
});

// Si un administrador cerró el registro, la pestaña "Crear cuenta" se desactiva
apiRequest('GET', '/api/settings/public')
  .then(({ registrationsOpen }) => {
    if (!registrationsOpen) {
      tabRegister.disabled = true;
      tabRegister.title = 'El registro de cuentas nuevas está cerrado por ahora';
      tabRegister.textContent = 'Registro cerrado';
    }
  })
  .catch(() => {});

// Si ya hay una sesión válida, ir directo al dashboard
if (getToken()) {
  apiRequest('GET', '/api/auth/me')
    .then(() => { window.location.href = '/dashboard/'; })
    .catch(() => clearToken());
}
