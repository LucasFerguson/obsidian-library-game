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
let map = [], items = [], tables = [], keys = {}, isModalOpen = false;
let camera = { x: 0, y: 0 };
const player = { x: 0, y: 0, vx: 0, vy: 0, radius: 12, z: 0, vz: 0, dashCooldown: 0 };
let noteCursor = 0;
let roomCounter = 0;
const roomStack = [];
const roomsById = new Map();
let currentRoom = null;
let transition = {
	active: false,
	type: null,
	t: 0,
	duration: 180,
	scale: 1,
	fromScale: 1,
	toScale: 1,
	fromRoom: null,
	toRoom: null,
	fromPlayer: null,
	toPlayer: null,
	pivotWorld: null,
	switched: false,
	swapAt: 0.2,
	ease: 0
};
let preloadedRooms = [];
let isExportOpen = false;
let debugTick = 0;

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
	if (!currentRoom) {
		const room = createBlankRoom(MAP_WIDTH, MAP_HEIGHT);
		room.map = map;
		room.items = items;
		room.tables = tables;
		roomStack.push(room);
		roomsById.set(room.id, room);
		setCurrentRoom(room);
	}
	await loadPreloadedRooms();
	teleportToCenter();
	hideLoading();
	log("Starting game loop...");
	requestAnimationFrame(gameLoop);
}

function generateProceduralMap() {
	const room = createBlankRoom(MAP_WIDTH, MAP_HEIGHT);
	const cx = Math.floor(room.width / 2), cy = Math.floor(room.height / 2);
	fillAreaInRoom(room, cx - 7, cy - 7, 14, 14, TILE.WOOD);
	fillAreaInRoom(room, cx - 1, cy - 30, 3, 60, TILE.STONE);
	fillAreaInRoom(room, cx - 30, cy - 1, 60, 3, TILE.STONE);

	for (let i = 0; i < 30; i++) {
		let rx = Math.floor(Math.random() * 20) + cx - 10;
		let ry = Math.floor(Math.random() * 20) + cy - 10;
		if (room.map[rx][ry] === TILE.WOOD) {
			room.map[rx][ry] = TILE.SHELF;
			room.items.push({ x: rx, y: ry, data: MOCK_NOTES[i % MOCK_NOTES.length] });
		}
	}
	noteCursor = room.items.length;
	setCurrentRoom(room);
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
	if (isModalOpen || transition.active || !canvas) return;
	debugTick++;

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
	if (debugPos) debugPos.innerText = `Player: X ${Math.floor(player.x)} Y ${Math.floor(player.y)}`;
	if (debugTick % 30 === 0) updateDebugOverlay();

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
	if (item) return { type: 'item', data: item.data };
	const table = tables.find(t => Math.hypot(t.x * TILE_SIZE + 20 - player.x, t.y * TILE_SIZE + 20 - player.y) < 50);
	return table ? { type: 'table', data: table } : null;
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
		tables = parsed.tables || [];
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
	const localTables = [];

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
						if (tile === TILE.TABLE) {
							localTables.push({ x, y, roomId: null });
						}
					}
				}
				row++;
			}
		}
	}

	if (!width || !height || !localMap.length) return null;
	return { width, height, chunkSize, map: localMap, items: localItems, tables: localTables };
}

function roomFromWorldText(text) {
	const parsed = parseWorld(text);
	if (!parsed) return null;
	const room = createBlankRoom(parsed.width, parsed.height);
	room.map = parsed.map;
	room.items = parsed.items || [];
	room.tables = parsed.tables || [];
	return room;
}

async function loadPreloadedRooms() {
	try {
		const response = await fetch('worlds/rooms/index.json', { cache: 'no-store' });
		if (!response.ok) return;
		const data = await response.json();
		const roomFiles = Array.isArray(data.rooms) ? data.rooms : [];
		const loadedRooms = [];
		for (const file of roomFiles) {
			try {
				const roomResp = await fetch(`worlds/rooms/${file}`, { cache: 'no-store' });
				if (!roomResp.ok) continue;
				const text = await roomResp.text();
				const room = roomFromWorldText(text);
				if (room) {
					room.id = `pre-${room.id}`;
					roomsById.set(room.id, room);
					loadedRooms.push(room);
				}
			} catch (err) {
				log(`Failed to load room ${file}`);
			}
		}
		preloadedRooms = loadedRooms;
		assignPreloadedRooms();
	} catch (err) {
		log('No preloaded rooms index found.');
	}
}

