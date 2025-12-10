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
let starSpeed = { x: 0.00005, y: 0.00007 }; // 별 회전 속도
let pointsGroup; // 뇌 포인트 클라우드
let brainRoot = null;

// 🔊 BGM 관련
let bgm = null;
let isBgmOn = false;
let musicToggle = null;
let musicIcon = null;

const clickableNodes = []; // 기억 노드들 (Raycasting 대상)
const keywordLabelGroups = []; // 각 노드별 키워드 라벨 모음
const _tmpWorldPos = new THREE.Vector3();
// 🔹 스크롤 섹션별 브레인 포즈 (카메라는 고정, 브레인만 슬라이드)
const SCENE_POSES = {
  hero: {
    brainPos: { x: -20, y: -20, z: 200 },      // 화면 중앙
    brainRot: { x: -Math.PI / 2, y: 1.5, z: 1 },
  },
  sec1: {
    brainPos: { x: -130, y: -40, z: 220 },    // 화면 왼쪽으로
    brainRot: { x: -Math.PI / 2, y: 2, z: 2 },
  },
  sec2: {
    brainPos: { x: 130, y: 40, z: 220 },     // 화면 오른쪽으로
    brainRot: { x: -Math.PI / 1, y: 4, z: 2 },
  },
  sec3: {
    brainPos: { x: 0, y: -20, z: 200 },     // 다시 중앙 + 살짝 위로
    brainRot: { x: -Math.PI / 2, y: 0.0, z: 0.0 },
  },
};

const EXPLORATION_POSE = {
  pos:  { x: 0, y: 0, z: 0 },                // 뇌를 딱 중앙에
  rot:  { x: -Math.PI / 2, y: 0, z: 0 },   // 위에서 살짝 기울어진 느낌
  scale: 2,                               // 조금만 키워서 꽉 찬 느낌
};

// WASD 상태
const keyState = {
  KeyW: false,
  KeyA: false,
  KeyS: false,
  KeyD: false,
};

// 이동 속도
let moveSpeed = 0.3;

// 카메라가 돌아다닐 수 있는 뇌 안쪽 범위
const BOUNDS = {
  x: 220,
  y: 180,
  z: 220,
};

const isDashboardOpen = { value: false }; // 대시보드 열려 있을 때 이동/클릭 막기용
const TARGET_POSITION = new THREE.Vector3(0, 0, 50); // 줌인 후 카메라 위치

// 🔹 스크롤-씬용 상태
let isExploring = false; // 자유 탐사 모드 진입 플래그
let scrollSceneObserver = null; // 지금은 안 쓰지만 남겨둠 (startExploration에서 disconnect만 함)

// 기억 노드 생성 여부 (3D 진입 후에만 만들기)
let memoryNodesCreated = false;

// Raycaster (노드 클릭용)
const raycaster = new THREE.Raycaster();
const mouse = new THREE.Vector2();

// 🔹 대시보드용 미니 3D 씬
let miniRenderer = null;
let miniScene = null;
let miniCamera = null;
let miniNodeRoot = null;

// 🔹 요약 텍스트 타이핑 타이머
let summaryTypeTimer = null;

let currentLobeId = null;
let lobeBannerTimer = null;





// 🔹 HUD DOM 요소 (우측 패널 + 좌측 텍스트)
const hudX = document.getElementById("hud-x");
const hudY = document.getElementById("hud-y");
const hudZ = document.getElementById("hud-z");
const hudDepth = document.getElementById("hud-depth");
const hudDistance = document.getElementById("hud-distance");
const distanceLabel = document.getElementById("distance-label");
const sidePanel = document.querySelector(".fp-side-panel");
const nodeProximityHud = document.getElementById("node-proximity-alert");
// 🔹 엽 배너 DOM
const lobeBanner = document.getElementById("lobe-banner");


// 🔹 뇌 영역(엽) 정의
const LOBES = {
  frontal: {
    id: "frontal",
    label: "FRONTAL LOBE // 전두엽",
    // 전두엽용 노드 위치 (대충 앞쪽 + 약간 위) → 나중에 숫자 조절해도 됨
    nodePos: new THREE.Vector3(0, 25, 30),
  },
  occipital: {
    id: "occipital",
    label: "OCCIPITAL LOBE // 후두엽",
    nodePos: new THREE.Vector3(0, 25, -30),
  },
  parietal: {
    id: "parietal",
    label: "PARIETAL LOBE // 두정엽",
    nodePos: new THREE.Vector3(0, 45, 0),
  },
  temporal: {
    id: "temporal",
    label: "TEMPORAL LOBE // 측두엽",
    nodePos: new THREE.Vector3(0, -5, 0),
  },
};





