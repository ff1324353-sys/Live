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

// YouTube එකට අතිශය අඩු ප්‍රමාදයක් සහිතව (Zero-Latency) ලැගීමකින් තොරව ලයිව් පටන් ගන්න රූට් එක
app.post('/start-yt-live', (req, res) => {
    const streamKey = req.body.streamKey || "Xpay-4reg-u6ya-ha0a-b239";
    const streamUrl = "https://s1.itcnbd.live/T-Sports-HD/tracks-v1a1/mono.m3u8";

    if (activeStreamProcess) {
        return res.status(400).send('A stream is already running! Stop it first.');
    }

    const ytRtmpUrl = `rtmp://a.rtmp.youtube.com/live2/${streamKey}`;

    console.log('Starting Ultra-Low Latency YouTube Stream (Lag-Free Config):', streamUrl);

    const command = ffmpeg(streamUrl)
        .inputOptions([
            '-reconnect 1',
            '-reconnect_streamed 1',
            '-reconnect_delay_max 2', // තවත් අඩු කළා
            '-fflags +discardcorrupt+genpts+nobuffer', // Nobuffer එකතු කළා
            '-probesize 10M',
            '-analyzeduration 3M'
        ])
        .outputOptions([
            // 1. මූලාශ්‍රයේ FPS එකම පවත්වාගෙන යාම (ප්‍රමාණ වෙනස් නොකර)
            '-vf', 'drawbox=x=iw-w-15:y=10:w=280:h=100:color=black@0.9:t=fill',
            
            // 2. ශබ්දය: AAC ලෙස සැහැල්ලුවෙන් නැවත සැකසීම (A/V Sync ගැටලු වළක්වයි)
            '-c:a', 'aac', '-b:a', '128k', '-ar', '44100', '-ac', '2',
            
            // 3. වීඩියෝ: අතිශය වේගවත් කේතනය සහ ලැගීම වළක්වන විශේෂ සැකසුම්
            '-c:v', 'libx264',
            '-preset', 'ultrafast', // හැකි තරම් වේගයෙන් කේතනය කරයි
            '-tune', 'zerolatency',  // ලැගීම සම්පූර්ණයෙන්ම වළක්වයි
            '-crf', '26',            // මෙය මගින් Quality එක හොඳ මට්ටමක තබාගෙන සර්වර් එකට පහසු ලෙස Bitrate එක අඩු කරයි
            '-g', '50',              // Keyframe interval
            '-maxrate', '2500k',
            '-bufsize', '5000k',
            '-pix_fmt', 'yuv420p',
            
            // 4. ස්ට්‍රීම් ස්ථාවරත්වය
            '-max_muxing_queue_size', '99999',
            '-f', 'flv'
        ])
        .output(ytRtmpUrl)
        .on('start', (commandLine) => {
            console.log('FFmpeg Ultra-Low Latency Stream spawned:', commandLine);
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

    res.send('<h2>Ultra-Low Latency Live started! (Lag-Free) 🚀</h2>');
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
