// 1. GAME STATE MANAGEMENT
const FISH_PER_TEAM = 30; // Initial fish scales with team count to keep balance consistent
const LAKE_CAPACITY = 200;
const SAVE_KEY = 'fishermen-of-the-lake-save-v2';
const UNDO_KEY = 'fishermen-of-the-lake-undo-v2';

const state = {
  // Fixed simulation constants (not teacher-configurable)
  maxTurns: 9,
  reproductionRate: 80, // % - fixed
  decimalRule: '1',     // fixed - always show one decimal place
  initialFish: 5 * FISH_PER_TEAM,
  // Allocation is always proportional to boats launched when fish are scarce

  // Configurable settings
  teamsCount: 5,

  // Game running state
  currentTurn: 1,
  fishCount: 5 * FISH_PER_TEAM,
  maxFishCount: LAKE_CAPACITY,
  teams: [],
  history: [],
  // Phase is derived from currentTurn: 1-3 laissez, 4-6 agreement, 7-9 regulation+monitoring
  policyParams: {
    regulationMaxBoats: 1 // Max boats allowed once the regulation phase starts (turn 7+)
  },
  phaseAnnounced: {
    agreement: false,
    regulation: false
  },

  // Input focus index for classroom keyboard convenience
  focusedTeamIndex: 0,
  
  // Masking toggles for projecting on front screens
  isInputMasked: false,
  projectorWindow: null,
  
  // Status check
  isGameOver: false,
  continueAfterDepletion: false
};

function createGameSnapshot() {
  const snapshot = {
    maxTurns: state.maxTurns,
    reproductionRate: state.reproductionRate,
    decimalRule: state.decimalRule,
    initialFish: state.initialFish,
    teamsCount: state.teamsCount,
    currentTurn: state.currentTurn,
    fishCount: state.fishCount,
    maxFishCount: state.maxFishCount,
    teams: state.teams,
    history: state.history,
    policyParams: state.policyParams,
    phaseAnnounced: state.phaseAnnounced,
    focusedTeamIndex: state.focusedTeamIndex,
    isInputMasked: state.isInputMasked,
    isGameOver: state.isGameOver,
    continueAfterDepletion: state.continueAfterDepletion,
    timeLeft
  };
  return JSON.parse(JSON.stringify(snapshot));
}

function storeSnapshot(key, snapshot) {
  try {
    localStorage.setItem(key, JSON.stringify(snapshot));
  } catch (error) {
    console.warn('수업 기록을 브라우저에 저장하지 못했습니다.', error);
  }
}

function boundedNumber(value, min, max, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.min(max, Math.max(min, number)) : fallback;
}

function normalizeStoredSnapshot(raw) {
  if (!raw || typeof raw !== 'object') return null;

  const teamsCount = Math.round(boundedNumber(raw.teamsCount, 2, 8, 5));
  const rawTeams = Array.isArray(raw.teams) ? raw.teams : [];
  const teams = Array.from({ length: teamsCount }, (_, index) => {
    const id = index + 1;
    const source = rawTeams.find(team => Number(team?.id) === id) || {};
    const choice = [1, 2, 3].includes(Number(source.currentChoice)) ? Number(source.currentChoice) : null;
    const teamHistory = Array.isArray(source.history) ? source.history.slice(0, 9) : [];
    return {
      id,
      name: `${id}모둠`,
      score: boundedNumber(source.score, -10000, 100000),
      currentChoice: choice,
      history: teamHistory.map(item => ({
        turn: Math.round(boundedNumber(item?.turn, 1, 9, 1)),
        choice: Math.round(boundedNumber(item?.choice, 1, 3, 1)),
        captured: boundedNumber(item?.captured, 0, LAKE_CAPACITY),
        penalty: boundedNumber(item?.penalty, 0, 1000)
      }))
    };
  });

  const rawHistory = Array.isArray(raw.history) ? raw.history.slice(0, 9) : [];
  const history = rawHistory.map((entry, index) => {
    const turn = Math.round(boundedNumber(entry?.turn, 1, 9, index + 1));
    const rawDetails = Array.isArray(entry?.teamDetails) ? entry.teamDetails : [];
    const teamDetails = teams.map(team => {
      const detail = rawDetails.find(item => Number(item?.teamId) === team.id) || {};
      return {
        teamId: team.id,
        teamName: team.name,
        turn,
        choice: Math.round(boundedNumber(detail.choice, 1, 3, 1)),
        captured: boundedNumber(detail.captured, 0, LAKE_CAPACITY),
        penalty: boundedNumber(detail.penalty, 0, 1000),
        finePotential: boundedNumber(detail.finePotential, 0, 1000),
        cumulative: boundedNumber(detail.cumulative, -10000, 100000),
        revealed: Boolean(detail.revealed)
      };
    });
    return {
      turn,
      phase: getPhase(turn),
      regulationMaxBoats: Math.round(boundedNumber(entry?.regulationMaxBoats, 1, 2, 1)),
      totalBoats: boundedNumber(entry?.totalBoats, 0, teamsCount * 3),
      totalCaptured: boundedNumber(entry?.totalCaptured, 0, LAKE_CAPACITY),
      remainBeforeReproduction: boundedNumber(entry?.remainBeforeReproduction, 0, LAKE_CAPACITY),
      reproducedCount: boundedNumber(entry?.reproducedCount, 0, LAKE_CAPACITY),
      nextTurnStartFish: boundedNumber(entry?.nextTurnStartFish, 0, LAKE_CAPACITY),
      teamDetails
    };
  });

  return {
    maxTurns: 9,
    reproductionRate: 80,
    decimalRule: '1',
    initialFish: boundedNumber(raw.initialFish, 0, LAKE_CAPACITY, Math.min(teamsCount * FISH_PER_TEAM, LAKE_CAPACITY)),
    teamsCount,
    currentTurn: Math.round(boundedNumber(raw.currentTurn, 1, 9, 1)),
    fishCount: boundedNumber(raw.fishCount, 0, LAKE_CAPACITY),
    maxFishCount: LAKE_CAPACITY,
    teams,
    history,
    policyParams: {
      regulationMaxBoats: Math.round(boundedNumber(raw.policyParams?.regulationMaxBoats, 1, 2, 1))
    },
    phaseAnnounced: {
      agreement: Boolean(raw.phaseAnnounced?.agreement),
      regulation: Boolean(raw.phaseAnnounced?.regulation)
    },
    focusedTeamIndex: Math.round(boundedNumber(raw.focusedTeamIndex, 0, teamsCount - 1, 0)),
    isInputMasked: Boolean(raw.isInputMasked),
    isGameOver: Boolean(raw.isGameOver),
    continueAfterDepletion: Boolean(raw.continueAfterDepletion),
    timeLeft: Math.round(boundedNumber(raw.timeLeft, 0, 3600, 180))
  };
}

function readSnapshot(key) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? normalizeStoredSnapshot(JSON.parse(raw)) : null;
  } catch (error) {
    console.warn('저장된 수업 기록을 읽지 못했습니다.', error);
    return null;
  }
}

function saveGameState() {
  if (!state.teams.length) return;
  storeSnapshot(SAVE_KEY, createGameSnapshot());
  updateResumeButton();
}

function updateResumeButton() {
  const button = document.getElementById('btn-resume-game');
  if (!button) return;
  button.classList.toggle('hidden', !readSnapshot(SAVE_KEY));
}

function restoreSnapshot(snapshot, { normalizeCompletedTurn = false } = {}) {
  if (!snapshot || !Array.isArray(snapshot.teams) || !Array.isArray(snapshot.history)) return false;

  Object.assign(state, snapshot, {
    maxFishCount: LAKE_CAPACITY,
    projectorWindow: null,
    policyParams: { regulationMaxBoats: 1, ...snapshot.policyParams },
    phaseAnnounced: { agreement: false, regulation: false, ...snapshot.phaseAnnounced }
  });
  timeLeft = Number.isFinite(snapshot.timeLeft) ? snapshot.timeLeft : 180;

  const lastTurn = state.history[state.history.length - 1];
  const hasPendingDepletionChoice = state.fishCount <= 0
    && !state.continueAfterDepletion
    && !state.isGameOver;
  if (normalizeCompletedTurn && lastTurn && lastTurn.turn === state.currentTurn
      && !state.isGameOver && !hasPendingDepletionChoice) {
    state.currentTurn++;
  }

  document.querySelectorAll('.modal-overlay.active').forEach(modal => modal.classList.remove('active'));
  hideElement('lake-overlay-msg');
  document.getElementById('capacity-info-display').textContent = `수용력 ${LAKE_CAPACITY}마리 · 초기 ${state.initialFish}마리`;
  resetTimer(timeLeft);
  applyPhaseForTurn(state.currentTurn);
  syncInputMaskUi();
  updateGameHeader();
  renderHistoryTable();
  showScreen('game-screen');
  if (hasPendingDepletionChoice) showElement('lake-overlay-msg');
  document.getElementById('btn-execute-turn').disabled = false;
  return true;
}

// 2. TIMERS & AUDIOS
let timerInterval = null;
let timeLeft = 180; // Default 3 mins in seconds
let isTurnExecuting = false;

// Play synthetic beep sound using Web Audio API
function playBeep(frequency = 800, duration = 0.15, repeatCount = 1) {
  try {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) return;
    
    const audioCtx = new AudioContextClass();
    
    let currentDelay = 0;
    for (let i = 0; i < repeatCount; i++) {
      const oscillator = audioCtx.createOscillator();
      const gainNode = audioCtx.createGain();
      
      oscillator.connect(gainNode);
      gainNode.connect(audioCtx.destination);
      
      oscillator.type = 'sine';
      oscillator.frequency.setValueAtTime(frequency, audioCtx.currentTime + currentDelay);
      gainNode.gain.setValueAtTime(0.08, audioCtx.currentTime + currentDelay);
      
      oscillator.start(audioCtx.currentTime + currentDelay);
      oscillator.stop(audioCtx.currentTime + currentDelay + duration);
      
      currentDelay += duration + 0.08; // gap between beeps
    }
  } catch (e) {
    console.warn("Audio Context block or unsupported", e);
  }
}

