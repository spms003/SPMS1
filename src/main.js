const { app, BrowserWindow, ipcMain, shell, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const https = require('https');
const http = require('http');
const dgram = require('dgram');
const os = require('os');
const { spawn, execFile } = require('child_process');
const { autoUpdater } = require('electron-updater');

const APP_CONFIG_VERSION = 12;
const SYNC_INTERVAL_MS = 5000;
const SHARED_KEYS = ['shortcuts', 'categories', 'classes', 'subjectCatalog', 'subjectIcons', 'notices', 'schedules', 'timetableChanges'];
const LAN_GROUP = '239.255.42.99';
const LAN_PORT = 41234;
const LAN_PROTOCOL = 'school-portal-lan-v1';

let store;
let mainWindow;
let syncTimer;
let lastSharedRevision = 0;
let lanSocket;
let updateServer;
let updateInstallerPath = '';
let downloadedUpdatePath = '';
let updateBroadcastTimer;
let heartbeatTimer;
let updateCheckTimer;
let autoUpdateInstallTimer;
let autoUpdateReady = false;
let alertOriginalVolume = null;
let alertVolumeRestoreTimer;
const onlineDevices = new Map();
const receivedMessages = new Set();

const WINDOWS_VOLUME_TYPE = `
using System;
using System.Runtime.InteropServices;
public enum EDataFlow { eRender, eCapture, eAll }
public enum ERole { eConsole, eMultimedia, eCommunications }
[ComImport, Guid("BCDE0395-E52F-467C-8E3D-C4579291692E")]
public class MMDeviceEnumeratorComObject {}
[ComImport, Guid("A95664D2-9614-4F35-A746-DE8DB63617E6"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
public interface IMMDeviceEnumerator {
  int NotImpl1();
  [PreserveSig] int GetDefaultAudioEndpoint(EDataFlow dataFlow, ERole role, out IMMDevice ppDevice);
}
[ComImport, Guid("D666063F-1587-4E43-81F1-B948E807363F"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
public interface IMMDevice {
  [PreserveSig] int Activate(ref Guid iid, int dwClsCtx, IntPtr pActivationParams, [MarshalAs(UnmanagedType.IUnknown)] out object ppInterface);
}
[ComImport, Guid("5CDF2C82-841E-4546-9722-0CF74078229A"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
public interface IAudioEndpointVolume {
  int RegisterControlChangeNotify(IntPtr pNotify);
  int UnregisterControlChangeNotify(IntPtr pNotify);
  int GetChannelCount(ref uint pnChannelCount);
  int SetMasterVolumeLevel(float fLevelDB, Guid pguidEventContext);
  int SetMasterVolumeLevelScalar(float fLevel, Guid pguidEventContext);
  int GetMasterVolumeLevel(ref float pfLevelDB);
  int GetMasterVolumeLevelScalar(ref float pfLevel);
  int SetChannelVolumeLevel(uint nChannel, float fLevelDB, Guid pguidEventContext);
  int SetChannelVolumeLevelScalar(uint nChannel, float fLevel, Guid pguidEventContext);
  int GetChannelVolumeLevel(uint nChannel, ref float pfLevelDB);
  int GetChannelVolumeLevelScalar(uint nChannel, ref float pfLevel);
  int SetMute([MarshalAs(UnmanagedType.Bool)] bool bMute, Guid pguidEventContext);
  int GetMute(ref bool pbMute);
}
public static class SchoolPortalAudio {
  static IAudioEndpointVolume Endpoint() {
    var enumerator = (IMMDeviceEnumerator)(new MMDeviceEnumeratorComObject());
    IMMDevice device;
    Marshal.ThrowExceptionForHR(enumerator.GetDefaultAudioEndpoint(EDataFlow.eRender, ERole.eMultimedia, out device));
    Guid iid = typeof(IAudioEndpointVolume).GUID;
    object endpoint;
    Marshal.ThrowExceptionForHR(device.Activate(ref iid, 23, IntPtr.Zero, out endpoint));
    return (IAudioEndpointVolume)endpoint;
  }
  public static float GetVolume() {
    float value = 0;
    Marshal.ThrowExceptionForHR(Endpoint().GetMasterVolumeLevelScalar(ref value));
    return value;
  }
  public static void SetVolume(float value) {
    Marshal.ThrowExceptionForHR(Endpoint().SetMute(false, Guid.Empty));
    Marshal.ThrowExceptionForHR(Endpoint().SetMasterVolumeLevelScalar(Math.Max(0, Math.Min(1, value)), Guid.Empty));
  }
}`;

app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');

function today() {
  return new Date().toISOString().slice(0, 10);
}

function hashPassword(password) {
  return crypto.createHash('sha256').update(`school-portal:${password}`).digest('hex');
}

function makeShortcut(id, title, subtitle, target, icon, categoryId, iconPath) {
  return { id, title, subtitle, target, type: 'url', icon, iconPath, categoryId };
}

function defaultShortcuts() {
  return [
    makeShortcut('youtube', '유튜브', '교육 영상과 학교 채널', 'https://www.youtube.com/', 'youtube', 'service', 'https://www.google.com/s2/favicons?domain=youtube.com&sz=128'),
    makeShortcut('tsherpa', '티셀파', '수업 자료와 교과 콘텐츠', 'https://www.tsherpa.co.kr/', 'tsherpa', 'service', 'https://www.google.com/s2/favicons?domain=tsherpa.co.kr&sz=128'),
    makeShortcut('mteacher', '엠티처', '교수학습 지원 서비스', 'https://www.m-teacher.co.kr/', 'mteacher', 'service', 'https://www.google.com/s2/favicons?domain=m-teacher.co.kr&sz=128'),
    makeShortcut('padlet', '패들렛', '수업 협업 게시판', 'https://padlet.com/', 'padlet', 'service', 'https://www.google.com/s2/favicons?domain=padlet.com&sz=128'),
    makeShortcut('naver', '네이버', '검색, 메일, 지도', 'https://www.naver.com/', 'naver', 'service', 'https://www.google.com/s2/favicons?domain=naver.com&sz=128')
  ];
}

function emptyWeek() {
  return [[], [], [], [], []];
}

function defaultClasses() {
  return [
    {
      id: '1-1',
      name: '1학년 1반',
      homeroom: '담임 선생님',
      timetable: [
        ['국어', '수학', '창체', '통합', '음악'],
        ['수학', '국어', '통합', '체육', '미술'],
        ['통합', '영어', '수학', '국어', '동아리'],
        ['국어', '통합', '체육', '수학', '안전'],
        ['수학', '국어', '통합', '미술', '창체']
      ],
      periods: 6,
      meals: { [today()]: '쌀밥, 미역국, 돼지갈비, 배추김치, 과일' }
    },
    {
      id: '2-1',
      name: '2학년 1반',
      homeroom: '담임 선생님',
      timetable: [
        ['수학', '국어', '통합', '체육', '창체'],
        ['국어', '통합', '수학', '음악', '미술'],
        ['영어', '수학', '국어', '통합', '동아리'],
        ['통합', '국어', '수학', '안전', '체육'],
        ['국어', '수학', '통합', '미술', '창체']
      ],
      periods: 6,
      meals: { [today()]: '현미밥, 된장국, 제육볶음, 깍두기, 요구르트' }
    }
  ];
}

function createDefaults() {
  return {
    configVersion: APP_CONFIG_VERSION,
    school: {
      name: '샘플초등학교',
      logo: '',
      accent: '#007aff',
      fullScreenOnLaunch: false,
      startWithWindows: true,
      updateFeedUrl: '',
      networkSyncPath: '',
      neisOfficeCode: '',
      neisSchoolCode: ''
    },
    admin: { passwordHash: hashPassword('admin1234') },
    device: { id: crypto.randomUUID() },
    categories: [{ id: 'service', name: '학교 서비스' }],
    shortcuts: defaultShortcuts(),
    classes: defaultClasses(),
    subjectCatalog: ['국어', '수학', '영어', '통합', '과학', '사회', '체육', '음악', '미술', '창체', '동아리', '안전'],
    subjectIcons: {
      '국어': 'book-open',
      '수학': 'calculator',
      '영어': 'languages',
      '통합': 'shapes',
      '과학': 'flask',
      '사회': 'globe',
      '체육': 'dumbbell',
      '음악': 'music',
      '미술': 'palette',
      '창체': 'sparkles',
      '동아리': 'users',
      '안전': 'shield'
    },
    selectedClassId: '1-1',
    notices: [{
      id: crypto.randomUUID(),
      title: 'School Portal 안내',
      body: '학교 공지와 학사일정을 이곳에서 확인할 수 있습니다.',
      urgent: false,
      createdAt: new Date().toISOString()
    }],
    schedules: [
      { id: crypto.randomUUID(), date: today(), title: '학교 일정 예시' }
    ],
    timetableChanges: [],
    notificationRevision: 0,
    recent: []
  };
}

function mergeDefaults(defaults, saved) {
  if (Array.isArray(defaults)) return Array.isArray(saved) ? saved : defaults;
  if (!defaults || typeof defaults !== 'object') return saved ?? defaults;
  return Object.fromEntries(
    Object.entries(defaults).map(([key, value]) => [key, mergeDefaults(value, saved?.[key])])
  );
}

function createStore() {
  const filePath = path.join(app.getPath('userData'), 'school-portal-config.json');
  const defaults = createDefaults();
  let data = defaults;

  if (fs.existsSync(filePath)) {
    try {
      const saved = JSON.parse(fs.readFileSync(filePath, 'utf8'));
      data = mergeDefaults(defaults, saved);
      data.configVersion = APP_CONFIG_VERSION;
      data.school.name = !saved.school?.name || saved.school.name === 'Sample School'
        ? defaults.school.name
        : saved.school.name;
      data.shortcuts = (saved.shortcuts || defaults.shortcuts).map((item) => ({
        ...item,
        modes: undefined,
        favorite: undefined
      }));
      data.notices = (saved.notices || defaults.notices).map(({ audience, ...notice }) => notice);
      data.schedules = (saved.schedules || defaults.schedules).map(({ audience, ...schedule }) => schedule);
      data.classes = data.classes.map((item) => ({
        ...item,
        periods: Number(item.periods) === 7 || Math.max(0, ...(item.timetable || []).map((day) => day.length)) >= 7 ? 7 : 6
      }));
      const timetableSubjects = data.classes.flatMap((item) => item.timetable || []).flat().filter(Boolean);
      data.subjectCatalog = [...new Set([...(saved.subjectCatalog || defaults.subjectCatalog), ...timetableSubjects])];
      data.subjectIcons = { ...defaults.subjectIcons, ...(saved.subjectIcons || {}) };
    } catch {
      data = defaults;
    }
  }

  function persist() {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
  }

  persist();
  return {
    get store() {
      return data;
    },
    get(key) {
      return key.split('.').reduce((value, part) => value?.[part], data);
    },
    set(key, value) {
      const parts = key.split('.');
      let cursor = data;
      while (parts.length > 1) {
        const part = parts.shift();
        cursor[part] = cursor[part] || {};
        cursor = cursor[part];
      }
      cursor[parts[0]] = value;
      persist();
    }
  };
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1320,
    height: 860,
    minWidth: 960,
    minHeight: 680,
    title: 'School Portal',
    fullscreen: true,
    backgroundColor: '#f2f2f7',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  mainWindow.setMenuBarVisibility(false);
  mainWindow.loadFile(path.join(__dirname, 'renderer', 'index.html'));

  if (process.env.SCHOOL_PORTAL_CAPTURE) {
    mainWindow.webContents.once('did-finish-load', () => {
      setTimeout(async () => {
        if (process.env.SCHOOL_PORTAL_CAPTURE_BROWSER === 'true') {
          const browserWindow = createShortcutWindow({
            title: '인터넷 수업 자료',
            target: 'data:text/html;charset=utf-8,%3Cstyle%3Ebody%7Bfont-family%3Asans-serif%3Bdisplay%3Agrid%3Bplace-items%3Acenter%3Bheight%3A100vh%3Bmargin%3A0%3Bbackground%3A%23f7f7f9%7Dh1%7Bfont-size%3A38px%7Dp%7Bcolor%3A%236e6e73%7D%3C%2Fstyle%3E%3Cmain%3E%3Ch1%3E학교 인터넷 서비스%3C%2Fh1%3E%3Cp%3E웹페이지 영역 미리보기%3C%2Fp%3E%3C%2Fmain%3E'
          });
          await new Promise((resolve) => browserWindow.webContents.once('did-finish-load', resolve));
          await new Promise((resolve) => setTimeout(resolve, 450));
          const browserImage = await browserWindow.webContents.capturePage();
          fs.writeFileSync(process.env.SCHOOL_PORTAL_CAPTURE, browserImage.toPNG());
          app.quit();
          return;
        }
        if (process.env.SCHOOL_PORTAL_CAPTURE_ADMIN) {
          await mainWindow.webContents.executeJavaScript(`
            adminTab = ${JSON.stringify(process.env.SCHOOL_PORTAL_CAPTURE_ADMIN)};
            document.querySelectorAll('.admin-tabs button').forEach((tab) => tab.classList.toggle('active', tab.dataset.tab === adminTab));
            document.querySelector('#adminDialog').showModal();
            renderAdmin();
            if (adminTab === 'classes' && ${JSON.stringify(process.env.SCHOOL_PORTAL_CAPTURE_PERIODS === '7')}) {
              const periods = document.querySelector('[data-class-editor] [data-field="periods"]');
              periods.value = '7';
              periods.dispatchEvent(new Event('change', { bubbles: true }));
            }
          `);
          await new Promise((resolve) => setTimeout(resolve, 350));
        }
        if (process.env.SCHOOL_PORTAL_CAPTURE_CHANGE === 'true') {
          await mainWindow.webContents.executeJavaScript(`
            const captureClass = selectedClass();
            state.timetableChanges = [{
              id: 'capture-change',
              classId: captureClass.id,
              date: '2026-06-19',
              period: 2,
              originalSubject: captureClass.timetable[4]?.[1] || '수학',
              changedSubject: '음악',
              body: '2교시 음악으로 변경',
              createdAt: new Date().toISOString(),
              kind: 'timetable'
            }, ...state.timetableChanges];
            render();
          `);
          await new Promise((resolve) => setTimeout(resolve, 200));
        }
        const image = await mainWindow.webContents.capturePage();
        fs.writeFileSync(process.env.SCHOOL_PORTAL_CAPTURE, image.toPNG());
        app.quit();
      }, 1800);
    });
  }
}

function setAutoLaunch(enabled) {
  app.setLoginItemSettings({
    openAtLogin: Boolean(enabled),
    name: 'School Portal',
    path: app.getPath('exe')
  });
}

function sharedFilePath() {
  const configured = String(store.get('school.networkSyncPath') || '').trim();
  if (!configured) return '';
  if (path.extname(configured).toLowerCase() === '.json') return configured;
  return path.join(configured, 'school-portal-shared.json');
}

function sharedSnapshot() {
  return Object.fromEntries([
    ...SHARED_KEYS.map((key) => [key, store.get(key)]),
    ['notificationRevision', store.get('notificationRevision') || 0],
    ['updatedAt', new Date().toISOString()]
  ]);
}

function writeSharedData() {
  const filePath = sharedFilePath();
  if (!filePath) return { ok: false, message: '공유 폴더 경로가 설정되지 않았습니다.' };
  try {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, JSON.stringify(sharedSnapshot(), null, 2), 'utf8');
    return { ok: true, filePath };
  } catch (error) {
    return { ok: false, message: `공유 데이터 저장 실패: ${error.message}` };
  }
}

