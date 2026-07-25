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
app.use(express.urlencoded({ extended: true })); // HTML form data (URL-encoded) කියවා ගැනීමට
app.use(express.json());

let activeStreamProcess = null;

// ප්‍රොක්සි රූට් එක
app.get('/proxy', async (req, res) => {
    let targetUrl = req.query.url;
    if (!targetUrl) return res.status(400).send('Missing url');

    try {
        const response = await fetch(targetUrl, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0.0.0 Safari/537.36',
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

// ෆේස්බුක් එකට සර්වර් එකෙන් ලයිව් එක පටන් ගන්න රූට් එක (HTML Form POST හැන්ඩ්ල් කිරීම)
// ෆේස්බුක් එකට සර්වර් එකෙන් ලයිව් එක පටන් ගන්න රූට් එක (HTML Form POST හැන්ඩ්ල් කිරීම)
app.post('/start-fb-live', (req, res) => {
    const streamKey = req.body.streamKey;
    
    // 🔥 ඔයාට වැඩ කළ අර අලුත්ම TS ලින්ක් එක මෙතැනට දාන්න
    const streamUrl = "http://9937675.s05s.cc/live/fouaadkhadi/E7JWd8N9/150222.ts?token=ShoJV0NcEgMVXFAGAQNTBlFQUFZVDVBRV1MIA1wHUlVSCQIOUldTWg4aSUEXREVVBwg6DFUXC1UGBQJUChlAEEJdE2lZUBIDFQFcUFMGAAVESUcRWFhURgkEB14MDFVcBAlSGhJEWV0VAkdQVwgDBlZUR0kTUEkQVkdeB1RqBgBHUQJTEg5eTFtUSUELXmhUAwgEC1UXC0YDFxxEUUYSRwtWFFpcGBJbXkwXAhBVFQpEUFZQBxcdRlBaRQhMRxtHCxotfRIYElxPTAANF1lYXkRfRxFCFx1GWkZvFF1GFhdUWQxTQhYKGwcaSUEJUU9vBQoLC1RWRQ1cW0NEAhdTRx0aDFleXURWRWcVCgASDRJUV11SBRdM";

    if (!streamKey) {
        return res.status(400).send('Stream Key required!');
    }

    if (activeStreamProcess) {
        return res.status(400).send('A stream is already running! Stop it first.');
    }

    const fbRtmpUrl = `rtmps://live-api-s.facebook.com:443/rtmp/${streamKey}`;

    console.log('Starting streaming to Facebook from TS URL:', streamUrl);

    // .ts (Transport Stream) වලට අදාලව FFmpeg රීකනෙක්ට් සහ ಇನ್පුට් ඔප්ෂන්ස් ටික මෙන්න
        const command = ffmpeg(streamUrl)
        .inputOptions([
            '-reconnect 1',
            '-reconnect_streamed 1',
            '-reconnect_delay_max 5',
            '-fflags +discardcorrupt+genpts'
        ])
                                .outputOptions([
            '-c:v libx264',
            '-preset ultrafast',
            '-tune zerolatency',
            '-b:v 1200k',
            '-maxrate 1200k',
            '-bufsize 2400k',
            '-pix_fmt yuv420p',
            '-g 60',
            '-r 30',
            '-c:a aac',
            '-b:a 96k',
            '-af', 'asetrate=44100*1.015,aresample=44100', // කෝට් ලකුණු වෙනම වෙන් කර ආරක්ෂිතව දී ඇත
            '-f flv'
        ])


            
        .output(fbRtmpUrl)
        .on('start', (commandLine) => {
            console.log('FFmpeg spawned for FB Live:', commandLine);
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

    res.send('<h2>Facebook Live started from server successfully! 🚀</h2><p>Your .ts stream is now piping to Facebook Live.</p>');
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
