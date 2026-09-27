# TikBattle Games

Plataforma para streamers de TikTok LIVE: los comentarios y regalos del LIVE mueven un juego que aparece como overlay en TikTok LIVE Studio (también funciona en OBS/Streamlabs).

Primer juego: **Batalla de Países**. Los espectadores escriben el nombre de un país en el chat para darle puntos, y los regalos suman más.

## Estado del proyecto (27/09/2026)

| Módulo | Estado |
|---|---|
| 1. Servidor Node.js + Express | ✅ |
| 2. Motor del juego (GameEngine) | ✅ |
| 3. Comentarios (ChatProcessor) | ✅ |
| 4. Regalos (GiftProcessor) | ✅ |
| 5. Temporizador y resultado (ganador / empate) | ✅ |
| 6. API de simulación | ✅ |
| 7. Tiempo real (Socket.IO) | ✅ |
| 8. Overlay visual | ✅ |
| 9. Conexión con TikTok LIVE real | ✅ |
| 10. Usuarios: registro, login, JWT (MongoDB Atlas) | ✅ |
| 11. Dashboard del streamer | ✅ |
| 12. Persistencia en MongoDB (configuración, partidas, historial) | ✅ |
| 13. Prueba en TikTok LIVE Studio | ✅ |
| 15. Panel de administrador | ✅ Entregado (pendiente de tu confirmación) |
| 16. Producción | ✅ Publicado en Render (https://tikbattle-aecz.onrender.com), probado en TikTok LIVE Studio y con prueba de carga (pendiente de tu confirmación) |
| 14. Planes FREE / PRO | Pendiente (se hará al final, por decisión del proyecto) |

## Cómo arrancar el servidor

Desde la carpeta `tiktok-battle/backend`:

```bash
npm install   # solo la primera vez o si cambian las dependencias
npm start
```

Debe aparecer:

```
Modo simulación ACTIVADO
[DB] Conectado a MongoDB (base de datos: tikbattle)
Servidor escuchando en http://localhost:3000
```

- **Dashboard del streamer:** http://localhost:3000/ (lleva a `/dashboard/`, o a `/login/` si no hay sesión)
- Overlay (para TikTok LIVE Studio): **cada streamer tiene su propia URL**, con una clave secreta. Se copia desde la tarjeta "Overlay para TikTok LIVE Studio" del dashboard.
- Comprobar que el servidor vive: http://localhost:3000/api/health
- Pruebas de la API: importa `docs/TikBattle.postman_collection.json` en Postman.
  - Haz primero **B. Login**. El token se guarda solo.
  - Luego **7. Reiniciar** y **1. Iniciar** para empezar una partida.
  - Todas las peticiones actúan sobre **tu sala** (la de la cuenta con la que hiciste login).

Usa `npm start` para probar el juego. `npm run dev` puede reiniciarse solo (el proyecto está en OneDrive) y se perdería la partida en curso.

## Usar el overlay en TikTok LIVE Studio

⚠️ **TikTok LIVE Studio solo acepta direcciones `https://`**: rechaza `http://localhost`. Mientras no tengamos dominio propio (Módulo 16), se usa un **túnel de Cloudflare** que da una dirección `https` hacia tu PC.

1. Arranca el servidor (`npm start` en `tiktok-battle/backend`). **Tiene que estar encendido durante todo el LIVE.**
2. En otra terminal, abre el túnel y **déjalo abierto** durante el LIVE:
   ```bash
   "/c/Program Files (x86)/cloudflared/cloudflared.exe" tunnel --url http://localhost:3000
   ```
   Busca en lo que aparece una línea con `https://algo.trycloudflare.com`.
3. Si esa dirección es distinta de la que tienes en `PUBLIC_URL` del `.env` (cambia cada vez que abres el túnel), cámbiala allí y reinicia el servidor.
4. En el dashboard, tarjeta **"Overlay para TikTok LIVE Studio"**, pulsa **Copiar**. La URL ya empieza por `https://…trycloudflare.com`.
5. En TikTok LIVE Studio: **Agregar fuente → Enlace** y pega la URL.
6. Tamaño de la fuente: **1080 × 760** (el ancho real del lienzo vertical de TikTok; el panel es **horizontal**: marcador a la izquierda, actividad y regalos a la derecha). Con más de 5 países el panel crece hacia abajo: usa **1080 × 1280**. Así el overlay se dibuja a resolución completa y se ve nítido. El panel **se ajusta solo** al tamaño y nunca se corta. Si la fuente tiene opciones de ancho/alto, ponlas ahí en lugar de estirarla arrastrando las esquinas (estirar la imagen la vuelve borrosa).
7. El fondo es transparente: solo se ve el panel encima de tu cámara.
8. Si cambias algo del overlay y no se ve, recarga la fuente en LIVE Studio (clic derecho → actualizar, o quítala y vuelve a agregarla).

## Panel de administrador

- Dirección: http://localhost:3000/admin/ (o el enlace **"Panel de administrador"** del dashboard, que solo ven los administradores).
- Permite ver **estadísticas**, **salas en vivo** (se actualizan cada 5 s), **usuarios** (buscar, bloquear/desbloquear, dar/quitar rol de administrador), las **últimas partidas** de todos los streamers y la **configuración global** (aviso para todos los dashboards y abrir/cerrar el registro).
- El primer administrador se crea desde la terminal (en `tiktok-battle/backend`):
  ```bash
  npm run make-admin -- email@ejemplo.com
  ```
  Después, un administrador puede nombrar a otros desde el panel. Nadie puede cambiar su propio rol ni bloquearse a sí mismo.
- Al **bloquear** a un streamer: no puede iniciar sesión, sus sesiones abiertas dejan de funcionar y se detienen su partida y su conexión con TikTok.

## Configuración (`backend/.env`)

El archivo `.env` **no se sube a Git**, porque contiene secretos. Usa `.env.example` como plantilla.

| Variable | Para qué sirve |
|---|---|
| `PORT` | Puerto del servidor (3000) |
| `GAME_DURATION_SECONDS` | Duración por defecto (300 = 5 min) para quien todavía no guardó su configuración. Cada streamer la cambia desde el dashboard |
| `SIMULATION_MODE` | `true` activa `/api/simulation` (solo desarrollo, **nunca** en producción) |
| `EULER_API_KEY` | (Opcional) Aumenta el límite de conexiones a TikTok |
| `MONGODB_URI` | Conexión a MongoDB Atlas (**secreto**) |
| `JWT_SECRET` | Firma de los tokens de sesión (**secreto**) |
| `JWT_EXPIRES_IN` | Duración de la sesión (7d) |
| `DNS_SERVERS` | DNS para encontrar Atlas si aparece `querySrv ECONNREFUSED` |
| `PUBLIC_URL` | Dirección pública **https** del servidor (túnel de Cloudflare en desarrollo, dominio en producción). Se usa para la URL del overlay |
| `ROOM_IDLE_MINUTES` | (Opcional) Minutos sin uso tras los que una sala se libera de la memoria (10) |
| `NODE_ENV` | `production` en el servidor (lo pone `docker-compose.yml`). Activa las comprobaciones de seguridad y HSTS |
| `TRUST_PROXY` | Intermediarios delante del servidor: `3` en Render (Cloudflare + 2 de Render, verificado) · `1` = solo Caddy · `2` = Cloudflare + Caddy · vacío en desarrollo |
| `SNAPSHOT_INTERVAL_SECONDS` | Cada cuántos segundos se guarda la partida en curso (10) |
| `BACKUP_DIR` / `BACKUP_KEEP` | Carpeta de las copias de seguridad y cuántas se guardan (7) |

## Pruebas por módulo

Desde `tiktok-battle/backend`:

```bash
npm run test:module2   # GameEngine
npm run test:module3   # comentarios
npm run test:module4   # regalos
npm run test:module5   # temporizador (dura ~35 s)
npm run test:module8 -- tu_email tu_contraseña   # simula chat en vivo en tu sala (servidor encendido y partida iniciada)
npm run test:module9   # TikTok sin conexión real
npm run test:reconnect # reconexión automática a TikTok (con una conexión falsa)
npm run test:load -- --rooms 25 --rate 3 --seconds 30   # prueba de carga (servidor y base de datos aparte)
```

## Producción (Módulo 16)

Plan actual: **todo gratis** para empezar, y preparado para pasar más adelante a un **VPS de Hostinger** (o cualquier otro) sin cambiar el código.

| Pieza | Gratis ahora | Más adelante (de pago) |
|---|---|---|
| Servidor | **Render**, plan gratis (usa nuestro `Dockerfile`; se mantiene despierto con UptimeRobot) | VPS de Hostinger u Oracle Cloud, con `docker-compose.yml` + Caddy |
| Dirección y https | La que da Render (ej. `https://tikbattle.onrender.com`), fija | Dominio propio (ej. `tikbattle.com`), con Cloudflare delante |
| Base de datos | MongoDB Atlas M0. Producción usa la base `tikbattle`; tu PC usa `tikbattle_dev` | Atlas M10 (con copias automáticas) |
| Copias de seguridad | GitHub Actions cada día (`.github/workflows/backup.yml`), guardadas 14 días | Igual, o las de Atlas M10 |
| Firma de TikTok | Euler Stream, plan gratis con clave (2.500 conexiones/día) | Plan Business (10.000/día) |
| Errores y caídas | Sentry + UptimeRobot (planes gratis) | Igual |

### Qué ya está preparado en el código

- **Render**: `render.yaml` define el servicio (Docker, plan gratis, `/api/health`, variables). Los secretos no están en el archivo: `JWT_SECRET` la genera Render y `MONGODB_URI`, `EULER_API_KEY` y `PUBLIC_URL` se escriben en Render.
- **Docker**: `Dockerfile` (lo usa Render) + `docker-compose.yml` y `Caddyfile` (para un VPS propio más adelante: Oracle, Hostinger...).
- **Dos bases de datos**: `tikbattle` (producción) y `tikbattle_dev` (tu PC). Así el servidor de tu PC y el de Render nunca se pisan las partidas ni se conectan dos veces al mismo LIVE.
- **Seguridad**: cabeceras con `helmet` (política de contenido estricta, HSTS en producción), la app no se expone a internet (solo Caddy), el contenedor no corre como administrador. Con `NODE_ENV=production` el servidor **no arranca** si `SIMULATION_MODE=true`, si `JWT_SECRET` tiene menos de 32 caracteres o si `PUBLIC_URL` no es https.
- **Menos tráfico con la base de datos** (clave en el plan gratis de Atlas): la partida en curso se guarda cada 10 s y sin las fotos de perfil. Con 100 espectadores: de ~77 MB/hora a ~4,6 MB/hora (17 veces menos). Solo se guarda cuando cambia algo.
- **Estado del servidor**: `/api/health` responde `200` con `{"status":"ok","database":"conectada"}`, o `503` si se pierde la base de datos. Lo usan Docker y UptimeRobot.
- **Errores inesperados**: se registran; si son graves, se guardan las salas y Docker vuelve a arrancar el servidor solo.
- **Registros (logs)**: rotan solos (máx. 5 archivos de 10 MB). Verlos: `docker compose logs -f app`.
- **Copias de seguridad**: `npm run backup` guarda toda la base de datos en `backups/` (se quedan las 7 últimas). Restaurar: `npm run restore -- backups/archivo.json.gz --confirm`.

### Prueba de carga (27/09/2026)

`npm run test:load -- --rooms 25 --rate 3 --seconds 30` arranca un servidor aparte (puerto 3999, base de datos `tikbattle_loadtest` que se borra al final), crea streamers de prueba con overlay y dashboard conectados, y les envía comentarios (y un regalo cada 5 s) a la vez.

Resultados en el PC de desarrollo, con 0 errores en todas las pruebas:

| Streamers a la vez | Comentarios/s por LIVE | CPU (% de 1 núcleo) | Memoria | Retraso hasta el overlay (mediana / p95) |
|---|---|---|---|---|
| 25 | 0 (solo salas abiertas) | 3 % | ~95 MB | — |
| 25 | 3 | 28 % | ~180 MB | 42 ms / 124 ms |
| 50 | 3 | 41 % | ~200 MB | 64 ms / 163 ms |
| 50 | 6 | 66 % | ~205 MB | 47 ms / 486 ms |

Cada comentario cuesta unos **2–3 ms de CPU** (en la prueba entra por HTTP con login y consulta a la base de datos; con TikTok real no hay ese paso, pero TikTok envía también "me gusta", entradas, etc., así que se toma como estimación prudente). Cada sala abierta sin comentarios cuesta ~0,1 % de CPU y unos 2 MB de memoria: **la memoria no es el límite, lo es la CPU**.

**Capacidad estimada** (usando como máximo ~70 % de la CPU del plan):

| Plan | CPU | LIVEs a la vez con ~3 comentarios/s cada uno |
|---|---|---|
| Render Free | 0,1 | **~5–10** |
| Render Starter (7 USD/mes) | 0,5 | ~25–45 |
| VPS con 1 núcleo completo (Hostinger, Oracle...) | 1 | ~50–90 |

Si se pasa del límite, el servidor no se cae: los puntos llegan al overlay con más retraso. UptimeRobot y el retraso visible serán la señal para subir de plan.

### Pasar de Render a Hostinger (u Oracle) más adelante

1. Contratar un **VPS** de Hostinger (no el hosting compartido: la app necesita un servidor siempre encendido con conexiones en tiempo real).
2. Instalar Docker y copiar el proyecto, `backend/.env` y `.env` (con `DOMAIN`), igual que en Oracle.
3. Apuntar el dominio a la IP del nuevo servidor y ejecutar `docker compose up -d --build`.
4. En Atlas, permitir la IP del nuevo servidor. El overlay no cambia de URL si el dominio es el mismo.

## Pendientes

### ✅ Completados (ya no están pendientes)

- **Overlay más vistoso e interactivo:**
  - **Banderas** de cada país (SVG del paquete flag-icons, servidas por nuestro servidor en /flags). En el dashboard se eligen con un desplegable y se adivinan solas a partir del nombre.
  - **Feed de actividad** ("juan se unió a Cuba", "maria envió Rosa → +50"), **alerta grande de regalo** con su imagen, **MVP** de cada país con su **foto de perfil de TikTok**, **+N flotantes**, aviso **"¡X toma el liderato!"**, **cuenta atrás grande** de los últimos 10 s, **pantalla de ganador** con bandera, confeti y **podio de los 3 espectadores** que más aportaron (con su foto), y **pantalla de espera** con qué escribir y cuánto vale cada regalo.
  - Las fotos de perfil se muestran directamente desde TikTok (solo direcciones `https://`); si no hay foto o no carga, se ve la inicial. No se guardan en MongoDB (las direcciones de TikTok caducan y ocupan mucho): tras un reinicio del servidor, cada foto vuelve con el siguiente comentario de ese espectador. En el simulador se puede probar enviando `"avatarUrl": "https://..."` (opcional).
  - En un LIVE grande, el feed muestra como mucho 4 "se unió" por segundo para no saturar la pantalla (los regalos se muestran siempre).

- **Las salas sin uso se liberan de la memoria:**
  - Cada minuto se revisan las salas. Se libera la que no tiene partida en curso, ni TikTok conectado, ni navegadores abiertos, ni reinicio automático pendiente, y lleva 10 minutos sin usarse (`ROOM_IDLE_MINUTES`).
  - El streamer no nota nada: su configuración y su historial están en MongoDB, y la sala se vuelve a crear en cuanto entra.

- **La partida en curso sobrevive a un reinicio del servidor:**
  - Se guarda una "foto" de cada sala activa en MongoDB (colección `activerooms`): puntos, reloj, qué país eligió cada espectador y el usuario de TikTok conectado.
  - Al arrancar, las partidas siguen donde iban y TikTok se reconecta solo. Si la partida debía terminar con el servidor apagado, se cierra con su ganador y se guarda en el historial.
  - Apagado normal (Ctrl + C): no se pierde nada. Caída de golpe: como mucho los últimos ~10 segundos de puntos (`SNAPSHOT_INTERVAL_SECONDS`).

- **Reconexión automática a TikTok:**
  - Si la conexión se corta sin que el streamer lo pida, se reintenta sola: 8 intentos con esperas crecientes (5 s, 10 s, 20 s, 30 s y luego 60 s), unos 5 minutos en total.
  - El dashboard muestra "Reconectando... 2/8" y avisa cuando se recupera o cuando deja de intentarlo.
  - Si el streamer pulsa "Desconectar", se cancela. Si la conexión inicial falla, no se reintenta.
  - Prueba sin TikTok real: `npm run test:reconnect`.
- **Una partida por streamer (salas):**
  - Cada streamer tiene su propia partida, su propia conexión a TikTok, su configuración y **su propia URL de overlay** con una clave secreta.
  - Desde el dashboard se puede **generar una URL nueva**: la anterior deja de funcionar.
  - Probado con dos streamers a la vez: sus partidas no se mezclan.
- **Configurar regalos desde el dashboard** (Módulo 12):
  - Se eligen del catálogo de TikTok con el botón **+** y se les asignan puntos.
  - Los ids reales que habíamos anotado (Rose `5655`, Heart Me `7934`, Popular Vote `13651`, Treasure Clover `637990`) ya no hace falta apuntarlos, porque el catálogo los muestra todos.
  - "Popular Vote" ahora se llama **"Go Popular"**: TikTok cambia nombres, por eso usamos el id.
- **Editar países desde el dashboard**: nombre, comando y color, de 2 a 8 países (Módulo 12).
- **Guardar configuración e historial en MongoDB** (Módulo 12).
- **Botones "Nueva partida" y "Detener"** en el dashboard (Módulo 11).
- **Reinicio automático** después de mostrar el ganador (Módulo 11).
- **Catálogo de regalos de TikTok con imágenes oficiales** (extra del Módulo 11).
- **Proteger con login** el control de la partida y de TikTok (Módulo 10).

### ⏳ Pendientes


- **Módulo 14:** planes FREE / PRO (el último).

### 🔒 Antes de producción

- Cambiar la contraseña de la base de datos en Atlas, porque se compartió en el chat durante el desarrollo.
- Poner `SIMULATION_MODE=false` (en producción el servidor ya no arranca si está en `true`).
- Generar un `JWT_SECRET` nuevo solo para producción (64 caracteres aleatorios).
- Crear una cuenta gratis en Euler Stream y poner su clave en `EULER_API_KEY`.
- Evaluar guardar la sesión en una cookie *httpOnly* en lugar de `localStorage`.
- Revisar las condiciones de uso de TikTok. La conexión al LIVE y el catálogo de regalos usan servicios **no oficiales** que TikTok puede cambiar.

## Problemas comunes

| Síntoma | Solución |
|---|---|
| Al arrancar: `IP that isn't whitelisted` | Tu IP cambió. En Atlas: **Network Access → Add IP Address → Add Current IP Address** |
| Al arrancar: `querySrv ECONNREFUSED` | Revisa que `.env` tenga `DNS_SERVERS=8.8.8.8,1.1.1.1` |
| `EADDRINUSE` (puerto 3000 ocupado) | Ya hay un servidor encendido. Ciérralo (Ctrl + C) o cierra la terminal donde está |
| Un cambio del dashboard no se ve | Recarga ignorando la caché: **Ctrl + Shift + R** |
| "Ese usuario no está en LIVE" | El usuario tiene que estar en directo **en ese momento** |
