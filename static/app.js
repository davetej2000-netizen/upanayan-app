/**
 * યજ્ઞોપવીત મહોત્સવ - ઉપનયન સંસ્કાર એપ્લિકેશન (Upanayan Sanskar Companion)
 * Real-time Collaborative Mobile Web App
 */

// Global State
let appState = {
  settings: {},
  programs: [],
  tasks: [],
  expenses: [],
  contacts: [],
  shagun: [],
  samagri: [],
  activities: [],
  summary: {}
};

let currentTab = 'tasks';
let taskFilter = 'all';
let expenseFilter = 'all';
let currentShagunSubTab = 'shagun';
let ws = null;
let serverInfo = { local_ip: '127.0.0.1', port: 8000 };
let userName = localStorage.getItem('upanayan_user_name') || 'પરિવારજન';

// Web Audio API for celebratory chimes and notifications
let audioCtx = null;
function getAudioContext() {
  if (!audioCtx) {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  }
  return audioCtx;
}

function playCompletionChime() {
  try {
    const ctx = getAudioContext();
    if (ctx.state === 'suspended') ctx.resume();
    const now = ctx.currentTime;
    
    // Play an uplifting two-tone Vedic bell chime
    const osc1 = ctx.createOscillator();
    const gain1 = ctx.createGain();
    osc1.type = 'sine';
    osc1.frequency.setValueAtTime(587.33, now); // D5
    osc1.frequency.exponentialRampToValueAtTime(880, now + 0.15); // A5
    gain1.gain.setValueAtTime(0.25, now);
    gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.6);
    osc1.connect(gain1);
    gain1.connect(ctx.destination);
    osc1.start(now);
    osc1.stop(now + 0.6);

    const osc2 = ctx.createOscillator();
    const gain2 = ctx.createGain();
    osc2.type = 'triangle';
    osc2.frequency.setValueAtTime(1174.66, now + 0.1); // D6
    gain2.gain.setValueAtTime(0.2, now + 0.1);
    gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.8);
    osc2.connect(gain2);
    gain2.connect(ctx.destination);
    osc2.start(now + 0.1);
    osc2.stop(now + 0.8);
  } catch (e) {
    console.log("Audio feedback error:", e);
  }
}

function playLiveNotificationTone() {
  try {
    const ctx = getAudioContext();
    if (ctx.state === 'suspended') ctx.resume();
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(440, now);
    osc.frequency.exponentialRampToValueAtTime(659.25, now + 0.1);
    gain.gain.setValueAtTime(0.15, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.4);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.4);
  } catch (e) {}
}

// Format Currency
function formatInr(num) {
  if (isNaN(num)) return '₹0';
  return '₹' + Number(num).toLocaleString('en-IN');
}

// Initialize on DOM Ready
document.addEventListener('DOMContentLoaded', () => {
  initIcons();
  updateUserBadge();
  fetchServerInfo();
  loadAllData();
  initWebSocket();
  initCountdown();
  initRemindersCheck();

  // Register PWA service worker if supported
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/static/sw.js').catch(err => console.log('SW registration:', err));
  }
});

function initIcons() {
  if (window.lucide) {
    lucide.createIcons();
  }
}

// User Profile Name Management
function updateUserBadge() {
  const el = document.getElementById('userBadgeName');
  if (el) el.innerText = userName;
}

function openUserModal() {
  document.getElementById('inputUserName').value = userName;
  openModal('modalUser');
}

function saveUserName() {
  const val = document.getElementById('inputUserName').value.trim();
  if (val) {
    userName = val;
    localStorage.setItem('upanayan_user_name', userName);
    updateUserBadge();
    closeModal('modalUser');
    showToast(`સ્વાગત છે, ${userName}!`);
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: 'join', user_name: userName }));
    }
  }
}

// Server & Data Fetching
async function fetchServerInfo() {
  try {
    const res = await fetch('/api/info');
    if (res.ok) {
      serverInfo = await res.json();
      updateShareModalInfo();
    }
  } catch (e) {
    console.warn("Could not fetch server info:", e);
  }
}

async function loadAllData() {
  try {
    const res = await fetch('/api/all');
    if (!res.ok) throw new Error("API error");
    appState = await res.json();
    renderAll();
  } catch (err) {
    console.error("Failed to load data:", err);
  }
}

// Real-Time WebSocket
function initWebSocket() {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const wsUrl = `${protocol}//${window.location.host}/ws`;

  try {
    ws = new WebSocket(wsUrl);

    ws.onopen = () => {
      console.log("WebSocket connected!");
      ws.send(JSON.stringify({ type: 'join', user_name: userName }));
    };

    ws.onmessage = (event) => {
      try {
        const msg = jsonParseSafe(event.data);
        if (!msg) return;

        if (msg.type === 'peer_count') {
          const count = msg.data.count || 1;
          document.getElementById('peerCountText').innerText = `${count} લાઈવ`;
        } else if (msg.type === 'user_joined') {
          const count = msg.data.count || 1;
          document.getElementById('peerCountText').innerText = `${count} લાઈવ`;
          showToast(`👋 ${msg.data.user_name} લાઈવ જોડાયા!`);
        } else if (msg.type === 'sync_needed') {
          // Play subtle tone & show toast
          playLiveNotificationTone();
          if (msg.data && msg.data.activity) {
            showToast(`🔔 ${msg.data.activity}`);
          }
          // Refresh state from DB
          loadAllData();
        }
      } catch (e) {
        console.error("WebSocket message handling error:", e);
      }
    };

    ws.onclose = () => {
      console.log("WebSocket disconnected, retrying in 3s...");
      setTimeout(initWebSocket, 3000);
    };

    ws.onerror = (err) => {
      console.warn("WebSocket error, closing...");
      ws.close();
    };
  } catch (e) {
    console.error("WebSocket init error:", e);
  }
}

function jsonParseSafe(str) {
  try {
    return JSON.parse(str);
  } catch (e) {
    return null;
  }
}

