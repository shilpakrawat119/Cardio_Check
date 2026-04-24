// ── state ──────────────────────────────────────────────
let currentStep = 0;
const toggleVals = { smoke: 0, alco: 0, active: 1 };
const socialState = JSON.parse(localStorage.getItem('cardio-social') || '{}');
const inviteMessage = 'I just checked my heart risk with CardioCheck. Take the 60-second survey too:';

// ── navigation ─────────────────────────────────────────
function showPage(name) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.getElementById('page-' + name).classList.add('active');
  document.querySelectorAll('.nav-links a').forEach(a => a.classList.remove('active'));
  const navEl = document.getElementById('nav-' + name);
  if (navEl) navEl.classList.add('active');
  window.scrollTo(0,0);
  if (name === 'checker') resetChecker();
  if (name === 'community') initCommunity();
}

// ── toggle buttons ─────────────────────────────────────
function setToggle(key, val) {
  toggleVals[key] = val;
  const noBtn  = document.getElementById(key + '-no');
  const yesBtn = document.getElementById(key + '-yes');
  noBtn.className  = 'toggle-btn' + (val === 0 ? ' selected-no' : '');
  yesBtn.className = 'toggle-btn' + (val === 1 ? ' selected-yes' : '');
}

// ── step navigation ────────────────────────────────────
function goStep(n) {
  if (n > 0 && !validateStep(currentStep)) return;
  document.getElementById('step-' + currentStep).classList.remove('active');
  document.getElementById('seg-' + currentStep).classList.remove('active');
  document.getElementById('seg-' + currentStep).classList.add('done');
  currentStep = n;
  document.getElementById('step-' + n).classList.add('active');
  document.getElementById('seg-' + n)?.classList.add('active');
  window.scrollTo({top: 120, behavior: 'smooth'});
}

function validateStep(step) {
  if (step === 0) {
    const age = document.getElementById('f-age').value;
    const gen = document.getElementById('f-gender').value;
    const ht  = document.getElementById('f-height').value;
    const wt  = document.getElementById('f-weight').value;
    if (!age || !gen || !ht || !wt) {
      showToast('Please fill in all fields in this step ✋'); return false;
    }
    if (age < 10 || age > 100) { showToast('Age should be between 10 and 100'); return false; }
    if (ht < 100 || ht > 250)  { showToast('Height seems off — check the value'); return false; }
    if (wt < 30  || wt > 300)  { showToast('Weight seems off — check the value'); return false; }
  }
  return true;
}

// ── reset ──────────────────────────────────────────────
function resetChecker() {
  currentStep = 0;
  document.querySelectorAll('.form-step').forEach((s,i) => {
    s.classList.toggle('active', i === 0);
  });
  document.querySelectorAll('.prog-seg').forEach((s,i) => {
    s.classList.remove('done','active');
    if (i===0) s.classList.add('active');
  });
  document.getElementById('form-steps').style.display = 'block';
  document.getElementById('loading').classList.remove('show');
  document.getElementById('result-panel').style.display = 'none';
  document.getElementById('result-panel').innerHTML = '';
  document.getElementById('prog-bar').style.display = 'flex';
  // reset toggles
  setToggle('smoke',0); setToggle('alco',0); setToggle('active',1);
  // clear inputs
  ['f-age','f-height','f-weight','f-aphi','f-aplo'].forEach(id => {
    document.getElementById(id).value = '';
  });
  document.getElementById('f-gender').value = '';
  document.getElementById('f-chol').value = '1';
  document.getElementById('f-gluc').value = '1';
}

// ── submit ─────────────────────────────────────────────
async function submitForm() {
  if (!validateStep(2)) return;

  const payload = {
    age_years:         parseFloat(document.getElementById('f-age').value),
    gender:      parseInt(document.getElementById('f-gender').value),
    height:      parseFloat(document.getElementById('f-height').value),
    weight:      parseFloat(document.getElementById('f-weight').value),
    ap_hi:       parseFloat(document.getElementById('f-aphi').value) || 120,
    ap_lo:       parseFloat(document.getElementById('f-aplo').value) || 80,
    cholesterol: parseInt(document.getElementById('f-chol').value),
    gluc:        parseInt(document.getElementById('f-gluc').value),
    smoke:       toggleVals.smoke,
    alco:        toggleVals.alco,
    active:      toggleVals.active,
  };

  // hide form, show loader
  document.getElementById('form-steps').style.display = 'none';
  document.getElementById('prog-bar').style.display = 'none';
  const loader = document.getElementById('loading');
  loader.classList.add('show');

  try {
    const res  = await fetch('/predict', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify(payload)
    });
    const data = await res.json();
    loader.classList.remove('show');
    if (data.error) { showToast('Error: ' + data.error); resetChecker(); return; }
    showResult(data, payload);
  } catch(e) {
    loader.classList.remove('show');
    showToast('Could not reach the server. Is Flask running? (' + e.message + ')');
    resetChecker();
  }
}

