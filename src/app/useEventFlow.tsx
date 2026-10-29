import { useCallback, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import type { CalEvent, Calendar } from '@/core/model';
import type { Occurrence } from '@/core/recurrence';
import { localTimeZone } from '@/core/time';
import type { FormatOptions, IsoWeekday, PlainDate, TimeFormatOptions } from '@/core/time';
import type { EventOp, Store, UndoToken } from '@/data';
import {
  draftForNew,
  draftFromEvent,
  describeWhen,
  draftToFields,
  moveDraft,
  resizeDraft,
  execute,
  isSeries,
  planDelete,
  planEdit,
  resolveTarget,
  ruleChanged,
  undoBatch,
} from '@/features/events';
import type { Draft, Scope, Target } from '@/features/events';
import { useT } from '@/features/i18n';
import type { MessageKey } from '@/features/i18n';
import { EventDetails } from '@/ui/editor/EventDetails';
import { EventEditor } from '@/ui/editor/EventEditor';
import { QuickAdd } from '@/ui/editor/QuickAdd';
import type { SaveOutcome } from '@/ui/editor/EventEditor';
import { ScopeDialog } from '@/ui/editor/ScopeDialog';
import { Toast } from '@/ui/editor/Toast';

/** How long "deleted — undo" stays (D-024). */
export const UNDO_MS = 5000;
const NOTICE_MS = 3000;

type Editing =
  | { readonly mode: 'new'; readonly draft: Draft; readonly id: number }
  | { readonly mode: 'edit'; readonly draft: Draft; readonly target: Target; readonly id: number };

interface ScopeAsk {
  readonly kind: 'edit' | 'delete';
  readonly allowThis: boolean;
  readonly warnReset: boolean;
  readonly resolve: (scope: Scope | null) => void;
}

interface ToastState {
  readonly id: number;
  readonly message: string;
  readonly undo?: UndoToken;
}

export interface EventFlowInput {
  readonly store: Store | undefined;
  readonly calendars: readonly Calendar[];
  readonly events: readonly CalEvent[];
  readonly fmt: FormatOptions;
  readonly hour12: boolean;
  readonly weekStart: IsoWeekday;
}

export interface EventFlow {
  /** Starts a new event on `date` (at `time` when given, otherwise 09:00; all day when asked). */
  readonly openNew: (
    date: PlainDate,
    time?: string,
    options?: { allDay?: boolean; quick?: boolean },
  ) => void;
  /** Opens the event's card (what it is, with Edit and Delete). */
  readonly showEvent: (occurrence: Occurrence) => void;
  /** Goes straight to the editor (used by search). */
  readonly openEvent: (occurrence: Occurrence) => void;
  /** Moves an occurrence by whole days / minutes (a drag). Asks the scope for repeating events. */
  readonly moveEvent: (occurrence: Occurrence, delta: { days: number; minutes: number }) => void;
  /** Moves an occurrence's end by minutes (dragging the bottom edge). */
  readonly resizeEvent: (occurrence: Occurrence, minutes: number) => void;
  /** The editor, the scope question and the toast. Render it once, anywhere. */
  readonly overlay: ReactNode;
  /** True while a dialog is open: global shortcuts must pause. */
  readonly dialogOpen: boolean;
  /** What the Back button does while a dialog is open. Resolves true when it closed. */
  readonly back: () => Promise<boolean>;
}

const newId = (): string => crypto.randomUUID();

export function useEventFlow({
  store,
  calendars,
  events,
  fmt,
  hour12,
  weekStart,
}: EventFlowInput): EventFlow {
  const t = useT();
  const [editing, setEditing] = useState<Editing | null>(null);
  const [ask, setAsk] = useState<ScopeAsk | null>(null);
  const [viewing, setViewing] = useState<Occurrence | null>(null);
  const [quick, setQuick] = useState<{ readonly id: number; readonly draft: Draft } | null>(null);
  const [toast, setToast] = useState<ToastState | null>(null);
  const counter = useRef(0);
  const closeEditorRef = useRef<(() => Promise<boolean>) | null>(null);
  const askRef = useRef<ScopeAsk | null>(null);
  askRef.current = ask;
  const viewingRef = useRef<Occurrence | null>(null);
  viewingRef.current = viewing;
  const quickRef = useRef(false);
  quickRef.current = quick !== null;
  const registerClose = useCallback((close: (() => Promise<boolean>) | null) => {
    closeEditorRef.current = close;
  }, []);

  const tz = useMemo(() => localTimeZone(), []);

  const notify = useCallback((message: string, undo?: UndoToken) => {
    counter.current += 1;
    setToast({ id: counter.current, message, ...(undo && { undo }) });
  }, []);

  const askScope = useCallback(
    (kind: 'edit' | 'delete', allowThis: boolean, warnReset: boolean) =>
      new Promise<Scope | null>((resolve) => {
        setAsk({ kind, allowThis, warnReset, resolve });
      }),
    [],
  );

  const openNew = useCallback(
    (date: PlainDate, time?: string, options?: { allDay?: boolean; quick?: boolean }) => {
      if (!store) return;
      void (async () => {
        let calendar = calendars.find((c) => c.visible) ?? calendars[0];
        if (!calendar) {
          // First use: there is nowhere to put an event yet, so make the one calendar people need.
          try {
            calendar = await store.createCalendar({
              name: t('defaultCalendarName'),
              color: 'blue',
            });
          } catch {
            notify(t('actionFailed'));
            return;
          }
        }
        counter.current += 1;
        const draft = draftForNew({
          date,
          ...(time !== undefined && { time }),
          ...(options?.allDay && { allDay: true }),
          calendarId: calendar.id,
          tzid: tz,
        });
        if (options?.quick) setQuick({ id: counter.current, draft });
        else setEditing({ mode: 'new', id: counter.current, draft });
      })();
    },
    [store, calendars, t, notify, tz],
  );

  const openEvent = useCallback(
    (occurrence: Occurrence) => {
      const target = resolveTarget(events, occurrence);
      const draft = draftFromEvent(
        occurrence.event,
        { start: occurrence.start, end: occurrence.end },
        tz,
        target.master.rrule,
      );
      counter.current += 1;
      setViewing(null);
      setEditing({ mode: 'edit', draft, target, id: counter.current });
    },
    [events, tz],
  );

  /** Changes one occurrence's draft (a drag) and writes it, asking the scope for repeating events. */
  const changeOccurrence = useCallback(
    (
      occurrence: Occurrence,
      change: (draft: Draft) => Draft | undefined,
      done: 'eventMoved' | 'eventResized',
    ): void => {
      if (!store) return;
      void (async () => {
        const target = resolveTarget(events, occurrence);
        const draft = draftFromEvent(
          occurrence.event,
          { start: occurrence.start, end: occurrence.end },
          tz,
          target.master.rrule,
        );
        const changed = change(draft);
        const fields = changed && draftToFields(changed);
        if (!fields || !fields.ok) {
          notify(t('actionFailed'));
          return;
        }
        let scope: Scope = 'all';
        if (isSeries(target)) {
          const allowThis = !ruleChanged(target.master.rrule, fields.fields.rrule);
          const whole = planEdit(target, 'all', fields.fields, newId);
          const warnReset = whole.ok && whole.ops.some((op) => op.kind === 'delete');
          const picked = await askScope('edit', allowThis, warnReset);
          if (picked === null) return;
          scope = picked;
        }
        const plan = planEdit(target, scope, fields.fields, newId);
        if (!plan.ok) {
          notify(t(plan.error === 'start-not-in-rule' ? 'errStartNotInRule' : 'actionFailed'));
          return;
        }
        const outcome = await execute(store, plan.ops);
        if (outcome.status === 'ok') notify(t(done), outcome.undo);
        else notify(t(outcome.status === 'conflict' ? 'saveConflict' : 'actionFailed'));
      })();
    },
    [store, events, tz, askScope, notify, t],
  );

  const moveEvent = useCallback(
    (occurrence: Occurrence, delta: { days: number; minutes: number }): void =>
      changeOccurrence(occurrence, (d) => moveDraft(d, delta.days, delta.minutes), 'eventMoved'),
    [changeOccurrence],
  );

  const resizeEvent = useCallback(
    (occurrence: Occurrence, minutes: number): void =>
      changeOccurrence(occurrence, (d) => resizeDraft(d, minutes), 'eventResized'),
    [changeOccurrence],
  );

  const showEvent = useCallback((occurrence: Occurrence) => setViewing(occurrence), []);

  const save = useCallback(
    async (draft: Draft): Promise<SaveOutcome> => {
      if (!store || !editing) return { ok: false, message: 'saveFailed' };
      const fields = draftToFields(draft);
      if (!fields.ok) return { ok: false, message: 'saveFailed' };

      let ops: EventOp[];
      if (editing.mode === 'new') {
        ops = [{ kind: 'create', event: fields.fields }];
      } else {
        const { target } = editing;
        let scope: Scope = 'all';
        if (isSeries(target)) {
          const allowThis = !ruleChanged(target.master.rrule, fields.fields.rrule);
          const whole = planEdit(target, 'all', fields.fields, newId);
          const warnReset = whole.ok && whole.ops.some((op) => op.kind === 'delete');
          const picked = await askScope('edit', allowThis, warnReset);
          if (picked === null) return { ok: false, message: null };
          scope = picked;
        }
        const plan = planEdit(target, scope, fields.fields, newId);
        if (!plan.ok) {
          const message: MessageKey =
            plan.error === 'start-not-in-rule'
              ? 'errStartNotInRule'
              : plan.error === 'invalid-rule'
                ? 'errInvalidRule'
                : 'saveFailed';
          return { ok: false, message };
        }
        ops = plan.ops;
      }

      const outcome = await execute(store, ops);
      if (outcome.status === 'ok') {
        notify(t('saved'));
        return { ok: true };
      }
      const message: MessageKey =
        outcome.status === 'conflict'
          ? 'saveConflict'
          : outcome.status === 'not-found'
            ? 'saveNotFound'
            : 'saveFailed';
      return { ok: false, message };
    },
    [store, editing, askScope, notify, t],
  );

  /** The quick card's save: the same create as the editor's, without opening the editor. */
  const quickSave = useCallback(
    async (draft: Draft): Promise<boolean> => {
      if (!store) return false;
      const fields = draftToFields(draft);
      if (!fields.ok) return false;
      const outcome = await execute(store, [{ kind: 'create', event: fields.fields }]);
      if (outcome.status !== 'ok') return false;
      setQuick(null);
      notify(t('saved'));
      return true;
    },
    [store, notify, t],
  );

  const quickMore = useCallback((draft: Draft) => {
    counter.current += 1;
    setQuick(null);
    setEditing({ mode: 'new', id: counter.current, draft });
  }, []);

  const removeTarget = useCallback(
    async (target: Target): Promise<boolean> => {
      if (!store) return false;
      let scope: Scope = 'all';
      if (isSeries(target)) {
        const picked = await askScope('delete', true, false);
        if (picked === null) return false;
        scope = picked;
      }
      const plan = planDelete(target, scope);
      if (!plan.ok) {
        notify(t('actionFailed'));
        return false;
      }
      const outcome = await execute(store, plan.ops);
      if (outcome.status === 'ok') {
        notify(t('eventDeleted'), outcome.undo);
        return true;
      }
      notify(t('actionFailed')); // nothing was deleted
      return false;
    },
    [store, askScope, notify, t],
  );

  const remove = useCallback(async (): Promise<void> => {
    if (!editing || editing.mode !== 'edit') return;
    if (await removeTarget(editing.target)) setEditing(null);
  }, [editing, removeTarget]);

  const undo = useCallback(
    async (token: UndoToken): Promise<void> => {
      if (!store) return;
      notify((await undoBatch(store, token)) ? t('undoDone') : t('undoFailed'));
    },
    [store, notify, t],
  );

  const closeEditor = useCallback(() => setEditing(null), []);
  const dismissToast = useCallback(() => setToast(null), []);

  /** Back button: cancel the scope question first, otherwise close (and save) the editor. */
  const back = useCallback(async (): Promise<boolean> => {
    const pending = askRef.current;
    if (pending) {
      pending.resolve(null);
      setAsk(null);
      return false;
    }
    if (quickRef.current) {
      setQuick(null);
      return true;
    }
    if (viewingRef.current) {
      setViewing(null);
      return true;
    }
    return (await closeEditorRef.current?.()) ?? true;
  }, []);

  const card = viewing
    ? (() => {
        const calendar = calendars.find((c) => c.id === viewing.event.calendarId);
        const timeFmt: TimeFormatOptions = { ...fmt, hour12 };
        return (
          <EventDetails
            key={viewing.key}
            event={viewing.event}
            calendar={calendar}
            when={describeWhen(
              {
                start: viewing.start,
                end: viewing.end,
                allDay: viewing.event.allDay,
                tzid: viewing.event.tzid,
              },
              timeFmt,
              tz,
            )}
            recurring={viewing.recurring}
            onEdit={() => openEvent(viewing)}
            onDelete={() => {
              void removeTarget(resolveTarget(events, viewing)).then((done) => {
                if (done) setViewing(null);
              });
            }}
            onClose={() => setViewing(null)}
          />
        );
      })()
    : null;

  const quickWhen = (() => {
    if (!quick) return '';
    const fields = draftToFields(quick.draft);
    if (!fields.ok) return '';
    const { start, end, allDay, tzid } = fields.fields;
    return describeWhen({ start, end, allDay, tzid }, { ...fmt, hour12 }, tz);
  })();

  const overlay = (
    <>
      {card}
      {quick && (
        <QuickAdd
          key={quick.id}
          initial={quick.draft}
          calendars={calendars}
          when={quickWhen}
          onSave={quickSave}
          onMore={quickMore}
          onClose={() => setQuick(null)}
        />
      )}
      {editing && (
        <EventEditor
          key={editing.id}
          mode={editing.mode}
          initial={editing.draft}
          calendars={calendars}
          fmt={fmt}
          weekStart={weekStart}
          onSave={save}
          onDelete={editing.mode === 'edit' ? () => void remove() : undefined}
          onClose={closeEditor}
          registerClose={registerClose}
        />
      )}
      {ask && (
        <ScopeDialog
          kind={ask.kind}
          allowThis={ask.allowThis}
          warnReset={ask.warnReset}
          onChoose={(scope) => {
            ask.resolve(scope);
            setAsk(null);
          }}
          onCancel={() => {
            ask.resolve(null);
            setAsk(null);
          }}
        />
      )}
      {toast && (
        <Toast
          key={toast.id}
          message={toast.message}
          durationMs={toast.undo ? UNDO_MS : NOTICE_MS}
          onDismiss={dismissToast}
          action={
            toast.undo
              ? { label: t('undo'), run: () => void undo(toast.undo as UndoToken) }
              : undefined
          }
        />
      )}
    </>
  );

  return {
    openNew,
    showEvent,
    openEvent,
    moveEvent,
    resizeEvent,
    overlay,
    dialogOpen: editing !== null || ask !== null || viewing !== null || quick !== null,
    back,
  };
}
