FROM node:slim

RUN apt-get update -y && apt-get install --assume-yes --no-install-recommends docker.io
WORKDIR /app
COPY . .
RUN npm install
CMD ["npm", "run", "dev"]
EXPOSE 3000