function readSharedData() {
  const filePath = sharedFilePath();
  if (!filePath || !fs.existsSync(filePath)) return;
  try {
    const shared = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    const incomingRevision = Number(shared.notificationRevision || 0);
    const hasNewAlert = incomingRevision > lastSharedRevision;

    for (const key of SHARED_KEYS) {
      if (shared[key] !== undefined) store.set(key, shared[key]);
    }
    store.set('notificationRevision', incomingRevision);
    lastSharedRevision = incomingRevision;

    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('config:changed', {
        config: store.store,
        alert: hasNewAlert ? newestAlert(shared) : null
      });
    }
  } catch {
    // A shared file may be between writes or temporarily unavailable.
  }
}

function newestAlert(data) {
  const candidates = [
    ...(data.notices || []).map((item) => ({ ...item, kind: 'notice' })),
    ...(data.timetableChanges || []).map((item) => ({ ...item, kind: 'timetable' }))
  ].sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
  return candidates[0] || null;
}

function restartSharedSync() {
  if (syncTimer) clearInterval(syncTimer);
  lastSharedRevision = Number(store.get('notificationRevision') || 0);
  readSharedData();
  syncTimer = setInterval(readSharedData, SYNC_INTERVAL_MS);
}

function startLanService() {
  lanSocket = dgram.createSocket({ type: 'udp4', reuseAddr: true });
  lanSocket.on('error', () => {});
  lanSocket.on('message', (message, remote) => {
    try {
      const packet = JSON.parse(message.toString('utf8'));
      if (packet.protocol !== LAN_PROTOCOL || !packet.messageId || receivedMessages.has(packet.messageId)) return;
      receivedMessages.add(packet.messageId);
      setTimeout(() => receivedMessages.delete(packet.messageId), 10 * 60 * 1000);
      if (packet.type === 'announcement') receiveLanAnnouncement(packet.payload);
      if (packet.type === 'update') receiveLanUpdate(packet.payload, remote.address);
      if (packet.type === 'heartbeat') receiveHeartbeat(packet.payload, remote.address);
      if (packet.type === 'remote-support-request') receiveRemoteSupportRequest(packet.payload);
      if (packet.type === 'remote-support-response') receiveRemoteSupportResponse(packet.payload);
    } catch {
      // Ignore unrelated multicast traffic.
    }
  });
  lanSocket.bind(LAN_PORT, () => {
    try {
      lanSocket.addMembership(LAN_GROUP);
      lanSocket.setMulticastTTL(8);
      lanSocket.setMulticastLoopback(true);
      lanSocket.setBroadcast(true);
    } catch {
      // Windows network policy may block multicast on restricted networks.
    }
    sendHeartbeat();
    heartbeatTimer = setInterval(sendHeartbeat, 10000);
  });
}