// ── render result ──────────────────────────────────────
function showResult(data, inputs) {
  const isHigh = data.prediction === 1;
  const prob   = data.probability;
  const bmi    = data.bmi;

  const bmiLabel = bmi < 18.5 ? 'Underweight' : bmi < 25 ? 'Normal ✓' : bmi < 30 ? 'Overweight' : 'Obese';
  const bmiColor = bmi < 25 ? 'var(--green)' : bmi < 30 ? 'var(--amber)' : 'var(--red)';

  const apHi = inputs.ap_hi, apLo = inputs.ap_lo;
  const bpLabel = apHi < 120 ? 'Normal ✓' : apHi < 130 ? 'Elevated' : apHi < 140 ? 'Stage 1 HBP' : 'Stage 2 HBP';

  const eatList   = isHigh ? highRiskEat()   : lowRiskEat();
  const avoidList = isHigh ? highRiskAvoid() : lowRiskAvoid();
  const doList    = isHigh ? highRiskDo()    : lowRiskDo();

  const html = `
  <div class="result-hero ${isHigh ? 'high-risk' : 'low-risk'}">
    <span class="result-emoji">${isHigh ? '⚠️' : '✅'}</span>
    <div class="result-verdict">${isHigh ? 'HIGH RISK' : 'LOW RISK'}</div>
    <div class="result-prob">
      Cardiovascular risk probability: <strong>${prob}%</strong>
    </div>
    <div class="prob-track"><div class="prob-fill" id="prob-fill"></div></div>
    <div class="bmi-chip">
      BMI ${bmi} — ${bmiLabel} &nbsp;·&nbsp; BP ${apHi}/${apLo} — ${bpLabel}
    </div>
  </div>

  <div class="vitals-strip">
    <div class="vital-item">
      <div class="vital-val" style="color:${bmiColor}">${bmi}</div>
      <div class="vital-lbl">BMI</div>
    </div>
    <div class="vital-item">
      <div class="vital-val">${apHi}/${apLo}</div>
      <div class="vital-lbl">Blood Pressure</div>
    </div>
    <div class="vital-item">
      <div class="vital-val">${prob}%</div>
      <div class="vital-lbl">Risk Prob.</div>
    </div>
    <div class="vital-item">
      <div class="vital-val" style="color:${isHigh?'var(--red)':'var(--green)'}">${isHigh?'HIGH':'LOW'}</div>
      <div class="vital-lbl">Verdict</div>
    </div>
  </div>

  <div class="advice-grid">
    <div class="advice-card">
      <div class="advice-card-head">
        <div class="advice-icon green">✅</div>
        <div>
          <div class="advice-card-title">Eat More Of</div>
          <div class="advice-card-sub">Nutrients & foods to prioritise</div>
        </div>
      </div>
      <ul class="advice-list">${eatList}</ul>
    </div>
    <div class="advice-card">
      <div class="advice-card-head">
        <div class="advice-icon red">🚫</div>
        <div>
          <div class="advice-card-title">Cut Back On</div>
          <div class="advice-card-sub">Foods & habits to reduce</div>
        </div>
      </div>
      <ul class="advice-list">${avoidList}</ul>
    </div>
    <div class="advice-card">
      <div class="advice-card-head">
        <div class="advice-icon amber">⚡</div>
        <div>
          <div class="advice-card-title">Action Plan</div>
          <div class="advice-card-sub">${isHigh ? 'Steps to take now' : 'Keep it up'}</div>
        </div>
      </div>
      <ul class="advice-list">${doList}</ul>
    </div>
    <div class="advice-card">
      <div class="advice-card-head">
        <div class="advice-icon blue">💊</div>
        <div>
          <div class="advice-card-title">Key Nutrients</div>
          <div class="advice-card-sub">Vitamins & minerals for heart health</div>
        </div>
      </div>
      <ul class="advice-list">${nutrientList(isHigh)}</ul>
    </div>
  </div>

  <p style="font-size:.78rem;color:var(--muted);text-align:center;margin-bottom:2rem;line-height:1.6">
    ⚕️ <strong style="color:var(--muted2)">Disclaimer:</strong> This tool errs on the side of caution — a risk flag means 'talk to a doctor', not 'you have heart disease'. Always consult a healthcare professional.
  </p>

  <div class="result-actions">
    <button class="btn-retake" onclick="resetChecker()">← Retake the Test</button>
    <button class="btn-ghost" onclick="showPage('community')">Invite Friends + Earn Points</button>
    <button class="btn-primary" onclick="showPage('about')">Learn About the Model →</button>
  </div>`;

  const panel = document.getElementById('result-panel');
  panel.innerHTML = html;
  panel.style.display = 'block';

  setTimeout(() => {
    const fill = document.getElementById('prob-fill');
    if (fill) fill.style.width = prob + '%';
  }, 100);

  window.scrollTo({ top: 120, behavior: 'smooth' });
}

