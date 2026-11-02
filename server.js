const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = 3000;

http.createServer((req, res) => {
    let filePath = '.' + req.url;
    if (filePath === './') filePath = './dandelions.html';

    const extname = String(path.extname(filePath)).toLowerCase();
    const mimeTypes = {
        '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css',
        '.lrc': 'text/plain', '.mp3': 'audio/mpeg', '.mpeg': 'audio/mpeg',
        '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg'
    };
    const contentType = mimeTypes[extname] || 'application/octet-stream';

    fs.stat(filePath, (err, stat) => {
        if (err) {
            res.writeHead(404);
            return res.end('File not found!');
        }

        const fileSize = stat.size;
        const range = req.headers.range;

        // Node.js Enhancement: Stream audio in chunks for zero stuttering
        if (range && contentType === 'audio/mpeg') {
            const parts = range.replace(/bytes=/, "").split("-");
            const start = parseInt(parts[0], 10);
            const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
            const chunksize = (end - start) + 1;
            const file = fs.createReadStream(filePath, { start, end });
            
            res.writeHead(206, {
                'Content-Range': `bytes ${start}-${end}/${fileSize}`,
                'Accept-Ranges': 'bytes',
                'Content-Length': chunksize,
                'Content-Type': contentType,
            });
            file.pipe(res);
        } else {
            res.writeHead(200, { 'Content-Length': fileSize, 'Content-Type': contentType });
            fs.createReadStream(filePath).pipe(res);
        }
    });
}).listen(PORT, () => {
    console.log(`\n🎵 Visualizer running at: http://localhost:${PORT}\n`);
});