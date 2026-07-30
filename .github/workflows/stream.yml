name: Node.js Stream Server

on:
  push:
    branches: [ main ]
  workflow_dispatch:

jobs:
  build:
    runs-on: ubuntu-latest

    steps:
    - name: Checkout Repository
      uses: actions/checkout@v4

    - name: Set up Node.js
      uses: actions/setup-node@v4
      with:
        node-version: '18'

    - name: Install FFmpeg & Dependencies
      run: |
        sudo apt-get update
        sudo apt-get install -y ffmpeg
        npm install

    - name: Start Application Server
      run: |
        npm start