// 3. CANVAS FISH SIMULATION
const canvas = document.getElementById('lake-canvas');
const ctx = canvas.getContext('2d');
let animationFrameId = null;
let fishList = [];

class Fish {
  constructor(w, h) {
    this.w = w;
    this.h = h;
    this.x = Math.random() * w;
    this.y = Math.random() * h;
    this.size = 8 + Math.random() * 8; // Size of fish
    this.speed = 1.0 + Math.random() * 1.5;
    this.angle = Math.random() * Math.PI * 2;
    this.turnSpeed = (Math.random() - 0.5) * 0.05;
    this.color = this.getRandomColor();
  }

  getRandomColor() {
    // Generate harmonious cyan-blue colors
    const hue = 170 + Math.random() * 40; // 170 to 210
    const sat = 70 + Math.random() * 30; // 70% to 100%
    const light = 40 + Math.random() * 20; // 40% to 60%
    return `hsla(${hue}, ${sat}%, ${light}%, 0.8)`;
  }

  draw(context) {
    context.save();
    context.translate(this.x, this.y);
    context.rotate(this.angle);

    // Fish body shape
    context.fillStyle = this.color;
    context.beginPath();
    context.ellipse(0, 0, this.size, this.size / 2.2, 0, 0, Math.PI * 2);
    context.fill();

    // Tail fin
    context.beginPath();
    context.moveTo(-this.size, 0);
    context.lineTo(-this.size - (this.size / 2), -this.size / 2);
    context.lineTo(-this.size - (this.size / 2), this.size / 2);
    context.closePath();
    context.fill();

    // Eye
    context.fillStyle = '#ffffff';
    context.beginPath();
    context.arc(this.size / 2, -this.size / 6, 2, 0, Math.PI * 2);
    context.fill();
    context.fillStyle = '#000000';
    context.beginPath();
    context.arc(this.size / 2, -this.size / 6, 0.8, 0, Math.PI * 2);
    context.fill();

    context.restore();
  }

  update(w, h) {
    // Random wiggle
    this.angle += this.turnSpeed;
    if (Math.random() < 0.05) {
      this.turnSpeed = (Math.random() - 0.5) * 0.05;
    }

    // Move forward
    this.x += Math.cos(this.angle) * this.speed;
    this.y += Math.sin(this.angle) * this.speed;

    // Boundary wrap/bounce with direction change
    const margin = 20;
    if (this.x < -margin) this.x = w + margin;
    if (this.x > w + margin) this.x = -margin;
    if (this.y < -margin) this.y = h + margin;
    if (this.y > h + margin) this.y = -margin;
  }
}

// Handle resize & initialization of Canvas
function initCanvas() {
  const rect = canvas.parentElement.getBoundingClientRect();
  canvas.width = rect.width || 600;
  canvas.height = rect.height || 380;
  
  // Sync fishCount with canvas display
  updateFishPopulation();
}

function updateFishPopulation() {
  const w = canvas.width;
  const h = canvas.height;
  
  // Draw roughly proportional number of fish (cap at 60 to prevent lags, min 0)
  const targetFishDisplayCount = Math.min(Math.ceil(state.fishCount * 0.6), 60);
  
  if (fishList.length < targetFishDisplayCount) {
    // Spawn more
    const diff = targetFishDisplayCount - fishList.length;
    for (let i = 0; i < diff; i++) {
      fishList.push(new Fish(w, h));
    }
  } else if (fishList.length > targetFishDisplayCount) {
    // Remove excess
    fishList.splice(targetFishDisplayCount);
  }
}

function animateLake() {
  if (!canvas || !ctx) return;
  
  const w = canvas.width;
  const h = canvas.height;
  
  // Use a calm flat water color that still reflects the lake's health.
  let waterColor;
  const ratio = state.fishCount / state.maxFishCount;

  if (ratio > 0.7) {
    waterColor = '#0e7490';
  } else if (ratio > 0.4) {
    waterColor = '#287d8e';
  } else if (ratio > 0.15) {
    waterColor = '#8a6a3b';
  } else if (ratio > 0.0) {
    waterColor = '#66575a';
  } else {
    waterColor = '#475569';
  }

  ctx.fillStyle = waterColor;
  ctx.fillRect(0, 0, w, h);

  // Render grid lines for dynamic visual depth on main screen
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.02)';
  ctx.lineWidth = 1;
  const gridSize = 40;
  for (let x = 0; x < w; x += gridSize) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, h);
    ctx.stroke();
  }
  for (let y = 0; y < h; y += gridSize) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(w, y);
    ctx.stroke();
  }

  // Draw and update fish
  fishList.forEach(fish => {
    fish.update(w, h);
    fish.draw(ctx);
  });

  // Render mirror onto the projector screen if open and active
  if (state.projectorWindow && !state.projectorWindow.closed && projectorCanvas && projectorCtx) {
    const pw = projectorCanvas.width;
    const ph = projectorCanvas.height;
    
    projectorCtx.fillStyle = waterColor;
    projectorCtx.fillRect(0, 0, pw, ph);
    
    // Draw grid on projector
    projectorCtx.strokeStyle = 'rgba(255, 255, 255, 0.02)';
    projectorCtx.lineWidth = 1;
    for (let x = 0; x < pw; x += gridSize) {
      projectorCtx.beginPath();
      projectorCtx.moveTo(x, 0);
      projectorCtx.lineTo(x, ph);
      projectorCtx.stroke();
    }
    for (let y = 0; y < ph; y += gridSize) {
      projectorCtx.beginPath();
      projectorCtx.moveTo(0, y);
      projectorCtx.lineTo(pw, y);
      projectorCtx.stroke();
    }
    
    // Draw fish on projector
    fishList.forEach(fish => {
      // Scale positions to projector width/height
      const scaleX = pw / w;
      const scaleY = ph / h;
      
      projectorCtx.save();
      projectorCtx.translate(fish.x * scaleX, fish.y * scaleY);
      projectorCtx.rotate(fish.angle);
      
      // Draw fish shape
      projectorCtx.fillStyle = fish.color;
      projectorCtx.beginPath();
      projectorCtx.ellipse(0, 0, fish.size * 0.9 * scaleX, (fish.size / 2.2) * 0.9 * scaleY, 0, 0, Math.PI * 2);
      projectorCtx.fill();
      
      // Tail
      projectorCtx.beginPath();
      projectorCtx.moveTo(-fish.size * 0.9 * scaleX, 0);
      projectorCtx.lineTo(-fish.size * 1.4 * scaleX, -fish.size * 0.45 * scaleY);
      projectorCtx.lineTo(-fish.size * 1.4 * scaleX, fish.size * 0.45 * scaleY);
      projectorCtx.closePath();
      projectorCtx.fill();
      
      projectorCtx.restore();
    });
  }

  animationFrameId = requestAnimationFrame(animateLake);
}

// 4. SCREEN CONTROL
function showScreen(screenId) {
  document.querySelectorAll('.screen').forEach(scr => {
    scr.classList.remove('active');
    scr.style.display = 'none';
  });
  const activeScr = document.getElementById(screenId);
  activeScr.style.display = 'flex';
  setTimeout(() => {
    activeScr.classList.add('active');
  }, 10);
  
  if (screenId === 'game-screen') {
    // Initialize canvas rendering on display
    setTimeout(() => {
      initCanvas();
      if (!animationFrameId) animateLake();
    }, 100);
  }
  
  // Sync projector screen
  updateProjectorView();
}

// 5.5 FIXED PHASE SCHEDULE (turns 1-3 laissez / 4-6 agreement / 7-9 regulation+monitoring)
const REGULATION_FINE_PER_BOAT = 7; // Points deducted per boat over the regulated limit (turns 7-9)

function getPhase(turn) {
  if (turn <= 3) return 'laissez';
  if (turn <= 6) return 'agreement';
  return 'regulation';
}

function isRegulationPhase(turn) {
  return getPhase(turn) === 'regulation';
}

function applyPhaseForTurn(turn) {
  const phase = getPhase(turn);
  const order = ['laissez', 'agreement', 'regulation'];
  const idx = order.indexOf(phase);

  order.forEach((p, i) => {
    const el = document.getElementById(`policy-${p}`);
    if (!el) return;
    el.classList.remove('active', 'completed');
    if (i < idx) el.classList.add('completed');
    if (i === idx) el.classList.add('active');
  });

  hideElement('policy-settings-area');
  let polDisp = '';

  if (phase === 'laissez') {
    polDisp = '1~3턴 · 자유 방임 모드 (제한 없음)';
  } else if (phase === 'agreement') {
    polDisp = '4~6턴 · 자율 협약 모드 🤝';
    if (!state.phaseAnnounced.agreement) {
      state.phaseAnnounced.agreement = true;
      openAgreementModal();
    }
  } else {
    polDisp = '7~9턴 · 정부 규제 · 감시 실패 모드 ⚖️🔍';
    showElement('policy-settings-area');
    renderRegulationConfig();
    if (!state.phaseAnnounced.regulation) {
      state.phaseAnnounced.regulation = true;
      const modalMax = document.getElementById('regulation-modal-max');
      if (modalMax) modalMax.textContent = `${state.policyParams.regulationMaxBoats}척`;
      openRegulationModal();
    }
  }

  document.getElementById('active-policy-display').textContent = polDisp;
  renderTeamInputs();
}

// 5. STEPPER HELPER
function adjustStep(inputId, step, min, max) {
  const input = document.getElementById(inputId);
  if (!input) return;
  let val = parseInt(input.value) + step;
  if (val < min) val = min;
  if (val > max) val = max;
  input.value = val;
}

