# Use a lightweight Node image
FROM node:18-slim

# 1. Install FFmpeg (Essential)
# We update apt, install ffmpeg, and clean up to keep image size down
RUN apt-get update && \
    apt-get install -y ffmpeg && \
    rm -rf /var/lib/apt/lists/*

# 2. Set working directory
WORKDIR /app

# 3. Install Node dependencies
COPY package*.json ./
RUN npm install

# 4. Copy source code
COPY . .

# 5. Build TypeScript
RUN npm run build

# 6. Create the HLS output directory
RUN mkdir -p /hls

# 7. Start the server
CMD ["node", "dist/server.js"]