// Send Action to API
async function sendAction(entity, action, data = {}) {
  try {
    const res = await fetch('/api/action', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        entity,
        action,
        data,
        user_name: userName
      })
    });
    const result = await res.json();
    if (!res.ok) throw new Error(result.error || "Action failed");
    // Reload local data right away
    await loadAllData();
    return result;
  } catch (err) {
    alert("ભૂલ: " + err.message);
    throw err;
  }
}

// Master Render
function renderAll() {
  renderHeaderAndSettings();
  renderTasks();
  renderExpenses();
  renderPrograms();
  renderContacts();
  renderShagun();
  renderSamagri();
  renderActivityFeed();
  initIcons();
}

// Render Header & Settings
function renderHeaderAndSettings() {
  const s = appState.settings || {};
  if (s.boy_name) {
    document.getElementById('headerBoyName').innerText = `${s.boy_name} ઉપનયન સંસ્કાર`;
  }
  if (s.venue) {
    document.getElementById('headerVenue').innerText = s.venue;
  }
  if (s.event_date) {
    document.getElementById('countdownTargetDate').innerText = formatFriendlyDate(s.event_date);
  }

  // Pre-fill Settings modal inputs
  document.getElementById('settingsBoyName').value = s.boy_name || '';
  document.getElementById('settingsFatherName').value = s.father_name || '';
  document.getElementById('settingsMotherName').value = s.mother_name || '';
  document.getElementById('settingsEventDate').value = s.event_date || '';
  document.getElementById('settingsBudget').value = s.budget_target || '350000';
  document.getElementById('settingsVenue').value = s.venue || '';
}

// Countdown Clock
function initCountdown() {
  function tick() {
    const targetStr = (appState.settings && appState.settings.event_date) ? appState.settings.event_date : '2026-11-22';
    const target = new Date(targetStr + "T08:00:00").getTime();
    const now = new Date().getTime();
    const diff = target - now;

    if (diff <= 0) {
      document.getElementById('cdDays').innerText = '૦૦';
      document.getElementById('cdHours').innerText = '૦૦';
      document.getElementById('cdMinutes').innerText = '૦૦';
      document.getElementById('cdSeconds').innerText = '૦૦';
      return;
    }

    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
    const seconds = Math.floor((diff % (1000 * 60)) / 1000);

    document.getElementById('cdDays').innerText = String(days).padStart(2, '0');
    document.getElementById('cdHours').innerText = String(hours).padStart(2, '0');
    document.getElementById('cdMinutes').innerText = String(minutes).padStart(2, '0');
    document.getElementById('cdSeconds').innerText = String(seconds).padStart(2, '0');
  }

  tick();
  setInterval(tick, 1000);
}

// Tab Switching
function switchTab(tabName) {
  currentTab = tabName;
  document.querySelectorAll('.tab-content').forEach(el => el.classList.add('hidden'));
  document.getElementById(`tab-${tabName}`).classList.remove('hidden');

  // Update Nav Button Styles
  const navButtons = [
    { id: 'navBtnTasks', name: 'tasks' },
    { id: 'navBtnExpenses', name: 'expenses' },
    { id: 'navBtnPrograms', name: 'programs' },
    { id: 'navBtnContacts', name: 'contacts' },
    { id: 'navBtnShagun', name: 'shagun' }
  ];

  navButtons.forEach(btn => {
    const el = document.getElementById(btn.id);
    if (btn.name === tabName) {
      el.className = "flex flex-col items-center justify-center flex-1 py-1 text-amber-600 font-bold transition active:scale-90";
    } else {
      el.className = "flex flex-col items-center justify-center flex-1 py-1 text-gray-400 font-medium hover:text-gray-600 transition active:scale-90";
    }
  });

  window.scrollTo({ top: 0, behavior: 'smooth' });
  initIcons();
}

/* ==========================================================================
   TAB 1: TASKS & CHECKLIST
   ========================================================================== */
function setTaskFilter(filter) {
  taskFilter = filter;
  ['All', 'Pending', 'Completed'].forEach(f => {
    const el = document.getElementById(`btnFilter${f}`);
    if (f.toLowerCase() === filter) {
      el.className = "px-2.5 py-1 rounded-lg bg-amber-600 text-white font-semibold shrink-0 shadow-sm";
    } else {
      el.className = "px-2.5 py-1 rounded-lg bg-gray-100 text-gray-600 font-medium shrink-0";
    }
  });
  renderTasks();
}

