// Firebase Configuration
const firebaseConfig = {
  apiKey: "AIzaSyDrNsFp-ca_CN1zNYanxDCoU_tFkxwjH5U",
  authDomain: "toefl-7f173.firebaseapp.com",
  projectId: "toefl-7f173",
  storageBucket: "toefl-7f173.firebasestorage.app",
  messagingSenderId: "385174921337",
  appId: "1:385174921337:web:1fb194f534065a0c57f4a8",
  measurementId: "G-XE5ELWHY9W"
};

// Initialize Firebase
if (typeof firebase !== 'undefined') {
  firebase.initializeApp(firebaseConfig);
}
const db = typeof firebase !== 'undefined' ? firebase.firestore() : null;

// Application State
let state = {
  currentDay: 1,
  completedDays: [], // Array of day numbers completed
  wordBank: {}, // Dictionary of spaced repetition words: { "word": { interval, ease, nextReviewDate } }
  syncId: null, // User's private sync code
  lastUpdated: 0, // Timestamp for sync comparison
  activePage: 'dashboard',
  selectedSentenceId: null, // For interactive article view
  vocabSearchQuery: '',
  vocabFilter: 'all', // 'all', 'learned', 'unlearned'
  currentEvolutionStage: 1
};

// Initialize App
document.addEventListener('DOMContentLoaded', () => {
  initLocalStorage();
  setupEventListeners();
  setupWordClickHandlers();
  setupSyncHandlers();
  updateProgressUI();
  renderDashboard();
  renderRoadmap();
  renderFullArticle();
  renderVocabPage();
  
  // Go to active page
  showPage(state.activePage);
});

// Init Local Storage
function initLocalStorage() {
  const savedProgress = localStorage.getItem('toefl_study_progress');
  if (savedProgress) {
    try {
      const parsed = JSON.parse(savedProgress);
      state.completedDays = parsed.completedDays || [];
      state.wordBank = parsed.wordBank || {};
      state.syncId = parsed.syncId || null;
      state.lastUpdated = parsed.lastUpdated || Date.now();
      
      // Set currentDay to the first uncompleted day
      let firstUncompleted = 1;
      for (let d = 1; d <= 28; d++) {
        if (!state.completedDays.includes(d)) {
          firstUncompleted = d;
          break;
        }
      }
      state.currentDay = firstUncompleted <= 28 ? firstUncompleted : 28;
    } catch (e) {
      console.error("Error parsing progress from localStorage", e);
    }
  }
  
  updateSyncUI();
  
  // If we have a syncId on load, optionally pull latest from cloud
  if (state.syncId && db) {
    pullFromCloud(state.syncId, true);
  }
}

// Save Progress to Local Storage & Cloud
function saveProgress() {
  state.lastUpdated = Date.now();
  
  localStorage.setItem('toefl_study_progress', JSON.stringify({
    completedDays: state.completedDays,
    wordBank: state.wordBank,
    syncId: state.syncId,
    lastUpdated: state.lastUpdated
  }));
  
  if (state.syncId && db) {
    pushToCloud();
  }
}

// --- CLOUD SYNC LOGIC ---
function setupSyncHandlers() {
  const syncStatusBtn = document.getElementById('nav-sync-status');
  const syncModal = document.getElementById('sync-modal');
  const closeBtn = document.getElementById('sync-close-btn');
  const submitBtn = document.getElementById('btn-sync-submit');
  
  if (syncStatusBtn) {
    syncStatusBtn.addEventListener('click', () => {
      syncModal.style.display = 'flex';
      if (state.syncId) {
        document.getElementById('sync-passcode-input').value = state.syncId;
      }
    });
  }
  
  if (closeBtn) closeBtn.onclick = () => syncModal.style.display = 'none';
  
  if (submitBtn) {
    submitBtn.onclick = async () => {
      const input = document.getElementById('sync-passcode-input').value.trim();
      const errorMsg = document.getElementById('sync-error-msg');
      
      if (input.length < 4) {
        errorMsg.innerText = "同步码太短，至少需要4个字符";
        errorMsg.style.display = 'block';
        return;
      }
      
      errorMsg.style.display = 'none';
      submitBtn.innerText = "同步中...";
      
      await pullFromCloud(input, false);
      
      submitBtn.innerText = "开始同步";
      syncModal.style.display = 'none';
    };
  }
}

function updateSyncUI() {
  const statusEl = document.getElementById('nav-sync-status');
  if (statusEl) {
    if (state.syncId) {
      statusEl.innerHTML = `<i class="ri-cloud-line" style="color:var(--success-green);"></i> 已同步: ${state.syncId}`;
    } else {
      statusEl.innerHTML = `<i class="ri-cloud-off-line"></i> 未同步 (点击设置)`;
    }
  }
}

async function pullFromCloud(syncId, isSilent = false) {
  if (!db) return;
  try {
    const docRef = db.collection("users").doc(syncId);
    const docSnap = await docRef.get();
    
    if (docSnap.exists) {
      const cloudData = docSnap.data();
      // Compare timestamps
      if (cloudData.lastUpdated && cloudData.lastUpdated > state.lastUpdated) {
        state.completedDays = cloudData.completedDays || [];
        state.wordBank = cloudData.wordBank || {};
        state.lastUpdated = cloudData.lastUpdated;
        state.syncId = syncId;
        
        // Save to local
        localStorage.setItem('toefl_study_progress', JSON.stringify({
          completedDays: state.completedDays,
          wordBank: state.wordBank,
          syncId: state.syncId,
          lastUpdated: state.lastUpdated
        }));
        
        if (!isSilent) showToast("已从云端成功下载最新进度！");
        updateSyncUI();
        updateProgressUI();
        if (state.activePage === 'study') renderStudyPage();
        if (state.activePage === 'dashboard') renderDashboard();
      } else if (!isSilent && cloudData.lastUpdated <= state.lastUpdated) {
        // Local is newer or same, push local to cloud
        state.syncId = syncId;
        await pushToCloud();
        showToast("已将本地最新进度上传至云端！");
        updateSyncUI();
      }
    } else {
      // Cloud document doesn't exist, this is a new user
      state.syncId = syncId;
      await pushToCloud();
      if (!isSilent) showToast("已在云端为你创建专属空间并上传初始进度！");
      updateSyncUI();
    }
  } catch (e) {
    console.error("Error pulling from cloud", e);
    if (!isSilent) {
      const errorMsg = document.getElementById('sync-error-msg');
      if (errorMsg) {
        errorMsg.innerText = "网络或数据库错误，请重试";
        errorMsg.style.display = 'block';
      } else {
        alert("同步失败，请检查网络");
      }
    }
  }
}

async function pushToCloud() {
  if (!db || !state.syncId) return;
  try {
    await db.collection("users").doc(state.syncId).set({
      completedDays: state.completedDays,
      wordBank: state.wordBank,
      lastUpdated: state.lastUpdated
    });
  } catch (e) {
    console.error("Error pushing to cloud", e);
  }
}


// Update Global Progress Bars and Side Info
function updateProgressUI() {
  const percent = Math.round((state.completedDays.length / 28) * 100);
  
  // Update sidebar widgets
  const bar = document.getElementById('sidebar-progress-bar');
  if (bar) bar.style.width = `${percent}%`;
  
  const text = document.getElementById('sidebar-progress-text');
  if (text) text.innerText = `${state.completedDays.length}/28 天`;
  
  // Update dashboard stats
  const statPercentVal = document.getElementById('stat-percent-value');
  if (statPercentVal) statPercentVal.innerText = `${percent}%`;
  
  const statDaysVal = document.getElementById('stat-days-value');
  if (statDaysVal) statDaysVal.innerText = `${state.completedDays.length} 天`;
  
  const statWordsVal = document.getElementById('stat-words-value');
  if (statWordsVal) {
    // Count vocabulary words learned so far (from completed days)
    let wordCount = 0;
    toeflData.forEach(dayItem => {
      if (state.completedDays.includes(dayItem.day)) {
        wordCount += dayItem.vocabulary.length;
      }
    });
    statWordsVal.innerText = `${wordCount} 个`;
  }
}

