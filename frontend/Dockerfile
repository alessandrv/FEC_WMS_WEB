# Frontend Dockerfile (React build + Nginx)
FROM node:20-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci --legacy-peer-deps
COPY . .
RUN npm run build

FROM nginx:1.27-alpine
# Copy build output
COPY --from=build /app/build /usr/share/nginx/html
# Custom nginx config
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
HEALTHCHECK --interval=30s --timeout=5s --retries=3 CMD wget -q -O - http://localhost/ || exit 1
