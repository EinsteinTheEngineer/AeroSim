// --- AeroSim Global Physics State ---
const state = {
  velocity: 30.0,       // V or u (m/s)
  aoa: 5.0,             // Angle of attack (deg)
  bank: 0.0,            // Roll/Bank angle (deg)
  viscosity: 1.81e-5,   // Dynamic viscosity (Pa·s)
  density: 1.225,       // Fluid density rho (kg/m³)
  mesh: null,
  meshData: {
    planformAreaS: 1.0,
    frontalAreaA: 1.0,
    chordLength: 1.0,
    triangleCount: 0
  },
  // Particle Stream System (45 streams x 100 particles per stream = 4,500 particles)
  numStreams: 45,
  particlesPerStream: 100,
  particleSystem: null,
  streamOrigins: [],
  liftArrow: null,
  dragArrow: null,
  rollArrowLeft: null,
  rollArrowRight: null
};

let scene, camera, renderer, controls;

function initThree() {
  const container = document.getElementById('canvas-container');
  
  scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(0x060913, 0.014);

  camera = new THREE.PerspectiveCamera(45, container.clientWidth / container.clientHeight, 0.1, 1000);
  // Closer camera angle so the CAD model & particle streams fill the viewport nicely
  camera.position.set(6.5, 4.2, 9.5);

  renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setSize(container.clientWidth, container.clientHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  container.appendChild(renderer.domElement);

  controls = new THREE.OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.05;
  controls.target.set(-0.5, 0, 0);

  // Lighting
  const ambientLight = new THREE.AmbientLight(0xffffff, 0.7);
  scene.add(ambientLight);

  const dirLight = new THREE.DirectionalLight(0xffffff, 0.9);
  dirLight.position.set(8, 15, 10);
  scene.add(dirLight);

  const backLight = new THREE.DirectionalLight(0x38bdf8, 0.4);
  backLight.position.set(-10, -5, -10);
  scene.add(backLight);

  // Subtle Wind Tunnel Grid Floor & Enclosure
  const gridHelper = new THREE.GridHelper(24, 24, 0x1e293b, 0x0f172a);
  gridHelper.position.y = -4.5;
  scene.add(gridHelper);

  const tunnelGeo = new THREE.BoxGeometry(24, 9, 9);
  const tunnelMat = new THREE.MeshBasicMaterial({ color: 0x38bdf8, wireframe: true, transparent: true, opacity: 0.05 });
  scene.add(new THREE.Mesh(tunnelGeo, tunnelMat));

  // Initialize Flowing Particle Streams
  initParticleStreams();

  // Force Vectors
  state.liftArrow = new THREE.ArrowHelper(new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, 0, 0), 2, 0x10b981, 0.35, 0.18);
  state.dragArrow = new THREE.ArrowHelper(new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, 0, 0), 2, 0xf59e0b, 0.35, 0.18);
  
  state.rollArrowLeft = new THREE.ArrowHelper(new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, 0, -2.6), 1.5, 0xc084fc, 0.25, 0.15);
  state.rollArrowRight = new THREE.ArrowHelper(new THREE.Vector3(0, -1, 0), new THREE.Vector3(0, 0, 2.6), 1.5, 0xc084fc, 0.25, 0.15);

  scene.add(state.liftArrow);
  scene.add(state.dragArrow);
  scene.add(state.rollArrowLeft);
  scene.add(state.rollArrowRight);

  window.addEventListener('resize', onWindowResize);
  loadPresetCAD('airfoil');
}

// --- Particle Stream Engine (Discrete Particles Flowing in Coherent Streams) ---
function initParticleStreams() {
  const totalParticles = state.numStreams * state.particlesPerStream;
  const geometry = new THREE.BufferGeometry();
  const positions = new Float32Array(totalParticles * 3);
  const colors = new Float32Array(totalParticles * 3);

  // Create organized grid of stream emitters upstream (-X)
  const rows = 5;
  const cols = 9;
  state.streamOrigins = [];

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const y = (r - (rows - 1) / 2) * 0.9;
      const z = (c - (cols - 1) / 2) * 0.85;
      state.streamOrigins.push({ y, z, phase: Math.random() * Math.PI * 2 });
    }
  }

  // Spread particles evenly along each stream's length (-12 to +12)
  let idx = 0;
  for (let s = 0; s < state.numStreams; s++) {
    const origin = state.streamOrigins[s];
    for (let p = 0; p < state.particlesPerStream; p++) {
      const progress = p / state.particlesPerStream;
      positions[idx * 3] = -12 + progress * 24;
      positions[idx * 3 + 1] = origin.y;
      positions[idx * 3 + 2] = origin.z;

      colors[idx * 3] = 0.22;
      colors[idx * 3 + 1] = 0.74;
      colors[idx * 3 + 2] = 0.97;
      idx++;
    }
  }

  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));

  const material = new THREE.PointsMaterial({
    size: 0.11,
    vertexColors: true,
    transparent: true,
    opacity: 0.9
  });

  state.particleSystem = new THREE.Points(geometry, material);
  scene.add(state.particleSystem);
}

