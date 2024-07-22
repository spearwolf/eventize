import {NAMESPACE} from './constants';
import type {EventizeGuard, EventizedObject} from './types';

export const isEventized: EventizeGuard = <T extends object>(
  obj: T,
): obj is T & EventizedObject =>
  Boolean(
    obj &&
      // @ts-ignore
      obj[NAMESPACE],
  );
