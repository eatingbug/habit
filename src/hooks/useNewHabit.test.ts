import { act, renderHook } from '@testing-library/react-native';
import { createElement, type ComponentProps, type ReactNode } from 'react';

import { RepositoryProvider } from '@/context/RepositoryContext';
import { LocalRepository, MemoryKV, type HabitRepository } from '@/data';

import { useNewHabit } from './useNewHabit';

/**
 * The hook seam (jest.config.js): a real `LocalRepository` over `MemoryKV`. What the
 * form saves is read back through the repository, as the next screen would read it.
 */

function wrapperFor(repository: HabitRepository) {
  return function Wrapper({ children }: { children: ReactNode }) {
    // `children` goes in as the third argument; the cast covers the prop it fills at runtime.
    const props = { repository } as ComponentProps<typeof RepositoryProvider>;
    return createElement(RepositoryProvider, props, children);
  };
}

function form(repository: HabitRepository = new LocalRepository(new MemoryKV())) {
  const { result } = renderHook(() => useNewHabit(), { wrapper: wrapperFor(repository) });
  return { result, repository };
}

/** Fills the required count fields so a submit can pass. */
function fillRequired(result: ReturnType<typeof form>['result']) {
  act(() => {
    result.current.setName('턱걸이');
    result.current.setFloor('5');
    result.current.setFloorUnit('회');
  });
}

async function submit(result: ReturnType<typeof form>['result']): Promise<boolean> {
  let saved = false;
  await act(async () => {
    saved = await result.current.submit();
  });
  return saved;
}

describe('useNewHabit — 능력치', () => {
  it('saves the default stat when the user never picks one', async () => {
    const { result, repository } = form();
    fillRequired(result);

    expect(await submit(result)).toBe(true);

    const [habit] = await repository.getHabits();
    expect(habit).toMatchObject({
      name: '턱걸이',
      statId: 'strength',
      kind: 'count',
      floor: 5,
      floorUnit: '회',
      lifecycle: 'forming',
    });
  });
});

describe('useNewHabit — 측정 방식', () => {
  it('hides 최소량 and 목표 for 예 · 아니오 and shows them again for 횟수 · 양', () => {
    const { result } = form();

    expect(result.current.showAmounts).toBe(true);
    act(() => result.current.setKind('binary'));
    expect(result.current.showAmounts).toBe(false);
    act(() => result.current.setKind('count'));
    expect(result.current.showAmounts).toBe(true);
  });

  it('saves a yes/no habit with floor 1 and no target, even after amounts were typed', async () => {
    const { result, repository } = form();
    act(() => {
      result.current.setName('명상');
      result.current.setFloor('5');
      result.current.setFloorUnit('분');
      result.current.setTarget('10');
      result.current.setKind('binary');
    });

    expect(await submit(result)).toBe(true);

    const [habit] = await repository.getHabits();
    expect(habit).toMatchObject({ name: '명상', kind: 'binary', floor: 1, floorUnit: 'time' });
    expect(habit).not.toHaveProperty('target');
  });

  it("names the target's unit after the floor's unit", () => {
    const { result } = form();

    expect(result.current.targetUnit).toBe('');
    act(() => result.current.setFloorUnit(' 쪽 '));
    expect(result.current.targetUnit).toBe('쪽');
  });
});

describe('useNewHabit — 검사와 저장', () => {
  it('saves trimmed optional fields and leaves empty ones absent', async () => {
    const { result, repository } = form();
    fillRequired(result);
    act(() => {
      result.current.setTarget('10');
      result.current.setCue('  아침 커피 마신 뒤 ');
      result.current.setIdentity('   ');
    });

    expect(await submit(result)).toBe(true);

    const [habit] = await repository.getHabits();
    expect(habit).toMatchObject({ target: 10, cue: '아침 커피 마신 뒤' });
    expect(habit).not.toHaveProperty('identity');
  });

  it('says what is missing and saves nothing', async () => {
    const { result, repository } = form();

    expect(await submit(result)).toBe(false);

    expect(result.current.errors).toEqual({
      name: '이름을 적어 주세요.',
      floor: '최소량은 1 이상의 숫자로 적어 주세요.',
      floorUnit: '단위를 적어 주세요 (예: 회, 쪽, 분).',
    });
    expect(await repository.getHabits()).toEqual([]);
  });

  it('rejects a target at or below the floor', async () => {
    const { result } = form();
    fillRequired(result);
    act(() => result.current.setTarget('5'));

    expect(await submit(result)).toBe(false);

    expect(result.current.errors).toEqual({ target: '목표는 최소량보다 커야 해요.' });
  });

  it('clears a field error once that field changes', async () => {
    const { result } = form();
    await submit(result);

    act(() => result.current.setName('턱걸이'));

    expect(result.current.errors.name).toBeUndefined();
    expect(result.current.errors.floor).toBeDefined();
  });

  it('reports a failed save with the shared copy and keeps the form', async () => {
    const { result, repository } = form();
    jest.spyOn(repository, 'upsertHabit').mockRejectedValueOnce(new Error('offline'));
    fillRequired(result);

    expect(await submit(result)).toBe(false);

    expect(result.current.saveError).toBe(
      '저장하지 못했어요. 연결을 확인하고 다시 시도해 주세요.',
    );
    expect(result.current.name).toBe('턱걸이');
    expect(result.current.saving).toBe(false);
  });
});

