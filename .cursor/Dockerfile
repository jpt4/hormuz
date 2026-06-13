FROM node:20-bookworm-slim

# System deps only — Cursor checks out the repo; do not COPY project files here.
RUN apt-get update \
    && apt-get install -y --no-install-recommends git ca-certificates \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /workspace
