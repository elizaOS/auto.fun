import * as CANNON from "cannon-es";
import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { InstancedMesh } from "three";
// @ts-ignore
import confetti from "canvas-confetti";

// Add TypeScript declaration for CANNON to fix the errors
declare module "cannon-es" {
  interface Body {
    userData: any;
  }

  interface Vec3 {
    normalize(): Vec3;
    scale(scalar: number): Vec3;
  }

  interface Solver {
    iterations: number;
  }

  interface ContactEquation {
    getImpactVelocityAlongNormal(): number;
    ni: CANNON.Vec3;
  }

  interface ContactEvent {
    bodyA: CANNON.Body;
    bodyB: CANNON.Body;
    contact: ContactEquation;
  }
}

// Declare the debugDropCoins function on the window object
declare global {
  interface Window {
    debugDropCoins?: () => void;
    pauseCoins?: () => void;
    resumeCoins?: () => void;
  }
}

// Constants for physics - match the same constants from header
const COIN_BODY_MATERIAL = "coin";
const FLOOR_MATERIAL = "floor";
const WALL_MATERIAL = "wall";

interface CoinDropProps {
  imageUrl?: string;
}

const CoinDrop = ({ imageUrl }: CoinDropProps) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [isLoading, setIsLoading] = useState(true);
  // Track how many coins have been dropped
  const coinCountRef = useRef<number>(0);
  // Max number of coins to generate - increased to 10,000
  const MAX_COINS = 100;
  // Reference to store instance matrices for updating
  const coinInstanceRef = useRef<InstancedMesh | null>(null);
  // Reference to store coin bodies
  const coinBodiesRef = useRef<CANNON.Body[]>([]);
  // Track if coins are being created
  const isCreatingCoinsRef = useRef<boolean>(false);
  // Track if physics is paused
  const isPausedRef = useRef<boolean>(false);
  // For coin dropping over time
  const coinCreationIntervalRef = useRef<number | null>(null);
  // Use refs for dimensions that need to be updated on resize
  const boxWidthRef = useRef<number>(0);
  const boxDepthRef = useRef<number>(0);
  const boxHeightRef = useRef<number>(0);
  const coinRadiusRef = useRef<number>(0);
  const coinThicknessRef = useRef<number>(0);

  useEffect(() => {
    if (!containerRef.current) return;

    // Get container dimensions - use full viewport
    const containerWidth = window.innerWidth;
    const containerHeight = window.innerHeight;

    // Set up box dimensions based on screen size - EXACT WINDOW SIZE
    boxWidthRef.current = containerWidth;
    boxDepthRef.current = containerHeight;
    boxHeightRef.current = containerHeight; // Tall box to give room for coins

    // Set coin size based on window size
    coinRadiusRef.current = containerWidth * 0.04;
    coinThicknessRef.current = coinRadiusRef.current * 0.1;

    // Create fireworks-like confetti effect
    const createConfettiFireworks = () => {
      const duration = 5 * 1000; // 5 seconds
      const animationEnd = Date.now() + duration;

      // Helper function to create a specific firework burst
      const fireConfettiBurst = (
        originX: number,
        originY: number,
        type: "circle" | "cannon" | "burst",
      ) => {
        // Define different types of confetti bursts
        const burstTypes = {
          circle: {
            particleCount: 100,
            angle: 0,
            spread: 360,
            origin: { x: originX, y: originY },
            colors: [
              "#ff0000",
              "#00ff00",
              "#0000ff",
              "#ffff00",
              "#ff00ff",
              "#00ffff",
            ],
            startVelocity: 30,
            ticks: 60,
            gravity: 1,
            drift: 0,
            scalar: 1.2,
            zIndex: 1000,
          },
          cannon: {
            particleCount: 80,
            angle: 60,
            spread: 55,
            origin: { x: originX, y: originY },
            colors: ["#FFD700", "#FFA500", "#ff0000", "#00ff00"],
            startVelocity: 45,
            ticks: 50,
            gravity: 1,
            zIndex: 1000,
          },
          burst: {
            particleCount: 60,
            angle: 90,
            spread: 100,
            origin: { x: originX, y: originY },
            colors: ["#ffffff", "#f0f0f0", "#e0e0e0", "#d0d0d0", "#ffcc00"],
            ticks: 100,
            gravity: 0.8,
            decay: 0.94,
            startVelocity: 30,
            zIndex: 1000,
          },
        };

        // Fire the specified burst type
        confetti(burstTypes[type]);
      };

      // Fire random bursts on an interval
      const burstInterval = setInterval(() => {
        const timeLeft = animationEnd - Date.now();

        // Stop launching confetti after 5 seconds
        if (timeLeft <= 0) {
          return clearInterval(burstInterval);
        }

        // Launch multiple bursts per interval
        const numberOfBursts = Math.floor(Math.random() * 3) + 1;

        for (let i = 0; i < numberOfBursts; i++) {
          // Random position
          const x = Math.random();
          // Keep y position in upper half of screen for better effect
          const y = Math.random() * 0.5;

          // Randomly choose burst type
          const burstTypes = ["circle", "cannon", "burst"] as const;
          const randomType =
            burstTypes[Math.floor(Math.random() * burstTypes.length)];

          // Fire the burst
          fireConfettiBurst(x, y, randomType);
        }
      }, 200); // More frequent bursts for spectacular effect

      // Special "finale" effect at the end
      setTimeout(() => {
        // Create a grand finale with multiple bursts at once
        for (let i = 0; i < 10; i++) {
          setTimeout(() => {
            const x = Math.random();
            const y = Math.random() * 0.5;
            const burstTypes = ["circle", "cannon", "burst"] as const;
            const randomType =
              burstTypes[Math.floor(Math.random() * burstTypes.length)];
            fireConfettiBurst(x, y, randomType);
          }, i * 100); // Spread out finale over 1 second
        }
      }, 4000); // Start finale 1 second before the end

      // Return cleanup function
      return () => {
        clearInterval(burstInterval);
      };
    };

    // Scene setup
    const scene = new THREE.Scene();
    scene.background = null; // Make scene background transparent

    // Physics world - updated to be more similar to dice physics
    const world = new CANNON.World();
    world.gravity.set(0, -9.8 * 40, 0); // Less extreme gravity for more natural bounces
    world.broadphase = new CANNON.NaiveBroadphase();
    world.solver.iterations = 10; // Increased like dice for better collision resolution
    world.allowSleep = true; // Very important for performance

    // Setup materials
    const floorMaterial = new CANNON.Material(FLOOR_MATERIAL);
    const wallMaterial = new CANNON.Material(WALL_MATERIAL);
    const coinMaterial = new CANNON.Material(COIN_BODY_MATERIAL);

    // Define contact behaviors - make more bouncy like the dice in header
    world.addContactMaterial(
      new CANNON.ContactMaterial(floorMaterial, coinMaterial, {
        friction: 0.6,
        restitution: 0.8, // Increased bounciness
      }),
    );

    world.addContactMaterial(
      new CANNON.ContactMaterial(wallMaterial, coinMaterial, {
        friction: 0.6,
        restitution: 0.9,
      }),
    );

    world.addContactMaterial(
      new CANNON.ContactMaterial(coinMaterial, coinMaterial, {
        friction: 0.6,
        restitution: 0.7, // Increased for better bouncing between coins
      }),
    );

    // Camera setup - ORTHOGRAPHIC and OVERHEAD with window-sized frustum
    const aspectRatio = containerWidth / containerHeight;
    const frustumSize = containerHeight; // Match container height exactly
    const camera = new THREE.OrthographicCamera(
      (-frustumSize * aspectRatio) / 2,
      (frustumSize * aspectRatio) / 2,
      frustumSize / 2,
      -frustumSize / 2,
      0.001,
      100000,
    );
    // Position camera directly overhead
    camera.position.set(0, 5000, 0);
    camera.lookAt(0, 0, 0);
    camera.rotation.z = 0; // Make sure top of screen is up

    // Renderer setup
    const renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: true, // Enable transparency
    });
    renderer.setSize(containerWidth, containerHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2)); // Limit pixel ratio for performance
    renderer.shadowMap.enabled = true;
    renderer.setClearColor(0x000000, 0); // Make background transparent

    // Add renderer to DOM
    containerRef.current.innerHTML = "";
    containerRef.current.appendChild(renderer.domElement);

    // Lighting - optimized for overhead view
    const ambientLight = new THREE.AmbientLight(0xffffff, 1);
    // rotate the ambient light down to the floor
    ambientLight.position.y = 5;
    scene.add(ambientLight);

    const directionalLight = new THREE.DirectionalLight(0xffffff, 1.0);
    directionalLight.position.set(5, 5, -5);
    // look at the center of the scene
    directionalLight.lookAt(0, 0, 0);
    // update matrix
    directionalLight.updateMatrix();
    directionalLight.castShadow = false;
    directionalLight.shadow.camera.near = 0.5;
    directionalLight.shadow.camera.far = boxHeightRef.current * 2;
    directionalLight.shadow.camera.left = -boxWidthRef.current / 2;
    directionalLight.shadow.camera.right = boxWidthRef.current / 2;
    directionalLight.shadow.camera.top = boxDepthRef.current / 2;
    directionalLight.shadow.camera.bottom = -boxDepthRef.current / 2;

    scene.add(directionalLight);

    // Floor - invisible but matching window size exactly
    const floorGeometry = new THREE.BoxGeometry(
      boxWidthRef.current,
      1,
      boxDepthRef.current,
    );
    const floorMeshMaterial = new THREE.MeshStandardMaterial({
      color: 0x000000, // Gray color for debugging
      roughness: 1.0,
      transparent: true,
      opacity: 0.0, // Semi-transparent for debugging
    });
    const floor = new THREE.Mesh(floorGeometry, floorMeshMaterial);
    floor.position.y = -0.5;
    floor.receiveShadow = true;
    // scene.add(floor);

    // Floor physics body
    const floorBody = new CANNON.Body({
      mass: 0, // static body
      shape: new CANNON.Box(
        new CANNON.Vec3(boxWidthRef.current / 2, 0.5, boxDepthRef.current / 2),
      ),
      material: floorMaterial,
    });
    floorBody.position.set(0, -0.5, 0);
    world.addBody(floorBody);

    // Walls - invisible, match window edges exactly
    const wallMeshMaterial = new THREE.MeshStandardMaterial({
      color: 0x03ff24, // Bright green
      roughness: 1.0,
      transparent: true,
      opacity: 0, // Less visible for debugging
    });

    // Back wall (top of screen)
    const backWallGeometry = new THREE.BoxGeometry(
      boxWidthRef.current,
      boxHeightRef.current,
      1,
    );
    const backWall = new THREE.Mesh(backWallGeometry, wallMeshMaterial);
    backWall.position.set(
      0,
      boxHeightRef.current / 2,
      -boxDepthRef.current / 2,
    );
    scene.add(backWall);

    // Back wall physics body
    const backWallBody = new CANNON.Body({
      mass: 0,
      shape: new CANNON.Box(
        new CANNON.Vec3(boxWidthRef.current / 2, boxHeightRef.current / 2, 0.5),
      ),
      material: wallMaterial,
    });
    backWallBody.position.set(
      0,
      boxHeightRef.current / 2,
      -boxDepthRef.current / 2,
    );
    world.addBody(backWallBody);

    // Front wall (bottom of screen)
    const frontWall = new THREE.Mesh(backWallGeometry, wallMeshMaterial);
    frontWall.position.set(
      0,
      boxHeightRef.current / 2,
      boxDepthRef.current / 2,
    );
    scene.add(frontWall);

    // Front wall physics body
    const frontWallBody = new CANNON.Body({
      mass: 0,
      shape: new CANNON.Box(
        new CANNON.Vec3(boxWidthRef.current / 2, boxHeightRef.current / 2, 0.5),
      ),
      material: wallMaterial,
    });
    frontWallBody.position.set(
      0,
      boxHeightRef.current / 2,
      boxDepthRef.current / 2,
    );
    world.addBody(frontWallBody);

    // Left wall
    const sideWallGeometry = new THREE.BoxGeometry(
      1,
      boxHeightRef.current,
      boxDepthRef.current,
    );
    const leftWall = new THREE.Mesh(sideWallGeometry, wallMeshMaterial);
    leftWall.position.set(
      -boxWidthRef.current / 2,
      boxHeightRef.current / 2,
      0,
    );
    scene.add(leftWall);

    // Left wall physics body
    const leftWallBody = new CANNON.Body({
      mass: 0,
      shape: new CANNON.Box(
        new CANNON.Vec3(0.5, boxHeightRef.current / 2, boxDepthRef.current / 2),
      ),
      material: wallMaterial,
    });
    leftWallBody.position.set(
      -boxWidthRef.current / 2,
      boxHeightRef.current / 2,
      0,
    );
    world.addBody(leftWallBody);

    // Right wall
    const rightWall = new THREE.Mesh(sideWallGeometry, wallMeshMaterial);
    rightWall.position.set(
      boxWidthRef.current / 2,
      boxHeightRef.current / 2,
      0,
    );
    scene.add(rightWall);

    // Right wall physics body
    const rightWallBody = new CANNON.Body({
      mass: 0,
      shape: new CANNON.Box(
        new CANNON.Vec3(0.5, boxHeightRef.current / 2, boxDepthRef.current / 2),
      ),
      material: wallMaterial,
    });
    rightWallBody.position.set(
      boxWidthRef.current / 2,
      boxHeightRef.current / 2,
      0,
    );
    world.addBody(rightWallBody);

    // Load textures for coins
    const textureLoader = new THREE.TextureLoader();
    const coinTexture = textureLoader.load(imageUrl || "logo.png", () => {
      setIsLoading(false);
      console.log("Texture loaded, starting coin creation");
      // Start coin creation once texture is loaded
      startCoinCreation();
      // Start the confetti fireworks effect
      createConfettiFireworks();
    });

    // Create coin geometry using the radius from ref
    const coinGeometry = new THREE.CylinderGeometry(
      coinRadiusRef.current, // radiusTop
      coinRadiusRef.current, // radiusBottom
      coinThicknessRef.current, // height
      32, // radiusSegments - reduced for performance
      1, // heightSegments
      false, // openEnded
    );

    // create a roughness map from sobel edge detection
    const createRoughnessMap = (
      texture: THREE.Texture,
    ): Promise<THREE.Texture | null> => {
      // Create a canvas to process the texture
      const canvas = document.createElement("canvas");
      const ctx = canvas.getContext("2d");

      // If we can't get a 2d context, return null
      if (!ctx) {
        console.error("Could not get 2D context for roughness map");
        return Promise.resolve(null);
      }

      // Create an image to draw the texture
      const image = new Image();

      // Return a new promise that resolves with the roughness texture
      return new Promise((resolve) => {
        image.onload = () => {
          // Set canvas size to match image
          canvas.width = image.width;
          canvas.height = image.height;

          // Draw the image to canvas
          ctx.drawImage(image, 0, 0);

          // Get image data for processing
          const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
          const data = imageData.data;

          // Create output array for the edge detection result
          const output = new Uint8ClampedArray(data.length);

          // Sobel kernels for edge detection
          const sobelX = [-1, 0, 1, -2, 0, 2, -1, 0, 1];
          const sobelY = [-1, -2, -1, 0, 0, 0, 1, 2, 1];

          // Apply Sobel filter
          for (let y = 1; y < canvas.height - 1; y++) {
            for (let x = 1; x < canvas.width - 1; x++) {
              let gx = 0;
              let gy = 0;

              // Apply convolution
              for (let ky = -1; ky <= 1; ky++) {
                for (let kx = -1; kx <= 1; kx++) {
                  const idx = ((y + ky) * canvas.width + (x + kx)) * 4;
                  const kernelIdx = (ky + 1) * 3 + (kx + 1);

                  // Use average of RGB for grayscale
                  const val = (data[idx] + data[idx + 1] + data[idx + 2]) / 3;

                  gx += val * sobelX[kernelIdx];
                  gy += val * sobelY[kernelIdx];
                }
              }

              // Calculate gradient magnitude
              const g = Math.sqrt(gx * gx + gy * gy);

              // Calculate index in the output array
              const outIdx = (y * canvas.width + x) * 4;

              // Normalize and set edge intensity for roughness (invert for proper roughness effect)
              const edgeValue = 255 - Math.min(g, 255);

              // Set RGB to edge value for roughness map
              output[outIdx] = edgeValue;
              output[outIdx + 1] = edgeValue;
              output[outIdx + 2] = edgeValue;
              output[outIdx + 3] = 255; // Full alpha
            }
          }

          // Create new image data with edge detection results
          const outputImageData = new ImageData(
            output,
            canvas.width,
            canvas.height,
          );
          ctx.putImageData(outputImageData, 0, 0);

          // Create a Three.js texture from the canvas
          const roughnessTexture = new THREE.CanvasTexture(canvas);
          roughnessTexture.needsUpdate = true;

          // Resolve the promise with the generated texture
          resolve(roughnessTexture);
        };

        // Set the image source to the texture's image
        if (texture.image) {
          // Set colorspace to SRGB before loading
          texture.colorSpace = THREE.SRGBColorSpace;

          image.src =
            texture.image instanceof HTMLImageElement
              ? texture.image.src
              : URL.createObjectURL(
                  new Blob([texture.image.data], { type: "image/png" }),
                );
        } else {
          // If texture image isn't available, resolve with null
          resolve(null);
        }
      });
    };

    // Create materials for the coin - gold color with the logo
    const coinMeshMaterial = new THREE.MeshStandardMaterial({
      map: coinTexture,
      metalness: 0.8,
      roughness: 0.1,
      color: 0xffffff, // Gold color
      emissiveMap: coinTexture,
      emissive: 0xffffff, // Add emissive to make them more visible
      emissiveIntensity: 0.6,
      envMap: new THREE.CubeTextureLoader().load([
        "https://dl.polyhaven.org/file/ph-assets/HDRIs/hdr/1k/studio_small_09_1k.hdr",
      ]),
    });

    // Create a fake normal map from the coin texture
    const createNormalMap = (
      texture: THREE.Texture,
    ): Promise<THREE.Texture | null> => {
      // Create a canvas to process the texture
      const canvas = document.createElement("canvas");
      const ctx = canvas.getContext("2d");

      // If we can't get a 2d context, return null
      if (!ctx) {
        console.error("Could not get 2D context for normal map");
        return Promise.resolve(null);
      }

      // Create an image to draw the texture
      const image = new Image();

      // Return a new promise that resolves with the normal texture
      return new Promise((resolve) => {
        image.onload = () => {
          // Set canvas size to match image
          canvas.width = image.width;
          canvas.height = image.height;

          // Draw the image to canvas
          ctx.drawImage(image, 0, 0);

          // Get image data for processing
          const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
          const data = imageData.data;

          // Create output array for the normal map
          const output = new Uint8ClampedArray(data.length);

          // Sobel kernels for edge detection
          const sobelX = [-1, 0, 1, -2, 0, 2, -1, 0, 1];
          const sobelY = [-1, -2, -1, 0, 0, 0, 1, 2, 1];

          // Apply Sobel filter to generate normal map
          for (let y = 1; y < canvas.height - 1; y++) {
            for (let x = 1; x < canvas.width - 1; x++) {
              let gx = 0;
              let gy = 0;

              // Apply convolution
              for (let ky = -1; ky <= 1; ky++) {
                for (let kx = -1; kx <= 1; kx++) {
                  const idx = ((y + ky) * canvas.width + (x + kx)) * 4;
                  const kernelIdx = (ky + 1) * 3 + (kx + 1);

                  // Use average of RGB for grayscale
                  const val = (data[idx] + data[idx + 1] + data[idx + 2]) / 3;

                  gx += val * sobelX[kernelIdx];
                  gy += val * sobelY[kernelIdx];
                }
              }

              // Calculate index in the output array
              const outIdx = (y * canvas.width + x) * 4;

              // Normal maps store XYZ normals in RGB channels
              // Convert gradients to normal map by normalizing
              // For normal maps: R=X, G=Y, B=Z
              // Scale X and Y (red and green) by strength factor
              const strength = 3.0; // Adjust strength of the normal effect

              // Calculate normal vector components
              // R: X normal component (128 is neutral/flat)
              output[outIdx] = Math.max(0, Math.min(255, 128 + gx * strength));
              // G: Y normal component (128 is neutral/flat)
              output[outIdx + 1] = Math.max(
                0,
                Math.min(255, 128 + gy * strength),
              );
              // B: Z normal component (always positive for coin surface, higher value = more raised)
              output[outIdx + 2] = 255; // Full blue for maximum Z value
              // Alpha channel
              output[outIdx + 3] = 255;
            }
          }

          // Create new image data with normal map
          const outputImageData = new ImageData(
            output,
            canvas.width,
            canvas.height,
          );
          ctx.putImageData(outputImageData, 0, 0);

          // Create a Three.js texture from the canvas
          const normalTexture = new THREE.CanvasTexture(canvas);
          normalTexture.needsUpdate = true;

          // Resolve the promise with the generated texture
          resolve(normalTexture);
        };

        // Set the image source to the texture's image
        if (texture.image) {
          image.src =
            texture.image instanceof HTMLImageElement
              ? texture.image.src
              : URL.createObjectURL(
                  new Blob([texture.image.data], { type: "image/png" }),
                );
        } else {
          // If texture image isn't available, resolve with null
          resolve(null);
        }
      });
    };

    // Apply roughness map after texture loads
    createRoughnessMap(coinTexture).then((roughnessMap) => {
      if (roughnessMap) {
        coinMeshMaterial.roughnessMap = roughnessMap;
        coinMeshMaterial.needsUpdate = true;
      }
    });

    // Apply normal map after texture loads
    createNormalMap(coinTexture).then((normalMap) => {
      if (normalMap) {
        coinMeshMaterial.normalMap = normalMap;
        coinMeshMaterial.normalScale.set(0.5, 0.5); // Adjust normal intensity
        coinMeshMaterial.needsUpdate = true;
      }
    });

    // Create instanced mesh for efficient rendering
    const coinInstancedMesh = new THREE.InstancedMesh(
      coinGeometry,
      coinMeshMaterial,
      MAX_COINS,
    );
    coinInstancedMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    coinInstancedMesh.castShadow = true;
    coinInstancedMesh.receiveShadow = true;
    scene.add(coinInstancedMesh);

    // Store the instanced mesh in the ref
    coinInstanceRef.current = coinInstancedMesh;

    // Create a temporary matrix and dummy object for updates
    const matrix = new THREE.Matrix4();
    const dummyObject = new THREE.Object3D();

    // Function to create and drop a single coin
    function createCoin() {
      if (coinCountRef.current >= MAX_COINS) {
        console.log("Maximum number of coins reached");
        return null;
      }

      const index = coinCountRef.current;

      // Set random position across the window-sized container
      // Keep it within the box bounds with some padding
      const x = (Math.random() - 0.5) * boxWidthRef.current * 0.9;
      const y = 2 + Math.random() * 2; // Start high up in the container
      const z = (Math.random() - 0.5) * boxDepthRef.current * 0.9;

      // Log coin creation with window-relative coordinates
      console.log(
        `Creating coin #${index} at position [${((x / boxWidthRef.current) * 100).toFixed(1)}%, ${((y / boxHeightRef.current) * 100).toFixed(1)}%, ${((z / boxDepthRef.current) * 100).toFixed(1)}%]`,
      );

      // Set initial rotation
      const rotX = Math.random() * Math.PI;
      const rotZ = Math.random() * Math.PI;

      // Update the instance matrix
      dummyObject.position.set(x, y, z);
      dummyObject.rotation.set(rotX, 0, rotZ);
      dummyObject.updateMatrix();
      coinInstancedMesh.setMatrixAt(index, dummyObject.matrix);

      // Need to flag this for update
      coinInstancedMesh.instanceMatrix.needsUpdate = true;

      // Create physics body for the coin - bright gold for visibility
      const coinShape = new CANNON.Cylinder(
        coinRadiusRef.current, // radiusTop
        coinRadiusRef.current, // radiusBottom
        coinThicknessRef.current, // height
        12, // numSegments - reduced for physics performance
      );

      const coinBody = new CANNON.Body({
        mass: 10000, // Weight needs to be enough for good physics
        shape: coinShape,
        material: coinMaterial,
        allowSleep: true, // Critical for performance
        sleepSpeedLimit: 0.5, // Increased - only sleep when more settled
        sleepTimeLimit: 0.2, // Increased - stay awake a bit longer
        linearDamping: 0.2, // Reduced - less damping for more bouncy movement
        angularDamping: 0.2, // Reduced - maintain spin longer
      });

      // Set position and rotation
      coinBody.position.set(x, y, z);
      coinBody.quaternion.setFromEuler(rotX, 0, rotZ);

      // Add initial velocity for more natural falling
      coinBody.velocity.set(
        (Math.random() - 0.5) * 8, // More horizontal movement
        -20 - Math.random() * 30, // Much stronger downward velocity
        (Math.random() - 0.5) * 8, // More depth movement
      );

      // Add initial angular velocity for more dramatic spinning
      coinBody.angularVelocity.set(
        (Math.random() - 0.5) * 25, // Much stronger spin
        (Math.random() - 0.5) * 25, // Much stronger spin
        (Math.random() - 0.5) * 25, // Much stronger spin
      );

      // Store the instance index with the body for updates
      coinBody.userData = { index };

      // Add to world
      world.addBody(coinBody);

      // Store in our ref array
      coinBodiesRef.current.push(coinBody);

      // Increment the counter
      coinCountRef.current++;

      return coinBody;
    }

    // Collision handler for more realistic physics - similar to dice in frontpage-header
    function handleCollisions(event: CANNON.ContactEvent) {
      try {
        // In this event, we need to get the body that collided
        const bodyA = event.bodyA;
        const bodyB = event.bodyB;

        // Find which body is a coin (has mass > 0)
        const coinBody = bodyA.mass > 0 ? bodyA : bodyB.mass > 0 ? bodyB : null;

        if (!coinBody) return;

        // Get normal vector from contact
        const normal = event.contact.ni;

        // Get impact velocity (how hard the collision was)
        const impactVelocity = event.contact.getImpactVelocityAlongNormal();

        // Add larger random spin on any collision, like in the dice code
        const randomX = (Math.random() - 0.5) * 15; // Increased from 5*intensity
        const randomY = (Math.random() - 0.5) * 15;
        const randomZ = (Math.random() - 0.5) * 15;

        coinBody.angularVelocity.x += randomX;
        coinBody.angularVelocity.y += randomY;
        coinBody.angularVelocity.z += randomZ;

        // Add upward bounce if the coin is nearly settled
        // This matches the dice behavior which adds upward velocity
        if (coinBody.velocity.y < 0.5 && impactVelocity > 0.5) {
          // Add a small upward bounce for better movement
          coinBody.velocity.y += Math.random() * 3;

          // Also add a small random horizontal movement for more interesting collisions
          coinBody.velocity.x += (Math.random() - 0.5) * 2;
          coinBody.velocity.z += (Math.random() - 0.5) * 2;
        }

        // For coin-to-coin collisions, make them more energetic
        const otherBody = coinBody === bodyA ? bodyB : bodyA;
        if (otherBody.mass > 0) {
          // This is a coin-to-coin collision
          // Get the direction of impact
          const impulseDir = normal.scale(Math.min(impactVelocity * 0.2, 2));

          // Apply opposite impulses to make collision more dramatic
          otherBody.velocity.x += impulseDir.x;
          otherBody.velocity.z += impulseDir.z;
          // Add a bit of upward velocity for coin-to-coin collisions
          otherBody.velocity.y += Math.abs(impulseDir.y) + Math.random() * 1.5;
        }
      } catch (error) {
        console.error("Error in collision handler:", error);
      }
    }

    // Add collision event listener
    world.addEventListener("collide", handleCollisions);

    // Function to create coins gradually over 5 seconds
    function startCoinCreation() {
      if (isCreatingCoinsRef.current) return;

      // Create an initial batch immediately so we can see something
      for (let i = 0; i < 50; i++) {
        createCoin();
      }

      isCreatingCoinsRef.current = true;

      // Calculate how many coins to create per second to reach MAX_COINS in 5 seconds
      const coinsPerSecond = MAX_COINS / 5;

      // How many batches per second (higher gives smoother distribution)
      const batchesPerSecond = 5; // Reduced for better logging

      // How many coins in each batch
      const coinsPerBatch = Math.ceil(coinsPerSecond / batchesPerSecond);

      // Interval between batches in ms
      const batchInterval = 1000 / batchesPerSecond;

      // Set up interval for creating coins
      coinCreationIntervalRef.current = window.setInterval(() => {
        // Check if we've reached the max
        if (coinCountRef.current >= MAX_COINS) {
          if (coinCreationIntervalRef.current !== null) {
            clearInterval(coinCreationIntervalRef.current);
            coinCreationIntervalRef.current = null;
            isCreatingCoinsRef.current = false;
            console.log(`Finished creating ${coinCountRef.current} coins`);
          }
          return;
        }

        // Create a batch of coins
        const remainingCoins = MAX_COINS - coinCountRef.current;
        const coinsToCreate = Math.min(coinsPerBatch, remainingCoins);

        for (let i = 0; i < coinsToCreate; i++) {
          createCoin();
        }
      }, batchInterval);
    }

    // Function to toggle physics simulation pause
    function togglePause() {
      isPausedRef.current = !isPausedRef.current;
      console.log(isPausedRef.current ? "Physics paused" : "Physics resumed");
    }

    // Function to handle space bar press
    function handleKeyPress(event: KeyboardEvent) {
      if (event.code === "Space") {
        event.preventDefault();
        togglePause();
      } else if (event.code === "KeyD") {
        event.preventDefault();
        console.log("Manual drop triggered with D key");
        if (window.debugDropCoins) {
          window.debugDropCoins();
        }
      }
    }

    // Add event listener for keyboard
    window.addEventListener("keydown", handleKeyPress);

    // Expose functions to window for debugging
    window.debugDropCoins = () => {
      console.log("DEBUG: Manually dropping 100 coins for testing");
      // Create 100 coins at once for debugging
      for (let i = 0; i < 100; i++) {
        createCoin();
      }
    };

    window.pauseCoins = () => {
      isPausedRef.current = true;
    };

    window.resumeCoins = () => {
      isPausedRef.current = false;
    };

    // Animation loop
    let lastTime = 0;
    const fixedTimeStep = 1 / 60; // 60 FPS physics

    // Add to the animation loop to log active coins periodically
    function animate(time = 0) {
      requestAnimationFrame(animate);

      // Skip physics step if paused
      if (!isPausedRef.current) {
        // Calculate time delta and update physics with fixed timestep
        const deltaTime = Math.min((time - lastTime) / 1000, 0.1); // Cap at 0.1s to prevent large jumps
        lastTime = time;

        // Step physics
        world.step(fixedTimeStep, deltaTime);
      }

      // Always update visuals even when physics is paused
      // Update coin positions and rotations
      for (let i = 0; i < coinBodiesRef.current.length; i++) {
        const coinBody = coinBodiesRef.current[i];
        const index = coinBody.userData.index;

        // Create a matrix from the physics body
        matrix.compose(
          new THREE.Vector3(
            coinBody.position.x,
            coinBody.position.y,
            coinBody.position.z,
          ),
          new THREE.Quaternion(
            coinBody.quaternion.x,
            coinBody.quaternion.y,
            coinBody.quaternion.z,
            coinBody.quaternion.w,
          ),
          new THREE.Vector3(1, 1, 1),
        );

        // Update the instance
        if (coinInstanceRef.current) {
          coinInstanceRef.current.setMatrixAt(index, matrix);
        }
      }

      // Update the instance matrices
      if (coinInstanceRef.current) {
        coinInstanceRef.current.instanceMatrix.needsUpdate = true;
      }

      // Render the scene
      renderer.render(scene, camera);
    }

    // Start animation
    animate();

    // Handle window resize - adjust box dimensions to match new window size
    const onWindowResize = () => {
      if (!containerRef.current) return;

      const newWidth = window.innerWidth;
      const newHeight = window.innerHeight;

      // Update orthographic camera to match new dimensions
      const newAspect = newWidth / newHeight;
      const newFrustumSize = newHeight;

      if (camera instanceof THREE.OrthographicCamera) {
        camera.left = (-newFrustumSize * newAspect) / 2;
        camera.right = (newFrustumSize * newAspect) / 2;
        camera.top = newFrustumSize / 2;
        camera.bottom = -newFrustumSize / 2;
        camera.updateProjectionMatrix();
      }

      // Update renderer size
      renderer.setSize(newWidth, newHeight);

      // Update box dimensions to match new window size
      boxWidthRef.current = newWidth;
      boxDepthRef.current = newHeight;
      boxHeightRef.current = newHeight;

      // Update coin size to scale with new window size
      coinRadiusRef.current = newWidth * 0.015;
      coinThicknessRef.current = coinRadiusRef.current * 0.2;
    };

    // Add resize listener
    window.addEventListener("resize", onWindowResize);

    // Cleanup on unmount
    return () => {
      // Clear any ongoing coin creation
      if (coinCreationIntervalRef.current !== null) {
        clearInterval(coinCreationIntervalRef.current);
      }

      window.removeEventListener("keydown", handleKeyPress);
      window.removeEventListener("resize", onWindowResize);
      world.removeEventListener("collide", handleCollisions);

      delete window.debugDropCoins;
      delete window.pauseCoins;
      delete window.resumeCoins;

      // Clean up THREE.js resources
      scene.remove(coinInstanceRef.current as InstancedMesh);
      coinGeometry.dispose();
      coinMeshMaterial.dispose();
      renderer.dispose();
    };
  }, []);

  return (
    <div
      className="fixed top-0 left-0 w-full h-full overflow-hidden z-50 pointer-events-none"
      ref={containerRef}
    >
      {isLoading && (
        <div className="absolute top-0 left-0 w-full h-full flex items-center justify-center bg-black bg-opacity-75 text-white text-xl z-20">
          Loading...
        </div>
      )}
    </div>
  );
};

export default CoinDrop;