function assignPreloadedRooms() {
	if (!currentRoom || !preloadedRooms.length) return;
	let idx = 0;
	for (const table of currentRoom.tables) {
		if (idx >= preloadedRooms.length) break;
		if (!table.roomId) {
			table.roomId = preloadedRooms[idx].id;
			preloadedRooms[idx].parentId = currentRoom.id;
			preloadedRooms[idx].parentTable = { x: table.x, y: table.y };
			idx += 1;
		}
	}
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
		swatch.textContent = def.label;
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

function setupPanelToggles() {
	const debugPanel = document.getElementById('debug-console');
	const editorPanel = document.getElementById('editor-panel');
	const controlsPanel = document.querySelector('.controls-hint');
	const toggleDebug = document.getElementById('toggle-debug');
	const toggleEditor = document.getElementById('toggle-editor');
	const toggleControls = document.getElementById('toggle-controls');

	if (toggleDebug && debugPanel) {
		toggleDebug.addEventListener('click', () => {
			debugPanel.classList.toggle('hidden');
		});
	}
	if (toggleEditor && editorPanel) {
		toggleEditor.addEventListener('click', () => {
			editorPanel.classList.toggle('hidden');
		});
	}
	if (toggleControls && controlsPanel) {
		toggleControls.addEventListener('click', () => {
			controlsPanel.classList.toggle('hidden');
		});
	}
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

	const tableIndex = tables.findIndex(t => t.x === tx && t.y === ty);
	if (tableIndex !== -1 && tile !== TILE.TABLE) {
		tables.splice(tableIndex, 1);
	}
	if (tile === TILE.TABLE && tableIndex === -1) {
		tables.push({
			x: tx,
			y: ty,
			roomId: null
		});
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

function drawTablePreview(tx, ty, px, py) {
	const table = tables.find(t => t.x === tx && t.y === ty);
	if (!table || !table.roomId) return;
	const room = roomsById.get(table.roomId);
	if (!room) return;

	// outline indicator
	ctx.strokeStyle = 'rgba(255, 255, 255, 0.6)';
	ctx.lineWidth = 2;
	ctx.strokeRect(px + 4, py + 4, TILE_SIZE - 8, TILE_SIZE - 8);

	// mini-map preview
	const previewSize = TILE_SIZE - 12;
	const cellSize = previewSize / 6;
	const startX = px + 6;
	const startY = py + 6;
	for (let i = 0; i < 6; i++) {
		for (let j = 0; j < 6; j++) {
			const mx = Math.floor((i / 6) * room.width);
			const my = Math.floor((j / 6) * room.height);
			const tile = room.map[mx]?.[my] ?? TILE.GRASS;
			const color = TILE_COLORS[tile] || '#fff';
			ctx.fillStyle = color;
			ctx.fillRect(startX + i * cellSize, startY + j * cellSize, cellSize, cellSize);
		}
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
 * ROOMS
 */
function createBlankRoom(width, height) {
	const room = {
		id: `room-${roomCounter++}`,
		width,
		height,
		map: [],
		items: [],
		tables: [],
		parentId: null,
		parentTable: null
	};
	for (let x = 0; x < width; x++) {
		room.map[x] = [];
		for (let y = 0; y < height; y++) room.map[x][y] = TILE.GRASS;
	}
	return room;
}

function setCurrentRoom(room) {
	currentRoom = room;
	MAP_WIDTH = room.width;
	MAP_HEIGHT = room.height;
	map = room.map;
	items = room.items;
	tables = room.tables;
	updateBreadcrumb();
}

function fillAreaInRoom(room, x, y, w, h, t) {
	for (let i = x; i < x + w; i++) {
		for (let j = y; j < y + h; j++) {
			if (i >= 0 && i < room.width && j >= 0 && j < room.height) {
				room.map[i][j] = t;
			}
		}
	}
}

function generateMiniRoom(depth = 0) {
	const size = 20;
	const room = createBlankRoom(size, size);
	fillAreaInRoom(room, 0, 0, size, 1, TILE.WALL);
	fillAreaInRoom(room, 0, size - 1, size, 1, TILE.WALL);
	fillAreaInRoom(room, 0, 0, 1, size, TILE.WALL);
	fillAreaInRoom(room, size - 1, 0, 1, size, TILE.WALL);

	const tableCount = Math.max(1, Math.floor(size / 8));
	for (let i = 0; i < tableCount; i++) {
		const tx = 2 + Math.floor(Math.random() * (size - 4));
		const ty = 2 + Math.floor(Math.random() * (size - 4));
		room.map[tx][ty] = TILE.TABLE;
		room.tables.push({ x: tx, y: ty, roomId: null });
	}
	return room;
}

function enterTableRoom(table) {
	if (!currentRoom) return;
	let targetRoom = null;
	if (table.roomId) {
		targetRoom = roomStack.find(r => r.id === table.roomId) || null;
	}
	if (!targetRoom) {
		targetRoom = generateMiniRoom(roomStack.length);
		targetRoom.parentId = currentRoom.id;
		targetRoom.parentTable = { x: table.x, y: table.y };
		table.roomId = targetRoom.id;
		roomStack.push(targetRoom);
		roomsById.set(targetRoom.id, targetRoom);
	}
	startTransition('enter', currentRoom, targetRoom);
}

function leaveTableRoom() {
	if (!currentRoom || !currentRoom.parentId) return;
	const parentRoom = roomsById.get(currentRoom.parentId) || roomStack.find(r => r.id === currentRoom.parentId);
	if (!parentRoom) return;
	startTransition('leave', currentRoom, parentRoom);
}

function updateBreadcrumb() {
	const crumb = document.getElementById('room-breadcrumb');
	if (!crumb || !currentRoom) return;
	const depth = roomStack.indexOf(currentRoom);
	const label = depth >= 0 ? `Room: Depth ${depth}` : 'Room: Root';
	crumb.textContent = label;
}

function updateDebugOverlay() {
	const cameraPos = document.getElementById('camera-pos');
	const zoomPos = document.getElementById('zoom-pos');
	const pivotPos = document.getElementById('pivot-pos');
	const transitionPos = document.getElementById('transition-pos');

	if (cameraPos) cameraPos.textContent = `Camera: X ${camera.x.toFixed(1)} Y ${camera.y.toFixed(1)}`;
	if (zoomPos) zoomPos.textContent = `Zoom: ${editor.zoom.toFixed(2)}`;
	if (pivotPos) {
		const pivot = transition.active && transition.pivotWorld
			? transition.pivotWorld
			: { x: camera.x + canvas.width / (2 * editor.zoom), y: camera.y + canvas.height / (2 * editor.zoom) };
		pivotPos.textContent = `Pivot: X ${pivot.x.toFixed(1)} Y ${pivot.y.toFixed(1)}`;
	}
	if (transitionPos) {
		if (!transition.active) {
			transitionPos.textContent = 'Transition: idle';
		} else {
			transitionPos.textContent = `Transition: ${transition.type} t=${transition.t}/${transition.duration} scale=${transition.scale.toFixed(2)}`;
		}
	}

	if (debugTick % 120 === 0) {
		console.log('[Debug]', {
			player: { x: player.x.toFixed(1), y: player.y.toFixed(1), z: player.z.toFixed(1) },
			camera: { x: camera.x.toFixed(1), y: camera.y.toFixed(1) },
			zoom: editor.zoom.toFixed(2),
			pivot: transition.pivotWorld,
			transition: transition.active ? `${transition.type} ${transition.t}/${transition.duration}` : 'idle'
		});
	}
}

function startTransition(type, fromRoom, toRoom) {
	if (transition.active) return;
	transition.active = true;
	transition.type = type;
	transition.t = 0;
	transition.duration = 180;
	transition.fromScale = type === 'enter' ? 0.2 : 1;
	transition.toScale = type === 'enter' ? 1 : 0.2;
	transition.scale = transition.fromScale;
	transition.fromRoom = fromRoom;
	transition.toRoom = toRoom;
	transition.fromPlayer = { x: player.x, y: player.y, z: player.z };
	transition.toPlayer = null;
	transition.pivotWorld = null;
	transition.switched = false;
	transition.ease = 0;

	if (type === 'leave' && fromRoom.parentTable) {
		const exitX = (fromRoom.parentTable.x + 1) * TILE_SIZE + 20;
		const exitY = (fromRoom.parentTable.y) * TILE_SIZE + 20;
		transition.toPlayer = { x: exitX, y: exitY, z: 0 };
		transition.pivotWorld = { x: exitX, y: exitY };
	}
	if (type === 'enter' && fromRoom && toRoom && fromRoom.parentId !== toRoom.id) {
		const table = fromRoom.tables?.find(t => t.roomId === toRoom.id);
		if (table) {
			transition.pivotWorld = {
				x: table.x * TILE_SIZE + TILE_SIZE / 2,
				y: table.y * TILE_SIZE + TILE_SIZE / 2
			};
		}
	}

	const step = () => {
		if (!transition.active) return;
		transition.t += 1;
		const p = Math.min(1, transition.t / transition.duration);
		transition.ease = easeInOut(p);
		if (!transition.switched && p >= transition.swapAt) {
			setCurrentRoom(transition.toRoom);
			transition.switched = true;
		}
		transition.scale = transition.fromScale + (transition.toScale - transition.fromScale) * transition.ease;
		if (transition.t >= transition.duration) {
			finishTransition();
		} else {
			requestAnimationFrame(step);
		}
	};
	requestAnimationFrame(step);
}

function finishTransition() {
	if (!transition.active) return;
	if (transition.type === 'enter') {
		setCurrentRoom(transition.toRoom);
		teleportToCenter();
		player.vz = 3;
	} else if (transition.type === 'leave') {
		setCurrentRoom(transition.toRoom);
		if (transition.toPlayer) {
			player.x = transition.toPlayer.x;
			player.y = transition.toPlayer.y;
			player.vz = 4;
			player.z = 0;
		} else {
			teleportToCenter();
		}
	}
	transition.active = false;
	transition.type = null;
	transition.scale = 1;
	transition.ease = 0;
}

function easeInOut(t) {
	return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
}

function lerp(a, b, t) {
	return a + (b - a) * t;
}

function drawRoomLayer(room, scaleFactor, alpha, pivotWorld = null) {
	const prev = currentRoom;
	setCurrentRoom(room);
	ctx.save();
	ctx.globalAlpha = alpha;
	const scale = editor.zoom * scaleFactor;
	const pivot = pivotWorld || { x: camera.x + canvas.width / (2 * editor.zoom), y: camera.y + canvas.height / (2 * editor.zoom) };
	const screenPivotX = (pivot.x - camera.x) * editor.zoom;
	const screenPivotY = (pivot.y - camera.y) * editor.zoom;
	// Tiles draw from top-left (px, py). Pivot is in world coords and we scale around it.
	ctx.translate(screenPivotX, screenPivotY);
	ctx.scale(scale, scale);
	ctx.translate(-pivot.x, -pivot.y);

	const viewWidth = canvas.width / scale;
	const viewHeight = canvas.height / scale;
	for (let x = 0; x < MAP_WIDTH; x++) {
		for (let y = 0; y < MAP_HEIGHT; y++) {
			const px = x * TILE_SIZE, py = y * TILE_SIZE;
			if (px < camera.x - 50 || px > camera.x + viewWidth + 50 ||
				py < camera.y - 50 || py > camera.y + viewHeight + 50) continue;
			const color = TILE_COLORS[map[x][y]] || '#fff';
			ctx.fillStyle = color;
			ctx.fillRect(px, py, TILE_SIZE, TILE_SIZE);
			if (map[x][y] === TILE.SHELF) drawBooks(px, py);
			if (map[x][y] === TILE.TABLE) drawTablePreview(x, y, px, py);
		}
	}
	ctx.restore();
	setCurrentRoom(prev);
}

/**
 * RENDERING
 */
function draw() {
	if (!ctx || !canvas) return;
	drawSceneWithBackground();
}

function drawSceneWithBackground() {
	if (!ctx || !canvas) return;
	ctx.setTransform(1, 0, 0, 1, 0, 0);
	ctx.clearRect(0, 0, canvas.width, canvas.height);
	if (transition.active) {
		drawTransitionLayers();
		drawDebugMarkers();
		return;
	}
	if (currentRoom && currentRoom.parentId) {
		const parentRoom = roomsById.get(currentRoom.parentId);
		if (parentRoom) drawRoomLayer(parentRoom, 1, 0.35);
	}
	const scale = editor.zoom;
	const pivotWorld = { x: camera.x + canvas.width / (2 * editor.zoom), y: camera.y + canvas.height / (2 * editor.zoom) };

	// Tiles are drawn from top-left (px, py). We scale around a world pivot to make the dive feel like it targets the table.
	const screenPivotX = (pivotWorld.x - camera.x) * editor.zoom;
	const screenPivotY = (pivotWorld.y - camera.y) * editor.zoom;
	ctx.translate(screenPivotX, screenPivotY);
	ctx.scale(scale, scale);
	ctx.translate(-pivotWorld.x, -pivotWorld.y);

	const viewWidth = canvas.width / scale;
	const viewHeight = canvas.height / scale;
	for (let x = 0; x < MAP_WIDTH; x++) {
		for (let y = 0; y < MAP_HEIGHT; y++) {
			const px = x * TILE_SIZE, py = y * TILE_SIZE;
			if (px < camera.x - 50 || px > camera.x + viewWidth + 50 ||
				py < camera.y - 50 || py > camera.y + viewHeight + 50) continue;

			const color = TILE_COLORS[map[x][y]] || '#fff';
			ctx.fillStyle = color;
			ctx.fillRect(px, py, TILE_SIZE, TILE_SIZE);
			if (map[x][y] === TILE.SHELF) drawBooks(px, py);
			if (map[x][y] === TILE.TABLE) drawTablePreview(x, y, px, py);
		}
	}

	if (editor.mode === 'edit') {
		drawGrid();
		drawDragPreview();
	}

	// Shadow under player (player size stays constant; camera/world scale does the work)
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
	drawDebugMarkers();
}

function drawTransitionLayers() {
	const ease = transition.ease;
	const enter = transition.type === 'enter';
	const pivot = transition.pivotWorld || { x: player.x, y: player.y };
	const parentRoom = transition.fromRoom;
	const childRoom = transition.toRoom;

	const parentScale = enter ? (1 + 3.2 * ease) : (3.5 - 3.0 * ease);
	const childScale = enter ? (0.25 + 0.75 * ease) : (1 - 0.8 * ease);
	const parentAlpha = enter ? (1 - 0.1 * ease) : (0.4 + 0.6 * (1 - ease));
	const childAlpha = enter ? (0.2 + 0.8 * ease) : (1 - 0.6 * ease);

	drawRoomLayer(parentRoom, parentScale, parentAlpha, pivot);
	drawRoomLayer(childRoom, childScale, childAlpha, pivot);
}

function drawDebugMarkers() {
	if (!canvas) return;
	const pivot = transition.active && transition.pivotWorld
		? transition.pivotWorld
		: { x: camera.x + canvas.width / (2 * editor.zoom), y: camera.y + canvas.height / (2 * editor.zoom) };

	const screenPivotX = (pivot.x - camera.x) * editor.zoom;
	const screenPivotY = (pivot.y - camera.y) * editor.zoom;
	const screenCenterX = canvas.width / 2;
	const screenCenterY = canvas.height / 2;
	const viewWidth = canvas.width / editor.zoom;
	const viewHeight = canvas.height / editor.zoom;
	const playerScreenX = (player.x - camera.x) * editor.zoom;
	const playerScreenY = (player.y - camera.y) * editor.zoom;

	ctx.save();
	ctx.setTransform(1, 0, 0, 1, 0, 0);
	ctx.lineWidth = 2;

	// Pivot crosshair (magenta)
	ctx.strokeStyle = 'rgba(255, 0, 200, 0.9)';
	ctx.beginPath();
	ctx.moveTo(screenPivotX - 8, screenPivotY);
	ctx.lineTo(screenPivotX + 8, screenPivotY);
	ctx.moveTo(screenPivotX, screenPivotY - 8);
	ctx.lineTo(screenPivotX, screenPivotY + 8);
	ctx.stroke();

	// Camera center crosshair (cyan)
	ctx.strokeStyle = 'rgba(0, 255, 255, 0.8)';
	ctx.beginPath();
	ctx.moveTo(screenCenterX - 8, screenCenterY);
	ctx.lineTo(screenCenterX + 8, screenCenterY);
	ctx.moveTo(screenCenterX, screenCenterY - 8);
	ctx.lineTo(screenCenterX, screenCenterY + 8);
	ctx.stroke();

	// Player marker (green)
	ctx.strokeStyle = 'rgba(0, 255, 0, 0.8)';
	ctx.beginPath();
	ctx.arc(playerScreenX, playerScreenY, 6, 0, Math.PI * 2);
	ctx.stroke();

	// View bounds (yellow) based on world-space extents
	ctx.strokeStyle = 'rgba(255, 220, 0, 0.5)';
	const left = camera.x;
	const top = camera.y;
	const right = camera.x + viewWidth;
	const bottom = camera.y + viewHeight;
	const x0 = (left - camera.x) * editor.zoom;
	const y0 = (top - camera.y) * editor.zoom;
	const x1 = (right - camera.x) * editor.zoom;
	const y1 = (bottom - camera.y) * editor.zoom;
	ctx.strokeRect(x0, y0, x1 - x0, y1 - y0);
	ctx.restore();
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
		if (near && near.type === 'item') openModal(near.data.title, near.data.content);
		if (near && near.type === 'table') enterTableRoom(near.data);
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
	if (e.code === 'KeyQ') leaveTableRoom();
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
	setupPanelToggles();
});

// Expose for inline handlers
window.teleportToCenter = teleportToCenter;
window.resetPlayer = resetPlayer;
window.closeModal = closeModal;
window.toggleEditMode = toggleEditMode;
