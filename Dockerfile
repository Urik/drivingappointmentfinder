FROM node:10-alpine
COPY . .
RUN npm install
RUN node app.js