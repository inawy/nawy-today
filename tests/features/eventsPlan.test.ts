// @vitest-environment node
import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { expandEvents } from '@/core/recurrence';
import type { NewEvent } from '@/data';
import { planDelete, planEdit } from '@/features/events/plan';
import type { Plan, Scope, Target } from '@/features/events/plan';
import { counterIds } from '../helpers/factories';
import { testStore } from '../helpers/db';

const base = (over: Partial<NewEvent> = {}): NewEvent => ({
  calendarId: 'id-1',
  title: 'Standup',
  allDay: false,
  start: '2026-10-13T09:00',
  end: '2026-10-13T09:30',
  tzid: 'Asia/Riyadh',
  ...over,
});

async function setup(rrule: string | undefined = 'FREQ=DAILY;COUNT=10') {
  const ctx = testStore();
  await ctx.store.createCalendar({ name: 'Personal', color: 'blue' });
  const master = await ctx.store.createEvent(base(rrule === undefined ? {} : { rrule }));
  const newId = counterIds('new');

  async function target(originalStart: string | undefined, id = master.id): Promise<Target> {
    const all = await ctx.store.listEvents();
    const m = all.find((e) => e.id === id);
    if (!m) throw new Error('master missing');
    const overrides = all.filter((e) => e.seriesId === id);
    const override = overrides.find((o) => o.originalStart === originalStart);
    return {
      master: m,
      overrides,
      ...(override && { override }),
      ...(originalStart && { originalStart }),
    };
  }

  async function apply(plan: Plan) {
    if (!plan.ok) throw new Error(`plan failed: ${plan.error}`);
    const res = await ctx.store.applyOps(plan.ops);
    if (res.status !== 'ok') throw new Error(`apply failed: ${res.status}`);
    ctx.clock.advance(10);
    return res;
  }

  async function shown(from = '2026-10-01', to = '2026-12-31') {
    const all = await ctx.store.listEvents();
    return expandEvents(all, from, to).occurrences.map((o) => `${o.start} ${o.event.title}`);
  }

  const edit = async (originalStart: string | undefined, scope: Scope, fields: NewEvent) =>
    planEdit(await target(originalStart), scope, fields, newId);
  const remove = async (originalStart: string | undefined, scope: Scope) =>
    planDelete(await target(originalStart), scope);

  return { ...ctx, master, target, apply, shown, edit, remove };
}

describe('planEdit: this event', () => {
  it('creates an override for one occurrence and leaves the rest alone', async () => {
    const t = await setup();
    await t.apply(
      await t.edit(
        '2026-10-15T09:00',
        'this',
        base({ title: 'Moved', start: '2026-10-15T14:00', end: '2026-10-15T14:30' }),
      ),
    );
    const list = await t.shown('2026-10-14', '2026-10-17');
    expect(list).toEqual([
      '2026-10-14T09:00 Standup',
      '2026-10-15T14:00 Moved',
      '2026-10-16T09:00 Standup',
    ]);
    expect((await t.store.listEvents()).find((e) => e.id === t.master.id)?.rrule).toBe(
      'FREQ=DAILY;COUNT=10',
    );
  });

  it('edits the existing override instead of creating a second one', async () => {
    const t = await setup();
    await t.apply(
      await t.edit(
        '2026-10-15T09:00',
        'this',
        base({ title: 'One', start: '2026-10-15T09:00', end: '2026-10-15T09:30' }),
      ),
    );
    await t.apply(
      await t.edit(
        '2026-10-15T09:00',
        'this',
        base({ title: 'Two', start: '2026-10-15T09:00', end: '2026-10-15T09:30' }),
      ),
    );
    const events = await t.store.listEvents();
    expect(events.filter((e) => e.seriesId === t.master.id)).toHaveLength(1);
    expect(await t.shown('2026-10-15', '2026-10-16')).toEqual(['2026-10-15T09:00 Two']);
  });
});

