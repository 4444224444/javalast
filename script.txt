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

// 🔊 BGM 관련
let bgm = null;
let isBgmOn = false;
let musicToggle = null;
let musicIcon = null;

const clickableNodes = []; // 기억 노드들 (Raycasting 대상)
const keywordLabelGroups = []; // 각 노드별 키워드 라벨 모음
const _tmpWorldPos = new THREE.Vector3();

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
  x: 80,
  y: 80,
  z: 80,
};

const isDashboardOpen = { value: false }; // 대시보드 열려 있을 때 이동/클릭 막기용
const TARGET_POSITION = new THREE.Vector3(0, 0, 50); // 줌인 후 카메라 위치

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

// 🔹 HUD DOM 요소 (우측 패널 + 좌측 텍스트)
const hudX = document.getElementById("hud-x");
const hudY = document.getElementById("hud-y");
const hudZ = document.getElementById("hud-z");
const hudDepth = document.getElementById("hud-depth");
const hudDistance = document.getElementById("hud-distance");
const distanceLabel = document.getElementById("distance-label");
const sidePanel = document.querySelector(".fp-side-panel");
const nodeProximityHud = document.getElementById("node-proximity-alert");

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


  // 🔻 여기부터는 기존 three.js 초기화
  renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: true,
    alpha: true,
  });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(window.devicePixelRatio);

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
  loadBrainModel();
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
    name: "해마 (Frontal Lobe)",
    position: new THREE.Vector3(10, 55, -40),
    baseImage: "images/frontal_default.jpg",
    descriptionHtml: `
      <p>three.js로 처음 3D 씬을 만들던 순간, 카메라와 라이트, 메쉬를 하나씩 배치하며 
      '브라우저 안에 우주를 깐다'는 느낌을 처음으로 경험했던 구역.</p>
    `,
    keywords: [
      {
        key: "threejs",
        label: "three.js",
        image: "images/frontal_threejs.jpg",
        summary: "나의 3D 실험실, three.js와 함께한 뇌 탐사 기록.",
      },
      {
        key: "webdev",
        label: "web dev",
        image: "images/frontal_web.jpg",
        summary: "프론트엔드 전반의 설계와 구조를 고민하는 영역.",
      },
      {
        key: "portfolio",
        label: "portfolio",
        image: "images/frontal_portfolio.jpg",
        summary: "424 포트폴리오의 방향성과 톤을 구상하는 곳.",
      },
    ],
    summaryTitle: "FRONTAL LOBE // PLANNING",
    summaryText:
      "장기 계획, 사이드 프로젝트, 미래 설계와 관련된 기억들을 저장하는 영역.",
    tags: ["planning", "project", "future"],
    content: `
      <h2>전두엽: 계획과 실행</h2>
      <p>여기에 긴 설명 HTML...</p>
    `,
    coreStyle: {
      shape: "sphere",
      size: 0.75,
      color: 0x38bdf8,
      opacity: 0.45,
    },
    satelliteStyle: {
      color: 0x66d9ff,
      size: 0.16,
      opacity: 0.85,
    },
    labelStyle: {
      color: "#c6e6ff",
      fontSize: "11px",
      className: "label-frontal",
    },
  },
  {
    name: "전두엽 (Frontal Lobe)",
    position: new THREE.Vector3(10, 55, -40),
    baseImage: "images/frontal_default.jpg",
    descriptionHtml: `
      <p>three.js로 처음 3D 씬을 만들던 순간, 카메라와 라이트, 메쉬를 하나씩 배치하며 
      '브라우저 안에 우주를 깐다'는 느낌을 처음으로 경험했던 구역.</p>
    `,
    keywords: [
      {
        key: "threejs",
        label: "three.js",
        image: "images/frontal_threejs.jpg",
        summary: "나의 3D 실험실, three.js와 함께한 뇌 탐사 기록.",
      },
      {
        key: "webdev",
        label: "web dev",
        image: "images/frontal_web.jpg",
        summary: "프론트엔드 전반의 설계와 구조를 고민하는 영역.",
      },
      {
        key: "portfolio",
        label: "portfolio",
        image: "images/frontal_portfolio.jpg",
        summary: "424 포트폴리오의 방향성과 톤을 구상하는 곳.",
      },
    ],
    summaryTitle: "FRONTAL LOBE // PLANNING",
    summaryText:
      "장기 계획, 사이드 프로젝트, 미래 설계와 관련된 기억들을 저장하는 영역.",
    tags: ["planning", "project", "future"],
    content: `
      <h2>전두엽: 계획과 실행</h2>
      <p>여기에 긴 설명 HTML...</p>
    `,
    coreStyle: {
      shape: "sphere",
      size: 0.75,
      color: 0x38bdf8,
      opacity: 0.45,
    },
    satelliteStyle: {
      color: 0x66d9ff,
      size: 0.16,
      opacity: 0.85,
    },
    labelStyle: {
      color: "#c6e6ff",
      fontSize: "11px",
      className: "label-frontal",
    },
  },
  {
    name: "전두엽 (Frontal Lobe)",
    position: new THREE.Vector3(120, 55, -40),
    baseImage: "images/frontal_default.jpg",
    descriptionHtml: `
      <p>three.js로 처음 3D 씬을 만들던 순간, 카메라와 라이트, 메쉬를 하나씩 배치하며 
      '브라우저 안에 우주를 깐다'는 느낌을 처음으로 경험했던 구역.</p>
    `,
    keywords: [
      {
        key: "threejs",
        label: "three.js",
        image: "images/frontal_threejs.jpg",
        summary: "나의 3D 실험실, three.js와 함께한 뇌 탐사 기록.",
      },
      {
        key: "webdev",
        label: "web dev",
        image: "images/frontal_web.jpg",
        summary: "프론트엔드 전반의 설계와 구조를 고민하는 영역.",
      },
      {
        key: "portfolio",
        label: "portfolio",
        image: "images/frontal_portfolio.jpg",
        summary: "424 포트폴리오의 방향성과 톤을 구상하는 곳.",
      },
    ],
    summaryTitle: "FRONTAL LOBE // PLANNING",
    summaryText:
      "장기 계획, 사이드 프로젝트, 미래 설계와 관련된 기억들을 저장하는 영역.",
    tags: ["planning", "project", "future"],
    content: `
      <h2>전두엽: 계획과 실행</h2>
      <p>여기에 긴 설명 HTML...</p>
    `,
    coreStyle: {
      shape: "sphere",
      size: 0.75,
      color: 0x38bdf8,
      opacity: 0.45,
    },
    satelliteStyle: {
      color: 0x66d9ff,
      size: 0.16,
      opacity: 0.85,
    },
    labelStyle: {
      color: "#c6e6ff",
      fontSize: "11px",
      className: "label-frontal",
    },
  },
  {
    name: "전두엽 (Frontal Lobe)",
    position: new THREE.Vector3(80, 55, -40),
    baseImage: "images/frontal_default.jpg",
    descriptionHtml: `
      <p>three.js로 처음 3D 씬을 만들던 순간, 카메라와 라이트, 메쉬를 하나씩 배치하며 
      '브라우저 안에 우주를 깐다'는 느낌을 처음으로 경험했던 구역.</p>
    `,
    keywords: [
      {
        key: "threejs",
        label: "three.js",
        image: "images/frontal_threejs.jpg",
        summary: "나의 3D 실험실, three.js와 함께한 뇌 탐사 기록.",
      },
      {
        key: "webdev",
        label: "web dev",
        image: "images/frontal_web.jpg",
        summary: "프론트엔드 전반의 설계와 구조를 고민하는 영역.",
      },
      {
        key: "portfolio",
        label: "portfolio",
        image: "images/frontal_portfolio.jpg",
        summary: "424 포트폴리오의 방향성과 톤을 구상하는 곳.",
      },
    ],
    summaryTitle: "FRONTAL LOBE // PLANNING",
    summaryText:
      "장기 계획, 사이드 프로젝트, 미래 설계와 관련된 기억들을 저장하는 영역.",
    tags: ["planning", "project", "future"],
    content: `
      <h2>전두엽: 계획과 실행</h2>
      <p>여기에 긴 설명 HTML...</p>
    `,
    coreStyle: {
      shape: "sphere",
      size: 0.75,
      color: 0x38bdf8,
      opacity: 0.45,
    },
    satelliteStyle: {
      color: 0x66d9ff,
      size: 0.16,
      opacity: 0.85,
    },
    labelStyle: {
      color: "#c6e6ff",
      fontSize: "11px",
      className: "label-frontal",
    },
  },
  {
    name: "전두엽 (Frontal Lobe)",
    position: new THREE.Vector3(30, 55, -40),
    baseImage: "images/frontal_default.jpg",
    descriptionHtml: `
      <p>three.js로 처음 3D 씬을 만들던 순간, 카메라와 라이트, 메쉬를 하나씩 배치하며 
      '브라우저 안에 우주를 깐다'는 느낌을 처음으로 경험했던 구역.</p>
    `,
    keywords: [
      {
        key: "threejs",
        label: "three.js",
        image: "images/frontal_threejs.jpg",
        summary: "나의 3D 실험실, three.js와 함께한 뇌 탐사 기록.",
      },
      {
        key: "webdev",
        label: "web dev",
        image: "images/frontal_web.jpg",
        summary: "프론트엔드 전반의 설계와 구조를 고민하는 영역.",
      },
      {
        key: "portfolio",
        label: "portfolio",
        image: "images/frontal_portfolio.jpg",
        summary: "424 포트폴리오의 방향성과 톤을 구상하는 곳.",
      },
    ],
    summaryTitle: "FRONTAL LOBE // PLANNING",
    summaryText:
      "장기 계획, 사이드 프로젝트, 미래 설계와 관련된 기억들을 저장하는 영역.",
    tags: ["planning", "project", "future"],
    content: `
      <h2>전두엽: 계획과 실행</h2>
      <p>여기에 긴 설명 HTML...</p>
    `,
    coreStyle: {
      shape: "sphere",
      size: 0.75,
      color: 0x38bdf8,
      opacity: 0.45,
    },
    satelliteStyle: {
      color: 0x66d9ff,
      size: 0.16,
      opacity: 0.85,
    },
    labelStyle: {
      color: "#c6e6ff",
      fontSize: "11px",
      className: "label-frontal",
    },
  },
  {
    name: "전두엽 (Frontal Lobe)",
    position: new THREE.Vector3(50, 55, -40),
    baseImage: "images/frontal_default.jpg",
    descriptionHtml: `
      <p>three.js로 처음 3D 씬을 만들던 순간, 카메라와 라이트, 메쉬를 하나씩 배치하며 
      '브라우저 안에 우주를 깐다'는 느낌을 처음으로 경험했던 구역.</p>
    `,
    keywords: [
      {
        key: "threejs",
        label: "three.js",
        image: "images/frontal_threejs.jpg",
        summary: "나의 3D 실험실, three.js와 함께한 뇌 탐사 기록.",
      },
      {
        key: "webdev",
        label: "web dev",
        image: "images/frontal_web.jpg",
        summary: "프론트엔드 전반의 설계와 구조를 고민하는 영역.",
      },
      {
        key: "portfolio",
        label: "portfolio",
        image: "images/frontal_portfolio.jpg",
        summary: "424 포트폴리오의 방향성과 톤을 구상하는 곳.",
      },
    ],
    summaryTitle: "FRONTAL LOBE // PLANNING",
    summaryText:
      "장기 계획, 사이드 프로젝트, 미래 설계와 관련된 기억들을 저장하는 영역.",
    tags: ["planning", "project", "future"],
    content: `
      <h2>전두엽: 계획과 실행</h2>
      <p>여기에 긴 설명 HTML...</p>
    `,
    coreStyle: {
      shape: "sphere",
      size: 0.75,
      color: 0x38bdf8,
      opacity: 0.45,
    },
    satelliteStyle: {
      color: 0x66d9ff,
      size: 0.16,
      opacity: 0.85,
    },
    labelStyle: {
      color: "#c6e6ff",
      fontSize: "11px",
      className: "label-frontal",
    },
  },
];

