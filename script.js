// ========== 3D 기본 세팅 ==========
const canvas = document.getElementById('bg');
const scene = new THREE.Scene();

const camera = new THREE.PerspectiveCamera(
  60,
  window.innerWidth / window.innerHeight,
  0.1,
  2000
);
camera.position.set(0, 0, 12);

const renderer = new THREE.WebGLRenderer({
  canvas,
  antialias: true,
  alpha: true
});
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);

// 약간의 우주 그레인 & 별
const starGeo = new THREE.BufferGeometry();
const STAR_COUNT = 1200;
const starPos = new Float32Array(STAR_COUNT * 3);
for (let i = 0; i < STAR_COUNT; i++) {
  const r = 200 * Math.cbrt(Math.random()); // 밀도 균일
  const theta = Math.random() * Math.PI * 2;
  const phi = Math.acos(2 * Math.random() - 1);
  starPos[i*3+0] = r * Math.sin(phi) * Math.cos(theta);
  starPos[i*3+1] = r * Math.sin(phi) * Math.sin(theta);
  starPos[i*3+2] = r * Math.cos(phi);
}
starGeo.setAttribute('position', new THREE.BufferAttribute(starPos, 3));
const starMat = new THREE.PointsMaterial({ color: 0x7a8bff, size: 0.6, sizeAttenuation: true });
const stars = new THREE.Points(starGeo, starMat);
scene.add(stars);

// 네트워크: 노드(Points) + 간단한 연결선(LineSegments)
const nodeCount = 240;
const nodePositions = new Float32Array(nodeCount * 3);
for (let i = 0; i < nodeCount; i++) {
  const r = 18 + Math.random() * 12; // 뉴런 덩어리 반경
  const theta = Math.random() * Math.PI * 2;
  const phi = Math.acos(2 * Math.random() - 1);
  nodePositions[i*3+0] = r * Math.sin(phi) * Math.cos(theta);
  nodePositions[i*3+1] = r * Math.sin(phi) * Math.sin(theta);
  nodePositions[i*3+2] = r * Math.cos(phi);
}
const nodeGeo = new THREE.BufferGeometry();
nodeGeo.setAttribute('position', new THREE.BufferAttribute(nodePositions, 3));
const nodeMat = new THREE.PointsMaterial({ color: 0x00e0ff, size: 0.9, transparent:true, opacity:0.9 });
const nodes = new THREE.Points(nodeGeo, nodeMat);
scene.add(nodes);

// 간단한 글로우 느낌: 큰 파티클 층
const glowMat = new THREE.PointsMaterial({ color: 0x00e0ff, size: 6.0, transparent:true, opacity:0.045 });
const glow = new THREE.Points(nodeGeo.clone(), glowMat);
scene.add(glow);

// 5개의 핫스팟 좌표(카메라가 접근할 곳)
const hotspots = [
  { title:"호기심", desc:"낯선 별빛에 끌림 — curiosity 0.82", pos: new THREE.Vector3(-10,  5, -20) },
  { title:"집중",   desc:"깊은 몰입의 순간 — focus 0.76",      pos: new THREE.Vector3( 15, 10, -25) },
  { title:"가치",   desc:"탐구 · 정밀 · 유머",                 pos: new THREE.Vector3(-20, -5, -28) },
  { title:"기억",   desc:"데이터로 남겨진 나",                 pos: new THREE.Vector3(  5,-15, -22) },
  { title:"연결",   desc:"별빛처럼 이어지는 관계",             pos: new THREE.Vector3(  0,  0, -36) },
];

// 핫스팟을 화면에서 보이도록, 작은 발광 구체 추가(가이드용)
const hsGroup = new THREE.Group();
hotspots.forEach(h => {
  const m = new THREE.Mesh(
    new THREE.SphereGeometry(1.2, 16, 16),
    new THREE.MeshBasicMaterial({ color: 0x00e0ff })
  );
  m.position.copy(h.pos);
  hsGroup.add(m);
});
scene.add(hsGroup);

// ========== 스크롤 섹션 관찰 ==========
const infoPanel = document.getElementById('infoPanel');
const infoTitle = document.getElementById('infoTitle');
const infoDesc = document.getElementById('infoDesc');

let activeIndex = -1; // -1: intro, 0..4: hotspots, -2: outro
const steps = [...document.querySelectorAll('.step')];

// 현재 보이는 섹션을 추적(가운데에 가까운 것 우선)
const io = new IntersectionObserver((entries)=>{
  // 가장 많이 보이는 섹션을 고르기 위해 정렬
  const visible = entries
    .filter(e => e.isIntersecting)
    .sort((a,b)=> b.intersectionRatio - a.intersectionRatio);

  if (visible[0]) {
    const idx = parseInt(visible[0].target.dataset.index, 10);
    if (idx !== activeIndex) {
      activeIndex = idx;
      updatePanel(idx);
    }
  }
}, { threshold: buildThresholdList() });

steps.forEach(s => io.observe(s));

function buildThresholdList() {
  // 0~1 사이 20단계
  const thresholds = [];
  for (let i=0; i<=20; i++) thresholds.push(i/20);
  return thresholds;
}

function updatePanel(idx) {
  if (idx >= 0 && idx < hotspots.length) {
    const h = hotspots[idx];
    infoTitle.textContent = h.title;
    infoDesc.textContent = h.desc;
  } else if (idx === -1) {
    infoTitle.textContent = "스크롤로 탐험을 시작하세요";
    infoDesc.textContent = "각 섹션에 도달하면 카메라가 해당 지점으로 접속합니다.";
  } else {
    infoTitle.textContent = "끝";
    infoDesc.textContent = "다시 위로 올려 다른 지점을 감상해 보세요.";
  }
}

// ========== 애니메이션 루프 & 카메라 포커싱 ==========
const clock = new THREE.Clock();
function animate(){
  requestAnimationFrame(animate);

  const t = clock.getElapsedTime();

  // 은은한 움직임
  stars.rotation.y += 0.0005;
  nodes.rotation.y += 0.0006;
  glow.rotation.y  += 0.0006;

  // 핫스팟 미세 호흡
  hsGroup.children.forEach((m, i) => {
    const s = 1.0 + Math.sin(t * 2 + i) * 0.04;
    m.scale.setScalar(s);
  });

  // 카메라 타깃 결정
  let targetPos = new THREE.Vector3(0, 0, 12); // 기본(인트로)
  let lookAt = new THREE.Vector3(0, 0, 0);

  if (activeIndex >= 0 && activeIndex < hotspots.length) {
    // 해당 핫스팟을 일정 거리에서 바라보도록
    const focus = hotspots[activeIndex].pos;
    const dir = focus.clone().normalize(); // 원점 기준 방향
    targetPos = focus.clone().add( dir.clone().multiplyScalar(5.5) ); // 약간 앞에서 멈춤
    lookAt = focus.clone();
  } else if (activeIndex === -2) {
    // 아웃트로: 전체가 보이는 위치로 살짝 줌아웃
    targetPos = new THREE.Vector3(0, 0, 20);
    lookAt = new THREE.Vector3(0, 0, 0);
  }

  // 부드러운 보간
  camera.position.lerp(targetPos, 0.06);
  camera.lookAt(lookAt);

  renderer.render(scene, camera);
}
animate();

// ========== 리사이즈 대응 ==========
window.addEventListener('resize', ()=>{
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
});