// 6. INITIAL SETUP
document.getElementById('btn-open-guide').addEventListener('click', openGuideModal);
document.getElementById('btn-open-rules').addEventListener('click', openRulesModal);
document.getElementById('setup-form').addEventListener('submit', event => event.preventDefault());
document.getElementById('btn-teams-minus').addEventListener('click', () => adjustStep('input-teams-count', -1, 2, 8));
document.getElementById('btn-teams-plus').addEventListener('click', () => adjustStep('input-teams-count', 1, 2, 8));
document.getElementById('btn-export-capture').addEventListener('click', () => window.print());
document.getElementById('btn-close-result').addEventListener('click', closeModal);
document.getElementById('btn-next-turn').addEventListener('click', closeModal);
document.getElementById('btn-close-agreement').addEventListener('click', closeAgreementModal);
document.getElementById('btn-close-regulation').addEventListener('click', closeRegulationModal);
document.getElementById('btn-close-guide-x').addEventListener('click', closeGuideModal);
document.getElementById('btn-close-guide').addEventListener('click', closeGuideModal);
document.getElementById('btn-close-rules-x').addEventListener('click', closeRulesModal);
document.getElementById('btn-close-rules').addEventListener('click', closeRulesModal);
document.getElementById('btn-resume-game').addEventListener('click', () => {
  const snapshot = readSnapshot(SAVE_KEY);
  if (!snapshot) {
    updateResumeButton();
    return;
  }
  if (restoreSnapshot(snapshot, { normalizeCompletedTurn: true })) {
    if (state.isGameOver) triggerGameOver();
    else saveGameState();
  }
});

document.getElementById('btn-start-game').addEventListener('click', () => {
  const teamsCountInput = parseInt(document.getElementById('input-teams-count').value);

  // Initialize state (maxTurns/reproductionRate/allocation/decimal rule are fixed constants;
  // initial fish scales with team count so the balance holds regardless of class size)
  state.teamsCount = teamsCountInput;
  const scaledFish = Math.min(teamsCountInput * FISH_PER_TEAM, LAKE_CAPACITY);
  state.initialFish = scaledFish;
  state.fishCount = scaledFish;
  state.maxFishCount = LAKE_CAPACITY;
  state.policyParams.regulationMaxBoats = 1;
  document.getElementById('capacity-info-display').textContent = `수용력 ${LAKE_CAPACITY}마리 · 초기 ${scaledFish}마리`;

  state.currentTurn = 1;
  state.isGameOver = false;
  state.continueAfterDepletion = false;
  state.history = [];
  state.phaseAnnounced = { agreement: false, regulation: false };

  // Reset Input Masking UI
  state.isInputMasked = false;
  const maskContainer = document.getElementById('team-inputs-container');
  if (maskContainer) maskContainer.classList.remove('mask-active');
  const btnMask = document.getElementById('btn-toggle-mask');
  if (btnMask) {
    btnMask.textContent = '🔒 비밀 입력 켜기';
    btnMask.classList.remove('btn-secondary');
    btnMask.classList.add('btn-warning');
  }

  // Create Teams
  state.teams = [];
  for (let i = 1; i <= state.teamsCount; i++) {
    state.teams.push({
      id: i,
      name: `${i}모둠`,
      score: 0,
      currentChoice: null,
      history: [] // Choice history per turn
    });
  }

  // Set default negotiation timer
  resetTimer(180); // 3 minutes

  // Render Game Elements
  applyPhaseForTurn(1);
  updateGameHeader();
  renderHistoryTable();
  hideElement('lake-overlay-msg');

  // Show game screen
  showScreen('game-screen');

  try { localStorage.removeItem(UNDO_KEY); } catch (error) { console.warn(error); }
  saveGameState();

  playBeep(600, 0.15, 2);
});

// 7. KEYBOARD SHORTCUTS FOR SMARTBOARD INPUTS
window.addEventListener('keydown', (e) => {
  // Check if we are on the game screen and not focusing input element (though all inputs are read-only)
  const gameScreen = document.getElementById('game-screen');
  const modalIsOpen = document.querySelector('.modal-overlay.active');
  const depletionChoiceIsOpen = !document.getElementById('lake-overlay-msg').classList.contains('hidden');
  if (!gameScreen.classList.contains('active') || state.isGameOver || modalIsOpen || depletionChoiceIsOpen || isTurnExecuting) return;
  
  // Listen to 1, 2, 3 keys
  if (e.key === '1' || e.key === '2' || e.key === '3') {
    const value = parseInt(e.key);
    selectTeamChoice(state.focusedTeamIndex, value);
  }

  // Backspace to undo previous choices
  if (e.key === 'Backspace') {
    e.preventDefault();
    // Reset current focused team's choice first if not null
    const currentTeam = state.teams[state.focusedTeamIndex];
    if (currentTeam && currentTeam.currentChoice !== null) {
      selectTeamChoice(state.focusedTeamIndex, null);
    } else {
      // Go back to previous team and reset it
      let prevIdx = state.focusedTeamIndex - 1;
      if (prevIdx < 0) prevIdx = state.teamsCount - 1;
      setFocusedTeam(prevIdx);
      selectTeamChoice(prevIdx, null);
    }
  }

  // H / ㅗ to toggle screen input mask
  if (e.key.toLowerCase() === 'h' || e.key === 'ㅗ') {
    e.preventDefault();
    toggleInputMask();
  }
  
  // Listen to arrow keys / Enter for navigation
  if (e.key === 'ArrowDown') {
    e.preventDefault();
    moveInputFocus(1);
  }
  if (e.key === 'ArrowUp') {
    e.preventDefault();
    moveInputFocus(-1);
  }
  if (e.key === 'Enter') {
    e.preventDefault();
    // If all are entered, trigger turn run
    const allEntered = state.teams.every(t => t.currentChoice !== null);
    if (allEntered) {
      document.getElementById('btn-execute-turn').click();
    } else {
      // Find first empty and focus it
      const nextEmpty = state.teams.findIndex(t => t.currentChoice === null);
      if (nextEmpty !== -1) {
        setFocusedTeam(nextEmpty);
      }
    }
  }
});

function toggleInputMask() {
  state.isInputMasked = !state.isInputMasked;
  syncInputMaskUi();
  playBeep(state.isInputMasked ? 900 : 1100, 0.05);
  saveGameState();
}

function syncInputMaskUi() {
  const container = document.getElementById('team-inputs-container');
  const btn = document.getElementById('btn-toggle-mask');
  if (!container || !btn) return;
  
  if (state.isInputMasked) {
    container.classList.add('mask-active');
    btn.textContent = '🔓 비밀 입력 끄기';
    btn.classList.remove('btn-warning');
    btn.classList.add('btn-secondary');
  } else {
    container.classList.remove('mask-active');
    btn.textContent = '🔒 비밀 입력 켜기';
    btn.classList.remove('btn-secondary');
    btn.classList.add('btn-warning');
  }
}

// Bind toggle mask click handler
document.getElementById('btn-toggle-mask').addEventListener('click', toggleInputMask);

document.getElementById('team-inputs-container').addEventListener('click', event => {
  const label = event.target.closest('label[data-team-index][data-choice]');
  if (!label) return;
  selectTeamChoice(Number(label.dataset.teamIndex), Number(label.dataset.choice));
});

function setFocusedTeam(index) {
  state.focusedTeamIndex = index;
  document.querySelectorAll('.team-input-row').forEach((row, i) => {
    if (i === index) {
      row.classList.add('focused');
      // Scroll to view if needed
      row.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    } else {
      row.classList.remove('focused');
    }
  });
}

function moveInputFocus(direction) {
  let nextIdx = state.focusedTeamIndex + direction;
  if (nextIdx < 0) nextIdx = state.teamsCount - 1;
  if (nextIdx >= state.teamsCount) nextIdx = 0;
  setFocusedTeam(nextIdx);
}

function selectTeamChoice(teamIndex, value) {
  const team = state.teams[teamIndex];
  if (!team) return;
  
  if (value === null) {
    // Nullify choice (Undo action)
    team.currentChoice = null;
    
    // Uncheck radio button UI
    for (let v = 1; v <= 3; v++) {
      const r = document.getElementById(`choice-${team.id}-${v}`);
      if (r) r.checked = false;
    }
    
    // Update row style
    const row = document.getElementById(`team-row-${team.id}`);
    if (row) {
      row.classList.remove('entered');
      row.classList.remove('temp-reveal'); // Reset reveal
      const layer = row.querySelector('.mask-overlay-layer');
      if (layer) layer.textContent = '🔒 입력 대기';
    }
    
    // Remove pulse styling from execute button
    document.getElementById('btn-execute-turn').classList.remove('pulse-ready');
    return;
  }
  
  // Regulation limit: no longer blocks the choice, but a warning beep signals
  // this will be fined at turn execution (see the fine calculation below)
  if (isRegulationPhase(state.currentTurn) && value > state.policyParams.regulationMaxBoats) {
    playBeep(400, 0.2);
  }

  // Update choice
  team.currentChoice = value;
  
  // Update UI Radio representation
  const radio = document.getElementById(`choice-${team.id}-${value}`);
  if (radio) radio.checked = true;

  // Update row styles
  const row = document.getElementById(`team-row-${team.id}`);
  if (row) {
    row.classList.add('entered');
    row.classList.remove('temp-reveal'); // Re-hide choice on new entry
    const layer = row.querySelector('.mask-overlay-layer');
    if (layer) layer.textContent = '🔒 입력 완료 (클릭하여 확인)';
  }

  playBeep(900, 0.05);

  // Check if all inputs are entered to highlight execute button
  const allEntered = state.teams.every(t => t.currentChoice !== null);
  if (allEntered) {
    document.getElementById('btn-execute-turn').classList.add('pulse-ready');
    document.getElementById('btn-execute-turn').focus();
  }

  // Auto advance focus to the next empty team
  setTimeout(() => {
    // Check if there are any remaining teams without choice
    let nextIdx = teamIndex + 1;
    if (nextIdx >= state.teamsCount) nextIdx = 0;
    
    // Cycle to find next empty
    let found = false;
    for (let i = 0; i < state.teamsCount; i++) {
      let checkIdx = (nextIdx + i) % state.teamsCount;
      if (state.teams[checkIdx].currentChoice === null) {
        setFocusedTeam(checkIdx);
        found = true;
        break;
      }
    }
    
    // If none empty, keep current focus or move to next sequentially
    if (!found) {
      setFocusedTeam(nextIdx);
    }
  }, 100);
}