function deviceInfo() {
  return {
    id: store.get('device.id'),
    name: os.hostname(),
    version: app.getVersion(),
    platform: `${os.type()} ${os.release()}`,
    user: os.userInfo().username
  };
}

function sendHeartbeat() {
  sendLanPacket('heartbeat', deviceInfo());
  const staleBefore = Date.now() - 35000;
  for (const [id, device] of onlineDevices) {
    if (device.lastSeen < staleBefore) onlineDevices.delete(id);
  }
  emitDeviceList();
}

function receiveHeartbeat(payload, address) {
  if (!payload?.id || payload.id === store.get('device.id')) return;
  onlineDevices.set(payload.id, { ...payload, address, lastSeen: Date.now() });
  emitDeviceList();
}

function deviceList() {
  return [...onlineDevices.values()].sort((a, b) => a.name.localeCompare(b.name, 'ko'));
}

function emitDeviceList() {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('devices:changed', deviceList());
  }
}

async function receiveRemoteSupportRequest(payload) {
  if (!payload || payload.targetId !== store.get('device.id')) return;
  const result = await dialog.showMessageBox(mainWindow, {
    type: 'question',
    title: '원격 지원 요청',
    message: `${payload.requesterName || '관리자 PC'}에서 원격 지원을 요청했습니다.`,
    detail: '허용하면 Windows 빠른 지원이 열립니다. 연결 코드 입력과 화면 공유 및 제어 권한은 이 PC에서 직접 승인해야 합니다.',
    buttons: ['허용', '거절'],
    defaultId: 1,
    cancelId: 1,
    noLink: true
  });
  const accepted = result.response === 0;
  if (accepted) launchQuickAssist();
  sendLanPacket('remote-support-response', {
    targetId: payload.requesterId,
    deviceId: store.get('device.id'),
    deviceName: os.hostname(),
    accepted
  });
}

