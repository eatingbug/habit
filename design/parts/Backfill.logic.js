class Component extends DCLogic {
  constructor(props) {
    super(props);
    this.state = { offset: 0 };
    this.max = 13;
  }
  day(offset) {
    const days = [
      { d: '7월 8일 (화)', sum: 6, rows: [{ t: '09:40', a: '+6p' }] },
      { d: '7월 7일 (월)', sum: 10, rows: [{ t: '12:00', a: '+10p' }] },
      { d: '7월 6일 (일)', sum: 0, rows: [] },
      { d: '7월 5일 (토)', sum: 4, rows: [{ t: '21:10', a: '+4p' }] },
      { d: '7월 4일 (금)', sum: 12, rows: [{ t: '08:20', a: '+12p' }] },
    ];
    return days[offset] || { d: '6월 ' + (30 - offset) + '일', sum: 0, rows: [] };
  }
  renderVals() {
    const o = this.state.offset;
    const floor = 10;
    const info = this.day(o);
    const sum = info.sum;
    const pct = Math.min(100, Math.round((sum / floor) * 100));
    const states = ['done', 'over', 'partial', 'done', 'blank', 'partial', 'done', 'done', 'over', 'blank', 'done', 'partial', 'skip', 'done'];
    const strip = states.map((s, i) => ({
      cls: 'cell ' + s,
      style: i === 13 - o ? 'outline:2px solid var(--accent); outline-offset:1px' : '',
    }));
    const stateName = sum === 0 ? '미기록 (unknown) — 미스가 아닙니다' : sum >= floor ? '달성 · 합 ' + sum + 'p' : '부분 · 합 ' + sum + 'p — 미스가 아닙니다';
    const feed = info.rows.length
      ? info.rows.map((r) => ({
          t: r.t,
          n: '독서',
          a: r.a,
          acls: 'amt',
          r: o === 0 ? '' : '지난 날 기록 · 낮 12시로 남음',
          rcls: 'backnote',
        }))
      : [{ t: '—', n: '이 날엔 기록이 없어요', a: '기록 없음', acls: 'amt plain', r: '', rcls: 'backnote' }];
    return {
      strip: strip,
      dateLabel: o === 0 ? '오늘 · ' + info.d : o === 1 ? '어제 · ' + info.d : info.d,
      rangeNote: '만든 날부터 오늘까지',
      atToday: o === 0,
      isBackfill: o > 0,
      todayCls: o === 0 ? 'btn sel' : 'btn',
      ydayCls: o === 1 ? 'btn sel' : 'btn',
      prev: () => this.setState({ offset: Math.min(this.max, o + 1) }),
      next: () => this.setState({ offset: Math.max(0, o - 1) }),
      goToday: () => this.setState({ offset: 0 }),
      goYesterday: () => this.setState({ offset: 1 }),
      dayState: stateName,
      progLeft: sum + ' / ' + floor + 'p',
      progRight: sum >= floor ? '오늘 몫 완료 ✓' : floor - sum + '쪽 더 하면 완료',
      progStyle: 'width:' + pct + '%',
      timeLabel: o === 0 ? '🕑 지금 14:20' : '🕑 낮 12:00으로 기록',
      feedTitle: o === 0 ? '오늘 기록' : '이 날 기록',
      feed,
    };
  }
}
