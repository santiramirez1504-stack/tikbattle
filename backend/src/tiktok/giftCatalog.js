// Catálogo de regalos de TikTok LIVE: id, nombre, precio en monedas e imagen oficial.
// Usa la misma dirección pública que la web de TikTok LIVE (no oficial: TikTok podría cambiarla).
// Las imágenes NO se descargan a nuestro servidor: se muestran directamente desde los servidores de TikTok.
const GIFT_LIST_URL = 'https://webcast.tiktok.com/webcast/gift/list/?aid=1988&app_name=tiktok_web&device_platform=web_pc';
const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36';
const CACHE_MS = 12 * 60 * 60 * 1000; // se vuelve a pedir a TikTok como mucho cada 12 horas
const REQUEST_TIMEOUT_MS = 10000;

let cache = null; // { gifts, updatedAt }

// Convierte un regalo de TikTok a nuestro formato. Devuelve null si faltan datos.
function toCatalogGift(gift) {
  if (!gift || !Number.isInteger(gift.id) || typeof gift.name !== 'string') {
    return null;
  }
  const urls = gift.image && Array.isArray(gift.image.url_list) ? gift.image.url_list : [];
  // Solo aceptamos direcciones https:// (evita que un dato raro se use como enlace peligroso)
  const imageUrl = urls.find((url) => typeof url === 'string' && url.startsWith('https://')) || null;

  return {
    giftId: gift.id,
    name: gift.name,
    diamondCount: Number(gift.diamond_count) || 0, // monedas que cuesta enviarlo
    imageUrl,
  };
}

async function downloadCatalog() {
  const response = await fetch(GIFT_LIST_URL, {
    headers: { 'User-Agent': USER_AGENT },
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  if (!response.ok) {
    throw new Error(`TikTok respondió ${response.status}`);
  }

  const body = await response.json();
  const rawGifts = body && body.data && Array.isArray(body.data.gifts) ? body.data.gifts : null;
  if (!rawGifts) {
    throw new Error('Respuesta de TikTok con un formato inesperado');
  }

  // Map por id: elimina regalos repetidos
  const byId = new Map();
  for (const gift of rawGifts.map(toCatalogGift)) {
    if (gift) byId.set(gift.giftId, gift);
  }

  // Del más barato al más caro
  return [...byId.values()].sort((a, b) => a.diamondCount - b.diamondCount || a.name.localeCompare(b.name));
}

async function getGiftCatalog() {
  if (cache && Date.now() - cache.updatedAt < CACHE_MS) {
    return cache;
  }

  try {
    const gifts = await downloadCatalog();
    cache = { gifts, updatedAt: Date.now() };
    console.log(`[TIKTOK] Catálogo de regalos actualizado: ${gifts.length} regalos`);
    return cache;
  } catch (error) {
    // Si TikTok falla pero ya teníamos una copia, seguimos usándola
    if (cache) {
      console.error('[TIKTOK] No se pudo actualizar el catálogo de regalos, se usa la copia anterior:', error.message);
      return cache;
    }
    throw error;
  }
}

// Imagen de un regalo según la copia ya descargada del catálogo (sin esperar a TikTok).
// Devuelve null si el catálogo todavía no se descargó o el regalo no está.
function getCachedGiftImage(giftId) {
  if (!cache || giftId === null || giftId === undefined) return null;
  const gift = cache.gifts.find((item) => item.giftId === Number(giftId));
  return gift ? gift.imageUrl : null;
}

module.exports = { getGiftCatalog, getCachedGiftImage };
