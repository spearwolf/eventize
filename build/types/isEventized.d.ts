import { EventizeApi } from './types';
export declare const isEventized: <T extends Object>(obj: T) => obj is T & EventizeApi;
export declare type EventizeGuard = typeof isEventized;
