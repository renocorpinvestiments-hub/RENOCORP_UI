# ui/Dockerfile
# ============================================================
# NEW FILE — P2 fix (RENOCORP_PRODUCTION_READINESS.md §5,
# "Docker hardening"). The frontend previously had no Dockerfile
# at all — this adds a multi-stage build so the frontend can be
# containerized the same way the backend is, with no Node.js
# toolchain present in the final image (just static files served
# by nginx).
# ============================================================

# ── Stage 1: build ────────────────────────────────────────────
FROM node:20-slim AS builder

WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm ci --no-audit --no-fund

COPY . .
RUN npm run build

# ── Stage 2: runtime (static hosting, no Node.js present) ──────
FROM nginx:1.27-alpine AS runtime

RUN addgroup -S app && adduser -S app -G app

COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=builder /app/dist /usr/share/nginx/html

# nginx needs to write to a few dirs even running as non-root;
# pre-create and chown them rather than running as root.
RUN mkdir -p /var/cache/nginx /var/run \
    && chown -R app:app /var/cache/nginx /var/run /usr/share/nginx/html \
    && touch /var/run/nginx.pid \
    && chown app:app /var/run/nginx.pid

USER app

EXPOSE 8080

HEALTHCHECK --interval=15s --timeout=5s --start-period=10s --retries=3 \
    CMD wget -qO- http://127.0.0.1:8080/ >/dev/null 2>&1 || exit 1

CMD ["nginx", "-g", "daemon off;"]
