// script.js
import * as THREE from "three";
import { GLTFLoader } from "GLTFLoader";
import { OrbitControls } from "OrbitControls";
import gsap from "gsap";

// ===============================
// 0. 전역 변수
// ===============================
let renderer, scene, camera;
let controls;
let starfield;
let starSpeed = { x: 0.00005, y: 0.00007 }; // 별 회전 속도 (PARAM LAB에서 조절)
let pointsGroup;            // 뇌 포인트 클라우드
const clickableNodes = [];  // 기억 노드들 (Raycasting 대상)

// WASD 상태
const keyState = {
  KeyW: false,
  KeyA: false,
  KeyS: false,
  KeyD: false,
};

// 이동 속도 (PARAM LAB에서 조절할 거라 let)
let moveSpeed = 0.3;

// 카메라가 돌아다닐 수 있는 뇌 안쪽 범위
const BOUNDS = {
  x: 80,
  y: 80,
  z: 80,
};

const isDashboardOpen = { value: false }; // 대시보드 열려 있을 때 이동/클릭 막기용

const TARGET_POSITION = new THREE.Vector3(0, 0, 50); // 줌인 후 카메라 위치

// Raycaster (노드 클릭용)
const raycaster = new THREE.Raycaster();
const mouse = new THREE.Vector2();

// ===============================
// 1. 초기화 & 루프 시작
// ===============================
init();
animate();

// ===============================
// init : 씬 / 카메라 / 렌더러 세팅
// ===============================
function init() {
  const canvas = document.querySelector("#canvas");

  // 렌더러
  renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: true,
    alpha: true,
  });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(window.devicePixelRatio);

  // 씬
  scene = new THREE.Scene();
  scene.background = new THREE.Color("#000000");

  // 카메라
  camera = new THREE.PerspectiveCamera(
    50,
    window.innerWidth / window.innerHeight,
    0.1,
    2000
  );
  camera.position.set(0, 0, 400);
  camera.lookAt(0, 0, 0);

  // 조명
  const ambientLight = new THREE.AmbientLight(0xffffff, 0.2);
  scene.add(ambientLight);

  const directionalLight = new THREE.DirectionalLight(0xffffff, 0.5);
  directionalLight.position.set(1, 1, 1);
  scene.add(directionalLight);

  // 별 배경
  createStarfield();

  // 뇌 모델 + 기억 노드
  loadBrainModel();

  // 시계 시작
  startClock();

  // 창 크기 변경 대응
  window.addEventListener("resize", onWindowResize);
}

// ===============================
// 2. 별 배경 만들기
// ===============================
function createStarfield() {
  const starVertices = [];

  for (let i = 0; i < 10000; i++) {
    const x = THREE.MathUtils.randFloatSpread(1500);
    const y = THREE.MathUtils.randFloatSpread(1500);
    const z = THREE.MathUtils.randFloatSpread(1500);
    starVertices.push(x, y, z);
  }

  const starGeometry = new THREE.BufferGeometry();
  starGeometry.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(starVertices, 3)
  );

  const starMaterial = new THREE.PointsMaterial({
    color: 0xffffff,
    size: 0.5,
    blending: THREE.AdditiveBlending,
    transparent: true,
    opacity: 0.8,
  });

  starfield = new THREE.Points(starGeometry, starMaterial);
  scene.add(starfield);
}

