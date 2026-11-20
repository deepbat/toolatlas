import * as THREE from 'three';

export interface SceneOptions {
  onDrawer?: (drawer: number) => void;
}

function cssColor(name: string, fallback: string): THREE.Color {
  const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  if (!value) return new THREE.Color(fallback);
  const parts = value.split(/\s+/).map(Number);
  return parts.length === 3 && parts.every(Number.isFinite)
    ? new THREE.Color(parts[0] / 255, parts[1] / 255, parts[2] / 255)
    : new THREE.Color(fallback);
}

function labelTexture(title: string, subtitle: string, accent: string): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 640;
  canvas.height = 420;
  const ctx = canvas.getContext('2d')!;
  const gradient = ctx.createLinearGradient(0, 0, 640, 420);
  gradient.addColorStop(0, '#19284d');
  gradient.addColorStop(1, '#0b142b');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 640, 420);
  ctx.strokeStyle = accent;
  ctx.lineWidth = 5;
  ctx.strokeRect(18, 18, 604, 384);
  ctx.fillStyle = accent;
  ctx.fillRect(48, 54, 58, 8);
  ctx.font = '600 27px Arial';
  ctx.fillStyle = '#9fb4e5';
  ctx.fillText('TOOLATLAS / WORKSPACE', 48, 112);
  ctx.font = '700 72px Arial';
  ctx.fillStyle = '#f5f7ff';
  ctx.fillText(title, 48, 220);
  ctx.font = '400 27px Arial';
  ctx.fillStyle = '#aab9d8';
  ctx.fillText(subtitle, 50, 274);
  ctx.fillStyle = accent;
  ctx.fillRect(48, 330, 150, 7);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function makeCard(title: string, subtitle: string, accent: string, width = 1.72, height = 1.16) {
  const group = new THREE.Group();
  const body = new THREE.Mesh(
    new THREE.BoxGeometry(width, height, 0.12),
    new THREE.MeshPhysicalMaterial({
      color: '#142342', metalness: 0.48, roughness: 0.26,
      clearcoat: 1, clearcoatRoughness: 0.18,
    }),
  );
  body.castShadow = true;
  body.receiveShadow = true;
  group.add(body);

  const face = new THREE.Mesh(
    new THREE.PlaneGeometry(width - 0.12, height - 0.12),
    new THREE.MeshBasicMaterial({ map: labelTexture(title, subtitle, accent) }),
  );
  face.position.z = 0.066;
  group.add(face);

  const edge = new THREE.LineSegments(
    new THREE.EdgesGeometry(new THREE.BoxGeometry(width, height, 0.12)),
    new THREE.LineBasicMaterial({ color: accent, transparent: true, opacity: 0.8 }),
  );
  group.add(edge);
  return group;
}