function updateParticleStreams() {
  if (!state.particleSystem) return;

  const pos = state.particleSystem.geometry.attributes.position.array;
  const col = state.particleSystem.geometry.attributes.color.array;
  
  const time = Date.now() * 0.003;
  // Particle travel speed scales directly with user airflow velocity
  const stepX = 0.04 + (state.velocity / 150) * 0.26;
  const aoaRad = THREE.MathUtils.degToRad(state.aoa);

  let idx = 0;
  for (let s = 0; s < state.numStreams; s++) {
    const origin = state.streamOrigins[s];

    for (let p = 0; p < state.particlesPerStream; p++) {
      let x = pos[idx * 3];
      let y = pos[idx * 3 + 1];
      let z = pos[idx * 3 + 2];

      // Move particle downstream (+X)
      x += stepX;

      // Reset particle back to inlet nozzle (-12) when it exits tunnel (+12)
      if (x > 12) {
        x = -12 + (x - 12);
        y = origin.y;
        z = origin.z;
      }

      // 1. Upstream smooth laminar stream
      if (x < -2.5) {
        y = origin.y;
        z = origin.z;
        col[idx * 3] = 0.22;
        col[idx * 3 + 1] = 0.74;
        col[idx * 3 + 2] = 0.97;
      }
      // 2. Deflection & Stagnation around the 3D CAD Object
      else if (x >= -2.5 && x <= 2.2) {
        const distYZ = Math.sqrt(y * y + z * z) + 0.001;
        if (distYZ < 2.6) {
          const push = (2.6 - distYZ) * 0.045;
          y += (y / distYZ) * push - Math.sin(aoaRad) * 0.02;
          z += (z / distYZ) * push;

          // Red/Orange Stagnation Pressure Zone
          col[idx * 3] = 0.96;
          col[idx * 3 + 1] = 0.30;
          col[idx * 3 + 2] = 0.25;
        } else {
          col[idx * 3] = 0.22;
          col[idx * 3 + 1] = 0.74;
          col[idx * 3 + 2] = 0.97;
        }
      }
      // 3. Trailing Wake Vortices & Downwash behind the Object
      else {
        const distYZ = Math.sqrt(origin.y * origin.y + origin.z * origin.z);
        if (distYZ < 2.8) {
          const wakeFactor = Math.min((x - 2.2) * 0.12, 1.0);
          const swirlFreq = 2.2;
          const swirlAmp = 0.035 * wakeFactor * (1 + state.velocity / 80);

          // Swirling vortex motion
          y += Math.sin(time * 2 + x * swirlFreq + origin.phase) * swirlAmp - Math.sin(aoaRad) * 0.015;
          z += Math.cos(time * 2 + x * swirlFreq + origin.phase) * swirlAmp;

          // Green Wake Vortex Visualization
          col[idx * 3] = 0.06;
          col[idx * 3 + 1] = 0.78;
          col[idx * 3 + 2] = 0.52;
        } else {
          col[idx * 3] = 0.22;
          col[idx * 3 + 1] = 0.74;
          col[idx * 3 + 2] = 0.97;
        }
      }

      pos[idx * 3] = x;
      pos[idx * 3 + 1] = y;
      pos[idx * 3 + 2] = z;
      idx++;
    }
  }

  state.particleSystem.geometry.attributes.position.needsUpdate = true;
  state.particleSystem.geometry.attributes.color.needsUpdate = true;
}

