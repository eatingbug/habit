class Component extends DCLogic {
  constructor(props) {
    super(props);
    this.base = [
      {
        id: 'pullup', name: '턱걸이', stat: '힘', cue: '모닝커피 후', dot: 'dot g', streak: 14, floor: 5, unit: '회', today: 5,
        cells: ['done', 'over', 'done', 'partial', 'done', 'blank', 'done', 'over', 'done', 'done', 'partial', 'done', 'over']
      },
      {
        id: 'read', name: '독서', stat: '지능', cue: '점심 후 10p', dot: 'dot a', streak: 6, floor: 10, unit: 'p', today: 6,
        cells: ['done', 'partial', 'partial', 'done', 'blank', 'partial', 'done', 'done', 'partial', 'blank', 'done', 'partial', 'done']
      },
      {
        id: 'meditate', name: '명상', stat: '의지', cue: '신호 없음', dot: 'dot r', streak: 0, floor: 1, unit: '', today: 0, binary: true,
        cells: ['done', 'blank', 'done', 'blank', 'done', 'blank', 'blank', 'done', 'blank', 'done', 'blank', 'skip', 'skip']
      }
    ];
    this.state = { today: { pullup: 5, read: 6, meditate: 0 }, bumped: {}, toast: null };
  }

  log(h) {
    var s = this.state;
    var before = s.today[h.id] || 0;
    var amount = before >= h.floor ? 1 : h.floor;
    var after = before + amount;
    var today = Object.assign({}, s.today);
    today[h.id] = after;
    var bumped = Object.assign({}, s.bumped);
    var xp = before < h.floor && after >= h.floor ? 60 : 12;
    if (before < h.floor && after >= h.floor) bumped[h.id] = (bumped[h.id] || 0) + 1;
    this.setState({
      today: today,
      bumped: bumped,
      toast: { main: '기록됨 +' + amount + h.unit + ' · +' + xp + ' XP', sub: before < h.floor ? '바닥 달성 💪' : '바닥 위 강도', id: h.id, amount: amount, streak: before < h.floor }
    });
  }

  undo() {
    var s = this.state;
    var t = s.toast;
    if (!t) return;
    var today = Object.assign({}, s.today);
    today[t.id] = Math.max(0, (today[t.id] || 0) - t.amount);
    var bumped = Object.assign({}, s.bumped);
    if (t.streak) bumped[t.id] = Math.max(0, (bumped[t.id] || 0) - 1);
    this.setState({ today: today, bumped: bumped, toast: null });
  }

  renderVals() {
    var self = this;
    var rows = this.base.map(function (h) {
      var sum = self.state.today[h.id] || 0;
      var state = sum === 0 ? 'blank' : sum >= h.floor ? 'done' : 'partial';
      var cells = h.cells.concat([state]).map(function (c) { return { cls: 'cell ' + c }; });
      return {
        name: h.name, stat: h.stat, cue: h.cue, dot: h.dot,
        cueStyle: h.cue === '신호 없음' ? 'color:var(--crit)' : '',
        streak: h.streak + (self.state.bumped[h.id] || 0),
        cells: cells,
        cta: h.binary ? (sum >= h.floor ? '✓ 완료됨' : '✓ 완료') : sum >= h.floor ? '+1 더' : '+최소',
        log: function () { self.log(h); }
      };
    });
    var t = this.state.toast;
    var extra = (this.state.bumped.pullup || 0) * 8;
    var extraInt = (this.state.bumped.read || 0) * 8;
    var extraWil = (this.state.bumped.meditate || 0) * 8;
    return {
      rows: rows,
      strBar: 'width:' + Math.min(100, 64 + extra) + '%',
      intBar: 'width:' + Math.min(100, 38 + extraInt) + '%',
      wilBar: 'width:' + Math.min(100, 81 + extraWil) + '%',
      strTo: '다음까지 ' + Math.max(0, 320 - extra * 10) + ' XP',
      intTo: '다음까지 ' + Math.max(0, 740 - extraInt * 10) + ' XP',
      wilTo: '다음까지 ' + Math.max(0, 150 - extraWil * 10) + ' XP',
      hasToast: !!t,
      toastMain: t ? t.main : '',
      toastSub: t ? t.sub : '',
      undo: function () { self.undo(); }
    };
  }
}
