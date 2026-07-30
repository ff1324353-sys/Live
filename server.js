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
                'Referer': 'https://www.itcnbd.live/'
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

// YouTube එකට සර්වර් එකෙන් ලයිව් එක පටන් ගන්න රූට් එක
app.post('/start-yt-live', (req, res) => {
    // ෆ්‍රොන්ට්එන්ඩ් එකෙන් Key එක දුන්නොත් ඒක ගන්නවා, නැත්නම් ඔයා දුන් ස්ථිර Key එක පාවිච්චි කරනවා
    const streamKey = req.body.streamKey || "Xpay-4reg-u6ya-ha0a-b239";
    
    // ඔයා දුන් .m3u8 ලින්ක් එක
    const streamUrl = "https://s1.itcnbd.live/T-Sports-HD/tracks-v1a1/mono.m3u8";

    if (activeStreamProcess) {
        return res.status(400).send('A stream is already running! Stop it first.');
    }

    // YouTube RTMP URL එක සහ Key එක එකතු කිරීම
    const ytRtmpUrl = `rtmp://a.rtmp.youtube.com/live2/${streamKey}`;

    console.log('Starting YouTube Stable Live Stream:', streamUrl);

    const command = ffmpeg(streamUrl)
        .inputOptions([
            '-reconnect 1',
            '-reconnect_streamed 1',
            '-reconnect_delay_max 5',
            '-fflags +discardcorrupt+genpts',
            '-probesize 15M',
            '-analyzeduration 5M'
        ])
        .outputOptions([
            // 1. වීඩියෝ ෆිල්ටර්: 25 FPS, ක්‍රොප් කර සහ කළු බොක්ස් එක දැමීම (කෝඩ් 224 එරර් නොඑන අයුරින්)
            '-vf', 'fps=25,scale=1280:720,crop=in_w-16:in_h-16:8:8,drawbox=x=iw-w-15:y=10:w=320:h=150:color=black@0.9:t=fill',
            
            // 2. ශබ්දය සඳහා සාර්ථක සහ සැහැල්ලු A/V Sync රීසැම්ප්ලිං පමණක් භාවිතය
            '-af', 'aresample=async=1:min_hard_comp=0.100000:first_pts=0',

            // 3. ස්ට්‍රීම් කෝඩින්ග් සහ ස්ථාවර සෙටින්ග්ස්
            '-c:v', 'libx264',
            '-preset', 'ultrafast',
            '-tune', 'zerolatency',
            '-fps_mode', 'cfr',
            '-g', '50',
            '-b:v', '600k',
            '-maxrate', '600k',
            '-bufsize', '1200k',
            '-pix_fmt', 'yuv420p',
            '-c:a', 'aac',
            '-b:a', '96k',
            '-ar', '44100',
            '-ac', '2',
            '-max_muxing_queue_size', '99999',
            '-f', 'flv'
        ])
        .output(ytRtmpUrl)
        .on('start', (commandLine) => {
            console.log('FFmpeg spawned for YouTube:', commandLine);
        })
        .on('error', (err) => {
            console.error('YouTube Streaming error:', err.message);
            activeStreamProcess = null;
        })
        .on('end', () => {
            console.log('YouTube Streaming finished.');
            activeStreamProcess = null;
        });

    command.run();
    activeStreamProcess = command;

    res.send('<h2>YouTube Live started successfully without Code 224! 🚀</h2>');
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