// Setup Event Listeners
function setupEventListeners() {
  // Navigation Menu Links
  const navItems = document.querySelectorAll('.nav-item');
  navItems.forEach(item => {
    item.addEventListener('click', (e) => {
      e.preventDefault();
      const pageId = item.getAttribute('data-page');
      
      // Remove active class from other items
      navItems.forEach(n => n.classList.remove('active'));
      // Add to clicked
      item.classList.add('active');
      
      showPage(pageId);
    });
  });

  // Today sentence play btn
  const dashboardPlayBtn = document.getElementById('dashboard-play-btn');
  if (dashboardPlayBtn) {
    dashboardPlayBtn.addEventListener('click', () => {
      const todayData = toeflData[state.currentDay - 1];
      if (todayData) speakText(todayData.original);
    });
  }

  // Study page navigation
  const prevBtn = document.getElementById('btn-prev-day');
  if (prevBtn) {
    prevBtn.addEventListener('click', () => {
      if (state.currentDay > 1) {
        state.currentDay--;
        renderStudyPage();
      }
    });
  }

  const nextBtn = document.getElementById('btn-next-day');
  if (nextBtn) {
    nextBtn.addEventListener('click', () => {
      if (state.currentDay < 28) {
        state.currentDay++;
        renderStudyPage();
      }
    });
  }

  // Vocab page search and filters
  const searchInput = document.getElementById('vocab-search');
  if (searchInput) {
    searchInput.addEventListener('input', (e) => {
      state.vocabSearchQuery = e.target.value.toLowerCase().trim();
      renderVocabPage();
    });
  }

  const filterBtns = document.querySelectorAll('.filter-btn');
  filterBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      filterBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      state.vocabFilter = btn.getAttribute('data-filter');
      renderVocabPage();
    });
  });
}

// Page Router
function showPage(pageId) {
  state.activePage = pageId;
  
  // Hide all pages
  const pages = document.querySelectorAll('.page');
  pages.forEach(p => p.classList.remove('active'));
  
  // Show target page
  const targetPage = document.getElementById(`page-${pageId}`);
  if (targetPage) targetPage.classList.add('active');
  
  // Sync Nav Sidebar Selection (e.g. if navigated programmatically)
  const navItems = document.querySelectorAll('.nav-item');
  navItems.forEach(n => {
    if (n.getAttribute('data-page') === pageId) {
      n.classList.add('active');
    } else {
      n.classList.remove('active');
    }
  });

  // Call rendering functions for specific pages
  if (pageId === 'dashboard') {
    renderDashboard();
    renderRoadmap();
  } else if (pageId === 'study') {
    renderStudyPage();
  } else if (pageId === 'vocab') {
    renderVocabPage();
  } else if (pageId === 'review') {
    renderReviewPage();
  }
}

// Speak text using SpeechSynthesis (with mobile iOS Safari fixes)
function speakText(text) {
  if ('speechSynthesis' in window) {
    // Fix 1: iOS Safari bug where cancel() breaks immediate subsequent speak()
    if (window.speechSynthesis.speaking) {
      window.speechSynthesis.cancel();
    }
    
    // Fix 2: Add a tiny delay to ensure cancel() finishes
    setTimeout(() => {
      const utterance = new SpeechSynthesisUtterance(text);
      
      // Fix 3: iOS Safari garbage collection bug
      // If utterance is garbage collected before speaking finishes, it stops.
      window.__currentUtterance = utterance; 
      
      utterance.lang = 'en-US';
      utterance.rate = 0.9; // Slightly slower for better learning
      
      // Find a suitable English voice
      const voices = window.speechSynthesis.getVoices();
      if (voices.length > 0) {
        const enVoice = voices.find(v => v.lang.includes('en-US') && (v.name.includes('Google') || v.name.includes('Siri') || v.name.includes('Samantha'))) ||
                        voices.find(v => v.lang.includes('en-US')) ||
                        voices.find(v => v.lang.includes('en'));
        if (enVoice) utterance.voice = enVoice;
      }
      
      window.speechSynthesis.speak(utterance);
    }, 50);
  } else {
    alert("您的浏览器不支持语音合成播放。");
  }
}

// Load SpeechVoices in case they are loaded asynchronously
if ('speechSynthesis' in window) {
  window.speechSynthesis.onvoiceschanged = () => {
    // Just trigger voice reload in browser
  };
}

// --- DASHBOARD RENDERER ---
function renderDashboard() {
  // Update welcome day text
  const dashboardWelcomeTitle = document.getElementById('dashboard-welcome-title');
  if (dashboardWelcomeTitle) {
    const isCompleted = state.completedDays.includes(state.currentDay);
    if (state.completedDays.length === 28) {
      dashboardWelcomeTitle.innerText = "恭喜！您已学完全部内容！";
    } else {
      dashboardWelcomeTitle.innerText = `今天是您的第 ${state.completedDays.length + 1} 天学习`;
    }
  }

  // Update today sentence box
  const sentenceTextEl = document.getElementById('dashboard-sentence-text');
  const sentenceTransEl = document.getElementById('dashboard-sentence-translation');
  const dashboardCardTitle = document.getElementById('dashboard-card-title');
  
  const todayData = toeflData[state.currentDay - 1];
  if (todayData) {
    if (dashboardCardTitle) dashboardCardTitle.innerText = `今日推荐：第 ${todayData.day} 天句子 (第 ${todayData.paragraph} 段)`;
    if (sentenceTextEl) sentenceTextEl.innerText = todayData.original;
    if (sentenceTransEl) sentenceTransEl.innerText = todayData.originalTranslation;
  }
  
  // Dashboard Start Button
  const dashboardStartBtn = document.getElementById('dashboard-start-btn');
  if (dashboardStartBtn) {
    dashboardStartBtn.onclick = (e) => {
      e.preventDefault();
      showPage('study');
    };
    if (state.completedDays.length === 28) {
      dashboardStartBtn.innerHTML = `重新复习第一句 <i class="ri-arrow-right-line"></i>`;
      dashboardStartBtn.onclick = (e) => {
        e.preventDefault();
        state.currentDay = 1;
        showPage('study');
      };
    } else {
      const isCompleted = state.completedDays.includes(state.currentDay);
      dashboardStartBtn.innerHTML = isCompleted ? `进入复习 <i class="ri-arrow-right-line"></i>` : `开始今日挑战 <i class="ri-arrow-right-line"></i>`;
    }
  }
}

// Render Dashboard Roadmap
function renderRoadmap() {
  const roadmapContainer = document.getElementById('dashboard-roadmap-list');
  if (!roadmapContainer) return;
  
  roadmapContainer.innerHTML = '';
  
  toeflData.forEach(item => {
    const roadmapItem = document.createElement('div');
    roadmapItem.className = 'roadmap-item';
    
    // Determine status classes
    const isCompleted = state.completedDays.includes(item.day);
    const isCurrent = state.currentDay === item.day;
    
    if (isCompleted) roadmapItem.classList.add('completed');
    if (isCurrent) roadmapItem.classList.add('current');
    
    // Truncate original sentence for snippet
    const truncated = item.original.length > 50 ? item.original.substring(0, 50) + '...' : item.original;
    
    roadmapItem.innerHTML = `
      <div class="roadmap-item-info">
        <div class="roadmap-day-badge">${item.day}</div>
        <div>
          <div class="roadmap-day-title">Day ${item.day}</div>
          <div style="font-size:12px; color:var(--text-secondary); margin-top:2px;">${truncated}</div>
        </div>
      </div>
      <div class="roadmap-status-icon">
        <i class="${isCompleted ? 'ri-checkbox-circle-fill' : (isCurrent ? 'ri-play-circle-fill' : 'ri-checkbox-blank-circle-line')}"></i>
      </div>
    `;
    
    roadmapItem.addEventListener('click', () => {
      state.currentDay = item.day;
      showPage('study');
    });
    
    roadmapContainer.appendChild(roadmapItem);
  });
}

