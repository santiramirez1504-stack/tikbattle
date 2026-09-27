// Funciones comunes del login y del dashboard: guardar la sesión y hablar con la API.
const TOKEN_KEY = 'tikbattle_token';

function getToken() {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch (error) {
    return null;
  }
}

function saveToken(token) {
  try {
    localStorage.setItem(TOKEN_KEY, token);
  } catch (error) {
    // Si el navegador bloquea el almacenamiento, la sesión solo dura mientras la página esté abierta
  }
}

function clearToken() {
  try {
    localStorage.removeItem(TOKEN_KEY);
  } catch (error) {
    // nada que borrar
  }
}

// Hace una petición a la API: añade el token, envía/recibe JSON
// y, si algo falla, lanza un Error con el mensaje que envió el servidor.
async function apiRequest(method, path, body) {
  const headers = {};
  const token = getToken();
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }
  if (body !== undefined) {
    headers['Content-Type'] = 'application/json';
  }

  const response = await fetch(path, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    const error = new Error(data.error || `Error ${response.status}`);
    error.status = response.status;
    throw error;
  }
  return data;
}
