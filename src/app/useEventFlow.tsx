import { useCallback, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import type { CalEvent, Calendar } from '@/core/model';
import type { Occurrence } from '@/core/recurrence';
import { localTimeZone } from '@/core/time';
import type { FormatOptions, IsoWeekday, PlainDate } from '@/core/time';
import type { EventOp, Store, UndoToken } from '@/data';
import {
  draftForNew,
  draftFromEvent,
  draftToFields,
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
import { EventEditor } from '@/ui/editor/EventEditor';
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
  readonly weekStart: IsoWeekday;
}

export interface EventFlow {
  /** Starts a new event on `date` (at `time` when given, otherwise 09:00). */
  readonly openNew: (date: PlainDate, time?: string) => void;
  readonly openEvent: (occurrence: Occurrence) => void;
  /** The editor, the scope question and the toast. Render it once, anywhere. */
  readonly overlay: ReactNode;
  /** True while a dialog is open: global shortcuts must pause. */
  readonly dialogOpen: boolean;
}

const newId = (): string => crypto.randomUUID();

export function useEventFlow({ store, calendars, events, fmt, weekStart }: EventFlowInput): EventFlow {
  const t = useT();
  const [editing, setEditing] = useState<Editing | null>(null);
  const [ask, setAsk] = useState<ScopeAsk | null>(null);
  const [toast, setToast] = useState<ToastState | null>(null);
  const counter = useRef(0);
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
    (date: PlainDate, time?: string) => {
      if (!store) return;
      void (async () => {
        let calendar = calendars.find((c) => c.visible) ?? calendars[0];
        if (!calendar) {
          // First use: there is nowhere to put an event yet, so make the one calendar people need.
          try {
            calendar = await store.createCalendar({ name: t('defaultCalendarName'), color: 'blue' });
          } catch {
            notify(t('actionFailed'));
            return;
          }
        }
        counter.current += 1;
        setEditing({
          mode: 'new',
          id: counter.current,
          draft: draftForNew({
            date,
            ...(time !== undefined && { time }),
            calendarId: calendar.id,
            tzid: tz,
          }),
        });
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
      setEditing({ mode: 'edit', draft, target, id: counter.current });
    },
    [events, tz],
  );

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

  const remove = useCallback(async (): Promise<void> => {
    if (!store || !editing || editing.mode !== 'edit') return;
    const { target } = editing;
    let scope: Scope = 'all';
    if (isSeries(target)) {
      const picked = await askScope('delete', true, false);
      if (picked === null) return;
      scope = picked;
    }
    const plan = planDelete(target, scope);
    if (!plan.ok) {
      notify(t('actionFailed'));
      return;
    }
    const outcome = await execute(store, plan.ops);
    if (outcome.status === 'ok') {
      setEditing(null);
      notify(t('eventDeleted'), outcome.undo);
    } else {
      notify(t('actionFailed')); // the editor stays open: nothing was deleted
    }
  }, [store, editing, askScope, notify, t]);

  const undo = useCallback(
    async (token: UndoToken): Promise<void> => {
      if (!store) return;
      notify((await undoBatch(store, token)) ? t('undoDone') : t('undoFailed'));
    },
    [store, notify, t],
  );

  const closeEditor = useCallback(() => setEditing(null), []);
  const dismissToast = useCallback(() => setToast(null), []);

  const overlay = (
    <>
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

  return { openNew, openEvent, overlay, dialogOpen: editing !== null || ask !== null };
}
