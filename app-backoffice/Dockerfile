# ── Build ─────────────────────────────────────────────────────────────
FROM node:22-alpine AS builder
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

COPY . .
ARG VITE_API_URL=/api
ARG VITE_WS_URL=
ENV VITE_API_URL=$VITE_API_URL VITE_WS_URL=$VITE_WS_URL
RUN npm run build

# ── Production ────────────────────────────────────────────────────────
FROM nginx:1.27-alpine
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=builder /app/dist /usr/share/nginx/html
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
