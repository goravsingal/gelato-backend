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


# RUN STAGE
FROM node:20-alpine AS runner

WORKDIR /app

# Copy built application from the builder stage
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./

# Expose the port the app runs on
EXPOSE 3000

# Start the application
CMD ["node", "dist/main"]
