FROM node:25-alpine

LABEL maintainer="furnaripablojavier@gmail.com"
LABEL description="D&D Campaign Tools – NPC sheets, item cards, PDF viewer, campaign timeline"

WORKDIR /app

# Install dependencies first (cached layer)
COPY package.json ./
RUN  --mount=type=secret,id=npmrc,target=/root/.npmrc \
  npm install --omit=dev 

# Copy application source
COPY app.js ./
COPY public/ ./public/

# Runtime directories (mounted at run time; create empty placeholders so
# the app starts cleanly even without a bind-mount)
RUN mkdir -p /app/pdfs

EXPOSE 3080

# Run as a non-root user for safety
RUN addgroup -S dnd && adduser -S dnd -G dnd && chown -R dnd:dnd /app
USER dnd

CMD ["node", "app.js"]
