// Simple static server for VN-Studio demo
// Serves demo/index.html and game-data/ resources
// Usage: node demo/server.js [port]

var http = require('http');
var fs = require('fs');
var path = require('path');

var PORT = parseInt(process.argv[2]) || 8080;
var ROOT = path.resolve(__dirname, '..');

var MIME = {
  '.html': 'text/html',
  '.js': 'application/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.bmp': 'image/bmp',
  '.jpg': 'image/jpeg',
  '.png': 'image/png',
  '.wav': 'audio/wav',
  '.avi': 'video/x-msvideo',
  '.ico': 'image/x-icon',
};

var server = http.createServer(function(req, res) {
  var url = decodeURIComponent(req.url).split('?')[0];

  // Route /main/ -> demo/index.html
  if (url === '/' || url === '/main/' || url === '/main') {
    url = '/demo/index.html';
  }

  var filePath = path.join(ROOT, url);

  // Security: prevent path traversal
  if (!filePath.startsWith(ROOT)) {
    res.writeHead(403);
    res.end('Forbidden');
    return;
  }

  fs.stat(filePath, function(err, stats) {
    if (err || !stats.isFile()) {
      res.writeHead(404);
      res.end('Not found: ' + url);
      return;
    }

    var ext = path.extname(filePath).toLowerCase();
    var mime = MIME[ext] || 'application/octet-stream';

    res.writeHead(200, {
      'Content-Type': mime,
      'Access-Control-Allow-Origin': '*',
      'Cache-Control': 'public, max-age=3600'
    });

    fs.createReadStream(filePath).pipe(res);
  });
});

server.listen(PORT, function() {
  console.log('VN-Studio demo server running at http://localhost:' + PORT);
  console.log('Open http://localhost:' + PORT + '/main/');
  console.log('Game data served from: ' + path.join(ROOT, 'game-data'));
});
