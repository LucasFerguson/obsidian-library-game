const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = process.env.PORT || 3000;
const PUBLIC_DIR = path.join(__dirname, 'public');
const GAME_DIR = path.join(__dirname, 'game');

const MIME_TYPES = {
	'.html': 'text/html; charset=utf-8',
	'.css': 'text/css; charset=utf-8',
	'.js': 'text/javascript; charset=utf-8',
	'.png': 'image/png',
	'.jpg': 'image/jpeg',
	'.jpeg': 'image/jpeg',
	'.svg': 'image/svg+xml',
	'.ico': 'image/x-icon'
};

function send(res, statusCode, headers, body) {
	res.writeHead(statusCode, headers);
	res.end(body);
}

function resolveRequest(urlPath) {
	let baseDir = PUBLIC_DIR;
	let relPath = urlPath;

	if (urlPath === '/game' || urlPath.startsWith('/game/')) {
		baseDir = GAME_DIR;
		relPath = urlPath.replace(/^\/game/, '');
		if (relPath === '' || relPath === '/') relPath = '/index.html';
	}

	if (relPath === '' || relPath === '/') relPath = '/index.html';
	const safePath = path.normalize(relPath).replace(/^\/+/, '');
	const resolvedPath = path.join(baseDir, safePath);
	return { baseDir, resolvedPath };
}

const server = http.createServer((req, res) => {
	const urlPath = req.url.split('?')[0];
	const { baseDir, resolvedPath } = resolveRequest(urlPath);

	if (!resolvedPath.startsWith(baseDir)) {
		console.warn(`[Server] Blocked path traversal: ${urlPath}`);
		return send(res, 400, { 'Content-Type': 'text/plain; charset=utf-8' }, 'Bad Request');
	}

	if (urlPath === '/game') {
		res.writeHead(302, { Location: '/game/' });
		res.end();
		console.log('[Server] Redirected /game -> /game/');
		return;
	}

	fs.readFile(resolvedPath, (err, data) => {
		if (err) {
			if (err.code === 'ENOENT') {
				console.warn(`[Server] 404 ${urlPath} -> ${resolvedPath}`);
				return send(res, 404, { 'Content-Type': 'text/plain; charset=utf-8' }, 'Not Found');
			}
			console.error(`[Server] 500 ${urlPath} -> ${resolvedPath}`, err);
			return send(res, 500, { 'Content-Type': 'text/plain; charset=utf-8' }, 'Server Error');
		}

		const ext = path.extname(resolvedPath).toLowerCase();
		const contentType = MIME_TYPES[ext] || 'application/octet-stream';
		console.log(`[Server] 200 ${urlPath} -> ${resolvedPath}`);
		return send(res, 200, { 'Content-Type': contentType }, data);
	});
});

server.listen(PORT, () => {
	console.log(`Server running at http://localhost:${PORT}`);
});
