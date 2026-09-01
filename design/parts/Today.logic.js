var HABITS = {
  read: { name: '독서', unit: 'p', floor: 10, target: 15, kind: 'count', last: 6 },
  pullup: { name: '턱걸이', unit: '회', floor: 5, target: 10, kind: 'count', last: 5 },
  meditate: { name: '명상', kind: 'binary', floor: 1 }
};

class Component extends DCLogic {
  constructor(props) {
    super(props);
    this.state = {
      target: 'read',
      freeType: '기분',
      day: { read: 6, pullup: 5, meditate: 0 },
      xp: 180,
      minutes: 860,
      saved: false,
      toast: null,
      feed: [
        { id: 1, t: '09:40', name: '독서', amt: '+6p', acls: 'amt', reward: '', rcls: 'rewardtag', wrap: 'feeditem' },
        { id: 2, t: '08:25', name: '🌤 기분', amt: '', acls: 'amt plain', reward: '아침 공기가 좋았다. 컨디션 맑음.', rcls: 'fnote', wrap: 'feeditem freelog' },
        { id: 3, t: '07:10', name: '턱걸이', amt: '+5회', acls: 'amt', reward: '→ 5/5 달성 · +60 XP', rcls: 'rewardtag', wrap: 'feeditem' }
      ]
    };
  }

  clockText() {
    var m = this.state.minutes;
    var h = Math.floor(m / 60) % 24;
    var mm = m % 60;
    return (h < 10 ? '0' : '') + h + ':' + (mm < 10 ? '0' : '') + mm;
  }

  push(item, dayDelta, key, xpDelta) {
    var s = this.state;
    var day = Object.assign({}, s.day);
    if (key) day[key] = (day[key] || 0) + dayDelta;
    this.setState({
      minutes: s.minutes + 7,
      day: day,
      xp: s.xp + xpDelta,
      feed: [item].concat(s.feed),
      toast: { main: item.toastMain, sub: item.toastSub, id: item.id, key: key, amount: dayDelta, xp: xpDelta }
    });
  }

  logAmount(id, amount) {
    var h = HABITS[id];
    var before = this.state.day[id] || 0;
    var after = before + amount;
    var xp = 0;
    var main, sub, reward;
    if (after >= h.floor && before < h.floor) {
      xp = 60;
      main = '기록됨 · +60 XP';
      sub = '바닥 달성 💪';
      reward = '→ ' + after + '/' + h.floor + ' 달성 · +60 XP';
    } else if (h.target && after >= h.target && before < h.target) {
      xp = 90;
      main = '기록됨 · +90 XP';
      sub = '목표 초과 🎯';
      reward = '→ 목표 ' + h.target + ' 초과 · +90 XP';
    } else if (after >= h.floor) {
      xp = 12;
      main = '기록됨 · +12 XP';
      sub = '바닥 위 강도';
      reward = '→ 합 ' + after + ' · +12 XP';
    } else {
      xp = 0;
      main = '기록됨 · XP 없음';
      sub = '나타남 (showed up)';
      reward = '→ ' + after + '/' + h.floor + ' 부분 · 나타남 스트릭 +1';
    }
    var unit = h.unit || '';
    this.push(
      {
        id: Date.now(),
        t: this.clockText(),
        name: h.name,
        amt: '+' + amount + unit,
        acls: after >= h.floor ? 'amt' : 'amt warn',
        reward: reward,
        rcls: after >= h.floor ? 'rewardtag' : 'rewardtag warn',
        wrap: 'feeditem',
        toastMain: main,
        toastSub: sub
      },
      amount,
      id,
      xp
    );
  }

  logSkip(id, reason) {
    var h = HABITS[id];
    this.push(
      {
        id: Date.now(),
        t: this.clockText(),
        name: h.name,
        amt: '건너뜀',
        acls: 'amt plain',
        reward: '사유: ' + reason + ' → 진단 성분으로 집계',
        rcls: 'backnote',
        wrap: 'feeditem',
        toastMain: '건너뜀 기록됨',
        toastSub: reason
      },
      0,
      null,
      0
    );
  }