// ===============================
// 0.3 dev-console 보정 함수
// ===============================
function ensureDevConsoleOnTop() {
  const devConsole = document.getElementById("dev-console");
  if (!devConsole) return null;

  // site-shell 같은 래퍼 안에 있으면 강제로 body로 이동
  if (devConsole.parentElement !== document.body) {
    document.body.appendChild(devConsole);
  }

  devConsole.style.position = "fixed";
  devConsole.style.zIndex = "9999";
  devConsole.style.display = "block";

  return devConsole;
}

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

  const overlay = document.getElementById("dashboard-overlay");
  if (overlay) {
    overlay.classList.add("hidden");
    overlay.style.opacity = 0;
  }

  const devConsole = ensureDevConsoleOnTop();
  if (devConsole) {
    devConsole.style.opacity = 0;
    devConsole.style.pointerEvents = "none";
    devConsole.style.transform = "translateY(20px)";
  }

  // 🔊 음악 토글 셋업
  musicToggle = document.getElementById("music-toggle");
  if (musicToggle) {
    musicIcon = musicToggle.querySelector(".music-icon");

    bgm = new Audio("./audio/music.mp3");
    bgm.loop = true;
    bgm.volume = 0.5;

    // 초기 상태
    isBgmOn = false;
    musicToggle.dataset.state = "off";

    musicToggle.addEventListener("click", (e) => {
      e.stopPropagation();

      // 살짝 눌리는 효과
      if (musicIcon) {
        musicIcon.style.opacity = 0.6;
        musicIcon.style.transform = "scale(0.8)";
      }

      setTimeout(() => {
        // 상태 먼저 토글
        isBgmOn = !isBgmOn;
        musicToggle.dataset.state = isBgmOn ? "on" : "off";

        // BGM 재생/정지
        if (bgm) {
          if (isBgmOn) {
            bgm.play().catch(() => {
              console.warn("BGM 재생 실패");
            });
          } else {
            bgm.pause();
          }
        }

        // 아이콘 복귀
        if (musicIcon) {
          musicIcon.style.opacity = 1;
          musicIcon.style.transform = "scale(1)";
        }
      }, 120);
    });
  }

  // 🔻 three.js 초기화
  renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: true,
    alpha: true,
  });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(window.devicePixelRatio);

  // 🔦 전체 밝기 살짝 낮추기 (색은 유지)
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.7; // 숫자 낮을수록 전체 어두워짐

  if (canvas) {
    canvas.addEventListener("click", onCanvasClick);
    canvas.addEventListener("mousemove", onCanvasMouseMove);
    canvas.addEventListener("mouseleave", onCanvasMouseLeave);
  }

  window.addEventListener("keydown", onKeyDown);
  window.addEventListener("keyup", onKeyUp);

  const closeBtn = document.getElementById("close-dashboard");
  if (closeBtn) {
    closeBtn.addEventListener("click", closeDashboard);
  }

  scene = new THREE.Scene();
  scene.background = new THREE.Color("#000000");

  camera = new THREE.PerspectiveCamera(
    50,
    window.innerWidth / window.innerHeight,
    0.1,
    2000
  );
  camera.position.set(0, 0, 400);
  camera.lookAt(0, 0, 0);

  const ambientLight = new THREE.AmbientLight(0xffffff, 0.2);
  scene.add(ambientLight);

  const directionalLight = new THREE.DirectionalLight(0xffffff, 0.5);
  directionalLight.position.set(1, 1, 1);
  scene.add(directionalLight);

  createStarfield();
  loadBrainModel(); // 뇌 로딩 (스크롤 구간에서는 배경 느낌)
  setupScrollScenes(); 

  startClock();

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
    // 전두엽
    lobeId: "frontal",
    position: LOBES.frontal.nodePos.clone(),
    keywords: [
      {
        key: "cake",
        label: "cake",             
        image: "images/cake.png",
        summary: "생일 때마다 커스텀 케이크를 챙겨 주는 친구들",
      },
      {
        key: "item",
        label: "item",             
        image: "images/item.png",
        summary: "우정반지, 우정목걸이, 우정티셔츠, 우정모자, 우정타투... etc",
      },
    ],
    summaryTitle: "FRONTAL LOBE",
    summaryText:
      "장기 계획, 사이드 프로젝트, 미래 설계와 관련된 기억들을 저장하는 영역.",
    
    content: `<p>전두엽: 편도체가 감정 강도를 높여 저장 우선순위를 끌어올리고,
전두엽은 그 경험을 ‘앞으로 어떤 관계를 이어갈지, 어떤 사람이 되고 싶은지’ 같은
미래 방향성과 연결합니다. 그런 친구들에 관한 기억입니다.</p>`,
    coreStyle: {
      shape: "sphere",
      size: 0.8,
      color: 0x38bdf8,
      opacity: 0.45,
    },
    satelliteStyle: { color: 0x66d9ff, size: 0.16, opacity: 0.85 },
    labelStyle: {
      color: "#c6e6ff",
      fontSize: "11px",
      className: "label-frontal",
    },
  },
  {
  // 두정엽
  lobeId: "parietal",
  position: LOBES.parietal.nodePos.clone(),
  keywords: [
    {
      key: "home",
      label: "home",
      image: "images/home.png",
      summary: "가장 좋아하는 공간을 뽑으라고 한다면 무조건 집, 침대. 작업할 때도 나는 침대 위에서 해서 친구한테 좀 일어나라는 잔소리를 많이 듣는다.",
    },
    {
      key: "school",
      label: "school",
      image: "images/school.png",
      summary: "사실 우리 학교보다 야작을 더 많이 하러 가는 학교가 따로 있어서 살짝 웃기고 아이러니 하게 되었다. 그렇지만 이상하게 우리 학교 야작하기는 싫어서...",
    },
    {
      key: "bubble",
      label: "bubble",
      image: "images/bubble.png",
      summary: "디자인관 5층 테라스는 보통 담배 피우는 곳으로 많이 생각하고 있겠지만 나는 비눗방울을 부는 곳이기도 했다. 햇빛 내리쬐고 바람 불 때 테라스에서 비눗방울 불면 재밌다.",
    },
  ],
  summaryTitle: "PARIETAL LOBE",
  summaryText: "공간에 대한 기억이 저장되어 있는 영역",
  content: `<p>두정엽: 크게 드라마틱하지도 않은데 그냥 당장 생각나는 곳들 </p>`,
  coreStyle: {
    shape: "sphere",
    size: 0.8,
    color: 0xfacc15,
    opacity: 0.45,
  },
  satelliteStyle: { color: 0xffe580, size: 0.16, opacity: 0.85 },
  labelStyle: {
    color: "#fff2c6",
    fontSize: "11px",
    className: "label-parietal",
  },
},


{
  // 측두엽
  lobeId: "temporal",
  position: LOBES.temporal.nodePos.clone(),
  keywords: [
    {
      key: "drum",
      label: "drum",
      image: "images/drum.png",
      summary: "사실 내 전공은 원래 디자인이 아니라 음악이었다.",
    },
    {
      key: "concert",
      label: "concert",
      image: "images/concert.png",
      summary: "이 콘서트 갔다 오고 우즈 오빠 탈덕했어요",
    },
  ],
  summaryTitle: "TEMPORAL LOBE",
  summaryText: "청각적 사고가 얽혀 있는 영역",
  content: `<p>측두엽: 청각, 즉 나에게는 음악과 연결되어 있는 기억이다</p>`,
  coreStyle: {
    shape: "sphere",
    size: 0.8,
    color: 0xfb7185,
    opacity: 0.45,
  },
  satelliteStyle: { color: 0xffa1b8, size: 0.16, opacity: 0.85 },
  labelStyle: {
    color: "#ffd6e1",
    fontSize: "11px",
    className: "label-temporal",
  },
},


{
  // 후두엽
  lobeId: "occipital",
  position: LOBES.occipital.nodePos.clone(),
  keywords: [
    {
      key: "firework",
      label: "firework",
      image: "images/firework.png",
      summary: "일본 오사카 마츠리였는데 불꽃놀이를 정말 정말 정말 크게 한다 하늘이 무너질 것처럼 예뻤다",
    },
    {
      key: "star",
      label: "star",
      image: "images/start.png",
      summary: "강원도에 놀러갔을 때 자고 있었는데 깨워서 밖에 나와보니 북두칠성이 있었다",
    },
    {
      key: "sky",
      label: "sky",
      image: "images/sky.png",
      summary: "그냥 버스 타다가 봤는데 구름 예뻐서 끝",
    },
  ],
  summaryTitle: "OCCIPITAL LOBE",
  summaryText: "시각 처리와 이미지 기반 사고의 기초 구조가 저장된 영역.",
  content: `<p>시각 정보 해석과 이미지 기반 사고의 중심 처리 장치 눈으로 본 것들 중에 가장 기억에 남는 장소들이었다</p>`,
  coreStyle: {
    shape: "sphere",
    size: 0.8,
    color: 0x818cf8,
    opacity: 0.45,
  },
  satelliteStyle: { color: 0xa5b4ff, size: 0.16, opacity: 0.85 },
  labelStyle: {
    color: "#dbe1ff",
    fontSize: "11px",
    className: "label-occipital",
  },
}

]


// ===============================
// 4-A. 키워드 라벨 링 (노드 주변 UI용)
// ===============================
function setupKeywordRing(coreMesh, nodeData) {
  const keywords = nodeData.keywords;
  if (!keywords || keywords.length === 0) return;

  // 🔥 탐사 모드에서는 site-shell이 display:none 될 수 있으니까
  //    라벨은 그냥 body에 직접 붙여버리는 게 안전함
  const uiContainer = document.body;

  const group = { node: coreMesh, labels: [] };
  const labelOpts = nodeData.labelStyle || {};
  const count = keywords.length;

  for (let i = 0; i < count; i++) {
    const k = keywords[i];

    // label이 문자열 / 배열 둘 다 대응
    let labelText;
    if (typeof k === "string") {
      labelText = k;
    } else {
      if (Array.isArray(k.label)) {
        labelText = k.label[0] ?? "";
      } else {
        labelText = k.label ?? "";
      }
    }

    const labelKey =
      typeof k === "string"
        ? k
        : k.key || (Array.isArray(k.label) ? k.label[0] : k.label || "");

    const labelImage = typeof k === "string" ? null : k.image;

    const el = document.createElement("div");
    el.className = "keyword-label";
    if (labelOpts.className) el.classList.add(labelOpts.className);

    el.textContent = labelText;
    el.dataset.nodeName = nodeData.name;
    el.dataset.keywordKey = labelKey;
    if (labelImage) el.dataset.image = labelImage;

    if (labelOpts.color) el.style.color = labelOpts.color;
    if (labelOpts.fontSize) el.style.fontSize = labelOpts.fontSize;

    // 기본 스타일 조금 안전빵으로
    el.style.position = "absolute";
    el.style.pointerEvents = "auto";
    el.style.zIndex = "3000";

    uiContainer.appendChild(el);

    const angle = (i / count) * Math.PI * 2;
    group.labels.push({ el, angle });
  }

  keywordLabelGroups.push(group);
}

