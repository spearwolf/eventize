'use strict';

let eventize = require('../eventize');

describe("eventizedObj.on", function () {

    let obj = eventize({});

    it("should return an id as number", function () {
        let id = obj.on('foo', function () {});
        expect(typeof id === 'number').toBe(true, 'but is ' + (typeof id));
    });

    it("should work with 2 arguments", function () {
        let isCalled = false;
        obj.on('bar', function (x) { isCalled = x; });
        obj.emit('bar', true);
        expect(isCalled).toBe(true);
    });

    it("should work with 3 arguments", function () {
        let isCalled = 19;
        obj.on('plah', eventize.PRIO_A, function (x) { isCalled = x; });
        obj.emit('plah', 75);
        expect(isCalled).toBe(75);
    });

    it("should sort all listeners based on their priorities", function () {

        let results = [];

        obj.on('prio.test', eventize.PRIO_B, function () { results.push('b'); });
        obj.on('prio.test', eventize.PRIO_A+1, function () { results.push('aa'); });
        obj.on('prio.test', eventize.PRIO_C, function () { results.push('c'); });
        obj.on('prio.test', eventize.PRIO_MIN, function () { results.push('min'); });
        obj.on('prio.test', eventize.PRIO_A, function () { results.push('a'); });
        obj.on('prio.test', eventize.PRIO_MAX, function () { results.push('max'); });

        obj.emit('prio.test');

        expect(results).toEqual(['max', 'aa', 'a', 'b', 'c', 'min']);

    });

    it("called with only one argument should reactivate previously off'd events by name", function () {

        let result = null;
        let result2 = null;

        obj.on('krah', function (x) { result = x; });

        obj.bindOn({
            'krah': function (x) { result2 = x; }
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

        let scope = null;

        obj.on('nein', function () { scope = this; });
        obj.emit('nein');

        expect(scope).toBe(obj);

    });

});

