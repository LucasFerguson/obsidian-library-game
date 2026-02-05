const fs = require('fs');
const path = require('path');

const width = Number(process.argv[2]) || 64;
const height = Number(process.argv[3]) || 64;
const chunkSize = Number(process.argv[4]) || 16;
const seed = Number(process.argv[5]) || 1337;

if (!Number.isFinite(width) || !Number.isFinite(height) || !Number.isFinite(chunkSize)) {
	console.error('Invalid arguments. Usage: node scripts/generate-world.js [width] [height] [chunkSize] [seed]');
	process.exit(1);
}

function mulberry32(a) {
	return function () {
		let t = a += 0x6d2b79f5;
		t = Math.imul(t ^ t >>> 15, t | 1);
		t ^= t + Math.imul(t ^ t >>> 7, t | 61);
		return ((t ^ t >>> 14) >>> 0) / 4294967296;
	};
}

const rand = mulberry32(seed);
const grid = Array.from({ length: width }, () => Array.from({ length: height }, () => '.'));

function inBounds(x, y) {
	return x >= 0 && x < width && y >= 0 && y < height;
}

function paintBlob(cx, cy, radius, char) {
	for (let x = cx - radius; x <= cx + radius; x++) {
		for (let y = cy - radius; y <= cy + radius; y++) {
			if (!inBounds(x, y)) continue;
			const dx = x - cx;
			const dy = y - cy;
			if (dx * dx + dy * dy <= radius * radius) grid[x][y] = char;
		}
	}
}

// Water blobs + sand shores
for (let i = 0; i < 6; i++) {
	const cx = Math.floor(rand() * width);
	const cy = Math.floor(rand() * height);
	const r = 3 + Math.floor(rand() * 4);
	paintBlob(cx, cy, r, '~');
	paintBlob(cx, cy, r + 1, 'S');
}

// Wood groves
for (let i = 0; i < 5; i++) {
	const cx = Math.floor(rand() * width);
	const cy = Math.floor(rand() * height);
	const r = 4 + Math.floor(rand() * 4);
	paintBlob(cx, cy, r, 'w');
}

// Stone cross path
const midX = Math.floor(width / 2);
const midY = Math.floor(height / 2);
for (let x = 0; x < width; x++) grid[x][midY] = 's';
for (let y = 0; y < height; y++) grid[midX][y] = 's';

// Place shelves on wood tiles
let shelves = 0;
for (let i = 0; i < width * height && shelves < 25; i++) {
	const x = Math.floor(rand() * width);
	const y = Math.floor(rand() * height);
	if (grid[x][y] === 'w') {
		grid[x][y] = 'B';
		shelves++;
	}
}

function chunkLine(chunkX, chunkY, row) {
	let line = '';
	for (let col = 0; col < chunkSize; col++) {
		const x = chunkX * chunkSize + col;
		const y = chunkY * chunkSize + row;
		line += inBounds(x, y) ? grid[x][y] : '.';
	}
	return line;
}

const chunksX = Math.ceil(width / chunkSize);
const chunksY = Math.ceil(height / chunkSize);
const lines = [];
lines.push('; Generated world file');
lines.push(`; seed ${seed}`);
lines.push('size ' + width + ' ' + height);
lines.push('chunk_size ' + chunkSize);
lines.push('');

for (let cy = 0; cy < chunksY; cy++) {
	for (let cx = 0; cx < chunksX; cx++) {
		lines.push(`chunk ${cx} ${cy}`);
		for (let row = 0; row < chunkSize; row++) {
			lines.push(chunkLine(cx, cy, row));
		}
		lines.push('');
	}
}

const outputPath = path.join(__dirname, '..', 'public', 'worlds', 'generated.txt');
fs.writeFileSync(outputPath, lines.join('\n'), 'utf8');
console.log(`Wrote ${outputPath}`);
