import { useState } from 'react';
import type { PlainDate } from '@/core/time';
import { motionBetween, type ViewMotion } from './motion';
import type { ViewKind } from './nav';

export interface MotionState {
  readonly kind: ViewMotion;
  readonly tick: number;
}

/** Tells the screen which way it just moved; derived while rendering so there is no extra paint. */
export function useViewMotion(view: ViewKind, anchor: PlainDate): MotionState {
  const [state, setState] = useState({ view, anchor, kind: 'none' as ViewMotion, tick: 0 });
  if (state.view !== view || state.anchor !== anchor) {
    setState({
      view,
      anchor,
      kind: motionBetween(state, { view, anchor }),
      tick: state.tick + 1,
    });
  }
  return { kind: state.kind, tick: state.tick };
}
