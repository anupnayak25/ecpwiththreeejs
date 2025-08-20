import { useRef, useEffect, useState, useMemo } from "react";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass";
import "./App.css";

function App() {
  const mountRef = useRef(null);
  const [currentViewpoint, setCurrentViewpoint] = useState(0);
  const [customPosition, setCustomPosition] = useState({ x: 0, y: 30, z: 0 });
  const [customLookAt, setCustomLookAt] = useState({ x: 0, y: 0, z: 0 });
  const isEditingRef = useRef(false);
  const mouseRef = useRef({ x: 0, y: 0 });
  const isUserInteractingRef = useRef(false);
  const [enableBloom, setEnableBloom] = useState(true);
  const enableBloomRef = useRef(enableBloom);
  const modelRef = useRef(null);

  // Camera viewpoints
  const viewpoints = useMemo(
    () => [
      { position: { x: 52, y: -7, z: 5 }, lookAt: { x: 43, y: -3, z: 16 }, name: "City Overview" },
      { position: { x: 59, y: -8, z: -9 }, lookAt: { x: 59, y: 4, z: -40 }, name: "Tall Building" },
      { position: { x: -10, y: 2, z: 5 }, lookAt: { x: 0, y: 2, z: 0 }, name: "Street Level" },
      { position: { x: 15, y: 8, z: -10 }, lookAt: { x: 0, y: 5, z: 0 }, name: "Corner View" },
      { position: { x: 0, y: 5, z: 15 }, lookAt: { x: 0, y: 0, z: 0 }, name: "Central Plaza" },
      { position: { x: -15, y: 12, z: 0 }, lookAt: { x: 0, y: 5, z: 0 }, name: "Side Angle" },
    ],
    []
  );

  useEffect(() => {
    const current = mountRef.current;
    const scene = new THREE.Scene();

    const camera = new THREE.PerspectiveCamera(75, current.clientWidth / current.clientHeight, 0.1, 1000);
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(current.clientWidth, current.clientHeight);

    // Neon style rendering
    renderer.outputEncoding = THREE.sRGBEncoding;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 0.9;

    current.appendChild(renderer.domElement);

    // Lights
    scene.add(new THREE.AmbientLight(0xffffff, 0.8));
    const dirLight = new THREE.DirectionalLight(0xffffff, 1.2);
    dirLight.position.set(5, 10, 7.5);
    scene.add(dirLight);

    // Controls
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    controls.enableZoom = false;
    controls.enablePan = true;

    controls.addEventListener("start", () => (isUserInteractingRef.current = true));
    controls.addEventListener("end", () => (isUserInteractingRef.current = false));

    // Animation state
    let isAnimating = false;

    // Smooth camera transition
    const animateToViewpoint = (targetPosition, targetLookAt, duration = 2000) => {
      if (isAnimating) return;
      isEditingRef.current = true;
      isAnimating = true;

      const startPosition = camera.position.clone();
      const startLookAt = controls.target.clone();
      const startTime = Date.now();

      const animate = () => {
        const elapsed = Date.now() - startTime;
        const progress = Math.min(elapsed / duration, 1);
        const ease = progress < 0.5 ? 2 * progress * progress : 1 - Math.pow(-2 * progress + 2, 3) / 2;

        camera.position.lerpVectors(startPosition, targetPosition, ease);
        controls.target.lerpVectors(startLookAt, targetLookAt, ease);
        controls.update();

        if (progress < 1) requestAnimationFrame(animate);
        else {
          isAnimating = false;
          isEditingRef.current = false;
        }
      };

      animate();
    };

    // Set a viewpoint
    const setViewpoint = (index) => {
      const vp = viewpoints[index];
      animateToViewpoint(
        new THREE.Vector3(vp.position.x, vp.position.y, vp.position.z),
        new THREE.Vector3(vp.lookAt.x, vp.lookAt.y, vp.lookAt.z)
      );
    };

    // Expose to window for Apply Position button
    window.setCustomViewpoint = (pos, look) => {
      animateToViewpoint(new THREE.Vector3(pos.x, pos.y, pos.z), new THREE.Vector3(look.x, look.y, look.z));
    };

    // Initial view
    const initial = viewpoints[0];
    camera.position.set(initial.position.x, initial.position.y, initial.position.z);
    controls.target.set(initial.lookAt.x, initial.lookAt.y, initial.lookAt.z);
    controls.update();

    // Scroll to change viewpoint
    let scrollTimeout;
    current.addEventListener(
      "wheel",
      (event) => {
        event.preventDefault();
        clearTimeout(scrollTimeout);
        scrollTimeout = setTimeout(() => {
          setCurrentViewpoint((prev) => {
            const next =
              event.deltaY > 0 ? (prev + 1) % viewpoints.length : (prev - 1 + viewpoints.length) % viewpoints.length;
            setViewpoint(next);
            return next;
          });
        }, 100);
      },
      { passive: false }
    );

    // Post-processing (bloom)
    const composer = new EffectComposer(renderer);
    composer.addPass(new RenderPass(scene, camera));

    const bloomPass = new UnrealBloomPass(
      new THREE.Vector2(current.clientWidth, current.clientHeight),
      0.5, // strength
      0.5, // radius
      0.2 // threshold
    );
    composer.addPass(bloomPass);

    // Load GLTF model
    const loader = new GLTFLoader();
    loader.load(
      "/models/cityneon.glb",
      (gltf) => {
        const model = gltf.scene;
        scene.add(model);

        // Center model
        const box = new THREE.Box3().setFromObject(model);
        const center = box.getCenter(new THREE.Vector3());
        model.position.sub(center);

        // Boost emissive intensity for bloom
        model.traverse((child) => {
          if (child.isMesh && child.material && child.material.emissive !== undefined) {
            const mat = child.material;
            mat.userData = mat.userData || {};
            mat.userData._originalEmissive = mat.emissive.clone();
            mat.userData._originalEmissiveIntensity = mat.emissiveIntensity || 1;
            mat.emissiveIntensity = 1.2; // brighter neon
          }
        });

        modelRef.current = model;
      },
      (xhr) => console.log(`Model ${(xhr.loaded / xhr.total) * 100}% loaded`),
      (err) => console.error("Error loading model:", err)
    );

    // Handle resize
    const handleResize = () => {
      camera.aspect = current.clientWidth / current.clientHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(current.clientWidth, current.clientHeight);
      composer.setSize(current.clientWidth, current.clientHeight);
    };
    window.addEventListener("resize", handleResize);

    // Animation loop
    const animate = () => {
      requestAnimationFrame(animate);
      controls.update();
      if (enableBloomRef.current) composer.render();
      else renderer.render(scene, camera);
    };
    animate();

    return () => {
      window.removeEventListener("resize", handleResize);
      current.removeChild(renderer.domElement);
      renderer.dispose();
    };
  }, [viewpoints]);

  const handleCustomPosition = () => {
    isEditingRef.current = true;
    window.setCustomViewpoint(customPosition, customLookAt);
  };

  return (
    <div>
      <div ref={mountRef} style={{ width: "100vw", height: "100vh" }} />
      <div
        style={{
          position: "absolute",
          top: 20,
          left: 20,
          color: "white",
          background: "rgba(0,0,0,0.7)",
          padding: 10,
          borderRadius: 5,
        }}>
        <div>
          Viewpoint {currentViewpoint + 1}/{viewpoints.length}
        </div>
        <div>{viewpoints[currentViewpoint]?.name}</div>
        <div style={{ fontSize: 12, marginTop: 5 }}>Scroll to change viewpoint • Drag to look around</div>
      </div>

      {/* Bloom Toggle */}
      <div
        style={{
          position: "absolute",
          top: 110,
          left: 20,
          color: "white",
          background: "rgba(0,0,0,0.7)",
          padding: 8,
          borderRadius: 5,
        }}>
        <label style={{ display: "flex", gap: "8px", alignItems: "center" }}>
          <input
            type="checkbox"
            checked={enableBloom}
            onChange={(e) => {
              setEnableBloom(e.target.checked);
              enableBloomRef.current = e.target.checked;
            }}
          />
          Enable Bloom
        </label>
      </div>

      {/* Custom Position Controls */}
      <div
        style={{
          position: "absolute",
          top: 20,
          right: 20,
          color: "white",
          background: "rgba(0,0,0,0.7)",
          padding: 15,
          borderRadius: 5,
          width: 250,
        }}>
        <div style={{ marginBottom: 10, fontWeight: "bold" }}>Custom Camera Position</div>

        {/* Position */}
        <div style={{ marginBottom: 10 }}>
          <div style={{ fontSize: 12, marginBottom: 5 }}>Camera Position:</div>
          <div style={{ display: "flex", gap: 5 }}>
            {["x", "y", "z"].map((axis) => (
              <input
                key={axis}
                type="number"
                value={customPosition[axis]}
                onChange={(e) => setCustomPosition({ ...customPosition, [axis]: parseFloat(e.target.value) || 0 })}
                style={{ width: "60px", padding: 2 }}
              />
            ))}
          </div>
        </div>

        {/* LookAt */}
        <div style={{ marginBottom: 10 }}>
          <div style={{ fontSize: 12, marginBottom: 5 }}>Look At:</div>
          <div style={{ display: "flex", gap: 5 }}>
            {["x", "y", "z"].map((axis) => (
              <input
                key={axis}
                type="number"
                value={customLookAt[axis]}
                onChange={(e) => setCustomLookAt({ ...customLookAt, [axis]: parseFloat(e.target.value) || 0 })}
                style={{ width: "60px", padding: 2 }}
              />
            ))}
          </div>
        </div>

        <button
          onClick={handleCustomPosition}
          style={{
            width: "100%",
            padding: 8,
            background: "#4CAF50",
            color: "white",
            border: "none",
            borderRadius: 3,
            cursor: "pointer",
          }}>
          Apply Position
        </button>
      </div>
    </div>
  );
}

export default App;
