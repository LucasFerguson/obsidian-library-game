/* global window, document */

/**
 * LOGGING
 */
function log(msg) {
	console.log(`[Garden Log] ${msg}`);
	const status = document.getElementById('debug-status');
	if (status) status.innerText = msg;
}

/**
 * CONFIG & STATE
 */
const TILE_SIZE = 40;
let MAP_WIDTH = 100;
let MAP_HEIGHT = 100;
let CHUNK_SIZE = 16;
const WORLD_PATH = 'worlds/zen.txt';
const TILE = { VOID: 0, GRASS: 1, WOOD: 2, STONE: 3, WATER: 4, SAND: 5, WALL: 6, SHELF: 7, TABLE: 8 };
const COLORS = {
	grass: '#66bb6a',
	wood: '#d7ccc8',
	stone: '#cfd8dc',
	water: '#4fc3f7',
	sand: '#fff9c4',
	wall: '#5d4037',
	shelf: '#3e2723',
	player: '#f50057'
};

const TILE_COLORS = [];
TILE_COLORS[TILE.VOID] = 'rgba(0, 0, 0, 0)';
TILE_COLORS[TILE.GRASS] = COLORS.grass;
TILE_COLORS[TILE.WOOD] = COLORS.wood;
TILE_COLORS[TILE.STONE] = COLORS.stone;
TILE_COLORS[TILE.WATER] = COLORS.water;
TILE_COLORS[TILE.SAND] = COLORS.sand;
TILE_COLORS[TILE.WALL] = COLORS.wall;
TILE_COLORS[TILE.SHELF] = COLORS.shelf;
TILE_COLORS[TILE.TABLE] = COLORS.wood;

let canvas = null;
let ctx = null;
let map = [], items = [], keys = {}, isModalOpen = false;
let camera = { x: 0, y: 0 };
const player = { x: 0, y: 0, vx: 0, vy: 0, radius: 12, z: 0, vz: 0, dashCooldown: 0 };
let noteCursor = 0;
let isExportOpen = false;

const editor = {
	mode: 'play',
	tool: 'paint',
	tile: TILE.GRASS,
	zoom: 1,
	dragging: false,
	dragStart: null,
	dragCurrent: null
};

const TILE_DEFS = [
	{ id: TILE.GRASS, label: 'Grass', color: COLORS.grass, char: '.' },
	{ id: TILE.WOOD, label: 'Wood', color: COLORS.wood, char: 'w' },
	{ id: TILE.STONE, label: 'Stone', color: COLORS.stone, char: 's' },
	{ id: TILE.WATER, label: 'Water', color: COLORS.water, char: '~' },
	{ id: TILE.SAND, label: 'Sand', color: COLORS.sand, char: 'S' },
	{ id: TILE.WALL, label: 'Wall', color: COLORS.wall, char: '#' },
	{ id: TILE.SHELF, label: 'Shelf', color: COLORS.shelf, char: 'B' },
	{ id: TILE.TABLE, label: 'Table', color: COLORS.wood, char: 'T' }
];

const MOCK_NOTES = [
	{ title: "The Flow of State", content: "React states are like seasons. They change, they cycle, and eventually, they render beauty." },
	{ title: "Binary Zen", content: "Between 0 and 1, there is a space. In that space, the soul of the machine rests." },
	{ title: "Recursive Love", content: "To understand love, you must first understand love. It is a loop with no base case." }
];

/**
 * ENGINE
 */
async function init() {
	log("Loading world file...");
	const loaded = await loadWorld(WORLD_PATH);
	if (!loaded) {
		log("Falling back to procedural map...");
		generateProceduralMap();
	}
	teleportToCenter();
	hideLoading();
	log("Starting game loop...");
	requestAnimationFrame(gameLoop);
}

