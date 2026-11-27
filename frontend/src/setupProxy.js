// Dev server only (react-scripts start): the browser calls same-origin /api/*, and this proxies it
// to the backend (ADR-0004). Never hard-code the backend host in app code.
const { createProxyMiddleware } = require("http-proxy-middleware");

module.exports = function setupProxy(app) {
  app.use(
    "/api",
    createProxyMiddleware({
      target: process.env.BACKEND_INTERNAL_URL || "http://localhost:8000",
      changeOrigin: true,
    }),
  );
};
