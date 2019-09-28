import {EventizeApi} from './inject';

export * from './constants';

interface Eventize {
    <T extends Object>(obj: T): T & EventizeApi;

    inject<T extends Object>(obj: T): T & EventizeApi;
    extend<T extends Object>(obj: T): T & EventizeApi;
    create<T extends Object>(obj: T): EventizeApi;
}

declare let eventize: Eventize;
export default eventize;
