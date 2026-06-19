const api = window.schoolPortal;
const $ = (selector) => document.querySelector(selector);
const weekdays = ['월', '화', '수', '목', '금'];
const calendarWeekdays = ['일', '월', '화', '수', '목', '금', '토'];
const subjectIconPresets = [
  { id: 'book-open', glyph: '책', name: '책' },
  { id: 'calculator', glyph: '123', name: '계산' },
  { id: 'languages', glyph: 'Aa', name: '언어' },
  { id: 'shapes', glyph: '도형', name: '통합' },
  { id: 'flask', glyph: '실험', name: '과학' },
  { id: 'globe', glyph: '지구', name: '세계' },
  { id: 'dumbbell', glyph: '운동', name: '체육' },
  { id: 'music', glyph: '음표', name: '음악' },
  { id: 'palette', glyph: '색', name: '미술' },
  { id: 'sparkles', glyph: '활동', name: '활동' },
  { id: 'users', glyph: '모임', name: '모임' },
  { id: 'shield', glyph: '안전', name: '안전' },
  { id: 'computer', glyph: 'PC', name: '정보' },
  { id: 'history', glyph: '과거', name: '역사' },
  { id: 'leaf', glyph: '잎', name: '자연' },
  { id: 'star', glyph: '별', name: '기타' }
];

let state;
let adminTab = 'school';
let calendarCursor = new Date();
let logoClicks = [];
let availableUpdate = null;
let deferredUpdateVersion = '';
let mealRequestKey = '';
let devices = [];
let activeAlertAudio = null;
let alertRestoreTimer = null;