function renderTasks() {
  const container = document.getElementById('taskListContainer');
  let tasks = appState.tasks || [];

  const totalCount = tasks.length;
  const completedCount = tasks.filter(t => t.is_completed).length;
  const percent = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;

  document.getElementById('taskProgressPercent').innerText = `${percent}%`;
  document.getElementById('taskProgressBar').style.width = `${percent}%`;
  document.getElementById('taskCountCompleted').innerText = `${completedCount} પૂર્ણ`;
  document.getElementById('taskCountTotal').innerText = `કુલ ${totalCount} કાર્યો`;

  // Apply Filter
  if (taskFilter === 'pending') {
    tasks = tasks.filter(t => !t.is_completed);
  } else if (taskFilter === 'completed') {
    tasks = tasks.filter(t => t.is_completed);
  }

  if (tasks.length === 0) {
    container.innerHTML = `
      <div class="sacred-card rounded-2xl p-6 text-center text-gray-400">
        <i data-lucide="check-circle" class="w-10 h-10 mx-auto mb-2 text-amber-400/60"></i>
        <p class="text-xs">કોઈ કાર્ય મળ્યું નથી.</p>
      </div>
    `;
    return;
  }

  let html = '';
  tasks.forEach(task => {
    const isDone = !!task.is_completed;
    const priorityColor = {
      'ઉચ્ચ': 'bg-rose-100 text-rose-700 border-rose-200',
      'મધ્યમ': 'bg-amber-100 text-amber-800 border-amber-200',
      'સામાન્ય': 'bg-blue-100 text-blue-700 border-blue-200'
    }[task.priority] || 'bg-gray-100 text-gray-700';

    html += `
      <div class="sacred-card rounded-2xl p-3 shadow-sm border ${isDone ? 'bg-emerald-50/40 border-emerald-200' : 'border-amber-200'} flex items-start space-x-3 transition">
        <!-- Interactive Checkbox -->
        <button onclick="toggleTask(${task.id}, ${isDone ? 0 : 1})" class="mt-0.5 w-6 h-6 rounded-lg flex items-center justify-center transition border ${isDone ? 'bg-emerald-600 border-emerald-600 text-white shadow-sm' : 'border-amber-300 bg-white hover:border-amber-500'} active:scale-90">
          ${isDone ? '<i data-lucide="check" class="w-4 h-4 stroke-[3]"></i>' : ''}
        </button>

        <!-- Task Content -->
        <div class="flex-1 min-w-0">
          <div class="flex items-center space-x-1.5 flex-wrap gap-y-1 mb-1">
            <span class="text-[10px] font-bold px-1.5 py-0.5 rounded border ${priorityColor}">
              ${escapeHtml(task.priority || 'મધ્યમ')}
            </span>
            <span class="text-[10px] font-medium px-1.5 py-0.5 rounded bg-gray-100 text-gray-600">
              ${escapeHtml(task.category || 'જનરલ')}
            </span>
            ${task.assigned_to ? `
              <span class="text-[10px] font-medium px-1.5 py-0.5 rounded bg-amber-50 text-amber-800 flex items-center space-x-0.5 border border-amber-200/60">
                <i data-lucide="user" class="w-2.5 h-2.5"></i>
                <span>${escapeHtml(task.assigned_to)}</span>
              </span>
            ` : ''}
          </div>

          <h3 class="text-xs font-bold leading-tight ${isDone ? 'task-completed-text' : 'text-gray-800'}">
            ${escapeHtml(task.title)}
          </h3>

          <div class="flex items-center space-x-3 mt-1.5 text-[11px] text-gray-400">
            ${task.due_date ? `
              <span class="flex items-center space-x-1 text-gray-500">
                <i data-lucide="calendar" class="w-3 h-3 text-amber-600"></i>
                <span>${escapeHtml(task.due_date)}</span>
              </span>
            ` : ''}
            ${task.reminder_time ? `
              <span class="flex items-center space-x-1 text-amber-700 font-medium">
                <i data-lucide="bell" class="w-3 h-3"></i>
                <span>${escapeHtml(task.reminder_time)}</span>
              </span>
            ` : ''}
            ${isDone && task.completed_by ? `
              <span class="text-emerald-700 text-[10px] font-semibold">
                ✓ ${escapeHtml(task.completed_by)} દ્વારા પૂર્ણ
              </span>
            ` : ''}
          </div>
        </div>

        <!-- Delete Action -->
        <button onclick="deleteTask(${task.id})" title="કાઢી નાખો" class="text-gray-300 hover:text-rose-600 p-1 active:scale-90 transition">
          <i data-lucide="trash-2" class="w-4 h-4"></i>
        </button>
      </div>
    `;
  });

  container.innerHTML = html;
  initIcons();
}

async function toggleTask(id, newVal) {
  if (newVal === 1) {
    playCompletionChime();
    // Fire celebratory confetti!
    if (window.confetti) {
      confetti({
        particleCount: 45,
        spread: 60,
        origin: { y: 0.8 },
        colors: ['#F59E0B', '#10B981', '#DC2626']
      });
    }
  }
  await sendAction('task', 'toggle', { id, is_completed: newVal });
}

async function deleteTask(id) {
  if (confirm("શું તમે આ કાર્ય કાઢી નાખવા માંગો છો?")) {
    await sendAction('task', 'delete', { id });
  }
}

function openAddTaskModal() {
  document.getElementById('taskTitleInput').value = '';
  document.getElementById('taskAssignedInput').value = userName;
  document.getElementById('taskDueDateInput').value = '';
  document.getElementById('taskReminderInput').value = '';
  openModal('modalAddTask');
}

async function submitAddTask(e) {
  e.preventDefault();
  const title = document.getElementById('taskTitleInput').value.trim();
  const category = document.getElementById('taskCategoryInput').value;
  const priority = document.getElementById('taskPriorityInput').value;
  const assigned_to = document.getElementById('taskAssignedInput').value.trim();
  const due_date = document.getElementById('taskDueDateInput').value;
  const reminder_time = document.getElementById('taskReminderInput').value;

  if (!title) return;
  await sendAction('task', 'add', { title, category, priority, assigned_to, due_date, reminder_time });
  closeModal('modalAddTask');
}

/* ==========================================================================
   TAB 2: EXPENSES & BUDGET
   ========================================================================== */
function setExpenseFilter(cat) {
  expenseFilter = cat;
  renderExpenses();
}

