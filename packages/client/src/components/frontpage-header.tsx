import * as CANNON from "cannon-es";
import React, { useEffect, useRef, useState, useCallback } from "react";
import * as THREE from "three";
import { IToken } from "@/types";
// import { getToken } from "@/utils/api";
import { resizeImage } from "@/utils";

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

// Add global texture cache type
declare global {
  interface Window {
    __TEXTURE_CACHE__?: Map<string, THREE.Texture>;
  }
}

// Constants for physics
const DICE_BODY_MATERIAL = "dice";
const FLOOR_MATERIAL = "floor";
const WALL_MATERIAL = "wall";

// Memoize the EyeFollower component to prevent unnecessary re-renders
const EyeFollower = React.memo(function EyeFollower() {
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
  const calculatePupilPosition = useCallback(
    (anchorX: number, anchorY: number) => {
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
        distance > 0
          ? (dirX / distance) * Math.min(distance, maxPupilOffset)
          : 0;
      const offsetY =
        distance > 0
          ? (dirY / distance) * Math.min(distance, maxPupilOffset)
          : 0;

      return {
        x: eyeCenterX + offsetX,
        y: eyeCenterY + offsetY,
      };
    },
    [containerSize, mousePos, maxPupilOffset],
  );

  // Calculate scale factor based on container width
  const getScaledPupilRadius = useCallback(() => {
    if (containerSize.width === 0) return pupilRadius;
    const scaleFactor = containerSize.width / 300; // Base size is 300
    return Math.max(3, pupilRadius * scaleFactor); // Minimum size of 3
  }, [containerSize, pupilRadius]);

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
});

interface DiceRollerProps {
  tokens?: IToken[];
}

