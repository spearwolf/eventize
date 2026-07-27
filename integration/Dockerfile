# syntax=docker/dockerfile:1

# signalize declares engines.node ">=24.13". Debian rather than Alpine: the
# vitest transform runs on @swc/core, whose native binding is less trouble on
# glibc than on musl.
FROM node:24-slim

ARG SIGNALIZE_REPO=https://github.com/spearwolf/signalize.git
ARG SIGNALIZE_REF=359d939a8879467ed0e53b314ade9a2157d734ca

ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0

RUN apt-get update \
 && apt-get install -y --no-install-recommends git ca-certificates jq \
 && rm -rf /var/lib/apt/lists/*

RUN corepack enable

WORKDIR /work

# init + fetch rather than "clone --branch": this form accepts a tag, a branch
# *and* a commit SHA. SIGNALIZE_REF is an ARG, so bumping it invalidates this
# layer on its own — nobody has to remember --no-cache.
RUN git init -q signalize \
 && cd signalize \
 && git remote add origin "${SIGNALIZE_REPO}" \
 && git fetch --depth 1 origin "${SIGNALIZE_REF}" \
 && git checkout -q FETCH_HEAD

WORKDIR /work/signalize

# Baseline install against the UNMODIFIED manifest: eventize 5.x from the
# registry. The v6 tarball arrives at runtime, so this expensive layer stays
# warm across eventize rebuilds. node_modules and the pnpm store both live in
# the image, which is why no store volume is mounted at runtime — one would
# shadow the warm store.
RUN pnpm install --frozen-lockfile

COPY entrypoint.sh /usr/local/bin/entrypoint.sh
RUN chmod +x /usr/local/bin/entrypoint.sh

ENV OUT_DIR=/out
ENV EVENTIZE_TARBALL=/opt/eventize/pkg.tgz
ENV PATCHES_DIR=/opt/patches

ENTRYPOINT ["/usr/local/bin/entrypoint.sh"]
