import {NAMESPACE} from './constants';
import type {EventizeApi, EventizeGuard} from './types';

export const isEventized: EventizeGuard = <T extends Object>(
  obj: T,
): obj is T & EventizeApi =>
  Boolean(
    obj &&
      // @ts-ignore
      obj[NAMESPACE],
  );