const DiceRoller = ({ tokens = [] }: DiceRollerProps) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const popupRef = useRef<HTMLDivElement>(null);
  // Track loaded dice instead of a global loading state
  const [loadedDice, setLoadedDice] = useState<Set<number>>(new Set());
  const dicePositionsRef = useRef<THREE.Vector3[]>([]);
  const [selectedCube, setSelectedCube] = useState<THREE.Mesh | null>(null);
  const [selectedTokenData, setSelectedTokenData] = useState<IToken | null>(
    null,
  );
  const [clickPosition, setClickPosition] = useState<{
    x: number;
    y: number;
  } | null>(null);
  // @ts-ignore
  const [popupPosition, setPopupPosition] = useState<{
    left: string;
    top: string;
  } | null>(null);

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
  // Create a ref to store the animation frame ID
  const animationFrameIdRef = useRef<number | undefined>();
  // Track if all dice are sleeping to reduce unnecessary updates
  const allDiceSleepingRef = useRef(false);
  // Store last animation time
  const lastTimeRef = useRef(0);

  // Animation function with performance optimizations
  const animate = useCallback((time = 0) => {
    if (!worldRef.current || !sceneRef.current || !cameraRef.current) return;

    const world = worldRef.current;
    const scene = sceneRef.current;
    const camera = cameraRef.current;
    const dice = diceRef.current;
    const diceBodies = diceBodiesRef.current;

    animationFrameIdRef.current = requestAnimationFrame(animate);

    // Calculate delta time in seconds
    const deltaTime = Math.min((time - lastTimeRef.current) / 1000, 0.1); // Cap at 100ms to avoid large jumps
    lastTimeRef.current = time;

    // Step the physics world with proper time step
    const fixedTimeStep = 1 / 60; // 60 fps
    const maxSubSteps = 2; // Reduced maximum physics substeps for better performance
    world.step(fixedTimeStep, deltaTime, maxSubSteps);

    // Check if all dice are sleeping to reduce physics calculations
    let allSleeping = diceBodies.length > 0;

    // Update dice positions and rotations - only for dice that are moving
    for (let i = 0; i < diceBodies.length; i++) {
      const dieBody = diceBodies[i];
      const die = dice[i];

      // Track if any dice are still moving
      if (dieBody.sleepState !== CANNON.Body.SLEEPING) {
        allSleeping = false;
        die.position.copy(dieBody.position as any);
        die.quaternion.copy(dieBody.quaternion as any);
      }
    }

    // If all dice were previously moving but are now sleeping, mark them as sleeping
    if (!allDiceSleepingRef.current && allSleeping) {
      allDiceSleepingRef.current = true;
    } else if (allDiceSleepingRef.current && !allSleeping) {
      // If dice were sleeping but now moving, mark them as not sleeping
      allDiceSleepingRef.current = false;
    }

    // Get the renderer from the scene
    const renderer = scene.userData.renderer as THREE.WebGLRenderer;
    if (renderer) {
      renderer.render(scene, camera);
    }
  }, []);

  useEffect(() => {
    // Skip token processing if we've already done initial setup and the scene is initialized
    if (tokensProcessedRef.current && sceneInitializedRef.current) return;

    if (!tokens.length) return;

    // Only select tokens once and never change them after initial selection
    if (!tokensProcessedRef.current) {
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
    }
  }, [tokens]);

  // Function to throw dice with physics - optimized for smoother initial movement
  const throwDice = useCallback(() => {
    if (!diceBodiesRef.current.length) return;

    // Stagger the dice throws to prevent all dice from moving at once
    // This helps reduce initial lag by spreading out the physics calculations
    const staggerDelay = 50; // milliseconds between each die throw

    diceBodiesRef.current.forEach((dieBody, i) => {
      // Use setTimeout to stagger the throws
      setTimeout(() => {
        if (!dieBody) return;

        // Reset position with less extreme values
        dieBody.position.set(
          (Math.random() - 0.5) * 30, // Less extreme horizontal spread
          15 + i * 1.5, // Lower height with less spacing
          (Math.random() - 0.5) * 12, // Less extreme depth
        );

        // Reset rotation with less extreme angles
        dieBody.quaternion.setFromEuler(
          Math.random() * Math.PI * 0.5,
          Math.random() * Math.PI * 0.5,
          Math.random() * Math.PI * 0.5,
        );

        // Clear any existing motion
        dieBody.velocity.set(0, 0, 0);
        dieBody.angularVelocity.set(0, 0, 0);

        // Wake up the body
        dieBody.wakeUp();

        // Apply gentler velocity
        const velocity = new CANNON.Vec3(
          (Math.random() - 0.5) * 8, // Reduced horizontal velocity
          -5 - Math.random() * 8, // Reduced downward velocity
          (Math.random() - 0.5) * 8, // Reduced depth velocity
        );
        dieBody.velocity.copy(velocity);

        // Apply gentler spin
        const angularVelocity = new CANNON.Vec3(
          (Math.random() - 0.5) * 8, // Reduced spin
          (Math.random() - 0.5) * 8, // Reduced spin
          (Math.random() - 0.5) * 8, // Reduced spin
        );
        dieBody.angularVelocity.copy(angularVelocity);

        // Apply higher damping initially to reduce jitter
        dieBody.linearDamping = 0.4;
        dieBody.angularDamping = 0.4;

        // Return to normal damping after settling
        setTimeout(() => {
          if (dieBody) {
            dieBody.linearDamping = 0.3;
            dieBody.angularDamping = 0.3;
          }
        }, 1000);
      }, i * staggerDelay);
    });
  }, []);

  // Handle clicking anywhere on the container
  const handleContainerClick = useCallback(
    (event: React.MouseEvent) => {
      // Only allow interaction if at least one die is loaded
      if (loadedDice.size === 0) return;

      // Store click position relative to the container
      const rect = containerRef.current?.getBoundingClientRect();
      if (rect) {
        setClickPosition({
          x: event.clientX - rect.left,
          y: event.clientY - rect.top,
        });
      }

      // Get container bounds for raycaster
      if (!rect || !cameraRef.current || !sceneRef.current) return;

      // Calculate normalized mouse position
      const mouse = new THREE.Vector2(
        ((event.clientX - rect.left) / rect.width) * 2 - 1,
        -((event.clientY - rect.top) / rect.height) * 2 + 1,
      );

      // Setup raycaster
      const raycaster = new THREE.Raycaster();
      raycaster.setFromCamera(mouse, cameraRef.current);

      // If clicking background and we have a selected cube, deselect it
      if (selectedCube) {
        // Remove glow effect
        if (Array.isArray(selectedCube.material)) {
          selectedCube.material.forEach((mat) => {
            if (mat instanceof THREE.MeshStandardMaterial) {
              mat.emissiveIntensity = 0.3;
            }
          });
        }
        setSelectedCube(null);
        setSelectedTokenData(null);
      } else {
        // Only apply force if no cube is selected
        applyForceToAllDice(event.nativeEvent);
      }
    },
    [loadedDice, selectedCube],
  );

  // Apply force to all dice when clicking background - optimized for smoother movement
  // @ts-ignore
  const applyForceToAllDice = useCallback((event: MouseEvent) => {
    if (!diceBodiesRef.current.length) {
      return;
    }

    // Force for all dice - more controlled and less chaotic
    for (const dieBody of diceBodiesRef.current) {
      // Wake up the body
      dieBody.wakeUp();

      // Apply more controlled force with less randomness
      const forceVector = new CANNON.Vec3(
        (Math.random() - 0.5) * 100, // Reduced horizontal force
        Math.random() * 30, // Reduced upward force
        (Math.random() - 0.5) * 100, // Reduced horizontal force
      );

      // Apply gentler velocity changes
      // Blend current velocity with new velocity for smoother transitions
      dieBody.velocity.x = dieBody.velocity.x * 0.2 + forceVector.x * 0.8;
      dieBody.velocity.y =
        Math.max(dieBody.velocity.y, 0) * 0.2 + forceVector.y * 0.8;
      dieBody.velocity.z = dieBody.velocity.z * 0.2 + forceVector.z * 0.8;

      // Add more controlled spin with less randomness
      const angularVelocity = new CANNON.Vec3(
        (Math.random() - 0.5) * 5, // Reduced spin
        (Math.random() - 0.5) * 5, // Reduced spin
        (Math.random() - 0.5) * 5, // Reduced spin
      );

      // Blend current angular velocity with new angular velocity
      dieBody.angularVelocity.x =
        dieBody.angularVelocity.x * 0.3 + angularVelocity.x * 0.7;
      dieBody.angularVelocity.y =
        dieBody.angularVelocity.y * 0.3 + angularVelocity.y * 0.7;
      dieBody.angularVelocity.z =
        dieBody.angularVelocity.z * 0.3 + angularVelocity.z * 0.7;
    }
  }, []);

  // Update popup position when mounted or click position changes
  useEffect(() => {
    if (selectedTokenData && clickPosition && popupRef.current) {
      const position = getDisplayPosition();
      if (position?.left && position?.top) {
        setPopupPosition(position);
      }
    }
  }, [selectedTokenData, clickPosition]);

  // Function to calculate display position
  const getDisplayPosition = useCallback(() => {
    if (!clickPosition || !containerRef.current || !popupRef.current) {
      return null;
    }

    const containerRect = containerRef.current.getBoundingClientRect();
    const popupHeight = popupRef.current.offsetHeight;
    const popupWidth = 320;
    const padding = 15;

    // Calculate initial position centered on click
    let left = clickPosition.x - popupWidth / 2;
    let top = clickPosition.y - popupHeight / 2;

    // Adjust if it would overflow right edge
    if (left + popupWidth > containerRect.width) {
      left = containerRect.width - popupWidth - padding;
    }

    // Adjust if it would overflow bottom edge
    if (top + popupHeight > containerRect.height) {
      top = containerRect.height - popupHeight - padding;
    }

    // Ensure it doesn't go off the left or top edges
    left = Math.max(padding, left);
    top = Math.max(padding, top);

    return {
      left: `${left}px`,
      top: `${top}px`,
    };
  }, [clickPosition]);

  // Add visibility detection to pause animation when not in viewport
  useEffect(() => {
    if (!containerRef.current) return;

    // Create intersection observer to detect when component is in viewport
    const observer = new IntersectionObserver(
      (entries) => {
        const [entry] = entries;
        // Store visibility state in a ref to avoid re-renders
        const isVisible = entry.isIntersecting;

        // If we have an animation frame ID and the component is hidden, cancel the animation
        if (!isVisible && animationFrameIdRef.current) {
          cancelAnimationFrame(animationFrameIdRef.current);
          animationFrameIdRef.current = undefined;
        } else if (
          isVisible &&
          !animationFrameIdRef.current &&
          sceneInitializedRef.current
        ) {
          // Restart animation if component becomes visible again and was previously initialized
          animationFrameIdRef.current = requestAnimationFrame(animate);
        }
      },
      { threshold: 0.1 }, // Trigger when at least 10% of the component is visible
    );

    observer.observe(containerRef.current);

    return () => {
      if (containerRef.current) {
        observer.unobserve(containerRef.current);
      }
    };
  }, [animate]);

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

    // Get container dimensions
    const containerWidth = containerRef.current.clientWidth;
    const containerHeight = 300; // Fixed height

    // Scene setup
    const scene = new THREE.Scene();
    sceneRef.current = scene;
    scene.background = null; // Make scene background transparent

    // Physics world with optimized settings
    const world = new CANNON.World();
    worldRef.current = world;
    world.gravity.set(0, -9.8 * 10, 0); // Reduced gravity for smoother movement
    world.broadphase = new CANNON.NaiveBroadphase();
    world.solver.iterations = 3; // Further reduced iterations for better performance
    world.allowSleep = true;
    world.defaultContactMaterial.contactEquationStiffness = 1e6; // Increased stiffness for more stable contacts
    world.defaultContactMaterial.contactEquationRelaxation = 3; // Relaxation for smoother contacts

    // Setup materials
    const floorMaterial = new CANNON.Material(FLOOR_MATERIAL);
    const wallMaterial = new CANNON.Material(WALL_MATERIAL);
    const diceMaterial = new CANNON.Material(DICE_BODY_MATERIAL);

    // Define optimized contact behaviors
    world.addContactMaterial(
      new CANNON.ContactMaterial(floorMaterial, diceMaterial, {
        friction: 0.4, // Lower friction for smoother sliding
        restitution: 0.3, // Lower restitution for less bouncing
        contactEquationStiffness: 1e7, // Stiffer contacts for stability
        contactEquationRelaxation: 3, // Relaxation for smoother contacts
      }),
    );

    world.addContactMaterial(
      new CANNON.ContactMaterial(wallMaterial, diceMaterial, {
        friction: 0.4, // Lower friction for smoother sliding
        restitution: 0.5, // Moderate restitution for walls
        contactEquationStiffness: 1e7, // Stiffer contacts for stability
        contactEquationRelaxation: 3, // Relaxation for smoother contacts
      }),
    );

    world.addContactMaterial(
      new CANNON.ContactMaterial(diceMaterial, diceMaterial, {
        friction: 0.4, // Lower friction for smoother sliding
        restitution: 0.3, // Lower restitution for less bouncing
        contactEquationStiffness: 1e7, // Stiffer contacts for stability
        contactEquationRelaxation: 3, // Relaxation for smoother contacts
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

    // Renderer setup with performance optimizations
    const renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: true, // Enable transparency
      powerPreference: "high-performance", // Request high-performance GPU
    });
    renderer.setSize(containerWidth, containerHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2)); // Cap pixel ratio for better performance
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap; // Better quality shadows with acceptable performance
    renderer.setClearColor(0x000000, 0); // Make background transparent

    // Store renderer in scene userData for access in animation loop
    scene.userData.renderer = renderer;

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
    textureLoader.crossOrigin = "anonymous";

    const fallbackTexture = "header/placeholder/logo.jpg";

    // Create a texture cache to avoid reloading
    const textureCache =
      window.__TEXTURE_CACHE__ || new Map<string, THREE.Texture>();

    // Store the cache in the window object for reuse
    if (!window.__TEXTURE_CACHE__) {
      window.__TEXTURE_CACHE__ = textureCache;
    }

    // Function to create materials for a die with the same texture on all sides
    const createDieMaterialsWithSameTexture = (
      imageUrl: string,
    ): Promise<THREE.Material[]> => {
      return new Promise((resolve) => {
        // Check if texture is already in cache
        if (textureCache.has(imageUrl)) {
          const cachedTexture = textureCache.get(imageUrl)!;

          // Create materials with cached texture
          const materials = Array(6).fill(
            new THREE.MeshStandardMaterial({
              map: cachedTexture,
              roughness: 1.0,
              metalness: 0.3,
              emissiveMap: cachedTexture,
              emissiveIntensity: 0.3,
            }),
          );

          resolve(materials);
          return;
        }

        // Load new texture if not in cache
        textureLoader.load(
          imageUrl,
          (texture) => {
            texture.colorSpace = THREE.SRGBColorSpace;

            // Cache the texture
            textureCache.set(imageUrl, texture);

            // Create materials with the loaded texture
            const materials = Array(6).fill(
              new THREE.MeshStandardMaterial({
                map: texture,
                roughness: 1.0,
                metalness: 0.3,
                emissiveMap: texture,
                emissiveIntensity: 0.3,
              }),
            );

            resolve(materials);
          },
          undefined,
          (error) => {
            console.warn("Error loading texture:", error);

            // Check if fallback is already in cache
            if (textureCache.has(fallbackTexture)) {
              const cachedFallback = textureCache.get(fallbackTexture)!;

              resolve(
                Array(6).fill(
                  new THREE.MeshStandardMaterial({
                    map: cachedFallback,
                    roughness: 1.0,
                    metalness: 0.3,
                    emissiveMap: cachedFallback,
                    emissiveIntensity: 0.3,
                  }),
                ),
              );
              return;
            }

            // Load fallback texture if the token image fails
            textureLoader.load(
              fallbackTexture,
              (fallbackTex) => {
                fallbackTex.colorSpace = THREE.SRGBColorSpace;

                // Cache the fallback texture
                textureCache.set(fallbackTexture, fallbackTex);

                // Resolve with fallback materials
                resolve(
                  Array(6).fill(
                    new THREE.MeshStandardMaterial({
                      map: fallbackTex,
                      roughness: 1.0,
                      metalness: 0.3,
                      emissiveMap: fallbackTex,
                      emissiveIntensity: 0.3,
                    }),
                  ),
                );
              },
              undefined,
              (fallbackError) => {
                // Handle fallback texture loading error
                console.error("Fallback texture also failed:", fallbackError);

                // Create a solid color material as last resort
                const solidMaterial = new THREE.MeshStandardMaterial({
                  color: 0x444444,
                  roughness: 0.8,
                  metalness: 0.2,
                });

                resolve(Array(6).fill(solidMaterial));
              },
            );
          },
        );
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
        resizeImage(tokenData.image, 100, 100),
      );
      const die = new THREE.Mesh(diceGeometry, dieMaterials);

      die.position.copy(position);
      die.scale.set(scale, scale, scale);
      die.castShadow = true;
      die.receiveShadow = true;

      // Store token address as a custom property
      die.userData = { tokenAddress: tokenData.address };

      // Create physics body with more reasonable mass and damping
      const halfExtents = new CANNON.Vec3(
        scale + 0.5,
        scale + 0.25,
        scale + 0.25,
      );
      const dieBody = new CANNON.Body({
        mass: 100, // Reduced mass for smoother physics
        shape: new CANNON.Box(halfExtents),
        material: diceMaterial,
        allowSleep: true,
        linearDamping: 0.3, // Add damping to reduce jitter
        angularDamping: 0.3, // Add angular damping to reduce spin jitter
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

    // Create dice with token images - modified to add dice as they load
    const createAllDice = () => {
      // Clear any existing dice
      diceRef.current = [];
      diceBodiesRef.current = [];

      const numDice = Math.min(5, selectedTokens.length);

      // Create each die individually as textures load
      const createDiceSequentially = async () => {
        // First create dice for actual tokens
        for (let i = 0; i < numDice; i++) {
          const position =
            dicePositionsRef.current[i] ||
            new THREE.Vector3(
              Math.random() * 50 - 25,
              20 + i * 2,
              Math.random() * 16 - 8,
            );

          // Create die and add to scene
          const { die, dieBody } = await createDie(position, scale, i);
          diceRef.current.push(die);
          diceBodiesRef.current.push(dieBody);

          // Update loaded dice state
          setLoadedDice((prev) => new Set(prev).add(i));
        }

        // If we have fewer than 5 tokens, fill remaining slots with empty dice
        if (numDice < 5) {
          for (let i = numDice; i < 5; i++) {
            const position = new THREE.Vector3(
              Math.random() * 50 - 25,
              20 + i * 2,
              Math.random() * 16 - 8,
            );

            // Create die and add to scene
            const { die, dieBody } = await createDie(
              position,
              scale,
              i % numDice,
            );
            diceRef.current.push(die);
            diceBodiesRef.current.push(dieBody);

            // Update loaded dice state
            setLoadedDice((prev) => new Set(prev).add(i));
          }
        }
      };

      // Start creating dice
      createDiceSequentially();
    };

    // Create all dice
    createAllDice();

    // Improved collision handler with less randomness for smoother movement
    function handleCollisions(event: any) {
      try {
        // In this event, event.body is the body that has a collision
        const impactedBody = event.body;

        if (!impactedBody || impactedBody.mass <= 0) return;

        // Only add a small amount of randomness to prevent jitter
        // Use much smaller values and apply them more gently
        const randomX = (Math.random() - 0.5) * 2; // Reduced randomness
        const randomY = (Math.random() - 0.5) * 2; // Reduced randomness
        const randomZ = (Math.random() - 0.5) * 2; // Reduced randomness

        // Apply gentler changes to angular velocity
        impactedBody.angularVelocity.x =
          impactedBody.angularVelocity.x * 0.8 + randomX * 0.2;
        impactedBody.angularVelocity.y =
          impactedBody.angularVelocity.y * 0.8 + randomY * 0.2;
        impactedBody.angularVelocity.z =
          impactedBody.angularVelocity.z * 0.8 + randomZ * 0.2;

        // Add a very small upward bounce only if needed
        if (impactedBody.velocity.y < 0.2) {
          impactedBody.velocity.y += Math.random() * 0.5; // Much smaller bounce
        }

        // Apply damping to reduce jitter after collisions
        impactedBody.linearDamping = 0.5; // Increase damping after collision
        impactedBody.angularDamping = 0.5; // Increase damping after collision

        // Schedule damping to return to normal after a short delay
        setTimeout(() => {
          if (impactedBody) {
            impactedBody.linearDamping = 0.3;
            impactedBody.angularDamping = 0.3;
          }
        }, 300);
      } catch (error) {
        console.warn("Error in collision handler:", error);
      }
    }

    // Add collision event listener to world (use collide event instead of beginContact)
    world.addEventListener("collide", handleCollisions);

    // Animation function with performance optimizations
    let lastTime = 0;
    const fixedTimeStep = 1 / 60; // 60 fps
    const maxSubSteps = 3; // Maximum physics substeps
    let animationFrameId: number;

    function animate(time = 0) {
      animationFrameId = requestAnimationFrame(animate);

      // Calculate delta time in seconds
      const deltaTime = Math.min((time - lastTime) / 1000, 0.1); // Cap at 100ms to avoid large jumps
      lastTime = time;

      // Step the physics world with proper time step
      world.step(fixedTimeStep, deltaTime, maxSubSteps);

      // Update dice positions and rotations - only for dice that are moving
      for (let i = 0; i < diceBodies.length; i++) {
        const dieBody = diceBodies[i];
        const die = dice[i];

        // Only update if the body is awake (moving)
        if (dieBody.sleepState !== CANNON.Body.SLEEPING) {
          die.position.copy(dieBody.position as any);
          die.quaternion.copy(dieBody.quaternion as any);
        }
      }

      renderer.render(scene, camera);
    }

    // Start animation
    animate();

    // Track resize timeout for debouncing
    let resizeTimeout: number | null = null;

    // Optimized window resize handler
    const onWindowResize = () => {
      if (!containerRef.current) return;

      if (resizeTimeout) {
        window.clearTimeout(resizeTimeout);
      }

      // Immediate minimal update for responsive feel - just update renderer size
      const newContainerWidth = containerRef.current.clientWidth;
      renderer.setSize(newContainerWidth, containerHeight);

      // Debounce expensive updates
      resizeTimeout = window.setTimeout(() => {
        if (!containerRef.current) return;

        const newContainerWidth = containerRef.current.clientWidth;
        const newAspect = newContainerWidth / containerHeight;
        const newFrustumHeight = frustumSize;
        const newFrustumWidth = frustumSize * newAspect;

        // Update camera
        camera.left = newFrustumWidth / -2;
        camera.right = newFrustumWidth / 2;
        camera.top = newFrustumHeight / 2;
        camera.bottom = newFrustumHeight / -2;
        camera.updateProjectionMatrix();

        // Update renderer size again with proper dimensions
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
      }, 250); // Longer debounce time for better performance
    };

    window.addEventListener("resize", onWindowResize);

    // Initial throw
    throwDice();

    // Cleanup on unmount
    return () => {
      // Reset initialization flags on unmount
      sceneInitializedRef.current = false;
      // Don't reset tokensProcessedRef to preserve token selection

      // Cancel animation frame
      if (animationFrameId) {
        cancelAnimationFrame(animationFrameId);
      }

      // Clear any pending resize timeout
      if (resizeTimeout) {
        window.clearTimeout(resizeTimeout);
      }

      window.removeEventListener("resize", onWindowResize);

      // Dispose of resources
      renderer.dispose();

      // Dispose of geometries and materials
      diceGeometry.dispose();
      dice.forEach((die) => {
        if (Array.isArray(die.material)) {
          die.material.forEach((mat) => mat.dispose());
        } else if (die.material) {
          die.material.dispose();
        }
      });

      // Clear texture cache
      textureCache.forEach((texture) => texture.dispose());
      textureCache.clear();
    };
  }, [selectedTokens]);

  return (
    <div
      className="w-full h-[300px] overflow-hidden cursor-pointer my-6 xl:mt-0 relative"
      onClick={handleContainerClick}
    >
      {/* SVG background placed below the canvas */}
      <div className="absolute size-full border-8 border-autofun-background-action-highlight" />
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
    </div>
  );
};

const FrontpageHeader = ({ tokens = [] }: { tokens?: IToken[] }) => {
  return <DiceRoller tokens={tokens} />;
};

export default FrontpageHeader;
