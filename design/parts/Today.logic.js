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
    var crossedFloor = before < h.floor && after >= h.floor;
    var crossedTarget = h.target && before < h.target && after >= h.target;
    var xp = 0;
    var main, sub, reward;
    if (crossedFloor) xp += 60;
    if (crossedTarget) xp += 60;
    if (!crossedFloor && after >= h.floor) xp += 12;
    if (after < h.floor) {
      main = '기록했어요 · XP 없음';
      sub = '오늘 나타났어요';
      reward = '→ ' + after + '/' + h.floor + ' · 최소엔 못 미쳤지만 “나타남” 하루 추가';
    } else {
      main = '기록했어요 · +' + xp + ' XP';
      sub = crossedTarget ? '목표까지 넘었어요 🎯' : crossedFloor ? '최소만큼 했어요 💪' : '최소보다 더 했어요';
      reward = crossedTarget
        ? '→ 합 ' + after + ' · 목표 ' + h.target + ' 넘음 · +' + xp + ' XP'
        : crossedFloor
        ? '→ ' + after + '/' + h.floor + ' 오늘 몫 완료 · +' + xp + ' XP'
        : '→ 합 ' + after + ' · +' + xp + ' XP';
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
        reward: reason,
        rcls: 'backnote',
        wrap: 'feeditem',
        toastMain: '못 한 날로 기록했어요',
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
      saved: t.key === 'meditate' ? false : s.saved,
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

    var tabs = [{ id: 'free', label: '오늘 일기' }, { id: 'read', label: '독서' }, { id: 'pullup', label: '턱걸이' }, { id: 'meditate', label: '명상' }].map(function (t) {
      return { label: t.label, on: t.id === target, pick: function () { self.setState({ target: t.id }); } };
    });

    var quick = [];
    if (isCount) {
      quick = [
        { label: '+1', amount: 1 },
        { label: '최소만큼', amount: h.floor },
        { label: '지난번 ' + h.last, amount: h.last }
      ].map(function (q) {
        return { label: q.label, go: function () { self.logAmount(target, q.amount); } };
      });
    }

    var skips = [
      { label: '깜빡함', reason: '깜빡함 — 할 시간이 안 정해짐' },
      { label: '너무 힘듦', reason: '너무 힘듦 — 최소량이 많음' },
      { label: '예외', reason: '예외 — 실패로 안 셈' }
    ].map(function (s) {
      return { label: s.label, go: function () { self.logSkip(target, s.reason); } };
    });

    var freeTypes = ['메모', '잘한 일', '기분', '떠오른 생각'].map(function (f) {
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
      tally: '오늘 ' + done + '/3',
      xpToday: '+' + this.state.xp + ' XP',
      showSave: !this.state.saved && (this.state.day.meditate || 0) < 1,
      saveNow: function () { self.logAmount('meditate', 1); self.setState({ target: 'meditate', saved: true }); },
      tabs: tabs,
      isCount: isCount,
      isBinary: isBinary,
      isFree: isFree,
      isHabit: !isFree,
      unit: isCount ? h.unit : '',
      staged: isCount ? h.floor : 1,
      floorLabel: isCount ? '✓ 최소만큼 했어요 (+' + h.floor + (h.unit || '') + ')' : '✓ 오늘 했어요',
      binaryNote: '채울 양이 없는 습관이에요. 한 번 누르면 오늘 몫 끝.',
      logFloor: function () { if (isFree) return; self.logAmount(target, isCount ? h.floor : 1); },
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
            reward: '점수에는 영향 없어요',
            rcls: 'fnote',
            wrap: 'feeditem freelog',
            toastMain: '일기를 남겼어요',
            toastSub: '점수 변화 없음'
          },
          0,
          null,
          0
        );
      },
      progLeft: isCount ? '오늘 ' + sum + ' / ' + h.floor + h.unit : '',
      progRight: isCount
        ? sum >= h.target
          ? '목표 ' + h.target + h.unit + '도 넘었어요 🎯'
          : sum >= h.floor
          ? '오늘 몫 완료 ✓ · 목표까지 ' + (h.target - sum) + h.unit
          : h.floor - sum + h.unit + ' 더 하면 오늘 몫 완료'
        : '',
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
