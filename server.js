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

// YouTube එකට ඔරිජිනල් කොවලිටියෙන් සහ කළු බොක්ස් එක පමණක් දමා ලයිව් පටන් ගන්න රූට් එක
app.post('/start-yt-live', (req, res) => {
    const streamKey = req.body.streamKey || "Xpay-4reg-u6ya-ha0a-b239";
    const streamUrl = "https://s1.itcnbd.live/T-Sports-HD/tracks-v1a1/mono.m3u8";

    if (activeStreamProcess) {
        return res.status(400).send('A stream is already running! Stop it first.');
    }

    const ytRtmpUrl = `rtmp://a.rtmp.youtube.com/live2/${streamKey}`;

    console.log('Starting Original Quality YouTube Stream with Black Box:', streamUrl);

    const command = ffmpeg(streamUrl)
        .inputOptions([
            '-reconnect 1',
            '-reconnect_streamed 1',
            '-reconnect_delay_max 5',
            '-fflags +discardcorrupt+genpts',
            '-probesize 20M',
            '-analyzeduration 10M'
        ])
        .outputOptions([
            // 1. වීඩියෝවට කිසිම රෙසොලුෂන් වෙනසක් නොකර, මුල් තත්ත්වයෙන්ම තබා කළු බොක්ස් එක (Drawbox) පමණක් යෙදීම
            '-vf', 'drawbox=x=iw-w-15:y=10:w=260:h=800:color=black@0.9:t=fill',
            
            // 2. වීඩියෝ සහ ශබ්දය (Audio/Video) කිසිදු ලැගීමකින් තොරව ඔරිජිනල් ස්ට්‍රීම් එක ලෙසම (Stream Copy) YouTube වෙත යැවීම
            '-c:v', 'copy',
            '-c:a', 'copy',

            // 3. ස්ට්‍රීම් ස්ථාවරත්වය සඳහා අවශ්‍ය මූලික සැකසුම්
            '-max_muxing_queue_size', '99999',
            '-f', 'flv'
        ])
        .output(ytRtmpUrl)
        .on('start', (commandLine) => {
            console.log('FFmpeg Original Copy Stream spawned:', commandLine);
        })
        .on('error', (err) => {
            console.error('YouTube Original Streaming error:', err.message);
            activeStreamProcess = null;
        })
        .on('end', () => {
            console.log('YouTube Original Streaming finished.');
            activeStreamProcess = null;
        });

    command.run();
    activeStreamProcess = command;

    res.send('<h2>Original Quality Live started with Black Box! 🚀</h2>');
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
