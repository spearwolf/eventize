import { EventKeeper } from './EventKeeper';
import { EventListener } from './EventListener';
import { EventStore } from './EventStore';
import { EventArgs } from './types';
export declare const subscribeTo: (store: EventStore, keeper: EventKeeper, args: EventArgs) => EventListener | Array<EventListener>;