// --- Built-in CAD Generators ---
function loadPresetCAD(type) {
  showLoading(true);
  setTimeout(() => {
    if (state.mesh) scene.remove(state.mesh);

    let geo;
    if (type === 'airfoil') {
      geo = new THREE.BoxGeometry(3.2, 0.45, 6.2, 16, 16, 16);
      const pos = geo.attributes.position;
      for (let i = 0; i < pos.count; i++) {
        let x = pos.getX(i);
        let y = pos.getY(i);
        let normX = (x + 1.6) / 3.2;
        pos.setY(i, y * Math.sin(normX * Math.PI));
      }
      geo.computeVertexNormals();
    } else if (type === 'asymmetric_wing') {
      geo = new THREE.BoxGeometry(3.2, 0.45, 6.2, 16, 16, 24);
      const pos = geo.attributes.position;
      for (let i = 0; i < pos.count; i++) {
        let x = pos.getX(i);
        let y = pos.getY(i);
        let z = pos.getZ(i);
        let normX = (x + 1.6) / 3.2;
        let spanFactor = z > 0 ? 1.55 : 0.75;
        pos.setX(i, x * spanFactor);
        pos.setY(i, y * Math.sin(normX * Math.PI) * spanFactor);
      }
      geo.computeVertexNormals();
    } else if (type === 'sphere') {
      geo = new THREE.SphereGeometry(1.6, 32, 32);
    } else if (type === 'car') {
      geo = new THREE.BoxGeometry(4.5, 1.3, 2.1, 10, 10, 10);
    } else if (type === 'rocket') {
      geo = new THREE.ConeGeometry(1.1, 5.2, 32);
      geo.rotateZ(-Math.PI / 2);
    }

    const mat = new THREE.MeshStandardMaterial({
      color: 0x38bdf8,
      metalness: 0.3,
      roughness: 0.3
    });

    state.mesh = new THREE.Mesh(geo, mat);
    scene.add(state.mesh);

    analyzeCADGeometry(geo);
    runAerodynamicSolver();
    showLoading(false);
  }, 60);
}

// --- Extract Surface Areas (S & A) directly from 3D Mesh Triangles ---
function analyzeCADGeometry(geometry) {
  const nonIndexed = geometry.index ? geometry.toNonIndexed() : geometry;
  const pos = nonIndexed.attributes.position;
  
  nonIndexed.computeBoundingBox();
  const size = new THREE.Vector3();
  nonIndexed.boundingBox.getSize(size);

  let planformS = 0;
  let frontalA = 0;

  const vA = new THREE.Vector3();
  const vB = new THREE.Vector3();
  const vC = new THREE.Vector3();
  const cb = new THREE.Vector3();
  const ab = new THREE.Vector3();

  const triCount = pos.count / 3;

  for (let i = 0; i < pos.count; i += 3) {
    vA.fromBufferAttribute(pos, i);
    vB.fromBufferAttribute(pos, i + 1);
    vC.fromBufferAttribute(pos, i + 2);

    cb.subVectors(vC, vB);
    ab.subVectors(vA, vB);
    cb.cross(ab);

    const triArea = 0.5 * cb.length();
    if (triArea > 0) {
      const normal = cb.normalize();
      if (normal.y > 0) planformS += triArea * Math.abs(normal.y);
      if (normal.x < 0) frontalA += triArea * Math.abs(normal.x);
    }
  }

  state.meshData = {
    planformAreaS: Math.max(planformS, 0.01),
    frontalAreaA: Math.max(frontalA, 0.01),
    chordLength: Math.max(size.x, 0.1),
    triangleCount: triCount
  };

  document.getElementById('mesh-s').innerText = state.meshData.planformAreaS.toFixed(2) + ' m²';
  document.getElementById('mesh-a').innerText = state.meshData.frontalAreaA.toFixed(2) + ' m²';
  document.getElementById('mesh-tris').innerText = triCount.toLocaleString();
}

