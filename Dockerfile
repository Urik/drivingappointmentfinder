FROM buildkite/puppeteer:latest
COPY . .
# ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD true
RUN npm install
ENV PATH="${PATH}:/node_modules/.bin"
CMD ["node", "app.js"]