function escapeHtml(value = '') {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

function todayKey() {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function uid(prefix) {
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function selectedClass() {
  return state.classes.find((item) => item.id === state.selectedClassId) || state.classes[0];
}

function subjectIcon(subject) {
  const iconId = state.subjectIcons?.[subject] || 'star';
  return subjectIconPresets.find((item) => item.id === iconId) || subjectIconPresets.at(-1);
}

function subjectIconMarkup(subject) {
  const icon = subjectIcon(subject);
  return `<span class="subject-icon subject-icon-${escapeHtml(icon.id)}" title="${escapeHtml(icon.name)}">${escapeHtml(icon.glyph)}</span>`;
}

function timetableDayIndex(date) {
  if (!date) return -1;
  const day = new Date(`${date}T12:00:00`).getDay() - 1;
  return day >= 0 && day < 5 ? day : -1;
}

function shortDate(date) {
  if (!date) return '';
  return `${Number(date.slice(5, 7))}/${Number(date.slice(8, 10))}`;
}

function changeDescription(change) {
  if (!change.originalSubject || !change.changedSubject) return change.body || '';
  const date = new Intl.DateTimeFormat('ko-KR', { month: 'long', day: 'numeric', weekday: 'short' })
    .format(new Date(`${change.date}T12:00:00`));
  return `${date} ${change.period}교시 ${change.originalSubject} → ${change.changedSubject}으로 변경`;
}

function iconMarkup(shortcut) {
  const fallback = escapeHtml(shortcut.title.slice(0, 2).toUpperCase());
  return shortcut.iconPath
    ? `<img src="${escapeHtml(shortcut.iconPath)}" alt="" onerror="this.parentElement.textContent='${fallback}'" />`
    : fallback;
}

function render() {
  document.documentElement.style.setProperty('--accent', state.school.accent || '#007aff');
  $('#schoolName').textContent = state.school.name || 'School Portal';
  $('#schoolLogo').innerHTML = state.school.logo
    ? `<img src="${escapeHtml(state.school.logo)}" alt="" />`
    : 'SP';
  $('#todayText').textContent = new Intl.DateTimeFormat('ko-KR', { dateStyle: 'full' }).format(new Date());
  renderShortcuts();
  renderClass();
  renderCalendar();
  renderMeal();
  renderNotices();
  renderUrgent();
}

function renderShortcuts() {
  const query = $('#searchInput').value.trim().toLowerCase();
  const shortcuts = state.shortcuts.filter((item) =>
    !query || [item.title, item.subtitle, item.target].join(' ').toLowerCase().includes(query)
  );
  $('#serviceCount').textContent = `${shortcuts.length}개 서비스`;
  $('#shortcutGrid').innerHTML = shortcuts.length
    ? shortcuts.map((shortcut) => `
      <button class="shortcut-card" data-launch="${shortcut.id}">
        <span class="shortcut-icon">${iconMarkup(shortcut)}</span>
        <span class="shortcut-copy">
          <strong>${escapeHtml(shortcut.title)}</strong>
          <small>${escapeHtml(shortcut.subtitle || shortcut.target)}</small>
        </span>
        <span class="launch-mark">↗</span>
      </button>
    `).join('')
    : '<p class="empty">검색 결과가 없습니다.</p>';
}

function renderClass() {
  const current = selectedClass();
  $('#classSelect').innerHTML = state.classes.map((item) =>
    `<option value="${item.id}">${escapeHtml(item.name)}</option>`
  ).join('');
  $('#classSelect').value = current?.id || '';
  $('#classSummary').innerHTML = current
    ? `<strong>${escapeHtml(current.name)}</strong><span>${escapeHtml(current.homeroom || '담임 정보 없음')}</span>`
    : '<span>등록된 반이 없습니다.</span>';

  if (!current) {
    $('#weeklyTimetable').innerHTML = '<p class="empty">시간표가 없습니다.</p>';
    $('#changeList').innerHTML = '';
    return;
  }

  const maxPeriods = Number(current.periods) === 7 ? 7 : 6;
  const cells = ['<div class="table-corner">교시</div>'];
  weekdays.forEach((day) => cells.push(`<div class="table-head">${day}</div>`));
  for (let period = 0; period < maxPeriods; period += 1) {
    cells.push(`<div class="period">${period + 1}</div>`);
    weekdays.forEach((_day, dayIndex) => {
      const scheduledSubject = current.timetable[dayIndex]?.[period] || '';
      const change = state.timetableChanges
        .filter((item) => item.classId === current.id && timetableDayIndex(item.date) === dayIndex && Number(item.period) === period + 1)
        .sort((a, b) => String(b.date).localeCompare(String(a.date)))[0];
      const subject = change?.changedSubject || scheduledSubject;
      const changeTitle = change ? `${changeDescription(change)}` : '';
      cells.push(`
        <div class="subject${change ? ' changed-subject' : ''}" ${changeTitle ? `title="${escapeHtml(changeTitle)}"` : ''}>
          ${subject ? `${subjectIconMarkup(subject)}<span>${escapeHtml(subject)}</span>` : '<span>-</span>'}
          ${change ? `<small class="change-date">${escapeHtml(shortDate(change.date))} 변경</small>` : ''}
        </div>
      `);
    });
  }
  $('#weeklyTimetable').style.setProperty('--rows', maxPeriods);
  $('#weeklyTimetable').innerHTML = cells.join('');

  const changes = state.timetableChanges
    .filter((item) => !item.classId || item.classId === current.id)
    .sort((a, b) => String(b.date || b.createdAt).localeCompare(String(a.date || a.createdAt)))
    .slice(0, 5);
  $('#changeList').innerHTML = changes.length
    ? `<h3>시간표 변경 내역</h3>${changes.map((item) => `
        <div><b>${escapeHtml(shortDate(item.date))}</b><span>${escapeHtml(changeDescription(item))}</span></div>
      `).join('')}`
    : '';
}

function renderCalendar() {
  const year = calendarCursor.getFullYear();
  const month = calendarCursor.getMonth();
  $('#calendarTitle').textContent = `${year}년 ${month + 1}월 학사일정`;
  const firstDay = new Date(year, month, 1).getDay();
  const days = new Date(year, month + 1, 0).getDate();
  const monthPrefix = `${year}-${String(month + 1).padStart(2, '0')}`;
  const events = state.schedules.filter((item) => item.date.startsWith(monthPrefix));
  const eventDates = new Set(events.map((item) => item.date));
  const cells = calendarWeekdays.map((day) => `<div class="calendar-head">${day}</div>`);
  for (let index = 0; index < firstDay; index += 1) cells.push('<div class="calendar-day blank"></div>');
  for (let day = 1; day <= days; day += 1) {
    const key = `${monthPrefix}-${String(day).padStart(2, '0')}`;
    const classes = ['calendar-day'];
    if (key === todayKey()) classes.push('today');
    if (eventDates.has(key)) classes.push('has-event');
    cells.push(`<button class="${classes.join(' ')}" data-calendar-date="${key}">${day}<i></i></button>`);
  }
  $('#calendar').innerHTML = cells.join('');
  $('#calendarEvents').innerHTML = events.length
    ? events.sort((a, b) => a.date.localeCompare(b.date)).map((item) => `
      <div><time>${Number(item.date.slice(8))}일</time><span>${escapeHtml(item.title)}</span></div>
    `).join('')
    : '<p class="empty">이번 달 등록된 일정이 없습니다.</p>';
}

async function renderMeal() {
  $('#mealDate').textContent = new Intl.DateTimeFormat('ko-KR', { month: 'long', day: 'numeric', weekday: 'short' }).format(new Date());
  const requestKey = `${todayKey()}:${state.school.neisOfficeCode || ''}:${state.school.neisSchoolCode || ''}`;
  if (mealRequestKey === requestKey && $('#mealPanel').dataset.loaded === 'true') return;
  mealRequestKey = requestKey;
  $('#mealPanel').dataset.loaded = 'false';
  $('#mealPanel').innerHTML = '<p class="meal-loading">NEIS에서 오늘 급식을 불러오는 중입니다...</p>';
  const result = await api.getNeisMeal(todayKey());
  if (mealRequestKey !== requestKey) return;
  $('#mealPanel').dataset.loaded = 'true';
  if (!result.ok || result.empty) {
    $('#mealPanel').innerHTML = `<p class="meal-empty">${escapeHtml(result.message)}</p><small>학교 공통 급식</small>`;
    return;
  }
  $('#mealPanel').innerHTML = `
    <div class="meal-menu">${result.menu.map((item) => `<span>${escapeHtml(item)}</span>`).join('')}</div>
    <small>${escapeHtml(result.mealName)}${result.calories ? ` · ${escapeHtml(result.calories)}` : ''} · 학교 공통 급식</small>
  `;
}

function renderNotices() {
  const notices = [...state.notices].sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt))).slice(0, 5);
  $('#noticeList').innerHTML = notices.length
    ? notices.map((notice) => `
      <article class="${notice.urgent ? 'urgent-notice' : ''}">
        <span>${notice.urgent ? '긴급' : '공지'}</span>
        <div><strong>${escapeHtml(notice.title)}</strong><p>${escapeHtml(notice.body)}</p></div>
      </article>
    `).join('')
    : '<p class="empty">등록된 공지사항이 없습니다.</p>';
}

function renderUrgent() {
  const urgent = [...state.notices].find((item) => item.urgent);
  $('#urgentPanel').classList.toggle('hidden', !urgent);
  $('#urgentPanel').innerHTML = urgent
    ? `<strong>긴급 공지</strong><span>${escapeHtml(urgent.title)} · ${escapeHtml(urgent.body)}</span>`
    : '';
}

