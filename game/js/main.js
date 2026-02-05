import * as THREE from '../vendor/three.module.js';

const WORLD_PATH = '/worlds/zen.txt';
const TILE_SIZE = 1;
const WALK_ACCEL = 0.45;
const RUN_ACCEL = 0.9;
const PAN_SPEED = 0.12;
const GRAVITY = 0.008;
const JUMP_VELOCITY = 0.2;
const JUMP_FORWARD_BOOST = 0.15;
const TURN_SPEED = 0.15;
const CAMERA_LAG = 0.12;
const MOUSE_SENSITIVITY = 0.0025;
const PITCH_MIN = -1.3;
const PITCH_MAX = 1.3;
const ZOOM_MIN = 6;
const ZOOM_MAX = 18;
const CAMERA_MIN_Y = 1.2;
const MAX_SPEED_WALK = 0.45;
const MAX_SPEED_RUN = 0.7;
const DRAG = 0.9;
const PLAYER_RADIUS = 0.32;
const PLAYER_SCALE_MIN = 0.12;
const PLAYER_SCALE_MAX = 1;
const SCALE_LERP = 0.02;
const MINI_ROOM_SCALE = 0.12;

const TILE = { VOID: 0, GRASS: 1, WOOD: 2, STONE: 3, WATER: 4, SAND: 5, WALL: 6, SHELF: 7, TABLE: 8 };

const TILE_DEFS = [
	{ id: TILE.GRASS, label: 'Grass', color: 0x66bb6a, height: 0.2, char: '.' },
	{ id: TILE.WOOD, label: 'Wood', color: 0xd7ccc8, height: 0.2, char: 'w' },
	{ id: TILE.STONE, label: 'Stone', color: 0xcfd8dc, height: 0.2, char: 's' },
	{ id: TILE.WATER, label: 'Water', color: 0x4fc3f7, height: 0.06, char: '~' },
	{ id: TILE.SAND, label: 'Sand', color: 0xfff9c4, height: 0.16, char: 'S' },
	{ id: TILE.WALL, label: 'Wall', color: 0x5d4037, height: 2, char: '#' },
	{ id: TILE.SHELF, label: 'Shelf', color: 0x3e2723, height: 1.6, char: 'B' },
	{ id: TILE.TABLE, label: 'Table', color: 0xb89b8a, height: 0.6, char: 'T' }
];

const TILE_BY_CHAR = Object.fromEntries(TILE_DEFS.map(def => [def.char, def.id]));
const TILE_BY_ID = Object.fromEntries(TILE_DEFS.map(def => [def.id, def]));

const MOCK_NOTES = [
	{ title: 'The Flow of State', content: 'React states are like seasons. They change, they cycle, and eventually, they render beauty.' },
	{ title: 'Binary Zen', content: 'Between 0 and 1, there is a space. In that space, the soul of the machine rests.' },
	{ title: 'Recursive Love', content: 'To understand love, you must first understand love. It is a loop with no base case.' }
];

let map = [];
let items = [];
let mapWidth = 0;
let mapHeight = 0;
let chunkSize = 16;
let noteCursor = 0;
let rooms = new Map();
let rootRoomId = null;
let currentRoomId = null;

let renderer;
let scene;
let camera;
let topCamera;
let activeCamera;
let sunLight;
let rootGroup;
let booksGroup;
let roomGroupRoot;

const player = {
	position: new THREE.Vector3(0, 0.2, 0),
	velocity: new THREE.Vector3(0, 0, 0),
	jumpVelocity: 0,
	canJump: true,
	heading: new THREE.Vector3(0, 0, 1),
	scale: 1,
	targetScale: 1
};

const cameraRig = {
	position: new THREE.Vector3(0, 12, 12),
	offset: new THREE.Vector3(0, 10, 12),
	target: new THREE.Vector3(0, 0, 0),
	moveDir: new THREE.Vector3(0, 0, 1),
	yaw: 0,
	pitch: 0,
	distance: 12
};

const editor = {
	mode: 'play',
	tool: 'paint',
	tile: TILE.GRASS,
	painting: false,
	dragging: false,
	dragStart: null,
	dragCurrent: null
};

const keys = {};
let playerMesh;
let playerShadow;
let uiLayer;
let editorPanel;
let modeIndicator;
let paletteEl;
let exportModal;
let exportText;
let exportClose;
let exportBtn;
let noteModal;
let noteTitle;
let noteContent;
let noteClose;
let loadingEl;
let debugStatus;
let isExportOpen = false;
let statusBar;
let cursorMesh;
let previewRect;
let previewCircle;
const clock = new THREE.Clock();
let invertMouseY = true;
let invertMouseToggle;
let debugAxesGroup;

init();

async function init() {
	console.log('[Library3D] init');
	setupScene();
	setupUI();
	await loadWorld();
	spawnPlayer();
	animate();
	setLoading(false);
}

