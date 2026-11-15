# Eunomia server image. Build context: the root of the fmup-ia repository.
#   docker build -f eunomia-server/Dockerfile -t eunomia:local .
# The server reads data files of the repository (interview, patterns, schema, Themis rules,
# _variables.yml). They are copied to /app/repo, and EUNOMIA_REPO_ROOT points there.
FROM node:22-alpine

LABEL org.opencontainers.image.source="https://github.com/tiagojct/fmup-ia" \
      org.opencontainers.image.description="Eunomia: assistente de desenho de actividades FMUP IA (servidor)"

ENV NODE_ENV=production \
    EUNOMIA_REPO_ROOT=/app/repo \
    EUNOMIA_DATA=/app/data

WORKDIR /app

COPY eunomia-server/package.json eunomia-server/package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY eunomia-server/src ./src
COPY eunomia-server/bin ./bin
COPY eunomia-server/referencia ./referencia

COPY eunomia/*.json ./repo/eunomia/
COPY themis/policy.json themis/policy-rules.js ./repo/themis/
COPY themis/i18n/pt.js ./repo/themis/i18n/
COPY _variables.yml ./repo/

# The data folder belongs to the user of the image (node, uid 1000), as the bind mount on the server.
RUN mkdir -p /app/data && chown node:node /app/data && chmod 0700 /app/data

USER node
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- http://127.0.0.1:3000/fmup-ia/eunomia/api/saude > /dev/null || exit 1

CMD ["node", "src/main.js"]