async function stopAlertSound() {
  if (alertRestoreTimer) clearTimeout(alertRestoreTimer);
  alertRestoreTimer = null;
  if (activeAlertAudio) {
    try {
      await activeAlertAudio.close();
    } catch {
      // The audio context may already be closed.
    }
    activeAlertAudio = null;
  }
  await api.restoreAlertVolume?.();
}

async function playAlertSound() {
  await stopAlertSound();
  await api.boostAlertVolume?.();
  try {
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    const context = new AudioContext();
    activeAlertAudio = context;
    for (let repeat = 0; repeat < 5; repeat += 1) {
      const start = context.currentTime + repeat * 1.15;
      const gain = context.createGain();
      gain.connect(context.destination);
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.exponentialRampToValueAtTime(0.92, start + 0.025);
      gain.gain.setValueAtTime(0.92, start + 0.48);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.82);
      [740, 988, 740].forEach((frequency, index) => {
        const oscillator = context.createOscillator();
        oscillator.type = index === 1 ? 'square' : 'sine';
        oscillator.frequency.value = frequency;
        oscillator.connect(gain);
        oscillator.start(start + index * 0.18);
        oscillator.stop(start + 0.34 + index * 0.18);
      });
    }
    alertRestoreTimer = setTimeout(stopAlertSound, 6800);
  } catch {
    alertRestoreTimer = setTimeout(stopAlertSound, 1000);
  }
}

function showAlert(alert) {
  if (!alert) return;
  $('#alertKind').textContent = alert.kind === 'timetable' ? '시간표 변경 알림' : '학교 공지';
  $('#alertTitle').textContent = alert.title || (alert.kind === 'timetable' ? '시간표가 변경되었습니다.' : '새 공지가 등록되었습니다.');
  $('#alertBody').textContent = alert.body || '';
  playAlertSound();
  if (!$('#alertDialog').open) $('#alertDialog').showModal();
}

async function saveConfig(patch) {
  state = await api.updateConfig(patch);
  render();
  if ($('#adminDialog').open) renderAdmin();
}

function bindEvents() {
  document.body.addEventListener('click', async (event) => {
    const launcher = event.target.closest('[data-launch]');
    if (launcher) {
      const shortcut = state.shortcuts.find((item) => item.id === launcher.dataset.launch);
      if (shortcut) await api.launchShortcut(shortcut);
    }
  });
  $('#searchInput').addEventListener('input', renderShortcuts);
  $('#classSelect').addEventListener('change', () => saveConfig({ selectedClassId: $('#classSelect').value }));
  $('#fullScreenBtn').addEventListener('click', () => api.toggleFullScreen());
  $('#prevMonthBtn').addEventListener('click', () => {
    calendarCursor = new Date(calendarCursor.getFullYear(), calendarCursor.getMonth() - 1, 1);
    renderCalendar();
  });
  $('#nextMonthBtn').addEventListener('click', () => {
    calendarCursor = new Date(calendarCursor.getFullYear(), calendarCursor.getMonth() + 1, 1);
    renderCalendar();
  });
  $('#brandButton').addEventListener('click', () => {
    const now = Date.now();
    logoClicks = [...logoClicks.filter((time) => now - time < 2000), now];
    if (logoClicks.length >= 5) {
      logoClicks = [];
      $('#adminLoginDialog').showModal();
      setTimeout(() => $('#adminPassword').focus(), 50);
    }
  });
  $('#adminLoginForm').addEventListener('submit', async (event) => {
    event.preventDefault();
    if (!await api.loginAdmin($('#adminPassword').value)) {
      $('#loginError').textContent = '비밀번호가 일치하지 않습니다.';
      return;
    }
    $('#adminPassword').value = '';
    $('#loginError').textContent = '';
    $('#adminLoginDialog').close();
    $('#adminDialog').showModal();
    renderAdmin();
  });
  $('#adminCloseBtn').addEventListener('click', () => $('#adminDialog').close());
  $('#alertCloseBtn').addEventListener('click', () => {
    $('#alertDialog').close();
    stopAlertSound();
    api.acknowledgeAlert?.();
  });
  $('#updateLaterBtn').addEventListener('click', () => {
    deferredUpdateVersion = availableUpdate?.version || availableUpdate?.latest || '';
    api.deferAutoUpdate?.();
    $('#updateDialog').close();
  });
  $('#updateDownloadBtn').addEventListener('click', downloadAvailableUpdate);
  $('#updateInstallBtn').addEventListener('click', () => api.installUpdate());
  document.querySelectorAll('.admin-tabs button').forEach((button) => {
    button.addEventListener('click', () => {
      adminTab = button.dataset.tab;
      document.querySelectorAll('.admin-tabs button').forEach((tab) =>
        tab.classList.toggle('active', tab.dataset.tab === adminTab)
      );
      renderAdmin();
    });
  });
  api.onConfigChanged?.((payload) => {
    state = payload.config;
    render();
    showAlert(payload.alert);
  });
  api.onUpdateEvent?.(handleUpdateEvent);
  api.onDevicesChanged?.((nextDevices) => {
    devices = nextDevices;
    if ($('#adminDialog').open && adminTab === 'devices') renderAdmin();
  });
  api.onRemoteSupportResponse?.((response) => {
    const box = $('#remoteSupportResult');
    if (!box) return;
    box.textContent = response.accepted
      ? `${response.deviceName}에서 요청을 허용했습니다. 빠른 지원 보안 코드를 대상 PC에 전달하세요.`
      : `${response.deviceName}에서 원격 지원 요청을 거절했습니다.`;
  });
}