// --- STUDY PAGE RENDERER ---
function renderStudyPage(resetStage = true) {
  const data = toeflData[state.currentDay - 1];
  if (!data) return;
  
  if (resetStage) {
    state.currentEvolutionStage = 1;
  }
  
  // Enable/Disable Nav buttons
  document.getElementById('btn-prev-day').disabled = (state.currentDay === 1);
  document.getElementById('btn-next-day').disabled = (state.currentDay === 28);
  
  // Day titles
  document.getElementById('study-day-title').innerText = `DAY ${data.day}`;
  document.getElementById('study-para-title').innerText = `第 ${data.paragraph} 段`;
  
  // Original sentence text
  document.getElementById('study-original-text').innerText = data.original;
  
  // Speaker btn for original sentence
  const origSpeakBtn = document.getElementById('study-original-speak-btn');
  origSpeakBtn.onclick = () => speakText(data.original);
  
  // Hide translation initially
  const transBtn = document.getElementById('study-trans-btn');
  const transText = document.getElementById('study-trans-text');
  transBtn.style.display = 'block';
  transText.style.display = 'none';
  transText.innerText = data.originalTranslation;
  
  transBtn.onclick = () => {
    transBtn.style.display = 'none';
    transText.style.display = 'block';
  };
  
  // Render Evolution Timeline (dots)
  const timelineContainer = document.getElementById('study-evolution-timeline');
  timelineContainer.innerHTML = '';
  
  const numStages = data.evolution.length;
  data.evolution.forEach((evo, idx) => {
    const stageNum = idx + 1;
    const dot = document.createElement('div');
    dot.className = 'evolution-dot';
    if (stageNum === state.currentEvolutionStage) dot.classList.add('active');
    dot.innerText = stageNum;
    
    dot.onclick = () => {
      state.currentEvolutionStage = stageNum;
      renderActiveEvolutionStep();
    };
    
    timelineContainer.appendChild(dot);
    
    // Add connector line if not the last one
    if (stageNum < numStages) {
      const line = document.createElement('div');
      line.className = 'evolution-line';
      if (stageNum < state.currentEvolutionStage) line.classList.add('active');
      timelineContainer.appendChild(line);
    }
  });
  
  // Render current active step inside card
  renderActiveEvolutionStep();
  
  // Render Day Vocabulary list
  const vocabContainer = document.getElementById('study-vocab-list');
  vocabContainer.innerHTML = '';
  
  if (data.vocabulary.length === 0) {
    vocabContainer.innerHTML = '<div style="color:var(--text-muted); font-size:14px; text-align:center; padding:10px 0;">今日无生词</div>';
  } else {
    data.vocabulary.forEach(vocab => {
      const vocabItem = document.createElement('div');
      vocabItem.className = 'vocab-item';
      vocabItem.innerHTML = `
        <div class="vocab-word">${vocab.word}</div>
        <div class="vocab-meaning">${vocab.meaning}</div>
      `;
      vocabContainer.appendChild(vocabItem);
    });
  }
  
  // Manage Complete Button status
  const completeBtn = document.getElementById('study-complete-btn');
  const isCompleted = state.completedDays.includes(data.day);
  
  if (isCompleted) {
    completeBtn.className = 'complete-btn completed';
    completeBtn.innerHTML = `<i class="ri-checkbox-circle-fill"></i> 今日学习已完成`;
    completeBtn.onclick = null;
  } else {
    completeBtn.className = 'complete-btn uncompleted';
    completeBtn.innerHTML = `<i class="ri-checkbox-circle-line"></i> 打卡打卡，完成今日学习`;
    completeBtn.onclick = () => {
      startDailyQuiz(data.day);
    };
  }
  
  // Render Grammar Points
  const grammarList = document.getElementById('study-grammar-list');
  grammarList.innerHTML = '';
  
  // Check if grammar data exists for this day
  if (typeof toeflGrammarData !== 'undefined' && toeflGrammarData[state.currentDay]) {
    const grammars = toeflGrammarData[state.currentDay];
    grammars.forEach(g => {
      const item = document.createElement('div');
      item.className = 'vocab-item';
      item.innerHTML = `
        <div class="vocab-word" style="color: var(--accent-gold); font-size: 15px;">
          <i class="ri-bookmark-3-line" style="font-size: 14px; margin-right: 4px;"></i>${g.point}
        </div>
        <div class="vocab-meaning" style="font-size: 13px; line-height: 1.5;">${g.explanation}</div>
      `;
      grammarList.appendChild(item);
    });
  } else {
    grammarList.innerHTML = '<div class="vocab-meaning">暂无语法解析</div>';
  }
}

// Render active evolution step card contents
function renderActiveEvolutionStep() {
  const data = toeflData[state.currentDay - 1];
  if (!data) return;
  
  const stepIdx = state.currentEvolutionStage - 1;
  const currentStep = data.evolution[stepIdx];
  if (!currentStep) return;
  
  // Update timeline dots/lines active states
  const dots = document.querySelectorAll('.evolution-dot');
  dots.forEach((dot, idx) => {
    if (idx + 1 === state.currentEvolutionStage) {
      dot.classList.add('active');
    } else {
      dot.classList.remove('active');
    }
  });
  
  const lines = document.querySelectorAll('.evolution-line');
  lines.forEach((line, idx) => {
    if (idx + 1 < state.currentEvolutionStage) {
      line.classList.add('active');
    } else {
      line.classList.remove('active');
    }
  });
  
  // Update card text
  document.getElementById('evolution-stage-badge').innerText = currentStep.level;
  
  // Highlighting new words compared to previous stage
  const prevStepText = stepIdx > 0 ? data.evolution[stepIdx - 1].text : '';
  const textEl = document.getElementById('evolution-text');
  textEl.innerHTML = getEvolutionTextHTML(prevStepText, currentStep.text);
  
  document.getElementById('evolution-translation').innerText = currentStep.translation;
  document.getElementById('evolution-change-text').innerText = currentStep.change;
  
  // Audio speaker listener
  document.getElementById('evolution-speak-btn').onclick = () => speakText(currentStep.text);
  
  // Navigation controls
  const prevStageBtn = document.getElementById('btn-prev-stage');
  const nextStageBtn = document.getElementById('btn-next-stage');
  
  prevStageBtn.disabled = (state.currentEvolutionStage === 1);
  nextStageBtn.disabled = (state.currentEvolutionStage === data.evolution.length);
  
  prevStageBtn.onclick = () => {
    if (state.currentEvolutionStage > 1) {
      state.currentEvolutionStage--;
      renderActiveEvolutionStep();
    }
  };
  
  nextStageBtn.onclick = () => {
    if (state.currentEvolutionStage < data.evolution.length) {
      state.currentEvolutionStage++;
      renderActiveEvolutionStep();
    }
  };

  // Show/Hide the official TOEFL original sentence card depending on whether the user reached the final stage
  const originalCard = document.getElementById('study-original-card');
  const grammarCard = document.getElementById('study-grammar-card');
  
  if (originalCard) {
    if (state.currentEvolutionStage === data.evolution.length) {
      originalCard.style.display = 'block';
      if (grammarCard) grammarCard.style.display = 'flex'; // It's a vocab-card flex container
      // Automatically scroll the original card into view if it was hidden
      originalCard.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    } else {
      originalCard.style.display = 'none';
      if (grammarCard) grammarCard.style.display = 'none';
    }
  }
}