// 8. RENDERERS
function renderTeamInputs() {
  const container = document.getElementById('team-inputs-container');
  container.innerHTML = '';

  state.teams.forEach((team, index) => {
    const row = document.createElement('div');
    row.id = `team-row-${team.id}`;
    row.className = `team-input-row ${index === 0 ? 'focused' : ''}`;
    if (team.currentChoice !== null) {
      row.classList.add('entered');
    }
    
    // Clicking anywhere in the row focuses it
    row.addEventListener('click', (e) => {
      // If clicking mask overlay in mask mode and it's entered, toggle temp-reveal inspect view
      if (state.isInputMasked && row.classList.contains('entered') && e.target.classList.contains('mask-overlay-layer')) {
        row.classList.toggle('temp-reveal');
        playBeep(1100, 0.03);
        return;
      }
      setFocusedTeam(index);
    });

    // During the regulation phase, choices above the limit stay selectable
    // but are marked as fine-risk (they get fined at turn execution instead of being blocked)
    const regMax = isRegulationPhase(state.currentTurn) ? state.policyParams.regulationMaxBoats : null;
    const fineClass = (v) => (regMax !== null && v > regMax) ? ' fine-risk' : '';
    const fineTitle = (v) => (regMax !== null && v > regMax) ? ` title="규제 위반: 적발 시 벌금 -${(v - regMax) * REGULATION_FINE_PER_BOAT}점"` : '';

    row.innerHTML = `
      <div class="team-name-badge">
        <span class="team-status-dot"></span>
        <span>${team.name}</span>
        <span class="team-cumulative-score">${isRegulationPhase(state.currentTurn) ? '(누적 점수 비공개)' : `(누적: ${formatValue(team.score)}점)`}</span>
      </div>
      <div class="boat-selectors-wrapper">
        <div class="boat-selectors">
          <input type="radio" name="team-choice-${team.id}" id="choice-${team.id}-1" class="boat-radio-btn" value="1">
          <label for="choice-${team.id}-1" class="boat-label${fineClass(1)}" data-val="1" data-team-index="${index}" data-choice="1"${fineTitle(1)}>1척</label>

          <input type="radio" name="team-choice-${team.id}" id="choice-${team.id}-2" class="boat-radio-btn" value="2">
          <label for="choice-${team.id}-2" class="boat-label${fineClass(2)}" data-val="2" data-team-index="${index}" data-choice="2"${fineTitle(2)}>2척</label>

          <input type="radio" name="team-choice-${team.id}" id="choice-${team.id}-3" class="boat-radio-btn" value="3">
          <label for="choice-${team.id}-3" class="boat-label${fineClass(3)}" data-val="3" data-team-index="${index}" data-choice="3"${fineTitle(3)}>3척</label>
        </div>
        <div class="mask-overlay-layer">🔒 입력 대기</div>
      </div>
    `;
    container.appendChild(row);
    
    // Sync UI checking if choice is pre-existing
    if (team.currentChoice !== null) {
      const rad = row.querySelector(`#choice-${team.id}-${team.currentChoice}`);
      if (rad) rad.checked = true;
      // Change label textual state
      const layer = row.querySelector('.mask-overlay-layer');
      if (layer) layer.textContent = '🔒 입력 완료 (클릭하여 확인)';
    }
  });
  
  state.focusedTeamIndex = 0;
}

// Applies the lake health text/color to a given badge element based on the fish ratio
function applyLakeStatusStyle(badgeEl, ratio) {
  badgeEl.className = 'lake-header-stat-value badge';
  if (ratio > 0.7) {
    badgeEl.textContent = '풍부함 🌿';
    badgeEl.classList.add('text-success');
  } else if (ratio > 0.4) {
    badgeEl.textContent = '감소 중 ⚠️';
    badgeEl.classList.add('text-warning');
  } else if (ratio > 0.15) {
    badgeEl.textContent = '위험 🚨';
    badgeEl.style.color = '#f97316'; // orange
  } else if (ratio > 0.0) {
    badgeEl.textContent = '고갈 직전 💀';
    badgeEl.classList.add('text-danger');
  } else {
    badgeEl.textContent = '고갈 ☠️';
    badgeEl.style.color = '#9ca3af'; // grey
  }
}

const PHASE_LABELS = {
  laissez: '🌿 자유 방임',
  agreement: '🤝 자율 협약',
  regulation: '⚖️🔍 정부 규제·감시'
};

function updateGameHeader() {
  document.getElementById('display-turn').textContent = `${state.currentTurn} / ${state.maxTurns}턴`;

  // Fish count & lake health, shown next to the lake visualization
  document.getElementById('display-fish-count-inline').textContent = formatValue(state.fishCount);
  const ratio = state.fishCount / state.maxFishCount;
  applyLakeStatusStyle(document.getElementById('display-lake-status-inline'), ratio);

  // Lesson progress, shown in the top header
  document.getElementById('display-phase-status').textContent = PHASE_LABELS[getPhase(state.currentTurn)];
  const progressPct = Math.min(100, (state.currentTurn / state.maxTurns) * 100);
  document.getElementById('lesson-progress-fill').style.width = `${progressPct}%`;

  // Update canvas fish render amount
  updateFishPopulation();

  // Sync projector
  updateProjectorView();
}

function renderHistoryTable() {
  const headerRow = document.getElementById('table-header-row');
  const body = document.getElementById('table-history-body');
  
  // Reconstruct headers for team columns
  headerRow.innerHTML = `
    <th>턴</th>
    <th>정책 모드</th>
    <th>총 배 수</th>
    <th>총 포획량</th>
    <th>남은 물고기</th>
    <th>번식량</th>
    <th>다음 턴 물고기</th>
  `;
  
  state.teams.forEach(t => {
    const th = document.createElement('th');
    th.textContent = t.name;
    th.className = 'team-cell';
    headerRow.appendChild(th);
  });

  // Render body rows
  body.innerHTML = '';
  if (state.history.length === 0) {
    body.innerHTML = `
      <tr>
        <td colspan="${7 + state.teamsCount}" class="text-muted text-center" style="padding: 30px;">
          게임 진행 기록이 이곳에 저장됩니다. (수업 후 캡처 또는 인쇄 가능)
        </td>
      </tr>
    `;
    return;
  }

  state.history.forEach(hist => {
    const tr = document.createElement('tr');
    
    // Formatting Phase name
    let polName = '🌿 자유 방임';
    if (hist.phase === 'agreement') polName = '🤝 자율 협약';
    if (hist.phase === 'regulation') polName = `⚖️ 정부 규제(${hist.regulationMaxBoats}척, 적발 시 -${REGULATION_FINE_PER_BOAT}점)·🔍 감시 실패`;

    tr.innerHTML = `
      <td><strong>${hist.turn}</strong></td>
      <td><span class="text-sm">${polName}</span></td>
      <td>${hist.totalBoats}척</td>
      <td class="text-warning">${formatValue(hist.totalCaptured)}마리</td>
      <td>${formatValue(hist.remainBeforeReproduction)}마리</td>
      <td class="text-success">+${formatValue(hist.reproducedCount)}마리</td>
      <td class="text-success" style="background: rgba(255,255,255,0.02)"><strong>${formatValue(hist.nextTurnStartFish)}마리</strong></td>
    `;

    // Individual team columns
    state.teams.forEach(t => {
      const td = document.createElement('td');
      td.className = 'team-cell';
      
      const teamHist = hist.teamDetails.find(td => td.teamId === t.id);
      
      if (teamHist) {
        // Handle monitoring anonymity (turns 7-9)
        if (hist.phase === 'regulation' && !teamHist.revealed) {
          td.innerHTML = `
            <div class="anonymous-box">
              <span class="text-muted">? (비밀)</span>
              <button class="btn-inspect" data-history-turn="${hist.turn}" data-team-id="${t.id}">🔍 조사</button>
            </div>
            <span class="text-sm text-muted">+?</span>
          `;
        } else {
          // Normal display or revealed monitoring
          let badgeHtml = `${teamHist.choice}척`;

          badgeHtml = `⛵ ${teamHist.choice}척`;

          const penaltyText = teamHist.penalty > 0 ? `<br><span class="text-sm text-danger">벌금-${teamHist.penalty}</span>` : '';

          td.innerHTML = `
            ${badgeHtml}<br>
            <span class="text-sm text-success">+${formatValue(teamHist.captured)}</span>${penaltyText}
          `;
        }
      } else {
        td.textContent = '-';
      }

      tr.appendChild(td);
    });

    body.appendChild(tr);
  });
  
  // Sync projector
  updateProjectorView();
}

// 9. TURN CALCULATION LOGIC
function allocateScarceCatch(totalFish, teams, totalBoats) {
  const totalTenths = Math.round(totalFish * 10);
  const allocations = teams.map(team => {
    const exactTenths = totalBoats > 0 ? totalTenths * (team.currentChoice / totalBoats) : 0;
    const baseTenths = Math.floor(exactTenths);
    return { teamId: team.id, tenths: baseTenths, remainder: exactTenths - baseTenths };
  });

  let remainingTenths = totalTenths - allocations.reduce((sum, item) => sum + item.tenths, 0);
  allocations
    .sort((a, b) => b.remainder - a.remainder || a.teamId - b.teamId)
    .forEach(item => {
      if (remainingTenths > 0) {
        item.tenths++;
        remainingTenths--;
      }
    });

  return new Map(allocations.map(item => [item.teamId, item.tenths / 10]));
}