function handleUpdateEvent(event) {
  if (event.type === 'available') {
    const incomingVersion = event.update.version || event.update.latest;
    if (incomingVersion === deferredUpdateVersion) return;
    availableUpdate = event.update;
    $('#updateTitle').textContent = `새 버전 ${incomingVersion}이 있습니다`;
    $('#updateNotes').textContent = event.update.notes || '새로운 School Portal 업데이트를 설치할 수 있습니다.';
    $('#updateProgress').classList.add('hidden');
    $('#updateDownloadBtn').classList.toggle('hidden', Boolean(event.update.auto));
    $('#updateInstallBtn').classList.add('hidden');
    if (event.update.auto) {
      $('#updateProgress').classList.remove('hidden');
      $('#updateProgressText').textContent = '자동 다운로드를 준비하는 중입니다...';
    }
    if (!$('#updateDialog').open) $('#updateDialog').showModal();
  }
  if (event.type === 'progress') {
    $('#updateProgress').classList.remove('hidden');
    $('#updateProgressBar').style.width = `${event.percent}%`;
    $('#updateProgressText').textContent = `${event.percent}% 다운로드 중`;
  }
  if (event.type === 'downloaded') {
    $('#updateProgressText').textContent = '다운로드 완료';
    $('#updateProgressBar').style.width = '100%';
    $('#updateDownloadBtn').classList.add('hidden');
    $('#updateInstallBtn').classList.remove('hidden');
    $('#updateTitle').textContent = '업데이트 설치 준비 완료';
    $('#updateNotes').textContent = event.auto
      ? '60초 후 자동으로 다시 시작해 업데이트합니다. 작업 중이라면 나중에를 선택하세요.'
      : $('#updateNotes').textContent;
  }
  if (event.type === 'not-available') {
    const result = $('#updateResult');
    if (result) result.textContent = `현재 최신 버전입니다. (${event.version})`;
  }
  if (event.type === 'error') {
    const result = $('#updateResult');
    if (result) result.textContent = `업데이트 확인 실패: ${event.message}`;
  }
}

async function downloadAvailableUpdate() {
  if (!availableUpdate) return;
  $('#updateDownloadBtn').disabled = true;
  $('#updateDownloadBtn').textContent = '다운로드 중';
  $('#updateProgress').classList.remove('hidden');
  const result = await api.downloadUpdate(availableUpdate);
  if (!result.ok) {
    $('#updateProgressText').textContent = result.message;
    $('#updateDownloadBtn').disabled = false;
    $('#updateDownloadBtn').textContent = '다시 시도';
  }
}

function renderAdmin() {
  const views = {
    school: schoolEditor,
    shortcuts: shortcutEditor,
    classes: classEditor,
    calendar: calendarEditor,
    broadcast: broadcastEditor,
    devices: deviceEditor,
    updates: updateEditor
  };
  $('#adminContent').innerHTML = views[adminTab]();
  setAdminValues();
  if (adminTab === 'broadcast') syncChangeForm();
}

function syncChangeForm(preserveOriginal = false) {
  const classSelect = $('#changeClassId');
  if (!classSelect) return;
  const targetClass = state.classes.find((item) => item.id === classSelect.value) || state.classes[0];
  const periodSelect = $('#changePeriod');
  const periods = Number(targetClass?.periods) === 7 ? 7 : 6;
  const previousPeriod = Math.min(Number(periodSelect.value || 1), periods);
  periodSelect.innerHTML = Array.from({ length: periods }, (_item, index) =>
    `<option value="${index + 1}">${index + 1}교시</option>`
  ).join('');
  periodSelect.value = String(previousPeriod);

  const dayIndex = timetableDayIndex($('#changeDate').value);
  const scheduledOriginal = dayIndex >= 0 ? targetClass?.timetable?.[dayIndex]?.[previousPeriod - 1] || '' : '';
  if (!preserveOriginal) $('#changeOriginalSubject').value = scheduledOriginal;
  const original = $('#changeOriginalSubject').value;
  const changed = $('#changeNewSubject').value;
  const preview = $('#changePreview');
  preview.innerHTML = dayIndex < 0
    ? '<span>토요일과 일요일은 정규 시간표 변경 대상으로 선택할 수 없습니다.</span>'
    : `<strong>${escapeHtml(shortDate($('#changeDate').value))} ${previousPeriod}교시</strong><span>${escapeHtml(original || '수업 없음')} → ${escapeHtml(changed || '변경 과목 선택')}</span>`;
}

function schoolEditor() {
  return `
    <div class="admin-grid">
      <label>학교 이름<input data-school="name" value="${escapeHtml(state.school.name)}" /></label>
      <label>강조 색상<input data-school="accent" type="color" value="${escapeHtml(state.school.accent)}" /></label>
      <label>학교 로고 경로<input data-school="logo" value="${escapeHtml(state.school.logo || '')}" placeholder="PNG, JPG, SVG 파일" /></label>
      <label>새 관리자 비밀번호<input id="newAdminPassword" type="password" placeholder="변경할 때만 입력" /></label>
      <label>Windows 시작 시 자동 실행<select data-school="startWithWindows"><option value="true">사용</option><option value="false">사용 안 함</option></select></label>
    </div>
    <div class="item-editor neis-school-editor">
      <h3>NEIS 급식 학교 설정</h3>
      <div class="editor-row">
        <label>학교 이름 검색<input id="neisSchoolSearch" value="${escapeHtml(state.school.name || '')}" placeholder="예: 서울○○초등학교" /></label>
        <div class="field-action"><span>학교 정보</span><button class="secondary-button" id="searchNeisSchoolBtn">NEIS 학교 찾기</button></div>
      </div>
      <div id="neisSchoolResults" class="school-search-results"></div>
      <p class="helper-text">현재 선택: ${state.school.neisSchoolCode ? `${escapeHtml(state.school.name)} (${escapeHtml(state.school.neisSchoolCode)})` : '선택된 NEIS 학교 없음'}</p>
      <input type="hidden" data-school="neisOfficeCode" value="${escapeHtml(state.school.neisOfficeCode || '')}" />
      <input type="hidden" data-school="neisSchoolCode" value="${escapeHtml(state.school.neisSchoolCode || '')}" />
    </div>
    <p class="helper-text">공지와 시간표 변경 알림은 같은 교내 네트워크의 School Portal로 자동 전송됩니다.</p>
    <div class="actions">
      <button class="secondary-button" id="pickLogoBtn">로고 파일 선택</button>
      <button class="primary-button" id="saveSchoolBtn">설정 저장</button>
    </div>
    <div id="syncResult" class="result-box"></div>`;
}

