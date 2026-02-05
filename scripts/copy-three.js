const fs = require('fs');
const path = require('path');

const src = path.join(__dirname, '..', 'node_modules', 'three', 'build', 'three.module.js');
const destDir = path.join(__dirname, '..', 'game', 'vendor');
const dest = path.join(destDir, 'three.module.js');

if (!fs.existsSync(src)) {
	console.error('three.module.js not found. Run npm install first.');
	process.exit(1);
}

fs.mkdirSync(destDir, { recursive: true });
fs.copyFileSync(src, dest);
console.log(`Copied ${src} -> ${dest}`);
