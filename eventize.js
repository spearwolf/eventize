/**
 * ===============================================================
 * eventize.js v0.0.8 -- https://github.com/spearwolf/eventize
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
!function(n){if("object"==typeof exports&&"undefined"!=typeof module)module.exports=n();else if("function"==typeof define&&define.amd)define([],n);else{var e;e="undefined"!=typeof window?window:"undefined"!=typeof global?global:"undefined"!=typeof self?self:this,e.eventize=n()}}(function(){return function n(e,t,r){function o(f,u){if(!t[f]){if(!e[f]){var c="function"==typeof require&&require;if(!u&&c)return c(f,!0);if(i)return i(f,!0);var a=Error("Cannot find module '"+f+"'");throw a.code="MODULE_NOT_FOUND",a}var l=t[f]={exports:{}};e[f][0].call(l.exports,function(n){var t=e[f][1][n];return o(t?t:n)},l,l.exports,n,e,t,r)}return t[f].exports}for(var i="function"==typeof require&&require,f=0;f<r.length;f++)o(r[f]);return o}({1:[function(n,e,t){"use strict";function r(n){function e(){return++d.lastCallbackId}function t(n,e){return n.prio!==e.prio?e.prio-n.prio:n.id-e.id}function l(n){if(n){var e=d.boundObjects.indexOf(n);return-1===e&&d.boundObjects.push(n),n}}function s(n,e,t){var o,i,f,u;for(i in t)t.hasOwnProperty(i)&&(f=e[i],"function"==typeof f&&(o=t[i],Array.isArray(o)?(u=o[0],o=o[1]):u=r.PRIO_DEFAULT,n.on(o,u,f)));return n}function p(n,e,t){function o(){var e,r,o;if(p)for(e=0;p>e;e++)r=d.boundObjects[e],r[u]?t(null,r):(o=r[n],"function"==typeof o&&t(o,r))}if(!(y.silenced||y.off.indexOf(n)>=0)){var i,f,a,l=d.callbacks[n],s=d.callbacks[c],p=d.boundObjects.length,g=!1;if(l||s.length)for(l=l?l.concat(s):s,f=l.length,i=0;f>i;i++)a=l[i],!g&&a&&a.prio<r.PRIO_DEFAULT&&(o(),g=!0),e(a);g||o()}}if(n[u])return n;var d={lastCallbackId:0,callbacks:{},boundObjects:[]};d.callbacks[c]=[];var y=i({},{silenced:!1,off:[]});return f(n,u,y),void 0===r.PRIO_DEFAULT&&i(r,{PRIO_MAX:Number.POSITIVE_INFINITY,PRIO_A:1e9,PRIO_B:1e7,PRIO_C:1e5,PRIO_DEFAULT:0,PRIO_LOW:-1e5,PRIO_MIN:Number.NEGATIVE_INFINITY}),n.on=function(n,f,u){var l=arguments.length;if(0===l)return void(y.silenced&&(o(y,"silenced",!1),y.off.length=0));var s;if(1===l){if("string"==typeof n)return s=y.off.indexOf(n),void(s>=0&&y.off.splice(s,1));if("object"!=typeof n&&"function"!=typeof n)return void console.warn(a,".on() called with insufficient arguments!",arguments);u=n,n=c,f=r.PRIO_DEFAULT}2===l&&(u=f,f=r.PRIO_DEFAULT);var p=d.callbacks,g=p[n]||(p[n]=[]),v=e(),b=i({},{id:v,fn:u,prio:"number"!=typeof f?r.PRIO_DEFAULT:f,isFunction:"function"==typeof u});return g.push(b),g.sort(t),v},n.once=function(e,t,o){var i=arguments.length;if(!i||i>3)return void console.warn(a,".once() called with insufficient arguments!",arguments);1===i?(o=e,e=c,t=r.PRIO_DEFAULT):2===i&&(o=t,t=r.PRIO_DEFAULT);var f=n.on(e,t,function(){var e=o.apply(this,arguments);return n.off(f),e});return f},n.off=function(n){if(0===arguments.length)return void(y.silenced||(o(y,"silenced",!0),y.off.length=0));if("string"==typeof n)return void(-1===y.off.indexOf(n)&&y.off.push(n));var e,t,r,i,f,u=d.callbacks,c="object"==typeof n;if("number"==typeof n||"function"==typeof n||c)for(f=Object.keys(u),r=0;r<f.length;r++)for(i=u[f[r]],t=0;t<i.length;t++)if(e=i[t],(e.id===n||e.fn===n)&&(i.splice(t,1),!c))return;c&&(t=d.boundObjects.indexOf(n),t>=0&&d.boundObjects.splice(t,1))},n.connect=function(n,e){var t=arguments.length;return 1===t?l(n):2===t?s(this,n,e):void console.warn(a,".connect() called with insufficient arguments!",arguments)},n.emit=function(n){var e,t,r,o=this;arguments.length>1&&"string"!=typeof arguments[0]&&"string"==typeof arguments[1]?(t=Array.prototype.slice.call(arguments,2),n=arguments[1],e=arguments[0],t[t.length-1]=e,r=t):(t=Array.prototype.slice.call(arguments,1),r=t.concat([o])),p(n,function(e){if(e.isFunction)e.fn.apply(o,t);else if(e.fn[u])e.fn.emit.apply(e.fn,[n].concat(t));else{var i=e.fn[n];"function"==typeof i&&i.apply(e.fn,r)}},function(e,t){e?e.apply(t,r):t.emit.apply(t,[o,n].concat(r))})},n.emitReduce=function(n){function e(n){void 0!==n&&(t=n)}var t,r=Array.prototype.slice.call(arguments,1);0===r.length?(t={},r.push(t)):e(r[0]);var o=this,i=[n].concat(r),f=r.concat([o]);return p(n,function(c){if(c.isFunction)r[0]=t,e(c.fn.apply(o,r));else if(c.fn[u])i[1]=t,e(c.fn.emitReduce.apply(c.fn,i));else{var a=c.fn[n];"function"==typeof a&&(f[0]=t,e(a.apply(c.fn,f)))}},function(n,r){n&&(f[0]=t,e(n.apply(r,f)))}),t},n}function o(n,e,t){return Object.defineProperty(n,e,{value:t,configurable:!0,enumerable:!0}),n}function i(n,e){var t,r=Object.keys(e);for(t=r.length;t--;)o(n,r[t],e[r[t]]);return n}function f(n,e,t){return Object.defineProperty(n,e,{value:t,configurable:!0}),n}var u="_eventize",c="*",a="[eventize.js]";r.is=function(n){return!(!n||!n[u])},e.exports=r},{}]},{},[1])(1)});