function renderExpenses() {
  const container = document.getElementById('expenseListContainer');
  let expenses = appState.expenses || [];
  const s = appState.settings || {};
  const targetBudget = parseFloat(s.budget_target) || 350000;

  const totalSpent = expenses.reduce((acc, e) => {
    return acc + (e.payment_status === 'બાકી' ? 0 : (parseFloat(e.amount) || 0));
  }, 0);
  const remaining = Math.max(0, targetBudget - totalSpent);

  document.getElementById('totalSpentAmount').innerText = formatInr(totalSpent);
  document.getElementById('targetBudgetAmount').innerText = formatInr(targetBudget);
  document.getElementById('remainingBudgetAmount').innerText = formatInr(remaining);

  // Apply Filter
  if (expenseFilter !== 'all') {
    expenses = expenses.filter(e => e.category === expenseFilter);
  }

  if (expenses.length === 0) {
    container.innerHTML = `
      <div class="sacred-card rounded-2xl p-6 text-center text-gray-400">
        <i data-lucide="receipt" class="w-10 h-10 mx-auto mb-2 text-amber-400/60"></i>
        <p class="text-xs">કોઈ ખર્ચ નોંધાયેલ નથી.</p>
      </div>
    `;
    return;
  }

  let html = '';
  expenses.forEach(exp => {
    const statusColor = {
      'ચુકવાઈ ગયું': 'bg-emerald-100 text-emerald-800 border-emerald-200',
      'ભાગશઃ ચૂકવણી': 'bg-amber-100 text-amber-800 border-amber-200',
      'બાકી': 'bg-rose-100 text-rose-800 border-rose-200'
    }[exp.payment_status] || 'bg-gray-100 text-gray-700';

    html += `
      <div class="sacred-card rounded-2xl p-3 shadow-sm border border-amber-200 flex items-center justify-between">
        <div class="flex-1 min-w-0 pr-2">
          <div class="flex items-center space-x-1.5 mb-1">
            <span class="text-[10px] font-bold px-1.5 py-0.5 rounded border ${statusColor}">
              ${escapeHtml(exp.payment_status || 'ચુકવાઈ ગયું')}
            </span>
            <span class="text-[10px] px-1.5 py-0.5 rounded bg-gray-100 text-gray-600 font-medium">
              ${escapeHtml(exp.category || 'અન્ય')}
            </span>
            <span class="text-[10px] text-gray-400">
              ${escapeHtml(exp.payment_mode || 'રોકડ')}
            </span>
          </div>
          <h3 class="text-xs font-bold text-gray-800 truncate">${escapeHtml(exp.title)}</h3>
          <div class="flex items-center space-x-2 text-[11px] text-gray-500 mt-0.5">
            ${exp.paid_by ? `<span>ચૂકવનાર: <strong class="text-gray-700">${escapeHtml(exp.paid_by)}</strong></span>` : ''}
            ${exp.notes ? `<span class="truncate italic text-gray-400">(${escapeHtml(exp.notes)})</span>` : ''}
          </div>
        </div>

        <div class="text-right flex items-center space-x-2 shrink-0">
          <div>
            <div class="text-sm font-black text-amber-800">${formatInr(exp.amount)}</div>
            ${exp.estimated_amount && exp.estimated_amount > exp.amount ? `
              <div class="text-[9px] text-gray-400">અંદાજ: ${formatInr(exp.estimated_amount)}</div>
            ` : ''}
          </div>
          <button onclick="deleteExpense(${exp.id})" title="કાઢી નાખો" class="text-gray-300 hover:text-rose-600 p-1 active:scale-90 transition">
            <i data-lucide="trash-2" class="w-4 h-4"></i>
          </button>
        </div>
      </div>
    `;
  });

  container.innerHTML = html;
  initIcons();
}

async function deleteExpense(id) {
  if (confirm("શું તમે આ ખર્ચ કાઢી નાખવા માંગો છો?")) {
    await sendAction('expense', 'delete', { id });
  }
}

function openAddExpenseModal() {
  document.getElementById('expenseTitleInput').value = '';
  document.getElementById('expenseAmountInput').value = '';
  document.getElementById('expenseEstimatedInput').value = '';
  document.getElementById('expensePaidByInput').value = userName;
  document.getElementById('expenseNotesInput').value = '';
  openModal('modalAddExpense');
}

async function submitAddExpense(e) {
  e.preventDefault();
  const title = document.getElementById('expenseTitleInput').value.trim();
  const amount = parseFloat(document.getElementById('expenseAmountInput').value) || 0;
  const estimated_amount = parseFloat(document.getElementById('expenseEstimatedInput').value) || amount;
  const category = document.getElementById('expenseCategoryInput').value;
  const payment_status = document.getElementById('expenseStatusInput').value;
  const paid_by = document.getElementById('expensePaidByInput').value.trim();
  const payment_mode = document.getElementById('expenseModeInput').value;
  const notes = document.getElementById('expenseNotesInput').value.trim();

  if (!title) return;
  await sendAction('expense', 'add', { title, amount, estimated_amount, category, payment_status, paid_by, payment_mode, notes });
  closeModal('modalAddExpense');
}

/* ==========================================================================
   TAB 3: PROGRAM SCHEDULE & MUHURAT
   ========================================================================== */