export function startScene(canvas: HTMLCanvasElement, options: SceneOptions = {}): (() => void) | null {
  let renderer: THREE.WebGLRenderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true, powerPreference: 'high-performance' });
  } catch {
    return null;
  }

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(34, 1, 0.1, 80);
  camera.position.set(0.1, 0.15, 11.8);
  camera.lookAt(0.35, 0, 0);

  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.7));
  renderer.setClearColor(0x000000, 0);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.2;

  scene.add(new THREE.HemisphereLight(0xa9c8ff, 0x10182c, 2.0));
  const key = new THREE.DirectionalLight(0xe5edff, 4.2);
  key.position.set(-3, 6, 7);
  key.castShadow = true;
  key.shadow.mapSize.set(1024, 1024);
  scene.add(key);
  const blueLight = new THREE.PointLight(0x5278ff, 38, 14, 2);
  blueLight.position.set(3.6, 2.2, 2.8);
  scene.add(blueLight);
  const cyanLight = new THREE.PointLight(0x20d6d1, 24, 12, 2);
  cyanLight.position.set(-3, -2, 1);
  scene.add(cyanLight);

  const accent = cssColor('--accent', '#718cff');
  const accent2 = cssColor('--accent-2', '#29d2d0');
  const ink = cssColor('--fg', '#eaf0ff');

  const world = new THREE.Group();
  world.position.set(2.05, 0.02, 0);
  scene.add(world);

  // A substantial, layered 3D atlas core with bevel-like illuminated edges.
  const core = new THREE.Group();
  world.add(core);
  const coreMat = new THREE.MeshPhysicalMaterial({
    color: '#243d77', metalness: 0.58, roughness: 0.22,
    clearcoat: 1, clearcoatRoughness: 0.12,
  });
  const coreGeometry = new THREE.BoxGeometry(2.55, 2.55, 2.05);
  const coreMesh = new THREE.Mesh(coreGeometry, coreMat);
  coreMesh.castShadow = true;
  coreMesh.receiveShadow = true;
  core.add(coreMesh);
  const coreEdges = new THREE.LineSegments(
    new THREE.EdgesGeometry(coreGeometry),
    new THREE.LineBasicMaterial({ color: 0x8aa8ff, transparent: true, opacity: 0.88 }),
  );
  core.add(coreEdges);

  const front = new THREE.Mesh(
    new THREE.PlaneGeometry(2.2, 2.2),
    new THREE.MeshBasicMaterial({ map: labelTexture('ATLAS', 'TOOLS FOR EVERYDAY WORK', '#82a0ff') }),
  );
  front.position.z = 1.035;
  core.add(front);

  // Layered base plates give the centre object real thickness and a strong silhouette.
  for (let i = 0; i < 3; i++) {
    const slab = new THREE.Mesh(
      new THREE.BoxGeometry(3.05 - i * 0.18, 0.16, 2.45 - i * 0.16),
      new THREE.MeshPhysicalMaterial({
        color: i === 1 ? '#263f7b' : '#17284c',
        metalness: 0.68, roughness: 0.24, clearcoat: 0.9,
      }),
    );
    slab.position.y = -1.48 - i * 0.2;
    slab.position.z = 0.03;
    slab.castShadow = true;
    core.add(slab);
    const rim = new THREE.LineSegments(
      new THREE.EdgesGeometry(slab.geometry),
      new THREE.LineBasicMaterial({ color: i === 1 ? 0x36d9d5 : 0x6889ee, transparent: true, opacity: 0.85 }),
    );
    rim.position.copy(slab.position);
    core.add(rim);
  }

  // Five floating, thick glass-like tool panels orbit the central object.
  const cardSpecs = [
    { title: 'PDF', sub: 'EDIT · CONVERT · SIGN', color: '#829cff', p: [-2.65, 1.25, 0.4], r: [0.08, -0.25, -0.12] },
    { title: 'IMAGE', sub: 'CREATE · CLEAN · RESIZE', color: '#35d7d1', p: [2.65, 1.15, -0.2], r: [0.04, 0.28, 0.1] },
    { title: 'TOOLS', sub: 'CALCULATE · ORGANISE', color: '#ffb86b', p: [2.95, -1.05, 0.55], r: [-0.1, 0.22, -0.08] },
    { title: 'PRIVACY', sub: 'LOCAL · PRIVATE · SECURE', color: '#a78bfa', p: [-2.7, -1.2, -0.3], r: [0.1, -0.24, 0.1] },
  ];
  const cards: THREE.Group[] = [];
  cardSpecs.forEach((spec, index) => {
    const card = makeCard(spec.title, spec.sub, spec.color, 1.8, 1.2);
    card.position.set(...spec.p as [number, number, number]);
    card.rotation.set(...spec.r as [number, number, number]);
    card.userData.drawer = index;
    world.add(card);
    cards.push(card);
  });

  // Thick torus rings and a smaller satellite ring provide depth and motion cues.
  const ringA = new THREE.Mesh(
    new THREE.TorusGeometry(3.65, 0.035, 12, 180),
    new THREE.MeshStandardMaterial({ color: accent, metalness: 0.72, roughness: 0.24, emissive: accent, emissiveIntensity: 0.38 }),
  );
  ringA.rotation.set(1.13, 0.2, 0.28);
  world.add(ringA);
  const ringB = new THREE.Mesh(
    new THREE.TorusGeometry(3.12, 0.022, 10, 160),
    new THREE.MeshStandardMaterial({ color: accent2, metalness: 0.65, roughness: 0.22, emissive: accent2, emissiveIntensity: 0.5 }),
  );
  ringB.rotation.set(0.4, 1.08, -0.35);
  world.add(ringB);

  // Dense point field and a subtle perspective floor make the object feel anchored in space.
  const particleCount = 460;
  const positions = new Float32Array(particleCount * 3);
  for (let i = 0; i < particleCount; i++) {
    positions[i * 3] = (Math.random() - 0.5) * 15;
    positions[i * 3 + 1] = (Math.random() - 0.5) * 9;
    positions[i * 3 + 2] = (Math.random() - 0.5) * 8 - 1.8;
  }
  const particleGeometry = new THREE.BufferGeometry();
  particleGeometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  const particles = new THREE.Points(
    particleGeometry,
    new THREE.PointsMaterial({ color: 0x9bb4ff, size: 0.025, transparent: true, opacity: 0.65, sizeAttenuation: true }),
  );
  scene.add(particles);

  const floor = new THREE.GridHelper(22, 36, 0x4566bd, 0x26375f);
  floor.position.set(1.5, -2.75, -1.5);
  (floor.material as THREE.Material).transparent = true;
  (floor.material as THREE.Material).opacity = 0.2;
  scene.add(floor);

  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();
  let pointerX = 0;
  let pointerY = 0;
  let targetX = 0;
  let targetY = 0;
  let scroll = 0;
  let hovered = -1;
  let raf = 0;
  let visible = true;
  let disposed = false;
  const clock = new THREE.Clock();

  const resize = () => {
    const width = Math.max(1, canvas.clientWidth);
    const height = Math.max(1, canvas.clientHeight);
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.position.z = width < 640 ? 14.5 : width < 900 ? 13.2 : 11.8;
    world.scale.setScalar(width < 640 ? 0.58 : width < 900 ? 0.82 : 1);
    world.position.x = width < 640 ? 0.15 : width < 900 ? 1.35 : 2.05;
    camera.updateProjectionMatrix();
  };
  const onPointerMove = (event: PointerEvent) => {
    const rect = canvas.getBoundingClientRect();
    pointerX = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    pointerY = -(((event.clientY - rect.top) / rect.height) * 2 - 1);
    targetX = pointerX;
    targetY = pointerY;
    pointer.set(pointerX, pointerY);
    raycaster.setFromCamera(pointer, camera);
    const hit = raycaster.intersectObjects(cards, true).find((item: THREE.Intersection<THREE.Object3D>) => item.object.parent?.userData.drawer !== undefined || item.object.userData.drawer !== undefined);
    const next = hit ? Number(hit.object.parent?.userData.drawer ?? hit.object.userData.drawer) : -1;
    hovered = next;
    canvas.style.cursor = hovered >= 0 ? 'pointer' : '';
  };
  const onClick = () => {
    if (hovered >= 0) options.onDrawer?.(hovered);
  };
  const onScroll = () => {
    scroll = Math.min(1, Math.max(0, window.scrollY / Math.max(1, document.documentElement.scrollHeight - window.innerHeight)));
  };
  const observer = new IntersectionObserver((entries) => { visible = entries[0]?.isIntersecting ?? true; });
  observer.observe(canvas);
  const onVisibility = () => { visible = !document.hidden; };
  canvas.addEventListener('pointermove', onPointerMove);
  canvas.addEventListener('click', onClick);
  window.addEventListener('resize', resize);
  window.addEventListener('scroll', onScroll, { passive: true });
  document.addEventListener('visibilitychange', onVisibility);
  resize();
  onScroll();

  const animate = () => {
    if (disposed) return;
    raf = requestAnimationFrame(animate);
    if (!visible) return;
    const elapsed = clock.getElapsedTime();
    world.rotation.y += ((targetX * 0.13 + Math.sin(elapsed * 0.18) * 0.055) - world.rotation.y) * 0.025;
    world.rotation.x += ((-targetY * 0.07 + scroll * 0.035) - world.rotation.x) * 0.025;
    world.position.y = Math.sin(elapsed * 0.55) * 0.12;
    core.rotation.y = Math.sin(elapsed * 0.22) * 0.08;
    core.rotation.x = Math.cos(elapsed * 0.2) * 0.035;
    ringA.rotation.z += 0.0018;
    ringB.rotation.x -= 0.0013;
    cards.forEach((card, index) => {
      const spec = cardSpecs[index];
      card.position.y = spec.p[1] + Math.sin(elapsed * 0.7 + index * 1.6) * 0.13;
      card.position.z = spec.p[2] + Math.cos(elapsed * 0.45 + index) * 0.12;
      const active = hovered === index;
      const targetScale = active ? 1.1 : 1;
      card.scale.lerp(new THREE.Vector3(targetScale, targetScale, targetScale), 0.12);
      card.position.x += ((spec.p[0] + (active ? (spec.p[0] > 0 ? 0.16 : -0.16) : 0)) - card.position.x) * 0.08;
    });
    blueLight.intensity = 34 + Math.sin(elapsed * 1.2) * 7;
    cyanLight.intensity = 20 + Math.cos(elapsed * 0.9) * 5;
    particles.rotation.y = elapsed * 0.008;
    renderer.render(scene, camera);
  };
  raf = requestAnimationFrame(animate);

  const cleanup = () => {
    disposed = true;
    cancelAnimationFrame(raf);
    observer.disconnect();
    canvas.removeEventListener('pointermove', onPointerMove);
    canvas.removeEventListener('click', onClick);
    window.removeEventListener('resize', resize);
    window.removeEventListener('scroll', onScroll);
    document.removeEventListener('visibilitychange', onVisibility);
    scene.traverse((object: THREE.Object3D) => {
      const mesh = object as THREE.Mesh;
      if (mesh.geometry) mesh.geometry.dispose();
      if (mesh.material) {
        const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
        materials.forEach((material) => {
          Object.values(material).forEach((value: unknown) => {
            if (value instanceof THREE.Texture) value.dispose();
          });
          material.dispose();
        });
      }
    });
    renderer.dispose();
  };
  return cleanup;
}
