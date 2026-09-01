class Component extends DCLogic {
  constructor(props) {
    super(props);
    this.state = { picked: ['pullup', 'read'] };
  }
  renderVals() {
    const all = [
      { id: 'pullup', name: '턱걸이', meta: '힘 · 성공률 82%', reps: '41일째' },
      { id: 'read', name: '독서', meta: '지능 · 성공률 64%', reps: '23일째' },
      { id: 'meditate', name: '명상', meta: '의지 · 성공률 40%', reps: '9일째' },
      { id: 'water', name: '물 마시기', meta: '체력 · 성공률 55%', reps: '17일째' },
      { id: 'journal', name: '아침 일기', meta: '창의 · 성공률 31%', reps: '6일째' },
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
    const lanes = Math.max(3, n);
    const slots = [];
    for (let i = 0; i < lanes; i++) {
      slots.push({ cls: i < n ? (n > 3 ? 'over' : 'on') : '' });
    }
    const verdict =
      n === 0
        ? '하나도 안 고르면 지금 그대로예요.'
        : n <= 3
        ? '이 정도면 감당할 만해요. 나머지는 쉬어 두고 그대로 보관됩니다.'
        : '아직 많아요. 3개 아래로 줄이면 하나하나에 여유가 생깁니다.';
    return {
      habits,
      slots,
      summary: '계속 ' + n + '개 · 쉬기 ' + (all.length - n) + '개',
      verdict,
      cta: n === 0 ? '고른 습관이 없어요' : n + '개만 하고 시작하기',
    };
  }
}
