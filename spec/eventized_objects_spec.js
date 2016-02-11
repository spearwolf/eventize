'use strict';

let eventize = require('../eventize');

describe("eventized objects", function () {

    let obj = eventize({});

    it("should have .on() method", function () {
        expect(typeof obj.on === 'function').toBe(true);
    });

    it("should have .once() method", function () {
        expect(typeof obj.once === 'function').toBe(true);
    });

    it("should have .off() method", function () {
        expect(typeof obj.off === 'function').toBe(true);
    });

    it("should have .emit() method", function () {
        expect(typeof obj.emit === 'function').toBe(true);
    });

    it("should have .emitReduce() method", function () {
        expect(typeof obj.emitReduce === 'function').toBe(true);
    });

    it("should have .bindOn() method", function () {
        expect(typeof obj.bindOn === 'function').toBe(true);
    });

    it("should have .connect() method", function () {
        expect(typeof obj.connect === 'function').toBe(true);
    });

});