// Dictionary Database of All Words in the Passage (Tailored to Teotihuacan/TOEFL Context)
const localDict = {
  // Nouns (Contextualized to Mesoamerican / Teotihuacan archaeology)
  "city": "城市（特指特奥蒂瓦坎城）",
  "teotihuacan": "特奥蒂瓦坎（墨西哥古城遗址）",
  "mexico": "墨西哥（中美洲国家）",
  "kilometers": "公里，千米",
  "growth": "成长，发展（指城市面积与规模的扩张）",
  "height": "鼎盛时期，顶点（公元150至700年间的繁荣期）",
  "population": "人口（指特奥蒂瓦坎市的居民数量）",
  "square": "平方的（如 square kilometers 平方公里）",
  "apartment": "公寓（指特奥蒂瓦坎供多户家庭居住的独特泥砖结构建筑）",
  "complexes": "群，综合体（如 apartment complexes 公寓楼群）",
  "market": "市场（城市大宗商品和本地物产交易的中心）",
  "workshops": "作坊，车间（特指大规模加工黑曜石、陶瓷的工场）",
  "center": "中心（指行政、宗教或经济交汇地）",
  "edifices": "宏伟建筑物（如金字塔、神庙等宏大宗教建筑）",
  "grid": "网格（指街道横平竖直、规划整齐的棋盘状布局）",
  "pattern": "模式，格局（指特奥蒂瓦坎整齐划一的城市布局）",
  "streets": "街道",
  "buildings": "建筑物",
  "planning": "规划（指城市建设有中央机构提前设计，非盲目自发成长）",
  "control": "控制，统筹管理",
  "expansion": "扩张，扩张范围（指城市面积的不断外扩）",
  "ordering": "规划，规整（对城市布局和街道秩序的整理）",
  "metropolis": "大都市，首府（特指特奥蒂瓦坎这一庞大的区域核心城市）",
  "contacts": "往来，交往，商贸联系（指城市与外界的经贸与宗教往来）",
  "mesoamerica": "中美洲（指墨西哥南部至哥斯达黎加北部的历史文化区）",
  "development": "发展，建设进程（指城市化发展）",
  "valley": "谷地，山谷（指特奥蒂瓦坎谷地）",
  "factors": "因素，原因（促成城市崛起的种种条件）",
  "location": "位置，区位（指扼守天然贸易通道的地理区位）",
  "route": "路线，通道（指通往南部和东部的重要贸易通道）",
  "obsidian": "黑曜石（火山玻璃，是特奥蒂瓦坎制作利刃、祭祀器皿的支柱资源）",
  "resources": "资源，矿产（特指谷地内的黑曜石矿产）",
  "potential": "潜力，潜在优势（指灌溉农耕或资源开发的潜在价值）",
  "irrigation": "灌溉（引入河水浇灌农田的技术，以保障庞大人口的粮食供应）",
  "role": "角色，作用（指某一因素在城市兴起中的贡献）",
  "significance": "重要性，特殊意义（指其作为宗教圣地的崇高地位）",
  "shrine": "神殿，圣地，朝圣所（吸引大批朝圣者聚集的宗教场所）",
  "situation": "局势，状况（指公元前第一个千年末墨西哥谷地群雄割据的历史态势）",
  "ingenuity": "聪明才智，独创性（指统治阶层设计城市和调配资源的智慧）",
  "foresightedness": "远见，先见之明（指精英阶层长远的战略眼光）",
  "elite": "精英阶层，统治集团（控制城市经济、政治和宗教的少数掌权者）",
  "impact": "影响，冲击（指火山爆发等天灾对人类定居点产生的连锁反应）",
  "disasters": "自然灾害（如火山喷发）",
  "eruptions": "喷发（火山爆发）",
  "rise": "兴起，崛起",
  "centers": "中心（指墨西哥谷地内并存的多个小城镇中心）",
  "rival": "竞争对手（特指库伊库伊尔科，曾是特奥蒂瓦坎最大的竞争者）",
  "towns": "城镇（墨西哥中部的小型人类定居点）",
  "power": "强国，势力，政权（指特奥蒂瓦坎崛起为区域政治经济强国）",
  "evidence": "证据（如考古挖掘出的黑曜石工具和建筑遗存）",
  "force": "力量，主导势力（特指在区域内占统治地位的政治力量）",
  "edge": "竞争优势（指资源优势和地理优势）",
  "neighbors": "邻里，邻近定居点（指周边的其他竞争性城镇）",
  "highlands": "高地（指墨西哥和危地马拉的火山多发高原区）",
  "stone": "石头（这里指硬度极高、边缘锋利的黑曜石火山石）",
  "demand": "需求（指整个中美洲对优质切割工具的巨大需求）",
  "olmec": "奥尔梅克（中美洲古老文明，以巨石人像闻名）",
  "olmecs": "奥尔梅克人",
  "shines": "神庙",
  "shrines": "神殿群",
  "market": "市场，销路（指黑曜石稳定的外部买家和分销网络）",
  "research": "研究",
  "tools": "工具（指用黑曜石制作的刮削器、箭头和刀具）",
  "sites": "遗址，考古现场（如奥尔梅克遗址）",
  "commodity": "商品，有价值的货物（指长途贩运的黑曜石）",
  "trade": "贸易，商业往来",
  "goods": "货物，商品（指特奥蒂瓦坎的黑曜石与外地的珍贵奢侈品）",
  "life": "生活，生活水平（指精英阶层的富裕生活）",
  "immigrants": "移民，外来人口（因商贸、避难或朝圣而迁入特奥蒂瓦坎的人）",
  "inhabitants": "居民，原住民，居住者",
  "magnet": "磁铁，吸引中心（指神庙或财富对周围人口产生的巨大凝聚力）",
  "fields": "田地，农田（指进行人工灌溉的耕地）",
  "feedback": "反馈（指黑曜石、人口、贸易、灌溉相互促进的良性循环）",
  "operation": "业务，运作（指黑曜石的开采、加工和销售全产业链）",
  "miners": "矿工（在采石场开采黑曜石原料的劳动力）",
  "manufacturers": "制造商，手工业者（加工黑曜石工具的工匠）",
  "traders": "贸易商，商人（负责长途运输和销售黑曜石的贩子）",
  "wealth": "财富（通过垄断贸易积攒的社会剩余资产）",
  "turn": "轮流，依次，反过来（如 in turn 反过来）",
  "means": "手段，方法，工具（指精英阶层拥有的行政或军事控制手段）",
  "additions": "补充，增加的人员（补充到城市里的劳动力）",
  "labor": "劳动力（这里指从事农业和手工业的基础劳工）",
  "works": "工程设施，工厂（如 irrigation works 灌溉水利设施）",

  // Verbs (Contextualized)
  "lay": "位于，坐落在（lie的过去式，这里指城市地理位置）",
  "began": "开始（begin的过去式，指城市成长的起点）",
  "grew": "成长，增长（grow的过去式）",
  "grow": "生长，成长，发展",
  "probably": "很可能，大概（表示学术推测语气）",
  "had": "拥有（have的过去式）",
  "covered": "占地，覆盖面积为（cover的过去式）",
  "cover": "覆盖，占地面积为",
  "involved": "涉及，卷入（指城市建设中包含了中央权力的介入）",
  "involve": "涉及，包含",
  "take place": "发生，进行",
  "took place": "发生，进行（take place的过去式）",
  "happen": "发生，产生",
  "happened": "发生，产生（happen的过去式）",
  "pinpoint": "精准确定，指出（指难以精确评估宗教等因素的具体贡献）",
  "coexisted": "共存，同时存在（指早期谷地内有多个小中心并立）",
  "coexist": "共存，并存",
  "affected": "受波及，受严重影响（指对手库伊库伊尔科被火山喷发摧毁）",
  "affect": "影响，波及",
  "eliminated": "排除，消除，使退出竞争（指竞争对手因天灾退出历史舞台）",
  "eliminate": "排除，消除",
  "emerged": "脱颖而出，崛起为（emerge of过去式）",
  "emerge": "脱颖而出，显现",
  "emerges": "显现，浮现出来",
  "indicates": "表明，指出（indicate的单三，指考古证据显示）",
  "indicate": "表明，指示",
  "arise": "崛起，出现",
  "arose": "崛起，兴起（arise的过去式）",
  "gave": "给予，带去（give的过去式）",
  "give": "给予，赋予",
  "flourished": "繁荣，昌盛（flourish的过去式，形容文明的鼎盛）",
  "flourish": "繁荣，兴盛",
  "originated": "起源于，发源于（originate的过去式，指产地为特奥蒂瓦坎）",
  "originate": "起源于",
  "recognized": "被公认为，被认作（recognize的过去分词，指产品地位确立）",
  "recognize": "公认，承认；认清",
  "attracted": "吸引（attract的过去式，指吸引了大量外来人口）",
  "attract": "吸引，招揽",
  "attempted": "试图，努力（attempt的过去式，指统治阶层有目的的招徕人口）",
  "attempt": "企图，试图",
  "served": "充当，起...作用（serve的过去式）",
  "serve": "充当，服务，起到...的作用",
  "fed": "供养，喂养（feed的过去式和过去分词，指供养庞大城市人口）",
  "necessitate": "需要，使...成为必要（指产业规模扩大导致劳动力需求增加）",
  "necessitated": "需要，使...成为必要（过去式）",
  "led": "导致，带来（lead的过去式，指因果关系）",
  "lead": "导致，引导",
  "coerce": "强迫，人身挟持（指动用行政或军事力量强制迁移）",
  "coerced": "强迫，胁迫（过去式）",
  "move": "搬迁，移动",
  "resulted": "导致，结果是（result的过去式）",
  "result": "导致，结果是",

  // Adjectives, Adverbs, and Functional Words (Contextualized)
  "modern-day": "现代的，当今的",
  "modern": "现代的",
  "about": "大约，接近（表示约数）",
  "northeast": "东北方向",
  "industrial": "手工业的，工业的（指特奥蒂瓦坎的大规模工匠加工性质）",
  "administrative": "行政的，管理机构的",
  "massive": "宏大的，宏伟的",
  "religious": "宗教的，神圣的",
  "regular": "规则的，整齐的（指棋盘格状街道布局）",
  "clearly": "显然地，明确地",
  "economic": "经济的，商贸的",
  "perhaps": "也许，可能（委婉推测）",
  "geographic": "地理上的",
  "natural": "天然的，自然形成的",
  "extensive": "广泛的，大规模的（指大面积农田灌溉）",
  "exact": "确切的，精确的",
  "difficult": "困难的，难以...",
  "historical": "历史上的，历史进程中的",
  "first": "第一，最早的",
  "last": "最后的（指上文列出的最后一个因素——火山爆发）",
  "relative": "相对地",
  "relatively": "相对地，比较而言地",
  "modest": "普通的，规模不大的（相比特奥蒂瓦坎而言）",
  "leading": "主要的，首要的，领先的（指龙头强国）",
  "predominant": "占绝对支配地位的，首屈一指的",
  "valuable": "有价值的，珍贵的（指黑曜石在古代是非常珍贵的切割材料）",
  "secure": "稳固的，有保障的（指黑曜石在古代始终有旺盛的市场）",
  "recent": "最近的，近期的",
  "long-distance": "长途的，远距离的（指跨越数百公里的跨地区贸易）",
  "exotic": "异域的，外来的（指通过黑曜石换回的贝壳、羽毛等稀有物资）",
  "prosperous": "富裕的，繁荣的（指统治者过着优裕的生活）",
  "additional": "额外的，更多的",
  "growing": "不断增长的（指城市化发展中激增的人口）",
  "increasing": "增加的，不断扩大的",
  "positive": "积极的，正面的（如 positive feedback 正反馈/良性循环）",
  "thriving": "蓬勃发展的，欣欣向荣的（形容商业或生产兴旺）",
  "consciously": "有意识地，主动地（指并非自发，而是精英阶层有规划的行为）",
  "physically": "人身上地，肉体上地（指动用武装强迫人口迁移）",
  
  // Basic Grammar Words
  "the": "这/那（定冠词，特指）",
  "a": "一个（不定冠词）",
  "an": "一个（用于元音发音开头的词前）",
  "and": "和，并且",
  "or": "或者",
  "of": "的（表所属）",
  "to": "去，到；向；以致于；（后接动词原型）去做",
  "in": "在...之中，在...里面",
  "on": "在...之上，处于...状态",
  "with": "随着，伴随，拥有（表示伴随状态）",
  "by": "在...之前，到...时；通过...方式",
  "for": "为了，对于",
  "at": "在（特定的时间或地点）",
  "from": "来自，从",
  "as": "作为，充当；因为；随着",
  "it": "它（指代城市）",
  "its": "它的（指代城市的）",
  "this": "这个，这（指代刚刚提到的因素或城市）",
  "these": "这些",
  "that": "那个；（定语从句中指代前面的先行词）",
  "who": "（定语从句中指代人，这里指精英阶层）",
  "which": "（定语从句中指代前面的地点或事物）",
  "is": "是（单三现在时）",
  "was": "是（过去时单数）",
  "are": "是（现在时复数）",
  "were": "是（过去时复数）",
  "be": "是，成为",
  "been": "是，曾经是（过去分词）",
  "did": "确实，真的（助动词，起强调作用）",
  "have": "有，已经",
  "has": "有，已经（单三）",
  "had": "有，已经（过去式）",
  "more": "更多的，更",
  "most": "最多的，最",
  "many": "许多的",
  "much": "许多的，大量的",
  "some": "一些，某些",
  "any": "任何一个，一些",
  "other": "其他的，另外的",
  "such": "这样的，如此的",
  "also": "而且，也",
  "but": "但是，然而",
  "though": "然而，虽然",
  "however": "然而，但是",
  "so": "所以，因此",
  "then": "然后，那时",
  "finally": "最后，最终",
  "last": "最后的；上一个的",
  "end": "结束，末尾",
  "year": "年",
  "years": "数年，许多年",
  "century": "世纪",
  "centuries": "数世纪",
  "millennium": "千年",
  "b.c.": "公元前（Before Christ 的缩写）",
  "a.d.": "公元（Anno Domini 的缩写，指公元纪年）",
  "bc": "公元前",
  "ad": "公元",
  "site": "遗址",
  "sites": "遗址（复数）",
  "sites'": "遗址的",

  // Common prepositions and adjectives often missing
  "near": "靠近，在...附近（指地理位置相近）",
  "here": "这里，在此地",
  "there": "那里，在那里",
  "how": "如何，怎样",
  "why": "为什么",
  "where": "在哪里，在那里",
  "when": "当...时候；什么时候",
  "what": "什么",
  "between": "在...之间（指时间区间或两者之间）",
  "around": "大约，在...周围",
  "along": "沿着，随着",
  "over": "超过，在...之上",
  "after": "在...之后",
  "before": "在...之前",
  "up": "向上，起来",
  "out": "在外面，向外",
  "into": "进入，到...里",
  "through": "经由，通过",
  "under": "在...下面，少于",
  "within": "在...之内",
  "toward": "向，朝着（如 toward the end 走向末期）",
  "towards": "向，朝着",
  "beyond": "超出，在...之外",
  "among": "在...之中（三者或以上）",
  "against": "对着，反对",
  "during": "在...期间",
  "since": "自从，因为",
  "until": "直到...为止",
  "including": "包括，包含",
  "despite": "尽管，即使",
  "throughout": "贯穿，遍及",

  // Common adjectives
  "big": "大的，巨大的",
  "large": "大的，大量的",
  "small": "小的，不起眼的",
  "little": "小的，少量的",
  "great": "伟大的，宏大的，极好的",
  "long": "长的，长时间的",
  "high": "高的，高度的",
  "low": "低的，少量的",
  "new": "新的",
  "old": "古老的，旧的",
  "early": "早期的，早的（如 as early as 早在）",
  "late": "晚期的，后期的（如 late first millennium 千年末期）",
  "main": "主要的，最重要的",
  "major": "重大的，主要的",
  "key": "关键的，关键",
  "certain": "一些，某些；确定的",
  "clear": "清楚的，明显的",
  "likely": "很可能的",
  "possible": "可能的",
  "important": "重要的",
  "ancient": "古代的，古老的",
  "classic": "经典的，标准的",
  "unique": "独特的，独一无二的",
  "based": "基于，以...为基础的",
  "located": "位于，坐落在（过去分词用作形容词）",
  "known": "已知的，著名的",
  "given": "鉴于，考虑到",
  "found": "发现，找到（find的过去式）；建立（found的过去式）",
  "made": "制造，使...",
  "used": "使用，被用于（use的过去式）",
  "called": "叫做，称为",
  "seen": "看见（see的过去分词）",
  "thought": "认为，想（think的过去式）",
  "become": "成为，变为",
  "became": "成为（become的过去式）",
  "come": "来，到来",
  "came": "来，到来（come的过去式）",
  "make": "使，制造，建设",
  "take": "带走，采取",
  "need": "需要",
  "use": "使用，利用",
  "build": "建造，构建",
  "built": "建造（build的过去式）",
  "show": "显示，表明",
  "shown": "显示（过去分词）",
  "work": "工作，运作；有效果",
  "live": "生活，居住",
  "lived": "生活（live的过去式）",
  "get": "得到，获得",
  "got": "得到（get的过去式）",
  "know": "知道，了解",
  "known": "已知的，众所周知的",
  "sell": "出售，销售",
  "sold": "售出（sell的过去式）",
  "carry": "携带，运输",
  "carried": "携带（carry的过去式）",
  "become": "成为",
  "believe": "认为，相信",
  "likely": "很可能（形）",
  "seems": "看来，似乎",
  "seem": "看来，好像",
  "seemed": "似乎（seem的过去式）",
  "probably": "很可能，大概",
  "perhaps": "也许，可能",
  "clearly": "显然，清楚地",
  "moreover": "此外，而且（连接词，引出新的论点）",
  "moreover": "此外，另外",
  "furthermore": "而且，此外",
  "therefore": "因此，所以",
  "thus": "由此，因而",
  "hence": "因此，从而",
  "indeed": "实际上，确实",
  "still": "仍然，还是",
  "already": "已经",
  "always": "总是，始终",
  "often": "经常",
  "likely": "有可能地",
  "eventually": "最终，终于",
  "eventually": "最终",
  "only": "仅仅，只有",
  "even": "甚至，即使",
  "just": "正好，仅仅",
  "rather": "相当，而是",
  "quite": "相当，非常",
  "whether": "是否",
  "no": "没有，不",
  "not": "不，没有",
  "never": "从不，决不",
  "both": "两者都",
  "either": "两者之一；或者",
  "each": "每个，各自",
  "every": "每个，每一",
  "several": "几个，若干",
  "few": "很少的，几乎没有",
  "least": "最少的，至少",
  "enough": "足够的",
  "rather": "相当地；宁愿",
  "soon": "很快，不久",
  "very": "非常",
  "well": "好好地",
  "too": "也，太",
  "might": "可能（情态动词，表推测）",
  "would": "会，将（情态动词，表假设或虚拟）",
  "could": "能够（情态动词，表过去的能力或可能）",
  "should": "应该（情态动词）",
  "must": "必定，一定（情态动词，表强推测）",
  "may": "可能，也许（情态动词，表推测）",
  "can": "能，可以",
  "will": "将会（助动词）",
  "shall": "将，应当",
  "let": "让",
  "do": "做，进行",
  "does": "做（单三）",
  "may have": "可能已经（表示对过去情况的推测）",
  "might have": "可能已经（虚拟语气，对过去的假设推测）",
  "must have": "一定已经（表强推测）",
  "cuicuilco": "库伊库伊尔科（墨西哥谷地古城镇，后被火山摧毁）",
  "guatemalan": "危地马拉的",
  "central": "中央的；中部的",
  "edge": "竞争优势",
  "stoned": "石头的",
  "miners": "矿工",
  "manufacturers": "制造商，手工业工匠",
  "traders": "贸易商，商人",
  "coerce": "强迫，胁迫",
  "additions": "增加的人员",
  "labor force": "劳动力",
  "works": "工程设施",
  "resulted in": "导致，结果是",
  "50": "50",
  "200": "200",
  "100": "100",
  "150": "150",
  "700": "700",
  "2,000": "2000",
  "125,000": "12.5万",
  "1200": "1200",
  "400": "400",
  "trade route": "贸易路线，商道",
  "natural resources": "自然资源，矿产",
  "competitive edge": "竞争优势，核心竞争力",
  "apartment complexes": "公寓楼群，居住区综合体",
  "industrial workshops": "手工业作坊，加工工场",
  "administrative center": "行政中心，管理中枢",
  "religious edifices": "宗教宏伟建筑，神庙金字塔",
  "grid pattern": "网格模式，棋盘状布局",
  "central control": "中央控制，集权管理",
  "positive feedback": "正反馈，良性循环",
  "obsidian mining": "黑曜石开采",
  "obsidian tools": "黑曜石工具",
  "volcanic eruption": "火山喷发",
  "volcanic eruptions": "火山喷发群",
  "agricultural land": "农田，耕地",
  "potential rival": "潜在竞争对手",
  "political power": "政治强国，政治势力",
  "archaeological evidence": "考古证据",
  "predominant force": "主导力量，统治地位的势力",
  "long-distance trade": "长途商贸，跨地区贸易",
  "exotic goods": "异域奇珍，外来奢侈品",
  "prosperous life": "富足生活，优裕的生活",
  "religious significance": "宗教重要性，神圣地位",
  "population magnet": "人口磁铁，强力吸引中心",
  "growing population": "增长中的人口",
  "irrigated fields": "灌溉农田，灌溉地",
  "obsidian operation": "黑曜石产业链业务",
  "labor force": "劳动力总量",
  "irrigation works": "灌溉水利工程设施",
  "increased wealth": "增长的财富"
};

