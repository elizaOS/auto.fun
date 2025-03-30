import * as CANNON from "cannon-es";
import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { IToken } from "@/types";

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

// Declare the resetDice function on the window object
declare global {
  interface Window {
    resetDice?: () => void;
  }
}

// Constants for physics
const DICE_BODY_MATERIAL = "dice";
const FLOOR_MATERIAL = "floor";
const WALL_MATERIAL = "wall";

const EyeFollower = () => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });
  const [containerSize, setContainerSize] = useState({ width: 0, height: 0 });

  // Eye parameters
  const pupilRadius = 1.5; // Size of the pupil
  const maxPupilOffset = 5; // Maximum distance pupil can move from center

  // Eye anchor positions (as percentages of container)
  const eyeAnchors = [
    { x: 0.115, y: 0.22 }, // Left eye
    { x: 0.215, y: 0.22 }, // Right eye
  ];

  useEffect(() => {
    if (!containerRef.current) return;

    const updateContainerSize = () => {
      if (!containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      setContainerSize({
        width: rect.width,
        height: rect.height,
      });
    };

    // Initial size calculation
    updateContainerSize();

    const handleMouseMove = (e: MouseEvent) => {
      if (!containerRef.current) return;

      // Get container bounds
      const rect = containerRef.current.getBoundingClientRect();

      // Calculate mouse position relative to container
      setMousePos({
        x: e.clientX - rect.left,
        y: e.clientY - rect.top,
      });
    };

    // Add event listeners
    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("resize", updateContainerSize);

    // Clean up on unmount
    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("resize", updateContainerSize);
    };
  }, []);

  // Calculate pupil positions based on mouse position
  const calculatePupilPosition = (anchorX: number, anchorY: number) => {
    if (!containerRef.current) return { x: 0, y: 0 };

    // Calculate eye center in pixels
    const eyeCenterX = containerSize.width * anchorX;
    const eyeCenterY = containerSize.height * anchorY;

    // Calculate direction vector from eye to mouse
    const dirX = mousePos.x - eyeCenterX;
    const dirY = mousePos.y - eyeCenterY;

    // Calculate distance
    const distance = Math.sqrt(dirX * dirX + dirY * dirY);

    // Normalize and apply max offset
    const offsetX =
      distance > 0 ? (dirX / distance) * Math.min(distance, maxPupilOffset) : 0;
    const offsetY =
      distance > 0 ? (dirY / distance) * Math.min(distance, maxPupilOffset) : 0;

    return {
      x: eyeCenterX + offsetX,
      y: eyeCenterY + offsetY,
    };
  };

  // Calculate scale factor based on container width
  const getScaledPupilRadius = () => {
    if (containerSize.width === 0) return pupilRadius;
    const scaleFactor = containerSize.width / 300; // Base size is 300
    return Math.max(3, pupilRadius * scaleFactor); // Minimum size of 3
  };

  return (
    <div
      ref={containerRef}
      className="w-full h-full relative z-1000"
      style={{ aspectRatio: "3/1" }}
    >
      <svg
        width="100%"
        height="100%"
        viewBox="0 0 300 100"
        preserveAspectRatio="xMidYMid meet"
      >
        {/* Only pupils - positioned dynamically */}
        {eyeAnchors.map((anchor, idx) => {
          const pupilPos = calculatePupilPosition(anchor.x, anchor.y);
          return (
            <circle
              key={`pupil-${idx}`}
              cx={pupilPos.x}
              cy={pupilPos.y}
              r={getScaledPupilRadius()}
              fill="black"
            />
          );
        })}
      </svg>
    </div>
  );
};

interface DiceRollerProps {
  tokens?: IToken[];
}