// ===============================
// 3. 기억 노드 데이터
// ===============================
const MEMORY_NODES = [
  {
    name: "해마 (Hippocampus)",
    position: new THREE.Vector3(45, 25, -10),
    image: "images/memory_hippo.jpg",
    content: `
      <h2>해마: 서술 기억과 학습</h2>
      <p>저는 대학 시절 웹 개발에 처음 빠져들었습니다. 이 기억은 새로운 기술을 습득하고 프로젝트를 완성해나갔던 제 학습 경험의 핵심입니다.</p>
      <p>키워드: JavaScript, Three.js, 프론트엔드</p>
    `,
  },
  {
    name: "편도체 (Amygdala)",
    position: new THREE.Vector3(-50, -20, 30),
    image: "images/memory_amygdala.jpg",
    content: `
      <h2>편도체: 열정과 감정적 기억</h2>
      <p>가장 강렬한 기억은 마감일 직전에 버그를 해결했을 때 느꼈던 극도의 긴장감과 성공했을 때의 짜릿한 성취감입니다. 저는 이처럼 도전적인 상황에서 큰 에너지를 얻습니다.</p>
      <p>키워드: 마감일, 짜릿함, 문제 해결</p>
    `,
  },
  {
    name: "전두엽 (Frontal Lobe)",
    position: new THREE.Vector3(10, 55, -40),
    image: "images/memory_frontal.jpg",
    content: `
      <h2>전두엽: 감정 강화형 사회적 기억</h2>
      <p>전두엽은 미래 예측과 계획 수립을 담당하는 영역입니다. 친구들로부터 받은 화려한 생일 축하는 높은 감정 강도를 가진 사회적 사건으로 분류되며, 편도체-전두엽 회로의 강화에 따라 우선적으로 저장되었습니다.</p>
      <p>이 기억은 이후의 생일에 대해 자동적인 '긍정적 예측 패턴'을 활성화하는 기반으로 작동합니다.</p>
    `,
  },
  {
    name: "측두엽 (Temporal Lobe)",
    position: new THREE.Vector3(-60, 10, -15),
    image: "images/memory_temporal.jpg",
    content: `
      <h2>측두엽: 과거 경험 인지</h2>
      <p>가장 기억에 남는 과거 프로젝트는... [여기에 실제 프로젝트 경험을 넣으세요]. 이 경험들이 현재의 저를 구성하는 중요한 배경입니다.</p>
      <p>키워드: 과거 경험, 프로젝트 레퍼런스</p>
    `,
  },
  {
    name: "후두엽 (Occipital Lobe)",
    position: new THREE.Vector3(0, -45, -50),
    image: "images/memory_occipital.jpg",
    content: `
      <h2>후두엽: 시각적 기억의 기초</h2>
      <p>저는 디자인과 시각적인 아름다움을 중요하게 생각합니다. 신경망과 우주의 유사성에서 영감을 받은 이 프로젝트의 몽환적인 비주얼이 제가 추구하는 미적 가치입니다.</p>
      <p>키워드: 디자인, 미학, 시각적 표현</p>
    `,
  },
];

// ===============================
// 4. 기억 노드 생성
// ===============================
function createMemoryNodes() {
  const nodeGeometry = new THREE.SphereGeometry(1.2, 16, 16);
  const baseMaterial = new THREE.MeshBasicMaterial({
    color: 0x00ffff,
    transparent: true,
    opacity: 0.9,
  });

  MEMORY_NODES.forEach((nodeData) => {
    const nodeMaterial = baseMaterial.clone();
    const nodeMesh = new THREE.Mesh(nodeGeometry, nodeMaterial);

    nodeMesh.position.copy(nodeData.position);
    nodeMesh.name = nodeData.name;
    nodeMesh.userData = {
      content: nodeData.content,
      image: nodeData.image,
    };

    scene.add(nodeMesh);
    clickableNodes.push(nodeMesh);

    // 숨쉬는 애니메이션
    gsap.to(nodeMesh.scale, {
      x: 1.5,
      y: 1.5,
      z: 1.5,
      duration: 1.5,
      repeat: -1,
      yoyo: true,
      ease: "sine.inOut",
    });
  });
}

// ===============================
// 5. 뇌 GLTF 모델 로드
// ===============================
function loadBrainModel() {
  const loader = new GLTFLoader();

  loader.load(
    "models/scene.gltf",
    (gltf) => {
      const model = gltf.scene;

      pointsGroup = new THREE.Group();
      const linesGroup = new THREE.Group();

      model.traverse((object) => {
        if (object.isMesh) {
          const pointsMaterial = new THREE.PointsMaterial({
            color: 0xffffff,
            size: 0.03,
            blending: THREE.AdditiveBlending,
            transparent: true,
            opacity: 0.75,
            sizeAttenuation: true,
          });
          const points = new THREE.Points(object.geometry, pointsMaterial);
          pointsGroup.add(points);

          const lineMaterial = new THREE.LineBasicMaterial({
            color: 0xffffff,
            transparent: true,
            opacity: 0.1,
          });
          const wireframeGeom = new THREE.WireframeGeometry(object.geometry);
          const lines = new THREE.LineSegments(wireframeGeom, lineMaterial);
          linesGroup.add(lines);

          object.visible = false;
        }
      });

      pointsGroup.rotation.x = -Math.PI / 2;
      linesGroup.rotation.x = -Math.PI / 2;

      scene.add(pointsGroup);
      scene.add(linesGroup);

      createMemoryNodes();

      const startScreen = document.getElementById("start-screen");
      startScreen.addEventListener("click", startExploration);
    },
    undefined,
    (error) => {
      console.error("모델 로딩 중 에러:", error);
    }
  );
}