describe('planEdit: all events', () => {
  it('a content change keeps exceptions', async () => {
    const t = await setup();
    await t.apply(await t.remove('2026-10-14T09:00', 'this'));
    await t.apply(
      await t.edit(
        '2026-10-15T09:00',
        'this',
        base({ title: 'Special', start: '2026-10-15T09:00', end: '2026-10-15T09:30' }),
      ),
    );
    await t.apply(
      await t.edit(
        '2026-10-16T09:00',
        'all',
        base({
          title: 'Renamed',
          start: '2026-10-16T09:00',
          end: '2026-10-16T09:30',
          rrule: 'FREQ=DAILY;COUNT=10',
        }),
      ),
    );
    expect(await t.shown('2026-10-13', '2026-10-17')).toEqual([
      '2026-10-13T09:00 Renamed',
      '2026-10-15T09:00 Special',
      '2026-10-16T09:00 Renamed',
    ]);
  });

  it('a time change from any occurrence moves the whole series, and drops exceptions', async () => {
    const t = await setup();
    await t.apply(await t.remove('2026-10-14T09:00', 'this'));
    await t.apply(
      await t.edit(
        '2026-10-16T09:00',
        'all',
        base({ start: '2026-10-16T10:00', end: '2026-10-16T10:45', rrule: 'FREQ=DAILY;COUNT=10' }),
      ),
    );
    expect(await t.shown('2026-10-13', '2026-10-16')).toEqual([
      '2026-10-13T10:00 Standup',
      '2026-10-14T10:00 Standup',
      '2026-10-15T10:00 Standup',
    ]);
    const master = (await t.store.listEvents()).find((e) => e.id === t.master.id);
    expect(master?.end).toBe('2026-10-13T10:45');
    expect(master?.exdates).toBeUndefined();
  });

  it('refuses a new first date that does not satisfy the rule', async () => {
    const t = await setup('FREQ=WEEKLY;BYDAY=TU');
    const plan = await t.edit(
      '2026-10-13T09:00',
      'all',
      base({ start: '2026-10-14T09:00', end: '2026-10-14T09:30', rrule: 'FREQ=WEEKLY;BYDAY=TU' }),
    );
    expect(plan).toEqual({ ok: false, error: 'start-not-in-rule' });
  });

  it('removing the repeat turns the series into one event', async () => {
    const t = await setup();
    await t.apply(await t.edit('2026-10-13T09:00', 'all', base()));
    expect(await t.shown('2026-10-01', '2026-12-31')).toEqual(['2026-10-13T09:00 Standup']);
  });

  it('refuses a stale edit instead of overwriting another tab', async () => {
    const t = await setup();
    const plan = await t.edit(
      '2026-10-13T09:00',
      'all',
      base({ title: 'Mine', rrule: 'FREQ=DAILY;COUNT=10' }),
    );
    await t.store.updateEvent(t.master.id, { title: 'Other tab' });
    if (!plan.ok) throw new Error('plan');
    expect((await t.store.applyOps(plan.ops)).status).toBe('conflict');
    expect((await t.store.getEvent(t.master.id))?.title).toBe('Other tab');
  });
});

