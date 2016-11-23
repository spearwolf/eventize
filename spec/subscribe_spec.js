'use strict';

const Rx = require('rxjs');
const eventize = require('../eventize');

describe("eventizedObj.subscribe", function () {

    it("should subscribe to an Observable", function () {
        const obj = eventize({});
        let foo = 0;
        obj.on('value', x => foo += x);
        obj.subscribe(Rx.Observable.from([1, 2, 4, 8]), 'value');
        expect(foo).toBe(15);
    });

});

