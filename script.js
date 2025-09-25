
// Three.jsとOrbitControlsをインポート
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

// 必要な関数をFirebaseの各サービスからインポートします
import { initializeApp } from "https://www.gstatic.com/firebasejs/9.6.1/firebase-app.js";
import { getAuth, signInAnonymously, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/9.6.1/firebase-auth.js";
import { getFirestore, collection, addDoc, query, orderBy, onSnapshot, serverTimestamp } from "https://www.gstatic.com/firebasejs/9.6.1/firebase-firestore.js";

// ▼▼▼▼▼ あなたのFirebaseプロジェクトの設定情報に必ず書き換えてください ▼▼▼▼▼
const firebaseConfig = {
  apiKey: "AIzaSyCSx3TCBm1N45TXEaSnKupElQOYb7XFNs8",
  authDomain: "mahjong3d-7cc2c.firebaseapp.com",
  projectId: "mahjong3d-7cc2c",
  storageBucket: "mahjong3d-7cc2c.firebasestorage.app",
  messagingSenderId: "155789321113",
  appId: "1:155789321113:web:7029662a31034c1acea908",
  measurementId: "G-M8QW4P14T9"
};
// ▲▲▲▲▲ ここまで ▲▲▲▲▲

// Firebaseアプリを初期化
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// HTMLから操作したい要素を取得します
const roomsContainer = document.getElementById('rooms');
const newRoomForm = document.getElementById('new-room-form');
const newRoomNameInput = document.getElementById('new-room-name');
const currentRoomNameEl = document.getElementById('current-room-name');
const messagesContainer = document.getElementById('messages');
const messageForm = document.getElementById('message-form');
const messageInput = document.getElementById('message-input');
const threeContainer = document.getElementById('three-container');

// アプリ全体で使う変数を準備
let currentUser = null;
let currentRoomId = null;
let unsubscribeMessages = null; 
let unsubscribeRooms = null; 
const threeScenes = {};
let currentThreeScene = null;

// =================================================================
// 認証状態の変更を監視します
// =================================================================
onAuthStateChanged(auth, user => {
    if (user) {
        currentUser = user;
        console.log("ログイン成功！ User ID:", currentUser.uid);
        initChat();
    } else {
        currentUser = null;
        if (unsubscribeRooms) unsubscribeRooms();
        if (unsubscribeMessages) unsubscribeMessages();
    }
});

// 匿名認証でFirebaseにログイン
signInAnonymously(auth).catch(error => {
    console.error("匿名認証に失敗しました:", error);
});

// =================================================================
// チャットのメイン機能
// =================================================================
function initChat() {
    // 新しいルームを作成する機能
    newRoomForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const roomName = newRoomNameInput.value.trim();
        if (roomName && currentUser) {
            addDoc(collection(db, 'rooms'), { name: roomName, createdAt: serverTimestamp() });
            newRoomNameInput.value = '';
        }
    });

    // ルーム一覧をリアルタイムで取得して表示
    const roomsQuery = query(collection(db, 'rooms'), orderBy('createdAt', 'desc'));
    unsubscribeRooms = onSnapshot(roomsQuery, snapshot => {
        roomsContainer.innerHTML = '';
        snapshot.forEach(doc => {
            const room = doc.data();
            const roomElement = document.createElement('div');
            roomElement.textContent = room.name;
            roomElement.style.cursor = 'pointer';
            roomElement.style.padding = '10px 0';
            roomElement.onclick = () => { selectRoom(doc.id, room.name); };
            roomsContainer.appendChild(roomElement);
        });
    });

    // メッセージを送信する機能
    messageForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const messageText = messageInput.value.trim();
        if (messageText && currentUser && currentRoomId) {
            const messagesRef = collection(db, 'rooms', currentRoomId, 'messages');
            addDoc(messagesRef, {
                text: messageText,
                senderId: currentUser.uid,
                senderName: "User " + currentUser.uid.substring(0, 4),
                timestamp: serverTimestamp()
            });
            messageInput.value = '';
        }
    });
}

// =================================================================
// ルーム選択時の処理
// =================================================================
function selectRoom(roomId, roomName) {
    // チャット部分の処理
    currentRoomId = roomId;
    currentRoomNameEl.textContent = roomName;
    messageInput.disabled = false;
    messageForm.querySelector('button').disabled = false;
    if (unsubscribeMessages) unsubscribeMessages();
    messagesContainer.innerHTML = 'メッセージを読み込み中...';
    const messagesRef = collection(db, 'rooms', roomId, 'messages');
    const messagesQuery = query(messagesRef, orderBy('timestamp'));
    unsubscribeMessages = onSnapshot(messagesQuery, snapshot => {
        messagesContainer.innerHTML = '';
        snapshot.forEach(doc => {
            const msg = doc.data();
            const messageElement = document.createElement('div');
            messageElement.classList.add('message');
            messageElement.innerHTML = `<span>${msg.senderName || '名無しさん'}</span>${msg.text}`;
            messagesContainer.appendChild(messageElement);
        });
        messagesContainer.scrollTop = messagesContainer.scrollHeight;
    });

    // Three.jsの処理
    if (!threeScenes[roomId]) {
        threeScenes[roomId] = createThreeScene(threeContainer);
    }
    currentThreeScene = threeScenes[roomId];
    threeContainer.innerHTML = '';
    threeContainer.appendChild(currentThreeScene.renderer.domElement);
    handleResize();
    currentThreeScene.animate();
}

// =================================================================
// Three.jsのシーンを作成する関数
// =================================================================
function createThreeScene(container) {
    // 1. シーン, 2. カメラ, 3. レンダラー
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0xeeeeee);
    const width = container.clientWidth || 1;
    const height = container.clientHeight || 1;
    const camera = new THREE.PerspectiveCamera(75, width / height, 0.1, 1000);
    camera.position.z = 5;
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(width, height);
    renderer.setPixelRatio(window.devicePixelRatio);

    // OrbitControlsの作成
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true; // 滑らかな動き（慣性）を有効にする
    controls.dampingFactor = 0.05;
    controls.autoRotate = true; // 自動で回転させる
    controls.autoRotateSpeed = 1.0;

    // 4. ライト
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
    scene.add(ambientLight);
    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
    directionalLight.position.set(1, 1, 1);
    scene.add(directionalLight);

    // 5. 3Dオブジェクト
    const geometry = new THREE.BoxGeometry(1.5, 1.5, 1.5);
    const material = new THREE.MeshStandardMaterial({ color: Math.random() * 0xffffff, roughness: 0.5 });
    const cube = new THREE.Mesh(geometry, material);
    scene.add(cube);

    // 6. アニメーションループ
    function animate() {
        if (currentThreeScene !== returnedScene) return; // 表示中でなければ停止
        requestAnimationFrame(animate);

        // Dampingが有効な場合、毎フレームcontrolsを更新する必要がある
        controls.update();
        
        renderer.render(scene, camera);
    }
    
    // このシーンに関連するものをまとめて返す
    const returnedScene = { scene, camera, renderer, animate, controls };
    return returnedScene;
}

// =================================================================
// ウィンドウリサイズに対応する関数
// =================================================================
function handleResize() {
    if (!currentThreeScene) return;
    const width = threeContainer.clientWidth;
    const height = threeContainer.clientHeight;
    if (width === 0 || height === 0) return;

    const { camera, renderer } = currentThreeScene;
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    renderer.setSize(width, height);
}
window.addEventListener('resize', handleResize);