function receiveRemoteSupportResponse(payload) {
  if (!payload || payload.targetId !== store.get('device.id') || !mainWindow || mainWindow.isDestroyed()) return;
  mainWindow.webContents.send('remote-support:response', payload);
}

function launchQuickAssist() {
  try {
    const child = spawn('quickassist.exe', [], { detached: true, stdio: 'ignore', windowsHide: false });
    child.once('error', () => {
      shell.openExternal('ms-windows-store://pdp/?ProductId=9P7BP5VNWKX5');
    });
    child.unref();
    return true;
  } catch {
    shell.openExternal('ms-windows-store://pdp/?ProductId=9P7BP5VNWKX5');
    return false;
  }
}

function setupAutoUpdater() {
  if (!app.isPackaged) return;
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;
  autoUpdater.on('checking-for-update', () => sendAutoUpdateEvent({ type: 'checking' }));
  autoUpdater.on('update-available', (info) => {
    sendAutoUpdateEvent({ type: 'available', update: { version: info.version, notes: releaseNotesText(info.releaseNotes), auto: true } });
  });
  autoUpdater.on('update-not-available', (info) => sendAutoUpdateEvent({ type: 'not-available', version: info.version }));
  autoUpdater.on('download-progress', (progress) => {
    sendAutoUpdateEvent({
      type: 'progress',
      percent: Math.round(progress.percent || 0),
      received: progress.transferred,
      total: progress.total,
      auto: true
    });
  });
  autoUpdater.on('update-downloaded', (info) => {
    autoUpdateReady = true;
    sendAutoUpdateEvent({ type: 'downloaded', version: info.version, auto: true });
    autoUpdateInstallTimer = setTimeout(() => autoUpdater.quitAndInstall(false, true), 60000);
  });
  autoUpdater.on('error', (error) => sendAutoUpdateEvent({ type: 'error', message: error.message }));
  setTimeout(() => autoUpdater.checkForUpdates().catch(() => {}), 5000);
  updateCheckTimer = setInterval(() => autoUpdater.checkForUpdates().catch(() => {}), 4 * 60 * 60 * 1000);
}

