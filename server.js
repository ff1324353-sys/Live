  .outputOptions([
            // 1. පැහැදිලි HD 720p රෙසොලුෂන් සහ සුමට 30 FPS සඳහා සැකසූ වීඩියෝ ෆිල්ටර්
            '-vf', 'fps=30,scale=1280:720,crop=in_w-12:in_h-12:6:6',
            
            // 2. ශබ්දය සඳහා සැහැල්ලු සහ ස්ථාවර රීසැම්ප්ලිං
            '-af', 'aresample=async=1:min_hard_comp=0.100000:first_pts=0',

            // 3. HD Quality එකට ගැළපෙන ප්‍රශස්ත Bitrate සහ Preset සැකසුම් (ලැග් වීම සම්පූර්ණයෙන්ම වළක්වයි)
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