describe('useNewHabit — 습관 아이콘', () => {
  it("shows the stat's icon until an icon is picked, and follows the stat", () => {
    const { result } = form();

    expect(result.current.icon).toBe('💪');
    act(() => result.current.pickStat('willpower'));
    expect(result.current.icon).toBe('🧘');

    act(() => result.current.pickIcon('🏃'));
    expect(result.current.icon).toBe('🏃');
    act(() => result.current.pickStat('intelligence'));
    expect(result.current.icon).toBe('🏃');
  });

  it('marks the picked icon among the options', () => {
    const { result } = form();

    expect(result.current.iconOptions.some((option) => option.selected)).toBe(false);
    act(() => result.current.pickIcon('🏃'));

    expect(result.current.iconOptions.filter((option) => option.selected)).toEqual([
      { icon: '🏃', selected: true },
    ]);
  });

  it('keeps a picked icon on the saved habit', async () => {
    const { result, repository } = form();
    fillRequired(result);
    act(() => result.current.pickIcon('🏃'));

    expect(await submit(result)).toBe(true);

    const [habit] = await repository.getHabits();
    expect(habit.icon).toBe('🏃');
  });

  it('saves no icon when none is picked, or when the pick is cleared', async () => {
    const { result, repository } = form();
    fillRequired(result);
    act(() => result.current.pickIcon('🏃'));
    act(() => result.current.pickIcon(undefined));

    expect(await submit(result)).toBe(true);

    const [habit] = await repository.getHabits();
    expect(habit).not.toHaveProperty('icon');
  });
});

describe('useNewHabit — 화면 문구 (§6.6, §6.8)', () => {
  it('fixes the `?` copy of 측정 방식, 언제, 어떻게, 능력치 and 이유 to the §6.8 table', () => {
    const { result } = form();

    expect(result.current.tooltips).toMatchObject({
      kind: '횟수 · 양은 한 만큼 적고, 최소량을 채우면 그날 몫을 해요. 예 · 아니오는 했는지만 보고, 이어 간 날이 쌓이면 별을 더 받아요.',
      cue: '습관을 시작할 시점이나 직전 행동이에요. 예: 아침 식사 후.',
      method: '습관을 실행하는 구체적인 방법이에요. 예: 책상에서 종이책을 펼쳐 읽기.',
      stat: '이 습관으로 받은 별이 쌓이는 갈래예요. 가장 높은 능력치 레벨이 캐릭터 레벨이 돼요.',
      identity: '어떤 사람이 되고 싶어서 하는지 적어요. 내키지 않는 날 다시 꺼내 보면 이어 가기 쉬워요.',
    });
  });

  it('gives 최소량 and 목표 their form tooltips', () => {
    const { result } = form();

    expect(result.current.tooltips.floor).toBe(
      '아무리 바빠도 할 수 있는 양이에요. 이만큼 하면 그날 몫을 한 거예요.',
    );
    expect(result.current.tooltips.target).toBe(
      '최소량보다 큰 선택 목표예요. 넘기면 별을 더 받지만 안 해도 괜찮아요.',
    );
  });

  it('keeps one 측정 방식 tooltip whatever the selection', () => {
    const { result } = form();
    const before = result.current.tooltips.kind;

    act(() => result.current.setKind('binary'));

    expect(result.current.tooltips.kind).toBe(before);
  });

  it('names the screen and its fields in order, and marks the optional ones', () => {
    const { result } = form();

    expect(result.current.copy.title).toBe('습관 만들기');
    expect(result.current.copy.subtitle).toBe('나중에 언제든 고칠 수 있어요');
    expect(Object.entries(result.current.copy.labels)).toEqual([
      ['name', '이름'],
      ['kind', '측정 방식'],
      ['floor', '최소량'],
      ['target', '목표'],
      ['cue', '언제'],
      ['method', '어떻게'],
      ['stat', '능력치'],
      ['identity', '이유'],
    ]);
    expect(result.current.copy.optional).toBe('· 선택');
    expect(result.current.copy.submit).toBe('습관 만들기');
  });

  it('offers 횟수 · 양 and 예 · 아니오, and the three stats with the first picked', () => {
    const { result } = form();

    expect(result.current.kindOptions).toEqual([
      { value: 'count', label: '횟수 · 양' },
      { value: 'binary', label: '예 · 아니오' },
    ]);
    expect(result.current.statOptions).toEqual([
      { id: 'strength', label: '💪 힘', selected: true },
      { id: 'intelligence', label: '📖 지능', selected: false },
      { id: 'willpower', label: '🧘 의지', selected: false },
    ]);
  });
});

it('saves when and how independently, trimming both optional fields', async () => {
  const { result, repository } = form();
  fillRequired(result);
  act(() => {
    result.current.setCue('  아침 식사 후  ');
    result.current.setMethod('  책상에서 종이책 읽기  ');
  });
  expect(await submit(result)).toBe(true);
  const [saved] = await repository.getHabits();
  expect(saved).toMatchObject({ cue: '아침 식사 후', method: '책상에서 종이책 읽기', floor: 5 });
});
