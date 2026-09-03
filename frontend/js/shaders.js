/* ============================================
   FinRAG — Three.js Shader Backgrounds
   Adapted from provided React shader components
   ============================================ */

/* -------- Shader Animation (lines / radial) — landing -------- */
function initShaderAnimation(containerId) {
  const container = document.getElementById(containerId);
  if (!container || typeof THREE === 'undefined') return;

  const vertexShader = `void main(){ gl_Position = vec4(position, 1.0); }`;
  const fragmentShader = `
    #define TWO_PI 6.2831853072
    precision highp float;
    uniform vec2 resolution;
    uniform float time;
    void main(void){
      vec2 uv = (gl_FragCoord.xy * 2.0 - resolution.xy) / min(resolution.x, resolution.y);
      float t = time * 0.05;
      float lineWidth = 0.002;
      vec3 color = vec3(0.0);
      for(int j = 0; j < 3; j++){
        for(int i=0; i < 5; i++){
          color[j] += lineWidth*float(i*i) / abs(fract(t - 0.01*float(j)+float(i)*0.01)*5.0 - length(uv) + mod(uv.x+uv.y, 0.2));
        }
      }
      gl_FragColor = vec4(color[0], color[1], color[2], 1.0);
    }
  `;

  const camera = new THREE.Camera();
  camera.position.z = 1;
  const scene = new THREE.Scene();
  const geometry = new THREE.PlaneGeometry(2, 2);
  const uniforms = {
    time: { value: 1.0 },
    resolution: { value: new THREE.Vector2() }
  };
  const material = new THREE.ShaderMaterial({ uniforms, vertexShader, fragmentShader });
  scene.add(new THREE.Mesh(geometry, material));

  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(window.devicePixelRatio);
  container.appendChild(renderer.domElement);

  function resize() {
    renderer.setSize(container.clientWidth, container.clientHeight);
    uniforms.resolution.value.x = renderer.domElement.width;
    uniforms.resolution.value.y = renderer.domElement.height;
  }
  resize();
  window.addEventListener('resize', resize);

  (function animate() {
    requestAnimationFrame(animate);
    uniforms.time.value += 0.05;
    renderer.render(scene, camera);
  })();
}

/* -------- Shader Lines (mosaic glow) — chatbot bg -------- */
function initShaderLines(containerId) {
  const container = document.getElementById(containerId);
  if (!container || typeof THREE === 'undefined') return;

  const vertexShader = `void main(){ gl_Position = vec4(position, 1.0); }`;
  const fragmentShader = `
    precision highp float;
    uniform vec2 resolution;
    uniform float time;
    float random (vec2 st){ return fract(sin(dot(st.xy, vec2(12.9898,78.233)))*43758.5453123); }
    void main(void){
      vec2 uv = (gl_FragCoord.xy * 2.0 - resolution.xy) / min(resolution.x, resolution.y);
      vec2 fMosaicScal = vec2(4.0, 2.0);
      vec2 vScreenSize = vec2(256,256);
      uv.x = floor(uv.x * vScreenSize.x / fMosaicScal.x) / (vScreenSize.x / fMosaicScal.x);
      uv.y = floor(uv.y * vScreenSize.y / fMosaicScal.y) / (vScreenSize.y / fMosaicScal.y);
      float t = time*0.06 + random(vec2(uv.x))*0.4;
      float lineWidth = 0.0008;
      vec3 color = vec3(0.0);
      for(int j = 0; j < 3; j++){
        for(int i=0; i < 5; i++){
          color[j] += lineWidth*float(i*i) / abs(fract(t - 0.01*float(j)+float(i)*0.01)*1.0 - length(uv));
        }
      }
      gl_FragColor = vec4(color[2], color[1], color[0], 1.0);
    }
  `;

  const camera = new THREE.Camera();
  camera.position.z = 1;
  const scene = new THREE.Scene();
  const geometry = new THREE.PlaneGeometry(2, 2);
  const uniforms = {
    time: { value: 1.0 },
    resolution: { value: new THREE.Vector2() }
  };
  const material = new THREE.ShaderMaterial({ uniforms, vertexShader, fragmentShader });
  scene.add(new THREE.Mesh(geometry, material));

  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(window.devicePixelRatio);
  container.appendChild(renderer.domElement);

  function resize() {
    renderer.setSize(container.clientWidth, container.clientHeight);
    uniforms.resolution.value.x = renderer.domElement.width;
    uniforms.resolution.value.y = renderer.domElement.height;
  }
  resize();
  window.addEventListener('resize', resize);

  (function animate() {
    requestAnimationFrame(animate);
    uniforms.time.value += 0.05;
    renderer.render(scene, camera);
  })();
}

/* -------- Dotted Surface — wave field of points -------- */
function initDottedSurface(containerId) {
  const container = document.getElementById(containerId);
  if (!container || typeof THREE === 'undefined') return;

  const SEPARATION = 150, AMOUNTX = 40, AMOUNTY = 60;
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 1, 10000);
  camera.position.set(0, 355, 1220);

  const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
  renderer.setPixelRatio(window.devicePixelRatio);
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setClearColor(0x000000, 0);
  container.appendChild(renderer.domElement);

  const positions = [], colors = [];
  const geometry = new THREE.BufferGeometry();
  for (let ix = 0; ix < AMOUNTX; ix++) {
    for (let iy = 0; iy < AMOUNTY; iy++) {
      positions.push(
        ix * SEPARATION - (AMOUNTX * SEPARATION) / 2,
        0,
        iy * SEPARATION - (AMOUNTY * SEPARATION) / 2
      );
      colors.push(0.4, 0.78, 0.95); // cyan-ish dots
    }
  }
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));

  const material = new THREE.PointsMaterial({
    size: 7, vertexColors: true, transparent: true, opacity: 0.55, sizeAttenuation: true
  });
  const points = new THREE.Points(geometry, material);
  scene.add(points);

  let count = 0;
  function resize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  }
  window.addEventListener('resize', resize);

  (function animate() {
    requestAnimationFrame(animate);
    const arr = geometry.attributes.position.array;
    let i = 0;
    for (let ix = 0; ix < AMOUNTX; ix++) {
      for (let iy = 0; iy < AMOUNTY; iy++) {
        arr[i * 3 + 1] = Math.sin((ix + count) * 0.3) * 50 + Math.sin((iy + count) * 0.5) * 50;
        i++;
      }
    }
    geometry.attributes.position.needsUpdate = true;
    renderer.render(scene, camera);
    count += 0.1;
  })();
}

/* -------- Shader glow pulse overlay --------
   • Fires exactly ONCE when the user first opens the landing page:
       – Pulse: 600 ms after load (gives the shader canvas time to render)
   • No repeating timers — the overlay runs once and is done.
   ------------------------------------------------ */
function startGlowCycle() {
  const overlay = document.querySelector('.shader-glow-overlay');
  if (!overlay) return;

  function pulse() {
    overlay.classList.remove('active');
    // Force reflow so re-adding the class re-triggers the CSS transition
    void overlay.offsetWidth;
    overlay.classList.add('active');
    // Fade out after 4 s
    setTimeout(() => overlay.classList.remove('active'), 4000);
  }

  // Single pulse — shortly after page load, then done forever
  setTimeout(pulse, 600);
}