function generateProceduralMap() {
	for (let x = 0; x < MAP_WIDTH; x++) {
		map[x] = [];
		for (let y = 0; y < MAP_HEIGHT; y++) map[x][y] = TILE.GRASS;
	}
	const cx = Math.floor(MAP_WIDTH / 2), cy = Math.floor(MAP_HEIGHT / 2);
	fillArea(cx - 7, cy - 7, 14, 14, TILE.WOOD);
	fillArea(cx - 1, cy - 30, 3, 60, TILE.STONE);
	fillArea(cx - 30, cy - 1, 60, 3, TILE.STONE);

	for (let i = 0; i < 30; i++) {
		let rx = Math.floor(Math.random() * 20) + cx - 10;
		let ry = Math.floor(Math.random() * 20) + cy - 10;
		if (map[rx][ry] === TILE.WOOD) {
			map[rx][ry] = TILE.SHELF;
			items.push({ x: rx, y: ry, data: MOCK_NOTES[i % MOCK_NOTES.length] });
		}
	}
	noteCursor = items.length;
}

function fillArea(x, y, w, h, t) {
	for (let i = x; i < x + w; i++) {
		for (let j = y; j < y + h; j++) {
			if (i >= 0 && i < MAP_WIDTH && j >= 0 && j < MAP_HEIGHT) {
				map[i][j] = t;
			}
		}
	}
}

function teleportToCenter() {
	if (!MAP_WIDTH || !MAP_HEIGHT) return;
	player.x = (MAP_WIDTH * TILE_SIZE) / 2;
	player.y = (MAP_HEIGHT * TILE_SIZE) / 2;
	resetPlayer();
	log("Player teleported to center.");
}

function resetPlayer() {
	player.vx = 0;
	player.vy = 0;
	player.vz = 0;
	player.z = 0;
}

function update() {
	if (isModalOpen || !canvas) return;

	if (editor.mode === 'edit') {
		const panSpeed = 10;
		if (keys['KeyW']) camera.y -= panSpeed;
		if (keys['KeyS']) camera.y += panSpeed;
		if (keys['KeyA']) camera.x -= panSpeed;
		if (keys['KeyD']) camera.x += panSpeed;
		return;
	}

	let ax = 0, ay = 0;
	if (keys['KeyW']) ay -= 1.2;
	if (keys['KeyS']) ay += 1.2;
	if (keys['KeyA']) ax -= 1.2;
	if (keys['KeyD']) ax += 1.2;

	player.vx = (player.vx + ax) * 0.85;
	player.vy = (player.vy + ay) * 0.85;

	if (player.dashCooldown > 0) player.dashCooldown--;

	player.z += player.vz;
	player.vz -= 0.5;
	if (player.z < 0) { player.z = 0; player.vz = 0; }

	const nx = player.x + player.vx, ny = player.y + player.vy;
	if (!isSolid(nx, player.y)) player.x = nx;
	if (!isSolid(player.x, ny)) player.y = ny;

	camera.x += (player.x - canvas.width / 2 - camera.x) * 0.1;
	camera.y += (player.y - canvas.height / 2 - camera.y) * 0.1;

	// Update Debug Text
	const debugPos = document.getElementById('player-pos');
	if (debugPos) debugPos.innerText = `X: ${Math.floor(player.x)} Y: ${Math.floor(player.y)}`;

	updateUI();
}

function isSolid(x, y) {
	const tx = Math.floor(x / TILE_SIZE), ty = Math.floor(y / TILE_SIZE);
	if (tx < 0 || tx >= MAP_WIDTH || ty < 0 || ty >= MAP_HEIGHT) return true;
	if (!map[tx]) return true;
	return [TILE.WALL, TILE.SHELF, TILE.WATER].includes(map[tx][ty]);
}

function updateUI() {
	const near = getNear();
	const uiLayer = document.getElementById('ui-layer');
	if (!uiLayer) return;

	if (editor.mode === 'edit') {
		uiLayer.classList.remove('visible');
		return;
	}

	if (near) {
		uiLayer.classList.add('visible');
	} else {
		uiLayer.classList.remove('visible');
	}
}

function getNear() {
	const item = items.find(i => Math.hypot(i.x * TILE_SIZE + 20 - player.x, i.y * TILE_SIZE + 20 - player.y) < 50);
	return item ? { type: 'item', data: item.data } : null;
}

/**
 * WORLD LOADING
 */