// ── advice content ─────────────────────────────────────
function li(dot, txt) { return `<li data-dot="${dot}">${txt}</li>`; }

function highRiskEat() { return [
  li('🐟', '<strong>Omega-3 fatty acids</strong> — salmon, mackerel, sardines, walnuts'),
  li('🥦', '<strong>Dark leafy greens</strong> — spinach, kale, broccoli (Vit K, folate)'),
  li('🫐', '<strong>Berries & antioxidants</strong> — blueberries, strawberries, pomegranate'),
  li('🌾', '<strong>Oat beta-glucan</strong> — oatmeal, barley (lowers LDL cholesterol)'),
  li('🥑', '<strong>Monounsaturated fats</strong> — avocado, olive oil (MUFA for BP)'),
  li('🧄', '<strong>Garlic & allicin</strong> — reduces blood pressure naturally'),
].join(''); }

function lowRiskEat() { return [
  li('🥗', '<strong>Mediterranean diet staples</strong> — olive oil, legumes, whole grains'),
  li('🐟', '<strong>Fatty fish 2×/week</strong> — salmon or tuna for Omega-3s'),
  li('🍅', '<strong>Lycopene-rich foods</strong> — tomatoes, watermelon (antioxidant)'),
  li('🌰', '<strong>Nuts & seeds</strong> — almonds, flaxseed for healthy fats & fibre'),
  li('🫘', '<strong>Legumes & fibre</strong> — lentils, chickpeas (30g fibre/day)'),
  li('🍊', '<strong>Vitamin C sources</strong> — citrus fruits, bell peppers (Vit C)'),
].join(''); }

function highRiskAvoid() { return [
  li('🧂', '<strong>Excess sodium</strong> — stay under 1,500 mg/day; avoid processed food'),
  li('🥩', '<strong>Red & processed meats</strong> — sausages, bacon, deli meats'),
  li('🍩', '<strong>Trans fats & refined carbs</strong> — pastries, white bread, fast food'),
  li('🥤', '<strong>Sugary drinks</strong> — sodas, energy drinks, juice with added sugar'),
  li('🍺', '<strong>Alcohol</strong> — raises BP and triglycerides; max 1 drink/day'),
  li('☕', '<strong>Excess caffeine</strong> — limit to 1–2 cups/day if BP is high'),
].join(''); }

function lowRiskAvoid() { return [
  li('🍟', '<strong>Fried & ultra-processed food</strong> — high in trans fats & sodium'),
  li('🧁', '<strong>Added sugars</strong> — keep below 25g/day (WHO recommendation)'),
  li('🧂', '<strong>High-sodium snacks</strong> — crisps, instant noodles, canned soups'),
  li('🥩', '<strong>Excessive red meat</strong> — cap at 2–3 servings per week'),
  li('🍺', '<strong>Heavy alcohol</strong> — don\'t let a good result become a reason to overdrink'),
  li('🛋️', '<strong>Prolonged sitting</strong> — break it up every 30–60 minutes'),
].join(''); }

