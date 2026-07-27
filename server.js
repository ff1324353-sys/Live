const express = require('express');
const path = require('path');
const fetch = require('node-fetch');
const http = require('http');
const { Server } = require('socket.io');
const ffmpeg = require('fluent-ffmpeg');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const PORT = process.env.PORT || 3000;

app.use(express.static(path.join(__dirname, 'public')));
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

let activeStreamProcess = null;

// ප්‍රොක්සි රූට් එක
app.get('/proxy', async (req, res) => {
    let targetUrl = req.query.url;
    if (!targetUrl) return res.status(400).send('Missing url');

    try {
        const response = await fetch(targetUrl, {
            headers: {
                'User-Agent': 'VLC/3.0.20 LibVLC/3.0.20',
                'Icy-MetaData': '1',
                'Accept-Encoding': 'identity',
                'Referer': 'https://www.fancode.com/'
            }
        });
        response.headers.forEach((v, n) => res.setHeader(n, v));
        res.status(response.status);

        if (targetUrl.endsWith('.m3u8')) {
            const text = await response.text();
            const rewritten = text.split('\n').map(line => {
                line = line.trim();
                if (line && !line.startsWith('#')) {
                    let absoluteUrl = line;
                    if (!line.startsWith('http')) {
                        const urlObj = new URL(targetUrl);
                        absoluteUrl = `${urlObj.origin}${line.startsWith('/') ? '' : '/'}${line}`;
                    }
                    return `/proxy?url=${encodeURIComponent(absoluteUrl)}`;
                }
                return line;
            }).join('\n');
            return res.send(rewritten);
        }
        response.body.pipe(res);
    } catch (err) {
        res.status(500).send('Proxy error');
    }
});

// ෆේස්බුක් එකට සර්වර් එකෙන් ලයිව් එක පටන් ගන්න රූට් එක
app.post('/start-fb-live', (req, res) => {
    const streamKey = req.body.streamKey;
    
    // ඔයා දුන් අලුත්ම ලින්ක් එක
    const streamUrl = "http://9937675.c24s.cc/live/fouaadkhadi/E7JWd8N9/31670.ts?token=ShoJV0NcEgMVWVwAUlEDVlEDXQMBAlNSUABTAl0BUFYDWQMGBwBVCgIaSUEXREVVBwg6DFUXC1cCAwdWFBcXFlRKPl9UFgobDgFWVFIHAhJKRxEMXFATXgICCFMJAlJVAgpNFEBdVBsNGlRSVAUBAV9HSUdUTUUBQVtRCmdRBxNYWwQUClpFVVsURwwKb1NVCwQLARMPE1QRGRIPS0VAX19NDVocFlJQQ0oEFwESDRJSVVJRExkTB1xAXhJKTEBfE3QqFBwWVUFDXQsQDV9ZElxHERYTGRMNQGpCA0tBEABQVQREEg4SCRUURw4FSGhTCQsLAFJBWAtdRhJcGgRASRNVDlhZQF9LaEgMB0YKFQZSV11UBhdM";

    if (!streamKey) {
        return res.status(400).send('Stream Key required!');
    }

    if (activeStreamProcess) {
        return res.status(400).send('A stream is already running! Stop it first.');
    }

    const fbRtmpUrl = `rtmps://live-api-s.facebook.com:443/rtmp/${streamKey}`;

    console.log('Starting Anti-Copyright Stream with Modified Pitch:', streamUrl);

    const command = ffmpeg(streamUrl)
        .inputOptions([
            '-reconnect 1',
            '-reconnect_streamed 1',
            '-reconnect_delay_max 5',
            '-fflags +discardcorrupt+genpts',
            '-probesize 50M',
            '-analyzeduration 20M'
        ])
                        .outputOptions([
            // 1. වීඩියෝ ෆිල්ටර්ස්: පාට ලොකුවට වෙනස් කිරීම සහ w=380, h=85 කළු පෙට්ටියෙන් ලෝගෝ එක වැසීම
            '-vf', 'eq=saturation=1.65:contrast=1.40:brightness=0.08:gamma=1.1,drawbox=x=iw-w-15:y=10:w=380:h=85:color=black@0.9:t=fill',
            
            // 2. වීඩියෝ වේගය වෙනස් නොකර, ශබ්දයේ පිච් (Pitch) එක පමණක් වෙනස් කිරීම
            '-af', 'rubberband=pitch=1.15',

            // 3. කෝඩින්ග් සහ ස්ට්‍රීම් සෙටින්ග්ස්
            '-c:v', 'libx264',
            '-preset', 'ultrafast',
            '-tune', 'zerolatency',
            '-b:v', '1500k',
            '-maxrate', '1500k',
            '-bufsize', '3000k',
            '-pix_fmt', 'yuv420p',
            '-g', '30',
            '-c:a', 'aac',
            '-b:a', '128k',
            '-ar', '44100',
            '-ac', '2',
            '-max_muxing_queue_size', '9999',
            '-f', 'flv'
        ])

        .output(fbRtmpUrl)
        .on('start', (commandLine) => {
            console.log('FFmpeg spawned:', commandLine);
        })
        .on('error', (err) => {
            console.error('Streaming error:', err.message);
            activeStreamProcess = null;
        })
        .on('end', () => {
            console.log('Streaming finished.');
            activeStreamProcess = null;
        });

    command.run();
    activeStreamProcess = command;

    res.send('<h2>Live started successfully with Heavy Pitch Change! 🚀</h2>');
});

// ලයිව් එක නතර කරන්න රූට් එක
app.get('/stop-live', (req, res) => {
    if (activeStreamProcess) {
        activeStreamProcess.kill('SIGKILL');
        activeStreamProcess = null;
        res.send('<h2>Live stream stopped successfully.</h2>');
    } else {
        res.status(400).send('No active stream running.');
    }
});

let activeViewers = 0;
io.on('connection', (socket) => {
    activeViewers++;
    io.emit('updateViewers', activeViewers);
    socket.on('disconnect', () => {
        activeViewers = Math.max(0, activeViewers - 1);
        io.emit('updateViewers', activeViewers);
    });
});

server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