async function loadWorld(path) {
	try {
		const response = await fetch(path, { cache: 'no-store' });
		if (!response.ok) return false;
		const text = await response.text();
		const parsed = parseWorld(text);
		if (!parsed) return false;
		MAP_WIDTH = parsed.width;
		MAP_HEIGHT = parsed.height;
		CHUNK_SIZE = parsed.chunkSize;
		map = parsed.map;
		items = parsed.items;
		noteCursor = items.length;
		return true;
	} catch (err) {
		console.warn('World load failed:', err);
		return false;
	}
}

function parseWorld(text) {
	const lines = text.split(/\r?\n/);
	let width = 0;
	let height = 0;
	let chunkSize = CHUNK_SIZE;
	let noteIndex = 0;

	const charToTile = {
		'.': TILE.GRASS,
		'w': TILE.WOOD,
		's': TILE.STONE,
		'~': TILE.WATER,
		'S': TILE.SAND,
		'#': TILE.WALL,
		'B': TILE.SHELF,
		'T': TILE.TABLE
	};

	const localMap = [];
	const localItems = [];

	function initMap() {
		for (let x = 0; x < width; x++) {
			localMap[x] = [];
			for (let y = 0; y < height; y++) localMap[x][y] = TILE.GRASS;
		}
	}

	let i = 0;
	while (i < lines.length) {
		const raw = lines[i];
		const line = raw.trim();
		i++;
		if (!line || line.startsWith(';')) continue;

		const parts = line.split(/\s+/);
		if (parts[0] === 'size' && parts.length >= 3) {
			width = Number(parts[1]);
			height = Number(parts[2]);
			if (!Number.isFinite(width) || !Number.isFinite(height)) return null;
			initMap();
			continue;
		}
		if (parts[0] === 'chunk_size' && parts.length >= 2) {
			const sizeValue = Number(parts[1]);
			if (Number.isFinite(sizeValue) && sizeValue > 0) chunkSize = sizeValue;
			continue;
		}
		if (parts[0] === 'chunk' && parts.length >= 3) {
			if (!width || !height) return null;
			const chunkX = Number(parts[1]);
			const chunkY = Number(parts[2]);
			if (!Number.isFinite(chunkX) || !Number.isFinite(chunkY)) return null;

			let row = 0;
			while (row < chunkSize && i < lines.length) {
				const rowRaw = lines[i];
				const rowLine = rowRaw.trimEnd();
				i++;
				if (!rowLine || rowLine.trim().startsWith(';')) continue;
				const padded = rowLine.padEnd(chunkSize, '.');
				for (let col = 0; col < chunkSize; col++) {
					const tileChar = padded[col] || '.';
					const tile = charToTile[tileChar] ?? TILE.GRASS;
					const x = chunkX * chunkSize + col;
					const y = chunkY * chunkSize + row;
					if (x >= 0 && x < width && y >= 0 && y < height) {
						localMap[x][y] = tile;
						if (tile === TILE.SHELF) {
							localItems.push({
								x,
								y,
								data: MOCK_NOTES[noteIndex % MOCK_NOTES.length]
							});
							noteIndex += 1;
						}
					}
				}
				row++;
			}
		}
	}

	if (!width || !height || !localMap.length) return null;
	return { width, height, chunkSize, map: localMap, items: localItems };
}

function hideLoading() {
	const loading = document.getElementById('loading');
	if (loading) loading.style.display = 'none';
}

/**
 * EDITOR UI + INPUT
 */
