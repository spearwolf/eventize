'use strict';

let eventize = require('../eventize');

describe("eventizedObj.once", function () {

    let obj = eventize({});

    it("should return an id as number", function () {
        let id = obj.once('foo', function () {});
        expect(typeof id === 'number').toBe(true, 'but is ' + (typeof id));
    });

    it("should work with 2 arguments", function () {
        let isCalled = false;
        obj.once('bar', function (x) { isCalled = x; });
        obj.emit('bar', true);
        expect(isCalled).toBe(true);
    });

    it("should work with 3 arguments", function () {
        let isCalled = 19;
        obj.once('plah', eventize.PRIO_A, function (x) { isCalled = x; });
        obj.emit('plah', 75);
        expect(isCalled).toBe(75);
    });

    it("should only be called once and never again!", function () {

        let isCalled = 19;
        obj.once('once.check', function (x) { isCalled = x; });

        obj.emit('once.check', 4);
        obj.emit('once.check', 73);
        obj.emit('once.check', 74);
        obj.emit('once.check', 75);

        expect(isCalled).toBe(4);

    });

});

