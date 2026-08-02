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

// YouTube එකට ටයිමර් එකත් සමඟ HD Quality එකෙන් ලයිව් එක පටන් ගන්න රූට් එක
app.post('/start-yt-live', (req, res) => {
    const streamKey = req.body.streamKey || "Xpay-4reg-u6ya-ha0a-b239";
    const streamUrl = "https://tvsen6.aynaott.com/zv68oqPDu7MZZwmHhRxt/tracks-v1a1/mono.ts.m3u8?e=1784102512&token=968935df4fd0678de5d7fe392c0610d9&u=ee5437a7-c16b-4";

    if (activeStreamProcess) {
        return res.status(400).send('A stream is already running! Stop it first.');
    }

    const ytRtmpUrl = `rtmp://a.rtmp.youtube.com/live2/${streamKey}`;

    // ශ්‍රී ලංකා වෙලාව (GMT+5:30) ලබා ගැනීම
    const now = new Date();
    const lkTime = new Date(now.toLocaleString("en-US", { timeZone: "Asia/Colombo" }));
    const currentHours = lkTime.getHours();
    const currentMinutes = lkTime.getMinutes();

    // මැච් පටන් ගන්න වෙලාව: සවස 7.10 (පැය 19, මිනිත්තු 10)
    const targetHours = 19;
    const targetMinutes = 10;

    const currentTimeInMinutes = currentHours * 60 + currentMinutes;
    const targetTimeInMinutes = targetHours * 60 + targetMinutes;

    let command;

    if (currentTimeInMinutes < targetTimeInMinutes) {
        console.log('Match time not reached yet. Starting Standby Screen with Text...');
        
        // 7.10 වෙනතුරු කළු ස්ක්‍රීන් එකක් මත "LPL MATCH START 7.10 P.M" පෙන්නන ෆිල්ටර් එක
        command = ffmpeg('color=c=black:s=1280x720:r=25')
            .inputFormat('lavfi')
            .outputOptions([
                '-vf', 'drawtext=text=\'LPL MATCH START 7.10 P.M\':fontcolor=white:fontsize=50:x=(w-text_w)/2:y=(h-text_h)/2',
                '-c:v', 'libx264',
                '-preset', 'ultrafast',
                '-pix_fmt', 'yuv420p',
                '-f', 'flv'
            ])
            .output(ytRtmpUrl);

    } else {
        console.log('Match time reached! Starting High Quality YouTube HD Stream...');
        
        // 7.10 පසුව ඔරිජිනල් HD ලයිව් ස්ට්‍රීම් එක පටන් ගැනීම
        command = ffmpeg(streamUrl)
            .inputOptions([
                '-reconnect 1',
                '-reconnect_streamed 1',
                '-reconnect_delay_max 5',
                '-fflags +discardcorrupt+genpts',
                '-probesize 20M',
                '-analyzeduration 10M'
            ])
            .outputOptions([
                '-vf', 'fps=30,scale=1280:720,crop=in_w-12:in_h-12:6:6',
                '-af', 'aresample=async=1:min_hard_comp=0.100000:first_pts=0',
                '-c:v', 'libx264',
                '-preset', 'veryfast',
                '-tune', 'zerolatency',
                '-fps_mode', 'cfr',
                '-g', '60',
                '-b:v', '1800k',
                '-maxrate', '2200k',
                '-bufsize', '3600k',
                '-pix_fmt', 'yuv420p',
                '-c:a', 'aac',
                '-b:a', '128k',
                '-ar', '44100',
                '-ac', '2',
                '-max_muxing_queue_size', '99999',
                '-f', 'flv'
            ])
            .output(ytRtmpUrl);
    }

    command.on('start', (commandLine) => {
        console.log('FFmpeg Stream spawned:', commandLine);
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

    res.send('<h2>Smart Time-based HD Live started successfully! 🚀</h2>');
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