function renderPrograms() {
  const container = document.getElementById('programListContainer');
  const programs = appState.programs || [];

  if (programs.length === 0) {
    container.innerHTML = `
      <div class="sacred-card rounded-2xl p-6 text-center text-gray-400">
        <i data-lucide="calendar" class="w-10 h-10 mx-auto mb-2 text-amber-400/60"></i>
        <p class="text-xs">કોઈ કાર્યક્રમ ઉમેરેલ નથી.</p>
      </div>
    `;
    return;
  }

  let html = '';
  programs.forEach((prog, index) => {
    const isCompleted = prog.status === 'completed';
    html += `
      <div class="relative pl-7 group">
        <!-- Timeline Marker -->
        <div class="absolute left-2.5 top-3.5 -translate-x-1/2 w-4 h-4 rounded-full border-2 border-white ${isCompleted ? 'bg-emerald-600' : 'bg-amber-600'} shadow flex items-center justify-center text-[9px] text-white font-bold">
          ${index + 1}
        </div>

        <!-- Ritual Card -->
        <div class="sacred-card rounded-2xl p-3.5 shadow-sm border ${isCompleted ? 'bg-gray-50 border-gray-200' : 'border-amber-300'}">
          <div class="flex items-start justify-between">
            <div>
              <div class="flex items-center space-x-1.5 mb-1">
                <span class="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-900 border border-amber-300/60 flex items-center space-x-1">
                  <i data-lucide="clock" class="w-3 h-3 text-amber-700"></i>
                  <span>${escapeHtml(prog.muhurat_time || '')}</span>
                </span>
                <span class="text-[10px] text-gray-500 font-medium">
                  ${escapeHtml(prog.date || '')}
                </span>
              </div>
              <h3 class="text-xs font-bold text-gray-800 ${isCompleted ? 'line-through text-gray-400' : ''}">
                ${escapeHtml(prog.title)}
              </h3>
              ${prog.title_en ? `<p class="text-[10px] text-gray-400">${escapeHtml(prog.title_en)}</p>` : ''}
            </div>

            <!-- Complete Toggle & Delete -->
            <div class="flex items-center space-x-1">
              <button onclick="toggleProgramStatus(${prog.id}, '${isCompleted ? 'upcoming' : 'completed'}')" title="${isCompleted ? 'અપૂર્ણ કરો' : 'પૂર્ણ કરો'}" class="p-1 rounded-lg ${isCompleted ? 'text-emerald-600' : 'text-gray-300 hover:text-emerald-600'} active:scale-90 transition">
                <i data-lucide="check-circle-2" class="w-5 h-5"></i>
              </button>
              <button onclick="deleteProgram(${prog.id})" title="કાઢી નાખો" class="text-gray-300 hover:text-rose-600 p-1 active:scale-90 transition">
                <i data-lucide="trash-2" class="w-4 h-4"></i>
              </button>
            </div>
          </div>

          <div class="mt-2 pt-2 border-t border-gray-100 flex flex-wrap items-center gap-y-1 gap-x-3 text-[11px] text-gray-600">
            ${prog.venue ? `
              <span class="flex items-center space-x-1 text-gray-700">
                <i data-lucide="map-pin" class="w-3 h-3 text-amber-600"></i>
                <span>${escapeHtml(prog.venue)}</span>
              </span>
            ` : ''}
            ${prog.priest_incharge ? `
              <span class="flex items-center space-x-1 text-amber-900 font-medium">
                <i data-lucide="user-check" class="w-3 h-3 text-amber-600"></i>
                <span>${escapeHtml(prog.priest_incharge)}</span>
              </span>
            ` : ''}
          </div>

          ${prog.notes ? `
            <p class="mt-1.5 text-[10px] text-gray-500 bg-amber-50/60 p-1.5 rounded-lg border border-amber-100">
              💡 ${escapeHtml(prog.notes)}
            </p>
          ` : ''}
        </div>
      </div>
    `;
  });

  container.innerHTML = html;
  initIcons();
}

async function toggleProgramStatus(id, newStatus) {
  if (newStatus === 'completed') {
    playCompletionChime();
  }
  await sendAction('program', 'update_status', { id, status: newStatus });
}

async function deleteProgram(id) {
  if (confirm("શું તમે આ કાર્યક્રમ ડિલીટ કરવા માંગો છો?")) {
    await sendAction('program', 'delete', { id });
  }
}

function openAddProgramModal() {
  document.getElementById('programTitleInput').value = '';
  document.getElementById('programDateInput').value = (appState.settings && appState.settings.event_date) || '';
  document.getElementById('programTimeInput').value = '';
  document.getElementById('programVenueInput').value = (appState.settings && appState.settings.venue) || '';
  document.getElementById('programPriestInput').value = '';
  document.getElementById('programNotesInput').value = '';
  openModal('modalAddProgram');
}

async function submitAddProgram(e) {
  e.preventDefault();
  const title = document.getElementById('programTitleInput').value.trim();
  const date = document.getElementById('programDateInput').value;
  const muhurat_time = document.getElementById('programTimeInput').value.trim();
  const venue = document.getElementById('programVenueInput').value.trim();
  const priest_incharge = document.getElementById('programPriestInput').value.trim();
  const notes = document.getElementById('programNotesInput').value.trim();

  if (!title) return;
  await sendAction('program', 'add', { title, date, muhurat_time, venue, priest_incharge, notes });
  closeModal('modalAddProgram');
}

/* ==========================================================================
   TAB 4: CONTACTS & DIRECTORY
   ========================================================================== */
function renderContacts() {
  const container = document.getElementById('contactListContainer');
  let contacts = appState.contacts || [];
  const query = (document.getElementById('contactSearchInput')?.value || '').toLowerCase().trim();

  if (query) {
    contacts = contacts.filter(c =>
      (c.name && c.name.toLowerCase().includes(query)) ||
      (c.role && c.role.toLowerCase().includes(query)) ||
      (c.category && c.category.toLowerCase().includes(query)) ||
      (c.phone && c.phone.includes(query))
    );
  }

  if (contacts.length === 0) {
    container.innerHTML = `
      <div class="sacred-card rounded-2xl p-6 text-center text-gray-400">
        <i data-lucide="users" class="w-10 h-10 mx-auto mb-2 text-amber-400/60"></i>
        <p class="text-xs">કોઈ સંપર્ક મળ્યો નથી.</p>
      </div>
    `;
    return;
  }

  let html = '';
  contacts.forEach(contact => {
    // Sanitize phone for tel & whatsapp links
    const cleanPhone = (contact.phone || '').replace(/[^0-9]/g, '');
    const waPhone = cleanPhone.length === 10 ? '91' + cleanPhone : cleanPhone;

    html += `
      <div class="sacred-card rounded-2xl p-3 shadow-sm border border-amber-200 flex items-center justify-between">
        <div class="flex-1 min-w-0 pr-2">
          <div class="flex items-center space-x-1.5 mb-1">
            <span class="text-[10px] font-bold px-1.5 py-0.5 rounded bg-amber-100 text-amber-900 border border-amber-200">
              ${escapeHtml(contact.category || 'સેવા')}
            </span>
            <span class="text-[10px] text-amber-700 font-semibold truncate">
              ${escapeHtml(contact.role || '')}
            </span>
          </div>
          <h3 class="text-xs font-bold text-gray-800">${escapeHtml(contact.name)}</h3>
          <div class="text-[11px] text-gray-500 font-mono mt-0.5 flex items-center space-x-2">
            <span>${escapeHtml(contact.phone || '')}</span>
            ${contact.alt_phone ? `<span class="text-gray-400">| ${escapeHtml(contact.alt_phone)}</span>` : ''}
          </div>
          ${contact.address || contact.notes ? `
            <div class="text-[10px] text-gray-400 mt-1 truncate">
              📍 ${escapeHtml(contact.address || contact.notes || '')}
            </div>
          ` : ''}
        </div>

        <!-- 1-Tap Call & WhatsApp Direct Actions -->
        <div class="flex items-center space-x-2 shrink-0">
          ${cleanPhone ? `
            <a href="tel:${cleanPhone}" title="કોલ કરો" class="w-9 h-9 rounded-xl bg-amber-500 text-white flex items-center justify-center shadow-sm hover:bg-amber-600 active:scale-90 transition">
              <i data-lucide="phone" class="w-4 h-4"></i>
            </a>
            <a href="https://wa.me/${waPhone}" target="_blank" title="વોટ્સએપ મેસેજ" class="w-9 h-9 rounded-xl bg-emerald-600 text-white flex items-center justify-center shadow-sm hover:bg-emerald-700 active:scale-90 transition">
              <i data-lucide="message-circle" class="w-4 h-4"></i>
            </a>
          ` : ''}
          <button onclick="deleteContact(${contact.id})" title="કાઢી નાખો" class="text-gray-300 hover:text-rose-600 p-1 active:scale-90 transition">
            <i data-lucide="trash-2" class="w-4 h-4"></i>
          </button>
        </div>
      </div>
    `;
  });

  container.innerHTML = html;
  initIcons();
}

