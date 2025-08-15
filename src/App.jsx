import { useRef, useEffect, useState, useMemo } from "react";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls";
import "./App.css";

function App() {
  const mountRef = useRef(null);
  const [currentViewpoint, setCurrentViewpoint] = useState(0);
  const [customPosition, setCustomPosition] = useState({ x: 0, y: 30, z: 0 });
  const [customLookAt, setCustomLookAt] = useState({ x: 0, y: 0, z: 0 });

  // Define camera viewpoints
  const viewpoints = useMemo(
    () => [
      // Top-down city overview
      { position: { x: 0, y: 30, z: 0 }, lookAt: { x: 0, y: 0, z: 0 }, name: "City Overview" },
      // Close to tall building
      { position: { x: 8, y: 15, z: 8 }, lookAt: { x: 5, y: 10, z: 5 }, name: "Tall Building" },
      // Street level view
      { position: { x: -10, y: 2, z: 5 }, lookAt: { x: 0, y: 2, z: 0 }, name: "Street Level" },
      // Corner building perspective
      { position: { x: 15, y: 8, z: -10 }, lookAt: { x: 0, y: 5, z: 0 }, name: "Corner View" },
      // Central plaza
      { position: { x: 0, y: 5, z: 15 }, lookAt: { x: 0, y: 0, z: 0 }, name: "Central Plaza" },
      // Side angle
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
    current.appendChild(renderer.domElement);

    // Add ambient and directional light
    const ambientLight = new THREE.AmbientLight(0xffffff, 1.2);
    scene.add(ambientLight);
    const directionalLight = new THREE.DirectionalLight(0xffffff, 1.2);
    directionalLight.position.set(5, 10, 7.5);
    scene.add(directionalLight);

    // Add OrbitControls for camera movement
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    controls.enableZoom = false; // Disable zoom to use scroll for viewpoint switching
    controls.enablePan = true;

    // Animation state
    let isAnimating = false;
    // eslint-disable-next-line no-unused-vars
    let animationFrame = null;

    // Smooth camera transition function
    const animateToViewpoint = (targetPosition, targetLookAt, duration = 2000) => {
      if (isAnimating) return; // Prevent multiple animations

      isAnimating = true;
      const startPosition = camera.position.clone();
      const startLookAt = controls.target.clone();
      const startTime = Date.now();

      const animate = () => {
        const elapsed = Date.now() - startTime;
        const progress = Math.min(elapsed / duration, 1);

        // Easing function (ease-in-out)
        const easeInOut = progress < 0.5 ? 2 * progress * progress : 1 - Math.pow(-2 * progress + 2, 3) / 2;

        // Interpolate position
        camera.position.lerpVectors(startPosition, targetPosition, easeInOut);

        // Interpolate look-at target
        const currentLookAt = new THREE.Vector3().lerpVectors(startLookAt, targetLookAt, easeInOut);
        controls.target.copy(currentLookAt);
        controls.update();

        if (progress < 1) {
          animationFrame = requestAnimationFrame(animate);
        } else {
          isAnimating = false;
          animationFrame = null;
        }
      };

      animate();
    };

    // Set initial camera position
    const setViewpoint = (index) => {
      const viewpoint = viewpoints[index];
      const targetPosition = new THREE.Vector3(viewpoint.position.x, viewpoint.position.y, viewpoint.position.z);
      const targetLookAt = new THREE.Vector3(viewpoint.lookAt.x, viewpoint.lookAt.y, viewpoint.lookAt.z);

      animateToViewpoint(targetPosition, targetLookAt);
    };

    // Custom position function
    const setCustomViewpoint = (position, lookAt) => {
      const targetPosition = new THREE.Vector3(position.x, position.y, position.z);
      const targetLookAt = new THREE.Vector3(lookAt.x, lookAt.y, lookAt.z);

      animateToViewpoint(targetPosition, targetLookAt);
    };

    // Expose setCustomViewpoint to window for access from UI
    window.setCustomViewpoint = setCustomViewpoint;

    // Set initial viewpoint to city overview (without animation)
    const initialViewpoint = viewpoints[0];
    camera.position.set(initialViewpoint.position.x, initialViewpoint.position.y, initialViewpoint.position.z);
    camera.lookAt(initialViewpoint.lookAt.x, initialViewpoint.lookAt.y, initialViewpoint.lookAt.z);
    controls.target.set(initialViewpoint.lookAt.x, initialViewpoint.lookAt.y, initialViewpoint.lookAt.z);
    controls.update();

    // Handle scroll for viewpoint switching
    let scrollTimeout;
    const handleWheel = (event) => {
      event.preventDefault();

      clearTimeout(scrollTimeout);
      scrollTimeout = setTimeout(() => {
        if (event.deltaY > 0) {
          // Scroll down - next viewpoint
          setCurrentViewpoint((prev) => {
            const next = (prev + 1) % viewpoints.length;
            setViewpoint(next);
            return next;
          });
        } else {
          // Scroll up - previous viewpoint
          setCurrentViewpoint((prev) => {
            const next = (prev - 1 + viewpoints.length) % viewpoints.length;
            setViewpoint(next);
            return next;
          });
        }
      }, 100); // Debounce scroll events
    };

    current.addEventListener("wheel", handleWheel, { passive: false });

    // Load GLTF model
    const loader = new GLTFLoader();
    let model;
    loader.load(
      "/models/scene.gltf",
      (gltf) => {
        model = gltf.scene;
        scene.add(model);
        // Center model if possible
        const box = new THREE.Box3().setFromObject(model);
        const center = box.getCenter(new THREE.Vector3());
        model.position.sub(center); // Center the model at origin
        console.log("Model loaded:", model);
      },
      (xhr) => {
        console.log(`Model ${(xhr.loaded / xhr.total) * 100}% loaded`);
      },
      (error) => {
        console.error("An error happened while loading the model:", error);
      }
    );

    let animationId;
    const animate = () => {
      animationId = requestAnimationFrame(animate);
      controls.update(); // Update controls for damping

      // Update input fields with current camera position
      const currentPos = camera.position;
      const currentTarget = controls.target;

      setCustomPosition({
        x: Math.round(currentPos.x * 100) / 100,
        y: Math.round(currentPos.y * 100) / 100,
        z: Math.round(currentPos.z * 100) / 100,
      });

      setCustomLookAt({
        x: Math.round(currentTarget.x * 100) / 100,
        y: Math.round(currentTarget.y * 100) / 100,
        z: Math.round(currentTarget.z * 100) / 100,
      });

      renderer.render(scene, camera);
    };
    animate();

    return () => {
      cancelAnimationFrame(animationId);
      current.removeEventListener("wheel", handleWheel);
      controls.dispose();
      current.removeChild(renderer.domElement);
      renderer.dispose();
    };
  }, [viewpoints]);

  const handleCustomPosition = () => {
    window.setCustomViewpoint(customPosition, customLookAt);
  };

  return (
    <div>
      <div ref={mountRef} style={{ width: "100vw", height: "100vh" }} />
      <div
        style={{
          position: "absolute",
          top: "20px",
          left: "20px",
          color: "white",
          background: "rgba(0,0,0,0.7)",
          padding: "10px",
          borderRadius: "5px",
          fontFamily: "Arial, sans-serif",
        }}>
        <div>
          Viewpoint {currentViewpoint + 1}/{viewpoints.length}
        </div>
        <div>{viewpoints[currentViewpoint]?.name}</div>
        <div style={{ fontSize: "12px", marginTop: "5px" }}>Scroll to change viewpoint • Drag to look around</div>
      </div>

      {/* Custom Position Controls */}
      <div
        style={{
          position: "absolute",
          top: "20px",
          right: "20px",
          color: "white",
          background: "rgba(0,0,0,0.7)",
          padding: "15px",
          borderRadius: "5px",
          fontFamily: "Arial, sans-serif",
          width: "250px",
        }}>
        <div style={{ marginBottom: "10px", fontWeight: "bold" }}>Custom Camera Position</div>

        <div style={{ marginBottom: "10px" }}>
          <div style={{ fontSize: "12px", marginBottom: "5px" }}>Camera Position:</div>
          <div style={{ display: "flex", gap: "5px" }}>
            <input
              type="number"
              placeholder="X"
              value={customPosition.x}
              onChange={(e) => setCustomPosition({ ...customPosition, x: parseFloat(e.target.value) || 0 })}
              style={{ width: "60px", padding: "2px" }}
            />
            <input
              type="number"
              placeholder="Y"
              value={customPosition.y}
              onChange={(e) => setCustomPosition({ ...customPosition, y: parseFloat(e.target.value) || 0 })}
              style={{ width: "60px", padding: "2px" }}
            />
            <input
              type="number"
              placeholder="Z"
              value={customPosition.z}
              onChange={(e) => setCustomPosition({ ...customPosition, z: parseFloat(e.target.value) || 0 })}
              style={{ width: "60px", padding: "2px" }}
            />
          </div>
        </div>

        <div style={{ marginBottom: "10px" }}>
          <div style={{ fontSize: "12px", marginBottom: "5px" }}>Look At:</div>
          <div style={{ display: "flex", gap: "5px" }}>
            <input
              type="number"
              placeholder="X"
              value={customLookAt.x}
              onChange={(e) => setCustomLookAt({ ...customLookAt, x: parseFloat(e.target.value) || 0 })}
              style={{ width: "60px", padding: "2px" }}
            />
            <input
              type="number"
              placeholder="Y"
              value={customLookAt.y}
              onChange={(e) => setCustomLookAt({ ...customLookAt, y: parseFloat(e.target.value) || 0 })}
              style={{ width: "60px", padding: "2px" }}
            />
            <input
              type="number"
              placeholder="Z"
              value={customLookAt.z}
              onChange={(e) => setCustomLookAt({ ...customLookAt, z: parseFloat(e.target.value) || 0 })}
              style={{ width: "60px", padding: "2px" }}
            />
          </div>
        </div>

        <button
          onClick={handleCustomPosition}
          style={{
            width: "100%",
            padding: "8px",
            backgroundColor: "#4CAF50",
            color: "white",
            border: "none",
            borderRadius: "3px",
            cursor: "pointer",
          }}>
          Apply Position
        </button>
      </div>
    </div>
  );
}

export default App;
