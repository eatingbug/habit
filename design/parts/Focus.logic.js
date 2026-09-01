class Component extends DCLogic {
  constructor(props) {
    super(props);
    this.state = { picked: ['pullup', 'read'] };
  }
  renderVals() {
    const all = [
      { id: 'pullup', name: '턱걸이', meta: '힘 · 완료율 82%', reps: '반복 41' },
      { id: 'read', name: '독서', meta: '지능 · 완료율 64%', reps: '반복 23' },
      { id: 'meditate', name: '명상', meta: '의지 · 완료율 40%', reps: '반복 9' },
      { id: 'water', name: '물 마시기', meta: '체력 · 완료율 55%', reps: '반복 17' },
      { id: 'journal', name: '아침 일기', meta: '창의 · 완료율 31%', reps: '반복 6' },
    ];
    const picked = this.state.picked;
    const habits = all.map((h) => {
      const on = picked.indexOf(h.id) !== -1;
      return {
        name: h.name,
        meta: h.meta,
        reps: h.reps,
        mark: on ? '✓' : '',
        cls: on ? 'pick on' : 'pick',
        toggle: () =>
          this.setState({
            picked: on ? picked.filter((p) => p !== h.id) : picked.concat([h.id]),
          }),
      };
    });
    const n = picked.length;
    const slots = all.map((h) => ({
      cls: picked.indexOf(h.id) !== -1 ? (n > 3 ? 'over' : 'on') : '',
    }));
    const verdict =
      n === 0
        ? '하나도 고르지 않으면 아무것도 바뀌지 않습니다.'
        : n <= 3
        ? '적정 부하입니다. 나머지는 잠시 멈춤으로 보관돼요.'
        : '아직 많습니다 — 3개 이하로 줄이면 각각이 자리 잡을 여유가 생겨요.';
    return {
      habits,
      slots,
      summary: '집중 ' + n + ' · 잠시 멈춤 ' + (all.length - n),
      verdict,
      cta: n === 0 ? '고른 습관 없음' : '집중 ' + n + '개로 시작하기',
    };
  }
}
