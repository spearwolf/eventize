import {NAMESPACE} from './constants';
import type {EventizeGuard, EventizedObject} from './types';

export const isEventized: EventizeGuard = (
  obj: unknown,
): obj is EventizedObject =>
  Boolean(obj && (obj as Record<symbol, unknown>)[NAMESPACE]);
