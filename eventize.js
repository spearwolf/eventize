/**
 * ===============================================================
 * eventize.js v0.0.15 -- https://github.com/spearwolf/eventize
 * ===============================================================
 *
 * Copyright 2015-16 Wolfger Schramm <wolfger@spearwolf.de>
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */
!function(n){if("object"==typeof exports&&"undefined"!=typeof module)module.exports=n();else if("function"==typeof define&&define.amd)define([],n);else{var e;e="undefined"!=typeof window?window:"undefined"!=typeof global?global:"undefined"!=typeof self?self:this,e.eventize=n()}}(function(){return function n(e,t,o){function i(f,u){if(!t[f]){if(!e[f]){var c="function"==typeof require&&require;if(!u&&c)return c(f,!0);if(r)return r(f,!0);var l=Error("Cannot find module '"+f+"'");throw l.code="MODULE_NOT_FOUND",l}var a=t[f]={exports:{}};e[f][0].call(a.exports,function(n){var t=e[f][1][n];return i(t?t:n)},a,a.exports,n,e,t,o)}return t[f].exports}for(var r="function"==typeof require&&require,f=0;f<o.length;f++)i(o[f]);return i}({1:[function(n,e,t){"use strict";function o(n){function e(){return++u.lastCallbackId}function t(n,e){return n.prio!==e.prio?e.prio-n.prio:n.id-e.id}function i(n){if(n){var e=u.boundObjects.indexOf(n);return-1===e&&u.boundObjects.push(n),n}}function r(n,e,t){var i,r,f,u;for(r in t)t.hasOwnProperty(r)&&(f=e[r],"function"==typeof f&&(i=t[r],Array.isArray(i)?(u=i[0],i=i[1]):u=o.PRIO_DEFAULT,n.on(i,u,f)));return n}function f(n,e,t){function i(){var e,o,i;if(p)for(e=0;p>e;e++)o=u.boundObjects[e],i=o[n],"function"==typeof i?t(i,o):o[v]&&t(null,o)}if(!(s.silenced||s.off.indexOf(n)>=0)){var r,f,c,l=u.callbacks[n],a=u.callbacks[y],p=u.boundObjects.length,d=!1;if(l||a.length)for(l=l?l.concat(a):a,f=l.length,r=0;f>r;r++)c=l[r],!d&&c&&c.prio<o.PRIO_DEFAULT&&(i(),d=!0),e(c);d||i()}}if(n[v])return n;var u={lastCallbackId:0,callbacks:{},boundObjects:[]};u.callbacks[y]=[];var s=l({},{silenced:!1,off:[]});return a(n,v,s),void 0===o.PRIO_DEFAULT&&l(o,{PRIO_MAX:Number.POSITIVE_INFINITY,PRIO_A:1e9,PRIO_B:1e7,PRIO_C:1e5,PRIO_DEFAULT:0,PRIO_LOW:-1e5,PRIO_MIN:Number.NEGATIVE_INFINITY}),n.on=function(n,i,r){var f=arguments.length;if(0===f)return void(s.silenced&&(c(s,"silenced",!1),s.off.length=0));var a;if(1===f){if("string"==typeof n)return a=s.off.indexOf(n),void(a>=0&&s.off.splice(a,1));if("object"!=typeof n&&"function"!=typeof n)return void(d&&console.warn(b,".on() called with insufficient arguments!",arguments));r=n,n=y,i=o.PRIO_DEFAULT}2===f&&(r=i,i=o.PRIO_DEFAULT);var p=u.callbacks,v=p[n]||(p[n]=[]),h=e(),x=l({},{id:h,fn:r,prio:"number"!=typeof i?o.PRIO_DEFAULT:i,isFunction:"function"==typeof r});return v.push(x),v.sort(t),h},n.once=function(e,t,i){var r=arguments.length;if(!r||r>3)return void(d&&console.warn(b,".once() called with insufficient arguments!",arguments));1===r?(i=e,e=y,t=o.PRIO_DEFAULT):2===r&&(i=t,t=o.PRIO_DEFAULT);var f=n.on(e,t,function(){var e=i.apply(this,arguments);return n.off(f),e});return f},n.off=function(n){if(0===arguments.length)return void(s.silenced||(c(s,"silenced",!0),s.off.length=0));if("string"==typeof n)return void(-1===s.off.indexOf(n)&&s.off.push(n));var e,t,o,i,r,f=u.callbacks,l="object"==typeof n;if("number"==typeof n||"function"==typeof n||l)for(r=Object.keys(f),o=0;o<r.length;o++)for(i=f[r[o]],t=0;t<i.length;t++)if(e=i[t],(e.id===n||e.fn===n)&&(i.splice(t,1),!l))return;l&&(t=u.boundObjects.indexOf(n),t>=0&&u.boundObjects.splice(t,1))},n.connect=function(n,e){var t=arguments.length;return 1===t?i(n):2===t?r(this,n,e):void(d&&console.warn(b,".connect() called with insufficient arguments!",arguments))},n.emit=function(){for(var n=Array(arguments.length),e=0;e<n.length;++e)n[e]=arguments[e];var t,o,i,r=this;n.length>1&&"string"!=typeof n[0]&&"string"==typeof n[1]?(o=n.shift(),t=n.shift(),n[n.length-1]=o,i=n):(t=n.shift(),i=n.concat([r])),f(t,function(e){if(e.isFunction)e.fn.apply(r,n);else{var o=e.fn[t];"function"==typeof o?o.apply(e.fn,i):e.fn[v]&&e.fn.emit.apply(e.fn,[t].concat(n))}},function(n,e){n?n.apply(e,i):e.emit.apply(e,[r,t].concat(i))})},n.emitReduce=function(){function n(n){void 0!==n&&(o=n)}for(var e=Array(arguments.length),t=0;t<e.length;++t)e[t]=arguments[t];var o,i=e.shift();0===e.length?(o={},e.push(o)):n(e[0]);var r=this,u=[i].concat(e),c=e.concat([r]);return f(i,function(t){if(t.isFunction)e[0]=o,n(t.fn.apply(r,e));else{var f=t.fn[i];"function"==typeof f?(c[0]=o,n(f.apply(t.fn,c))):t.fn[v]&&(u[1]=o,n(t.fn.emitReduce.apply(t.fn,u)))}},function(e,t){e&&(c[0]=o,n(e.apply(t,c)))}),o},n.from=function(n,e){var t=this;return new e(function(e){var o=t.on(n,function(n){e.next(n)});return function(){t.off(o)}})},n.subscribe=function(n,e,t,o){var i=this;return n.subscribe(function(n){i.emit(e,n)},t?function(n){i.emit(t,n)}:void 0,o?function(n){i.emit(o,n)}:void 0)},n}function i(n,e){var t=("string"==typeof n||"symbol"==typeof n)&&n||r(),i=o({}),f=!(!e||!e.replace),u=function(n){c(i,h,n)},l=function(n){return function(e){n.apply(i,e)}}(i.emit);return a(i,"events",[]),c(i,"id",t),i.collect=function(){return i[h]!==g&&u(g),i},i.emit=function(){var n,e=Array(arguments.length);for(n=0;n<e.length;++n)e[n]=arguments[n];if(i[h]===x)l(e);else{if(f){var t,o=e[0];for(n=0,t=i.events.length;t>n;n++)if(i.events[n][0]===o)return void(i.events[n]=e)}i.events.push(e)}},i.play=function(){return i[h]!==x&&(u(x),i.events.forEach(l),i.events.length=0),i},i.toggle=function(){return i[h]!==x?i.play():i.collect()},i.play()}function r(){var n="xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g,function(n){var e=16*Math.random()|0,t="x"==n?e:3&e|8;return t.toString(16)});return p?Symbol(n):n}function f(){return"undefined"!=typeof Symbol}function u(){return"undefined"!=typeof Map}function c(n,e,t){return Object.defineProperty(n,e,{value:t,configurable:!0,enumerable:!0}),n}function l(n,e){var t,o=Object.keys(e);for(t=o.length;t--;)c(n,o[t],e[o[t]]);return n}function a(n,e,t){return Object.defineProperty(n,e,{value:t,configurable:!0}),n}var s=u(),p=f(),d="undefined"!=typeof console,v=p?function(){return Symbol.eventize||(Symbol.eventize=Symbol("eventize")),Symbol.eventize}():"@@eventize",y="*",b="[eventize.js]";o.is=function(n){return!(!n||!n[v])},a(o,"EventizeNamespace",v),a(o,"queues",s?new Map:{}),o.queue=function(n){var e,t,r=arguments.length;return r>=1&&("object"==typeof n&&2!==r||(e=s?o.queues.get(n):o.queues[n]),2===r?t=arguments[1]:1===r&&"object"==typeof n&&(t=n)),e||(e=i(n,t),s?o.queues.set(e.id,e):o.queues[e.id]=e),e};var h="state",x="play",g="collect";e.exports=o},{}]},{},[1])(1)});