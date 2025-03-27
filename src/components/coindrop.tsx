import * as CANNON from "cannon-es";
import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { InstancedMesh } from "three";

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

const CoinDrop = () => {
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
    coinRadiusRef.current = containerWidth * 0.05;
    coinThicknessRef.current = coinRadiusRef.current * 0.1;

    // Scene setup
    const scene = new THREE.Scene();
    scene.background = null; // Make scene background transparent

    // Physics world - EXACTLY like header but with optimizations
    const world = new CANNON.World();
    world.gravity.set(0, -9.8 * 40, 0); // strong gravity for faster falls
    world.broadphase = new CANNON.NaiveBroadphase();
    world.solver.iterations = 10; // Lower for better performance with many objects
    world.allowSleep = true; // Very important for performance

    // Setup materials
    const floorMaterial = new CANNON.Material(FLOOR_MATERIAL);
    const wallMaterial = new CANNON.Material(WALL_MATERIAL);
    const coinMaterial = new CANNON.Material(COIN_BODY_MATERIAL);

    // Define contact behaviors - EXACTLY like header
    world.addContactMaterial(
      new CANNON.ContactMaterial(floorMaterial, coinMaterial, {
        friction: 0.6,
        restitution: 0.5,
      })
    );

    world.addContactMaterial(
      new CANNON.ContactMaterial(wallMaterial, coinMaterial, {
        friction: 0.6,
        restitution: 0.9,
      })
    );

    world.addContactMaterial(
      new CANNON.ContactMaterial(coinMaterial, coinMaterial, {
        friction: 0.6,
        restitution: 0.4, // Slightly less bouncy for better stacking
      })
    );

    // Camera setup - ORTHOGRAPHIC and OVERHEAD with window-sized frustum
    const aspectRatio = containerWidth / containerHeight;
    const frustumSize = containerHeight; // Match container height exactly
    const camera = new THREE.OrthographicCamera(
      -frustumSize * aspectRatio / 2,
      frustumSize * aspectRatio / 2,
      frustumSize / 2,
      -frustumSize / 2,
      0.001,
      100000
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
    const ambientLight = new THREE.AmbientLight(0x404040, 1.5);
    scene.add(ambientLight);

    const directionalLight = new THREE.DirectionalLight(0xffffff, 2.0);
    directionalLight.position.set(0, boxHeightRef.current * 0.8, 0);
    directionalLight.castShadow = true;
    directionalLight.shadow.camera.near = 0.5;
    directionalLight.shadow.camera.far = boxHeightRef.current * 2;
    directionalLight.shadow.camera.left = -boxWidthRef.current / 2;
    directionalLight.shadow.camera.right = boxWidthRef.current / 2;
    directionalLight.shadow.camera.top = boxDepthRef.current / 2;
    directionalLight.shadow.camera.bottom = -boxDepthRef.current / 2;
    scene.add(directionalLight);

    // Floor - invisible but matching window size exactly
    const floorGeometry = new THREE.BoxGeometry(boxWidthRef.current, 1, boxDepthRef.current);
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
      shape: new CANNON.Box(new CANNON.Vec3(boxWidthRef.current / 2, 0.5, boxDepthRef.current / 2)),
      material: floorMaterial,
    });
    floorBody.position.set(0, -0.5, 0);
    world.addBody(floorBody);

    // Walls - invisible, match window edges exactly
    const wallMeshMaterial = new THREE.MeshStandardMaterial({
      color: 0x00ff00, // Bright green
      roughness: 1.0,
      transparent: true,
      opacity: 1.0, // Less visible for debugging
    });

    // Back wall (top of screen)
    const backWallGeometry = new THREE.BoxGeometry(boxWidthRef.current, boxHeightRef.current, 1);
    const backWall = new THREE.Mesh(backWallGeometry, wallMeshMaterial);
    backWall.position.set(0, boxHeightRef.current / 2, -boxDepthRef.current / 2);
    scene.add(backWall);

    // Back wall physics body
    const backWallBody = new CANNON.Body({
      mass: 0,
      shape: new CANNON.Box(new CANNON.Vec3(boxWidthRef.current / 2, boxHeightRef.current / 2, 0.5)),
      material: wallMaterial,
    });
    backWallBody.position.set(0, boxHeightRef.current / 2, -boxDepthRef.current / 2);
    world.addBody(backWallBody);

    // Front wall (bottom of screen)
    const frontWall = new THREE.Mesh(backWallGeometry, wallMeshMaterial);
    frontWall.position.set(0, boxHeightRef.current / 2, boxDepthRef.current / 2);
    scene.add(frontWall);

    // Front wall physics body
    const frontWallBody = new CANNON.Body({
      mass: 0,
      shape: new CANNON.Box(new CANNON.Vec3(boxWidthRef.current / 2, boxHeightRef.current / 2, 0.5)),
      material: wallMaterial,
    });
    frontWallBody.position.set(0, boxHeightRef.current / 2, boxDepthRef.current / 2);
    world.addBody(frontWallBody);

    // Left wall
    const sideWallGeometry = new THREE.BoxGeometry(1, boxHeightRef.current, boxDepthRef.current);
    const leftWall = new THREE.Mesh(sideWallGeometry, wallMeshMaterial);
    leftWall.position.set(-boxWidthRef.current / 2, boxHeightRef.current / 2, 0);
    scene.add(leftWall);

    // Left wall physics body
    const leftWallBody = new CANNON.Body({
      mass: 0,
      shape: new CANNON.Box(new CANNON.Vec3(0.5, boxHeightRef.current / 2, boxDepthRef.current / 2)),
      material: wallMaterial,
    });
    leftWallBody.position.set(-boxWidthRef.current / 2, boxHeightRef.current / 2, 0);
    world.addBody(leftWallBody);

    // Right wall
    const rightWall = new THREE.Mesh(sideWallGeometry, wallMeshMaterial);
    rightWall.position.set(boxWidthRef.current / 2, boxHeightRef.current / 2, 0);
    scene.add(rightWall);

    // Right wall physics body
    const rightWallBody = new CANNON.Body({
      mass: 0,
      shape: new CANNON.Box(new CANNON.Vec3(0.5, boxHeightRef.current / 2, boxDepthRef.current / 2)),
      material: wallMaterial,
    });
    rightWallBody.position.set(boxWidthRef.current / 2, boxHeightRef.current / 2, 0);
    world.addBody(rightWallBody);

    // Load textures for coins
    const textureLoader = new THREE.TextureLoader();
    const coinTexture = textureLoader.load("logo.png", () => {
      setIsLoading(false);
      console.log("Texture loaded, starting coin creation");
      // Start coin creation once texture is loaded
      startCoinCreation();
    });

    // Create coin geometry using the radius from ref
    const coinGeometry = new THREE.CylinderGeometry(
      coinRadiusRef.current,    // radiusTop
      coinRadiusRef.current,    // radiusBottom
      coinThicknessRef.current, // height
      24,            // radiusSegments - reduced for performance
      1,             // heightSegments
      false          // openEnded
    );

    // Create materials for the coin - gold color with the logo
    const coinMeshMaterial = new THREE.MeshStandardMaterial({
      map: coinTexture,
      metalness: 0.5,
      roughness: 0.8,
      color: 0xFFFFFF, // Gold color
      emissiveMap: coinTexture,
      emissive: 0xFFFFFF, // Add emissive to make them more visible
      emissiveIntensity: 0.6
    });

    // Create instanced mesh for efficient rendering
    const coinInstancedMesh = new THREE.InstancedMesh(
      coinGeometry,
      coinMeshMaterial,
      MAX_COINS
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
      console.log(`Creating coin #${index} at position [${(x/boxWidthRef.current*100).toFixed(1)}%, ${(y/boxHeightRef.current*100).toFixed(1)}%, ${(z/boxDepthRef.current*100).toFixed(1)}%]`);

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
        coinRadiusRef.current,    // radiusTop
        coinRadiusRef.current,    // radiusBottom
        coinThicknessRef.current, // height
        12            // numSegments - reduced for physics performance
      );
      
      const coinBody = new CANNON.Body({
        mass: 10000, // Weight needs to be enough for good physics
        shape: coinShape,
        material: coinMaterial,
        allowSleep: true, // Critical for performance
        sleepSpeedLimit: 0.1, // Sleep more easily for performance
        sleepTimeLimit: 0.1,  // Sleep more quickly for performance
        linearDamping: 0.4,   // Help coins settle faster
        angularDamping: 0.4   // Help coins settle faster
      });

      // Set position and rotation
      coinBody.position.set(x, y, z);
      coinBody.quaternion.setFromEuler(rotX, 0, rotZ);
      
      // Add initial velocity for more natural falling
      coinBody.velocity.set(
        (Math.random() - 0.5) * 5, // Some horizontal movement
        -5 - Math.random() * 10,   // Downward velocity
        (Math.random() - 0.5) * 5  // Some depth movement
      );
      
      // Add initial angular velocity for natural spinning
      coinBody.angularVelocity.set(
        (Math.random() - 0.5) * 10,
        (Math.random() - 0.5) * 10,
        (Math.random() - 0.5) * 10
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

    // Collision handler for more realistic physics
    function handleCollisions(event: CANNON.ContactEvent) {
      try {
        // In this event, we need to get the body that collided
        const bodyA = event.bodyA;
        const bodyB = event.bodyB;
        
        // Find which body is a coin (has mass > 0)
        const coinBody = bodyA.mass > 0 ? bodyA : (bodyB.mass > 0 ? bodyB : null);

        if (!coinBody) return;

        // Only add effects for significant collisions to reduce computation
        const impactVelocity = event.contact.getImpactVelocityAlongNormal();
        if (impactVelocity > 2) {
          // Add minor random spin
          const intensity = Math.min(impactVelocity / 10, 1); // Scale with impact, but limit
          coinBody.angularVelocity.x += (Math.random() - 0.5) * 5 * intensity;
          coinBody.angularVelocity.y += (Math.random() - 0.5) * 5 * intensity;
          coinBody.angularVelocity.z += (Math.random() - 0.5) * 5 * intensity;
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
      if (event.code === 'Space') {
        event.preventDefault();
        togglePause();
      } else if (event.code === 'KeyD') {
        event.preventDefault();
        console.log("Manual drop triggered with D key");
        if (window.debugDropCoins) {
          window.debugDropCoins();
        }
      }
    }

    // Add event listener for keyboard
    window.addEventListener('keydown', handleKeyPress);

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
    let lastReportTime = 0;
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
          new THREE.Vector3(coinBody.position.x, coinBody.position.y, coinBody.position.z),
          new THREE.Quaternion(
            coinBody.quaternion.x,
            coinBody.quaternion.y, 
            coinBody.quaternion.z,
            coinBody.quaternion.w
          ),
          new THREE.Vector3(1, 1, 1)
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
        camera.left = -newFrustumSize * newAspect / 2;
        camera.right = newFrustumSize * newAspect / 2;
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
    window.addEventListener('resize', onWindowResize);

    // Cleanup on unmount
    return () => {
      // Clear any ongoing coin creation
      if (coinCreationIntervalRef.current !== null) {
        clearInterval(coinCreationIntervalRef.current);
      }
      
      window.removeEventListener('keydown', handleKeyPress);
      window.removeEventListener('resize', onWindowResize);
      world.removeEventListener('collide', handleCollisions);
      
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
