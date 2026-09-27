# Imagen de TikBattle para producción.
# Funciona igual en cualquier servidor con Docker (Oracle Cloud, un VPS de Hostinger, DigitalOcean...).
FROM node:22-alpine

WORKDIR /app

# 1) Primero solo las dependencias: si no cambian, Docker reutiliza esta capa y el despliegue es más rápido
COPY backend/package.json backend/package-lock.json backend/
RUN cd backend && npm ci --omit=dev && npm cache clean --force

# 2) El código (el .env y node_modules NO se copian: ver .dockerignore)
COPY backend/ backend/
COPY frontend/ frontend/
COPY overlay/ overlay/

# Carpeta de copias de seguridad, escribible por el usuario sin privilegios
RUN mkdir -p backend/backups && chown node:node backend/backups

ENV NODE_ENV=production
ENV PORT=3000

# Nunca como root: si alguien encontrara un fallo, tendría los mínimos permisos
USER node
WORKDIR /app/backend
EXPOSE 3000

# Docker comprueba cada 30 s que el servidor responde (y la base de datos está conectada)
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD wget -qO- http://127.0.0.1:3000/api/health || exit 1

CMD ["node", "server.js"]
