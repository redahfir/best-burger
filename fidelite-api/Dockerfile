FROM node:22-alpine
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY src ./src
COPY assets ./assets
ENV NODE_ENV=production DATABASE_PATH=/data/fidelite.sqlite
VOLUME /data
EXPOSE 8787
CMD ["npm", "start"]