// ===============================
// 6. 탐사 시작 (카메라 줌인 + 컨트롤 세팅 + FP HUD 활성화)
// ===============================
function startExploration() {
  const startScreen = document.getElementById("start-screen");
  const titleBox = document.getElementById("title-box");
  const subtitleBox = document.getElementById("subtitle-box");
  const hud = document.getElementById("hud");
  const devConsole = document.getElementById("dev-console");
  const fpUi = document.getElementById("fp-ui");

  const tl = gsap.timeline();

  // 0) 인트로 UI 전부 아래로 쑥 내려가면서 사라지기
  [startScreen, titleBox, subtitleBox].forEach((el) => {
    if (!el) return;
    tl.to(
      el,
      {
        y: 80,              // 아래로 80px
        opacity: 0,
        duration: 0.45,
        ease: "power2.in",
        onComplete: () => {
          el.style.display = "none";
        },
      },
      0 // 동시에 같이 움직이게
    );
  });

  // 1) 카메라 줌인
  tl.to(
    camera.position,
    {
      x: TARGET_POSITION.x,
      y: TARGET_POSITION.y,
      z: TARGET_POSITION.z,
      duration: 4,
      ease: "power3.inOut",
      onUpdate: () => {
        if (pointsGroup) {
          camera.lookAt(pointsGroup.position);
        } else {
          camera.lookAt(0, 0, 0);
        }
      },
    },
    0.1 // 인트로가 살짝 내려가기 시작하면 바로 줌인
  );

  // 2) 뇌 살짝 확대
  if (pointsGroup) {
    tl.to(
      pointsGroup.scale,
      {
        x: 1.2,
        y: 1.2,
        z: 1.2,
        duration: 4,
        ease: "power3.inOut",
      },
      0.1
    );
  }

  // 3) 줌인 끝날 즈음: 컨트롤 세팅 + HUD / DEV 콘솔 / FP UI 등장
  tl.call(() => {
    setupControls();

    if (fpUi) {
      fpUi.classList.add("active"); // 십자선 HUD 페이드 인
    }

    // HUD + DEV 콘솔 왼쪽에서 슥 들어옴
    const uiToShow = [];
    if (hud) uiToShow.push(hud);
    if (devConsole) uiToShow.push(devConsole);

    if (uiToShow.length > 0) {
      gsap.fromTo(
        uiToShow,
        { x: -40, opacity: 0 },
        {
          x: 0,
          opacity: 1,
          duration: 0.35,
          ease: "power2.out",
          onStart: () => {
            uiToShow.forEach((el) => (el.style.pointerEvents = "auto"));
          },
        }
      );
    }
  });
}


// ===============================
// 7. OrbitControls + 이벤트 세팅
// ===============================
function setupControls() {
  controls = new OrbitControls(camera, renderer.domElement);

  controls.enableDamping = true;
  controls.dampingFactor = 0.05;

  if (pointsGroup) {
    controls.target.copy(pointsGroup.position);
  } else {
    controls.target.set(0, 0, 0);
  }

  controls.enablePan = false;
  controls.enableRotate = true;
  controls.rotateSpeed = 1.0;
  controls.enableZoom = true;
  controls.autoRotate = false;

  controls.mouseButtons = {
    LEFT: THREE.MOUSE.ROTATE,
    MIDDLE: THREE.MOUSE.DOLLY,
    RIGHT: THREE.MOUSE.DOLLY,
  };

  const canvas = document.querySelector("#canvas");
  canvas.addEventListener("click", onCanvasClick);
  canvas.addEventListener("mousemove", onCanvasMouseMove);
  canvas.addEventListener("mouseleave", onCanvasMouseLeave);

  window.addEventListener("keydown", onKeyDown);
  window.addEventListener("keyup", onKeyUp);

  document
    .getElementById("close-dashboard")
    .addEventListener("click", closeDashboard);
}

// ===============================
// 8. 키보드 입력 처리
// ===============================
function onKeyDown(event) {
  if (isDashboardOpen.value) return;

  if (keyState.hasOwnProperty(event.code)) {
    keyState[event.code] = true;
  }
}

function onKeyUp(event) {
  if (keyState.hasOwnProperty(event.code)) {
    keyState[event.code] = false;
  }
}