// --- Aerodynamic Solver: Integrates Mesh Forces & Derives C_L, C_d, and Roll ---
function runAerodynamicSolver() {
  if (!state.mesh) return;

  const aoaRad = THREE.MathUtils.degToRad(state.aoa);
  const bankRad = THREE.MathUtils.degToRad(state.bank);
  state.mesh.rotation.set(bankRad, 0, aoaRad);
  state.mesh.updateMatrixWorld();

  const V = state.velocity;
  const rho = state.density;
  const mu = state.viscosity;
  const S = state.meshData.planformAreaS;
  const A = state.meshData.frontalAreaA;
  const chord = state.meshData.chordLength;

  const q = 0.5 * rho * (V * V);
  const reynolds = (rho * V * chord) / Math.max(mu, 1e-7);

  const geo = state.mesh.geometry.index ? state.mesh.geometry.toNonIndexed() : state.mesh.geometry;
  const pos = geo.attributes.position;
  
  let totalLiftL = 0;
  let totalDragFd = 0;
  let totalRollMomentMx = 0;

  const vA = new THREE.Vector3();
  const vB = new THREE.Vector3();
  const vC = new THREE.Vector3();
  const centroid = new THREE.Vector3();
  const cb = new THREE.Vector3();
  const ab = new THREE.Vector3();

  const cf = 1.328 / Math.sqrt(Math.max(reynolds, 10));

  for (let i = 0; i < pos.count; i += 3) {
    vA.fromBufferAttribute(pos, i).applyMatrix4(state.mesh.matrixWorld);
    vB.fromBufferAttribute(pos, i + 1).applyMatrix4(state.mesh.matrixWorld);
    vC.fromBufferAttribute(pos, i + 2).applyMatrix4(state.mesh.matrixWorld);

    centroid.addVectors(vA, vB).add(vC).divideScalar(3);

    cb.subVectors(vC, vB);
    ab.subVectors(vA, vB);
    cb.cross(ab);

    const triArea = 0.5 * cb.length();
    if (triArea <= 0) continue;

    const normal = cb.normalize();

    const localCl = 2 * Math.PI * aoaRad * Math.cos(bankRad);
    const dLift = q * triArea * Math.abs(normal.y) * localCl * 0.5;
    totalLiftL += dLift;

    const pressureDrag = normal.x < 0 ? q * triArea * Math.pow(Math.abs(normal.x), 2) * 1.15 : 0;
    const viscousDrag = q * triArea * cf;
    totalDragFd += (pressureDrag + viscousDrag);

    totalRollMomentMx += -centroid.z * dLift;
  }

  // Exact Equations:
  // C_L = (2 * L) / (ρ * V² * S)
  const C_L = (V > 0 && S > 0) ? (2 * totalLiftL) / (rho * Math.pow(V, 2) * S) : 0;

  // C_d = (2 * F_d) / (ρ * u² * A)
  const C_d = (V > 0 && A > 0) ? (2 * totalDragFd) / (rho * Math.pow(V, 2) * A) : 0;

  document.getElementById('res-lift').innerText = totalLiftL.toFixed(2) + ' N';
  document.getElementById('res-drag').innerText = totalDragFd.toFixed(2) + ' N';
  document.getElementById('res-cl').innerText = C_L.toFixed(3);
  document.getElementById('res-cd').innerText = C_d.toFixed(3);

  const rollEl = document.getElementById('res-roll');
  if (Math.abs(totalRollMomentMx) < 0.05) {
    rollEl.innerText = `0.00 N·m (Balanced)`;
  } else {
    const dir = totalRollMomentMx > 0 ? 'Right Roll ↻' : 'Left Roll ↺';
    rollEl.innerText = `${Math.abs(totalRollMomentMx).toFixed(2)} N·m (${dir})`;
  }

  const badge = document.getElementById('regime-badge');
  if (reynolds > 500000) {
    badge.innerText = `TURBULENT FLOW (Re: ${Math.round(reynolds).toLocaleString()})`;
    badge.style.background = 'rgba(239, 68, 68, 0.12)';
    badge.style.color = '#f87171';
    badge.style.borderColor = 'rgba(239, 68, 68, 0.25)';
  } else {
    badge.innerText = `LAMINAR FLOW (Re: ${Math.round(reynolds).toLocaleString()})`;
    badge.style.background = 'rgba(16, 185, 129, 0.12)';
    badge.style.color = '#34d399';
    badge.style.borderColor = 'rgba(16, 185, 129, 0.25)';
  }

  updateVectorArrows(totalLiftL, totalDragFd, totalRollMomentMx);
}

function updateVectorArrows(lift, drag, rollMoment) {
  const forceScale = 0.004;
  state.liftArrow.setLength(Math.min(Math.max(Math.abs(lift) * forceScale, 0.4), 4.0), 0.35, 0.18);
  state.liftArrow.setDirection(new THREE.Vector3(0, lift >= 0 ? 1 : -1, 0));

  state.dragArrow.setLength(Math.min(Math.max(Math.abs(drag) * forceScale, 0.4), 4.0), 0.35, 0.18);

  const rollLen = Math.min(Math.abs(rollMoment) * 0.015, 2.8);
  if (rollLen > 0.1) {
    state.rollArrowLeft.visible = true;
    state.rollArrowRight.visible = true;
    state.rollArrowLeft.setLength(rollLen, 0.25, 0.15);
    state.rollArrowRight.setLength(rollLen, 0.25, 0.15);

    const dir = rollMoment > 0 ? 1 : -1;
    state.rollArrowLeft.setDirection(new THREE.Vector3(0, dir, 0));
    state.rollArrowRight.setDirection(new THREE.Vector3(0, -dir, 0));
  } else {
    state.rollArrowLeft.visible = false;
    state.rollArrowRight.visible = false;
  }
}