function sendAutoUpdateEvent(payload) {
  if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('update:event', payload);
}

function releaseNotesText(notes) {
  if (typeof notes === 'string') return notes;
  if (Array.isArray(notes)) return notes.map((item) => item.note || '').filter(Boolean).join('\n');
  return '';
}

function sendLanPacket(type, payload) {
  if (!lanSocket) return { ok: false, message: '교내 네트워크 알림 서비스가 준비되지 않았습니다.' };
  const packet = Buffer.from(JSON.stringify({
    protocol: LAN_PROTOCOL,
    messageId: crypto.randomUUID(),
    type,
    payload,
    sentAt: new Date().toISOString()
  }));
  for (let attempt = 0; attempt < 3; attempt += 1) {
    setTimeout(() => {
      lanSocket.send(packet, LAN_PORT, LAN_GROUP, () => {});
      lanSocket.send(packet, LAN_PORT, '255.255.255.255', () => {});
    }, attempt * 220);
  }
  return { ok: true };
}

function receiveLanAnnouncement(payload) {
  if (!payload?.alert || !payload?.patch) return;
  for (const key of SHARED_KEYS) {
    if (payload.patch[key] !== undefined) store.set(key, payload.patch[key]);
  }
  if (mainWindow && !mainWindow.isDestroyed()) {
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.show();
    mainWindow.focus();
    mainWindow.flashFrame(true);
    mainWindow.webContents.send('config:changed', { config: store.store, alert: payload.alert });
  }
}

function receiveLanUpdate(payload, senderAddress) {
  if (!payload?.version || compareVersions(payload.version, app.getVersion()) <= 0) return;
  const update = {
    ...payload,
    downloadUrl: `http://${senderAddress}:${payload.port}/school-portal-update`
  };
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.flashFrame(true);
    mainWindow.webContents.send('update:event', { type: 'available', update });
  }
}

app.whenReady().then(() => {
  store = createStore();
  setAutoLaunch(store.get('school.startWithWindows'));
  createWindow();
  restartSharedSync();
  startLanService();
  setupAutoUpdater();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('before-quit', () => {
  if (lanSocket) lanSocket.close();
  if (updateServer) updateServer.close();
  if (updateBroadcastTimer) clearInterval(updateBroadcastTimer);
  if (heartbeatTimer) clearInterval(heartbeatTimer);
  if (updateCheckTimer) clearInterval(updateCheckTimer);
  if (autoUpdateInstallTimer) clearTimeout(autoUpdateInstallTimer);
  restoreAlertVolume();
});

ipcMain.handle('config:get', () => store.store);

ipcMain.handle('admin:login', (_event, password) => {
  return hashPassword(password) === store.get('admin.passwordHash');
});

ipcMain.handle('config:update', (_event, patch) => {
  if (patch.school) {
    const previousSyncPath = store.get('school.networkSyncPath');
    store.set('school', { ...store.get('school'), ...patch.school });
    setAutoLaunch(store.get('school.startWithWindows'));
    if (mainWindow) mainWindow.setFullScreen(Boolean(store.get('school.fullScreenOnLaunch')));
    if (previousSyncPath !== store.get('school.networkSyncPath')) restartSharedSync();
  }
  for (const key of [...SHARED_KEYS, 'recent', 'selectedClassId']) {
    if (Object.prototype.hasOwnProperty.call(patch, key)) store.set(key, patch[key]);
  }
  if (patch.adminPassword) store.set('admin.passwordHash', hashPassword(patch.adminPassword));
  if (SHARED_KEYS.some((key) => Object.prototype.hasOwnProperty.call(patch, key))) writeSharedData();
  return store.store;
});

ipcMain.handle('announcement:publish', (_event, patch, alert) => {
  for (const key of SHARED_KEYS) {
    if (Object.prototype.hasOwnProperty.call(patch, key)) store.set(key, patch[key]);
  }
  const revision = Date.now();
  store.set('notificationRevision', revision);
  lastSharedRevision = revision;
  const syncResult = writeSharedData();
  const lanResult = sendLanPacket('announcement', { patch, alert });

  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('config:changed', { config: store.store, alert });
  }
  return { config: store.store, syncResult, lanResult };
});

ipcMain.handle('sync:now', () => {
  const result = writeSharedData();
  if (result.ok) readSharedData();
  return result;
});

ipcMain.handle('devices:get', () => deviceList());

ipcMain.handle('remote-support:request', (_event, targetId) => {
  const target = onlineDevices.get(targetId);
  if (!target) return { ok: false, message: '대상 PC가 오프라인입니다.' };
  launchQuickAssist();
  sendLanPacket('remote-support-request', {
    targetId,
    requesterId: store.get('device.id'),
    requesterName: os.hostname()
  });
  return { ok: true, message: `${target.name}에 승인 요청을 보냈습니다. 빠른 지원에서 보안 코드를 생성해 전달하세요.` };
});

ipcMain.handle('update:autoCheck', async () => {
  if (!app.isPackaged) return { ok: false, message: '개발 실행에서는 자동 업데이트를 확인하지 않습니다.' };
  try {
    await autoUpdater.checkForUpdates();
    return { ok: true };
  } catch (error) {
    return { ok: false, message: error.message };
  }
});

ipcMain.handle('update:defer', () => {
  if (autoUpdateInstallTimer) clearTimeout(autoUpdateInstallTimer);
  autoUpdateInstallTimer = null;
  return true;
});

function runVolumeScript(command) {
  return new Promise((resolve, reject) => {
    const script = `
Add-Type -TypeDefinition @'
${WINDOWS_VOLUME_TYPE}
'@
${command}
`;
    const encoded = Buffer.from(script, 'utf16le').toString('base64');
    execFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-EncodedCommand', encoded], {
      windowsHide: true,
      timeout: 12000
    }, (error, stdout) => {
      if (error) reject(error);
      else resolve(String(stdout).trim());
    });
  });
}

