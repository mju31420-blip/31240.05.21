/**
 * 방문·시간표 세션 백그라운드 전송 (메인 UI에는 개발 데이터 미표시)
 * 집계·차트는 /dashboard.html 전용
 */
import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js';
import {
  getFirestore,
  collection,
  addDoc,
  doc,
  updateDoc,
} from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js';

let firebaseConfig = { projectId: 'myeong-biseo-v2' };
try {
  const res = await fetch('/__/firebase/init.json');
  if (res.ok) firebaseConfig = await res.json();
} catch {
  /* Hosting 배포 환경에서만 init.json 제공 */
}

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

window.saveVisitToFirestore = async (data) => {
  await addDoc(collection(db, 'visits'), {
    uid: data.uid || null,
    restaurant: data.restaurant,
    satisfaction: data.satisfaction,
    actualCrowd: data.actualCrowd,
    dow: data.dow,
    hour: data.hour,
    timestamp: data.timestamp || new Date(),
  });
};

window.saveSessionToFirestore = async (data) => {
  const ref = await addDoc(collection(db, 'sessions'), {
    uid: data.uid,
    buildings: data.buildings || [],
    gapMin: data.gapMin ?? 0,
    timestamp: data.timestamp || new Date(),
    visited: false,
  });
  return ref.id;
};

window.markSessionVisited = async (sessionId) => {
  if (!sessionId) return;
  await updateDoc(doc(db, 'sessions', sessionId), { visited: true });
};