async function deleteContact(id) {
  if (confirm("શું તમે આ સંપર્ક કાઢી નાખવા માંગો છો?")) {
    await sendAction('contact', 'delete', { id });
  }
}

function openAddContactModal() {
  document.getElementById('contactNameInput').value = '';
  document.getElementById('contactRoleInput').value = '';
  document.getElementById('contactPhoneInput').value = '';
  document.getElementById('contactAltPhoneInput').value = '';
  document.getElementById('contactNotesInput').value = '';
  openModal('modalAddContact');
}

async function submitAddContact(e) {
  e.preventDefault();
  const name = document.getElementById('contactNameInput').value.trim();
  const role = document.getElementById('contactRoleInput').value.trim();
  const category = document.getElementById('contactCategoryInput').value;
  const phone = document.getElementById('contactPhoneInput').value.trim();
  const alt_phone = document.getElementById('contactAltPhoneInput').value.trim();
  const notes = document.getElementById('contactNotesInput').value.trim();

  if (!name || !phone) return;
  await sendAction('contact', 'add', { name, role, category, phone, alt_phone, notes });
  closeModal('modalAddContact');
}

/* ==========================================================================
   TAB 5: SHAGUN & SAMAGRI
   ========================================================================== */
function switchShagunSubTab(subTab) {
  currentShagunSubTab = subTab;
  if (subTab === 'shagun') {
    document.getElementById('subSectionShagun').classList.remove('hidden');
    document.getElementById('subSectionSamagri').classList.add('hidden');
    document.getElementById('subTabBtnShagun').className = "flex-1 py-1.5 rounded-lg bg-white shadow-sm text-center text-amber-900";
    document.getElementById('subTabBtnSamagri').className = "flex-1 py-1.5 rounded-lg text-center text-amber-700";
  } else {
    document.getElementById('subSectionShagun').classList.add('hidden');
    document.getElementById('subSectionSamagri').classList.remove('hidden');
    document.getElementById('subTabBtnShagun').className = "flex-1 py-1.5 rounded-lg text-center text-amber-700";
    document.getElementById('subTabBtnSamagri').className = "flex-1 py-1.5 rounded-lg bg-white shadow-sm text-center text-amber-900";
  }
  initIcons();
}

function renderShagun() {
  const container = document.getElementById('shagunListContainer');
  const shagunList = appState.shagun || [];

  const totalShagun = shagunList.reduce((acc, s) => acc + (parseFloat(s.amount) || 0), 0);
  document.getElementById('totalShagunAmount').innerText = formatInr(totalShagun);

  if (shagunList.length === 0) {
    container.innerHTML = `
      <div class="sacred-card rounded-2xl p-6 text-center text-gray-400">
        <i data-lucide="gift" class="w-10 h-10 mx-auto mb-2 text-amber-400/60"></i>
        <p class="text-xs">કોઈ ચાંદલાની નોંધ નથી.</p>
      </div>
    `;
    return;
  }

  let html = '';
  shagunList.forEach(s => {
    html += `
      <div class="sacred-card rounded-2xl p-3 shadow-sm border border-amber-200 flex items-center justify-between">
        <div>
          <div class="flex items-center space-x-1.5 mb-1">
            <span class="text-[10px] font-bold px-1.5 py-0.5 rounded bg-rose-50 text-rose-800 border border-rose-200">
              ${escapeHtml(s.relation || 'સગા')}
            </span>
            ${s.village ? `<span class="text-[10px] text-gray-500">📍 ${escapeHtml(s.village)}</span>` : ''}
          </div>
          <h4 class="text-xs font-bold text-gray-800">${escapeHtml(s.name)}</h4>
          ${s.gift_description ? `<div class="text-[11px] text-gray-500 italic mt-0.5">${escapeHtml(s.gift_description)}</div>` : ''}
        </div>
        <div class="flex items-center space-x-2">
          <span class="text-sm font-black text-rose-700">${formatInr(s.amount)}</span>
          <button onclick="deleteShagun(${s.id})" title="કાઢી નાખો" class="text-gray-300 hover:text-rose-600 p-1 active:scale-90 transition">
            <i data-lucide="trash-2" class="w-4 h-4"></i>
          </button>
        </div>
      </div>
    `;
  });

  container.innerHTML = html;
  initIcons();
}