function setupScene() {
	console.log('[Library3D] setupScene');
	renderer = new THREE.WebGLRenderer({ antialias: true });
	renderer.setPixelRatio(window.devicePixelRatio || 1);
	renderer.setSize(window.innerWidth, window.innerHeight);
	renderer.shadowMap.enabled = true;
	renderer.shadowMap.type = THREE.PCFSoftShadowMap;
	document.body.appendChild(renderer.domElement);

	scene = new THREE.Scene();
	scene.background = new THREE.Color(0x87cdeb);

	camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 200);
	camera.position.copy(cameraRig.position);
	camera.lookAt(cameraRig.target);
	setupTopCamera();
	activeCamera = camera;

	const ambient = new THREE.AmbientLight(0xffffff, 0.6);
	scene.add(ambient);

	sunLight = new THREE.DirectionalLight(0xffffff, 0.9);
	sunLight.position.set(8, 14, 6);
	sunLight.castShadow = true;
	sunLight.shadow.mapSize.set(2048, 2048);
	sunLight.shadow.camera.near = 1;
	sunLight.shadow.camera.far = 60;
	sunLight.shadow.camera.left = -20;
	sunLight.shadow.camera.right = 20;
	sunLight.shadow.camera.top = 20;
	sunLight.shadow.camera.bottom = -20;
	scene.add(sunLight);

	rootGroup = new THREE.Group();
	scene.add(rootGroup);

	booksGroup = new THREE.Group();
	scene.add(booksGroup);

	roomGroupRoot = new THREE.Group();
	scene.add(roomGroupRoot);

	debugAxesGroup = new THREE.Group();
	scene.add(debugAxesGroup);

	cursorMesh = new THREE.Mesh(
		new THREE.RingGeometry(0.22, 0.28, 24),
		new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.85, side: THREE.DoubleSide })
	);
	cursorMesh.rotation.x = -Math.PI / 2;
	cursorMesh.visible = false;
	scene.add(cursorMesh);

	previewRect = new THREE.LineSegments(
		new THREE.EdgesGeometry(new THREE.PlaneGeometry(1, 1)),
		new THREE.LineBasicMaterial({ color: 0x1565c0 })
	);
	previewRect.rotation.x = -Math.PI / 2;
	previewRect.visible = false;
	scene.add(previewRect);

	previewCircle = new THREE.Mesh(
		new THREE.RingGeometry(0.45, 0.5, 32),
		new THREE.MeshBasicMaterial({ color: 0x1565c0, transparent: true, opacity: 0.7, side: THREE.DoubleSide })
	);
	previewCircle.rotation.x = -Math.PI / 2;
	previewCircle.visible = false;
	scene.add(previewCircle);

	window.addEventListener('resize', onResize);
	window.addEventListener('keydown', onKeyDown);
	window.addEventListener('keyup', onKeyUp);
	renderer.domElement.addEventListener('mousedown', onPointerDown);
	renderer.domElement.addEventListener('mousemove', onPointerMove);
	window.addEventListener('mouseup', onPointerUp);
	renderer.domElement.addEventListener('mousemove', onMouseLook);
	renderer.domElement.addEventListener('wheel', onMouseWheel, { passive: false });
	document.addEventListener('pointerlockchange', onPointerLockChange);
	renderer.domElement.addEventListener('click', () => {
		if (editor.mode === 'play') requestPointerLock();
	});
	console.log('[Library3D] scene ready');
}

function setupUI() {
	console.log('[Library3D] setupUI');
	uiLayer = document.getElementById('ui-layer');
	editorPanel = document.getElementById('editor-panel');
	modeIndicator = document.getElementById('mode-indicator');
	paletteEl = document.getElementById('tile-palette');
	exportModal = document.getElementById('export-modal');
	exportText = document.getElementById('export-text');
	exportClose = document.getElementById('export-close');
	exportBtn = document.getElementById('export-world');
	invertMouseToggle = document.getElementById('invert-mouse');
	noteModal = document.getElementById('note-modal');
	noteTitle = document.getElementById('note-title');
	noteContent = document.getElementById('note-content');
	noteClose = document.getElementById('note-close');
	loadingEl = document.getElementById('loading');
	debugStatus = document.getElementById('debug-status');
	statusBar = document.getElementById('status-bar');
	if (noteClose) noteClose.addEventListener('click', closeModal);
	if (exportClose) exportClose.addEventListener('click', closeExportModal);
	if (exportBtn) exportBtn.addEventListener('click', openExportModal);
	if (invertMouseToggle) {
		invertMouseToggle.checked = invertMouseY;
		invertMouseToggle.addEventListener('change', () => {
			invertMouseY = invertMouseToggle.checked;
			console.log('[Library3D] invert mouse', invertMouseY);
		});
	}
	setupEditorUI();
}

function setLoading(isLoading) {
	if (loadingEl) loadingEl.style.display = isLoading ? 'block' : 'none';
}

async function loadWorld() {
	setStatus('Loading world...');
	console.log('[Library3D] loadWorld', WORLD_PATH);
	try {
		const response = await fetch(WORLD_PATH, { cache: 'no-store' });
		if (!response.ok) throw new Error('World not found');
		const text = await response.text();
		parseWorld(text);
		buildWorld();
		console.log('[Library3D] world loaded', { mapWidth, mapHeight, chunkSize, items: items.length });
		setStatus('World ready');
	} catch (err) {
		console.warn(err);
		setStatus('Falling back to blank world');
		createBlankWorld(32, 32);
		buildWorld();
		console.log('[Library3D] world fallback', { mapWidth, mapHeight });
	}
}