function highRiskDo() { return [
  li('🏥', '<strong>See a doctor this week</strong> — get a full lipid panel and ECG'),
  li('🏃', '<strong>150 min moderate exercise/week</strong> — brisk walking, cycling, swimming'),
  li('😴', '<strong>7–9 hours of sleep</strong> — poor sleep raises BP and cortisol'),
  li('🧘', '<strong>Stress management</strong> — meditation, breathing exercises (10 min/day)'),
  li('⚖️', '<strong>Target BMI 18.5–24.9</strong> — losing even 5–10% weight helps significantly'),
  li('🚭', '<strong>Quit smoking immediately</strong> — risk halves within 1 year of quitting'),
].join(''); }

function lowRiskDo() { return [
  li('💪', '<strong>Keep up regular exercise</strong> — aim for 150+ min/week'),
  li('📅', '<strong>Annual health check-up</strong> — monitor BP and cholesterol yearly'),
  li('😴', '<strong>Protect your sleep</strong> — consistent 7–9 hours per night'),
  li('🧘', '<strong>Manage stress proactively</strong> — yoga, nature walks, journaling'),
  li('🚭', '<strong>Stay smoke-free</strong> — if you don\'t smoke, never start'),
  li('🤝', '<strong>Stay socially connected</strong> — loneliness is a real cardiac risk factor'),
].join(''); }

function nutrientList(isHigh) { return [
  li('❤️', `<strong>Omega-3 (EPA/DHA)</strong> — ${isHigh ? '2–4g/day for inflammation' : '1–2g/day maintenance'}`),
  li('🟡', '<strong>Vitamin D3</strong> — deficiency linked to heart disease; 1000–2000 IU/day'),
  li('🟤', `<strong>Magnesium</strong> — ${isHigh ? '400mg/day; relaxes blood vessels' : '310–420mg/day'} — nuts, seeds, dark chocolate`),
  li('🟠', '<strong>CoQ10</strong> — supports mitochondria; 100–200mg/day (especially if on statins)'),
  li('🔵', `<strong>Potassium</strong> — ${isHigh ? '4700mg/day; counteracts sodium' : '3500mg+/day'} — bananas, sweet potato`),
  li('🟢', '<strong>Folate / B9</strong> — lowers homocysteine; dark greens, legumes, 400mcg/day'),
].join(''); }

// ── toast ──────────────────────────────────────────────
function showToast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg; t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), 3000);
}

// ── community + sharing ────────────────────────────────
function inviteUrl() {
  return `${window.location.origin}${window.location.pathname}?invite=cardiocheck`;
}

function initCommunity() {
  const link = document.getElementById('invite-link');
  if (link) link.value = inviteUrl();
  updateSocialButtons();
  loadActions();
  loadLeaderboard();
}

function updateSocialButtons() {
  ['facebook', 'twitter', 'instagram'].forEach(network => {
    const btn = document.getElementById('connect-' + network);
    const state = document.getElementById(network + '-state');
    const connected = Boolean(socialState[network]);
    if (btn) btn.classList.toggle('connected', connected);
    if (state) state.textContent = connected ? 'Connected' : 'Not connected';
  });
}

function toggleSocial(network) {
  socialState[network] = !socialState[network];
  localStorage.setItem('cardio-social', JSON.stringify(socialState));
  updateSocialButtons();
  showToast(`${networkLabel(network)} ${socialState[network] ? 'connected' : 'disconnected'}`);
}

function networkLabel(network) {
  return network === 'twitter' ? 'Twitter / X' : network.charAt(0).toUpperCase() + network.slice(1);
}

async function copyInviteLink() {
  const link = inviteUrl();
  try {
    await navigator.clipboard.writeText(link);
    showToast('Invite link copied');
  } catch(e) {
    const input = document.getElementById('invite-link');
    if (input) {
      input.select();
      document.execCommand('copy');
      showToast('Invite link copied');
    }
  }
}

function shareSurvey() {
  if (navigator.share) {
    navigator.share({
      title: 'CardioCheck heart survey',
      text: inviteMessage,
      url: inviteUrl(),
    }).catch(() => {});
    return;
  }
  showPage('community');
  copyInviteLink();
}

function shareTo(network) {
  const url = encodeURIComponent(inviteUrl());
  const text = encodeURIComponent(inviteMessage);
  let shareUrl = '';

  if (network === 'facebook') {
    shareUrl = `https://www.facebook.com/sharer/sharer.php?u=${url}`;
  } else if (network === 'twitter') {
    shareUrl = `https://twitter.com/intent/tweet?text=${text}&url=${url}`;
  } else if (network === 'email') {
    shareUrl = `mailto:?subject=Take the CardioCheck survey&body=${text}%0A%0A${url}`;
  } else if (network === 'instagram') {
    copyInviteLink();
    showToast('Instagram sharing starts with a copied link');
    return;
  }

  window.open(shareUrl, '_blank', 'noopener,noreferrer');
}

