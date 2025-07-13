FROM node:18

WORKDIR /app

# Install python, build tools, and dev headers for native modules
# python3-dev is often needed for node-gyp
RUN apt-get update && apt-get install -y python3 python3-dev make g++ && rm -rf /var/lib/apt/lists/*

# Create a non-root user for security and better practices
RUN adduser --system --group nodejs

# for persistent storage (optional, based on your app needs)
RUN mkdir -p /mnt/gcs && chown nodejs:nodejs /mnt/gcs

# Copy package files first for better caching
COPY package*.json ./

# Run npm install as the non-root user 'nodejs'
# This ensures native modules are built for the user that will run the app
USER nodejs
RUN npm install

# Copy application files after dependencies are installed
# This is crucial for multi-stage builds or when using .dockerignore
COPY --chown=nodejs:nodejs . .

# Expose the port (Cloud Run will automatically detect this)
EXPOSE 3000

# Set the user again for running the application
USER nodejs

# Start your application
CMD ["node", "server.js"]