async function restoreAlertVolume() {
  if (alertVolumeRestoreTimer) clearTimeout(alertVolumeRestoreTimer);
  alertVolumeRestoreTimer = null;
  if (alertOriginalVolume === null) return false;
  const original = alertOriginalVolume;
  alertOriginalVolume = null;
  try {
    await runVolumeScript(`[SchoolPortalAudio]::SetVolume(${original.toFixed(4)})`);
    return true;
  } catch {
    return false;
  }
}

ipcMain.handle('alert:boostVolume', async () => {
  try {
    if (alertOriginalVolume === null) {
      const current = Number(await runVolumeScript('[SchoolPortalAudio]::GetVolume().ToString([System.Globalization.CultureInfo]::InvariantCulture)'));
      if (Number.isFinite(current)) alertOriginalVolume = current;
    }
    await runVolumeScript('[SchoolPortalAudio]::SetVolume(1.0)');
    if (alertVolumeRestoreTimer) clearTimeout(alertVolumeRestoreTimer);
    alertVolumeRestoreTimer = setTimeout(restoreAlertVolume, 9000);
    return { ok: true };
  } catch (error) {
    return { ok: false, message: error.message };
  }
});

ipcMain.handle('alert:restoreVolume', () => restoreAlertVolume());

ipcMain.handle('alert:ack', () => {
  if (mainWindow && !mainWindow.isDestroyed()) mainWindow.flashFrame(false);
  restoreAlertVolume();
  return true;
});

ipcMain.handle('shortcut:launch', async (_event, shortcut) => {
  const recent = (store.get('recent') || []).filter((item) => item.id !== shortcut.id);
  store.set('recent', [{ id: shortcut.id, usedAt: new Date().toISOString() }, ...recent].slice(0, 8));

  if (shortcut.type === 'app') {
    const executable = shortcut.target;
    const bareExe = /^[a-zA-Z0-9_.-]+\.exe$/.test(executable);
    if (!executable || (!fs.existsSync(executable) && !bareExe)) {
      dialog.showErrorBox('프로그램 실행 실패', '관리자 페이지에서 올바른 실행 파일 경로를 설정해 주세요.');
      return { ok: false };
    }
    const result = await shell.openPath(executable);
    return { ok: result === '', message: result };
  }

  createShortcutWindow(shortcut);
  return { ok: true };
});

function restoreMainWindow() {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.show();
  mainWindow.setFullScreen(true);
  mainWindow.focus();
}

function createShortcutWindow(shortcut) {
  const child = new BrowserWindow({
    width: 1280,
    height: 840,
    title: `${shortcut.title} - School Portal`,
    parent: mainWindow,
    fullscreen: true,
    frame: false,
    backgroundColor: '#ffffff',
    webPreferences: {
      preload: path.join(__dirname, 'browser-preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      webviewTag: true
    }
  });
  child.setMenuBarVisibility(false);
  child.on('closed', restoreMainWindow);
  child.loadFile(path.join(__dirname, 'renderer', 'browser.html'), {
    query: { title: shortcut.title, url: shortcut.target }
  });
  return child;
}

ipcMain.handle('browser:minimize', (event) => {
  const window = BrowserWindow.fromWebContents(event.sender);
  if (window && window !== mainWindow) window.minimize();
  restoreMainWindow();
  return true;
});

ipcMain.handle('browser:close', (event) => {
  const window = BrowserWindow.fromWebContents(event.sender);
  if (window && window !== mainWindow) window.close();
  return true;
});

ipcMain.handle('browser:portal', (event) => {
  const window = BrowserWindow.fromWebContents(event.sender);
  if (window && window !== mainWindow) window.close();
  restoreMainWindow();
  return true;
});

ipcMain.handle('window:toggleFullScreen', () => {
  if (!mainWindow) return false;
  mainWindow.setFullScreen(!mainWindow.isFullScreen());
  return mainWindow.isFullScreen();
});

ipcMain.handle('dialog:pickIcon', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    title: '아이콘 이미지 선택',
    properties: ['openFile'],
    filters: [{ name: '이미지', extensions: ['png', 'jpg', 'jpeg', 'webp', 'ico', 'svg'] }]
  });
  return result.canceled ? '' : result.filePaths[0];
});

