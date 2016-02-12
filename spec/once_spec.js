'use strict';

let eventize = require('../eventize');

describe("eventizedObj.once", function () {

    it("should return an id as number", function () {
        let obj = eventize({});
        let id = obj.once('foo', function () {});
        expect(typeof id === 'number').toBe(true, 'but is ' + (typeof id));
    });

    it("should work with 2 arguments", function () {
        let obj = eventize({});
        let isCalled = false;
        obj.once('bar', function (x) { isCalled = x; });
        obj.emit('bar', true);
        expect(isCalled).toBe(true);
    });

    it("should work with 3 arguments", function () {
        let obj = eventize({});
        let isCalled = 19;
        obj.once('plah', eventize.PRIO_A, function (x) { isCalled = x; });
        obj.emit('plah', 75);
        expect(isCalled).toBe(75);
    });

    it("should only be called once and never again!", function () {
        let obj = eventize({});
        let isCalled = 19;
        obj.once('once.check', function (x) { isCalled = x; });

        obj.emit('once.check', 4);
        obj.emit('once.check', 73);
        obj.emit('once.check', 74);
        obj.emit('once.check', 75);

        expect(isCalled).toBe(4);
    });

    it("should work with catch'em all events as expected", function () {
        let obj = eventize({});
        let isCalled = 99;
        obj.once(function (x) { isCalled = x; });
        obj.emit('plah', 71);
        expect(isCalled).toBe(71);
        obj.emit('plah', 77);
        expect(isCalled).toBe(71);
    });

});

