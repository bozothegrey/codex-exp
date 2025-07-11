FROM node:18

WORKDIR /app

# Install python and build tools for native modules
RUN apt-get update && apt-get install -y python3 make g++

COPY package*.json ./
RUN npm install

COPY . .

EXPOSE 3000
CMD ["node", "server.js"]