ipcMain.handle('dialog:pickProgram', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    title: '프로그램 선택',
    properties: ['openFile'],
    filters: [{ name: '프로그램', extensions: ['exe', 'bat', 'cmd', 'lnk'] }]
  });
  return result.canceled ? '' : result.filePaths[0];
});

ipcMain.handle('dialog:pickUpdateInstaller', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    title: '배포할 School Portal 설치 파일 선택',
    properties: ['openFile'],
    filters: [{ name: 'Windows 설치 파일', extensions: ['exe'] }]
  });
  return result.canceled ? '' : result.filePaths[0];
});

ipcMain.handle('neis:searchSchool', async (_event, schoolName) => {
  const name = String(schoolName || '').trim();
  if (!name) return { ok: false, message: '학교 이름을 입력해 주세요.', schools: [] };
  try {
    const url = `https://open.neis.go.kr/hub/schoolInfo?Type=json&pIndex=1&pSize=30&SCHUL_NM=${encodeURIComponent(name)}`;
    const data = await fetchJson(url);
    const rows = neisRows(data, 'schoolInfo');
    return {
      ok: true,
      schools: rows.map((row) => ({
        officeCode: row.ATPT_OFCDC_SC_CODE,
        officeName: row.ATPT_OFCDC_SC_NM,
        schoolCode: row.SD_SCHUL_CODE,
        schoolName: row.SCHUL_NM,
        address: row.ORG_RDNMA || ''
      }))
    };
  } catch (error) {
    return { ok: false, message: `학교 검색 실패: ${error.message}`, schools: [] };
  }
});

ipcMain.handle('neis:getMeal', async (_event, date) => {
  const officeCode = String(store.get('school.neisOfficeCode') || '').trim();
  const schoolCode = String(store.get('school.neisSchoolCode') || '').trim();
  if (!officeCode || !schoolCode) {
    return { ok: false, needsSchool: true, message: '관리자 페이지에서 NEIS 학교를 먼저 선택해 주세요.' };
  }
  try {
    const mealDate = String(date || today()).replaceAll('-', '');
    const url = `https://open.neis.go.kr/hub/mealServiceDietInfo?Type=json&pIndex=1&pSize=10&ATPT_OFCDC_SC_CODE=${encodeURIComponent(officeCode)}&SD_SCHUL_CODE=${encodeURIComponent(schoolCode)}&MLSV_YMD=${mealDate}`;
    const data = await fetchJson(url);
    const rows = neisRows(data, 'mealServiceDietInfo');
    const lunch = rows.find((row) => row.MMEAL_SC_CODE === '2') || rows[0];
    if (!lunch) return { ok: true, empty: true, message: '오늘 등록된 급식이 없습니다.' };
    const menu = String(lunch.DDISH_NM || '')
      .split(/<br\s*\/?>/i)
      .map((item) => item.replace(/\s*\([^)]*\)\s*/g, '').trim())
      .filter(Boolean);
    return {
      ok: true,
      menu,
      mealName: lunch.MMEAL_SC_NM || '중식',
      calories: lunch.CAL_INFO || '',
      nutrition: String(lunch.NTR_INFO || '').replace(/<br\s*\/?>/gi, ', ')
    };
  } catch (error) {
    return { ok: false, message: `급식 정보를 불러오지 못했습니다: ${error.message}` };
  }
});

ipcMain.handle('update:publishLan', async (_event, info) => {
  const installerPath = String(info.installerPath || '');
  const version = String(info.version || '').trim();
  if (!installerPath || !fs.existsSync(installerPath)) return { ok: false, message: '올바른 설치 파일을 선택해 주세요.' };
  if (!/^\d+\.\d+\.\d+/.test(version)) return { ok: false, message: '버전은 1.4.0 형식으로 입력해 주세요.' };

  updateInstallerPath = installerPath;
  if (updateServer) await new Promise((resolve) => updateServer.close(resolve));
  updateServer = http.createServer((request, response) => {
    if (request.url !== '/school-portal-update' || !updateInstallerPath) {
      response.writeHead(404);
      response.end();
      return;
    }
    const stat = fs.statSync(updateInstallerPath);
    response.writeHead(200, {
      'Content-Type': 'application/octet-stream',
      'Content-Length': stat.size,
      'Content-Disposition': `attachment; filename="${path.basename(updateInstallerPath)}"`
    });
    fs.createReadStream(updateInstallerPath).pipe(response);
  });
  await new Promise((resolve, reject) => {
    updateServer.once('error', reject);
    updateServer.listen(0, '0.0.0.0', resolve);
  });
  const port = updateServer.address().port;
  const stat = fs.statSync(updateInstallerPath);
  const payload = {
    version,
    notes: String(info.notes || ''),
    fileName: path.basename(updateInstallerPath),
    size: stat.size,
    port
  };
  const result = sendLanPacket('update', payload);
  if (updateBroadcastTimer) clearInterval(updateBroadcastTimer);
  updateBroadcastTimer = setInterval(() => sendLanPacket('update', payload), 30000);
  return result.ok
    ? { ok: true, message: `버전 ${version} 업데이트를 교내 PC에 배포했습니다.` }
    : result;
});

