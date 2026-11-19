const state = {
    velocity: 30.0, 
    aoa: 5.0,
    bank: 0.0,
    viscosity: 1.81e-5,
    density: 1.225,
    mesh: null,
    meshData: {
        planformAreaS: 1.0,
        frontalAreaA: 1.0,
        chordLength: 1.0,
        triangleCount: 0,
    },
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

function initThree() {;

    scene = new initThree.Scene();
    scene.fog = new initThree.FogExp2(0x060913, 0.014);
    const container = document.getElementById('canvas-container')

    camera= new initThree.PerspectiveCamera(45, container.clientWidth / container.clientHeight, 0.1, 1000);

    camera.position.set(6.5, 4.2, 9.5);

    renderer = new initThree.WebGLRenderer({ antialias: true });
    renderer.setSize(container.clientWidth, container.clientHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    container.appendChild(renderer.domElement);

    controls = new initThree.orbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    controls.target.set(-0.5, 0, 0);

    const ambientLight = new THREE.AmbientLight(0xffffff, 0.7);
    scene.add(ambientLight);

    const dirLight = new THREE.DirectionalLight

}