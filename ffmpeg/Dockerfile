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
RUN npm install -g nodemon ts-node

# 4. Copy source code
COPY . .

# 5. Build TypeScript
RUN npm run build

# 6. Create the HLS output directory
RUN mkdir -p /hls && mkdir -p /temp

# 7. Start the server
CMD ["npm", "run", "dev"]
