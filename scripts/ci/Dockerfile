FROM node:22-bookworm

RUN apt-get update \
    && apt-get install -y --no-install-recommends \
      ca-certificates git python3 make g++ zip unzip \
    && rm -rf /var/lib/apt/lists/*

USER node
WORKDIR /workspace