// ===============================
// 4-B. 키워드 라벨 위치 업데이트 (일렁이면서 노드 주변 공전)
// ===============================
function updateKeywordLabels(timeSec) {
  if (keywordLabelGroups.length === 0 || !camera) return;

  // 🔥 추가: 탐사 모드 아니거나, 대시보드 열려 있으면 라벨 전부 숨김
  if (!isExploring || isDashboardOpen.value) {
    keywordLabelGroups.forEach((group) => {
      group.labels.forEach(({ el }) => {
        el.style.opacity = 0;
      });
    });
    return;
  }

  const halfW = window.innerWidth / 2;
  const halfH = window.innerHeight / 2;

  // 밑에는 그대로 유지
  keywordLabelGroups.forEach((group) => {
    const { node, labels } = group;

    node.getWorldPosition(_tmpWorldPos);

    const camDist = camera.position.distanceTo(_tmpWorldPos);

    if (camDist > 260) {
      labels.forEach(({ el }) => {
        el.style.opacity = 0;
      });
      return;
    }

    const proj = _tmpWorldPos.clone().project(camera);

    if (proj.z > 1) {
      labels.forEach(({ el }) => {
        el.style.opacity = 0;
      });
      return;
    }

    const baseX = proj.x * halfW + halfW;
    const baseY = -proj.y * halfH + halfH;

    const vis = THREE.MathUtils.clamp(1 - (camDist - 40) / 200, 0.15, 1);

    labels.forEach(({ el, angle }) => {
      const baseRadius = 110;
      const pulseAmp = 30;

      const pulse = Math.sin(timeSec * 1.4 + angle * 2.5) * pulseAmp;
      const r = baseRadius + pulse;

      const sx = baseX + Math.cos(angle) * r;
      const sy = baseY + Math.sin(angle) * r * 0.7;

      el.style.left = `${sx}px`;
      el.style.top = `${sy}px`;
      el.style.opacity = vis;
    });
  });
}


// ===============================
// 4-C. 기억 노드 생성
// ===============================
function createMemoryNodes() {
  const EXPAND_FACTOR = 1.2; // 숫자 올리면 더 멀리 떨어짐 (1.3~2.0 사이로 취향대로)

  MEMORY_NODES.forEach((nodeData) => {
    const group = new THREE.Group();

    // ✅ 원래 좌표에서 바깥으로 조금 더 밀어내기
    const basePos = nodeData.position.clone();
    const expandedPos = basePos.multiplyScalar(EXPAND_FACTOR);
    group.position.copy(expandedPos);


    const coreStyle = nodeData.coreStyle || {};
    const satStyle = nodeData.satelliteStyle || {};

    const coreSize = coreStyle.size ?? 0.55;
    const coreColor = coreStyle.color ?? 0xffffff;
    const coreOpacity = coreStyle.opacity ?? 0.28;
    const coreShape = coreStyle.shape ?? "sphere";

    const satColor = satStyle.color ?? 0xffffff;
    const satSize = satStyle.size ?? 0.12;
    const satOpacity = satStyle.opacity ?? 0.55;

    let coreGeo;
    switch (coreShape) {
      case "cube":
        coreGeo = new THREE.BoxGeometry(coreSize, coreSize, coreSize);
        break;
      case "diamond":
        coreGeo = new THREE.OctahedronGeometry(coreSize);
        break;
      case "sphere":
      default:
        coreGeo = new THREE.SphereGeometry(coreSize, 24, 24);
        break;
    }

    const coreMat = new THREE.MeshBasicMaterial({
      color: coreColor,
      transparent: true,
      opacity: coreOpacity,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });

    const coreMesh = new THREE.Mesh(coreGeo, coreMat);
    coreMesh.name = nodeData.name;
    coreMesh.userData = {
      content: nodeData.content,
      image: nodeData.image || nodeData.baseImage,
      nodeData,
    };
    group.add(coreMesh);

    const satelliteCount = 70;
    const satPositions = new Float32Array(satelliteCount * 3);
    const satVecs = [];

    for (let i = 0; i < satelliteCount; i++) {
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      const dir = new THREE.Vector3(
        Math.sin(phi) * Math.cos(theta),
        Math.sin(phi) * Math.sin(theta),
        Math.cos(phi)
      );

      const radius = THREE.MathUtils.randFloat(4, 16);
      dir.multiplyScalar(radius);

      satVecs.push(dir.clone());
      const idx = i * 3;
      satPositions[idx] = dir.x;
      satPositions[idx + 1] = dir.y;
      satPositions[idx + 2] = dir.z;
    }

    const satGeo = new THREE.BufferGeometry();
    satGeo.setAttribute("position", new THREE.BufferAttribute(satPositions, 3));

    const satMat = new THREE.PointsMaterial({
      color: satColor,
      size: satSize,
      transparent: true,
      opacity: satOpacity,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });

    const satellites = new THREE.Points(satGeo, satMat);
    group.add(satellites);

    const coreLinks = satelliteCount;
    const extraLinks = Math.floor(satelliteCount * 0.8);
    const segmentCount = coreLinks + extraLinks;
    const linePositions = new Float32Array(segmentCount * 2 * 3);

    let offset = 0;

    for (let i = 0; i < satelliteCount; i++) {
      const v = satVecs[i];

      linePositions[offset++] = 0;
      linePositions[offset++] = 0;
      linePositions[offset++] = 0;

      linePositions[offset++] = v.x;
      linePositions[offset++] = v.y;
      linePositions[offset++] = v.z;
    }

    for (let i = 0; i < extraLinks; i++) {
      const a = Math.floor(Math.random() * satelliteCount);
      const b = Math.floor(Math.random() * satelliteCount);
      if (a === b) continue;

      const va = satVecs[a];
      const vb = satVecs[b];

      linePositions[offset++] = va.x;
      linePositions[offset++] = va.y;
      linePositions[offset++] = va.z;

      linePositions[offset++] = vb.x;
      linePositions[offset++] = vb.y;
      linePositions[offset++] = vb.z;
    }

    const lineGeo = new THREE.BufferGeometry();
    lineGeo.setAttribute(
      "position",
      new THREE.BufferAttribute(linePositions, 3)
    );

    const lineMat = new THREE.LineBasicMaterial({
      color: satColor,
      transparent: true,
      opacity: 0.35,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });

    const filaments = new THREE.LineSegments(lineGeo, lineMat);
    group.add(filaments);

    gsap.to(group.scale, {
      x: 1.45,
      y: 1.45,
      z: 1.45,
      duration: 2.0,
      repeat: -1,
      yoyo: true,
      ease: "sine.inOut",
    });

    gsap.to(group.rotation, {
      y: "+=" + Math.PI * 2,
      duration: 26,
      repeat: -1,
      ease: "none",
    });
    gsap.to(group.rotation, {
      x: "+=" + Math.PI * 2,
      duration: 40,
      repeat: -1,
      ease: "none",
    });

    setupKeywordRing(coreMesh, nodeData);

    scene.add(group);
    clickableNodes.push(coreMesh);
  });
}

