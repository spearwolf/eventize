import {CatchEmAllType} from "./constants";

export interface EventListener {

    readonly id: number;
    readonly eventName: string;
    readonly isCatchEmAll: boolean;
    readonly priority: number;
    readonly isRemoved: boolean;

    apply(eventName: string | CatchEmAllType, ...args: any[]): void;

}
