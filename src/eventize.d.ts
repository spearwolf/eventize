import {EventizeApi} from './inject';

export * from './inject';
export * from './constants';

export declare class Eventize { }
export interface Eventize extends EventizeApi { }

interface IEventize {
    <T extends Object>(obj: T): T & EventizeApi;

    inject<T extends Object>(obj: T): T & EventizeApi;
    extend<T extends Object>(obj: T): T & EventizeApi;
    create<T extends Object>(obj: T): EventizeApi;

    is(obj: Object): boolean;

    PRIO_MAX: string;
    PRIO_A: string;
    PRIO_B: string;
    PRIO_C: string;
    PRIO_DEFAULT: string;
    PRIO_LOW: string;
    PRIO_MIN: string;
}

declare let eventize: IEventize;
export default eventize;