function setStatus(msg) {
	if (debugStatus) debugStatus.textContent = msg;
	if (statusBar) statusBar.textContent = `Status: ${msg}`;
}

function createBlankWorld(width, height) {
	mapWidth = width;
	mapHeight = height;
	map = [];
	for (let x = 0; x < mapWidth; x++) {
		map[x] = [];
		for (let y = 0; y < mapHeight; y++) map[x][y] = TILE.GRASS;
	}
	items = [];
}

function parseWorld(text) {
	console.log('[Library3D] parseWorld');
	const lines = text.split(/\r?\n/);
	let width = 0;
	let height = 0;
	let noteIndex = 0;
	chunkSize = 16;
	map = [];
	items = [];

	function initMap() {
		for (let x = 0; x < width; x++) {
			map[x] = [];
			for (let y = 0; y < height; y++) map[x][y] = TILE.GRASS;
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
			if (!Number.isFinite(width) || !Number.isFinite(height)) throw new Error('Invalid size');
			initMap();
			continue;
		}
		if (parts[0] === 'chunk_size' && parts.length >= 2) {
			const sizeValue = Number(parts[1]);
			if (Number.isFinite(sizeValue) && sizeValue > 0) chunkSize = sizeValue;
			continue;
		}
		if (parts[0] === 'chunk' && parts.length >= 3) {
			if (!width || !height) throw new Error('Chunk before size');
			const chunkX = Number(parts[1]);
			const chunkY = Number(parts[2]);
			if (!Number.isFinite(chunkX) || !Number.isFinite(chunkY)) throw new Error('Invalid chunk');

			let row = 0;
			while (row < chunkSize && i < lines.length) {
				const rowRaw = lines[i];
				const rowLine = rowRaw.trimEnd();
				i++;
				if (!rowLine || rowLine.trim().startsWith(';')) continue;
				const padded = rowLine.padEnd(chunkSize, '.');
				for (let col = 0; col < chunkSize; col++) {
					const tileChar = padded[col] || '.';
					const tile = TILE_BY_CHAR[tileChar] ?? TILE.GRASS;
					const x = chunkX * chunkSize + col;
					const y = chunkY * chunkSize + row;
					if (x >= 0 && x < width && y >= 0 && y < height) {
						map[x][y] = tile;
						if (tile === TILE.SHELF) {
							items.push({
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

	mapWidth = width;
	mapHeight = height;
	noteCursor = items.length;
	console.log('[Library3D] parseWorld complete', { mapWidth, mapHeight, chunkSize, items: items.length });
}

function buildWorld() {
	console.log('[Library3D] buildWorld');
	rootGroup.clear();
	booksGroup.clear();
	roomGroupRoot.clear();
	buildRoomHierarchy();
	console.log('[Library3D] buildWorld complete');
}

function buildRoomHierarchy() {
	rooms.clear();
	rootRoomId = 'root';
	currentRoomId = rootRoomId;

	const rootRoom = createRoomFromMap(rootRoomId, map, mapWidth, mapHeight, new THREE.Vector3(0, 0, 0), null);
	rooms.set(rootRoomId, rootRoom);
	roomGroupRoot.add(rootRoom.group);
	debugAxesGroup.clear();
	debugAxesGroup.add(new THREE.AxesHelper(2));

	for (const table of rootRoom.tables) {
		const childRoom = createMiniRoom(`room-${table.x}-${table.y}`, table.position);
		table.childRoomId = childRoom.id;
		childRoom.parentRoomId = rootRoomId;
		childRoom.parentTable = table;
		rooms.set(childRoom.id, childRoom);
		rootRoom.group.add(childRoom.group);
		const axes = new THREE.AxesHelper(0.5);
		axes.position.copy(childRoom.group.position);
		debugAxesGroup.add(axes);
	}
}

function createRoomFromMap(id, roomMap, width, height, position, parentId) {
	const group = new THREE.Group();
	group.position.copy(position);

	const tables = [];
	const materialCache = new Map();
	const meshCache = new Map();
	for (const def of TILE_DEFS) {
		const material = new THREE.MeshStandardMaterial({ color: def.color });
		materialCache.set(def.id, material);
		const geo = new THREE.BoxGeometry(TILE_SIZE, def.height, TILE_SIZE);
		const mesh = new THREE.InstancedMesh(geo, material, width * height);
		mesh.castShadow = false;
		mesh.receiveShadow = true;
		mesh.count = 0;
		meshCache.set(def.id, mesh);
		group.add(mesh);
	}

	const dummy = new THREE.Object3D();
	for (let x = 0; x < width; x++) {
		for (let y = 0; y < height; y++) {
			const tile = roomMap[x][y];
			const def = TILE_BY_ID[tile];
			if (!def) continue;
			const mesh = meshCache.get(tile);
			if (!mesh) continue;
			const heightValue = def.height;
			dummy.position.set(x * TILE_SIZE, heightValue / 2, y * TILE_SIZE);
			dummy.updateMatrix();
			mesh.setMatrixAt(mesh.count, dummy.matrix);
			mesh.count += 1;
			if (tile === TILE.SHELF) addBooksAt(group, x, y);
			if (tile === TILE.TABLE) {
				const tableTop = TILE_BY_ID[TILE.TABLE].height;
				tables.push({
					x,
					y,
					position: new THREE.Vector3(x * TILE_SIZE + TILE_SIZE / 2, tableTop, y * TILE_SIZE + TILE_SIZE / 2),
					childRoomId: null
				});
			}
		}
	}
	meshCache.forEach(mesh => {
		mesh.instanceMatrix.needsUpdate = true;
	});

	return {
		id,
		group,
		map: roomMap,
		width,
		height,
		tables,
		centerOffset: new THREE.Vector3((width * TILE_SIZE) / 2, 0, (height * TILE_SIZE) / 2),
		parentRoomId: parentId
	};
}

function createMiniRoom(id, worldPosition) {
	const size = 20;
	const roomMap = [];
	for (let x = 0; x < size; x++) {
		roomMap[x] = [];
		for (let y = 0; y < size; y++) roomMap[x][y] = TILE.GRASS;
	}
	for (let i = 0; i < size; i++) {
		roomMap[i][0] = TILE.WALL;
		roomMap[i][size - 1] = TILE.WALL;
		roomMap[0][i] = TILE.WALL;
		roomMap[size - 1][i] = TILE.WALL;
	}
	// Center the child room on the table by offsetting its group by half its size.
	const room = createRoomFromMap(
		id,
		roomMap,
		size,
		size,
		new THREE.Vector3(worldPosition.x, worldPosition.y + 0.02, worldPosition.z),
		rootRoomId
	);
	room.group.position.sub(room.centerOffset.clone().multiplyScalar(MINI_ROOM_SCALE));
	room.group.scale.setScalar(MINI_ROOM_SCALE);
	return room;
}

function addBooksAt(parentGroup, x, y) {
	const seed = (x * 73856093) ^ (y * 19349663);
	const colors = [0xef5350, 0xec407a, 0xab47bc, 0x42a5f5, 0x26a69a, 0xffca28];
	const count = 3 + (Math.abs(seed) % 3);
	for (let i = 0; i < count; i++) {
		const w = 0.15 + ((seed + i * 3) % 10) / 100;
		const h = 0.35 + ((seed + i * 7) % 12) / 100;
		const geo = new THREE.BoxGeometry(w, h, 0.12);
		const mat = new THREE.MeshStandardMaterial({ color: colors[(seed + i) % colors.length] });
		const book = new THREE.Mesh(geo, mat);
		book.castShadow = true;
		book.receiveShadow = false;
		book.position.set(
			x * TILE_SIZE - 0.3 + i * 0.22,
			0.45,
			y * TILE_SIZE + 0.25
		);
		parentGroup.add(book);
	}
}

function spawnPlayer() {
	console.log('[Library3D] spawnPlayer');
	player.position.set(mapWidth * TILE_SIZE / 2, 0.2, mapHeight * TILE_SIZE / 2);
	playerMesh = new THREE.Mesh(
		new THREE.SphereGeometry(0.3, 18, 18),
		new THREE.MeshStandardMaterial({ color: 0xf50057 })
	);
	playerMesh.castShadow = true;
	playerMesh.receiveShadow = false;
	scene.add(playerMesh);

	playerShadow = new THREE.Mesh(
		new THREE.CircleGeometry(0.35, 24),
		new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.35 })
	);
	playerShadow.rotation.x = -Math.PI / 2;
	playerShadow.position.y = 0.01;
	scene.add(playerShadow);

	player.scale = 1;
	player.targetScale = 1;
	playerMesh.scale.set(1, 1, 1);
}

function animate() {
	requestAnimationFrame(animate);
	const dt = Math.min(0.033, clock.getDelta());
	update(dt);
	renderer.render(scene, activeCamera);
}

function update(dt) {
	if (editor.mode === 'edit') {
		if (keys['KeyW']) cameraRig.target.z -= PAN_SPEED;
		if (keys['KeyS']) cameraRig.target.z += PAN_SPEED;
		if (keys['KeyA']) cameraRig.target.x -= PAN_SPEED;
		if (keys['KeyD']) cameraRig.target.x += PAN_SPEED;
		updateCamera();
		if (cursorMesh) cursorMesh.visible = true;
		return;
	}
	if (cursorMesh) cursorMesh.visible = false;

	// Smooth scale towards target
	player.scale += (player.targetScale - player.scale) * SCALE_LERP;
	const clampedScale = Math.min(PLAYER_SCALE_MAX, Math.max(PLAYER_SCALE_MIN, player.scale));
	player.scale = clampedScale;
	playerMesh.scale.setScalar(player.scale);
	playerShadow.scale.setScalar(player.scale);

	let moveX = 0;
	let moveZ = 0;
	if (keys['KeyW']) moveZ += 1;
	if (keys['KeyS']) moveZ -= 1;
	if (keys['KeyA']) moveX -= 1;
	if (keys['KeyD']) moveX += 1;

	const rawLength = Math.hypot(moveX, moveZ);
	const forward = new THREE.Vector3();
	camera.getWorldDirection(forward);
	forward.y = 0;
	forward.normalize();
	const right = new THREE.Vector3().crossVectors(forward, new THREE.Vector3(0, 1, 0)).normalize();
	const accel = new THREE.Vector3();
	if (rawLength > 0) {
		moveX /= rawLength;
		moveZ /= rawLength;
		const isRunning = keys['ShiftLeft'] || keys['ShiftRight'];
		const accelValue = isRunning ? RUN_ACCEL : WALK_ACCEL;
		accel.addScaledVector(forward, moveZ * accelValue);
		accel.addScaledVector(right, moveX * accelValue);
	}

	const inWater = isInWater(player.position.x, player.position.z);
	const speedMultiplier = inWater ? 0.6 : 1;
	accel.multiplyScalar(dt * speedMultiplier);
	player.velocity.add(accel);
	const maxSpeed = (keys['ShiftLeft'] || keys['ShiftRight'] ? MAX_SPEED_RUN : MAX_SPEED_WALK) * speedMultiplier * player.scale;
	if (player.velocity.length() > maxSpeed) {
		player.velocity.setLength(maxSpeed);
	}
	const nextX = player.position.x + player.velocity.x;
	const nextZ = player.position.z + player.velocity.z;
	if (!isBlocked(nextX, player.position.z)) player.position.x = nextX;
	else player.velocity.x = 0;
	if (!isBlocked(player.position.x, nextZ)) player.position.z = nextZ;
	else player.velocity.z = 0;

	if (player.jumpVelocity !== 0 || !player.canJump) {
		player.position.y += player.jumpVelocity;
		player.jumpVelocity -= inWater ? GRAVITY * 0.35 : GRAVITY;
		if (player.position.y <= 0.2) {
			player.position.y = 0.2;
			player.jumpVelocity = 0;
			player.canJump = true;
		}
	}

	if (inWater && player.canJump) {
		const waterLevel = TILE_BY_ID[TILE.WATER].height + 0.1;
		player.position.y += (waterLevel - player.position.y) * 0.12;
	}
	if (player.velocity.lengthSq() > 0.0001) {
		player.heading.lerp(player.velocity.clone().normalize(), TURN_SPEED);
		cameraRig.moveDir.copy(player.heading);
	}
	player.velocity.multiplyScalar(DRAG);

	playerMesh.position.copy(player.position);
	playerShadow.position.x = player.position.x;
	playerShadow.position.z = player.position.z;
	const shadowScale = Math.max(0.2, 1 - (player.position.y - 0.2) * 2);
	playerShadow.scale.set(shadowScale, shadowScale, shadowScale);

	cameraRig.target.copy(player.position);
	updateCamera();
	updateUI();
}

function updateCamera() {
	const cosPitch = Math.cos(cameraRig.pitch);
	const sinPitch = Math.sin(cameraRig.pitch);
	const sinYaw = Math.sin(cameraRig.yaw);
	const cosYaw = Math.cos(cameraRig.yaw);
	const camDistance = cameraRig.distance * player.scale;
	const offset = new THREE.Vector3(
		-sinYaw * camDistance * cosPitch,
		camDistance * sinPitch + 4 * player.scale,
		-cosYaw * camDistance * cosPitch
	);
	const desiredPos = cameraRig.target.clone().add(offset);
	camera.position.lerp(desiredPos, CAMERA_LAG);
	if (camera.position.y < CAMERA_MIN_Y) camera.position.y = CAMERA_MIN_Y;
	camera.lookAt(cameraRig.target);
	sunLight.position.set(cameraRig.target.x + 8, 14, cameraRig.target.z + 6);
	if (topCamera) {
		topCamera.position.set(cameraRig.target.x, 30, cameraRig.target.z);
		topCamera.lookAt(cameraRig.target.x, 0, cameraRig.target.z);
	}
}

function updateUI() {
	if (!uiLayer) return;
	if (editor.mode === 'edit') {
		uiLayer.classList.remove('visible');
		return;
	}
	const near = getNearItem();
	if (near) uiLayer.classList.add('visible');
	else uiLayer.classList.remove('visible');
}

function getNearItem() {
	return items.find(item => {
		const dx = item.x * TILE_SIZE - player.position.x;
		const dz = item.y * TILE_SIZE - player.position.z;
		return Math.hypot(dx, dz) < 1.4;
	}) || null;
}

function openModal(note) {
	if (!noteModal || !noteTitle || !noteContent) return;
	console.log('[Library3D] openModal', note.title);
	noteTitle.textContent = note.title;
	noteContent.textContent = note.content;
	noteModal.style.display = 'flex';
}

function closeModal() {
	if (!noteModal) return;
	console.log('[Library3D] closeModal');
	noteModal.style.display = 'none';
}

function onResize() {
	console.log('[Library3D] resize', window.innerWidth, window.innerHeight);
	camera.aspect = window.innerWidth / window.innerHeight;
	camera.updateProjectionMatrix();
	updateTopCamera();
	renderer.setSize(window.innerWidth, window.innerHeight);
}

function onKeyDown(e) {
	keys[e.code] = true;
	if (e.code === 'KeyP') {
		editor.mode = editor.mode === 'edit' ? 'play' : 'edit';
		activeCamera = editor.mode === 'edit' ? topCamera : camera;
		if (editorPanel) editorPanel.classList.toggle('hidden', editor.mode !== 'edit');
		if (modeIndicator) modeIndicator.textContent = editor.mode === 'edit' ? 'EDIT' : 'PLAY';
		console.log('[Library3D] mode', editor.mode);
		setStatus(editor.mode === 'edit' ? 'Edit mode' : 'Play mode');
		if (editor.mode === 'edit') exitPointerLock();
		return;
	}
	if (e.code === 'Escape') {
		if (isExportOpen) closeExportModal();
		else closeModal();
		exitPointerLock();
	}
	if (editor.mode === 'edit') return;
	if (e.code === 'Space' && player.canJump) {
		const inWater = isInWater(player.position.x, player.position.z);
		player.jumpVelocity = (inWater ? JUMP_VELOCITY * 0.6 : JUMP_VELOCITY) * player.scale;
		player.canJump = false;
		player.velocity.addScaledVector(player.heading, JUMP_FORWARD_BOOST * player.scale);
		console.log('[Library3D] jump');
	}
	if (e.code === 'KeyE') {
		const near = getNearItem();
		if (near) openModal(near.data);
	}
	if (e.code === 'KeyF') tryEnterTable();
	if (e.code === 'KeyQ') tryExitRoom();
}

function onKeyUp(e) {
	keys[e.code] = false;
}

function tryEnterTable() {
	const room = rooms.get(currentRoomId);
	if (!room) return;
	const table = getNearTable(room);
	if (!table || !table.childRoomId) return;
	const childRoom = rooms.get(table.childRoomId);
	if (!childRoom) return;
	currentRoomId = childRoom.id;
	player.targetScale = childRoom.group.scale.x;
	const tableWorld = tableWorldPosition(table, room);
	const spawn = roomCenterWorld(childRoom);
	player.position.set(spawn.x, tableWorld.y + 0.2 * player.targetScale, spawn.z);
	player.velocity.set(0, 0, 0);
	console.log('[Library3D] enter room', childRoom.id);
}

function tryExitRoom() {
	const room = rooms.get(currentRoomId);
	if (!room || !room.parentTable) return;
	currentRoomId = room.parentRoomId;
	player.targetScale = PLAYER_SCALE_MAX;
	const tableWorld = tableWorldPosition(room.parentTable, rooms.get(currentRoomId));
	player.position.set(tableWorld.x, tableWorld.y + 0.2 * player.targetScale, tableWorld.z);
	player.velocity.set(0, 0, 0);
	console.log('[Library3D] exit room', currentRoomId);
}

function getNearTable(room) {
	if (!room) return null;
	const threshold = 0.9 * player.scale;
	return room.tables.find(table => {
		const worldPos = tableWorldPosition(table, room);
		const dx = worldPos.x - player.position.x;
		const dz = worldPos.z - player.position.z;
		return Math.hypot(dx, dz) < threshold;
	}) || null;
}

function roomCenterWorld(room) {
	const localCenter = new THREE.Vector3(
		(room.width * TILE_SIZE) / 2,
		0,
		(room.height * TILE_SIZE) / 2
	);
	return room.group.localToWorld(localCenter);
}

function tableWorldPosition(table, room) {
	const local = table.position.clone();
	if (!room) return local;
	return room.group.localToWorld(local);
}

function onMouseLook(e) {
	if (editor.mode !== 'play') return;
	if (document.pointerLockElement !== renderer.domElement) return;
	cameraRig.yaw -= e.movementX * MOUSE_SENSITIVITY;
	const invert = invertMouseY ? -1 : 1;
	cameraRig.pitch -= e.movementY * MOUSE_SENSITIVITY * invert;
	cameraRig.pitch = Math.max(PITCH_MIN, Math.min(PITCH_MAX, cameraRig.pitch));
}

function onMouseWheel(e) {
	if (editor.mode !== 'play') return;
	e.preventDefault();
	cameraRig.distance += e.deltaY * 0.01;
	cameraRig.distance = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, cameraRig.distance));
}

function onPointerLockChange() {
	if (document.pointerLockElement === renderer.domElement) {
		console.log('[Library3D] pointer lock on');
	} else {
		console.log('[Library3D] pointer lock off');
	}
}

function requestPointerLock() {
	if (document.pointerLockElement === renderer.domElement) return;
	renderer.domElement.requestPointerLock();
}

function exitPointerLock() {
	if (document.pointerLockElement) document.exitPointerLock();
}

function setupTopCamera() {
	const aspect = window.innerWidth / window.innerHeight;
	const size = 16;
	topCamera = new THREE.OrthographicCamera(
		-size * aspect,
		size * aspect,
		size,
		-size,
		0.1,
		200
	);
	topCamera.position.set(0, 30, 0);
	topCamera.up.set(0, 0, -1);
	topCamera.lookAt(0, 0, 0);
}

function updateTopCamera() {
	if (!topCamera) return;
	const aspect = window.innerWidth / window.innerHeight;
	const size = 16;
	topCamera.left = -size * aspect;
	topCamera.right = size * aspect;
	topCamera.top = size;
	topCamera.bottom = -size;
	topCamera.updateProjectionMatrix();
}

function setupEditorUI() {
	if (!paletteEl) return;
	console.log('[Library3D] setupEditorUI');
	paletteEl.innerHTML = '';
	TILE_DEFS.forEach(def => {
		const swatch = document.createElement('div');
		swatch.className = 'tile-swatch';
		swatch.style.background = `#${def.color.toString(16).padStart(6, '0')}`;
		swatch.title = def.label;
		swatch.dataset.tileId = String(def.id);
		swatch.textContent = def.label;
		swatch.addEventListener('click', () => {
			editor.tile = def.id;
			updatePalette();
		});
		paletteEl.appendChild(swatch);
	});
	const toolButtons = Array.from(document.querySelectorAll('.tool-btn[data-tool]'));
	toolButtons.forEach(btn => {
		btn.addEventListener('click', () => {
			editor.tool = btn.dataset.tool;
			toolButtons.forEach(other => other.classList.toggle('active', other === btn));
		});
	});
	toolButtons.forEach(btn => {
		btn.classList.toggle('active', btn.dataset.tool === editor.tool);
	});
	updatePalette();
}

function updatePalette() {
	if (!paletteEl) return;
	const swatches = Array.from(paletteEl.querySelectorAll('.tile-swatch'));
	swatches.forEach(swatch => {
		swatch.classList.toggle('active', Number(swatch.dataset.tileId) === editor.tile);
	});
}

function onPointerDown(e) {
	if (editor.mode !== 'edit') return;
	if (e.button !== 0) return;
	const tilePos = tileFromPointer(e.clientX, e.clientY);
	if (!tilePos) return;
	editor.dragStart = tilePos;
	editor.dragCurrent = tilePos;
	if (editor.tool === 'paint' || editor.tool === 'erase') {
		editor.painting = true;
		console.log('[Library3D] paint start');
		paintAtTile(tilePos.x, tilePos.y);
	} else {
		editor.dragging = true;
		console.log('[Library3D] shape start', editor.tool);
	}
	updateEditPreview();
}


function onPointerMove(e) {
	if (editor.mode !== 'edit') return;
	const tilePos = tileFromPointer(e.clientX, e.clientY);
	if (!tilePos) return;
	editor.dragCurrent = tilePos;
	if (editor.painting) {
		paintAtTile(tilePos.x, tilePos.y);
	}
	updateEditPreview();
}

function onPointerUp() {
	if (editor.mode !== 'edit') return;
	if (editor.painting) {
		editor.painting = false;
		console.log('[Library3D] paint end');
		return;
	}
	if (editor.dragging) {
		editor.dragging = false;
		if (editor.tool === 'rect') applyRect(editor.dragStart, editor.dragCurrent);
		if (editor.tool === 'circle') applyCircle(editor.dragStart, editor.dragCurrent);
		editor.dragStart = null;
		editor.dragCurrent = null;
		if (previewRect) previewRect.visible = false;
		if (previewCircle) previewCircle.visible = false;
		console.log('[Library3D] shape end', editor.tool);
	}
}

function tileFromPointer(clientX, clientY) {
	const rect = renderer.domElement.getBoundingClientRect();
	const mouse = new THREE.Vector2(
		((clientX - rect.left) / rect.width) * 2 - 1,
		-((clientY - rect.top) / rect.height) * 2 + 1
	);
	const raycaster = new THREE.Raycaster();
	raycaster.setFromCamera(mouse, activeCamera);
	const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
	const hit = new THREE.Vector3();
	if (!raycaster.ray.intersectPlane(plane, hit)) return;
	const tx = Math.floor(hit.x / TILE_SIZE + 0.5);
	const ty = Math.floor(hit.z / TILE_SIZE + 0.5);
	updateCursor(hit.x, hit.z);
	return { x: tx, y: ty };
}

function paintAtTile(tx, ty) {
	const tile = editor.tool === 'erase' ? TILE.GRASS : editor.tile;
	setTile(tx, ty, tile);
}

function applyRect(start, end) {
	if (!start || !end) return;
	setStatus('Drawing rectangle...');
	const minX = Math.min(start.x, end.x);
	const maxX = Math.max(start.x, end.x);
	const minY = Math.min(start.y, end.y);
	const maxY = Math.max(start.y, end.y);
	const tile = editor.tool === 'erase' ? TILE.GRASS : editor.tile;
	setTimeout(() => {
		for (let x = minX; x <= maxX; x++) {
			for (let y = minY; y <= maxY; y++) {
				setTileRaw(x, y, tile);
			}
		}
		buildWorld();
		setStatus('Edit ready');
	}, 0);
}

function applyCircle(start, end) {
	if (!start || !end) return;
	setStatus('Drawing circle...');
	const dx = end.x - start.x;
	const dy = end.y - start.y;
	const radius = Math.max(1, Math.round(Math.hypot(dx, dy)));
	const tile = editor.tool === 'erase' ? TILE.GRASS : editor.tile;
	setTimeout(() => {
		for (let x = start.x - radius; x <= start.x + radius; x++) {
			for (let y = start.y - radius; y <= start.y + radius; y++) {
				if ((x - start.x) ** 2 + (y - start.y) ** 2 <= radius ** 2) {
					setTileRaw(x, y, tile);
				}
			}
		}
		buildWorld();
		setStatus('Edit ready');
	}, 0);
}

function setTile(tx, ty, tile) {
	if (tx < 0 || ty < 0 || tx >= mapWidth || ty >= mapHeight) return;
	const prev = map[tx][ty];
	if (prev === tile) return;
	map[tx][ty] = tile;
	console.log('[Library3D] setTile', { tx, ty, tile });
	const itemIndex = items.findIndex(item => item.x === tx && item.y === ty);
	if (itemIndex !== -1 && tile !== TILE.SHELF) items.splice(itemIndex, 1);
	if (tile === TILE.SHELF && itemIndex === -1) {
		items.push({
			x: tx,
			y: ty,
			data: MOCK_NOTES[noteCursor % MOCK_NOTES.length]
		});
		noteCursor += 1;
	}
	buildWorld();
}

function setTileRaw(tx, ty, tile) {
	if (tx < 0 || ty < 0 || tx >= mapWidth || ty >= mapHeight) return;
	const prev = map[tx][ty];
	if (prev === tile) return;
	map[tx][ty] = tile;
	const itemIndex = items.findIndex(item => item.x === tx && item.y === ty);
	if (itemIndex !== -1 && tile !== TILE.SHELF) items.splice(itemIndex, 1);
	if (tile === TILE.SHELF && itemIndex === -1) {
		items.push({
			x: tx,
			y: ty,
			data: MOCK_NOTES[noteCursor % MOCK_NOTES.length]
		});
		noteCursor += 1;
	}
}

function updateCursor(x, z) {
	if (!cursorMesh) return;
	cursorMesh.visible = editor.mode === 'edit';
	if (!cursorMesh.visible) return;
	cursorMesh.position.set(Math.round(x), 0.02, Math.round(z));
}

function updateEditPreview() {
	if (editor.mode !== 'edit') return;
	if (!editor.dragStart || !editor.dragCurrent) return;
	if (editor.tool === 'rect') {
		const minX = Math.min(editor.dragStart.x, editor.dragCurrent.x);
		const maxX = Math.max(editor.dragStart.x, editor.dragCurrent.x);
		const minY = Math.min(editor.dragStart.y, editor.dragCurrent.y);
		const maxY = Math.max(editor.dragStart.y, editor.dragCurrent.y);
		const width = (maxX - minX + 1) * TILE_SIZE;
		const height = (maxY - minY + 1) * TILE_SIZE;
		if (previewRect) {
			previewRect.visible = true;
			previewRect.scale.set(width, height, 1);
			previewRect.position.set(minX + width / 2 - 0.5, 0.03, minY + height / 2 - 0.5);
		}
		if (previewCircle) previewCircle.visible = false;
	}
	if (editor.tool === 'circle') {
		const dx = editor.dragCurrent.x - editor.dragStart.x;
		const dy = editor.dragCurrent.y - editor.dragStart.y;
		const radius = Math.max(1, Math.round(Math.hypot(dx, dy)));
		if (previewCircle) {
			previewCircle.visible = true;
			previewCircle.scale.set(radius, radius, 1);
			previewCircle.position.set(editor.dragStart.x, 0.03, editor.dragStart.y);
		}
		if (previewRect) previewRect.visible = false;
	}
}

function isBlocked(x, z) {
	const radius = PLAYER_RADIUS * player.scale;
	const points = [
		{ x: x - radius, z: z - radius },
		{ x: x + radius, z: z - radius },
		{ x: x - radius, z: z + radius },
		{ x: x + radius, z: z + radius }
	];
	for (const p of points) {
		const tile = tileAtWorld(p.x, p.z);
		if (tile === null) return true;
		if (tile === TILE.WALL || tile === TILE.SHELF) return true;
	}
	return false;
}

function tileAtWorld(x, z) {
	const room = rooms.get(currentRoomId);
	if (!room) return null;
	const local = new THREE.Vector3(x, 0, z);
	room.group.worldToLocal(local);
	const tx = Math.floor(local.x / TILE_SIZE + 0.5);
	const ty = Math.floor(local.z / TILE_SIZE + 0.5);
	if (tx < 0 || ty < 0 || tx >= room.width || ty >= room.height) return null;
	return room.map[tx][ty];
}

function isInWater(x, z) {
	return tileAtWorld(x, z) === TILE.WATER;
}

function openExportModal() {
	if (!exportModal || !exportText) return;
	exportText.value = serializeWorld();
	exportModal.style.display = 'flex';
	isExportOpen = true;
	console.log('[Library3D] export open');
}

function closeExportModal() {
	if (!exportModal) return;
	exportModal.style.display = 'none';
	isExportOpen = false;
	console.log('[Library3D] export close');
}

function serializeWorld() {
	const chunksX = Math.ceil(mapWidth / chunkSize);
	const chunksY = Math.ceil(mapHeight / chunkSize);
	const tileToChar = {};
	TILE_DEFS.forEach(def => { tileToChar[def.id] = def.char; });

	const lines = [];
	lines.push('; World export');
	lines.push(`size ${mapWidth} ${mapHeight}`);
	lines.push(`chunk_size ${chunkSize}`);
	lines.push('');
	for (let cy = 0; cy < chunksY; cy++) {
		for (let cx = 0; cx < chunksX; cx++) {
			lines.push(`chunk ${cx} ${cy}`);
			for (let row = 0; row < chunkSize; row++) {
				let line = '';
				for (let col = 0; col < chunkSize; col++) {
					const x = cx * chunkSize + col;
					const y = cy * chunkSize + row;
					if (x >= mapWidth || y >= mapHeight) line += '.';
					else line += tileToChar[map[x][y]] || '.';
				}
				lines.push(line);
			}
			lines.push('');
		}
	}
	console.log('[Library3D] export generated');
	return lines.join('\n');
}