function setupEditorUI() {
	const panel = document.getElementById('editor-panel');
	const modeIndicator = document.getElementById('mode-indicator');
	const tilePalette = document.getElementById('tile-palette');
	const toolButtons = Array.from(document.querySelectorAll('.tool-btn[data-tool]'));
	const zoomValue = document.getElementById('zoom-value');
	const zoomIn = document.getElementById('zoom-in');
	const zoomOut = document.getElementById('zoom-out');
	const exportBtn = document.getElementById('export-world');
	const exportModal = document.getElementById('export-modal');
	const exportClose = document.getElementById('export-close');

	if (!panel || !modeIndicator || !tilePalette) return;

	tilePalette.innerHTML = '';
	TILE_DEFS.forEach(def => {
		const swatch = document.createElement('div');
		swatch.className = 'tile-swatch';
		swatch.title = def.label;
		swatch.style.background = def.color;
		swatch.dataset.tileId = String(def.id);
		swatch.addEventListener('click', () => {
			editor.tile = def.id;
			updatePaletteUI();
		});
		tilePalette.appendChild(swatch);
	});

	toolButtons.forEach(btn => {
		btn.addEventListener('click', () => {
			editor.tool = btn.dataset.tool;
			updateToolUI();
		});
	});

	if (zoomIn) zoomIn.addEventListener('click', () => setZoom(editor.zoom + 0.1));
	if (zoomOut) zoomOut.addEventListener('click', () => setZoom(editor.zoom - 0.1));

	if (exportBtn) {
		exportBtn.addEventListener('click', () => {
			openExportModal();
		});
	}
	if (exportClose) exportClose.addEventListener('click', closeExportModal);

	function updatePanel() {
		modeIndicator.textContent = editor.mode === 'edit' ? 'EDIT' : 'PLAY';
		modeIndicator.style.background = editor.mode === 'edit' ? '#1565c0' : '#2e7d32';
		panel.classList.toggle('hidden', editor.mode !== 'edit');
		updateToolUI();
		updatePaletteUI();
		updateZoomUI();
		if (exportModal) exportModal.style.display = isExportOpen ? 'flex' : 'none';
	}

	function updateToolUI() {
		toolButtons.forEach(btn => {
			btn.classList.toggle('active', btn.dataset.tool === editor.tool);
		});
	}

	function updatePaletteUI() {
		const swatches = Array.from(tilePalette.querySelectorAll('.tile-swatch'));
		swatches.forEach(swatch => {
			swatch.classList.toggle('active', Number(swatch.dataset.tileId) === editor.tile);
		});
	}

	function updateZoomUI() {
		if (zoomValue) zoomValue.textContent = `${editor.zoom.toFixed(1)}x`;
	}

	updatePanel();

	editor.updatePanel = updatePanel;
	editor.updatePaletteUI = updatePaletteUI;
	editor.updateToolUI = updateToolUI;
	editor.updateZoomUI = updateZoomUI;
}

function setupEditorInput() {
	if (!canvas) return;

	canvas.addEventListener('mousedown', e => {
		if (editor.mode !== 'edit') return;
		if (e.button === 2) {
			editor.dragging = false;
			editor.dragStart = null;
			editor.dragCurrent = null;
			editor.panStart = { x: e.clientX, y: e.clientY };
			editor.cameraStart = { x: camera.x, y: camera.y };
			return;
		}
		if (e.button !== 0) return;
		editor.dragging = true;
		editor.dragStart = screenToWorld(e.clientX, e.clientY);
		editor.dragCurrent = editor.dragStart;
		if (editor.tool === 'paint' || editor.tool === 'erase') {
			paintAt(editor.dragStart);
		}
	});

	canvas.addEventListener('mousemove', e => {
		if (editor.mode !== 'edit') return;
		if (editor.panStart && editor.cameraStart) {
			const dx = (e.clientX - editor.panStart.x) / editor.zoom;
			const dy = (e.clientY - editor.panStart.y) / editor.zoom;
			camera.x = editor.cameraStart.x - dx;
			camera.y = editor.cameraStart.y - dy;
			return;
		}
		if (!editor.dragging) return;
		editor.dragCurrent = screenToWorld(e.clientX, e.clientY);
		if (editor.tool === 'paint' || editor.tool === 'erase') {
			paintAt(editor.dragCurrent);
		}
	});

	window.addEventListener('mouseup', e => {
		if (editor.mode !== 'edit') return;
		if (editor.panStart) {
			editor.panStart = null;
			editor.cameraStart = null;
			return;
		}
		if (e.button !== 0) return;
		if (!editor.dragging) return;
		editor.dragging = false;
		if (editor.tool === 'rect') applyRect(editor.dragStart, editor.dragCurrent);
		if (editor.tool === 'circle') applyCircle(editor.dragStart, editor.dragCurrent);
		editor.dragStart = null;
		editor.dragCurrent = null;
	});

	canvas.addEventListener('mouseleave', () => {
		if (editor.mode !== 'edit') return;
		editor.dragging = false;
		editor.dragStart = null;
		editor.dragCurrent = null;
		editor.panStart = null;
		editor.cameraStart = null;
	});

	canvas.addEventListener('contextmenu', e => {
		if (editor.mode === 'edit') e.preventDefault();
	});

	canvas.addEventListener('wheel', e => {
		if (editor.mode !== 'edit') return;
		e.preventDefault();
		const delta = e.deltaY > 0 ? -0.1 : 0.1;
		setZoom(editor.zoom + delta);
	}, { passive: false });
}

