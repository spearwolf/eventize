import { EventName } from './types';
export declare const isCatchEmAll: (eventName: unknown) => eventName is string;
export declare const isEventName: (eventName: unknown) => eventName is EventName;