// 🔍 현재 호버 중인 노드
let hoveredNode = null;

// 마우스 움직일 때: 노드 위에 있으면 이미지 프리뷰
function onCanvasMouseMove(event) {
  if (isDashboardOpen.value) return;

  mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
  mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;

  raycaster.setFromCamera(mouse, camera);
  const intersects = raycaster.intersectObjects(clickableNodes);

  if (intersects.length > 0) {
    const node = intersects[0].object;
    hoveredNode = node;
    updateNodePreview(node);
  } else {
    hoveredNode = null;
    hideNodePreview();
  }
}

function onCanvasMouseLeave() {
  hoveredNode = null;
  hideNodePreview();
}

// 노드 기준으로 화면상 위치 계산해서 프리뷰 띄우기
function updateNodePreview(node) {
  const preview = document.getElementById("node-preview");
  const img = document.getElementById("node-preview-img");
  if (!preview || !img) return;

  if (node.userData.image) {
    img.src = node.userData.image;
    img.style.backgroundColor = "transparent";
  } else {
    img.removeAttribute("src");
    img.style.backgroundColor = "#444";
  }

  const vector = node.position.clone().project(camera);
  const halfW = window.innerWidth / 2;
  const halfH = window.innerHeight / 2;

  const screenX = vector.x * halfW + halfW;
  const screenY = -vector.y * halfH + halfH;

  preview.style.left = screenX + 20 + "px";
  preview.style.top = screenY - 20 + "px";

  preview.classList.remove("hidden");
  preview.style.opacity = 1;
}

function hideNodePreview() {
  const preview = document.getElementById("node-preview");
  if (!preview) return;
  preview.classList.add("hidden");
  preview.style.opacity = 0;
}

// ===============================
// 9. WASD 이동 (뇌 밖으로 못 나가게)
// ===============================
function handleMovement() {
  if (!controls || isDashboardOpen.value) return;

  const forward = new THREE.Vector3();
  camera.getWorldDirection(forward);
  forward.y = 0;
  forward.normalize();

  const right = new THREE.Vector3();
  right.crossVectors(forward, camera.up).normalize();

  const move = new THREE.Vector3();

  if (keyState.KeyW) move.add(forward);
  if (keyState.KeyS) move.sub(forward);
  if (keyState.KeyA) move.sub(right);
  if (keyState.KeyD) move.add(right);

  if (move.lengthSq() > 0) {
    move.normalize().multiplyScalar(moveSpeed);

    const nextPos = camera.position.clone().add(move);

    nextPos.x = THREE.MathUtils.clamp(nextPos.x, -BOUNDS.x, BOUNDS.x);
    nextPos.y = THREE.MathUtils.clamp(nextPos.y, -BOUNDS.y, BOUNDS.y);
    nextPos.z = THREE.MathUtils.clamp(nextPos.z, -BOUNDS.z, BOUNDS.z);

    const appliedDelta = nextPos.clone().sub(camera.position);

    camera.position.copy(nextPos);
    controls.target.add(appliedDelta);
  }
}

// ===============================
// 10. HUD: 노드 거리 표시
// ===============================
function updateHUD() {
  const distanceLabel = document.getElementById("distance-label");
  if (!distanceLabel || clickableNodes.length === 0) return;

  let minDist = Infinity;

  clickableNodes.forEach((node) => {
    const dist = camera.position.distanceTo(node.position);
    if (dist < minDist) minDist = dist;
  });

  if (minDist === Infinity) {
    distanceLabel.textContent = "NODE DISTANCE: --";
  } else {
    const rounded = Math.round(minDist);
    distanceLabel.textContent = `NODE DISTANCE: ${rounded}`;
  }
}

// ===============================
// 11. 시계 (오늘 날짜 + 시간)
// ===============================
function startClock() {
  const clockEl = document.getElementById("clock");
  if (!clockEl) return;

  function update() {
    const now = new Date();

    const yyyy = now.getFullYear();
    const mm = String(now.getMonth() + 1).padStart(2, "0");
    const dd = String(now.getDate()).padStart(2, "0");
    const hh = String(now.getHours()).padStart(2, "0");
    const mi = String(now.getMinutes()).padStart(2, "0");
    const ss = String(now.getSeconds()).padStart(2, "0");

    clockEl.textContent = `${yyyy}-${mm}-${dd} ${hh}:${mi}:${ss}`;
  }

  update();
  setInterval(update, 1000);
}