document.getElementById('btn-execute-turn').addEventListener('click', () => {
  const depletionChoiceIsOpen = !document.getElementById('lake-overlay-msg').classList.contains('hidden');
  if (state.isGameOver || isTurnExecuting || document.querySelector('.modal-overlay.active') || depletionChoiceIsOpen) return;

  // 1. Verify inputs
  const unentered = state.teams.filter(t => t.currentChoice === null);
  if (unentered.length > 0) {
    alert(`아직 선택이 입력되지 않은 모둠이 있습니다:\n${unentered.map(t => t.name).join(', ')}`);
    // Focus the first unentered team
    const firstUnenteredIdx = state.teams.findIndex(t => t.currentChoice === null);
    if (firstUnenteredIdx !== -1) setFocusedTeam(firstUnenteredIdx);
    return;
  }

  isTurnExecuting = true;
  document.getElementById('btn-execute-turn').disabled = true;
  storeSnapshot(UNDO_KEY, createGameSnapshot());

  // 2. Main metrics
  const totalBoats = state.teams.reduce((sum, t) => sum + t.currentChoice, 0);
  const rawTargetCapture = totalBoats * 5; // Boat * 5 fish
  const currentFish = state.fishCount;
  
  let actualCaptured = 0;
  let remainBeforeRepro = 0;

  if (currentFish >= rawTargetCapture) {
    actualCaptured = rawTargetCapture;
    remainBeforeRepro = currentFish - rawTargetCapture;
  } else {
    // Depleted or near-depleted: Overfishing situation
    actualCaptured = currentFish;
    remainBeforeRepro = 0;
  }

  // 3. Team allocation logic (always proportional to boats launched)
  const teamDetails = [];
  const regulationPhaseActive = isRegulationPhase(state.currentTurn);

  // Whether the lake had enough fish to satisfy everyone's full desired catch this turn
  const isScarce = currentFish < rawTargetCapture;
  const scarceAllocations = isScarce
    ? allocateScarceCatch(actualCaptured, state.teams, totalBoats)
    : null;

  state.teams.forEach(team => {
    const choice = team.currentChoice;
    // Not scarce: each team gets its full desired catch (boats * 5).
    // Scarce: the remaining fish are rationed proportionally to boats launched.
    let finalCaptured = isScarce
      ? scarceAllocations.get(team.id)
      : choice * 5;

    // Apply decimal formatting logic
    finalCaptured = parseFloat(formatValue(finalCaptured));

    // Revenue calculations (the regulation fine, if any, is only charged once we know
    // whether this team actually got caught - see the reveal pass below)
    team.score += finalCaptured;

    // Regulation fine (turns 7-9): -7 points per boat over the regulated limit, owed if caught
    let finePotential = 0;
    if (regulationPhaseActive && choice > state.policyParams.regulationMaxBoats) {
      finePotential = (choice - state.policyParams.regulationMaxBoats) * REGULATION_FINE_PER_BOAT;
    }

    // Monitoring reveal checks (turns 7-9): reveal ~35% of teams at random
    let revealed = true;
    if (regulationPhaseActive) {
      revealed = Math.random() < 0.35;
    }

    teamDetails.push({
      teamId: team.id,
      teamName: team.name,
      turn: state.currentTurn,
      choice: choice,
      captured: finalCaptured,
      penalty: 0,
      finePotential: finePotential,
      cumulative: team.score,
      revealed: revealed
    });

    // Save team choice history
    team.history.push({
      turn: state.currentTurn,
      choice: choice,
      captured: finalCaptured,
      penalty: 0
    });
  });

  // Ensure at least one team is revealed/hidden during the monitoring phase
  if (regulationPhaseActive) {
    const revealedCount = teamDetails.filter(d => d.revealed).length;
    if (revealedCount === 0) {
      // Force reveal one random
      teamDetails[Math.floor(Math.random() * teamDetails.length)].revealed = true;
    } else if (revealedCount === teamDetails.length) {
      // Force hide one random
      teamDetails[Math.floor(Math.random() * teamDetails.length)].revealed = false;
    }
  }

  // Only teams actually caught (revealed) pay the regulation fine now. A team that stays
  // hidden keeps its finePotential on record and can still be fined later if a teacher
  // manually investigates it (see revealModalSecret / revealHistorySecret).
  teamDetails.forEach(d => {
    if (d.revealed && d.finePotential > 0) {
      d.penalty = d.finePotential;
      const team = state.teams.find(t => t.id === d.teamId);
      if (team) {
        team.score -= d.penalty;
        const teamHistoryEntry = team.history[team.history.length - 1];
        if (teamHistoryEntry && teamHistoryEntry.turn === state.currentTurn) {
          teamHistoryEntry.penalty = d.penalty;
        }
      }
      d.cumulative = team ? team.score : d.cumulative;
    }
  });

  // 4. Fish Reproduction logic
  let reproduced = 0;
  if (remainBeforeRepro > 0) {
    const potentialReproduction = remainBeforeRepro * (state.reproductionRate / 100);
    reproduced = Math.min(potentialReproduction, state.maxFishCount - remainBeforeRepro);
  }
  
  // Format variables
  remainBeforeRepro = parseFloat(formatValue(remainBeforeRepro));
  reproduced = parseFloat(formatValue(reproduced));
  
  let nextTurnStartFish = remainBeforeRepro + reproduced;
  nextTurnStartFish = Math.min(nextTurnStartFish, state.maxFishCount);
  nextTurnStartFish = parseFloat(formatValue(nextTurnStartFish));

  // Update state fishCount
  state.fishCount = nextTurnStartFish;

  // 5. Append History Entry
  const historyEntry = {
    turn: state.currentTurn,
    phase: getPhase(state.currentTurn),
    regulationMaxBoats: state.policyParams.regulationMaxBoats,
    totalBoats: totalBoats,
    totalCaptured: actualCaptured,
    remainBeforeReproduction: remainBeforeRepro,
    reproducedCount: reproduced,
    nextTurnStartFish: nextTurnStartFish,
    teamDetails: teamDetails
  };
  state.history.push(historyEntry);

  // 6. Modal presentation triggers
  showTurnResultModal(historyEntry);

  // 7. Check post-turn game conditions (Game Over or Depletion alert)
  let isDepleted = state.fishCount <= 0;
  
  // Move current turn forward or trigger game over
  if (state.currentTurn >= state.maxTurns) {
    state.isGameOver = true;
  }

  // Progress turn trigger (done on modal close or overlay option)
  renderHistoryTable();
  updateGameHeader();

  // Reset inputs for next turn
  state.teams.forEach(t => t.currentChoice = null);
  saveGameState();
  isTurnExecuting = false;
  
  // Trigger sound effect for turn result
  if (isDepleted) {
    playBeep(200, 0.4, 3); // Low alarm beeps
  } else {
    playBeep(700, 0.1, 1);
  }
});

// 10. MODAL HANDLING
function showTurnResultModal(hist) {
  document.getElementById('modal-turn-num').textContent = hist.turn;
  
  // Calculate lake health gauge parameters
  const ratio = hist.nextTurnStartFish / state.maxFishCount;
  let pct = Math.min(100, Math.max(0, ratio * 100));
  let gaugeClass = 'healthy';
  let gaugeLabel = '안정적 🌿';
  
  if (ratio > 0.7) {
    gaugeClass = 'healthy';
    gaugeLabel = '풍부함 🌿';
  } else if (ratio > 0.4) {
    gaugeClass = 'warning';
    gaugeLabel = '감소 중 ⚠️';
  } else if (ratio > 0.15) {
    gaugeClass = 'danger';
    gaugeLabel = '위험 수준 🚨';
  } else if (ratio > 0.0) {
    gaugeClass = 'danger';
    gaugeLabel = '고갈 임박 💀';
  } else {
    gaugeClass = 'dead';
    gaugeLabel = '고갈됨 ☠️';
    pct = 0;
  }

  document.getElementById('modal-summary-text').innerHTML = `
    🚢 총 <span class="text-warning" style="font-size:2rem">${hist.totalBoats}척</span> 출항! 
    물고기 <span class="text-danger" style="font-size:2rem">${formatValue(hist.totalCaptured)}마리</span> 포획!
    
    <div class="lake-gauge-container">
      <div class="lake-gauge-label">
        <span>호수 생태계 건강도: <strong>${formatValue(pct)}%</strong></span>
        <span>상태: <strong>${gaugeLabel}</strong></span>
      </div>
      <div class="lake-gauge-outer">
        <div class="lake-gauge-inner ${gaugeClass}" style="width: ${pct}%"></div>
      </div>
    </div>
  `;
  
  document.getElementById('modal-detail-remain').textContent = `🐟 포획 후 호수에는 ${formatValue(hist.remainBeforeReproduction)}마리만 남았습니다.`;
  document.getElementById('modal-detail-repro').textContent = `📈 남은 물고기의 ${state.reproductionRate}%인 ${formatValue(hist.reproducedCount)}마리가 번식했습니다.`;
  document.getElementById('modal-detail-next').textContent = `✨ 다음 턴 시작 물고기 수는 ${formatValue(hist.nextTurnStartFish)}마리입니다.`;

  // Render modal table rows
  const tbody = document.getElementById('modal-team-body');
  tbody.innerHTML = '';

  hist.teamDetails.forEach(team => {
    const tr = document.createElement('tr');
    
    let choiceText = '';
    let capturedText = `${formatValue(team.captured)}마리`;
    let penaltyText;

    // Check if monitoring (turns 7-9) and unrevealed
    if (hist.phase === 'regulation' && !team.revealed) {
      choiceText = `
        <div class="anonymous-box">
          <span class="text-muted">? (비밀)</span>
          <button class="btn-inspect" data-modal-team-id="${team.teamId}">🔍 조사하기</button>
        </div>
      `;
      capturedText = `<span class="text-muted">?</span>`;
      penaltyText = `<span class="text-muted">?</span>`;
    } else {
      // Normal badge styling
      choiceText = `⛵ ${team.choice}척`;
      penaltyText = team.penalty > 0 ? `<span class="text-danger">-${team.penalty}점</span>` : `<span class="text-muted">없음</span>`;
    }

    tr.innerHTML = `
      <td><strong>${team.teamName}</strong></td>
      <td>${choiceText}</td>
      <td class="text-success">+${capturedText}</td>
      <td>${penaltyText}</td>
      <td><span class="text-warning">${hist.phase === 'regulation' && !team.revealed ? '?' : `${formatValue(team.cumulative)}점`}</span></td>
    `;
    tbody.appendChild(tr);
  });

  // Display monitoring secret alert banner
  if (hist.phase === 'regulation') {
    showElement('modal-anonymity-msg');
  } else {
    hideElement('modal-anonymity-msg');
  }

  showModal('result-modal');
}

