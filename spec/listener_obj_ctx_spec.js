'use strict';

let eventize = require('../eventize');

describe("listener object context as last argument", function () {

    it('on should always append sender and connect should always append root sender', function () {

        let results = [];
        let globalThis = this;
        var a, b, c, d, aa, cc, dd, e, ee, f, ff;

        function objRef(obj) {
            switch (obj) {
                case a: return '<A>';
                case b: return '<B>';
                case c: return '<C>';
                case d: return '<D>';
                case e: return '<E>';
                case f: return '<F>';
                case aa: return '<AA>';
                case cc: return '<CC>';
                case dd: return '<DD>';
                case ee: return '<EE>';
                case ff: return '<FF>';
                case globalThis: return '<ROOT>';
            }
            return '<UnknownObject>';
        }

        let asString = (args) => {
            return Array.prototype.slice.call(args, 0).map((arg) => {
                if (typeof arg === 'object') {
                    return objRef(arg);
                }
                return arg;
            }).join(', ')
        }

        function display(title, args, self) {
            //console.log(title, '->', args.length, 'arguments: [', asString(args), ']', 'this =', objRef(self));
            results.push(title + ' -> ' + args.length + ' arguments: [ ' + asString(args) + ' ] this = ' + objRef(self));
        }

        // ----------------------------

        a = eventize({});


        aa = {
            foo () {
                display('A.on     ', arguments, this);
            }
        };
        a.on('foo', aa);



        b = {
            foo () {
                display('B.connect', arguments, this);
            }
        };
        a.connect(b);



        c = eventize({});
        cc = {
            foo () {
                display('C.on     ', arguments, this);
            }
        };
        c.on('*', cc);
        a.on(c);



        d = eventize({});
        dd = {
            foo () {
                display('D.connect', arguments, this);
            }
        };
        d.on('*', dd);
        a.connect(d);



        e = eventize({});
        ee = {
            foo () {
                display('E.con|con', arguments, this);
            }
        };
        e.on('*', ee);
        d.connect(e);



        f = eventize({});
        ff = {
            foo () {
                display('F.onC|onA', arguments, this);
            }
        };
        f.on('*', ff);
        c.on(f);


        a.emit('foo', 1, 9, 2008);


        expect(results).toEqual([
            "A.on      -> 4 arguments: [ 1, 9, 2008, <A> ] this = <AA>",
            "C.on      -> 4 arguments: [ 1, 9, 2008, <C> ] this = <CC>",
            "F.onC|onA -> 4 arguments: [ 1, 9, 2008, <F> ] this = <FF>",

            //"A.on      -> 3 arguments: [ 1, 9, 2008 ] this = <AA>",
            //"C.on      -> 4 arguments: [ 1, 9, 2008, <A> ] this = <CC>",
            //"F.onC|onA -> 4 arguments: [ 1, 9, 2008, <C> ] this = <FF>",

            "B.connect -> 4 arguments: [ 1, 9, 2008, <A> ] this = <B>",
            "D.connect -> 4 arguments: [ 1, 9, 2008, <A> ] this = <DD>",
            "E.con|con -> 4 arguments: [ 1, 9, 2008, <D> ] this = <EE>",
        ]);


    });

});