// ===============================
// 12. Raycasting (노드 클릭 → 대시보드 오픈)
// ===============================
function onCanvasClick(event) {
  if (isDashboardOpen.value) return;

  mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
  mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;

  raycaster.setFromCamera(mouse, camera);
  const intersects = raycaster.intersectObjects(clickableNodes);

  if (intersects.length > 0) {
    const node = intersects[0].object;
    openDashboardWithAnimation(node);
  }
}

// 노드 클릭 시: 프리뷰 → 중앙 확대 → HUD / FP-UI / DEV 패널 사라지고 대시보드 등장
function openDashboardWithAnimation(node) {
  const overlay = document.getElementById("dashboard-overlay");
  const contentDiv = document.getElementById("dashboard-content");
  const hud = document.getElementById("hud");
  const fpUi = document.getElementById("fp-ui");
  const preview = document.getElementById("node-preview");
  const img = document.getElementById("node-preview-img");
  const devConsole = document.getElementById("dev-console"); // 개발자 패널

  // 대시보드 내용 세팅
  contentDiv.innerHTML = node.userData.content;

  // 프리뷰 이미지 세팅
  if (img && node.userData.image) {
    img.src = node.userData.image;
  }

  if (preview) {
    preview.classList.remove("hidden");
    preview.style.opacity = 1;
  }

  overlay.classList.remove("hidden");

  const tl = gsap.timeline({
    onComplete: () => {
      isDashboardOpen.value = true;
    },
  });

  // 1) 프리뷰 이미지를 화면 중앙으로 이동 + 확대
  if (preview) {
    tl.to(preview, {
      duration: 0.5,
      left: "50%",
      top: "50%",
      xPercent: -50,
      yPercent: -50,
      scale: 1.8,
      ease: "none",   // ← 기계적인 느낌 (linear)
    });
  }

  // 2) HUD + DEV-CONSOLE → 왼쪽으로 슬라이드 + 페이드아웃
  const slideOutTargets = [];
  if (hud) slideOutTargets.push(hud);
  if (devConsole) slideOutTargets.push(devConsole);

  if (slideOutTargets.length > 0) {
    tl.to(
      slideOutTargets,
      {
        duration: 0.35,
        opacity: 0,
        x: -40,          // ← 왼쪽으로 슥
        ease: "none",    // ← 직선적인 인터랙션
      },
      "<"               // 프리뷰 움직임과 동시에
    );
  }

  // 3) FP-UI는 위치 고정, **투명도만 0으로**
  if (fpUi) {
    tl.to(
      fpUi,
      {
        duration: 0.35,
        opacity: 0,
        ease: "none",
      },
      "<" // 같은 타이밍
    );
  }

  // 4) 프리뷰 살짝 어두워지며 페이드아웃
  if (preview) {
    tl.to(preview, {
      duration: 0.25,
      opacity: 0,
      ease: "none",
    });
  }

  // 5) 대시보드 배경 + 콘텐츠 직선 슬라이드 인
  tl.fromTo(
    overlay,
    { opacity: 0 },
    { opacity: 1, duration: 0.35, ease: "none" },
    "-=0.1"
  );

  tl.fromTo(
    overlay,
    { xPercent: -8 },
    { xPercent: 0, duration: 0.35, ease: "none" },
    "-=0.35"
  );

  tl.fromTo(
    contentDiv,
    { xPercent: 10, opacity: 0 },
    { xPercent: 0, opacity: 1, duration: 0.35, ease: "none" },
    "-=0.3"
  );

  // 마지막에 프리뷰는 완전 초기화
  tl.set(preview, {
    opacity: 0,
    clearProps: "left,top,transform",
  });
}


function closeDashboard() {
  const overlay = document.getElementById("dashboard-overlay");
  const hud = document.getElementById("hud");
  const fpUi = document.getElementById("fp-ui");
  const devConsole = document.getElementById("dev-console");

  const tl = gsap.timeline({
    onComplete: () => {
      overlay.classList.add("hidden");
      isDashboardOpen.value = false;
    },
  });

  // 1) 대시보드 페이드아웃
  tl.to(overlay, {
    duration: 0.35,
    opacity: 0,
    ease: "none",
  });

  // 2) HUD + DEV-CONSOLE: 왼쪽에서 슥 들어오기
  const slideInTargets = [];
  if (hud) slideInTargets.push(hud);
  if (devConsole) slideInTargets.push(devConsole);

  if (slideInTargets.length > 0) {
    tl.fromTo(
      slideInTargets,
      { opacity: 0, x: -40 },
      {
        opacity: 1,
        x: 0,
        duration: 0.35,
        ease: "none",
      },
      "-=0.2"
    );
  }

  // 3) FP-UI: 위치 고정, 투명도만 다시 1
  if (fpUi) {
    tl.fromTo(
      fpUi,
      { opacity: 0 },
      {
        opacity: 0.85,
        duration: 0.35,
        ease: "none",
      },
      "-=0.25"
    );
  }

  if (hud) hud.classList.remove("fade-out");
}