  undo() {
    var s = this.state;
    var t = s.toast;
    if (!t) return;
    var day = Object.assign({}, s.day);
    if (t.key) day[t.key] = Math.max(0, (day[t.key] || 0) - t.amount);
    this.setState({
      day: day,
      xp: Math.max(0, s.xp - t.xp),
      feed: s.feed.filter(function (f) { return f.id !== t.id; }),
      toast: null
    });
  }

  renderVals() {
    var self = this;
    var target = this.state.target;
    var h = HABITS[target];
    var isFree = target === 'free';
    var isCount = !isFree && h.kind === 'count';
    var isBinary = !isFree && h.kind === 'binary';
    var sum = isFree ? 0 : this.state.day[target] || 0;

    var tabs = [{ id: 'free', label: '자유 로그' }, { id: 'read', label: '독서' }, { id: 'pullup', label: '턱걸이' }, { id: 'meditate', label: '명상' }].map(function (t) {
      return { label: t.label, on: t.id === target, pick: function () { self.setState({ target: t.id }); } };
    });

    var quick = [];
    if (isCount) {
      quick = [
        { label: '+1', amount: 1 },
        { label: '+최소', amount: h.floor },
        { label: '직전 ' + h.last, amount: h.last }
      ].map(function (q) {
        return { label: q.label, go: function () { self.logAmount(target, q.amount); } };
      });
    }

    var skips = [
      { label: '깜빡함', reason: '깜빡함 → 신호' },
      { label: '너무 힘듦', reason: '너무 힘듦 → 바닥' },
      { label: '예외', reason: '예외 — 미스 제외' }
    ].map(function (s) {
      return { label: s.label, go: function () { self.logSkip(target, s.reason); } };
    });

    var freeTypes = ['메모', '성취', '기분', '아이디어'].map(function (f) {
      return {
        label: f,
        cls: f === self.state.freeType ? 'btn sel' : 'btn',
        pick: function () { self.setState({ freeType: f }); }
      };
    });

    var pct = isCount ? Math.min(100, Math.round((sum / h.floor) * 100)) : 0;
    var done = Object.keys(HABITS).filter(function (k) { return (self.state.day[k] || 0) >= HABITS[k].floor; }).length;
    var toast = this.state.toast;

    return {
      tally: '퀘스트 ' + done + '/3',
      xpToday: '+' + this.state.xp + ' XP',
      showSave: !this.state.saved && (this.state.day.meditate || 0) < 1,
      saveNow: function () { self.setState({ target: 'meditate' }); self.logAmount('meditate', 1); self.setState({ saved: true }); },
      tabs: tabs,
      isCount: isCount,
      isBinary: isBinary,
      isFree: isFree,
      isHabit: !isFree,
      unit: isCount ? h.unit : '',
      staged: isCount ? h.floor : 1,
      floorLabel: isCount ? '✓ 최소 실행 (+' + h.floor + (h.unit || '') + ')' : '✓ 완료 표시',
      binaryNote: '채울 양이 없습니다 — 한 번의 완료가 곧 바닥입니다.',
      logFloor: function () { self.logAmount(target, isCount ? h.floor : 1); },
      quick: quick,
      skips: skips,
      freeTypes: freeTypes,
      logFree: function () {
        self.push(
          {
            id: Date.now(),
            t: self.clockText(),
            name: self.state.freeType,
            amt: '자유 로그',
            acls: 'amt plain',
            reward: 'XP·스탯·스트릭에 영향 없음',
            rcls: 'fnote',
            wrap: 'feeditem freelog',
            toastMain: '자유 로그 기록됨',
            toastSub: 'XP 없음'
          },
          0,
          null,
          0
        );
      },
      progLeft: isCount ? '오늘 ' + sum + ' / ' + h.floor + h.unit : '',
      progRight: isCount ? (sum >= h.floor ? '달성 ✓ · 목표 ' + h.target + '까지 ' + Math.max(0, h.target - sum) : h.floor - sum + h.unit + ' 남음 → 달성') : '',
      progStyle: 'width:' + pct + '%',
      clock: this.clockText(),
      hasToast: !!toast,
      toastMain: toast ? toast.main : '',
      toastSub: toast ? toast.sub : '',
      undo: function () { self.undo(); },
      feed: this.state.feed
    };
  }
}
