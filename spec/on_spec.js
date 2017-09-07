'use strict';

let eventize = require('../eventize');

describe("eventizedObj.on", function () {

    it("should return an id as number", function () {
        let obj = eventize({});
        let id = obj.on('foo', function () {});
        expect(typeof id === 'number').toBe(true, 'but is ' + (typeof id));
    });

    it("should work with 2 arguments", function () {
        let obj = eventize({});
        let isCalled = false;
        obj.on('bar', function (x) { isCalled = x; });
        obj.emit('bar', true);
        expect(isCalled).toBe(true);
    });

    it("should work with 3 arguments", function () {
        let obj = eventize({});
        let isCalled = 19;
        obj.on('plah', eventize.PRIO_A, function (x) { isCalled = x; });
        obj.emit('plah', 75);
        expect(isCalled).toBe(75);
    });

    it("should work with an object as last argument", function () {

        let obj = eventize({});

        let tricky = 0;
        let tracky = 0;
        let trecky = 0;

        let obj2 = eventize({});
        let obj3 = {};

        obj2.on('tricky', function (x) { tricky = x });
        obj2.on('tracky', function (x) { tracky = x-1 });
        obj3.trecky = function (x) { trecky = x+1 };

        obj.emit('tricky', 999);
        obj.emit('tracky', 888);
        obj.emit('trecky', 777);
        expect(tricky).toBe(0);
        expect(tracky).toBe(0);
        expect(trecky).toBe(0);

        obj.on('tricky', obj2);
        obj.on('trecky', obj3);

        obj.emit('tricky', 666);
        obj.emit('tracky', 555);
        obj.emit('trecky', 444);
        expect(tricky).toBe(666);
        expect(tracky).toBe(0);
        expect(trecky).toBe(445);

        obj.on('tracky', eventize.PRIO_A, obj2);

        obj.emit('tricky', 444);
        obj.emit('tracky', 333);
        expect(tricky).toBe(444);
        expect(tracky).toBe(332);
        expect(trecky).toBe(445);

        obj2.on('tracky', eventize.PRIO_LOW, function (x) { tracky = x });

        var obj4 = {
            trecky: function (x) { trecky = x }
        };
        obj.on('trecky', eventize.PRIO_LOW, obj4);

        obj.emit('tricky', 222);
        obj.emit('tracky', 111);
        obj.emit('trecky', 10);
        expect(tricky).toBe(222);
        expect(tracky).toBe(111);
        expect(trecky).toBe(10);

        obj.off(obj2);
        obj.off(obj3);
        obj.off(obj4);

        obj.emit('tricky', 99);
        obj.emit('tracky', 98);
        obj.emit('trecky', 98);
        expect(tricky).toBe(222);
        expect(tracky).toBe(111);
        expect(trecky).toBe(10);

    });

    it("should sort all listeners based on their priorities and as second order by creation time", function () {

        let obj = eventize({});
        let results = [];

        obj.on('prio.test', function () { results.push('_0'); });
        obj.on('prio.test', eventize.PRIO_B, function () { results.push('b'); });
        obj.on('prio.test', function () { results.push('_1'); });
        obj.on('prio.test', eventize.PRIO_A+1, function () { results.push('aa'); });
        obj.on('prio.test', eventize.PRIO_C, function () { results.push('c'); });
        obj.on('prio.test', eventize.PRIO_C, function () { results.push('c2'); });
        obj.on('prio.test', eventize.PRIO_MIN, function () { results.push('min'); });
        obj.on('prio.test', eventize.PRIO_C, function () { results.push('c3'); });
        obj.on('prio.test', eventize.PRIO_A, function () { results.push('a'); });
        obj.on('prio.test', function () { results.push('_2'); });
        obj.on('prio.test', eventize.PRIO_MAX, function () { results.push('max'); });
        obj.on('prio.test', eventize.PRIO_C, function () { results.push('c4'); });

        obj.emit('prio.test');

        expect(results).toEqual(['max', 'aa', 'a', 'b', 'c', 'c2', 'c3', 'c4', '_0', '_1', '_2', 'min']);

    });

    it("called with only one argument should reactivate previously off'd events by name", function () {

        let obj = eventize({});
        let result = null;
        let result2 = null;

        obj.on('krah', function (x) { result = x; });

        obj.on({
            krah: function (x) { result2 = x; }
        });

        obj.emit('krah', 50);
        expect(result).toBe(50);
        expect(result2).toBe(50);

        obj.off('krah');
        obj.emit('krah', 70);
        expect(result).toBe(50);
        expect(result2).toBe(50);

        obj.on('krah');
        obj.emit('krah', 90);
        expect(result).toBe(90);
        expect(result2).toBe(90);

    });

    it("this context of callback should be the eventized object", function () {

        let obj = eventize({});
        let scope = null;

        obj.on('nein', function () { scope = this; });
        obj.emit('nein');

        expect(scope).toBe(obj);

    });

    it("catch all listeners will be always called after other listeners", function () {

        let obj = eventize({});
        let result = [];

        obj.on(function (x) { result.push(x); });
        obj.on('*', eventize.PRIO_A, function (x) { result.push(x+2000); });
        obj.on('foo', function (x) { result.push(x+1000); });
        obj.on('bar', eventize.PRIO_B, function (x) { result.push(x+3000); });

        obj.emit('foo', 1);
        obj.emit('bar', 2);

        expect(result).toEqual([1001, 2001, 1, 3002, 2002, 2]);

    });

});

