# صورة تشغيل المنصة: صورة Playwright الرسمية (Node + متصفح Chromium وكل متطلباته لتصدير PDF).
# مهم: رقم الإصدار هنا يجب أن يطابق إصدار playwright-core في package-lock.json
FROM mcr.microsoft.com/playwright:v1.64.1-noble

ENV NODE_ENV=production \
    PLAYWRIGHT_BROWSERS_PATH=/ms-playwright \
    DATA_DIR=/app/data \
    PORT=3000

WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && rm -rf /root/.npm

COPY server ./server
COPY public ./public

VOLUME ["/app/data"]
EXPOSE 3000
CMD ["node", "--disable-warning=ExperimentalWarning", "server/index.js"]
