'use strict';

const Rx = require('rxjs');
const eventize = require('../eventize');

describe("eventizedObj.from", function () {

    it("should return an Observable", function () {
        const obj = eventize({});
        const obs = obj.from('value', Rx.Observable);
        expect(obs instanceof Rx.Observable).toBe(true, "instance should by of Rx.Observable");
    });

    it("should return an Observable which is receiving events", function () {
        const obj = eventize({});
        const obs = obj.from('value', Rx.Observable);
        let foo = 0;
        obs.filter(x => x%2 === 0).subscribe(x => foo += x);
        obj.subscribe(Rx.Observable.from([1, 2, 3, 4, 5, 6, 7, 8]), 'value');
        expect(foo).toBe(2+4+6+8);
    });

});

