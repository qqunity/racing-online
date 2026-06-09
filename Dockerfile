# Multi-stage build: compile the Phaser client, then ship a slim runtime image
# that serves the static client AND the Socket.IO server from one port.

# ---- build stage ----
FROM node:20-alpine AS build
WORKDIR /app

# Install all workspace deps (client build needs dev deps like vite).
COPY package.json package-lock.json* ./
COPY client/package.json ./client/
COPY server/package.json ./server/
RUN npm install

# Copy sources and build the client into client/dist.
COPY shared ./shared
COPY client ./client
COPY server ./server
RUN npm run build

# ---- runtime stage ----
FROM node:20-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000

# Install ONLY the server's production deps (express + socket.io), standalone.
COPY server/package.json ./server/package.json
RUN cd server && npm install --omit=dev

# App code + the freshly built client.
COPY shared ./shared
COPY server/src ./server/src
COPY --from=build /app/client/dist ./client/dist

EXPOSE 3000
CMD ["node", "server/src/index.js"]
