if (!window.schoolPortal) {
  const today = new Date().toISOString().slice(0, 10);
  const previewState = {
    school: {
      name: '샘플초등학교',
      logo: '',
      accent: '#007aff',
      startWithWindows: true,
      fullScreenOnLaunch: false,
      updateFeedUrl: '',
      networkSyncPath: '',
      neisOfficeCode: 'B10',
      neisSchoolCode: '7010000'
    },
    categories: [{ id: 'service', name: '학교 서비스' }],
    shortcuts: [
      { id: 'youtube', title: '유튜브', subtitle: '교육 영상과 학교 채널', target: '#', type: 'url', iconPath: 'https://www.google.com/s2/favicons?domain=youtube.com&sz=128' },
      { id: 'tsherpa', title: '티셀파', subtitle: '수업 자료와 교과 콘텐츠', target: '#', type: 'url', iconPath: 'https://www.google.com/s2/favicons?domain=tsherpa.co.kr&sz=128' },
      { id: 'mteacher', title: '엠티처', subtitle: '교수학습 지원 서비스', target: '#', type: 'url', iconPath: 'https://www.google.com/s2/favicons?domain=m-teacher.co.kr&sz=128' },
      { id: 'padlet', title: '패들렛', subtitle: '수업 협업 게시판', target: '#', type: 'url', iconPath: 'https://www.google.com/s2/favicons?domain=padlet.com&sz=128' },
      { id: 'naver', title: '네이버', subtitle: '검색, 메일, 지도', target: '#', type: 'url', iconPath: 'https://www.google.com/s2/favicons?domain=naver.com&sz=128' }
    ],
    classes: [{
      id: '1-1',
      name: '1학년 1반',
      homeroom: '김선생님',
      periods: 6,
      timetable: [
        ['국어', '수학', '창체', '통합', '음악'],
        ['수학', '국어', '통합', '체육', '미술'],
        ['통합', '영어', '수학', '국어', '동아리'],
        ['국어', '통합', '체육', '수학', '안전'],
        ['수학', '국어', '통합', '미술', '창체']
      ],
      meals: { [today]: '쌀밥, 소고기미역국, 돼지갈비, 감자채볶음, 배추김치, 과일' }
    }],
    selectedClassId: '1-1',
    subjectCatalog: ['국어', '수학', '영어', '통합', '체육', '음악', '미술', '창체', '동아리', '안전'],
    subjectIcons: {
      '국어': 'book-open',
      '수학': 'calculator',
      '영어': 'languages',
      '통합': 'shapes',
      '체육': 'dumbbell',
      '음악': 'music',
      '미술': 'palette',
      '창체': 'sparkles',
      '동아리': 'users',
      '안전': 'shield'
    },
    notices: [
      { id: 'notice-1', title: '학교 행사 안내', body: '이번 주 금요일에 학년별 체험 활동이 있습니다.', urgent: false, createdAt: new Date().toISOString() }
    ],
    schedules: [
      { id: 'schedule-1', date: today, title: '학년별 체험 활동' }
    ],
    timetableChanges: [
      { id: 'change-1', classId: '1-1', date: today, body: '3교시 창체 수업은 강당에서 진행합니다.', createdAt: new Date().toISOString() }
    ],
    recent: []
  };

  window.schoolPortal = {
    getConfig: async () => previewState,
    updateConfig: async (patch) => {
      Object.assign(previewState, patch);
      if (patch.school) previewState.school = { ...previewState.school, ...patch.school };
      return previewState;
    },
    publishAnnouncement: async (patch) => {
      Object.assign(previewState, patch);
      return { config: previewState, syncResult: { ok: true } };
    },
    syncNow: async () => ({ ok: true, filePath: '미리보기' }),
    loginAdmin: async () => true,
    launchShortcut: async () => ({ ok: true }),
    toggleFullScreen: async () => false,
    pickIcon: async () => '',
    pickProgram: async () => '',
    pickUpdateInstaller: async () => '',
    searchNeisSchool: async () => ({ ok: true, schools: [{ officeCode: 'B10', officeName: '서울특별시교육청', schoolCode: '7010000', schoolName: '샘플초등학교', address: '서울특별시' }] }),
    getNeisMeal: async () => ({ ok: true, mealName: '중식', calories: '675 Kcal', menu: ['쌀밥', '소고기미역국', '돼지갈비', '감자채볶음', '배추김치', '과일'] }),
    publishLanUpdate: async () => ({ ok: true, message: '업데이트 배포 완료' }),
    downloadUpdate: async () => ({ ok: true }),
    installUpdate: async () => ({ ok: true }),
    acknowledgeAlert: async () => true,
    getDevices: async () => [
      { id: 'pc-1', name: 'CLASS-101-PC', user: 'student', address: '192.168.0.21', version: '1.7.0' },
      { id: 'pc-2', name: 'TEACHERS-OFFICE', user: 'teacher', address: '192.168.0.31', version: '1.7.0' }
    ],
    requestRemoteSupport: async () => ({ ok: true, message: '대상 PC에 승인 요청을 보냈습니다.' }),
    checkAutoUpdate: async () => ({ ok: true }),
    deferAutoUpdate: async () => true,
    checkUpdate: async () => ({ ok: true, current: '1.5.0', latest: '1.5.0', hasUpdate: false }),
    openUpdateDownload: async () => true,
    onConfigChanged: () => {},
    onUpdateEvent: () => {},
    onDevicesChanged: () => {},
    onRemoteSupportResponse: () => {}
  };
}
