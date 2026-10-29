FROM node:20-slim

# Install necessary packages, Chrome dependencies, Xvfb, Pulseaudio, and FFmpeg
RUN apt-get update && apt-get install -y \
    ffmpeg \
    xvfb \
    pulseaudio \
    alsa-utils \
    curl \
    wget \
    gnupg \
    libnss3 \
    libatk-bridge2.0-0 \
    libx11-xcb1 \
    libxcb-dri3-0 \
    libdrm2 \
    libgbm1 \
    libasound2 \
    libpangocairo-1.0-0 \
    libxcomposite1 \
    libxcursor1 \
    libxdamage1 \
    libxi6 \
    libxtst6 \
    libcups2 \
    libxrandr2 \
    libpango-1.0-0 \
    libcairo2 \
    libxss1 \
    libnspr4 \
    libnss3 \
    xdg-utils \
    fonts-liberation

WORKDIR /app

COPY package*.json ./
RUN npm install

COPY . .

# Start Xvfb virtual display in background and then run node app
CMD Xvfb :99 -screen 0 1280x720x24 > /dev/null 2>&1 & export DISPLAY=:99 && pulseaudio --start && npm start