// ===============================
// 4-A. 키워드 라벨 링 (씬 밖 UI용)
// ===============================
function setupKeywordRing(coreMesh, nodeData) {
  const keywords = nodeData.keywords;
  if (!keywords || keywords.length === 0) return;

  const uiContainer = document.getElementById("ui-container") || document.body;
  const group = { node: coreMesh, labels: [] };
  const labelOpts = nodeData.labelStyle || {};

  const count = keywords.length;
  for (let i = 0; i < count; i++) {
    const k = keywords[i];

    const labelText = typeof k === "string" ? k : k.label;
    const labelKey = typeof k === "string" ? k : k.key || k.label;
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

    uiContainer.appendChild(el);

    const angle = (i / count) * Math.PI * 2;
    group.labels.push({ el, angle });
  }

  keywordLabelGroups.push(group);
}

// ===============================
// 4-B. 키워드 라벨 위치 업데이트
// ===============================
function updateKeywordLabels(timeSec) {
  if (keywordLabelGroups.length === 0 || !camera) return;

  const halfW = window.innerWidth / 2;
  const halfH = window.innerHeight / 2;

  keywordLabelGroups.forEach((group) => {
    const { node, labels } = group;

    node.getWorldPosition(_tmpWorldPos);

    const camDist = camera.position.distanceTo(_tmpWorldPos);

    if (camDist > 90) {
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

    const vis = THREE.MathUtils.clamp(1 - (camDist - 75) / 50, 0, 1);

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
  MEMORY_NODES.forEach((nodeData) => {
    const group = new THREE.Group();
    group.position.copy(nodeData.position);

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
      if (startScreen) {
        startScreen.addEventListener("click", startExploration);
      }
    },
    undefined,
    (error) => {
      console.error("모델 로딩 중 에러:", error);
    }
  );
}

// ===============================
// 6. 탐사 시작
// ===============================
function startExploration() {
  const startScreen = document.getElementById("start-screen");
  const titleBox = document.getElementById("title-box");
  const subtitleBox = document.getElementById("subtitle-box");
  const hud = document.getElementById("hud");
  const devConsole = document.getElementById("dev-console");
  const fpUi = document.getElementById("fp-ui");

  const tl = gsap.timeline();

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
    0.1
  );

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

  tl.call(() => {
    setupControls();

    if (fpUi) {
      fpUi.classList.add("active");
    }

    const uiToShow = [];
    if (hud) uiToShow.push(hud);
    if (devConsole) uiToShow.push(devConsole);
    if (sidePanel) uiToShow.push(sidePanel);

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
  controls.dampingFactor = 0.08;
  controls.rotateSpeed = 0.7;
  controls.zoomSpeed = 0.6;

  controls.minDistance = 25;
  controls.maxDistance = 140;

  if (pointsGroup) {
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

  if (orbitWrap) {
    orbitWrap.innerHTML = "";

    if (Array.isArray(data.keywords) && data.keywords.length > 0) {
      const total = data.keywords.length;
      const radius = 38;

      data.keywords.forEach((k, idx) => {
        const labelText = typeof k === "string" ? k : k.label;
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

        if (idx === 0) {
          btn.classList.add("active");
        }

        btn.addEventListener("click", () => {
          orbitWrap
            .querySelectorAll(".dash-orbit-label.active")
            .forEach((el) => el.classList.remove("active"));
          btn.classList.add("active");

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
            }
          }

          if (summaryOverride != null) {
            typeSummaryText(summaryOverride);
            if (mainTextEl) {
              mainTextEl.dataset.fullText = summaryOverride;
            }
          } else if (mainTextEl) {
            typeSummaryText(mainTextEl.dataset.fullText || summaryText);
          }

          if (bodyEl) {
            if (descOverride) {
              bodyEl.innerHTML = descOverride;
            } else {
              bodyEl.innerHTML = data.content || "";
            }
          }
        });

        orbitWrap.appendChild(btn);
      });
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
  const devConsole = document.getElementById("dev-console");
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
  const devConsole = document.getElementById("dev-console");
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

  if (starfield) {
    starfield.rotation.x += starSpeed.x;
    starfield.rotation.y += starSpeed.y;
  }

  if (controls) {
    controls.update();
    handleMovement();
  }

  updateHUD();
  updateKeywordLabels(timeSec);

  renderer.render(scene, camera);

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
