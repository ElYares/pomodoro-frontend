# --- Etapa 1: Build ---
FROM node:20-alpine AS builder

WORKDIR /app

# Copiamos dependencias
COPY package*.json ./

RUN npm install

# Copiamos el proyecto completo
COPY . .

# Build del sitio estático
RUN npm run build

# --- Etapa 2: Servidor web ---
FROM nginx:alpine

# Borramos la configuración por defecto
RUN rm -rf /usr/share/nginx/html/*

# Copiamos los archivos generados por Astro
COPY --from=builder /app/dist /usr/share/nginx/html

# Exponer puerto del servidor web
EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