// --- Event Listeners ---
function setupEventListeners() {
  document.getElementById('slider-speed').addEventListener('input', (e) => {
    state.velocity = parseFloat(e.target.value);
    document.getElementById('val-speed').innerText = state.velocity + ' m/s';
    runAerodynamicSolver();
  });

  document.getElementById('slider-aoa').addEventListener('input', (e) => {
    state.aoa = parseFloat(e.target.value);
    document.getElementById('val-aoa').innerText = state.aoa.toFixed(1) + '°';
    runAerodynamicSolver();
  });

  document.getElementById('slider-bank').addEventListener('input', (e) => {
    state.bank = parseFloat(e.target.value);
    document.getElementById('val-bank').innerText = state.bank.toFixed(1) + '°';
    runAerodynamicSolver();
  });

  document.getElementById('slider-viscosity').addEventListener('input', (e) => {
    state.viscosity = parseFloat(e.target.value);
    document.getElementById('val-viscosity').innerText = state.viscosity.toExponential(2) + ' Pa·s';
    runAerodynamicSolver();
  });

  document.getElementById('slider-density').addEventListener('input', (e) => {
    state.density = parseFloat(e.target.value);
    document.getElementById('val-density').innerText = state.density + ' kg/m³';
    runAerodynamicSolver();
  });

  document.getElementById('cad-preset').addEventListener('change', (e) => {
    loadPresetCAD(e.target.value);
  });

  document.getElementById('fluid-preset').addEventListener('change', (e) => {
    const val = e.target.value;
    if (val === 'air_sea') { state.density = 1.225; state.viscosity = 0.0000181; }
    else if (val === 'air_high') { state.density = 0.413; state.viscosity = 0.0000145; }
    else if (val === 'water') { state.density = 998.2; state.viscosity = 0.001002; }
    else if (val === 'oil') { state.density = 888.0; state.viscosity = 0.29; }

    document.getElementById('slider-density').value = state.density;
    document.getElementById('val-density').innerText = state.density + ' kg/m³';
    document.getElementById('slider-viscosity').value = state.viscosity;
    document.getElementById('val-viscosity').innerText = state.viscosity.toExponential(2) + ' Pa·s';
    runAerodynamicSolver();
  });

  document.getElementById('file-input').addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (file) loadCustomCADFile(file);
  });
}

function loadCustomCADFile(file) {
  showLoading(true);
  const reader = new FileReader();
  const ext = file.name.split('.').pop().toLowerCase();

  reader.onload = function (event) {
    const contents = event.target.result;
    let geo;

    if (ext === 'stl') {
      const loader = new THREE.STLLoader();
      geo = loader.parse(contents);
    } else if (ext === 'obj') {
      const loader = new THREE.OBJLoader();
      const obj = loader.parse(contents);
      obj.traverse((child) => { if (child.isMesh) geo = child.geometry; });
    }

    if (geo) {
      if (state.mesh) scene.remove(state.mesh);
      geo.center();
      geo.computeVertexNormals();

      geo.computeBoundingBox();
      const size = new THREE.Vector3();
      geo.boundingBox.getSize(size);
      const maxDim = Math.max(size.x, size.y, size.z);
      if (maxDim > 7 || maxDim < 1) {
        const scale = 4.5 / maxDim;
        geo.scale(scale, scale, scale);
      }

      const mat = new THREE.MeshStandardMaterial({ color: 0x38bdf8, roughness: 0.3, metalness: 0.25 });
      state.mesh = new THREE.Mesh(geo, mat);
      scene.add(state.mesh);

      analyzeCADGeometry(geo);
      runAerodynamicSolver();
    }
    showLoading(false);
  };

  if (ext === 'stl') reader.readAsArrayBuffer(file);
  else reader.readAsText(file);
}

function showLoading(show) {
  const el = document.getElementById('loading-overlay');
  if (show) el.classList.remove('hidden');
  else el.classList.add('hidden');
}

function onWindowResize() {
  const container = document.getElementById('canvas-container');
  camera.aspect = container.clientWidth / container.clientHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(container.clientWidth, container.clientHeight);
}

function animate() {
  requestAnimationFrame(animate);
  controls.update();
  updateParticleStreams();
  renderer.render(scene, camera);
}

window.addEventListener('DOMContentLoaded', () => {
  initThree();
  setupEventListeners();
  animate();
});