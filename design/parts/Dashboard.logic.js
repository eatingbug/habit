class Component extends DCLogic {
  constructor(props) {
    super(props);
    this.base = [
      {
        id: 'pullup', name: '턱걸이', stat: '힘', cue: '아침 커피 뒤', dot: 'dot g', streak: 12, floor: 5, unit: '회', today: 5,
        cells: ['done', 'over', 'done', 'partial', 'done', 'done', 'done', 'over', 'done', 'done', 'partial', 'done', 'over']
      },
      {
        id: 'read', name: '독서', stat: '지능', cue: '점심 먹고 10쪽', dot: 'dot a', streak: 4, floor: 10, unit: 'p', today: 6,
        cells: ['done', 'partial', 'done', 'partial', 'done', 'done', 'missed', 'partial', 'done', 'done', 'done', 'partial', 'done']
      },
      {
        id: 'meditate', name: '명상', stat: '의지', cue: '언제 할지 없음', dot: 'dot r', streak: 0, floor: 1, unit: '', today: 0, binary: true,
        cells: ['done', 'missed', 'done', 'missed', 'done', 'missed', 'missed', 'done', 'missed', 'done', 'missed', 'skip', 'skip']
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
    var crossed = before < h.floor && after >= h.floor;
    var xp = crossed ? 60 : h.binary ? 0 : 12;
    if (crossed) bumped[h.id] = (bumped[h.id] || 0) + 1;
    this.setState({
      today: today,
      bumped: bumped,
      toast: { main: xp > 0 ? '기록됨 +' + amount + h.unit + ' · +' + xp + ' XP' : '이미 오늘 몫은 끝났어요', sub: crossed ? '최소만큼 했어요 💪' : h.binary ? 'XP는 하루 한 번만' : '최소보다 더 했어요', id: h.id, amount: amount, streak: crossed, xp: xp }
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
      var state = sum === 0 ? 'pending' : sum >= h.floor ? 'done' : 'partial';
      var cells = h.cells.concat([state]).map(function (c) { return { cls: 'cell ' + c }; });
      return {
        name: h.name, stat: h.stat, cue: h.cue, dot: h.dot,
        cueStyle: h.cue === '언제 할지 없음' ? 'color:var(--crit)' : '',
        streak: h.streak + (self.state.bumped[h.id] || 0),
        cells: cells,
        cta: h.binary ? (sum >= h.floor ? '✓ 했어요' : '✓ 완료') : sum >= h.floor ? '+1 더' : '최소만큼',
        log: function () { self.log(h); }
      };
    });
    var t = this.state.toast;
    var bar = function (remaining, span, gained) {
      var left = Math.max(0, remaining - gained * 60);
      return { w: 'width:' + Math.round(((span - left) / span) * 100) + '%', to: '다음 레벨까지 ' + left + ' XP' };
    };
    var st = bar(320, 900, this.state.bumped.pullup || 0);
    var it = bar(740, 1200, this.state.bumped.read || 0);
    var wt = bar(150, 800, this.state.bumped.meditate || 0);
    return {
      rows: rows,
      strBar: st.w, intBar: it.w, wilBar: wt.w,
      strTo: st.to, intTo: it.to, wilTo: wt.to,
      hasToast: !!t,
      toastMain: t ? t.main : '',
      toastSub: t ? t.sub : '',
      undo: function () { self.undo(); }
    };
  }
}
