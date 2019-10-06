/*!
 * =============================================================================
 * @spearwolf/eventize v0.6.8 -- https://github.com/spearwolf/eventize.git
 * =============================================================================
 *
 * Copyright 2015-2019 Wolfger Schramm <wolfger@spearwolf.de>
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
!function(e,t){"object"==typeof exports&&"undefined"!=typeof module?module.exports=t():"function"==typeof define&&define.amd?define(t):(e=e||self).eventize=t()}(this,(function(){"use strict";const e="*",t=1,s=2,i=4,r=Number.POSITIVE_INFINITY,n=Number.NEGATIVE_INFINITY,o=(()=>(Symbol.eventize||(Symbol.eventize=Symbol("eventize")),Symbol.eventize))(),a=(e,t,s)=>{"function"==typeof t&&t.apply(e,s)},l=(e,t,s)=>a(t,t.emit,[e].concat(s)),c=e=>{switch(typeof e){case"function":return t;case"string":return s;case"object":return i}};let h=0;const f=()=>++h;class m{constructor(t,s,i,r=null){this.id=f(),this.eventName=t,this.isCatchEmAll=t===e,this.listener=i,this.listenerObject=r,this.priority=s,this.listenerType=c(i),this.callAfterApply=void 0,this.isRemoved=!1}isEqual(t,s=null){return t===this||("number"==typeof t&&t===this.id||(null===s&&"string"==typeof t?t===e||t===this.eventName:this.listener===t&&this.listenerObject===s))}apply(e,r){if(this.isRemoved)return;const{listener:n,listenerObject:o}=this;switch(this.listenerType){case t:a(o,n,r),this.callAfterApply&&this.callAfterApply();break;case s:a(o,o[n],r),this.callAfterApply&&this.callAfterApply();break;case i:{const t=n[e];(this.isCatchEmAll||this.eventName===e)&&("function"==typeof t?t.apply(n,r):l(e,n,r),this.callAfterApply&&this.callAfterApply());break}}}}const p=(e,t)=>e.priority!==t.priority?t.priority-e.priority:e.id-t.id,y=e=>{if(e)return e.slice(0)},u=(e,t)=>{const s=e.indexOf(t);s>-1&&e.splice(s,1)},d=(e,t,s)=>{const i=e.findIndex(e=>e.isEqual(t,s));i>-1&&(e[i].isRemoved=!0,e.splice(i,1))},A=e=>{e&&(e.forEach(e=>{e.isRemoved=!0}),e.length=0)};class v{constructor(){this.namedListeners=new Map,this.catchEmAllListeners=[]}add(e){if(e.isCatchEmAll)this.catchEmAllListeners.push(e),this.catchEmAllListeners.sort(p);else{const{eventName:t}=e;let s=this.namedListeners.get(t);s||(s=[],this.namedListeners.set(t,s)),s.push(e),s.sort(p)}}remove(t,s){if(null==s&&Array.isArray(t))t.forEach(this.remove.bind(this));else if(null==t||null==s&&t===e)this.removeAllListeners();else if(null==s&&"string"==typeof t){const e=this.namedListeners.get(t);A(e)}else t instanceof m?(t.isRemoved=!0,this.namedListeners.forEach(e=>u(e,t)),u(this.catchEmAllListeners,t)):(this.namedListeners.forEach(e=>d(e,t,s)),d(this.catchEmAllListeners,t,s))}removeAllListeners(){this.namedListeners.forEach(e=>A(e)),this.namedListeners.clear(),A(this.catchEmAllListeners)}forEach(t,s){const i=y(this.catchEmAllListeners),r=y(this.namedListeners.get(t));if(t!==e&&r&&0!==r.length)if(0===i.length)r.forEach(s);else{const e=r.length,t=i.length;let n=0,o=0;for(;n<e||o<t;){if(n<e){const e=r[n];if(o>=t||e.priority>=i[o].priority){s(e),++n;continue}}o<t&&(s(i[o]),++o)}}else i.forEach(s)}}class E{constructor(){this.events=new Map,this.eventNames=new Set}add(e){Array.isArray(e)?e.forEach(e=>this.eventNames.add(e)):this.eventNames.add(e)}remove(e){Array.isArray(e)?e.forEach(e=>this.remove(e)):this.eventNames.delete(e)}retain(e,t){this.eventNames.has(e)&&this.events.set(e,t)}isKnown(e){return this.eventNames.has(e)}emit(t,s){if(t===e)this.eventNames.forEach(e=>this.emit(e,s));else{const e=this.events.get(t);e&&s.apply(t,e)}}}const b=(e,t,s)=>(Object.defineProperty(e,t,{value:s,configurable:!0}),e),g="undefined"!=typeof console,L=g?console[console.warn?"warn":"log"].bind(console,"[@spearwolf/eventize]"):()=>void 0,N=(t,s,i)=>{const r=i.length,n=typeof i[0];let o,a,l,c;if(r>=2&&r<=3&&"number"===n?(o=e,[a,l,c]=i):r>=3&&r<=4&&"number"==typeof i[1]?[o,a,l,c]=i:(a=0,"string"===n||Array.isArray(i[0])?[o,l,c]=i:(o=e,[l,c]=i)),!l&&g)return void L("called with insufficient arguments!",i);const h=e=>i=>((e,t,s,i,r,n)=>{const o=new m(s,i,r,n);return e.add(o),t.emit(s,o),o})(t,s,i,e,l,c);return Array.isArray(o)?o.map(e=>Array.isArray(e)?h(e[1])(e[0]):h(a)(e)):h(a)(o)},I=e=>t=>{t.callAfterApply=()=>e.off(t)};function O(t){if(t[o])return t;const s=new v,i=new E;return b(t,o,{keeper:i,store:s}),Object.assign(t,{on:(...e)=>N(s,i,e),once(...e){const r=N(s,i,e);return Array.isArray(r)?r.forEach(I(t)):I(t)(r),r},off(e,t){s.remove(e,t),Array.isArray(e)?i.remove(e.filter(e=>"string"==typeof e)):"string"==typeof e&&i.remove(e)},emit(t,...r){Array.isArray(t)?t.forEach(e=>{s.forEach(e,t=>t.apply(e,r)),i.retain(e,r)}):t!==e&&(s.forEach(t,e=>e.apply(t,r)),i.retain(t,r))},retain(e){i.add(e)}}),t}function w(e){return O(e)}return w.inject=O,w.extend=e=>O(Object.create(e)),w.create=t=>{const s=O({});return s.on(e,0,t),s},w.is=e=>!(!e||!e[o]),Object.assign(w,{PRIO_MAX:r,PRIO_A:1e9,PRIO_B:1e6,PRIO_C:1e3,PRIO_DEFAULT:0,PRIO_LOW:-1e4,PRIO_MIN:n}),w}));
//# sourceMappingURL=eventize.umd.js.map