function resetBrainForExploration() {
  if (!brainRoot) return;

  // 혹시 남아있을 트윈/좌표 조작 싹 끊기
  gsap.killTweensOf(brainRoot.position);
  gsap.killTweensOf(brainRoot.rotation);
  gsap.killTweensOf(brainRoot.scale);

  const p = EXPLORATION_POSE.pos;
  const r = EXPLORATION_POSE.rot;
  const s = EXPLORATION_POSE.scale;

  // 🔁 탐사용 기본 위치/각도로 “스냅 리셋”
  brainRoot.position.set(p.x, p.y, p.z);
  brainRoot.rotation.set(r.x, r.y, r.z);
  brainRoot.scale.set(s, s, s);
}


// ===============================
// 5. 뇌 GLTF 모델 로드
// ===============================
function loadBrainModel() {
  const loader = new GLTFLoader();

  loader.load("models/scene.gltf", (gltf) => {
    const model = gltf.scene;

    // 🔹 모델 전체 transform bake 전에 확정
    model.updateMatrixWorld(true);

    // 뇌 전체 그룹
    brainRoot = new THREE.Group();
    brainRoot.name = "brainRoot";

    pointsGroup = new THREE.Group();
    pointsGroup.name = "brainPoints";

    const linesGroup = new THREE.Group();
    linesGroup.name = "brainLines";

    model.traverse((object) => {
      if (!object.isMesh) return;

      // 🔥 geometry를 월드 좌표 기준으로 완전히 bake
      const baked = object.geometry.clone();
      baked.applyMatrix4(object.matrixWorld);

      // ==== POINTS ====
      const pm = new THREE.PointsMaterial({
        color: 0xffffff,
        size: 0.03,
        blending: THREE.AdditiveBlending,
        transparent: true,
        opacity: 0.03,
        sizeAttenuation: true,
        depthWrite: false,
      });
      const pts = new THREE.Points(baked, pm);
      pointsGroup.add(pts);

      // ==== WIREFRAME ====
      const wf = new THREE.WireframeGeometry(baked);
      const lm = new THREE.LineBasicMaterial({
        color: 0xffffff,
        transparent: true,
        opacity: 0.03,
        depthWrite: false,
      });
      const lineMesh = new THREE.LineSegments(wf, lm);
      linesGroup.add(lineMesh);

      // 원본은 숨기기
      object.visible = false;
    });

    // 🔥 baked 된 geometry들에만 회전/위치/스케일 적용
    brainRoot.rotation.x = -Math.PI / 2;
    brainRoot.position.set(0, 0, 0);
    brainRoot.scale.set(1, 1, 1);

    brainRoot.add(pointsGroup);
    brainRoot.add(linesGroup);
    scene.add(brainRoot);

    // depth 문제 보정
    brainRoot.traverse((obj) => {
      if (obj.material) {
        obj.material.depthTest = true;
        obj.material.depthWrite = false;
      }
    });

    // ❌ 스크롤 구간에서는 기억 노드 안 만들고, 뇌만 “배경 오브젝트”로 사용
    // createMemoryNodes();

    // ❌ 섹션별 포즈 없음 → 처음엔 기본 포즈로만 두기
    goToScenePose("hero");

    // 시작 화면 클릭 이벤트 (있으면 사용, 없어도 무관)
    const startScreen = document.getElementById("start-screen");
    if (startScreen) {
      startScreen.addEventListener("click", startExploration);
    }
  });
}

// ===============================
// 스크롤 섹션 → 브레인 포즈 전환
// ===============================
// ===============================
// 스크롤 섹션 → 브레인 포즈 전환 (스냅 느낌으로 빠르게)
// ===============================
function goToScenePose(key, sectionId) {
  if (!brainRoot) return;
  if (isExploring) return;

  const pose = SCENE_POSES[key];
  if (!pose) return;

  const { brainPos, brainRot } = pose;

  gsap.to(brainRoot.position, {
    x: brainPos.x,
    y: brainPos.y,
    z: brainPos.z,
    duration: 1.2,
    ease: "power2.out",
    overwrite: "auto",
    onComplete: () => {
      if (sectionId) {
        setActiveSection(sectionId); // 🔥 뇌가 도달한 뒤에 HUD 켜기
      }
    },
  });

  gsap.to(brainRoot.rotation, {
    x: brainRot.x,
    y: brainRot.y,
    z: brainRot.z,
    duration: 0.55,
    ease: "power2.out",
    overwrite: "auto",
  });
}


function setActiveSection(activeId) {
  const allSections = document.querySelectorAll(".nv-section");
  allSections.forEach((sec) => {
    if (sec.id === activeId) {
      sec.classList.add("is-active");
    } else {
      sec.classList.remove("is-active");
    }
  });
}


// ===============================
// 섹션 진입 감지 (IntersectionObserver)
// ===============================
function setupScrollScenes() {
  if (typeof IntersectionObserver === "undefined") return;
  if (!document.getElementById("hero")) return; // 섹션 없으면 그냥 종료

  const hero = document.getElementById("hero");
  const sec1 = document.getElementById("sec-1");
  const sec2 = document.getElementById("sec-2");
  const sec3 = document.getElementById("sec-3");

  const sections = [hero, sec1, sec2, sec3].filter(Boolean);

  // 처음 로드 시 hero 활성화
  setActiveSection("hero");

  const io = new IntersectionObserver(
    (entries) => {
      if (isExploring) return; // 탐사 모드 들어가면 더 이상 스크롤 연동 안 함

      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;

        const id = entry.target.id;

        // 1) 뇌 포즈 스냅
        switch (id) {
          case "hero":
            goToScenePose("hero");
            break;
          case "sec-1":
            goToScenePose("sec1");
            break;
          case "sec-2":
            goToScenePose("sec2");
            break;
          case "sec-3":
            goToScenePose("sec3");
            break;
        }

        // 2) HTML 섹션 활성화 (텍스트 on/off)
        setActiveSection(id);
      });
    },
    {
      threshold: 0.6, // 화면의 60% 이상 보일 때 그 섹션으로 인식
    }
  );

  sections.forEach((el) => io.observe(el));
  scrollSceneObserver = io;
}