async function loadActions() {
  const select = document.getElementById('score-action');
  if (!select || select.dataset.loaded === 'true') return;

  try {
    const res = await fetch('/api/heart-actions');
    const actions = await res.json();
    select.innerHTML = actions.map(action => (
      `<option value="${escapeHtml(action.id)}">${escapeHtml(action.label)} (+${action.points})</option>`
    )).join('');
    select.dataset.loaded = 'true';
  } catch(e) {
    select.innerHTML = '<option value="walk_30">30 minute brisk walk (+10)</option>';
  }
}

async function loadLeaderboard() {
  const board = document.getElementById('leaderboard-list');
  const activity = document.getElementById('activity-list');
  if (!board || !activity) return;

  try {
    const res = await fetch('/api/leaderboard');
    const data = await res.json();
    renderLeaderboard(data.leaderboard || []);
    renderActivity(data.activity || []);
  } catch(e) {
    board.innerHTML = '<div class="empty-state">Leaderboard is waiting for the server.</div>';
    activity.innerHTML = '<div class="empty-state">Log the first heart win.</div>';
  }
}

async function submitHeartPoints() {
  const name = document.getElementById('score-name').value.trim();
  const actionId = document.getElementById('score-action').value;
  const note = document.getElementById('score-note').value.trim();

  if (!name) {
    showToast('Add a display name first');
    return;
  }

  try {
    const res = await fetch('/api/points', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({ name, action_id: actionId, note })
    });
    const data = await res.json();
    if (data.error) {
      showToast(data.error);
      return;
    }
    document.getElementById('score-note').value = '';
    showToast(data.message);
    renderLeaderboard(data.leaderboard || []);
    renderActivity(data.activity || []);
  } catch(e) {
    showToast('Could not add points. Is Flask running?');
  }
}

function renderLeaderboard(players) {
  const board = document.getElementById('leaderboard-list');
  if (!players.length) {
    board.innerHTML = '<div class="empty-state">No scores yet. Be the first on the board.</div>';
    return;
  }

  board.innerHTML = players.map(player => `
    <div class="leader-row">
      <div class="leader-rank">#${player.rank}</div>
      <div class="leader-main">
        <strong>${escapeHtml(player.name)}</strong>
        <span>${escapeHtml(player.last_action || 'Joined CardioCheck')}</span>
      </div>
      <div class="leader-score">${player.points}<small>pts</small></div>
    </div>
  `).join('');
}

function renderActivity(entries) {
  const activity = document.getElementById('activity-list');
  if (!entries.length) {
    activity.innerHTML = '<div class="empty-state">Log the first heart win.</div>';
    return;
  }

  activity.innerHTML = entries.map(entry => `
    <div class="activity-row">
      <span>+${entry.points}</span>
      <div>
        <strong>${escapeHtml(entry.name)}</strong> ${escapeHtml(entry.action)}
        ${entry.note ? `<small>${escapeHtml(entry.note)}</small>` : ''}
      </div>
    </div>
  `).join('');
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, char => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;',
  }[char]));
}

// ── contact form ───────────────────────────────────────
function sendContact() {
  const name = document.getElementById('c-name').value;
  const email = document.getElementById('c-email').value;
  const msg = document.getElementById('c-msg').value;
  if (!name || !email || !msg) { showToast('Please fill in all fields ✋'); return; }
  showToast('Message sent! We\'ll get back to you soon 🫀');
  document.getElementById('c-name').value = '';
  document.getElementById('c-email').value = '';
  document.getElementById('c-msg').value = '';
}

// ── feat card mouse tracking ───────────────────────────
document.querySelectorAll('.feat-card').forEach(card => {
  card.addEventListener('mousemove', e => {
    const r = card.getBoundingClientRect();
    card.style.setProperty('--mx', ((e.clientX - r.left) / r.width * 100) + '%');
    card.style.setProperty('--my', ((e.clientY - r.top)  / r.height * 100) + '%');
  });
});

// ── animate demo ring on load ──────────────────────────
setTimeout(() => {
  const ring = document.getElementById('demo-ring');
  if (ring) ring.style.strokeDashoffset = 188; // 25% risk
}, 500);
