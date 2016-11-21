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

        it("should provide a .play() function", function () {
            const queue = eventize.queue();
            expect(typeof queue.play).toEqual('function');
        });

        it("should provide a .collect() function", function () {
            const queue = eventize.queue();
            expect(typeof queue.collect).toEqual('function');
        });

    });

    describe("a queue in play mode", function () {

        it("should emit events", function () {
            const queue = eventize.queue();
            expect(queue.state).toEqual('play');

            var foo;
            queue.on('foo', (x) => foo = x);
            queue.emit('foo', 10);
            expect(foo).toEqual(10);
        });

    });

    describe("a queue in collect mode", function () {

        it("should not emit events", function () {
            const queue = eventize.queue().collect();
            expect(queue.state).toEqual('collect');

            var foo = 0;
            queue.on('foo', (x) => foo = x);
            queue.emit('foo', 10);
            expect(foo).toEqual(0);
        });

        it("should immediately emit all collected events after going into play mode", function () {
            const queue = eventize.queue().collect();
            expect(queue.state).toEqual('collect');

            var foo = 0;
            queue.on('foo', (x) => foo += x);

            queue.emit('foo', 10);
            expect(foo).toEqual(0);
            queue.emit('foo', 20);
            expect(foo).toEqual(0);

            queue.play();
            expect(foo).toEqual(30);
        });

    });


});