// ===============================
// 6. 탐사 시작
// ===============================
function startExploration() {
  document.body.style.overflow = "hidden";
  isExploring = true; // 이 순간부터는 섹션-스크롤 포즈 연동 끔

  // 스크롤 연동 끊기 (지금은 사실 아무것도 안 하긴 함)
  if (scrollSceneObserver) {
    scrollSceneObserver.disconnect();
    scrollSceneObserver = null;
  }

   if (brainRoot) {
    resetBrainForExploration();
  }
  

  const startScreen = document.getElementById("start-screen");
  const titleBox = document.getElementById("title-box");
  const subtitleBox = document.getElementById("subtitle-box");
  const hud = document.getElementById("hud");
  const devConsole = ensureDevConsoleOnTop();
  const fpUi = document.getElementById("fp-ui");

  const tl = gsap.timeline();

  // 시작 오버레이/타이틀 내려가면서 사라지기
  [startScreen, titleBox, subtitleBox].forEach((el) => {
    if (!el) return;
    tl.to(
      el,
      {
        y: 80,
        opacity: 0,
        duration: 0.45,
        ease: "power2.in",
        onComplete: () => {
          el.style.display = "none";
        },
      },
      0
    );
  });

  // 카메라 뇌 쪽으로 줌인
  tl.to(
    camera.position,
    {
      x: TARGET_POSITION.x,
      y: TARGET_POSITION.y,
      z: TARGET_POSITION.z,
      duration: 4,
      ease: "power3.inOut",
      onUpdate: () => {
        if (brainRoot) {
          camera.lookAt(brainRoot.position);
        } else {
          camera.lookAt(0, 0, 0);
        }
      },
    },
    0.1
  );

  // 뇌 살짝 확대 (brainRoot 기준으로 수정)
  if (brainRoot) {
    tl.to(
      brainRoot.scale,
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

  // 🔥 줌인 끝나고 HUD + 콘솔 등장 + 기억 노드 생성
  tl.call(() => {
    setupControls();

    if (fpUi) {
      fpUi.classList.add("active");
      fpUi.style.opacity = 1;
    }

    // HUD + 사이드 패널만 같이
    const uiToShow = [];
    if (hud) uiToShow.push(hud);
    if (sidePanel) uiToShow.push(sidePanel); // 우측 COORD 패널

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

    // 🔥 DEV 콘솔은 따로 강제 표시 (HUD 묶음에서 분리)
    if (devConsole) {
      devConsole.style.display = "block";
      gsap.fromTo(
        devConsole,
        { opacity: 0, y: 20 },
        {
          opacity: 1,
          y: 0,
          duration: 0.45,
          ease: "power2.out",
          onStart: () => {
            devConsole.style.pointerEvents = "auto";
          },
        }
      );
    }

    // 🔹 여기서 처음으로 기억 노드 생성
    if (!memoryNodesCreated) {
      createMemoryNodes();
      memoryNodesCreated = true;
    }
  });
}

// ===============================
// 7. OrbitControls + 이벤트 세팅
// ===============================
function setupControls() {
  controls = new OrbitControls(camera, renderer.domElement);

  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.rotateSpeed = 0.7;
  controls.zoomSpeed = 0.6;

  controls.minDistance = 25;
  controls.maxDistance = 140;

  if (brainRoot) {
    controls.target.copy(brainRoot.position);
  } else if (pointsGroup) {
    controls.target.copy(pointsGroup.position);
  } else {
    controls.target.set(0, 0, 0);
  }

  controls.enablePan = false;
  controls.enableRotate = true;
  controls.enableZoom = true;
  controls.autoRotate = false;

  controls.mouseButtons = {
    LEFT: THREE.MOUSE.ROTATE,
    MIDDLE: THREE.MOUSE.DOLLY,
    RIGHT: THREE.MOUSE.DOLLY,
  };

  controls.update();
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

// ===============================
// 9. 노드 프리뷰 (마우스 호버)
// ===============================
let hoveredNode = null;

function onCanvasMouseMove(event) {
  // 3D 탐사 모드가 아니면 노드 호버 처리 안 함
  if (!isExploring || isDashboardOpen.value) return;

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
// 10. WASD 이동
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

// 🔹 카메라의 뇌 기준 로컬 좌표로부터 어느 엽인지 판정
function getLobeFromLocalPos(local) {
  // 이 기준은 대충 예시고, 나중에 직접 움직여 보면서 값 조정하기!
  if (local.z > 15) return LOBES.frontal;      // 앞쪽 = 전두엽
  if (local.z < -15) return LOBES.occipital;   // 뒤쪽 = 후두엽

  // 앞/뒤 애매한 중앙이라면 위/아래로 두정/측두 나누기
  if (local.y > 10) return LOBES.parietal;     // 위 = 두정엽
  if (local.y < -5) return LOBES.temporal;     // 아래 = 측두엽

  return null;
}

function showLobeBanner(lobe) {
  if (!lobe || !lobeBanner) return;

  lobeBanner.textContent = `${lobe.label} 진입`;

  if (lobeBannerTimer) {
    clearTimeout(lobeBannerTimer);
    lobeBannerTimer = null;
  }

  // 등장
  lobeBanner.classList.add("show");

  // 1.4초 뒤에 자동으로 다시 숨기기
  lobeBannerTimer = setTimeout(() => {
    lobeBanner.classList.remove("show");
    lobeBannerTimer = null;
  }, 1400);
}



// ===============================
// 11. HUD 업데이트 (좌표 + 깊이 + 노드 거리)
// ===============================
function updateHUD() {
  if (!camera) return;

  // 1) 카메라 좌표
  if (hudX && hudY && hudZ) {
    hudX.textContent = camera.position.x.toFixed(1);
    hudY.textContent = camera.position.y.toFixed(1);
    hudZ.textContent = camera.position.z.toFixed(1);
  }

  // 2) 깊이
  if (hudDepth) {
    const depth = camera.position.length();
    hudDepth.textContent = depth.toFixed(1);
  }

  // 3) 가장 가까운 기억 노드까지 거리
  if (clickableNodes.length === 0) {
    if (hudDistance) hudDistance.textContent = "NODE —";
    if (distanceLabel) distanceLabel.textContent = "NODE DISTANCE: --";

    if (nodeProximityHud) {
      nodeProximityHud.textContent = "NODE SCAN: IDLE";
      nodeProximityHud.className = "node-proximity-hud";
    }
    return;
  }

  let minDist = Infinity;

  clickableNodes.forEach((node) => {
    const worldPos = new THREE.Vector3();
    node.getWorldPosition(worldPos);
    const dist = camera.position.distanceTo(worldPos);
    if (dist < minDist) minDist = dist;
  });

  if (minDist === Infinity) {
    if (hudDistance) hudDistance.textContent = "NODE —";
    if (distanceLabel) distanceLabel.textContent = "NODE DISTANCE: --";

    if (nodeProximityHud) {
      nodeProximityHud.textContent = "NODE SCAN: IDLE";
      nodeProximityHud.className = "node-proximity-hud";
    }
    return;
  }

  const rounded = Math.round(minDist);

  if (hudDistance) {
    hudDistance.textContent = `NODE ${rounded}`;
  }
  if (distanceLabel) {
    distanceLabel.textContent = `NODE DISTANCE: ${rounded}`;
  }

  if (!nodeProximityHud) return;

  // 기본 클래스 초기화 + visible 켜기
  nodeProximityHud.className = "node-proximity-hud visible";

  if (rounded > 140) {
    nodeProximityHud.textContent = "NODE SCAN: NO TARGET";
    nodeProximityHud.classList.add("state-far");
  } else if (rounded > 80) {
    nodeProximityHud.textContent = "NODE SCAN: APPROACHING";
    nodeProximityHud.classList.add("state-mid");
  } else if (rounded > 35) {
    nodeProximityHud.textContent = "PROXIMITY: LOCKING...";
    nodeProximityHud.classList.add("state-near");
  } else if (rounded > 18) {
    nodeProximityHud.textContent = "PROXIMITY: NODE IN RANGE";
    nodeProximityHud.classList.add("state-near");
  } else {
    nodeProximityHud.textContent = "NODE CLICK! — INTERACT";
    nodeProximityHud.classList.add("state-hot");
  }
}

// ===============================
// 12. 시계
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
// 13. 캔버스 클릭 → 노드 선택
// ===============================
function onCanvasClick(event) {
  // 3D 모드 아니면 클릭으로 노드 안 열림
  if (!isExploring || isDashboardOpen.value) return;

  mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
  mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;

  raycaster.setFromCamera(mouse, camera);
  const intersects = raycaster.intersectObjects(clickableNodes);

  if (intersects.length > 0) {
    const node = intersects[0].object;
    openDashboardWithAnimation(node);
  }
}

// ===============================
// 14. 대시보드용 미니 3D 씬 세팅
// ===============================
function setupMiniScene() {
  if (miniRenderer && miniScene && miniCamera) return;

  const card = document.querySelector(".dash-card-node");
  if (!card) return;

  const orbitDiv = card.querySelector(".node-orbit");
  const mount = orbitDiv || card;

  miniRenderer = new THREE.WebGLRenderer({
    antialias: true,
    alpha: true,
  });
  miniRenderer.setPixelRatio(window.devicePixelRatio);
  miniRenderer.setSize(mount.clientWidth || 200, mount.clientHeight || 200);
  miniRenderer.domElement.id = "mini-node-canvas";
  miniRenderer.domElement.style.width = "100%";
  miniRenderer.domElement.style.height = "100%";
  miniRenderer.domElement.style.display = "block";
  miniRenderer.domElement.style.pointerEvents = "none";

  if (orbitDiv) {
    orbitDiv.style.position = "relative";

    const canvasWrap = document.createElement("div");
    canvasWrap.className = "mini-node-3d";
    canvasWrap.style.position = "absolute";
    canvasWrap.style.inset = "0";
    canvasWrap.style.zIndex = "0";
    canvasWrap.style.pointerEvents = "none";

    canvasWrap.appendChild(miniRenderer.domElement);
    orbitDiv.prepend(canvasWrap);
  } else {
    mount.appendChild(miniRenderer.domElement);
  }

  miniScene = new THREE.Scene();
  miniCamera = new THREE.PerspectiveCamera(40, 1, 0.1, 1000);
  miniCamera.position.set(0, 0, 40);
  miniCamera.lookAt(0, 0, 0);

  const light = new THREE.PointLight(0xffffff, 1.1);
  light.position.set(25, 25, 25);
  miniScene.add(light);
  const ambient = new THREE.AmbientLight(0xffffff, 0.5);
  miniScene.add(ambient);
}

function updateMiniNode(node) {
  setupMiniScene();
  if (!miniScene) return;

  if (miniNodeRoot) {
    miniScene.remove(miniNodeRoot);
    miniNodeRoot = null;
  }

  const originalGroup = node.parent;
  if (!originalGroup) return;

  miniNodeRoot = originalGroup.clone(true);
  miniNodeRoot.position.set(0, 0, 0);
  miniNodeRoot.scale.set(1.1, 1.1, 1.1);
  miniNodeRoot.rotation.set(0.6, 0.7, 0);

  miniScene.add(miniNodeRoot);
}

// ===============================
// 14.5 요약 텍스트 타자기 효과
// ===============================
function typeSummaryText(newText) {
  const el = document.getElementById("dashboard-main-text");
  if (!el) return;

  if (summaryTypeTimer) {
    clearInterval(summaryTypeTimer);
    summaryTypeTimer = null;
  }

  el.textContent = "";
  if (!newText) return;

  let idx = 0;
  summaryTypeTimer = setInterval(() => {
    if (idx >= newText.length) {
      clearInterval(summaryTypeTimer);
      summaryTypeTimer = null;
      return;
    }
    el.textContent += newText[idx];
    idx++;
  }, 18);
}

// ===============================
// 15. 대시보드 내용 세팅
// ===============================
function buildDashboardForNode(node) {
  const data = node.userData?.nodeData;
  if (!data) return;

  updateMiniNode(node);

  const nodeNameEl = document.getElementById("dashboard-node-name");
  const mainTitleEl = document.getElementById("dashboard-main-title");
  const mainTextEl = document.getElementById("dashboard-main-text");
  const dashTitleEl = document.getElementById("dash-node-title");
  const tagsWrap = document.getElementById("dash-node-tags");
  const orbitWrap = document.getElementById("dash-node-orbit-labels");
  const bodyEl = document.getElementById("dashboard-body");
  const photoEl = document.getElementById("dashboard-photo");
  const coreMini = document.querySelector(".node-orbit-core");

  if (nodeNameEl) nodeNameEl.textContent = data.name || "NODE";

  const titleText = data.summaryTitle || data.name || "UNTITLED NODE";
  const summaryText = data.summaryText || "";

  if (mainTitleEl) mainTitleEl.textContent = titleText;
  if (mainTextEl) {
    mainTextEl.textContent = "";
    mainTextEl.dataset.fullText = summaryText || "";
  }

  if (dashTitleEl) dashTitleEl.textContent = titleText;

  if (tagsWrap) {
    tagsWrap.innerHTML = "";
    if (Array.isArray(data.tags)) {
      data.tags.forEach((tag) => {
        const span = document.createElement("span");
        span.className = "dash-tag";
        span.textContent = tag;
        tagsWrap.appendChild(span);
      });
    }
  }

  if (bodyEl) {
    bodyEl.innerHTML = data.content || "";
  }

  if (coreMini) {
    coreMini.style.removeProperty("background-color");
    coreMini.style.removeProperty("box-shadow");

    const coreColorNum = data.coreStyle?.color;
    if (typeof coreColorNum === "number") {
      const hex = "#" + coreColorNum.toString(16).padStart(6, "0");
      coreMini.style.backgroundColor = hex;
      coreMini.style.boxShadow = `0 0 14px ${hex}`;
    } else {
      coreMini.style.backgroundColor = "#ffffff";
      coreMini.style.boxShadow = "0 0 12px rgba(255,255,255,0.9)";
    }
  }

  if (photoEl) {
    const defaultImg =
      data.baseImage ||
      (Array.isArray(data.keywords) && data.keywords[0]?.image) ||
      node.userData.image ||
      "";
    if (defaultImg) {
      photoEl.src = defaultImg;
    } else {
      photoEl.removeAttribute("src");
    }
  }

  // ... 위쪽 내용 그대로 두고 ...

  if (orbitWrap) {
    orbitWrap.innerHTML = "";

    if (Array.isArray(data.keywords) && data.keywords.length > 0) {
      const total = data.keywords.length;
      const radius = 38;

      data.keywords.forEach((k, idx) => {
        // label 처리 (배열이면 첫 번째만)
        let labelText;
        if (typeof k === "string") {
          labelText = k;
        } else {
          if (Array.isArray(k.label)) {
            labelText = k.label[0] ?? "";
          } else {
            labelText = k.label ?? "";
          }
        }

        const imgPath = typeof k === "string" ? null : k.image;
        const summaryOverride =
          typeof k === "string" ? null : k.summary || k.summaryText || null;
        const descOverride =
          typeof k === "string"
            ? null
            : k.descriptionHtml || k.description || null;

        const angle = (idx / total) * Math.PI * 2;

        const btn = document.createElement("button");
        btn.className = "dash-orbit-label";
        btn.textContent = labelText;

        const x = 50 + Math.cos(angle) * radius;
        const y = 50 + Math.sin(angle) * radius;
        btn.style.left = `${x}%`;
        btn.style.top = `${y}%`;

        btn.style.pointerEvents = "auto";
        btn.style.zIndex = "4";

        btn.addEventListener("click", () => {
          // 활성 버튼 토글
          orbitWrap
            .querySelectorAll(".dash-orbit-label.active")
            .forEach((el) => el.classList.remove("active"));
          btn.classList.add("active");

          // 📷 이미지 변경
          if (photoEl) {
            const targetImg =
              imgPath ||
              data.baseImage ||
              (Array.isArray(data.keywords) &&
                data.keywords[0] &&
                data.keywords[0].image) ||
              node.userData.image ||
              "";
            if (targetImg) {
              photoEl.src = targetImg;
            } else {
              photoEl.removeAttribute("src");
            }
          }

          // 🧠 요약 문구 타자기 효과
          if (summaryOverride != null) {
            typeSummaryText(summaryOverride);
            if (mainTextEl) {
              mainTextEl.dataset.fullText = summaryOverride;
            }
          } else if (mainTextEl) {
            typeSummaryText(mainTextEl.dataset.fullText || summaryText);
          }

          // 📄 본문 내용 변경
          if (bodyEl) {
            if (descOverride) {
              bodyEl.innerHTML = descOverride;
            } else {
              bodyEl.innerHTML = data.content || "";
            }
          }
        });

        // 첫 번째 버튼은 기본 active만 먼저 달아둠
        if (idx === 0) {
          btn.classList.add("active");
        }

        orbitWrap.appendChild(btn);
      });

      // 🔥 첫 번째 키워드 버튼을 강제로 한 번 클릭 → 기본 이미지/요약 세팅
      const firstBtn = orbitWrap.querySelector(".dash-orbit-label");
      if (firstBtn) {
        firstBtn.click();
      }
    }
  }
}


// ===============================
// 16. 대시보드 오픈 + 등장 애니메이션
// ===============================
function runDashboardEntranceAnimations() {
  const content = document.getElementById("dashboard-content");
  const leftCol = document.querySelector(".dash-left");
  const rightCol = document.querySelector(".dash-right");
  const cards = document.querySelectorAll(".dash-card");
  const header = document.querySelector(".dash-header");

  if (!content) return;

  content.classList.add("dashboard-animate");

  gsap.killTweensOf([leftCol, rightCol, cards, header]);

  const tl = gsap.timeline({
    defaults: { ease: "power3.out", duration: 0.55 },
  });

  tl.to(content, {
    opacity: 1,
    y: 0,
    filter: "blur(0px)",
  });

  if (header) {
    tl.fromTo(
      header,
      { y: -20, opacity: 0, filter: "blur(4px)" },
      { y: 0, opacity: 1, filter: "blur(0px)" },
      "-=0.35"
    );
  }

  if (leftCol) {
    tl.fromTo(
      leftCol,
      { x: -40, opacity: 0, filter: "blur(8px)" },
      { x: 0, opacity: 1, filter: "blur(0px)" },
      "-=0.4"
    );
  }

  if (rightCol) {
    tl.fromTo(
      rightCol,
      { x: 40, opacity: 0, filter: "blur(8px)" },
      { x: 0, opacity: 1, filter: "blur(0px)" },
      "-=0.45"
    );
  }

  if (cards.length > 0) {
    tl.fromTo(
      cards,
      { y: 18, opacity: 0, scale: 0.96 },
      {
        y: 0,
        opacity: 1,
        scale: 1,
        stagger: 0.1,
      },
      "-=0.35"
    );
  }

  const summaryEl = document.getElementById("dashboard-main-text");
  if (summaryEl && summaryEl.dataset.fullText) {
    tl.call(() => {
      typeSummaryText(summaryEl.dataset.fullText);
    }, null, "-=0.1");
  }
}

function openDashboardWithAnimation(node) {
  const overlay = document.getElementById("dashboard-overlay");
  const contentDiv = document.getElementById("dashboard-content");
  const hud = document.getElementById("hud");
  const fpUi = document.getElementById("fp-ui");
  const preview = document.getElementById("node-preview");
  const img = document.getElementById("node-preview-img");
  const devConsole = ensureDevConsoleOnTop();
  const sidePanelLocal = document.querySelector(".fp-side-panel");

  if (!overlay || !contentDiv) return;

  buildDashboardForNode(node);

  if (img && node.userData.image) {
    img.src = node.userData.image;
  }

  if (preview) {
    preview.classList.remove("hidden");
    preview.style.opacity = 1;
  }

  overlay.classList.remove("hidden");

  gsap.set(contentDiv, {
    opacity: 0,
    y: 20,
    filter: "blur(6px)",
  });

  gsap.killTweensOf([overlay, hud, fpUi, devConsole, preview]);

  const slideOutTargets = [];
  if (hud) slideOutTargets.push(hud);
  if (devConsole) slideOutTargets.push(devConsole);
  if (sidePanelLocal) slideOutTargets.push(sidePanelLocal);

  const tl = gsap.timeline({
    defaults: { ease: "power2.inOut" },
    onComplete: () => {
      isDashboardOpen.value = true;
      runDashboardEntranceAnimations();
    },
  });

  if (preview) {
    tl.to(
      preview,
      {
        duration: 0.55,
        left: "50%",
        top: "50%",
        xPercent: -50,
        yPercent: -50,
        scale: 1.9,
        ease: "power3.inOut",
      },
      0
    );
  }

  if (slideOutTargets.length > 0) {
    tl.to(
      slideOutTargets,
      {
        duration: 0.4,
        opacity: 0,
        x: -40,
        ease: "power2.in",
        pointerEvents: "none",
      },
      0
    );
  }

  if (fpUi) {
    tl.to(
      fpUi,
      {
        duration: 0.4,
        opacity: 0,
        y: 20,
        ease: "power2.in",
        pointerEvents: "none",
      },
      0
    );
  }

  tl.fromTo(
    overlay,
    { opacity: 0, xPercent: -4 },
    {
      opacity: 1,
      xPercent: 0,
      duration: 0.45,
      ease: "power2.out",
    },
    "-=0.15"
  );

  tl.set(
    preview,
    {
      opacity: 0,
      clearProps: "left,top,transform,opacity",
    },
    "-=0.3"
  );
}

// ===============================
// 17. 대시보드 닫기
// ===============================
function closeDashboard() {
  const overlay = document.getElementById("dashboard-overlay");
  const hud = document.getElementById("hud");
  const fpUi = document.getElementById("fp-ui");
  const devConsole = ensureDevConsoleOnTop();
  const content = document.getElementById("dashboard-content");
  const sidePanelLocal = document.querySelector(".fp-side-panel");

  if (!overlay) return;

  if (summaryTypeTimer) {
    clearInterval(summaryTypeTimer);
    summaryTypeTimer = null;
  }

  gsap.killTweensOf([overlay, content, hud, fpUi, devConsole]);

  const tl = gsap.timeline({
    defaults: { ease: "power3.inOut", duration: 0.55 },
    onComplete: () => {
      overlay.classList.add("hidden");
      overlay.style.opacity = 0;
      isDashboardOpen.value = false;
      if (content) content.classList.remove("dashboard-animate");
    },
  });

  tl.to(
    content,
    {
      opacity: 0,
      y: 30,
      filter: "blur(8px)",
    },
    0
  );

  const rightCol = document.querySelector(".dash-right");
  if (rightCol) {
    tl.to(
      rightCol,
      {
        x: 40,
        opacity: 0,
        filter: "blur(8px)",
      },
      "-=0.45"
    );
  }

  const leftCol = document.querySelector(".dash-left");
  if (leftCol) {
    tl.to(
      leftCol,
      {
        x: -40,
        opacity: 0,
        filter: "blur(8px)",
      },
      "-=0.4"
    );
  }

  const cards = document.querySelectorAll(".dash-card");
  if (cards.length > 0) {
    tl.to(
      cards,
      {
        y: 20,
        opacity: 0,
        scale: 0.95,
        stagger: 0.06,
      },
      "-=0.45"
    );
  }

  tl.to(
    overlay,
    {
      opacity: 0,
      xPercent: -4,
      duration: 0.5,
    },
    "-=0.4"
  );

  const slideInTargets = [];
  if (hud) slideInTargets.push(hud);
  if (devConsole) slideInTargets.push(devConsole);
  if (sidePanelLocal) slideInTargets.push(sidePanelLocal);

  if (slideInTargets.length > 0) {
    tl.to(
      slideInTargets,
      {
        opacity: 1,
        x: 0,
        duration: 0.45,
        ease: "power2.out",
        onStart: () => {
          slideInTargets.forEach((el) => (el.style.pointerEvents = "auto"));
        },
      },
      "-=0.35"
    );
  }

  if (fpUi) {
    tl.to(
      fpUi,
      {
        opacity: 0.85,
        y: 0,
        duration: 0.45,
        ease: "power2.out",
      },
      "-=0.32"
    );
  }
}

// ===============================
// 18. 렌더링 루프
// ===============================
function animate() {
  requestAnimationFrame(animate);

  const timeSec = performance.now() * 0.001;

  // 별 배경 회전
  if (starfield) {
    starfield.rotation.x += starSpeed.x;
    starfield.rotation.y += starSpeed.y;
  }

  // 🔥 스크롤 인트로 구간: 뇌가 빙글빙글 돌지 않고,
  //    아주 미세하게 "숨 쉬는" 느낌으로만 디용디용
  if (!isExploring && brainRoot) {
    const breath = 1 + Math.sin(timeSec * 0.8) * 0.015; // 1.5% 정도만 변화
    brainRoot.scale.set(breath, breath, breath);
    // rotation은 건들지 않음 (SCENE_POSES에서 잡아준 각도만 유지)
  }

  // 3D 탐사 모드일 때 카메라 이동 + OrbitControls
  if (controls) {
    controls.update();
    handleMovement();
  }



  // HUD / 노드 라벨 업데이트
  updateHUD();
  updateKeywordLabels(timeSec);

  // 메인 씬 렌더
  renderer.render(scene, camera);

  // 대시보드 미니 3D 씬 렌더
  if (miniScene && miniRenderer && miniCamera && miniNodeRoot) {
    miniNodeRoot.rotation.y += 0.01;
    miniNodeRoot.rotation.x += 0.003;

    const card = document.querySelector(".dash-card-node");
    if (card) {
      const orbitDiv = card.querySelector(".node-orbit");
      const mount = orbitDiv || card;
      const width = mount.clientWidth;
      const height = mount.clientHeight;

      if (width && height) {
        const aspect = width / height;

        if (miniCamera.aspect !== aspect) {
          miniCamera.aspect = aspect;
          miniCamera.updateProjectionMatrix();
        }
        miniRenderer.setSize(width, height, false);
      }
    }

    miniRenderer.render(miniScene, miniCamera);
  }
}


// ===============================
// 19. 창 크기 변경 대응
// ===============================
function onWindowResize() {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
}

// ===============================
// 20. DEV CONSOLE
// ===============================
const devRunBtn = document.getElementById("dev-run");
if (devRunBtn) {
  devRunBtn.addEventListener("click", runDevScript);
}

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

function applyDevCall(obj, method, args) {
  if (obj === "scene" && method === "bg" && typeof args[0] === "string") {
    try {
      scene.background = new THREE.Color(args[0]);
      document.body.style.backgroundColor = args[0];
    } catch (e) {}
    return;
  }

  // 🔦 밝기 조정: dev 콘솔에서 scene.dim(0.5) 이런 식으로 쓰면 됨
  if (obj === "scene" && method === "dim" && typeof args[0] === "number") {
    const v = Math.max(0.1, Math.min(2, args[0]));
    renderer.toneMappingExposure = v;
    return;
  }

  // brain 명령은 brainRoot 기준으로 통일
  if (obj === "brain" && brainRoot) {
    if (method === "moveTo") {
      const [x, y, z] = args;
      if (typeof x === "number") brainRoot.position.x = x;
      if (typeof y === "number") brainRoot.position.y = y;
      if (typeof z === "number") brainRoot.position.z = z;
      return;
    }
    if (method === "offset") {
      const [dx, dy, dz] = args;
      if (typeof dx === "number") brainRoot.position.x += dx;
      if (typeof dy === "number") brainRoot.position.y += dy;
      if (typeof dz === "number") brainRoot.position.z += dz;
      return;
    }
  }

  if (obj === "player" && method === "speed" && typeof args[0] === "number") {
    moveSpeed = args[0];
    return;
  }

  if (obj === "stars" && method === "spin") {
    const [sx, sy] = args;
    if (typeof sx === "number") starSpeed.x = sx;
    if (typeof sy === "number") starSpeed.y = sy;
    return;
  }

  if (obj === "bounds" && method === "cage" && typeof args[0] === "number") {
    const v = Math.abs(args[0]);
    BOUNDS.x = v;
    BOUNDS.y = v;
    BOUNDS.z = v;
    return;
  }
}

// ======================================
// 21. 스크롤 인트로 → 3D 모드 진입 버튼
// ======================================

// ENTER NEUROVERSE 버튼 클릭 시 3D 탐사 시작
const enterBtn = document.getElementById("enter-neuroverse");
if (enterBtn) {
  enterBtn.addEventListener("click", () => {
    const shell = document.getElementById("site-shell");

    // 인트로 섹션 페이드아웃 + 위로 살짝 밀어 올리기
    if (shell) {
      gsap.to(shell, {
        opacity: 0,
        y: -80,
        duration: 0.9,
        ease: "power3.inOut",
        onComplete: () => {
          shell.style.display = "none";
        },
      });
    }

    // 이제부터는 3D 탐사 모드라서 스크롤 잠금
    document.body.style.overflow = "hidden";

    // 기존에 쓰던 카메라 줌인 + HUD 등장 애니메이션
    startExploration();
  });
}

const exitBtn = document.getElementById("exit-neuroverse");
if (exitBtn) {
  exitBtn.style.pointerEvents = "auto";
  exitBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    exitNeuroverse();
  });
}

// ======================================
// X. 3D 탐사 모드 종료 (EXIT 버튼)
// ======================================
function exitNeuroverse() {
  // 살짝 페이드아웃 줄 거면 이 정도만
  const hud = document.getElementById("hud");
  const fpUi = document.getElementById("fp-ui");
  const devConsole = document.getElementById("dev-console");
  const overlay = document.getElementById("dashboard-overlay");

  const targets = [hud, fpUi, devConsole, overlay].filter(Boolean);

  if (targets.length > 0 && typeof gsap !== "undefined") {
    gsap.to(targets, {
      opacity: 0,
      duration: 0.35,
      ease: "power2.inOut",
      onComplete: () => {
        // 🔥 진짜 리셋: 완전 처음 상태로
        window.location.reload();
      },
    });
  } else {
    // gsap 없어도 바로 리로드
    window.location.reload();
  }
}