function shortcutEditor() {
  return `
    <div class="actions"><button class="primary-button" id="addShortcutBtn">바로가기 추가</button></div>
    ${state.shortcuts.map((item) => `
      <div class="item-editor" data-shortcut-editor="${item.id}">
        <div class="editor-row">
          <label>이름<input data-field="title" value="${escapeHtml(item.title)}" /></label>
          <label>설명<input data-field="subtitle" value="${escapeHtml(item.subtitle || '')}" /></label>
          <label>종류<select data-field="type"><option value="url">웹사이트</option><option value="app">설치 프로그램</option></select></label>
          <label>주소 또는 실행 경로<input data-field="target" value="${escapeHtml(item.target)}" /></label>
          <label>아이콘 이미지<input data-field="iconPath" value="${escapeHtml(item.iconPath || '')}" /></label>
        </div>
        <div class="actions">
          <button class="secondary-button" data-pick-program="${item.id}">프로그램 선택</button>
          <button class="secondary-button" data-pick-icon="${item.id}">아이콘 선택</button>
          <button class="primary-button" data-save-shortcut="${item.id}">저장</button>
          <button class="danger-button" data-delete-shortcut="${item.id}">삭제</button>
        </div>
      </div>`).join('')}`;
}

function subjectOptions(selected = '') {
  return ['<option value="">수업 없음</option>', ...state.subjectCatalog.map((subject) =>
    `<option value="${escapeHtml(subject)}" ${subject === selected ? 'selected' : ''}>${escapeHtml(subjectIcon(subject).glyph)} ${escapeHtml(subject)}</option>`
  )].join('');
}

function subjectIconOptions(subject) {
  const selected = state.subjectIcons?.[subject] || 'star';
  return subjectIconPresets.map((icon) =>
    `<option value="${icon.id}" ${icon.id === selected ? 'selected' : ''}>${escapeHtml(icon.glyph)} ${escapeHtml(icon.name)}</option>`
  ).join('');
}

function timetableSelectGrid(item) {
  const cells = ['<div class="table-corner">교시</div>', ...weekdays.map((day) => `<div class="table-head">${day}</div>`)];
  const periods = Number(item.periods) === 7 ? 7 : 6;
  for (let period = 0; period < 7; period += 1) {
    const seventhClass = period === 6 && periods === 6 ? ' period-seven-hidden' : '';
    const seventhAttribute = period === 6 ? ' data-period-seven' : '';
    cells.push(`<div class="period${seventhClass}"${seventhAttribute}>${period + 1}</div>`);
    for (let day = 0; day < 5; day += 1) {
      cells.push(`<div class="subject-select${seventhClass}"${seventhAttribute}><select data-timetable-day="${day}" data-timetable-period="${period}">${subjectOptions(item.timetable?.[day]?.[period] || '')}</select></div>`);
    }
  }
  return cells.join('');
}

function classEditor() {
  return `
    <div class="item-editor subject-manager">
      <h3>시간표 과목 목록</h3>
      <div class="subject-icon-list">${state.subjectCatalog.map((subject) => `
        <div class="subject-icon-item">
          ${subjectIconMarkup(subject)}
          <strong>${escapeHtml(subject)}</strong>
          <select data-subject-icon="${escapeHtml(subject)}" aria-label="${escapeHtml(subject)} 아이콘">${subjectIconOptions(subject)}</select>
          <button class="subject-delete" data-delete-subject="${escapeHtml(subject)}" aria-label="${escapeHtml(subject)} 삭제">×</button>
        </div>
      `).join('')}</div>
      <div class="inline-add"><input id="newSubjectName" placeholder="새 과목 이름" /><button class="secondary-button" id="addSubjectBtn">과목 추가</button></div>
    </div>
    <div class="actions"><button class="primary-button" id="addClassBtn">반 추가</button></div>
    ${state.classes.map((item) => `
      <div class="item-editor" data-class-editor="${item.id}">
        <div class="editor-row">
          <label>반 이름<input data-field="name" value="${escapeHtml(item.name)}" /></label>
          <label>담임/비고<input data-field="homeroom" value="${escapeHtml(item.homeroom || '')}" /></label>
          <label>수업 교시<select data-field="periods"><option value="6">6교시</option><option value="7">7교시</option></select></label>
        </div>
        <div class="timetable-select-grid">${timetableSelectGrid(item)}</div>
        <p class="helper-text">각 요일과 교시의 과목을 선택하세요. 과목이 없으면 ‘수업 없음’을 선택합니다.</p>
        <div class="actions">
          <button class="primary-button" data-save-class="${item.id}">저장</button>
          <button class="danger-button" data-delete-class="${item.id}">삭제</button>
        </div>
      </div>`).join('')}`;
}

