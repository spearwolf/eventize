import {NAMESPACE} from './constants';
import {EventizeApi} from './types';

export const isEventized = <T extends Object>(obj: T): obj is T & EventizeApi =>
  !!(
    obj &&
    // @ts-ignore
    obj[NAMESPACE]
  );

export type EventizeGuard = typeof isEventized;