function toggleEditMode() {
	editor.mode = editor.mode === 'edit' ? 'play' : 'edit';
	if (editor.updatePanel) editor.updatePanel();
	const uiLayer = document.getElementById('ui-layer');
	if (uiLayer && editor.mode === 'edit') uiLayer.classList.remove('visible');
}

function setZoom(value) {
	editor.zoom = Math.min(3, Math.max(0.5, Number(value.toFixed(2))));
	if (editor.updateZoomUI) editor.updateZoomUI();
}

function screenToWorld(clientX, clientY) {
	const rect = canvas.getBoundingClientRect();
	const sx = clientX - rect.left;
	const sy = clientY - rect.top;
	return {
		x: sx / editor.zoom + camera.x,
		y: sy / editor.zoom + camera.y
	};
}

function worldToTile(pos) {
	return {
		x: Math.floor(pos.x / TILE_SIZE),
		y: Math.floor(pos.y / TILE_SIZE)
	};
}

function setTile(tx, ty, tile) {
	if (tx < 0 || ty < 0 || tx >= MAP_WIDTH || ty >= MAP_HEIGHT) return;
	if (!map[tx]) map[tx] = [];
	const prev = map[tx][ty];
	if (prev === tile) return;
	map[tx][ty] = tile;

	const itemIndex = items.findIndex(i => i.x === tx && i.y === ty);
	if (itemIndex !== -1 && tile !== TILE.SHELF) {
		items.splice(itemIndex, 1);
	}
	if (tile === TILE.SHELF) {
		if (itemIndex === -1) {
			items.push({
				x: tx,
				y: ty,
				data: MOCK_NOTES[noteCursor % MOCK_NOTES.length]
			});
			noteCursor += 1;
		}
	}
}

function paintAt(pos) {
	const tilePos = worldToTile(pos);
	const tile = editor.tool === 'erase' ? TILE.GRASS : editor.tile;
	setTile(tilePos.x, tilePos.y, tile);
}

function applyRect(start, end) {
	if (!start || !end) return;
	const a = worldToTile(start);
	const b = worldToTile(end);
	const minX = Math.min(a.x, b.x);
	const maxX = Math.max(a.x, b.x);
	const minY = Math.min(a.y, b.y);
	const maxY = Math.max(a.y, b.y);
	const tile = editor.tool === 'erase' ? TILE.GRASS : editor.tile;
	for (let x = minX; x <= maxX; x++) {
		for (let y = minY; y <= maxY; y++) {
			setTile(x, y, tile);
		}
	}
}

function applyCircle(start, end) {
	if (!start || !end) return;
	const a = worldToTile(start);
	const b = worldToTile(end);
	const dx = b.x - a.x;
	const dy = b.y - a.y;
	const radius = Math.max(1, Math.round(Math.hypot(dx, dy)));
	const tile = editor.tool === 'erase' ? TILE.GRASS : editor.tile;
	for (let x = a.x - radius; x <= a.x + radius; x++) {
		for (let y = a.y - radius; y <= a.y + radius; y++) {
			if ((x - a.x) ** 2 + (y - a.y) ** 2 <= radius ** 2) {
				setTile(x, y, tile);
			}
		}
	}
}

function openExportModal() {
	const exportModal = document.getElementById('export-modal');
	const exportText = document.getElementById('export-text');
	if (!exportModal || !exportText) return;
	exportText.value = serializeWorld();
	isExportOpen = true;
	exportModal.style.display = 'flex';
}

function closeExportModal() {
	const exportModal = document.getElementById('export-modal');
	if (!exportModal) return;
	isExportOpen = false;
	exportModal.style.display = 'none';
}