const DiceRoller = ({ tokens = [] }: DiceRollerProps) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [isLoading, setIsLoading] = useState(true);
  const dicePositionsRef = useRef<THREE.Vector3[]>([]);
  // const [dicePositions, setDicePositions] = useState<THREE.Vector3[]>([]);
  // const [diceInitialized, setDiceInitialized] = useState(false);

  // Store selected tokens and their addresses for navigation
  const [selectedTokens, setSelectedTokens] = useState<
    { address: string; image: string }[]
  >([]);

  // Track scene objects in refs so they can be accessed in event handlers
  const sceneRef = useRef<THREE.Scene | null>(null);
  const diceRef = useRef<THREE.Mesh[]>([]);
  const diceBodiesRef = useRef<CANNON.Body[]>([]);
  const cameraRef = useRef<THREE.OrthographicCamera | null>(null);
  const worldRef = useRef<CANNON.World | null>(null);
  // Add a ref to track if the scene has been initialized
  const sceneInitializedRef = useRef(false);
  // Add a ref to track if tokens have been processed initially
  const tokensProcessedRef = useRef(false);

  useEffect(() => {
    // Skip token processing if we've already done initial setup and the scene is initialized
    if (tokensProcessedRef.current && sceneInitializedRef.current) return;

    if (!tokens.length) return;

    // Randomly select up to 5 tokens
    const shuffled = [...tokens].sort(() => 0.5 - Math.random());
    const selected = shuffled
      .slice(0, Math.min(5, tokens.length))
      .map((token) => ({
        address: token.mint || "",
        image: token.image || "header/placeholder/logo.jpg", // Fallback if no image
      }));

    setSelectedTokens(selected);

    // Initialize random dice positions
    const positions: THREE.Vector3[] = [];
    for (let i = 0; i < Math.min(5, tokens.length); i++) {
      positions.push(
        new THREE.Vector3(
          Math.random() * 50 - 25,
          20 + i * 2,
          Math.random() * 16 - 8,
        ),
      );
    }
    dicePositionsRef.current = positions;

    // Mark tokens as processed
    tokensProcessedRef.current = true;
  }, [tokens]);

  // Function to throw dice with physics
  const throwDice = () => {
    if (!diceBodiesRef.current.length) return;

    console.log("Throwing dice", diceBodiesRef.current.length);

    for (let i = 0; i < diceBodiesRef.current.length; i++) {
      const dieBody = diceBodiesRef.current[i];

      // Reset position higher for more energy
      dieBody.position.set(
        Math.random() * 50 - 25,
        20 + i * 2,
        Math.random() * 16 - 8,
      );

      // Reset rotation
      dieBody.quaternion.setFromEuler(
        Math.random() * Math.PI,
        Math.random() * Math.PI,
        Math.random() * Math.PI,
      );

      // Clear any existing motion
      dieBody.velocity.set(0, 0, 0);
      dieBody.angularVelocity.set(0, 0, 0);

      // Wake up the body
      dieBody.wakeUp();

      // Apply random velocity
      const velocity = new CANNON.Vec3(
        (Math.random() - 0.5) * 15,
        -10 - Math.random() * 15,
        (Math.random() - 0.5) * 15,
      );
      dieBody.velocity.copy(velocity);

      // Apply spin
      const angularVelocity = new CANNON.Vec3(
        (Math.random() - 0.5) * 20,
        (Math.random() - 0.5) * 20,
        (Math.random() - 0.5) * 20,
      );
      dieBody.angularVelocity.copy(angularVelocity);
    }

    console.log("Dice thrown with increased energy!");
  };

  // Handle clicking anywhere on the container
  const handleContainerClick = (event: React.MouseEvent) => {
    console.log("Container clicked");
    if (isLoading) return;

    // Get container bounds for raycaster
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect || !cameraRef.current || !sceneRef.current) return;

    // Calculate normalized mouse position
    const mouse = new THREE.Vector2(
      ((event.clientX - rect.left) / rect.width) * 2 - 1,
      -((event.clientY - rect.top) / rect.height) * 2 + 1,
    );

    // Setup raycaster
    const raycaster = new THREE.Raycaster();
    raycaster.setFromCamera(mouse, cameraRef.current);

    // Check for intersections with dice
    const intersects = raycaster.intersectObjects(diceRef.current);

    if (intersects.length > 0) {
      // Get the clicked die
      const clickedDie = intersects[0].object as THREE.Mesh;

      // Get the token address from the die's userData
      const tokenAddress = clickedDie.userData?.tokenAddress;

      if (tokenAddress) {
        // Navigate to token page using vanilla JS approach
        console.log("Navigating to token:", tokenAddress);
        // window.location.href = `/token/${tokenAddress}`;
        applyForceToAllDice(event.nativeEvent);
      }
    } else {
      // If no die was clicked, apply force to all dice
      console.log("No die clicked, applying force to all");
      applyForceToAllDice(event.nativeEvent);
    }
  };

  // Apply force to all dice when clicking background
  const applyForceToAllDice = (event: MouseEvent) => {
    console.log("Applying force to dice", event.clientX, event.clientY);

    if (!diceBodiesRef.current.length) {
      console.log("No dice bodies available");
      return;
    }

    // Force for all dice
    for (const dieBody of diceBodiesRef.current) {
      // Wake up the body
      dieBody.wakeUp();

      // Apply random force
      const forceVector = new CANNON.Vec3(
        (Math.random() - 0.5) * 200,
        Math.random() * 50,
        (Math.random() - 0.5) * 200,
      );

      // Apply direct velocity for immediate effect
      dieBody.velocity.set(forceVector.x, forceVector.y, forceVector.z);

      // Add random spin
      dieBody.angularVelocity.set(
        (Math.random() - 0.5) * 10,
        (Math.random() - 0.5) * 10,
        (Math.random() - 0.5) * 10,
      );
    }
  };

  useEffect(() => {
    // Skip if already initialized or if we don't have the required elements
    if (
      sceneInitializedRef.current ||
      !containerRef.current ||
      !selectedTokens.length ||
      !dicePositionsRef.current.length
    )
      return;

    // Mark as initialized to prevent re-initialization
    sceneInitializedRef.current = true;

    console.log("Initializing dice physics scene");

    // Get container dimensions
    const containerWidth = containerRef.current.clientWidth;
    const containerHeight = 300; // Fixed height

    // Scene setup
    const scene = new THREE.Scene();
    sceneRef.current = scene;
    scene.background = null; // Make scene background transparent

    // Physics world
    const world = new CANNON.World();
    worldRef.current = world;
    world.gravity.set(0, -9.8 * 20, 0); // stronger gravity for faster falls
    world.broadphase = new CANNON.NaiveBroadphase();
    world.solver.iterations = 14;
    world.allowSleep = true;

    // Setup materials
    const floorMaterial = new CANNON.Material(FLOOR_MATERIAL);
    const wallMaterial = new CANNON.Material(WALL_MATERIAL);
    const diceMaterial = new CANNON.Material(DICE_BODY_MATERIAL);

    // Define contact behaviors
    world.addContactMaterial(
      new CANNON.ContactMaterial(floorMaterial, diceMaterial, {
        friction: 0.6,
        restitution: 0.5,
      }),
    );

    world.addContactMaterial(
      new CANNON.ContactMaterial(wallMaterial, diceMaterial, {
        friction: 0.6,
        restitution: 0.9,
      }),
    );

    world.addContactMaterial(
      new CANNON.ContactMaterial(diceMaterial, diceMaterial, {
        friction: 0.6,
        restitution: 0.5,
      }),
    );

    // Calculate dimensions based on aspect ratio
    const aspect = containerWidth / containerHeight;
    const frustumSize = 20; // This will be our base size
    const frustumHeight = frustumSize;
    const frustumWidth = frustumSize * aspect;

    // Camera setup - orthographic camera
    const camera = new THREE.OrthographicCamera(
      frustumWidth / -2,
      frustumWidth / 2,
      frustumHeight / 2,
      frustumHeight / -2,
      0.001,
      1000,
    );
    cameraRef.current = camera;
    camera.position.set(0, 50, 0);
    camera.lookAt(0, 0, 0);

    // Renderer setup
    const renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: true, // Enable transparency
    });
    renderer.setSize(containerWidth, containerHeight);
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.shadowMap.enabled = true;
    renderer.setClearColor(0x000000, 0); // Make background transparent

    // Add renderer to DOM
    containerRef.current.innerHTML = "";
    containerRef.current.appendChild(renderer.domElement);

    // Lighting
    const ambientLight = new THREE.AmbientLight(0x000000);
    scene.add(ambientLight);

    const directionalLight = new THREE.DirectionalLight(0xffffff, 3.0);

    directionalLight.rotation.x = -Math.PI / 4; // 45 degrees pitched down
    directionalLight.rotation.z = -Math.PI / 8; // 45 degrees pitched right
    directionalLight.position.set(0, 5, 0);
    directionalLight.castShadow = true;
    directionalLight.shadow.camera.near = 0.5;
    directionalLight.shadow.camera.far = 50;
    directionalLight.shadow.camera.left = -20;
    directionalLight.shadow.camera.right = 20;
    directionalLight.shadow.camera.top = 50;
    directionalLight.shadow.camera.bottom = -20;
    directionalLight.updateMatrix();
    scene.add(directionalLight);

    // Floor (dice box)
    const floorGeometry = new THREE.BoxGeometry(frustumWidth, 1, frustumHeight);
    const floorMeshMaterial = new THREE.MeshStandardMaterial({
      color: 0x000000,
      roughness: 0.0,
      transparent: true,
      opacity: 0.0, // Make floor semi-transparent
    });
    const floor = new THREE.Mesh(floorGeometry, floorMeshMaterial);
    floor.position.y = -0.5;
    floor.receiveShadow = true;
    scene.add(floor);

    // Floor physics body
    const floorBody = new CANNON.Body({
      mass: 0, // static body
      shape: new CANNON.Box(
        new CANNON.Vec3(frustumWidth / 2, 0.5, frustumHeight / 2),
      ),
      material: floorMaterial,
    });
    floorBody.position.set(0, -0.5, 0);
    world.addBody(floorBody);

    // Walls
    const wallMeshMaterial = new THREE.MeshStandardMaterial({
      color: 0x03ff24, // Bright green
      roughness: 0.7,
      // emissive: 0x000000,
      // fully transparent
      // transparent: true,
      // opacity: 0.0,
      // emissiveIntensity: 0.3,
    });

    // Back wall
    const backWallGeometry = new THREE.BoxGeometry(frustumWidth, 20, 1);
    const backWall = new THREE.Mesh(backWallGeometry, wallMeshMaterial);
    backWall.position.set(0, 2, -frustumHeight / 2);
    backWall.castShadow = true;
    backWall.receiveShadow = true;
    scene.add(backWall);

    // Back wall physics body
    const backWallBody = new CANNON.Body({
      mass: 0,
      shape: new CANNON.Box(new CANNON.Vec3(frustumWidth / 2, 20, 0.5)),
      material: wallMaterial,
    });
    backWallBody.position.set(0, 2, -frustumHeight / 2);
    world.addBody(backWallBody);

    // Front wall
    const frontWall = new THREE.Mesh(backWallGeometry, wallMeshMaterial);
    frontWall.position.set(0, 2, frustumHeight / 2);
    frontWall.castShadow = true;
    frontWall.receiveShadow = true;
    scene.add(frontWall);

    // Front wall physics body
    const frontWallBody = new CANNON.Body({
      mass: 0,
      shape: new CANNON.Box(new CANNON.Vec3(frustumWidth / 2, 50, 0.5)),
      material: wallMaterial,
    });
    frontWallBody.position.set(0, 2, frustumHeight / 2);
    world.addBody(frontWallBody);

    // Left wall
    const sideWallGeometry = new THREE.BoxGeometry(1, 20, frustumHeight);
    const leftWall = new THREE.Mesh(sideWallGeometry, wallMeshMaterial);
    leftWall.position.set(-frustumWidth / 2, 2, 0);
    leftWall.castShadow = true;
    leftWall.receiveShadow = true;
    scene.add(leftWall);

    // Left wall physics body
    const leftWallBody = new CANNON.Body({
      mass: 0,
      shape: new CANNON.Box(new CANNON.Vec3(0.5, 20, frustumHeight / 2)),
      material: wallMaterial,
    });
    leftWallBody.position.set(-frustumWidth / 2, 2, 0);
    world.addBody(leftWallBody);

    // Right wall
    const rightWall = new THREE.Mesh(sideWallGeometry, wallMeshMaterial);
    rightWall.position.set(frustumWidth / 2, 2, 0);
    rightWall.castShadow = true;
    rightWall.receiveShadow = true;
    scene.add(rightWall);

    // Right wall physics body
    const rightWallBody = new CANNON.Body({
      mass: 0,
      shape: new CANNON.Box(new CANNON.Vec3(0.5, 50, frustumHeight / 2)),
      material: wallMaterial,
    });
    rightWallBody.position.set(frustumWidth / 2, 2, 0);
    world.addBody(rightWallBody);

    // Load textures for dice
    const textureLoader = new THREE.TextureLoader();

    // Use default placeholder if we don't have enough tokens
    const fallbackTexture = "header/placeholder/logo.jpg";

    // Helper function to create materials for a die with the same texture on all sides
    const createDieMaterialsWithSameTexture = (tokenImage: string) => {
      return new Promise<THREE.MeshStandardMaterial[]>((resolve) => {
        const texture = textureLoader.load(
          tokenImage,
          (texture) => {
            texture.colorSpace = THREE.SRGBColorSpace;
            setIsLoading(false);
          },
          undefined,
          (error) => {
            console.error("Error loading texture:", error);
            // Load fallback texture if the token image fails
            const fallback = textureLoader.load(
              fallbackTexture,
              (fallbackTex) => {
                fallbackTex.colorSpace = THREE.SRGBColorSpace;
                setIsLoading(false);
              },
            );
            resolve(
              Array(6).fill(
                new THREE.MeshStandardMaterial({
                  map: fallback,
                  roughness: 1.0,
                  metalness: 0.3,
                  emissiveMap: fallback,
                  emissiveIntensity: 0.3,
                }),
              ),
            );
          },
        );

        // Create 6 sides with the same material
        const materials = Array(6)
          .fill(null)
          .map(
            () =>
              new THREE.MeshStandardMaterial({
                map: texture,
                roughness: 0.75,
                metalness: 0.2,
                emissiveMap: texture,
                emissiveIntensity: 0.3,
              }),
          );

        resolve(materials);
      });
    };

    const scale = 2.25;

    // Create dice
    const diceGeometry = new THREE.BoxGeometry(scale, scale, scale);
    const dice: THREE.Mesh[] = [];
    const diceBodies: CANNON.Body[] = [];

    // Helper function to create a die
    async function createDie(
      position: THREE.Vector3,
      scale: number = 1,
      tokenIndex: number,
    ) {
      const tokenData = selectedTokens[tokenIndex] || {
        address: "",
        image: fallbackTexture,
      };
      const dieMaterials = await createDieMaterialsWithSameTexture(
        tokenData.image,
      );
      const die = new THREE.Mesh(diceGeometry, dieMaterials);

      die.position.copy(position);
      die.scale.set(scale, scale, scale);
      die.castShadow = true;
      die.receiveShadow = true;

      // Store token address as a custom property
      die.userData = { tokenAddress: tokenData.address };

      // Create physics body
      const halfExtents = new CANNON.Vec3(
        scale + 0.5,
        scale + 0.25,
        scale + 0.25,
      );
      const dieBody = new CANNON.Body({
        mass: 10000, // heavier for better physics
        shape: new CANNON.Box(halfExtents),
        material: diceMaterial,
        allowSleep: true,
      });

      // Set initial position and rotation
      dieBody.position.set(position.x, position.y, position.z);
      dieBody.quaternion.setFromEuler(
        Math.random() * Math.PI,
        Math.random() * Math.PI,
        Math.random() * Math.PI,
      );

      // Store the mesh and token data with the body for updates
      dieBody.userData = {
        mesh: die,
        tokenAddress: tokenData.address,
      };

      // Add to scene and world
      scene.add(die);
      world.addBody(dieBody);

      dice.push(die);
      diceBodies.push(dieBody);

      return { die, dieBody };
    }

    // Create dice with token images
    const createAllDice = async () => {
      // Clear any existing dice
      diceRef.current = [];
      diceBodiesRef.current = [];

      const numDice = Math.min(5, selectedTokens.length);

      for (let i = 0; i < numDice; i++) {
        const position =
          dicePositionsRef.current[i] ||
          new THREE.Vector3(
            Math.random() * 50 - 25,
            20 + i * 2,
            Math.random() * 16 - 8,
          );
        const { die, dieBody } = await createDie(position, scale, i);
        diceRef.current.push(die);
        diceBodiesRef.current.push(dieBody);
      }

      // If we have fewer than 5 tokens, fill remaining slots with empty dice
      if (numDice < 5) {
        for (let i = numDice; i < 5; i++) {
          const position = new THREE.Vector3(
            Math.random() * 50 - 25,
            20 + i * 2,
            Math.random() * 16 - 8,
          );
          const { die, dieBody } = await createDie(
            position,
            scale,
            i % numDice,
          );
          diceRef.current.push(die);
          diceBodiesRef.current.push(dieBody);
        }
      }

      // setDiceInitialized(true);
    };

    // Create all dice
    createAllDice();

    // Replace the collision handler with a simpler version
    function handleCollisions(event: any) {
      // Simple collision detection using Cannon.js's 'collide' event
      try {
        // In this event, event.body is the body that has a collision
        const impactedBody = event.body;

        if (!impactedBody || impactedBody.mass <= 0) return;

        // Add random spin whenever a die collides with anything
        const randomX = (Math.random() - 0.5) * 10;
        const randomY = (Math.random() - 0.5) * 10;
        const randomZ = (Math.random() - 0.5) * 10;

        impactedBody.angularVelocity.x += randomX;
        impactedBody.angularVelocity.y += randomY;
        impactedBody.angularVelocity.z += randomZ;

        // Add a small upward bounce for better movement
        if (impactedBody.velocity.y < 0.5) {
          impactedBody.velocity.y += Math.random() * 2;
        }
      } catch (error) {
        console.error("Error in collision handler:", error);
      }
    }

    // Add collision event listener to world (use collide event instead of beginContact)
    world.addEventListener("collide", handleCollisions);

    // Animation function
    function animate() {
      requestAnimationFrame(animate);

      // Step the physics world
      world.step(1 / 60);

      // Update dice positions and rotations
      for (let i = 0; i < diceBodies.length; i++) {
        const dieBody = diceBodies[i];
        const die = dice[i];

        die.position.copy(dieBody.position as any);
        die.quaternion.copy(dieBody.quaternion as any);
      }

      renderer.render(scene, camera);
    }

    // Start animation
    animate();

    // Expose reset function to window so the button can access it
    window.resetDice = throwDice;

    // Track resize timeout for debouncing
    let resizeTimeout: number | null = null;

    // Updated window resize handler
    const onWindowResize = () => {
      if (!containerRef.current) return;

      // Clear previous timeout if it exists
      if (resizeTimeout) {
        window.clearTimeout(resizeTimeout);
      }

      // Debounce resize updates
      resizeTimeout = window.setTimeout(() => {
        const newContainerWidth =
          containerRef.current?.clientWidth || containerWidth;
        const newAspect = newContainerWidth / containerHeight;
        const newFrustumHeight = frustumSize;
        const newFrustumWidth = frustumSize * newAspect;

        // Update camera
        camera.left = newFrustumWidth / -2;
        camera.right = newFrustumWidth / 2;
        camera.top = newFrustumHeight / 2;
        camera.bottom = newFrustumHeight / -2;
        camera.updateProjectionMatrix();

        // Update renderer size
        renderer.setSize(newContainerWidth, containerHeight);

        // Update mesh positions and scales
        floor.position.set(0, -0.5, 0);
        floor.scale.set(
          newFrustumWidth / frustumWidth,
          1,
          newFrustumHeight / frustumHeight,
        );

        backWall.position.set(0, 2, -newFrustumHeight / 2);
        backWall.scale.set(newFrustumWidth / frustumWidth, 1, 1);

        frontWall.position.set(0, 2, newFrustumHeight / 2);
        frontWall.scale.set(newFrustumWidth / frustumWidth, 1, 1);

        leftWall.position.set(-newFrustumWidth / 2, 2, 0);
        leftWall.scale.set(1, 1, newFrustumHeight / frustumHeight);

        rightWall.position.set(newFrustumWidth / 2, 2, 0);
        rightWall.scale.set(1, 1, newFrustumHeight / frustumHeight);

        // Update physics bodies without recreating them
        // Remove old wall bodies first
        world.removeBody(floorBody);
        world.removeBody(leftWallBody);
        world.removeBody(rightWallBody);
        world.removeBody(frontWallBody);
        world.removeBody(backWallBody);

        // Floor physics body
        floorBody.position.set(0, -0.5, 0);
        floorBody.shapes[0] = new CANNON.Box(
          new CANNON.Vec3(newFrustumWidth / 2, 0.5, newFrustumHeight / 2),
        );
        world.addBody(floorBody);

        // Back wall physics body
        backWallBody.position.set(0, 2, -newFrustumHeight / 2);
        backWallBody.shapes[0] = new CANNON.Box(
          new CANNON.Vec3(newFrustumWidth / 2, 20, 0.5),
        );
        world.addBody(backWallBody);

        // Front wall physics body
        frontWallBody.position.set(0, 2, newFrustumHeight / 2);
        frontWallBody.shapes[0] = new CANNON.Box(
          new CANNON.Vec3(newFrustumWidth / 2, 50, 0.5),
        );
        world.addBody(frontWallBody);

        // Left wall physics body
        leftWallBody.position.set(-newFrustumWidth / 2, 2, 0);
        leftWallBody.shapes[0] = new CANNON.Box(
          new CANNON.Vec3(0.5, 20, newFrustumHeight / 2),
        );
        world.addBody(leftWallBody);

        // Right wall physics body
        rightWallBody.position.set(newFrustumWidth / 2, 2, 0);
        rightWallBody.shapes[0] = new CANNON.Box(
          new CANNON.Vec3(0.5, 50, newFrustumHeight / 2),
        );
        world.addBody(rightWallBody);

        // Do NOT reposition and reroll dice when resizing
        // Removed: throwDice();
      }, 100); // Debounce for 100ms
    };

    window.addEventListener("resize", onWindowResize);

    // Initial throw
    throwDice();

    // Cleanup on unmount
    return () => {
      // Reset initialization flags on unmount
      sceneInitializedRef.current = false;
      tokensProcessedRef.current = false;

      // Clear any pending resize timeout
      if (resizeTimeout) {
        window.clearTimeout(resizeTimeout);
      }

      window.removeEventListener("resize", onWindowResize);

      // Remove the reset function from window
      delete window.resetDice;

      // Dispose of resources
      renderer.dispose();
    };
  }, [selectedTokens]);

  return (
    <div
      className="w-full h-[300px] relative overflow-hidden cursor-pointer my-6 xl:mt-0"
      onClick={handleContainerClick}
    >
      {/* SVG background placed below the canvas */}
      <div className="absolute inset-0 flex justify-center items-center z-0">
        {/* Face with eyes overlay - ensure proportions maintained */}
        <div className="relative h-full flex-shrink-0">
          <img
            src="noeyes.svg"
            className="h-full w-auto object-contain"
            style={{ aspectRatio: "3/1" }}
            alt="Face background"
          />
          {/* Positioned eyes over the face */}
          <div className="absolute inset-0 pointer-events-none">
            <EyeFollower />
          </div>
        </div>

        <img
          src="press.svg"
          className="w-auto ml-4 flex-shrink-0 object-contain hidden 2xl:block 2xl:h-full"
          style={{ aspectRatio: "2/1" }}
          alt="Press instruction"
        />
      </div>

      <div
        ref={containerRef}
        className="w-full h-full absolute top-0 left-0 z-0"
      />

      {isLoading && (
        <div className="absolute top-0 left-0 w-full h-full flex items-center justify-center bg-autofun-background-card bg-opacity-75 text-white text-xl z-20">
          Loading...
        </div>
      )}
    </div>
  );
};

const FrontpageHeader = ({ tokens = [] }: { tokens?: IToken[] }) => {
  return <DiceRoller tokens={tokens} />;
};

export default FrontpageHeader;