function calendarEditor() {
  return `
    <div class="item-editor">
      <h3>학사일정 추가</h3>
      <div class="editor-row">
        <label>날짜<input id="newScheduleDate" type="date" value="${todayKey()}" /></label>
        <label>일정<input id="newScheduleTitle" placeholder="예: 현장체험학습" /></label>
      </div>
      <div class="actions"><button class="primary-button" id="addScheduleBtn">일정 추가</button></div>
    </div>
    ${[...state.schedules].sort((a, b) => a.date.localeCompare(b.date)).map((item) => `
      <div class="list-editor"><time>${escapeHtml(item.date)}</time><strong>${escapeHtml(item.title)}</strong>
        <button class="danger-button compact-button" data-delete-schedule="${item.id}">삭제</button>
      </div>`).join('')}`;
}

function broadcastEditor() {
  const firstClass = state.classes[0];
  const defaultPeriodCount = Number(firstClass?.periods) === 7 ? 7 : 6;
  return `
    <div class="broadcast-grid">
      <div class="item-editor">
        <h3>학교 공지 발행</h3>
        <label>제목<input id="noticeTitle" placeholder="공지 제목" /></label>
        <label>내용<textarea id="noticeBody" placeholder="교내에 전달할 내용을 입력하세요."></textarea></label>
        <label class="check-label"><input id="noticeUrgent" type="checkbox" /> 긴급 공지로 표시</label>
        <button class="primary-button" id="publishNoticeBtn">전체 PC에 공지 발행</button>
      </div>
      <div class="item-editor">
        <h3>시간표 변경 설정</h3>
        <div class="editor-row">
          <label>대상 반<select id="changeClassId">${state.classes.map((item) => `<option value="${item.id}">${escapeHtml(item.name)}</option>`).join('')}</select></label>
          <label>변경 날짜<input id="changeDate" type="date" value="${todayKey()}" /></label>
          <label>교시<select id="changePeriod">${Array.from({ length: defaultPeriodCount }, (_item, index) => `<option value="${index + 1}">${index + 1}교시</option>`).join('')}</select></label>
          <label>기존 과목<select id="changeOriginalSubject">${subjectOptions(firstClass?.timetable?.[timetableDayIndex(todayKey())]?.[0] || '')}</select></label>
          <label>변경 과목<select id="changeNewSubject">${subjectOptions('')}</select></label>
        </div>
        <div id="changePreview" class="change-preview"></div>
        <button class="primary-button" id="publishChangeBtn">변경 저장 및 전체 PC 알림</button>
      </div>
    </div>
    <p class="helper-text">변경을 저장하면 해당 날짜의 요일·교시 시간표에 변경 과목이 표시되고, 같은 교내 네트워크 PC에 알림이 발행됩니다.</p>
    <div id="publishResult" class="result-box"></div>
    <div class="item-editor">
      <h3>등록된 시간표 변경</h3>
      <div class="registered-changes">
        ${state.timetableChanges.length ? [...state.timetableChanges]
          .sort((a, b) => String(b.date || b.createdAt).localeCompare(String(a.date || a.createdAt)))
          .map((item) => `
            <div class="registered-change">
              <span>${escapeHtml(state.classes.find((entry) => entry.id === item.classId)?.name || '전체 반')}</span>
              <strong>${escapeHtml(changeDescription(item))}</strong>
              <button class="danger-button compact-button" data-delete-change="${item.id}">삭제</button>
            </div>
          `).join('') : '<p class="empty">등록된 시간표 변경이 없습니다.</p>'}
      </div>
    </div>`;
}

function updateEditor() {
  return `
    <div class="item-editor">
      <h3>자동 업데이트</h3>
      <p class="update-channel-copy">School Portal은 시작할 때와 실행 중 4시간마다 새 버전을 확인합니다. 새 버전은 자동 다운로드되고 60초 후 설치됩니다.</p>
      <div class="actions">
        <button class="primary-button" id="checkAutoUpdateBtn">지금 업데이트 확인</button>
      </div>
      <div id="updateResult" class="result-box"></div>
    </div>
    <div class="item-editor">
      <h3>새 버전 게시 방식</h3>
      <p class="helper-text">GitHub 저장소에서 <code>v1.7.0</code> 같은 버전 태그를 만들면 Windows 설치 파일과 업데이트 정보가 자동 생성·게시됩니다. 관리자 PC에서 설치 파일을 선택할 필요가 없습니다.</p>
    </div>`;
}

function deviceEditor() {
  return `
    <div class="device-summary">
      <div><strong>${devices.length}</strong><span>온라인 PC</span></div>
      <p>같은 교내 네트워크에서 최근 35초 안에 응답한 School Portal입니다.</p>
    </div>
    <div class="device-list">
      ${devices.length ? devices.map((device) => `
        <article class="device-item">
          <span class="device-status"></span>
          <div>
            <strong>${escapeHtml(device.name)}</strong>
            <span>${escapeHtml(device.user || '사용자 미확인')} · ${escapeHtml(device.address || '')}</span>
          </div>
          <span class="device-version">v${escapeHtml(device.version)}</span>
          <button class="primary-button compact-button" data-remote-support="${escapeHtml(device.id)}">원격 지원 요청</button>
        </article>
      `).join('') : '<p class="empty">현재 발견된 다른 PC가 없습니다.</p>'}
    </div>
    <div id="remoteSupportResult" class="result-box"></div>
    <p class="helper-text">대상 PC 사용자가 승인해야 빠른 지원이 열립니다. 화면 공유와 제어 권한도 대상 PC에서 직접 허용합니다.</p>`;
}

