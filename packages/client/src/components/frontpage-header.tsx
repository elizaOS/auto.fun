import { IToken } from "@/types";
import * as CANNON from "cannon-es";
import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
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
  const popupRef = useRef<HTMLDivElement>(null);
  const [isLoading, setIsLoading] = useState(true);
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

  // Refs for animation loop and visibility
  const isVisibleRef = useRef(true); // Assume visible initially
  const frameCountRef = useRef(0);
  const animationIdRef = useRef<number | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null); // Ref for renderer
  const animateFuncRef = useRef<() => void | null>(null); // Ref to store the animate function

  // --- Visibility Detection Effect --- (Moved to top level)
  useEffect(() => {
    if (!containerRef.current) return;

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          const wasVisible = isVisibleRef.current;
          isVisibleRef.current = entry.isIntersecting;

          // If it just became visible and animation isn't running, start it
          if (
            entry.isIntersecting &&
            !wasVisible &&
            animationIdRef.current === null &&
            animateFuncRef.current
          ) {
            console.log("Component became visible, starting animation.");
            animationIdRef.current = requestAnimationFrame(
              animateFuncRef.current,
            );
          }
          // Optional: Stop animation if it becomes hidden (though skipping work is often enough)
          // else if (!entry.isIntersecting && wasVisible && animationIdRef.current !== null) {
          //   console.log("Component hidden, stopping animation frame requests.");
          //   cancelAnimationFrame(animationIdRef.current);
          //   animationIdRef.current = null;
          // }
        });
      },
      { threshold: 0.1 }, // Trigger when 10% is visible
    );

    const currentRef = containerRef.current;
    observer.observe(currentRef);

    return () => {
      if (currentRef) {
        observer.unobserve(currentRef);
      }
      observer.disconnect();
      // Ensure animation frame is cancelled on unmount regardless of visibility
      if (animationIdRef.current !== null) {
        cancelAnimationFrame(animationIdRef.current);
        animationIdRef.current = null;
      }
    };
  }, []); // Empty dependency array, runs once on mount

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

      // Impulse and Torque values - might need tuning
      const impulseMagnitude = 1 * dieBody.mass; // Scale impulse by mass
      const torqueMagnitude = 0.5 * dieBody.mass; // Significantly reduced torque magnitude

      // Apply random impulse (linear force)
      const impulseVector = new CANNON.Vec3(
        (Math.random() - 0.5) * impulseMagnitude,
        Math.random() * (impulseMagnitude * 0.5), // More upward impulse
        (Math.random() - 0.5) * impulseMagnitude,
      );
      // Apply impulse at the center of mass
      // Providing the world point to apply the impulse (center of mass in this case)
      dieBody.applyImpulse(impulseVector, dieBody.position);

      // Apply random torque (rotational force)
      const torqueVector = new CANNON.Vec3(
        (Math.random() - 0.5) * torqueMagnitude,
        (Math.random() - 0.5) * torqueMagnitude,
        (Math.random() - 0.5) * torqueMagnitude,
      );
      dieBody.applyTorque(torqueVector);
    }
  };

  // Handle clicking anywhere on the container
  const handleContainerClick = (event: React.MouseEvent) => {
    if (isLoading) return;

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

    // Check for intersections with dice
    // const intersects = raycaster.intersectObjects(diceRef.current);

    // if (intersects.length > 0) {
    //   // Get the clicked die
    //   const clickedDie = intersects[0].object as THREE.Mesh;

    //   // Get the token address from the die's userData
    //   const tokenAddress = clickedDie.userData?.tokenAddress;

    //   if (tokenAddress) {
    //     // If we already have a selected cube, deselect it
    //     if (selectedCube) {
    //       // Remove glow effect
    //       if (Array.isArray(selectedCube.material)) {
    //         selectedCube.material.forEach((mat) => {
    //           if (mat instanceof THREE.MeshStandardMaterial) {
    //             mat.emissiveIntensity = 0.3;
    //           }
    //         });
    //       }
    //       setSelectedCube(null);
    //       setSelectedTokenData(null);
    //     } else {
    //       // Select the new cube
    //       setSelectedCube(clickedDie);
    //       // Add glow effect
    //       if (Array.isArray(clickedDie.material)) {
    //         clickedDie.material.forEach((mat) => {
    //           if (mat instanceof THREE.MeshStandardMaterial) {
    //             mat.emissiveIntensity = 1.0;
    //           }
    //         });
    //       }
    //       // Fetch token data
    //       fetchTokenData(tokenAddress);
    //     }
    //   }
    // } else {
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
    // }
  };

  // Function to fetch token data
  // const fetchTokenData = async (tokenAddress: string) => {
  //   try {
  //     const data = await getToken({ address: tokenAddress });
  //     setSelectedTokenData(data as IToken);
  //   } catch (error) {
  //     console.error("Error fetching token data:", error);
  //   }
  // };

  // Apply force to all dice when clicking background
  // @ts-ignore
  const applyForceToAllDice = (event: MouseEvent) => {
    if (!diceBodiesRef.current.length) {
      return;
    }

    for (const dieBody of diceBodiesRef.current) {
      // Wake up the body
      dieBody.wakeUp();

      // Impulse and Torque values - might need tuning
      const impulseMagnitudeFactor = 40 * dieBody.mass; // Scale impulse by mass

      // const torqueMagnitude = 0.5 * dieBody.mass; // Significantly reduced torque magnitude

      // Apply random impulse (linear force)
      const impulseVector = new CANNON.Vec3(
        (Math.random() - 0.5) * impulseMagnitudeFactor,
        Math.random() * (impulseMagnitudeFactor * 0.5), // More upward impulse
        (Math.random() - 0.5) * impulseMagnitudeFactor,
      );
      // Apply impulse at the center of mass
      // Providing the world point to apply the impulse (center of mass in this case)
      dieBody.applyImpulse(impulseVector, dieBody.position);

      // Apply random torque (rotational force)
      // const torqueVector = new CANNON.Vec3(
      //   (Math.random() - 0.5) * torqueMagnitude,
      //   (Math.random() - 0.5) * torqueMagnitude,
      //   (Math.random() - 0.5) * torqueMagnitude,
      // );
      // dieBody.applyTorque(torqueVector);
    }
  };

  // Update popup position when mounted or click position changes
  useEffect(() => {
    if (selectedTokenData && clickPosition && popupRef.current) {
      const position = getDisplayPosition();
      if (position?.left && position?.top) {
        setPopupPosition(position);
      }
    }
  }, [selectedTokenData, clickPosition, popupRef.current]);

  // Function to calculate display position
  const getDisplayPosition = () => {
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
  };

  // --- Main Scene Setup Effect ---
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

    // Physics world
    const world = new CANNON.World();
    worldRef.current = world;
    world.gravity.set(0, -9.8 * 10, 0); // Less intense gravity
    world.solver.iterations = 7; // Increase iterations from 7 to 12 for better accuracy
    world.broadphase = new CANNON.SAPBroadphase(world); // More efficient broadphase
    world.allowSleep = true; // Critical for performance

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
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5)); // Limit pixel ratio
    renderer.shadowMap.enabled = false; // Remove shadow mapping
    rendererRef.current = renderer; // Store renderer in ref

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
    directionalLight.castShadow = false;
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
    });

    // Back wall - Increased Height and Thickness
    const wallHeight = 100; // Increased height
    const frontBackWallThickness = 5; // Increased thickness
    const sideWallThickness = 10; // Increased thickness

    const backWallGeometry = new THREE.BoxGeometry(
      frustumWidth,
      wallHeight,
      frontBackWallThickness,
    );
    const backWall = new THREE.Mesh(backWallGeometry, wallMeshMaterial);
    // Adjust Y position to sit on the floor, account for half thickness Z
    backWall.position.set(
      0,
      wallHeight / 2 - 0.5,
      -frustumHeight / 2 - frontBackWallThickness / 2,
    );
    backWall.castShadow = true;
    backWall.receiveShadow = true;
    scene.add(backWall);

    // Back wall physics body - Increased Height and Thickness
    const backWallBody = new CANNON.Body({
      mass: 0,
      // Use half-extents
      shape: new CANNON.Box(
        new CANNON.Vec3(
          frustumWidth / 2,
          wallHeight / 2,
          frontBackWallThickness / 2,
        ),
      ),
      material: wallMaterial,
    });
    // Adjust Y position, account for half thickness Z
    backWallBody.position.set(
      0,
      wallHeight / 2 - 0.5,
      -frustumHeight / 2 - frontBackWallThickness / 2,
    );
    world.addBody(backWallBody);

    // Front wall - Reuse Geometry, Adjust Position
    const frontWall = new THREE.Mesh(backWallGeometry, wallMeshMaterial);
    // Adjust Y position, account for half thickness Z
    frontWall.position.set(
      0,
      wallHeight / 2 - 0.5,
      frustumHeight / 2 + frontBackWallThickness / 2,
    );
    frontWall.castShadow = true;
    frontWall.receiveShadow = true;
    scene.add(frontWall);

    // Front wall physics body - Increased Height and Thickness
    const frontWallBody = new CANNON.Body({
      mass: 0,
      // Use half-extents
      shape: new CANNON.Box(
        new CANNON.Vec3(
          frustumWidth / 2,
          wallHeight / 2,
          frontBackWallThickness / 2,
        ),
      ),
      material: wallMaterial,
    });
    // Adjust Y position, account for half thickness Z
    frontWallBody.position.set(
      0,
      wallHeight / 2 - 0.5,
      frustumHeight / 2 + frontBackWallThickness / 2,
    );
    world.addBody(frontWallBody);

    // Left wall - Increased Height and Thickness
    const sideWallGeometry = new THREE.BoxGeometry(
      sideWallThickness,
      wallHeight,
      frustumHeight,
    );
    const leftWall = new THREE.Mesh(sideWallGeometry, wallMeshMaterial);
    // Adjust Y position, account for half thickness X
    leftWall.position.set(
      -frustumWidth / 2 - sideWallThickness / 2,
      wallHeight / 2 - 0.5,
      0,
    );
    leftWall.castShadow = true;
    leftWall.receiveShadow = true;
    scene.add(leftWall);

    // Left wall physics body - Increased Height and Thickness
    const leftWallBody = new CANNON.Body({
      mass: 0,
      // Use half-extents
      shape: new CANNON.Box(
        new CANNON.Vec3(
          sideWallThickness / 2,
          wallHeight / 2,
          frustumHeight / 2,
        ),
      ),
      material: wallMaterial,
    });
    // Adjust Y position, account for half thickness X
    leftWallBody.position.set(
      -frustumWidth / 2 - sideWallThickness / 2,
      wallHeight / 2 - 0.5,
      0,
    );
    world.addBody(leftWallBody);

    // Right wall - Reuse Geometry, Adjust Position
    const rightWall = new THREE.Mesh(sideWallGeometry, wallMeshMaterial);
    // Adjust Y position, account for half thickness X
    rightWall.position.set(
      frustumWidth / 2 + sideWallThickness / 2,
      wallHeight / 2 - 0.5,
      0,
    );
    rightWall.castShadow = true;
    rightWall.receiveShadow = true;
    scene.add(rightWall);

    // Right wall physics body - Increased Height and Thickness
    const rightWallBody = new CANNON.Body({
      mass: 0,
      // Use half-extents
      shape: new CANNON.Box(
        new CANNON.Vec3(
          sideWallThickness / 2,
          wallHeight / 2,
          frustumHeight / 2,
        ),
      ),
      material: wallMaterial,
    });
    // Adjust Y position, account for half thickness X
    rightWallBody.position.set(
      frustumWidth / 2 + sideWallThickness / 2,
      wallHeight / 2 - 0.5,
      0,
    );
    world.addBody(rightWallBody);

    // Load textures for dice
    const textureLoader = new THREE.TextureLoader();
    textureLoader.crossOrigin = "anonymous";

    const fallbackTexture = "header/placeholder/logo.jpg";

    // Helper function to create materials for a die with the same texture on all sides
    const createDieMaterialsWithSameTexture = (tokenImage: string) => {
      return new Promise<THREE.MeshStandardMaterial[]>((resolve) => {
        textureLoader.load(
          tokenImage,
          (texture) => {
            texture.colorSpace = THREE.SRGBColorSpace;
            texture.minFilter = THREE.LinearFilter; // Simpler filtering
            texture.generateMipmaps = false; // Disable mipmaps for performance
            setIsLoading(false);

            // Create a single material instead of 6 identical ones
            const material = new THREE.MeshStandardMaterial({
              map: texture,
              roughness: 0.75,
              metalness: 0.2,
              emissiveMap: texture,
              emissiveIntensity: 0.3,
            });

            // Reuse the same material for all sides
            resolve(Array(6).fill(material));
          },
          undefined,
          (error) => {
            console.warn("Error loading texture:", error);

            // Load fallback texture if the token image fails
            textureLoader.load(
              fallbackTexture, // Make sure this variable is defined
              (fallbackTex) => {
                fallbackTex.colorSpace = THREE.SRGBColorSpace;
                setIsLoading(false);

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
                setIsLoading(false);

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
    const diceGeometry = new THREE.BoxGeometry(scale, scale, scale, 1, 1, 1);
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

      // Set better sleep parameters on dice bodies
      dieBody.allowSleep = true;
      dieBody.sleepSpeedLimit = 0.5; // Higher threshold for sleeping
      dieBody.sleepTimeLimit = 0.5; // Fall asleep faster

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
        console.warn("Error in collision handler:", error);
      }
    }

    // Add collision event listener to world
    world.addEventListener("collide", handleCollisions);

    // Animation function (defined inside main useEffect)
    function animate() {
      // Schedule next frame immediately
      animationIdRef.current = requestAnimationFrame(animate);

      // If not visible or no container, skip physics and render
      if (!isVisibleRef.current || !containerRef.current) {
        return;
      }

      const world = worldRef.current;
      const scene = sceneRef.current;
      const camera = cameraRef.current;
      const renderer = rendererRef.current;

      if (!world || !scene || !camera || !renderer) return;

      // Determine if any dice are active or force update periodically
      const isDiceActive =
        diceBodiesRef.current.length > 0 &&
        diceBodiesRef.current.some(
          (body) =>
            !body.sleepState &&
            (body.velocity.length() > 0.1 ||
              body.angularVelocity.length() > 0.1),
        );

      // Only step physics and update positions if dice are active or on forced update interval
      if (isDiceActive || frameCountRef.current % 3 === 0) {
        const currentFrustumWidth = camera.right - camera.left;
        const currentFrustumDepth = camera.top - camera.bottom;

        world.step(1 / 60);

        for (let i = 0; i < diceBodiesRef.current.length; i++) {
          const dieBody = diceBodiesRef.current[i];
          const die = diceRef.current[i];

          if (die && dieBody) {
            die.position.copy(dieBody.position as any);
            die.quaternion.copy(dieBody.quaternion as any);

            // Check if the die has fallen below the floor threshold
            if (dieBody.position.y < -10) {
              console.warn("Die fell through floor, resetting position.");
              // Reset position to a random spot above the floor inside the current bounds
              const resetX =
                (Math.random() - 0.5) * (currentFrustumWidth * 0.8); // Use 80% of width
              const resetZ =
                (Math.random() - 0.5) * (currentFrustumDepth * 0.8); // Use 80% of depth
              dieBody.position.set(resetX, 25, resetZ); // Reset high up

              // Reset velocities with some randomness
              const randomVelX = (Math.random() - 0.5) * 10;
              const randomVelZ = (Math.random() - 0.5) * 10;
              dieBody.velocity.set(randomVelX, -5, randomVelZ); // Add random horizontal velocity

              // Add random spin
              const randomSpinX = (Math.random() - 0.5) * 15;
              const randomSpinY = (Math.random() - 0.5) * 15;
              const randomSpinZ = (Math.random() - 0.5) * 15;
              dieBody.angularVelocity.set(
                randomSpinX,
                randomSpinY,
                randomSpinZ,
              );

              // Wake the body up
              dieBody.wakeUp();
            }
          }
        }
      }

      frameCountRef.current++;
      renderer.render(scene, camera);
    }

    // Store the animate function in a ref so the visibility effect can call it
    animateFuncRef.current = animate;

    // Start animation only if visible
    if (isVisibleRef.current) {
      animate();
    }

    // Expose reset function to window so the button can access it
    window.resetDice = throwDice;

    // Track resize timeout for debouncing
    const resizeTimeout: number | null = null;

    // Updated window resize handler
    const onWindowResize = () => {
      if (!containerRef.current) return;

      if (resizeTimeout) {
        window.clearTimeout(resizeTimeout);
      }

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

      // Update renderer size
      renderer.setSize(newContainerWidth, containerHeight);

      // Update mesh positions and scales
      floor.position.set(0, -0.5, 0);
      floor.scale.set(
        newFrustumWidth / frustumWidth,
        1,
        newFrustumHeight / frustumHeight,
      );

      // Use the constants defined earlier for consistency
      const wallHeight = 100;
      const frontBackWallThickness = 5;
      const sideWallThickness = 10;

      // Update mesh positions and scales using new dimensions
      backWall.position.set(
        0,
        wallHeight / 2 - 0.5,
        -newFrustumHeight / 2 - frontBackWallThickness / 2,
      );
      backWall.scale.set(newFrustumWidth / frustumWidth, 1, 1); // Scale width, thickness is fixed

      frontWall.position.set(
        0,
        wallHeight / 2 - 0.5,
        newFrustumHeight / 2 + frontBackWallThickness / 2,
      );
      frontWall.scale.set(newFrustumWidth / frustumWidth, 1, 1); // Scale width, thickness is fixed

      leftWall.position.set(
        -newFrustumWidth / 2 - sideWallThickness / 2,
        wallHeight / 2 - 0.5,
        0,
      );
      leftWall.scale.set(1, 1, newFrustumHeight / frustumHeight); // Scale depth, thickness is fixed

      rightWall.position.set(
        newFrustumWidth / 2 + sideWallThickness / 2,
        wallHeight / 2 - 0.5,
        0,
      );
      rightWall.scale.set(1, 1, newFrustumHeight / frustumHeight); // Scale depth, thickness is fixed

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

      // Back wall physics body - Use new dimensions
      backWallBody.position.set(
        0,
        wallHeight / 2 - 0.5,
        -newFrustumHeight / 2 - frontBackWallThickness / 2,
      );
      backWallBody.shapes[0] = new CANNON.Box(
        new CANNON.Vec3(
          newFrustumWidth / 2,
          wallHeight / 2,
          frontBackWallThickness / 2,
        ),
      );
      world.addBody(backWallBody);

      // Front wall physics body - Use new dimensions
      frontWallBody.position.set(
        0,
        wallHeight / 2 - 0.5,
        newFrustumHeight / 2 + frontBackWallThickness / 2,
      );
      frontWallBody.shapes[0] = new CANNON.Box(
        new CANNON.Vec3(
          newFrustumWidth / 2,
          wallHeight / 2,
          frontBackWallThickness / 2,
        ),
      );
      world.addBody(frontWallBody);

      // Left wall physics body - Use new dimensions
      leftWallBody.position.set(
        -newFrustumWidth / 2 - sideWallThickness / 2,
        wallHeight / 2 - 0.5,
        0,
      );
      leftWallBody.shapes[0] = new CANNON.Box(
        new CANNON.Vec3(
          sideWallThickness / 2,
          wallHeight / 2,
          newFrustumHeight / 2,
        ),
      );
      world.addBody(leftWallBody);

      // Right wall physics body - Use new dimensions
      rightWallBody.position.set(
        newFrustumWidth / 2 + sideWallThickness / 2,
        wallHeight / 2 - 0.5,
        0,
      );
      rightWallBody.shapes[0] = new CANNON.Box(
        new CANNON.Vec3(
          sideWallThickness / 2,
          wallHeight / 2,
          newFrustumHeight / 2,
        ),
      );
      world.addBody(rightWallBody);
      // Do NOT reposition and reroll dice when resizing
      // Removed: throwDice();
    };

    window.addEventListener("resize", onWindowResize);

    // Initial throw
    throwDice();

    // Cleanup on unmount
    return () => {
      // Cancel any pending animation frames
      if (animationIdRef.current !== null) {
        cancelAnimationFrame(animationIdRef.current);
        animationIdRef.current = null;
      }

      // Clear animate function ref
      animateFuncRef.current = null;

      // Clear all physics bodies
      if (worldRef.current) {
        for (const body of diceBodiesRef.current) {
          worldRef.current.removeBody(body);
        }
      }

      // Dispose of geometry and materials
      for (const die of diceRef.current) {
        if (die.geometry) die.geometry.dispose();
        if (Array.isArray(die.material)) {
          die.material.forEach((mat) => mat.dispose());
        }
      }

      // Clear references
      diceRef.current = [];
      diceBodiesRef.current = [];

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
      rendererRef.current = null; // Clear renderer ref
    };
  }, [selectedTokens]); // Dependency array for main setup effect

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
        className="w-full h-full absolute top-0 left-0 z-0 border-8 border-[#03FF24]"
      />

      {isLoading && (
        <div className="absolute top-0 left-0 w-full h-full flex items-center justify-center bg-autofun-background-card bg-opacity-75 text-white text-xl z-20">
          Loading...
        </div>
      )}

      {/* Token Data Display */}
      {/* {selectedTokenData && (
        <div
          className="absolute bg-autofun-background-card p-4 shadow-lg z-10 w-[320px]"
          // @ts-ignore
          style={getDisplayPosition()}
        >
          <button
            onClick={handleCloseTokenData}
            className="absolute top-2 right-3 text-autofun-text-secondary hover:text-autofun-text-primary"
          >
            ✕
          </button>
          <div className="flex flex-col gap-3">
            <div className="flex items-center justify-between pr-8">
              <div className="flex items-center gap-2">
                <div className="w-14 h-14 overflow-hidden">
                  <img
                    src={selectedTokenData.image}
                    alt={selectedTokenData.name}
                    className="w-full h-full object-cover"
                  />
                </div>
                <div className="flex flex-col">
                  <h3 className="text-lg font-bold text-autofun-text-primary">
                    {selectedTokenData.name}
                  </h3>
                  <span className="text-sm text-autofun-text-secondary">
                    ${selectedTokenData.ticker}
                  </span>
                  <span className="text-xs text-autofun-text-secondary">
                    Created: {formatDate(selectedTokenData.createdAt)}
                  </span>
                </div>
              </div>
              <Link to={`/token/${selectedTokenData.mint}`}>
                <button className="py-0.5 px-2 bg-[#03ff24] text-black font-bold uppercase tracking-wide text-xs">
                  Trade
                </button>
              </Link>
            </div>

            <div className="flex items-center gap-1 -my-1">
              <span className="text-[10px] text-autofun-text-secondary truncate">
                {selectedTokenData.mint}
              </span>
              <div onClick={(e) => e.stopPropagation()} className="scale-75">
                <CopyButton text={selectedTokenData.mint} />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-1">
                <span className="text-sm text-autofun-text-secondary">
                  Price USD
                </span>
                <span className="text-xl font-dm-mono text-autofun-text-highlight">
                  ${selectedTokenData.currentPrice?.toFixed(6) || "0.000000"}
                </span>
              </div>
              <div className="flex flex-col gap-1">
                <span className="text-sm text-autofun-text-secondary">
                  Market Cap
                </span>
                <span className="text-xl font-dm-mono text-autofun-text-highlight">
                  ${selectedTokenData.marketCapUSD?.toFixed(2) || "0.00"}
                </span>
              </div>
              <div className="flex flex-col gap-1">
                <span className="text-sm text-autofun-text-secondary">
                  24h Volume
                </span>
                <span className="text-xl font-dm-mono text-autofun-text-highlight">
                  ${selectedTokenData.volume24h?.toFixed(2) || "0.00"}
                </span>
              </div>
              <div className="flex flex-col gap-1">
                <span className="text-sm text-autofun-text-secondary">
                  Holders
                </span>
                <span className="text-xl font-dm-mono text-autofun-text-highlight">
                  {selectedTokenData.holderCount || "0"}
                </span>
              </div>
            </div>
          </div>
        </div>
      )} */}
    </div>
  );
};

const FrontpageHeader = ({ tokens = [] }: { tokens?: IToken[] }) => {
  return <DiceRoller tokens={tokens} />;
};

export default FrontpageHeader;
