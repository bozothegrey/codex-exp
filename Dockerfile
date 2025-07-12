FROM node:18

WORKDIR /app

# Install python and build tools for native modules
RUN apt-get update && apt-get install -y python3 make g++

# for for persistent storage 
RUN mkdir -p /mnt/gcs && chown node:node /mnt/gcs

# Copy package files first for better caching
COPY package*.json ./
RUN npm install

# Copy application files
COPY . .

EXPOSE 3000
CMD ["node", "server.js"]