function serializeWorld() {
	const chunksX = Math.ceil(MAP_WIDTH / CHUNK_SIZE);
	const chunksY = Math.ceil(MAP_HEIGHT / CHUNK_SIZE);
	const tileToChar = {};
	TILE_DEFS.forEach(def => { tileToChar[def.id] = def.char; });

	const lines = [];
	lines.push('; World export');
	lines.push(`size ${MAP_WIDTH} ${MAP_HEIGHT}`);
	lines.push(`chunk_size ${CHUNK_SIZE}`);
	lines.push('');
	for (let cy = 0; cy < chunksY; cy++) {
		for (let cx = 0; cx < chunksX; cx++) {
			lines.push(`chunk ${cx} ${cy}`);
			for (let row = 0; row < CHUNK_SIZE; row++) {
				let line = '';
				for (let col = 0; col < CHUNK_SIZE; col++) {
					const x = cx * CHUNK_SIZE + col;
					const y = cy * CHUNK_SIZE + row;
					if (x >= MAP_WIDTH || y >= MAP_HEIGHT) {
						line += '.';
					} else {
						line += tileToChar[map[x][y]] || '.';
					}
				}
				lines.push(line);
			}
			lines.push('');
		}
	}
	return lines.join('\n');
}

/**
 * RENDER HELPERS
 */
function drawBooks(px, py) {
	const colors = ['#ef5350', '#ec407a', '#ab47bc', '#42a5f5', '#26a69a', '#ffca28'];
	const seed = (Math.floor(px / TILE_SIZE) * 73856093) ^ (Math.floor(py / TILE_SIZE) * 19349663);
	const count = 3 + (Math.abs(seed) % 3);
	for (let i = 0; i < count; i++) {
		const color = colors[(seed + i) % colors.length];
		const w = 6 + ((seed + i * 3) % 6);
		const h = 16 + ((seed + i * 7) % 10);
		const x = px + 6 + i * 10;
		const y = py + TILE_SIZE - h - 4;
		ctx.fillStyle = color;
		ctx.fillRect(x, y, w, h);
		ctx.fillStyle = 'rgba(255, 255, 255, 0.4)';
		ctx.fillRect(x + 1, y + 2, w - 2, 2);
	}
}

function drawGrid() {
	const viewWidth = canvas.width / editor.zoom;
	const viewHeight = canvas.height / editor.zoom;
	const startX = Math.floor(camera.x / TILE_SIZE) * TILE_SIZE;
	const startY = Math.floor(camera.y / TILE_SIZE) * TILE_SIZE;
	const endX = camera.x + viewWidth + TILE_SIZE;
	const endY = camera.y + viewHeight + TILE_SIZE;

	ctx.strokeStyle = 'rgba(0, 0, 0, 0.15)';
	ctx.lineWidth = 1;

	for (let x = startX; x <= endX; x += TILE_SIZE) {
		ctx.beginPath();
		ctx.moveTo(x, startY);
		ctx.lineTo(x, endY);
		ctx.stroke();
	}
	for (let y = startY; y <= endY; y += TILE_SIZE) {
		ctx.beginPath();
		ctx.moveTo(startX, y);
		ctx.lineTo(endX, y);
		ctx.stroke();
	}
}

function drawDragPreview() {
	if (!editor.dragStart || !editor.dragCurrent) return;
	if (editor.tool !== 'rect' && editor.tool !== 'circle') return;
	const a = worldToTile(editor.dragStart);
	const b = worldToTile(editor.dragCurrent);
	ctx.save();
	ctx.strokeStyle = 'rgba(21, 101, 192, 0.8)';
	ctx.lineWidth = 2;
	if (editor.tool === 'rect') {
		const minX = Math.min(a.x, b.x) * TILE_SIZE;
		const minY = Math.min(a.y, b.y) * TILE_SIZE;
		const maxX = Math.max(a.x, b.x) * TILE_SIZE + TILE_SIZE;
		const maxY = Math.max(a.y, b.y) * TILE_SIZE + TILE_SIZE;
		ctx.strokeRect(minX, minY, maxX - minX, maxY - minY);
	}
	if (editor.tool === 'circle') {
		const dx = b.x - a.x;
		const dy = b.y - a.y;
		const radius = Math.max(1, Math.round(Math.hypot(dx, dy)));
		ctx.beginPath();
		ctx.arc(a.x * TILE_SIZE + TILE_SIZE / 2, a.y * TILE_SIZE + TILE_SIZE / 2, radius * TILE_SIZE, 0, Math.PI * 2);
		ctx.stroke();
	}
	ctx.restore();
}