async function deleteShagun(id) {
  if (confirm("શું તમે આ ચાંદલાની નોંધ કાઢી નાખવા માંગો છો?")) {
    await sendAction('shagun', 'delete', { id });
  }
}

function openAddShagunModal() {
  document.getElementById('shagunNameInput').value = '';
  document.getElementById('shagunRelationInput').value = '';
  document.getElementById('shagunVillageInput').value = '';
  document.getElementById('shagunAmountInput').value = '';
  document.getElementById('shagunGiftInput').value = '';
  openModal('modalAddShagun');
}

async function submitAddShagun(e) {
  e.preventDefault();
  const name = document.getElementById('shagunNameInput').value.trim();
  const relation = document.getElementById('shagunRelationInput').value.trim();
  const village = document.getElementById('shagunVillageInput').value.trim();
  const amount = parseFloat(document.getElementById('shagunAmountInput').value) || 0;
  const gift_description = document.getElementById('shagunGiftInput').value.trim();

  if (!name || !amount) return;
  await sendAction('shagun', 'add', { name, relation, village, amount, gift_description });
  closeModal('modalAddShagun');
}

// Samagri Checklist
function renderSamagri() {
  const container = document.getElementById('samagriListContainer');
  const samagriList = appState.samagri || [];

  if (samagriList.length === 0) {
    container.innerHTML = `
      <div class="sacred-card rounded-2xl p-6 text-center text-gray-400">
        <i data-lucide="sparkles" class="w-10 h-10 mx-auto mb-2 text-amber-400/60"></i>
        <p class="text-xs">કોઈ સામગ્રી ઉમેરેલ નથી.</p>
      </div>
    `;
    return;
  }

  let html = '';
  samagriList.forEach(sm => {
    const isArranged = !!sm.is_arranged;
    html += `
      <div class="sacred-card rounded-2xl p-2.5 shadow-sm border ${isArranged ? 'bg-emerald-50/40 border-emerald-200' : 'border-amber-200'} flex items-center justify-between">
        <div class="flex items-center space-x-2.5 flex-1 min-w-0">
          <button onclick="toggleSamagri(${sm.id}, ${isArranged ? 0 : 1})" class="w-5 h-5 rounded flex items-center justify-center border ${isArranged ? 'bg-emerald-600 border-emerald-600 text-white' : 'border-amber-400 bg-white'} active:scale-90 transition">
            ${isArranged ? '<i data-lucide="check" class="w-3.5 h-3.5 stroke-[3]"></i>' : ''}
          </button>
          <div class="truncate">
            <h4 class="text-xs font-bold ${isArranged ? 'task-completed-text' : 'text-gray-800'} truncate">
              ${escapeHtml(sm.item_name)}
            </h4>
            <div class="text-[10px] text-gray-400 flex items-center space-x-2">
              ${sm.quantity ? `<span>જથ્થો: ${escapeHtml(sm.quantity)}</span>` : ''}
              ${sm.arranged_by ? `<span>લાવનાર: <strong>${escapeHtml(sm.arranged_by)}</strong></span>` : ''}
            </div>
          </div>
        </div>

        <button onclick="deleteSamagri(${sm.id})" title="કાઢી નાખો" class="text-gray-300 hover:text-rose-600 p-1 active:scale-90 transition">
          <i data-lucide="trash-2" class="w-3.5 h-3.5"></i>
        </button>
      </div>
    `;
  });

  container.innerHTML = html;
  initIcons();
}

async function toggleSamagri(id, newVal) {
  if (newVal === 1) playCompletionChime();
  await sendAction('samagri', 'toggle', { id, is_arranged: newVal });
}

async function deleteSamagri(id) {
  if (confirm("શું તમે આ સામગ્રી કાઢી નાખવા માંગો છો?")) {
    await sendAction('samagri', 'delete', { id });
  }
}

function openAddSamagriModal() {
  document.getElementById('samagriNameInput').value = '';
  document.getElementById('samagriQtyInput').value = '';
  document.getElementById('samagriArrangedByInput').value = userName;
  openModal('modalAddSamagri');
}

async function submitAddSamagri(e) {
  e.preventDefault();
  const item_name = document.getElementById('samagriNameInput').value.trim();
  const quantity = document.getElementById('samagriQtyInput').value.trim();
  const arranged_by = document.getElementById('samagriArrangedByInput').value.trim();

  if (!item_name) return;
  await sendAction('samagri', 'add', { item_name, quantity, arranged_by });
  closeModal('modalAddSamagri');
}

/* ==========================================================================
   ACTIVITY FEED & NOTIFICATIONS
   ========================================================================== */
function renderActivityFeed() {
  const container = document.getElementById('activityFeedContainer');
  const activities = appState.activities || [];

  if (activities.length === 0) {
    container.innerHTML = `<p class="text-[11px] text-gray-400">હજુ કોઈ પ્રવૃત્તિ નોંધાઈ નથી.</p>`;
    return;
  }

  let html = '';
  activities.slice(0, 8).forEach(act => {
    html += `
      <div class="text-[11px] text-gray-600 flex items-start space-x-1.5 py-1 border-b border-gray-50 last:border-none">
        <span class="text-amber-600 font-bold">›</span>
        <div class="flex-1">
          <span>${escapeHtml(act.description || '')}</span>
          <span class="text-[9px] text-gray-400 block">${escapeHtml(act.timestamp || '')}</span>
        </div>
      </div>
    `;
  });

  container.innerHTML = html;
}

// Live Toast Message
let toastTimeout = null;
function showToast(msg) {
  const toast = document.getElementById('liveToast');
  const text = document.getElementById('toastText');
  text.innerText = msg;
  toast.classList.remove('hidden');

  if (toastTimeout) clearTimeout(toastTimeout);
  toastTimeout = setTimeout(() => {
    hideToast();
  }, 4500);
}

function hideToast() {
  const toast = document.getElementById('liveToast');
  toast.classList.add('hidden');
}

