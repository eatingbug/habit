class Component extends DCLogic {
  constructor(props) {
    super(props);
    this.state = { offset: 0 };
    this.max = 13;
  }
  day(offset) {
    // 오늘 = 7/8 (화). 앞의 다섯 날만 실제 데이터, 나머지는 기록 없는 날.
    const seeded = [
      { sum: 6, rows: [{ t: '09:40', a: '+6p' }] },
      { sum: 10, rows: [{ t: '12:00', a: '+10p' }] },
      { sum: 0, rows: [] },
      { sum: 4, rows: [{ t: '12:00', a: '+4p' }] },
      { sum: 12, rows: [{ t: '12:00', a: '+12p' }] },
    ];
    const names = ['일', '월', '화', '수', '목', '금', '토'];
    const dayNum = 8 - offset;
    const label = dayNum >= 1 ? '7월 ' + dayNum + '일' : '6월 ' + (30 + dayNum) + '일';
    const wd = names[((2 - offset) % 7 + 7) % 7];
    const info = seeded[offset] || { sum: 0, rows: [] };
    return { d: label + ' (' + wd + ')', sum: info.sum, rows: info.rows };
  }
  renderVals() {
    const o = this.state.offset;
    const floor = 10;
    const info = this.day(o);
    const sum = info.sum;
    const pct = Math.min(100, Math.round((sum / floor) * 100));
    const here = sum === 0 ? (o === 0 ? 'pending' : 'missed') : sum >= floor ? 'done' : 'partial';
    const states = ['done', 'over', 'partial', 'done', 'missed', 'partial', 'done', 'done', 'over', 'missed', 'done', 'partial', 'skip', 'done'];
    const strip = states.map((st, i) => {
      const picked = i === 13 - o;
      return {
        cls: 'cell ' + (picked ? here : st),
        style: picked ? 'outline:2px solid var(--accent); outline-offset:1px' : '',
      };
    });
    const stateName =
      sum === 0
        ? o === 0
          ? '오늘은 아직 안 했어요 — 하루가 안 끝났습니다'
          : '기록이 없어 실패로 잡힌 날 — 지금 채우면 회복됩니다'
        : sum >= floor
        ? '성공 · 모두 ' + sum + '쪽'
        : '조금 함 · 모두 ' + sum + '쪽 — 실패로 세지 않습니다';
    const feed = info.rows.length
      ? info.rows.map((r) => ({
          t: r.t,
          n: '독서',
          a: r.a,
          acls: 'amt',
          r: o === 0 ? '' : '지난 날 기록 · 낮 12시로 남음',
          rcls: 'backnote',
        }))
      : [
          {
            t: '—',
            n: o === 0 ? '오늘은 아직 기록이 없어요' : '이 날엔 기록이 없어요',
            a: o === 0 ? '오늘' : '실패',
            acls: o === 0 ? 'amt plain' : 'amt warn',
            r: o === 0 ? '' : '채워 넣으면 이 날이 성공으로 바뀝니다',
            rcls: 'backnote',
          },
        ];
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