/**
 * MODAL
 */
function openModal(title, contentText) {
	isModalOpen = true;
	const titleElem = document.getElementById('note-title');
	const contentElem = document.getElementById('note-content');
	const modal = document.getElementById('note-modal');

	if (titleElem) titleElem.innerText = title;
	if (contentElem) contentElem.innerText = contentText;
	if (modal) modal.style.display = 'flex';
}

function closeModal() {
	isModalOpen = false;
	const modal = document.getElementById('note-modal');
	if (modal) modal.style.display = 'none';
}

/**
 * RENDERING
 */
function draw() {
	if (!ctx || !canvas) return;
	ctx.setTransform(1, 0, 0, 1, 0, 0);
	ctx.clearRect(0, 0, canvas.width, canvas.height);
	ctx.setTransform(editor.zoom, 0, 0, editor.zoom, -camera.x * editor.zoom, -camera.y * editor.zoom);

	const viewWidth = canvas.width / editor.zoom;
	const viewHeight = canvas.height / editor.zoom;
	for (let x = 0; x < MAP_WIDTH; x++) {
		for (let y = 0; y < MAP_HEIGHT; y++) {
			const px = x * TILE_SIZE, py = y * TILE_SIZE;
			if (px < camera.x - 50 || px > camera.x + viewWidth + 50 ||
				py < camera.y - 50 || py > camera.y + viewHeight + 50) continue;

			const color = TILE_COLORS[map[x][y]] || '#fff';
			ctx.fillStyle = color;
			ctx.fillRect(px, py, TILE_SIZE, TILE_SIZE);
			if (map[x][y] === TILE.SHELF) drawBooks(px, py);
		}
	}

	if (editor.mode === 'edit') {
		drawGrid();
		drawDragPreview();
	}

	// Shadow under player
	const shadowScale = Math.max(0.2, 1 - player.z / 60);
	ctx.save();
	ctx.fillStyle = 'rgba(0, 0, 0, 0.35)';
	ctx.beginPath();
	ctx.ellipse(player.x, player.y, player.radius * 1.1 * shadowScale, player.radius * 0.6 * shadowScale, 0, 0, Math.PI * 2);
	ctx.fill();
	ctx.restore();

	ctx.fillStyle = COLORS.player;
	ctx.beginPath();
	ctx.arc(player.x, player.y - player.z, player.radius, 0, Math.PI * 2);
	ctx.fill();

	ctx.setTransform(1, 0, 0, 1, 0, 0);
}

function gameLoop() {
	update();
	draw();
	requestAnimationFrame(gameLoop);
}

function resize() {
	if (canvas) {
		canvas.width = window.innerWidth;
		canvas.height = window.innerHeight;
	}
}

// Global Listeners
window.addEventListener('keydown', e => {
	keys[e.code] = true;
	if (editor.mode === 'edit' && e.code !== 'KeyP' && e.code !== 'Escape') return;
	if (e.code === 'KeyE') {
		const near = getNear();
		if (near) openModal(near.data.title, near.data.content);
	}
	if (e.code === 'Space' && !isModalOpen && player.dashCooldown === 0) {
		player.vz = 6;
		player.vx *= 2.5;
		player.vy *= 2.5;
		player.dashCooldown = 30;
	}
	if (e.code === 'Escape') {
		if (isExportOpen) closeExportModal();
		else closeModal();
	}
	if (e.code === 'KeyP') toggleEditMode();
});
window.addEventListener('keyup', e => { keys[e.code] = false; });
window.addEventListener('resize', resize);

window.addEventListener('DOMContentLoaded', () => {
	log("DOM Loaded. Initializing Canvas...");
	canvas = document.getElementById('gameCanvas');
	if (canvas) {
		ctx = canvas.getContext('2d');
		resize();
		init();
	}

	setupEditorUI();
	setupEditorInput();
});

// Expose for inline handlers
window.teleportToCenter = teleportToCenter;
window.resetPlayer = resetPlayer;
window.closeModal = closeModal;
window.toggleEditMode = toggleEditMode;