function showModal(modalId) {
  document.getElementById(modalId).classList.add('active');
  updateProjectorView();
}

function closeModal() {
  document.getElementById('result-modal').classList.remove('active');
  document.getElementById('btn-execute-turn').disabled = false;
  
  // Trigger game end checks or depletion warnings
  const isDepleted = state.fishCount <= 0;
  
  if (isDepleted && !state.continueAfterDepletion) {
    // Show overlay choice screen
    showElement('lake-overlay-msg');
  } else if (state.isGameOver) {
    // Trigger final result calculation
    triggerGameOver();
  } else {
    // Transition to next turn (may auto-trigger a phase announcement modal)
    state.currentTurn++;
    applyPhaseForTurn(state.currentTurn);
    updateGameHeader();

    // Flash turn number to alert teacher
    const turnBox = document.getElementById('display-turn');
    turnBox.style.transform = 'scale(1.2)';
    setTimeout(() => turnBox.style.transform = 'none', 300);
  }

  // Sync projector screen
  updateProjectorView();
  saveGameState();
}

function undoLastTurn() {
  const snapshot = readSnapshot(UNDO_KEY);
  if (!snapshot) return;
  if (restoreSnapshot(snapshot)) {
    try { localStorage.removeItem(UNDO_KEY); } catch (error) { console.warn(error); }
    isTurnExecuting = false;
    saveGameState();
    playBeep(520, 0.1, 2);
  }
}

document.getElementById('btn-undo-turn').addEventListener('click', undoLastTurn);

// Agreements overlay modal
function openAgreementModal() {
  showModal('agreement-modal');
}
function closeAgreementModal() {
  document.getElementById('agreement-modal').classList.remove('active');
  updateProjectorView();
}

// Guide Modal Controls
function openGuideModal() {
  showModal('guide-modal');
}
function closeGuideModal() {
  document.getElementById('guide-modal').classList.remove('active');
  updateProjectorView();
}

// Rules Modal Controls
function openRulesModal() {
  showModal('rules-modal');
}
function closeRulesModal() {
  document.getElementById('rules-modal').classList.remove('active');
  updateProjectorView();
}

// 11. POLICY PHASE CONTROLS (auto-driven by turn number; see applyPhaseForTurn)
function renderRegulationConfig() {
  const box = document.getElementById('policy-settings-area');
  box.innerHTML = `
    <label>⚖️ 정부 규제 : 법정 출항 척수 한도 (위반 적발 시 벌금)</label>
    <div class="form-inline">
      <span>각 모둠의 법정 한도는</span>
      <div class="number-stepper" style="height:32px; width:120px;">
        <button type="button" style="width:30px; height:30px; font-size:1rem;" data-regulation-step="-1">-</button>
        <input type="number" id="cfg-reg-max" value="${state.policyParams.regulationMaxBoats}" min="1" max="2" readonly style="font-size:1rem;">
        <button type="button" style="width:30px; height:30px; font-size:1rem;" data-regulation-step="1">+</button>
      </div>
      <span>척이며, 적발된 모둠만 초과 1척당 -${REGULATION_FINE_PER_BOAT}점 벌금을 부과받습니다</span>
    </div>
  `;
}

function adjustRegulationLimit(step) {
  let val = state.policyParams.regulationMaxBoats + step;
  if (val < 1) val = 1;
  if (val > 2) val = 2;
  state.policyParams.regulationMaxBoats = val;
  document.getElementById('cfg-reg-max').value = val;
  renderTeamInputs(); // refresh button disabled states
  saveGameState();
}

// Regulation phase announcement modal (auto-shown once when turn 7 begins)
function openRegulationModal() {
  showModal('regulation-modal');
}
function closeRegulationModal() {
  document.getElementById('regulation-modal').classList.remove('active');
  updateProjectorView();
}

// 12. GAME OVER & RESULT SUMMARY
function triggerGameOver() {
  state.isGameOver = true;
  
  // Metadata mapping
  document.getElementById('result-game-meta').textContent = `총 ${state.maxTurns}턴 진행 완료 / 호수 생태계: ${state.fishCount <= 0 ? '고갈됨' : '보존됨'}`;
  
  // Final fish
  const finalFishDisp = document.getElementById('result-final-fish');
  finalFishDisp.textContent = `${formatValue(state.fishCount)}마리`;
  
  const destinyMsg = document.getElementById('result-lake-destiny');
  if (state.fishCount <= 0) {
    destinyMsg.textContent = '호수가 완전히 메말랐습니다 (공유지의 비극 발생)';
    destinyMsg.className = 'result-stat-sub text-danger';
  } else if (state.fishCount > 60) {
    destinyMsg.textContent = '호수가 풍부하고 안정적으로 보존되었습니다!';
    destinyMsg.className = 'result-stat-sub text-success';
  } else {
    destinyMsg.textContent = '호수가 파괴되진 않았지만, 상당한 훼손이 발생했습니다.';
    destinyMsg.className = 'result-stat-sub text-warning';
  }

  // Total social profit
  const totalProfit = state.teams.reduce((sum, t) => sum + t.score, 0);
  document.getElementById('result-total-profit').textContent = `${formatValue(totalProfit)}점`;
  document.getElementById('result-avg-profit').textContent = `모둠 평균: ${formatValue(totalProfit / state.teamsCount)}점`;

  // Compute extremes
  const totalDeparturesByTeam = state.teams.map(t => {
    const total = t.history.reduce((sum, h) => sum + h.choice, 0);
    return { name: t.name, total: total };
  });

  totalDeparturesByTeam.sort((a,b) => b.total - a.total);
  const maxTeam = totalDeparturesByTeam[0];
  const minTeam = totalDeparturesByTeam[totalDeparturesByTeam.length - 1];

  document.getElementById('result-most-departed').textContent = `${maxTeam.name} (${maxTeam.total}척 출항)`;
  document.getElementById('result-least-departed').textContent = `${minTeam.name} (${minTeam.total}척 출항)`;

  // Turn statistics
  let bestTurn = 1, worstTurn = 1;
  let minBoats = 999, maxBoats = -1;

  state.history.forEach(h => {
    if (h.totalBoats < minBoats) {
      minBoats = h.totalBoats;
      bestTurn = h.turn;
    }
    if (h.totalBoats > maxBoats) {
      maxBoats = h.totalBoats;
      worstTurn = h.turn;
    }
  });

  document.getElementById('result-most-cooperative-turn').textContent = `${bestTurn}턴 (총 ${minBoats}척 출항)`;
  document.getElementById('result-most-greedy-turn').textContent = `${worstTurn}턴 (총 ${maxBoats}척 출항)`;

  // Leaderboard rendering
  const leaderboardContainer = document.getElementById('leaderboard-container');
  leaderboardContainer.innerHTML = '';
  
  // Sort teams copy
  const sortedTeams = [...state.teams].sort((a,b) => b.score - a.score);
  const maxScore = sortedTeams[0].score > 0 ? sortedTeams[0].score : 1;

  sortedTeams.forEach((t, i) => {
    const rank = i + 1;
    let medal = `${rank}위`;
    let medalClass = `rank-${rank}`;
    
    if (rank === 1) medal = '🥇 1위';
    if (rank === 2) medal = '🥈 2위';
    if (rank === 3) medal = '🥉 3위';

    const item = document.createElement('div');
    item.className = 'leaderboard-item';
    
    const pct = Math.max(0, (t.score / maxScore) * 100);

    item.innerHTML = `
      <div class="leaderboard-rank ${medalClass}">${medal}</div>
      <div class="leaderboard-team-name">${t.name}</div>
      <div class="leaderboard-bar-wrapper">
        <div class="leaderboard-bar-outer">
          <div class="leaderboard-bar-inner" style="width: ${pct}%"></div>
        </div>
      </div>
      <div class="leaderboard-score">${formatValue(t.score)} 점</div>
    `;
    leaderboardContainer.appendChild(item);
  });

  showScreen('result-screen');
  saveGameState();
  playBeep(880, 0.2, 3);
}

// Depletion Overlays
document.getElementById('btn-continue-depleted').addEventListener('click', () => {
  state.continueAfterDepletion = true;
  hideElement('lake-overlay-msg');
  
  if (state.currentTurn >= state.maxTurns) {
    triggerGameOver();
  } else {
    state.currentTurn++;
    applyPhaseForTurn(state.currentTurn);
    updateGameHeader();
  }
  saveGameState();
});

document.getElementById('btn-end-depleted').addEventListener('click', () => {
  hideElement('lake-overlay-msg');
  triggerGameOver();
});

// Restart Buttons
document.getElementById('btn-restart-keep-settings').addEventListener('click', () => {
  // Restart game using exactly same configuration
  state.fishCount = state.initialFish;
  state.currentTurn = 1;
  state.isGameOver = false;
  state.continueAfterDepletion = false;
  state.history = [];
  state.phaseAnnounced = { agreement: false, regulation: false };
  state.policyParams.regulationMaxBoats = 1;

  state.teams.forEach(t => {
    t.score = 0;
    t.currentChoice = null;
    t.history = [];
  });

  resetTimer(180);
  applyPhaseForTurn(1);
  updateGameHeader();
  renderHistoryTable();
  hideElement('lake-overlay-msg');

  showScreen('game-screen');
  try { localStorage.removeItem(UNDO_KEY); } catch (error) { console.warn(error); }
  saveGameState();
  playBeep(600, 0.15, 2);
});

