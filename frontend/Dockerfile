# ExpenseFlow frontend: build the React (CRA) bundle, serve it with nginx.
# nginx also proxies /api/* to the backend so the browser stays same-origin (cookies + CSRF).

FROM node:24-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY . .
ARG REACT_APP_NAME=ExpenseFlow
ENV REACT_APP_NAME=${REACT_APP_NAME} \
    GENERATE_SOURCEMAP=false \
    CI=false
RUN npm run build

FROM nginx:1.27-alpine
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/build /usr/share/nginx/html
EXPOSE 80
HEALTHCHECK --interval=10s --timeout=3s --retries=5 \
    CMD wget -q -O /dev/null http://127.0.0.1/ || exit 1