ipcMain.handle('update:download', async (_event, update) => {
  try {
    downloadedUpdatePath = path.join(app.getPath('temp'), `School-Portal-Setup-${update.version}.exe`);
    await downloadFile(update.downloadUrl, downloadedUpdatePath, (received, total) => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('update:event', {
          type: 'progress',
          received,
          total,
          percent: total ? Math.round((received / total) * 100) : 0
        });
      }
    });
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('update:event', { type: 'downloaded', filePath: downloadedUpdatePath, version: update.version });
    }
    return { ok: true };
  } catch (error) {
    return { ok: false, message: `업데이트 다운로드 실패: ${error.message}` };
  }
});

ipcMain.handle('update:install', () => {
  if (autoUpdateReady) {
    if (autoUpdateInstallTimer) clearTimeout(autoUpdateInstallTimer);
    setTimeout(() => autoUpdater.quitAndInstall(false, true), 300);
    return { ok: true };
  }
  if (!downloadedUpdatePath || !fs.existsSync(downloadedUpdatePath)) return { ok: false };
  const child = require('child_process').spawn(downloadedUpdatePath, [], {
    detached: true,
    stdio: 'ignore',
    windowsHide: false
  });
  child.unref();
  setTimeout(() => app.quit(), 500);
  return { ok: true };
});

ipcMain.handle('update:check', () => checkWebUpdate());

ipcMain.handle('update:openDownload', async (_event, url) => {
  if (url) await shell.openExternal(url);
  return true;
});

async function checkWebUpdateAutomatically() {
  const result = await checkWebUpdate();
  if (result.ok && result.hasUpdate && mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('update:event', { type: 'available', update: result });
  }
}

async function checkWebUpdate() {
  const feedUrl = store.get('school.updateFeedUrl');
  if (!feedUrl) return { ok: false, message: '업데이트 주소가 설정되지 않았습니다.' };
  try {
    const info = await fetchJson(feedUrl);
    const latest = String(info.version || '');
    return {
      ok: true,
      current: app.getVersion(),
      version: latest,
      latest,
      downloadUrl: String(info.downloadUrl || ''),
      hasUpdate: latest && compareVersions(latest, app.getVersion()) > 0,
      notes: info.notes || ''
    };
  } catch (error) {
    return { ok: false, message: `업데이트 확인 실패: ${error.message}` };
  }
}

function downloadFile(url, destination, onProgress, redirects = 0) {
  return new Promise((resolve, reject) => {
    if (redirects > 5) {
      reject(new Error('리디렉션이 너무 많습니다.'));
      return;
    }
    const client = url.startsWith('https:') ? https : http;
    const request = client.get(url, { headers: { 'User-Agent': 'School Portal Updater' } }, (response) => {
      if ([301, 302, 303, 307, 308].includes(response.statusCode) && response.headers.location) {
        response.resume();
        const nextUrl = new URL(response.headers.location, url).toString();
        downloadFile(nextUrl, destination, onProgress, redirects + 1).then(resolve, reject);
        return;
      }
      if (response.statusCode < 200 || response.statusCode >= 300) {
        reject(new Error(`HTTP ${response.statusCode}`));
        response.resume();
        return;
      }
      const total = Number(response.headers['content-length'] || 0);
      let received = 0;
      const file = fs.createWriteStream(destination);
      response.on('data', (chunk) => {
        received += chunk.length;
        onProgress(received, total);
      });
      response.pipe(file);
      file.on('finish', () => file.close(resolve));
      file.on('error', reject);
    });
    request.on('error', reject);
  });
}

function fetchJson(url) {
  return new Promise((resolve, reject) => {
    https.get(url, { headers: { 'User-Agent': 'School Portal Updater' } }, (response) => {
      if (response.statusCode < 200 || response.statusCode >= 300) {
        reject(new Error(`HTTP ${response.statusCode}`));
        response.resume();
        return;
      }
      let body = '';
      response.setEncoding('utf8');
      response.on('data', (chunk) => { body += chunk; });
      response.on('end', () => {
        try {
          resolve(JSON.parse(body));
        } catch (error) {
          reject(error);
        }
      });
    }).on('error', reject);
  });
}

function neisRows(data, serviceName) {
  const blocks = Array.isArray(data?.[serviceName]) ? data[serviceName] : [];
  return blocks.find((block) => Array.isArray(block.row))?.row || [];
}

function compareVersions(a, b) {
  const left = a.split('.').map(Number);
  const right = b.split('.').map(Number);
  for (let index = 0; index < Math.max(left.length, right.length); index += 1) {
    const diff = (left[index] || 0) - (right[index] || 0);
    if (diff !== 0) return diff;
  }
  return 0;
}
