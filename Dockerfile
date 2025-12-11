FROM node:lts-alpine

RUN apk add --no-cache docker
WORKDIR /app
COPY . .
RUN npm install
CMD ["npm", "run", "dev"]
EXPOSE 3000