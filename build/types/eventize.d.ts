import { EventizeGuard } from './isEventized';
import { EventizeApi } from './types';
export interface EventizerFunc {
    <T extends Object>(obj: T): T & EventizeApi;
}
export interface EventizeFuncApi extends EventizerFunc {
    inject: EventizerFunc;
    extend: EventizerFunc;
    create(obj: Object): EventizeApi;
    is: EventizeGuard;
    PRIO_MAX: number;
    PRIO_A: number;
    PRIO_B: number;
    PRIO_C: number;
    PRIO_DEFAULT: number;
    PRIO_LOW: number;
    PRIO_MIN: number;
}
declare const _default: EventizeFuncApi;
export default _default;
export interface Eventize extends EventizeApi {
}
export declare class Eventize {
    constructor();
}