document.getElementById('btn-restart-fresh').addEventListener('click', () => {
  // Go back to setup screen
  showScreen('setup-screen');
  updateResumeButton();
});

document.getElementById('btn-home-icon').addEventListener('click', () => {
  if (confirm("모둠 설정 화면으로 돌아갈까요? 현재 진행 기록은 자동 저장되며, 필요하면 '이전 수업 이어하기'로 다시 열 수 있습니다.")) {
    saveGameState();
    showScreen('setup-screen');
    updateResumeButton();
  }
});

// 13. NEGOTIATION TIMER CONTROLS
document.getElementById('btn-timer-start').addEventListener('click', () => {
  if (timerInterval) return;
  
  timerInterval = setInterval(() => {
    timeLeft--;
    updateTimerDisplay();
    
    if (timeLeft <= 0) {
      clearInterval(timerInterval);
      timerInterval = null;
      
      // Timer finished - Sound alerts and blink
      playBeep(600, 0.3, 3);
      triggerTimerAlert();
    }
  }, 1000);
  playBeep(1200, 0.05);
});

document.getElementById('btn-timer-pause').addEventListener('click', () => {
  if (timerInterval) {
    clearInterval(timerInterval);
    timerInterval = null;
    playBeep(700, 0.08);
  }
});

document.getElementById('btn-timer-reset').addEventListener('click', () => {
  resetTimer(180);
  playBeep(600, 0.1);
});

document.getElementById('btn-timer-quick-set').addEventListener('click', () => {
  resetTimer(60);
  playBeep(1000, 0.05);
});

document.getElementById('btn-timer-quick-set-3').addEventListener('click', () => {
  resetTimer(180);
  playBeep(1000, 0.05);
});

function resetTimer(seconds) {
  if (timerInterval) {
    clearInterval(timerInterval);
    timerInterval = null;
  }
  timeLeft = seconds;
  updateTimerDisplay();
  
  // Clear any flash classes
  const clock = document.getElementById('timer-clock');
  clock.classList.remove('timer-alert');
  
  if (state.projectorWindow && !state.projectorWindow.closed) {
    const pClock = state.projectorWindow.document.getElementById('timer-clock');
    if (pClock) pClock.classList.remove('timer-alert');
  }
}

function updateTimerDisplay() {
  const m = Math.floor(timeLeft / 60);
  const s = timeLeft % 60;
  
  const mStr = String(m).padStart(2, '0');
  const sStr = String(s).padStart(2, '0');
  
  document.getElementById('timer-clock').textContent = `${mStr}:${sStr}`;
  
  if (state.projectorWindow && !state.projectorWindow.closed) {
    const pClock = state.projectorWindow.document.getElementById('timer-clock');
    if (pClock) pClock.textContent = `${mStr}:${sStr}`;
  }
}

function triggerTimerAlert() {
  const clock = document.getElementById('timer-clock');
  clock.classList.add('timer-alert');
  
  // Flash 5 times
  let flashes = 0;
  const interval = setInterval(() => {
    clock.style.visibility = clock.style.visibility === 'hidden' ? 'visible' : 'hidden';
    flashes++;
    if (flashes >= 10) {
      clearInterval(interval);
      clock.style.visibility = 'visible';
    }
  }, 300);

  if (state.projectorWindow && !state.projectorWindow.closed) {
    const pClock = state.projectorWindow.document.getElementById('timer-clock');
    if (pClock) {
      pClock.classList.add('timer-alert');
      let pFlashes = 0;
      const pInterval = setInterval(() => {
        pClock.style.visibility = pClock.style.visibility === 'hidden' ? 'visible' : 'hidden';
        pFlashes++;
        if (pFlashes >= 10) {
          clearInterval(pInterval);
          pClock.style.visibility = 'visible';
        }
      }, 300);
    }
  }
}

// 14. MISCELLANEOUS UTILITIES
function formatValue(val) {
  if (state.decimalRule === 'round') {
    return Math.round(val).toFixed(0);
  } else if (state.decimalRule === 'floor') {
    return Math.floor(val).toFixed(0);
  } else {
    // default소수점 1자리 표시
    return val.toFixed(1);
  }
}

