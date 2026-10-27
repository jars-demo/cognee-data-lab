# Build context: the repo root (see docker-compose.yml).

# 1. Frontend: Vite + TypeScript -> static files
FROM node:22-alpine AS frontend
WORKDIR /frontend
COPY app/frontend/package.json app/frontend/package-lock.json ./
RUN --mount=type=cache,target=/root/.npm npm ci
COPY app/frontend ./
RUN npm run build

# 2. Backend: FastAPI + cognee + the two connectors, serving the built frontend
FROM python:3.11-slim
COPY --from=ghcr.io/astral-sh/uv:0.9.3 /uv /usr/local/bin/uv
# Some wheels (lancedb, onnxruntime) are large; allow slow downloads.
ENV UV_LINK_MODE=copy UV_COMPILE_BYTECODE=1 UV_HTTP_TIMEOUT=300 PYTHONUNBUFFERED=1 \
    LAB_HOME=/data LAB_FRONTEND_DIST=/lab/app/frontend/dist
WORKDIR /lab
COPY connectors ./connectors
COPY app/backend/pyproject.toml app/backend/uv.lock ./app/backend/
RUN --mount=type=cache,target=/root/.cache/uv \
    cd app/backend && uv sync --frozen --no-dev --no-install-project
COPY app/backend ./app/backend
RUN --mount=type=cache,target=/root/.cache/uv \
    cd app/backend && uv sync --frozen --no-dev
COPY --from=frontend /frontend/dist ./app/frontend/dist
WORKDIR /lab/app/backend
VOLUME /data
EXPOSE 8765
CMD ["uv", "run", "--no-sync", "uvicorn", "lab.server:app", "--host", "0.0.0.0", "--port", "8765"]