// ===============================
// 13. 렌더링 루프
// ===============================
function animate() {
  requestAnimationFrame(animate);

  if (starfield) {
    starfield.rotation.x += starSpeed.x;
    starfield.rotation.y += starSpeed.y;
  }

  if (controls) {
    controls.update();
    handleMovement();
    updateHUD();
  }

  renderer.render(scene, camera);
}

// ===============================
// 14. 창 크기 변경 대응
// ===============================
function onWindowResize() {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
}

// ===============================
// 15. DEV CONSOLE: PARAM LAB
// ===============================

// 버튼 연결
const devRunBtn = document.getElementById("dev-run");
if (devRunBtn) {
  devRunBtn.addEventListener("click", runDevScript);
}

// textarea 내용 한 줄씩 읽어서 scene.bg(...), brain.moveTo(...)
// 이런 "가짜 코드"를 파싱하는 함수
function runDevScript() {
  const textarea = document.getElementById("dev-input");
  if (!textarea) return;

  const lines = textarea.value.split("\n");

  lines.forEach((rawLine) => {
    const line = rawLine.trim();
    if (!line) return;
    if (line.startsWith("//")) return;

    const match = /^(\w+)\.(\w+)\((.*)\)$/.exec(line);
    if (!match) return;

    const objName = match[1];
    const methodName = match[2];
    const argString = match[3].trim();

    const args = argString.length
      ? argString
          .split(",")
          .map((s) => s.trim())
          .filter((s) => s.length > 0)
          .map((token) => {
            if (
              (token.startsWith('"') && token.endsWith('"')) ||
              (token.startsWith("'") && token.endsWith("'"))
            ) {
              return token.slice(1, -1);
            }
            const num = Number(token);
            if (!Number.isNaN(num)) return num;
            return token;
          })
      : [];

    applyDevCall(objName, methodName, args);
  });
}

// 실제로 장면에 적용하는 부분
function applyDevCall(obj, method, args) {
  // 1) scene.bg("#020617") → 배경색 변경
  if (obj === "scene" && method === "bg" && typeof args[0] === "string") {
    try {
      scene.background = new THREE.Color(args[0]);
      document.body.style.backgroundColor = args[0];
    } catch (e) {
      // 색 코드 이상하면 무시
    }
    return;
  }

  // 2) brain.moveTo(x, y, z) / brain.offset(dx, dy, dz)
  if (obj === "brain" && pointsGroup) {
    if (method === "moveTo") {
      const [x, y, z] = args;
      if (typeof x === "number") pointsGroup.position.x = x;
      if (typeof y === "number") pointsGroup.position.y = y;
      if (typeof z === "number") pointsGroup.position.z = z;
      return;
    }
    if (method === "offset") {
      const [dx, dy, dz] = args;
      if (typeof dx === "number") pointsGroup.position.x += dx;
      if (typeof dy === "number") pointsGroup.position.y += dy;
      if (typeof dz === "number") pointsGroup.position.z += dz;
      return;
    }
  }

  // 3) player.speed(0.25) → WASD 이동 속도
  if (obj === "player" && method === "speed" && typeof args[0] === "number") {
    moveSpeed = args[0];
    return;
  }

  // 4) stars.spin(0.00008, 0.0001) → 별 회전 속도
  if (obj === "stars" && method === "spin") {
    const [sx, sy] = args;
    if (typeof sx === "number") starSpeed.x = sx;
    if (typeof sy === "number") starSpeed.y = sy;
    return;
  }

  // 5) bounds.cage(60) → 뇌 안 이동 가능한 박스 크기
  if (obj === "bounds" && method === "cage" && typeof args[0] === "number") {
    const v = Math.abs(args[0]);
    BOUNDS.x = v;
    BOUNDS.y = v;
    BOUNDS.z = v;
    return;
  }
}
