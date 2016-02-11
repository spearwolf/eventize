'use strict';

let eventize = require('../eventize');

describe("eventize", function () {

    it("is defined", function () {
        expect(eventize).toBeDefined();
    });

    it("is a function", function () {
        expect(typeof eventize === 'function').toBe(true);
    });

});

describe("eventize has pre-defined priorities", function () {

    it("PRIO_MAX", function () { expect(eventize.PRIO_MAX).toBeDefined(); });
    it("PRIO_A", function () { expect(eventize.PRIO_A).toBeDefined(); });
    it("PRIO_B", function () { expect(eventize.PRIO_B).toBeDefined(); });
    it("PRIO_C", function () { expect(eventize.PRIO_C).toBeDefined(); });
    it("PRIO_DEFAULT", function () { expect(eventize.PRIO_DEFAULT).toBeDefined(); });
    it("PRIO_LOW", function () { expect(eventize.PRIO_LOW).toBeDefined(); });
    it("PRIO_MIN", function () { expect(eventize.PRIO_MIN).toBeDefined(); });

    it("PRIO_MAX > PRIO_A", function () { expect(eventize.PRIO_MAX).toBeGreaterThan(eventize.PRIO_A); });
    it("PRIO_A > PRIO_B", function () { expect(eventize.PRIO_A).toBeGreaterThan(eventize.PRIO_B); });
    it("PRIO_B > PRIO_C", function () { expect(eventize.PRIO_B).toBeGreaterThan(eventize.PRIO_C); });
    it("PRIO_C > PRIO_DEFAULT", function () { expect(eventize.PRIO_C).toBeGreaterThan(eventize.PRIO_DEFAULT); });
    it("PRIO_DEFAULT > PRIO_LOW", function () { expect(eventize.PRIO_DEFAULT).toBeGreaterThan(eventize.PRIO_LOW); });
    it("PRIO_LOW > PRIO_MIN", function () { expect(eventize.PRIO_LOW).toBeGreaterThan(eventize.PRIO_MIN); });

});