// Combine localDict with the dynamic vocabularies in toeflData
const toeflDict = { ...localDict };
setTimeout(() => {
  if (typeof toeflData !== 'undefined') {
    toeflData.forEach(day => {
      day.vocabulary.forEach(vocab => {
        toeflDict[vocab.word.toLowerCase()] = vocab.meaning;
      });
    });
  }
}, 100);

// Setup Word click handler for Tooltip lookup & speaking
function setupWordClickHandlers() {
  const studyMain = document.getElementById('page-study');
  if (!studyMain) return;
  
  studyMain.addEventListener('click', (e) => {
    const clickable = e.target.closest('.clickable-word');
    const tooltip = document.getElementById('word-tooltip');
    if (!tooltip) return;
    
    if (clickable) {
      e.stopPropagation();
      const rawWord = clickable.getAttribute('data-word');
      // Keep hyphens in text cleaning
      const text = clickable.innerText.replace(/[.,\/#!$%\^&\*;:{}=_`~()?"']/g,"").trim();
      
      // Speak the word
      speakText(text);
      
      // Look up definition
      let meaning = toeflDict[rawWord] || toeflDict[text.toLowerCase()];
      
      // Suffix/Possessive and simple stem matching
      if (!meaning) {
        let lower = text.toLowerCase();
        // Remove possessive 's or ’s
        if (lower.endsWith("'s") || lower.endsWith("’s")) {
          lower = lower.slice(0, -2);
          meaning = toeflDict[lower];
        }
        
        // Try singular/plural or simple stem
        if (!meaning && lower.length > 2) {
          if (lower.endsWith('s') && toeflDict[lower.slice(0, -1)]) {
            meaning = toeflDict[lower.slice(0, -1)];
          } else if (lower.endsWith('es') && toeflDict[lower.slice(0, -2)]) {
            meaning = toeflDict[lower.slice(0, -2)];
          } else if (lower.endsWith('ed') && toeflDict[lower.slice(0, -2)]) {
            meaning = toeflDict[lower.slice(0, -2)];
          } else if (lower.endsWith('ing') && toeflDict[lower.slice(0, -3)]) {
            meaning = toeflDict[lower.slice(0, -3)];
          }
        }
      }
      
      if (!meaning) {
        meaning = "结合文章语义：未找到精确释义，点击上方按钮听发音。";
      }
      
      // Show Tooltip with word details
      document.getElementById('tooltip-word').innerText = text;
      document.getElementById('tooltip-meaning').innerText = meaning;
      
      // Position the tooltip below the clicked word
      const rect = clickable.getBoundingClientRect();
      const scrollLeft = window.pageXOffset || document.documentElement.scrollLeft;
      const scrollTop = window.pageYOffset || document.documentElement.scrollTop;
      
      tooltip.style.left = `${rect.left + scrollLeft}px`;
      tooltip.style.top = `${rect.bottom + scrollTop + 6}px`;
      tooltip.style.display = 'flex';
      
      // Speak in tooltip
      document.getElementById('tooltip-speak-btn').onclick = (ev) => {
        ev.stopPropagation();
        speakText(text);
      };
    } else {
      // Hide tooltip when clicking elsewhere
      if (tooltip && !e.target.closest('.word-tooltip')) {
        tooltip.style.display = 'none';
      }
    }
  });
}

// Helper to compute added words and wrap in highlights (preserving hyphens and abbreviations)
function getEvolutionTextHTML(prevText, currentText) {
  // Pre-protect abbreviations like B.C., A.D., U.S. by replacing dots with a placeholder
  const ABBR_PLACEHOLDER = '\u00B7'; // middle dot, safe to use as placeholder
  const protectAbbr = (str) => str.replace(/\b([A-Za-z])\.([A-Za-z])\.([A-Za-z])?/g, (match) => match.replace(/\./g, ABBR_PLACEHOLDER));
  const restoreAbbr = (str) => str.replace(new RegExp(ABBR_PLACEHOLDER, 'g'), '.');

  const protectedCurrent = protectAbbr(currentText);
  const protectedPrev = prevText ? protectAbbr(prevText) : '';

  // Clean punctuation but preserve hyphens and our placeholder
  const cleanWords = (str) => str.toLowerCase()
    .replace(/[,\/#!$%\^&\*;:{}=_`~()\?"']/g, '')
    .split(/\s+/)
    .filter(Boolean);
  const prevWords = protectedPrev ? new Set(cleanWords(protectedPrev)) : new Set();

  // Tokenize: split on whitespace and punctuation (excluding hyphens, dots, and placeholders)
  const currentTokens = protectedCurrent.split(/(\s+)/);

  let html = '';

  for (let token of currentTokens) {
    if (!token) continue;

    // Pure whitespace — keep as-is
    if (token.trim() === '') {
      html += token;
      continue;
    }

    // Check if this token is purely punctuation (no letter or digit)
    if (/^[,\/#!$%\^&\*;:{}=_`~()\?"']+$/.test(token)) {
      html += token;
      continue;
    }

    // It's a real word (may contain hyphens, dots for abbrs, or placeholders)
    // Restore the abbreviation dots for display
    const displayToken = restoreAbbr(token);
    // The dictionary key: lowercase, hyphens kept, placeholder turned back to dots
    const wordOnly = restoreAbbr(token).toLowerCase().replace(/[,\/#!$%\^&\*;:{}=_`~()\?"']+/g, '').trim();
    const isNew = prevText && wordOnly !== '' && !prevWords.has(cleanWords(protectAbbr(wordOnly))[0]);

    html += `<span class="clickable-word ${isNew ? 'diff-highlight' : ''}" data-word="${wordOnly}">${displayToken}</span>`;
  }

  return html;
}

// --- SPACED REPETITION LOGIC ---
function updateWordProgress(word, status) {
  let record = state.wordBank[word];
  const now = new Date();
  
  if (!record) {
    record = { interval: 0, ease: 2.5, nextReviewDate: now.toISOString().split('T')[0] };
  }
  
  if (status === 'unknown' || status === 'forgot' || status === 'hard') {
    // Punish
    record.interval = 1;
    record.ease = Math.max(1.3, record.ease - 0.2);
  } else if (status === 'known' || status === 'good' || status === 'easy') {
    // Reward
    if (record.interval === 0) {
      record.interval = 1;
    } else if (record.interval === 1) {
      record.interval = 3;
    } else {
      record.interval = Math.round(record.interval * record.ease);
    }
    // If 'easy' or from initial capture 'known', give a bigger boost
    if (status === 'easy' || status === 'known') {
      record.ease += 0.15;
      if (status === 'known' && record.interval === 1) record.interval = 7; // Fast track known words
    }
  }
  
  // Calculate next date
  const nextDate = new Date();
  nextDate.setDate(nextDate.getDate() + record.interval);
  record.nextReviewDate = nextDate.toISOString().split('T')[0];
  
  state.wordBank[word] = record;
  saveProgress();
}

// --- POST-STUDY QUIZ ---
let currentQuizWords = [];
let currentQuizDay = 1;

function startDailyQuiz(dayNum) {
  const data = toeflData[dayNum - 1];
  if (!data) return markDayCompleted(dayNum);
  
  currentQuizDay = dayNum;
  
  // Clean and extract words from original sentence
  const rawWords = data.original.toLowerCase().replace(/[.,\/#!$%\^&\*;:{}=_`~()?"']/g, " ").split(/\s+/);
  
  // Filter words: not empty, > 2 chars, not a number, not in stop words, not already in wordBank
  currentQuizWords = rawWords.filter(w => 
    w.length > 2 && 
    isNaN(w) && 
    typeof basicStopWords !== 'undefined' && !basicStopWords.has(w) &&
    !state.wordBank[w]
  );
  
  // De-duplicate
  currentQuizWords = [...new Set(currentQuizWords)];
  
  if (currentQuizWords.length === 0) {
    return markDayCompleted(dayNum);
  }
  
  showNextQuizWord();
}

function showNextQuizWord() {
  if (currentQuizWords.length === 0) {
    document.getElementById('quiz-modal').style.display = 'none';
    return markDayCompleted(currentQuizDay);
  }
  
  const word = currentQuizWords[0];
  const modal = document.getElementById('quiz-modal');
  modal.style.display = 'flex';
  
  const wordDisplay = document.getElementById('quiz-word-display');
  const meaningDisplay = document.getElementById('quiz-meaning-display');
  
  wordDisplay.innerText = word;
  
  // Look up meaning
  let meaning = toeflDict[word];
  if (!meaning && word.endsWith('s')) meaning = toeflDict[word.slice(0, -1)];
  if (!meaning && word.endsWith('ed')) meaning = toeflDict[word.slice(0, -2)];
  if (!meaning && word.endsWith('ing')) meaning = toeflDict[word.slice(0, -3)];
  if (!meaning) meaning = "点击“不认识”加入生词本后可查看详细解释";
  
  // Hide meaning initially in quiz
  meaningDisplay.innerText = meaning;
  meaningDisplay.style.opacity = '0'; 
  
  document.getElementById('quiz-progress').innerText = `剩余 ${currentQuizWords.length} 词`;
  
  document.getElementById('btn-quiz-unknown').onclick = () => {
    meaningDisplay.style.opacity = '1';
    updateWordProgress(word, 'unknown');
    setTimeout(() => {
      currentQuizWords.shift();
      showNextQuizWord();
    }, 1200); // Wait 1.2s to let them read the meaning
  };
  
  document.getElementById('btn-quiz-known').onclick = () => {
    updateWordProgress(word, 'known');
    currentQuizWords.shift();
    showNextQuizWord();
  };
  
  document.getElementById('quiz-close-btn').onclick = () => {
    modal.style.display = 'none';
  };
}

// Complete day study
function markDayCompleted(dayNum) {
  if (!state.completedDays.includes(dayNum)) {
    state.completedDays.push(dayNum);
    saveProgress();
    updateProgressUI();
    renderStudyPage();
    
    // Visual wow factor: custom alert / toast
    showToast(`🎉 恭喜！Day ${dayNum} 句子打卡成功！`);
  }
}

function showToast(message) {
  // Create toast container if not exists
  let container = document.getElementById('toast-container');
  if (!container) {
    container = document.createElement('div');
    container.id = 'toast-container';
    container.style.position = 'fixed';
    container.style.bottom = '30px';
    container.style.right = '30px';
    container.style.zIndex = '999';
    container.style.display = 'flex';
    container.style.flexDirection = 'column';
    container.style.gap = '10px';
    document.body.appendChild(container);
  }
  
  const toast = document.createElement('div');
  toast.style.background = 'linear-gradient(135deg, var(--accent-gold), var(--accent-gold-dark))';
  toast.style.color = 'var(--bg-color)';
  toast.style.padding = '14px 24px';
  toast.style.borderRadius = '10px';
  toast.style.boxShadow = 'var(--shadow-md)';
  toast.style.fontFamily = 'var(--font-interface)';
  toast.style.fontWeight = '600';
  toast.style.fontSize = '14px';
  toast.style.display = 'flex';
  toast.style.alignItems = 'center';
  toast.style.gap = '10px';
  toast.style.transform = 'translateY(50px)';
  toast.style.opacity = '0';
  toast.style.transition = 'all 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275)';
  
  toast.innerHTML = `<i class="ri-medal-fill"></i> ${message}`;
  container.appendChild(toast);
  
  // Animation in
  setTimeout(() => {
    toast.style.transform = 'translateY(0)';
    toast.style.opacity = '1';
  }, 10);
  
  // Animation out
  setTimeout(() => {
    toast.style.transform = 'translateY(-20px)';
    toast.style.opacity = '0';
    setTimeout(() => {
      toast.remove();
    }, 300);
  }, 3500);
}

// --- FULL ARTICLE VIEW RENDERER ---
function renderFullArticle() {
  const englishPane = document.getElementById('article-eng-pane');
  const chinesePane = document.getElementById('article-chi-pane');
  if (!englishPane || !chinesePane) return;
  
  englishPane.innerHTML = '';
  chinesePane.innerHTML = '';
  
  // Group TOEFL sentences by paragraph
  const paragraphs = {};
  toeflData.forEach(item => {
    if (!paragraphs[item.paragraph]) paragraphs[item.paragraph] = [];
    paragraphs[item.paragraph].push(item);
  });
  
  // Render paragraph by paragraph
  for (let pNum = 1; pNum <= 6; pNum++) {
    const pItems = paragraphs[pNum] || [];
    
    // Create DOM paragraph elements
    const engP = document.createElement('div');
    engP.className = 'article-p';
    
    const chiP = document.createElement('div');
    chiP.className = 'article-p';
    
    pItems.forEach(item => {
      // Create span tags for each sentence
      const engSpan = document.createElement('span');
      engSpan.className = 'article-sentence';
      engSpan.setAttribute('data-id', item.day);
      engSpan.innerText = item.original + " ";
      
      const chiSpan = document.createElement('span');
      chiSpan.className = 'article-sentence';
      chiSpan.setAttribute('data-id', item.day);
      chiSpan.innerText = item.originalTranslation + " ";
      
      // Highlight matching highlights
      const hoverEffect = (isHover) => {
        const engMatches = englishPane.querySelectorAll(`.article-sentence[data-id="${item.day}"]`);
        const chiMatches = chinesePane.querySelectorAll(`.article-sentence[data-id="${item.day}"]`);
        
        [...engMatches, ...chiMatches].forEach(match => {
          if (isHover) {
            match.classList.add('highlight');
          } else {
            // Keep highlighted only if it's the selected one
            if (state.selectedSentenceId !== item.day) {
              match.classList.remove('highlight');
            }
          }
        });
      };
      
      [engSpan, chiSpan].forEach(span => {
        span.addEventListener('mouseenter', () => hoverEffect(true));
        span.addEventListener('mouseleave', () => hoverEffect(false));
        
        span.addEventListener('click', () => {
          // Deselect previous
          const allSpans = document.querySelectorAll('.article-sentence');
          allSpans.forEach(s => s.classList.remove('highlight'));
          
          if (state.selectedSentenceId === item.day) {
            state.selectedSentenceId = null;
            document.getElementById('article-sentence-panel').style.display = 'none';
          } else {
            state.selectedSentenceId = item.day;
            
            // Highlight current in both panes
            const engMatches = englishPane.querySelectorAll(`.article-sentence[data-id="${item.day}"]`);
            const chiMatches = chinesePane.querySelectorAll(`.article-sentence[data-id="${item.day}"]`);
            [...engMatches, ...chiMatches].forEach(match => match.classList.add('highlight'));
            
            // Render interactive panel details at bottom
            const detailPanel = document.getElementById('article-sentence-panel');
            const detailTitle = document.getElementById('article-panel-title');
            const splitsContainer = document.getElementById('article-panel-splits');
            
            detailTitle.innerHTML = `Day ${item.day} 长难句拆解：<button class="audio-btn" id="article-speak-btn"><i class="ri-volume-up-fill"></i></button>`;
            
            // Speak listener
            document.getElementById('article-speak-btn').onclick = () => speakText(item.original);
            
            splitsContainer.innerHTML = '';
            item.evolution.forEach((evo, idx) => {
              const splitDiv = document.createElement('div');
              splitDiv.className = 'split-bullet';
              splitDiv.innerHTML = `
                <strong>${evo.level}:</strong> ${evo.text}
                <span>译：${evo.translation}</span>
              `;
              splitsContainer.appendChild(splitDiv);
            });
            
            detailPanel.style.display = 'block';
            detailPanel.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
          }
        });
      });
      
      engP.appendChild(engSpan);
      chiP.appendChild(chiSpan);
    });
    
    englishPane.appendChild(engP);
    chinesePane.appendChild(chiP);
  }
}

// --- VOCABULARY PAGE RENDERER ---
function renderVocabPage() {
  const container = document.getElementById('vocab-grid-container');
  if (!container) return;
  
  container.innerHTML = '';
  
  // Aggregate all words in database
  let vocabList = [];
  toeflData.forEach(dayItem => {
    const isLearned = state.completedDays.includes(dayItem.day);
    dayItem.vocabulary.forEach(vocab => {
      vocabList.push({
        ...vocab,
        day: dayItem.day,
        learned: isLearned,
        originalSentence: dayItem.original
      });
    });
  });
  
  // Apply Search query
  if (state.vocabSearchQuery) {
    vocabList = vocabList.filter(item => 
      item.word.toLowerCase().includes(state.vocabSearchQuery) || 
      item.meaning.includes(state.vocabSearchQuery)
    );
  }
  
  // Apply learned/unlearned filter
  if (state.vocabFilter === 'learned') {
    vocabList = vocabList.filter(item => item.learned);
  } else if (state.vocabFilter === 'unlearned') {
    vocabList = vocabList.filter(item => !item.learned);
  }
  
  if (vocabList.length === 0) {
    container.innerHTML = `
      <div style="grid-column: 1/-1; text-align: center; padding: 48px; color: var(--text-secondary);">
        <i class="ri-file-search-line" style="font-size: 40px; color: var(--text-muted); display:block; margin-bottom:12px;"></i>
        没有找到符合条件的单词。
      </div>
    `;
    return;
  }
  
  vocabList.forEach(item => {
    const card = document.createElement('div');
    card.className = 'vocab-grid-item';
    
    // HTML build
    card.innerHTML = `
      <div>
        <div class="vocab-item-header">
          <div class="vocab-item-word">${item.word}</div>
          <div class="vocab-item-day">Day ${item.day}</div>
        </div>
        <div class="vocab-item-meaning" style="margin-top: 10px;">${item.meaning}</div>
      </div>
      <div>
        <div class="vocab-item-original" title="双击单词可直接朗读">${item.originalSentence}</div>
        <div style="display:flex; justify-content:space-between; align-items:center; margin-top:10px; font-size:11px;">
          <span style="color:${item.learned ? 'var(--success-green)' : 'var(--text-muted)'}">
            <i class="${item.learned ? 'ri-checkbox-circle-fill' : 'ri-checkbox-blank-circle-line'}"></i> ${item.learned ? '已学完本天' : '未学完本天'}
          </span>
          <button class="audio-btn" style="font-size:14px;" title="朗读单词"><i class="ri-volume-up-fill"></i></button>
        </div>
      </div>
    `;
    
    // Play vocab word audio on speak btn click
    card.querySelector('.audio-btn').addEventListener('click', (e) => {
      e.stopPropagation();
      speakText(item.word);
    });
    
    // Play vocab word on double click
    card.addEventListener('dblclick', () => speakText(item.word));
    
    // Quick link to study day on click
    card.addEventListener('click', (e) => {
      // don't navigate if clicked on play audio btn
      if (e.target.closest('.audio-btn')) return;
      state.currentDay = item.day;
      showPage('study');
    });
    
    container.appendChild(card);
  });
}

// --- VOCAB REVIEW PAGE (SPACED REPETITION) ---
let currentReviewQueue = [];
let currentReviewIndex = 0;

function renderReviewPage() {
  const todayStr = new Date().toISOString().split('T')[0];
  const allWords = Object.keys(state.wordBank);
  
  // 1. Gather due words (nextReviewDate <= today)
  let dueWords = allWords.filter(w => state.wordBank[w].nextReviewDate <= todayStr);
  
  // 2. 5% Random injection of future/known words
  let futureWords = allWords.filter(w => state.wordBank[w].nextReviewDate > todayStr);
  futureWords.forEach(w => {
    if (Math.random() < 0.05) {
      dueWords.push(w);
    }
  });
  
  // Shuffle queue
  currentReviewQueue = dueWords.sort(() => Math.random() - 0.5);
  currentReviewIndex = 0;
  
  // Update stats
  document.getElementById('review-today-count').innerText = currentReviewQueue.length;
  document.getElementById('review-total-count').innerText = allWords.length;
  
  showNextReviewCard();
}

function showNextReviewCard() {
  const activeCard = document.getElementById('review-card-active');
  const doneState = document.getElementById('review-done-state');
  
  if (currentReviewIndex >= currentReviewQueue.length) {
    // Finished today's queue
    activeCard.style.display = 'none';
    doneState.style.display = 'flex';
    document.getElementById('review-today-count').innerText = '0';
    
    // Force Random Review Logic
    document.getElementById('btn-review-force').onclick = () => {
      const allWords = Object.keys(state.wordBank);
      if (allWords.length === 0) {
        showToast("单词库还是空的，先去学习吧！");
        return;
      }
      // Pick 5 random words
      const shuffled = allWords.sort(() => 0.5 - Math.random());
      currentReviewQueue = shuffled.slice(0, 5);
      currentReviewIndex = 0;
      showNextReviewCard();
    };
    return;
  }
  
  // Setup next card
  activeCard.style.display = 'block';
  doneState.style.display = 'none';
  
  const word = currentReviewQueue[currentReviewIndex];
  document.getElementById('review-word-display').innerText = word;
  document.getElementById('review-today-count').innerText = (currentReviewQueue.length - currentReviewIndex);
  
  // Reset UI states
  const meaningSection = document.getElementById('review-meaning-section');
  const revealBtn = document.getElementById('review-reveal-btn');
  
  meaningSection.style.display = 'none';
  revealBtn.style.display = 'block';
  
  // Look up meaning
  let meaning = toeflDict[word];
  if (!meaning && word.endsWith('s')) meaning = toeflDict[word.slice(0, -1)];
  if (!meaning && word.endsWith('ed')) meaning = toeflDict[word.slice(0, -2)];
  if (!meaning && word.endsWith('ing')) meaning = toeflDict[word.slice(0, -3)];
  if (!meaning) meaning = "网络例句暂无中文释义。";
  document.getElementById('review-meaning-display').innerText = meaning;
  
  revealBtn.onclick = () => {
    revealBtn.style.display = 'none';
    meaningSection.style.display = 'block';
  };
  
  // Setup answer buttons
  const answerButtons = [
    { id: 'btn-review-forgot', status: 'forgot' },
    { id: 'btn-review-hard', status: 'hard' },
    { id: 'btn-review-good', status: 'good' },
    { id: 'btn-review-easy', status: 'easy' }
  ];
  
  answerButtons.forEach(btn => {
    document.getElementById(btn.id).onclick = () => {
      updateWordProgress(word, btn.status);
      currentReviewIndex++;
      showNextReviewCard();
    };
  });
}