function csvCell(value) {
  const text = String(value ?? '');
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function exportHistoryCsv() {
  if (!state.history.length) {
    alert('저장할 턴 기록이 없습니다.');
    return;
  }

  const headers = ['턴', '정책', '총 배 수', '총 포획량', '남은 물고기', '번식량', '다음 턴 물고기'];
  state.teams.forEach(team => {
    headers.push(`${team.name} 선택`, `${team.name} 포획`, `${team.name} 벌금`, `${team.name} 누적`);
  });

  const rows = state.history.map(historyEntry => {
    const row = [
      historyEntry.turn,
      PHASE_LABELS[historyEntry.phase],
      historyEntry.totalBoats,
      historyEntry.totalCaptured,
      historyEntry.remainBeforeReproduction,
      historyEntry.reproducedCount,
      historyEntry.nextTurnStartFish
    ];
    state.teams.forEach(team => {
      const detail = historyEntry.teamDetails.find(item => item.teamId === team.id);
      row.push(detail?.choice, detail?.captured, detail?.penalty, detail?.cumulative);
    });
    return row;
  });

  const csv = '\uFEFF' + [headers, ...rows].map(row => row.map(csvCell).join(',')).join('\r\n');
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = `호수의-어부들-${new Date().toISOString().slice(0, 10)}.csv`;
  link.click();
  URL.revokeObjectURL(url);
}

function showElement(id) {
  document.getElementById(id).classList.remove('hidden');
}

function hideElement(id) {
  document.getElementById(id).classList.add('hidden');
}

// Handle browser resize
window.addEventListener('resize', () => {
  if (document.getElementById('game-screen').classList.contains('active')) {
    initCanvas();
  }
});

// 15. CLASSROOM INVESTIGATION ACTION FOR ANONYMITY (MONITORING POLICY)

// A team that was hidden and violated the regulation limit owed a fine (finePotential)
// but wasn't charged yet. Once a teacher catches them (manual investigation), charge it now.
function applyFineIfCaught(team, teamHist) {
  if (teamHist.penalty > 0 || !teamHist.finePotential) return; // already fined, or nothing owed
  teamHist.penalty = teamHist.finePotential;
  if (team) {
    team.score -= teamHist.penalty;
    const teamHistoryEntry = team.history.find(h => h.turn === teamHist.turn);
    if (teamHistoryEntry) teamHistoryEntry.penalty = teamHist.penalty;

    // A late investigation changes every cumulative total from that turn onward.
    state.history.forEach(historyEntry => {
      if (historyEntry.turn < teamHist.turn) return;
      const detail = historyEntry.teamDetails.find(item => item.teamId === teamHist.teamId);
      if (detail) detail.cumulative -= teamHist.penalty;
    });
  }
  saveGameState();
}

window.revealModalSecret = function(teamId) {
  // Get current active history entry
  const hist = state.history[state.history.length - 1];
  if (!hist) return;

  const teamHist = hist.teamDetails.find(td => td.teamId === teamId);
  if (teamHist && !teamHist.revealed) {
    teamHist.revealed = true;
    const team = state.teams.find(t => t.id === teamId);
    applyFineIfCaught(team, teamHist);

    // Play double warning beeps
    playBeep(1100, 0.08, 2);

    // Find the cell in the modal table row
    const tbody = document.getElementById('modal-team-body');
    const rows = tbody.querySelectorAll('tr');

    rows.forEach(tr => {
      const nameCol = tr.querySelector('td:nth-child(1)');
      if (nameCol && nameCol.textContent.includes(`${teamId}모둠`)) {
        const choiceCol = tr.querySelector('td:nth-child(2)');
        const captureCol = tr.querySelector('td:nth-child(3)');
        const penaltyCol = tr.querySelector('td:nth-child(4)');
        const cumulativeCol = tr.querySelector('td:nth-child(5)');

        const badgeHtml = `⛵ ${teamHist.choice}척`;

        // Reveal with pulse animation wrapper
        choiceCol.innerHTML = `<div class="anonymous-box revealed-pulse">${badgeHtml}</div>`;
        captureCol.innerHTML = `<span class="text-success">+${formatValue(teamHist.captured)}마리</span>`;
        if (penaltyCol) {
          penaltyCol.innerHTML = teamHist.penalty > 0
            ? `<span class="text-danger">-${teamHist.penalty}점</span>`
            : `<span class="text-muted">없음</span>`;
        }
        if (cumulativeCol) {
          cumulativeCol.innerHTML = `<span class="text-warning">${formatValue(teamHist.cumulative)}점</span>`;
        }
      }
    });

    // Refresh the live "누적" badge in the input panel and the persistent history table
    renderTeamInputs();
    renderHistoryTable();
    updateProjectorView();
  }
};

window.revealHistorySecret = function(turnNum, teamId) {
  const hist = state.history.find(h => h.turn === turnNum);
  if (!hist) return;
  
  const teamHist = hist.teamDetails.find(td => td.teamId === teamId);
  if (teamHist && !teamHist.revealed) {
    teamHist.revealed = true;
    const team = state.teams.find(t => t.id === teamId);
    applyFineIfCaught(team, teamHist);

    // Sound effect
    playBeep(1100, 0.08, 2);

    // Re-render the table and the live "누적" badge in the input panel
    renderHistoryTable();
    renderTeamInputs();
  }
};

document.getElementById('btn-export-csv').addEventListener('click', exportHistoryCsv);
document.getElementById('table-history-body').addEventListener('click', event => {
  const button = event.target.closest('button[data-history-turn][data-team-id]');
  if (!button) return;
  window.revealHistorySecret(Number(button.dataset.historyTurn), Number(button.dataset.teamId));
});
document.getElementById('modal-team-body').addEventListener('click', event => {
  const button = event.target.closest('button[data-modal-team-id]');
  if (!button) return;
  window.revealModalSecret(Number(button.dataset.modalTeamId));
});
document.getElementById('policy-settings-area').addEventListener('click', event => {
  const button = event.target.closest('button[data-regulation-step]');
  if (!button) return;
  adjustRegulationLimit(Number(button.dataset.regulationStep));
});

// 16. DUAL MONITOR / PRESENTER SCREEN (빔프로젝터 팝업창)
function openProjectorWindow() {
  if (state.projectorWindow && !state.projectorWindow.closed) {
    state.projectorWindow.focus();
    return;
  }
  
  // Open blank popup window
  state.projectorWindow = window.open('', 'TragedyProjector', 'width=1200,height=800,menubar=no,toolbar=no,location=no,status=no');
  if (!state.projectorWindow) {
    alert('팝업 차단이 활성화되어 있을 수 있습니다. 브라우저 설정에서 이 사이트의 팝업 허용을 활성화해 주세요!');
    return;
  }
  
  const doc = state.projectorWindow.document;
  doc.open();
  doc.write(`
    <!DOCTYPE html>
    <html lang="ko">
    <head>
      <meta charset="UTF-8">
      <title>호수의 어부들 (빔프로젝터/학생용 화면)</title>
      <style>
        body {
          margin: 0;
          padding: 0;
          background: #090d16;
          color: #f8fafc;
          font-family: 'Noto Sans KR', sans-serif;
          overflow-y: auto;
          box-sizing: border-box;
        }
        .projector-body-container {
          padding: 30px;
          display: flex;
          flex-direction: column;
          gap: 30px;
          max-width: 1400px;
          margin: 0 auto;
        }
        /* Hide controller panel strictly in projector window */
        .control-panel {
          display: none !important;
        }
        /* Make lake visualization area full width */
        .game-main-layout {
          display: grid;
          grid-template-columns: 1fr !important;
          gap: 0 !important;
        }
        .lake-card {
          width: 100% !important;
        }
        .canvas-container {
          height: 480px !important;
        }
        canvas {
          height: 100% !important;
        }
        /* Projector specific large font style overrides */
        .stat-value {
          font-size: 2.2rem !important;
        }
        .timer-clock {
          font-size: 2.8rem !important;
        }
        .history-table th, .history-table td {
          padding: 18px 12px !important;
          font-size: 1.1rem !important;
        }
        /* Modal tweaks for projector view */
        .modal-overlay {
          z-index: 10000 !important;
        }
        .modal-content {
          max-width: 900px !important;
          width: 90% !important;
        }
        /* Discussion card layout overrides */
        .discussion-grid {
          grid-template-columns: 1fr 1fr !important;
        }
      </style>
    </head>
    <body>
      <div class="projector-body-container">
        <!-- Will be filled by synchronization -->
      </div>
    </body>
    </html>
  `);
  doc.close();
  
  // Clone CSS stylesheets to the projector window
  const fonts = document.querySelectorAll('link[href*="fonts.googleapis.com"], link[href*="fonts.gstatic.com"]');
  fonts.forEach(f => doc.head.appendChild(f.cloneNode(true)));
  
  const stylesheets = document.querySelectorAll('link[rel="stylesheet"], style');
  stylesheets.forEach(sheet => {
    doc.head.appendChild(sheet.cloneNode(true));
  });
  
  // Sync projector DOM elements when ready
  setTimeout(() => {
    syncProjectorDOM();
    initProjectorCanvas();
  }, 150);

  // Bind close event to reset state
  state.projectorWindow.addEventListener('beforeunload', () => {
    state.projectorWindow = null;
    projectorCanvas = null;
    projectorCtx = null;
  });
}

function syncProjectorDOM() {
  if (!state.projectorWindow || state.projectorWindow.closed) return;
  const pDoc = state.projectorWindow.document;
  const pContainer = pDoc.querySelector('.projector-body-container');
  if (!pContainer) return;
  
  // Clear container
  pContainer.innerHTML = '';
  
  // Check which screen is active in main document
  const setupScreen = document.getElementById('setup-screen');
  const gameScreen = document.getElementById('game-screen');
  const resultScreen = document.getElementById('result-screen');
  
  if (setupScreen.classList.contains('active')) {
    pContainer.innerHTML = `
      <div class="setup-card glass text-center" style="padding: 100px 50px; margin-top: 50px;">
        <div class="logo-icon" style="font-size: 5rem; margin-bottom: 20px;">🚢</div>
        <h1 style="font-size: 3rem;">호수의 어부들 : 공유지의 비극</h1>
        <h2 style="color: var(--accent-blue); margin-top: 10px;">시뮬레이션 대기 중</h2>
        <p class="text-muted" style="font-size: 1.3rem; margin-top: 30px;">교사가 게임을 시작하면 화면이 활성화됩니다.</p>
      </div>
    `;
  } else if (gameScreen.classList.contains('active')) {
    // Clone layout structure
    const mainCloned = gameScreen.cloneNode(true);
    
    // Strip elements not needed for projector
    const controlPanel = mainCloned.querySelector('.control-panel');
    if (controlPanel) controlPanel.remove();
    
    const homeBtn = mainCloned.querySelector('#btn-home-icon');
    if (homeBtn) homeBtn.remove();
    
    const projBtn = mainCloned.querySelector('#btn-open-projector');
    if (projBtn) projBtn.remove();

    const exportCsvBtn = mainCloned.querySelector('#btn-export-csv');
    if (exportCsvBtn) exportCsvBtn.remove();
    const exportPrintBtn = mainCloned.querySelector('#btn-export-capture');
    if (exportPrintBtn) exportPrintBtn.remove();

    const timerControls = mainCloned.querySelector('.timer-controls');
    if (timerControls) timerControls.remove();
    
    pContainer.appendChild(mainCloned);
    
    // Synchronize modal state if active
    const mainModal = document.getElementById('result-modal');
    if (mainModal && mainModal.classList.contains('active')) {
      const clonedModal = mainModal.cloneNode(true);
      clonedModal.id = 'projector-result-modal';
      clonedModal.classList.add('active');
      
      // Remove close buttons / next buttons for students
      const closeBtn = clonedModal.querySelector('.close-btn');
      if (closeBtn) closeBtn.remove();
      const nextBtn = clonedModal.querySelector('.modal-footer');
      if (nextBtn) nextBtn.remove();
      
      pContainer.appendChild(clonedModal);
    }
    
    // Synchronize agreement modal state if active
    const mainAgreModal = document.getElementById('agreement-modal');
    if (mainAgreModal && mainAgreModal.classList.contains('active')) {
      const clonedAgreModal = mainAgreModal.cloneNode(true);
      clonedAgreModal.id = 'projector-agreement-modal';
      clonedAgreModal.classList.add('active');
      
      // Remove actions
      const footer = clonedAgreModal.querySelector('.modal-footer');
      if (footer) footer.remove();
      
      pContainer.appendChild(clonedAgreModal);
    }
  } else if (resultScreen.classList.contains('active')) {
    const resultCloned = resultScreen.cloneNode(true);
    const actions = resultCloned.querySelector('.result-actions');
    if (actions) actions.remove();
    pContainer.appendChild(resultCloned);
  }

  // Synchronize Rules modal if active on any screen
  const mainRulesModal = document.getElementById('rules-modal');
  if (mainRulesModal && mainRulesModal.classList.contains('active')) {
    const clonedRules = mainRulesModal.cloneNode(true);
    clonedRules.id = 'projector-rules-modal';
    clonedRules.classList.add('active');
    const closeBtn = clonedRules.querySelector('.close-btn');
    if (closeBtn) closeBtn.remove();
    const footer = clonedRules.querySelector('.modal-footer');
    if (footer) footer.remove();
    pContainer.appendChild(clonedRules);
  }

  // Synchronize Regulation phase announcement modal if active on any screen
  const mainRegulationModal = document.getElementById('regulation-modal');
  if (mainRegulationModal && mainRegulationModal.classList.contains('active')) {
    const clonedRegulation = mainRegulationModal.cloneNode(true);
    clonedRegulation.id = 'projector-regulation-modal';
    clonedRegulation.classList.add('active');
    const footer = clonedRegulation.querySelector('.modal-footer');
    if (footer) footer.remove();
    pContainer.appendChild(clonedRegulation);
  }
}

// Global hook to trigger DOM synchronization when state changes
function updateProjectorView() {
  if (!state.projectorWindow || state.projectorWindow.closed) return;
  syncProjectorDOM();
  
  // Re-hook canvas on DOM replacement
  initProjectorCanvas();
}

// Specialized Canvas Initialization inside the projector window
let projectorCanvas = null;
let projectorCtx = null;

function initProjectorCanvas() {
  if (!state.projectorWindow || state.projectorWindow.closed) return;
  const pDoc = state.projectorWindow.document;
  projectorCanvas = pDoc.getElementById('lake-canvas');
  if (!projectorCanvas) return;
  
  projectorCtx = projectorCanvas.getContext('2d');
  
  // Set dimensions
  projectorCanvas.width = projectorCanvas.parentElement.clientWidth || 800;
  projectorCanvas.height = projectorCanvas.parentElement.clientHeight || 450;
}

// Bind open projector action
document.getElementById('btn-open-projector').addEventListener('click', openProjectorWindow);

// Bind rules action in header
document.getElementById('btn-header-rules').addEventListener('click', openRulesModal);

// Auto close popup on parent page unload
window.addEventListener('beforeunload', () => {
  saveGameState();
  if (state.projectorWindow && !state.projectorWindow.closed) {
    state.projectorWindow.close();
  }
});

updateResumeButton();
