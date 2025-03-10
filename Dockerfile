# Use the latest stable Node.js 20 image
FROM node:20-alpine AS builder

# Set the working directory inside the container
WORKDIR /app

# Copy package.json and package-lock.json first (for efficient caching)
COPY package*.json ./

# Install dependencies
RUN npm install --legacy-peer-deps

# Copy the entire application code
COPY . .

# Build the NestJS app
RUN npm run build

# Expose the port the app runs on
EXPOSE 3000

ENTRYPOINT ["sh", "/app/entrypoint.sh"]