// Reminders Check Loop
function initRemindersCheck() {
  // Ask for notification permission if not yet granted
  if ("Notification" in window && Notification.permission === "default") {
    // We can prompt gently when user interacts
  }

  setInterval(() => {
    const now = new Date();
    const currentDate = now.toISOString().split('T')[0];
    const currentHours = String(now.getHours()).padStart(2, '0');
    const currentMins = String(now.getMinutes()).padStart(2, '0');
    const currentTime = `${currentHours}:${currentMins}`;

    const tasks = appState.tasks || [];
    tasks.forEach(t => {
      if (!t.is_completed && t.due_date === currentDate && t.reminder_time === currentTime) {
        triggerReminderAlert(t);
      }
    });
  }, 60000); // Check once per minute
}

function triggerReminderAlert(task) {
  playLiveNotificationTone();
  showToast(`⏰ રિમાઇન્ડર: ${task.title} (સોંપનાર: ${task.assigned_to || 'તમે'})`);

  if ("Notification" in window && Notification.permission === "granted") {
    new Notification("યજ્ઞોપવીત રિમાઇન્ડર 🪔", {
      body: `${task.title} - સમય થઈ ગયો છે!`,
      icon: '/static/icon.svg'
    });
  }
}

/* ==========================================================================
   SHARE MODAL & QR CODE GENERATION
   ========================================================================== */
function openShareModal() {
  updateShareModalInfo();
  openModal('modalShare');
}

function getShareUrl() {
  if (serverInfo && serverInfo.public_url) {
    return serverInfo.public_url;
  }
  const port = serverInfo.port || 8000;
  const ip = serverInfo.local_ip || window.location.hostname;
  return `http://${ip}:${port}`;
}

function updateShareModalInfo() {
  const shareUrl = getShareUrl();
  const urlDisplay = document.getElementById('shareUrlDisplay');
  if (urlDisplay) urlDisplay.innerText = shareUrl;

  const publicBadge = document.getElementById('shareTypeBadge');
  if (publicBadge) {
    if (serverInfo && serverInfo.public_url) {
      publicBadge.innerText = "🌍 ગમે ત્યાંથી (Mobile Data / Internet લાઈવ)";
      publicBadge.className = "text-[10px] font-bold text-emerald-800 bg-emerald-100 px-2 py-0.5 rounded-full inline-block mb-1";
    } else {
      publicBadge.innerText = "🏠 ઘરના Wi-Fi પર (Same Network)";
      publicBadge.className = "text-[10px] font-bold text-amber-800 bg-amber-100 px-2 py-0.5 rounded-full inline-block mb-1";
    }
  }

  const qrContainer = document.getElementById('qrcodeCanvas');
  if (qrContainer && window.QRCode) {
    qrContainer.innerHTML = '';
    new QRCode(qrContainer, {
      text: shareUrl,
      width: 160,
      height: 160,
      colorDark: "#78350F",
      colorLight: "#FFFBEB",
      correctLevel: QRCode.CorrectLevel.M
    });
  }
}

function copyShareLink() {
  const shareUrl = getShareUrl();
  navigator.clipboard.writeText(shareUrl).then(() => {
    showToast("📋 લિંક કોપી થઈ ગઈ!");
  }).catch(() => {
    prompt("લિંક કોપી કરો:", shareUrl);
  });
}

function shareOnWhatsApp() {
  const shareUrl = getShareUrl();
  const s = appState.settings || {};
  const boy = s.boy_name || 'ચિ. કુમાર';
  const text = encodeURIComponent(`ૐ નમો નારાયણાય!\nઅમારા ${boy} ના પવિત્ર ઉપનયન સંસ્કાર (જનોઈ મહોત્સવ) માટેની તૈયારીઓ, ખર્ચ, સમયપત્રક અને લાઈવ સહયોગ માટે અહીં ક્લિક કરો:\n👉 ${shareUrl}\n(આ લિંક વડે તમે સીધા જ કોઈપણ વિગત લાઈવ ઉમેરી શકો છો)`);
  window.open(`https://api.whatsapp.com/send?text=${text}`, '_blank');
}

/* ==========================================================================
   SETTINGS & CEREMONY DETAILS MODAL
   ========================================================================== */
function openSettingsModal() {
  renderHeaderAndSettings();
  openModal('modalSettings');
}

async function submitSaveSettings(e) {
  e.preventDefault();
  const boy_name = document.getElementById('settingsBoyName').value.trim();
  const father_name = document.getElementById('settingsFatherName').value.trim();
  const mother_name = document.getElementById('settingsMotherName').value.trim();
  const event_date = document.getElementById('settingsEventDate').value;
  const budget_target = document.getElementById('settingsBudget').value;
  const venue = document.getElementById('settingsVenue').value.trim();

  await sendAction('settings', 'update', {
    boy_name, father_name, mother_name, event_date, budget_target, venue
  });
  closeModal('modalSettings');
}

/* ==========================================================================
   MODAL UTILITIES & HELPERS
   ========================================================================== */
function openModal(id) {
  document.getElementById(id).classList.remove('hidden');
}

function closeModal(id) {
  document.getElementById(id).classList.add('hidden');
}

function escapeHtml(text) {
  if (!text) return '';
  return String(text)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function formatFriendlyDate(dateStr) {
  if (!dateStr) return '';
  try {
    const parts = dateStr.split('-');
    if (parts.length === 3) {
      const d = parseInt(parts[2]);
      const m = parseInt(parts[1]);
      const y = parts[0];
      const months = ['જાન્યુઆરી', 'ફેબ્રુઆરી', 'માર્ચ', 'એપ્રિલ', 'મે', 'જૂન', 'જુલાઈ', 'ઓગસ્ટ', 'સપ્ટેમ્બર', 'ઓક્ટોબર', 'નવેમ્બર', 'ડિસેમ્બર'];
      return `${d} ${months[m - 1]} ${y}`;
    }
  } catch (e) {}
  return dateStr;
}
