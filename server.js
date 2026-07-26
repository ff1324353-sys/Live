// ෆේස්බුක් එකට සර්වර් එකෙන් ලයිව් එක පටන් ගන්න රූට් එක
app.post('/start-fb-live', (req, res) => {
    const streamKey = req.body.streamKey;
    
    // ඔයා දුන් අලුත්ම ලින්ක් එක
    const streamUrl = "http://9937675.j15m.cc/live/fouaadkhadi/E7JWd8N9/1410913.ts?token=ShoJV0NcEgMVWVcBAgVVBAcDBwcJVwBTUgZVU1wFUFcBW1cPAFFTCg4aSUEXREVVBwg6DFUXC1UHBABfCQZOR0RLBERvXVQbDRpcWlcHAQdTR0lHRVxcAREPAVEAAFJSBwhUDxwWQFBTGl9BVQAOA1NQVUcdF1QcR1BCCFlZPQFUTghVVRYKV0JUCU9GX1lvAgAIBF9RE14RBRJKGlwRFRMCD0NcWBwbVVEREQVEUhJcR1JWBgwTSBFWXxNWQRAcEwJDensWHBtSQBEGCkNeXwhHX0dFRhNIEVxDOUpQERFDXQBbVUYSAxUIR09GXVZIOQYKC19QUhBaWl4VGg9AVBMUQ1tfWllNWEo6Ew1UFQpEVlZVAwACXRFI";

    if (!streamKey) {
        return res.status(400).send('Stream Key required!');
    }

    if (activeStreamProcess) {
        return res.status(400).send('A stream is already running! Stop it first.');
    }

    // ස්ථාවර Facebook RTMP URL එක (Port 80 ඉවත් කර ඇත)
    const fbRtmpUrl = `rtmp://live-api-s.facebook.com/rtmp/${streamKey}`;

    console.log('Starting Anti-Copyright Stream with Standard RTMP:', streamUrl);

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
            // 1. වීඩියෝ ෆිල්ටර්ස්: w=380, h=85 කළු පෙට්ටියෙන් ලෝගෝ එක වැසීම
            '-vf', 'eq=saturation=1.12:brightness=0.02,drawbox=x=iw-w-15:y=10:w=380:h=85:color=black@0.9:t=fill',
            
            // 2. ශබ්දය ඔරිජිනල් විදිහටම ඩිරෙක්ට් කොපි කිරීම
            '-c:a', 'copy',

            // 3. ස්ථාවර කෝඩින්ග් සහ ස්ට්‍රීම් සෙටින්ග්ස්
            '-c:v', 'libx264',
            '-preset', 'ultrafast',
            '-tune', 'zerolatency',
            '-b:v', '1500k',
            '-maxrate', '1500k',
            '-bufsize', '3000k',
            '-pix_fmt', 'yuv420p',
            '-g', '30',
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

    res.send('<h2>Live started successfully with Standard RTMP! 🚀</h2>');
});
