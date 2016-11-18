'use strict';

let eventize = require('../eventize');

describe("eventize.queue(name)", function () {

    it("should create a new queue when called with a name", function () {
        const queue = eventize.queue('queue-a');
        expect(eventize.is(queue)).toBeTruthy();
    });

    it("should always create a new queue even when called without a name", function () {
        const a = eventize.queue();
        expect(eventize.is(a)).toBeTruthy();
        const b = eventize.queue();
        expect(eventize.is(b)).toBeTruthy();
        const c = eventize.queue();
        expect(eventize.is(c)).toBeTruthy();
        const d = eventize.queue();
        expect(eventize.is(d)).toBeTruthy();
        const e = eventize.queue();
        expect(eventize.is(e)).toBeTruthy();
        expect(a).not.toEqual(b);
        expect(b).not.toEqual(c);
        expect(c).not.toEqual(d);
        expect(d).not.toEqual(e);
    });

    it("a queue is a singelton", function () {
        const queue = eventize.queue('queue-a');
        expect(eventize.queue()).not.toEqual(queue);
        expect(eventize.queue('queue-b')).not.toEqual(queue);
        expect(eventize.queue('queue-a')).toEqual(queue);
        const queueB = eventize.queue();
        expect(eventize.queue()).not.toEqual(queueB);
        expect(eventize.queue(queueB.name)).toEqual(queueB);
    });

    describe("a queue", function () {

        it("should provide a .name property", function () {
            const NAME = 'asdfuh239rh23r';
            const queue = eventize.queue(NAME);
            expect(queue.name).toEqual(NAME);
        });

        it("should provide a .state property", function () {
            const queue = eventize.queue('q000');
            expect(queue.state).toBeDefined();
        });

        it("default state is 'play'", function () {
            const queue = eventize.queue('q001');
            expect(queue.state).toEqual('play');
        });

    });

});