function setAdminValues() {
  document.querySelectorAll('[data-shortcut-editor]').forEach((editor) => {
    const item = state.shortcuts.find((shortcut) => shortcut.id === editor.dataset.shortcutEditor);
    editor.querySelector('[data-field="type"]').value = item.type;
  });
  ['startWithWindows'].forEach((key) => {
    const input = document.querySelector(`[data-school="${key}"]`);
    if (input) input.value = String(Boolean(state.school[key]));
  });
  document.querySelectorAll('[data-class-editor]').forEach((editor) => {
    const item = state.classes.find((entry) => entry.id === editor.dataset.classEditor);
    editor.querySelector('[data-field="periods"]').value = String(Number(item.periods) === 7 ? 7 : 6);
  });
}

$('#adminContent').addEventListener('click', async (event) => {
  const target = event.target;
  if (target.id === 'pickLogoBtn') {
    const file = await api.pickIcon();
    if (file) document.querySelector('[data-school="logo"]').value = file;
  }
  if (target.id === 'saveSchoolBtn') await saveSchool();
  if (target.id === 'searchNeisSchoolBtn') await searchNeisSchools();
  if (target.dataset.selectNeisSchool) selectNeisSchool(target.dataset.selectNeisSchool);
  if (target.id === 'addShortcutBtn') {
    await saveConfig({ shortcuts: [...state.shortcuts, { id: uid('shortcut'), title: '새 서비스', subtitle: '', target: 'https://', type: 'url', iconPath: '', categoryId: 'service' }] });
  }
  if (target.dataset.saveShortcut) await saveShortcut(target.dataset.saveShortcut);
  if (target.dataset.deleteShortcut) await saveConfig({ shortcuts: state.shortcuts.filter((item) => item.id !== target.dataset.deleteShortcut) });
  if (target.dataset.pickProgram) {
    const file = await api.pickProgram();
    if (file) document.querySelector(`[data-shortcut-editor="${target.dataset.pickProgram}"] [data-field="target"]`).value = file;
  }
  if (target.dataset.pickIcon) {
    const file = await api.pickIcon();
    if (file) document.querySelector(`[data-shortcut-editor="${target.dataset.pickIcon}"] [data-field="iconPath"]`).value = file;
  }
  if (target.id === 'addClassBtn') {
    await saveConfig({ classes: [...state.classes, { id: uid('class'), name: '새 반', homeroom: '', periods: 6, timetable: [[], [], [], [], []] }] });
  }
  if (target.id === 'addSubjectBtn') {
    const subject = $('#newSubjectName').value.trim();
    if (subject && !state.subjectCatalog.includes(subject)) {
      await saveConfig({
        subjectCatalog: [...state.subjectCatalog, subject],
        subjectIcons: { ...(state.subjectIcons || {}), [subject]: 'star' }
      });
    }
  }
  if (target.dataset.deleteSubject) {
    const subjectIcons = { ...(state.subjectIcons || {}) };
    delete subjectIcons[target.dataset.deleteSubject];
    await saveConfig({
      subjectCatalog: state.subjectCatalog.filter((subject) => subject !== target.dataset.deleteSubject),
      subjectIcons
    });
  }
  if (target.dataset.saveClass) await saveClass(target.dataset.saveClass);
  if (target.dataset.deleteClass) {
    const classes = state.classes.filter((item) => item.id !== target.dataset.deleteClass);
    await saveConfig({ classes, selectedClassId: classes[0]?.id || '' });
  }
  if (target.id === 'addScheduleBtn') {
    const date = $('#newScheduleDate').value;
    const title = $('#newScheduleTitle').value.trim();
    if (date && title) await saveConfig({ schedules: [...state.schedules, { id: uid('schedule'), date, title }] });
  }
  if (target.dataset.deleteSchedule) await saveConfig({ schedules: state.schedules.filter((item) => item.id !== target.dataset.deleteSchedule) });
  if (target.id === 'publishNoticeBtn') await publishNotice();
  if (target.id === 'publishChangeBtn') await publishChange();
  if (target.dataset.deleteChange) {
    await saveConfig({ timetableChanges: state.timetableChanges.filter((item) => item.id !== target.dataset.deleteChange) });
  }
  if (target.id === 'checkAutoUpdateBtn') {
    $('#updateResult').textContent = '새 버전을 확인하는 중입니다...';
    const result = await api.checkAutoUpdate();
    if (!result.ok) $('#updateResult').textContent = result.message;
  }
  if (target.dataset.remoteSupport) {
    const result = await api.requestRemoteSupport(target.dataset.remoteSupport);
    $('#remoteSupportResult').textContent = result.message;
  }
});

$('#adminContent').addEventListener('change', (event) => {
  if (event.target.dataset.subjectIcon) {
    saveConfig({
      subjectIcons: {
        ...(state.subjectIcons || {}),
        [event.target.dataset.subjectIcon]: event.target.value
      }
    });
    return;
  }
  if (event.target.dataset.field !== 'periods') return;
  const editor = event.target.closest('[data-class-editor]');
  const showSeventh = event.target.value === '7';
  editor.querySelectorAll('[data-period-seven]').forEach((cell) => {
    cell.classList.toggle('period-seven-hidden', !showSeventh);
  });
});

$('#adminContent').addEventListener('change', (event) => {
  if (['changeClassId', 'changeDate', 'changePeriod'].includes(event.target.id)) {
    syncChangeForm(false);
  }
  if (['changeOriginalSubject', 'changeNewSubject'].includes(event.target.id)) {
    syncChangeForm(true);
  }
});

async function saveSchool() {
  const school = {};
  document.querySelectorAll('[data-school]').forEach((input) => {
    school[input.dataset.school] = input.value === 'true' ? true : input.value === 'false' ? false : input.value;
  });
  const adminPassword = $('#newAdminPassword')?.value.trim();
  await saveConfig(adminPassword ? { school, adminPassword } : { school });
}