describe('planEdit: this and following', () => {
  it('splits the series; before is untouched, from here on is the new version', async () => {
    const t = await setup();
    await t.apply(
      await t.edit(
        '2026-10-16T09:00',
        'following',
        base({
          title: 'New plan',
          start: '2026-10-16T09:00',
          end: '2026-10-16T09:30',
          rrule: 'FREQ=DAILY;COUNT=10',
        }),
      ),
    );
    const list = await t.shown('2026-10-13', '2026-10-30');
    expect(list.slice(0, 3)).toEqual([
      '2026-10-13T09:00 Standup',
      '2026-10-14T09:00 Standup',
      '2026-10-15T09:00 Standup',
    ]);
    expect(list[3]).toBe('2026-10-16T09:00 New plan');
    // COUNT=10 originally: 3 before + 7 after = the same ten occurrences in total.
    expect(list).toHaveLength(10);
  });

  it('can change the time from here on only', async () => {
    const t = await setup();
    await t.apply(
      await t.edit(
        '2026-10-16T09:00',
        'following',
        base({ start: '2026-10-16T11:00', end: '2026-10-16T11:30', rrule: 'FREQ=DAILY;COUNT=10' }),
      ),
    );
    expect(await t.shown('2026-10-15', '2026-10-18')).toEqual([
      '2026-10-15T09:00 Standup',
      '2026-10-16T11:00 Standup',
      '2026-10-17T11:00 Standup',
    ]);
  });

  it('moves later exceptions to the new series when its schedule is unchanged', async () => {
    const t = await setup();
    await t.apply(await t.remove('2026-10-18T09:00', 'this'));
    await t.apply(
      await t.edit(
        '2026-10-19T09:00',
        'this',
        base({ title: 'Special', start: '2026-10-19T09:00', end: '2026-10-19T09:30' }),
      ),
    );
    await t.apply(
      await t.edit(
        '2026-10-16T09:00',
        'following',
        base({
          title: 'Renamed',
          start: '2026-10-16T09:00',
          end: '2026-10-16T09:30',
          rrule: 'FREQ=DAILY;COUNT=10',
        }),
      ),
    );
    const list = await t.shown('2026-10-16', '2026-10-21');
    expect(list).toEqual([
      '2026-10-16T09:00 Renamed',
      '2026-10-17T09:00 Renamed',
      '2026-10-19T09:00 Special',
      '2026-10-20T09:00 Renamed',
    ]);
  });

  it('drops later exceptions when the new series has a different schedule', async () => {
    const t = await setup();
    await t.apply(
      await t.edit(
        '2026-10-19T09:00',
        'this',
        base({ title: 'Special', start: '2026-10-19T09:00', end: '2026-10-19T09:30' }),
      ),
    );
    await t.apply(
      await t.edit(
        '2026-10-16T09:00',
        'following',
        base({ start: '2026-10-16T11:00', end: '2026-10-16T11:30', rrule: 'FREQ=DAILY;COUNT=10' }),
      ),
    );
    expect(await t.shown('2026-10-19', '2026-10-20')).toEqual(['2026-10-19T11:00 Standup']);
  });

  it('at the first occurrence it is the same as editing all', async () => {
    const t = await setup();
    await t.apply(
      await t.edit(
        '2026-10-13T09:00',
        'following',
        base({ title: 'Everything', rrule: 'FREQ=DAILY;COUNT=10' }),
      ),
    );
    expect((await t.store.listEvents()).filter((e) => e.rrule !== undefined)).toHaveLength(1);
    expect((await t.shown('2026-10-13', '2026-10-14'))[0]).toBe('2026-10-13T09:00 Everything');
  });

  it('can change the repeat rule from here on', async () => {
    const t = await setup('FREQ=DAILY');
    await t.apply(
      await t.edit(
        '2026-10-20T09:00',
        'following',
        base({ start: '2026-10-20T09:00', end: '2026-10-20T09:30', rrule: 'FREQ=WEEKLY;BYDAY=TU' }),
      ),
    );
    expect(await t.shown('2026-10-19', '2026-11-04')).toEqual([
      '2026-10-19T09:00 Standup',
      '2026-10-20T09:00 Standup',
      '2026-10-27T09:00 Standup',
      '2026-11-03T09:00 Standup',
    ]);
  });
});

describe('planDelete', () => {
  it('this event: hides one occurrence and its override', async () => {
    const t = await setup();
    await t.apply(
      await t.edit(
        '2026-10-15T09:00',
        'this',
        base({ title: 'Special', start: '2026-10-15T09:00', end: '2026-10-15T09:30' }),
      ),
    );
    await t.apply(await t.remove('2026-10-15T09:00', 'this'));
    expect(await t.shown('2026-10-14', '2026-10-17')).toEqual([
      '2026-10-14T09:00 Standup',
      '2026-10-16T09:00 Standup',
    ]);
  });

  it('this and following: ends the series before this occurrence', async () => {
    const t = await setup();
    await t.apply(await t.remove('2026-10-16T09:00', 'following'));
    expect(await t.shown('2026-10-01', '2026-12-31')).toHaveLength(3);
  });

  it('this and following from the first occurrence deletes everything', async () => {
    const t = await setup();
    await t.apply(await t.remove('2026-10-13T09:00', 'following'));
    expect(await t.store.listEvents()).toEqual([]);
  });

  it('all events: deletes the series and its overrides', async () => {
    const t = await setup();
    await t.apply(
      await t.edit(
        '2026-10-15T09:00',
        'this',
        base({ title: 'Special', start: '2026-10-15T09:00', end: '2026-10-15T09:30' }),
      ),
    );
    await t.apply(await t.remove('2026-10-14T09:00', 'all'));
    expect(await t.store.listEvents()).toEqual([]);
  });

  it('a plain event is just deleted', async () => {
    const t = await setup(undefined);
    await t.apply(await t.remove(undefined, 'all'));
    expect(await t.store.listEvents()).toEqual([]);
  });

  it('every kind of delete can be undone exactly', async () => {
    for (const scope of ['this', 'following', 'all'] as const) {
      const t = await setup();
      await t.apply(
        await t.edit(
          '2026-10-18T09:00',
          'this',
          base({ title: 'Special', start: '2026-10-18T09:00', end: '2026-10-18T09:30' }),
        ),
      );
      const before = await t.shown();
      const res = await t.apply(await t.remove('2026-10-16T09:00', scope));
      expect(await t.shown()).not.toEqual(before);
      await t.store.undo(res.undo);
      expect(await t.shown()).toEqual(before);
    }
  });
});