async function searchNeisSchools() {
  const box = $('#neisSchoolResults');
  box.innerHTML = '<p class="helper-text">학교를 검색하는 중입니다...</p>';
  const result = await api.searchNeisSchool($('#neisSchoolSearch').value);
  if (!result.ok) {
    box.innerHTML = `<p class="form-error">${escapeHtml(result.message)}</p>`;
    return;
  }
  box.innerHTML = result.schools.length
    ? result.schools.map((school, index) => `
      <button class="school-result" data-select-neis-school="${index}">
        <strong>${escapeHtml(school.schoolName)}</strong>
        <span>${escapeHtml(school.officeName)} · ${escapeHtml(school.address)}</span>
      </button>
    `).join('')
    : '<p class="helper-text">검색된 학교가 없습니다.</p>';
  box.dataset.schools = JSON.stringify(result.schools);
}

function selectNeisSchool(index) {
  const box = $('#neisSchoolResults');
  const schools = JSON.parse(box.dataset.schools || '[]');
  const school = schools[Number(index)];
  if (!school) return;
  document.querySelector('[data-school="neisOfficeCode"]').value = school.officeCode;
  document.querySelector('[data-school="neisSchoolCode"]').value = school.schoolCode;
  document.querySelector('[data-school="name"]').value = school.schoolName;
  box.innerHTML = `<p class="selected-school"><strong>${escapeHtml(school.schoolName)}</strong><span>${escapeHtml(school.address)}</span></p>`;
}

async function saveShortcut(id) {
  const editor = document.querySelector(`[data-shortcut-editor="${id}"]`);
  const next = state.shortcuts.map((item) => {
    if (item.id !== id) return item;
    const updated = { ...item };
    editor.querySelectorAll('[data-field]').forEach((input) => { updated[input.dataset.field] = input.value; });
    return updated;
  });
  await saveConfig({ shortcuts: next });
}

async function saveClass(id) {
  const editor = document.querySelector(`[data-class-editor="${id}"]`);
  const next = state.classes.map((item) => {
    if (item.id !== id) return item;
    const timetable = [[], [], [], [], []];
    const periods = Number(editor.querySelector('[data-field="periods"]').value) === 7 ? 7 : 6;
    editor.querySelectorAll('[data-timetable-day]').forEach((select) => {
      const period = Number(select.dataset.timetablePeriod);
      if (period < periods) timetable[Number(select.dataset.timetableDay)][period] = select.value;
    });
    return {
      ...item,
      name: editor.querySelector('[data-field="name"]').value,
      homeroom: editor.querySelector('[data-field="homeroom"]').value,
      periods,
      timetable
    };
  });
  await saveConfig({ classes: next });
}

async function publishNotice() {
  const title = $('#noticeTitle').value.trim();
  const body = $('#noticeBody').value.trim();
  if (!title || !body) {
    $('#publishResult').textContent = '공지 제목과 내용을 입력해 주세요.';
    return;
  }
  const notice = { id: uid('notice'), title, body, urgent: $('#noticeUrgent').checked, createdAt: new Date().toISOString(), kind: 'notice' };
  const result = await api.publishAnnouncement({ notices: [notice, ...state.notices] }, notice);
  state = result.config;
  render();
  renderAdmin();
  $('#publishResult').textContent = result.lanResult.ok ? '공지가 전체 PC에 발행되었습니다.' : result.lanResult.message;
}

async function publishChange() {
  const classId = $('#changeClassId').value;
  const date = $('#changeDate').value;
  const period = Number($('#changePeriod').value);
  const originalSubject = $('#changeOriginalSubject').value;
  const changedSubject = $('#changeNewSubject').value;
  if (!classId || !date || !period || !changedSubject) {
    $('#publishResult').textContent = '대상 반, 날짜, 교시와 변경 과목을 모두 선택해 주세요.';
    return;
  }
  if (timetableDayIndex(date) < 0) {
    $('#publishResult').textContent = '토요일과 일요일은 정규 시간표 변경 대상으로 선택할 수 없습니다.';
    return;
  }
  if (originalSubject === changedSubject) {
    $('#publishResult').textContent = '기존 과목과 다른 변경 과목을 선택해 주세요.';
    return;
  }
  const className = state.classes.find((item) => item.id === classId)?.name || '선택한 반';
  const change = {
    id: uid('change'),
    title: `${className} 시간표 변경`,
    body: `${period}교시 ${originalSubject || '수업 없음'} → ${changedSubject}`,
    classId,
    date,
    period,
    originalSubject,
    changedSubject,
    createdAt: new Date().toISOString(),
    kind: 'timetable'
  };
  const result = await api.publishAnnouncement({ timetableChanges: [change, ...state.timetableChanges] }, change);
  state = result.config;
  render();
  renderAdmin();
  $('#publishResult').textContent = result.lanResult.ok ? '시간표 변경이 전체 PC에 발행되었습니다.' : result.lanResult.message;
}

async function checkUpdate() {
  $('#updateResult').textContent = '업데이트를 확인하는 중입니다...';
  const result = await api.checkUpdate();
  if (!result.ok) {
    $('#updateResult').textContent = result.message;
    return;
  }
  if (!result.hasUpdate) {
    $('#updateResult').textContent = `현재 최신 버전입니다. (${result.current})`;
    return;
  }
  $('#updateResult').innerHTML = `<strong>새 버전 ${escapeHtml(result.latest)}</strong><p>${escapeHtml(result.notes)}</p><button id="downloadUpdateBtn" class="primary-button">설치 파일 열기</button>`;
  $('#downloadUpdateBtn').addEventListener('click', () => api.openUpdateDownload(result.downloadUrl));
}

async function init() {
  state = await api.getConfig();
  devices = await api.getDevices?.() || [];
  bindEvents();
  render();
}

init();
