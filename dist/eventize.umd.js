/*!
 * =============================================================================
 * eventize-js v1.1.1 -- https://github.com/spearwolf/eventize.git
 * =============================================================================
 *
 * Copyright 2015-2020 Wolfger Schramm <wolfger@spearwolf.de>
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
!function(e,t){"object"==typeof exports&&"undefined"!=typeof module?module.exports=t():"function"==typeof define&&define.amd?define(t):(e=e||self).eventize=t()}(this,(function(){"use strict";const e=Number.POSITIVE_INFINITY,t=Number.NEGATIVE_INFINITY,s=(Symbol.eventize||(Symbol.eventize=Symbol("eventize")),Symbol.eventize),i=(e,t,s)=>{"function"==typeof t&&t.apply(e,s)};let r=0;class n{constructor(e,t,s,i=null){this.id=++r,this.eventName=e,this.isCatchEmAll="*"===e,this.listener=s,this.listenerObject=i,this.priority=t,this.listenerType=(e=>{switch(typeof e){case"function":return 1;case"string":return 2;case"object":return 4}})(s),this.callAfterApply=void 0,this.isRemoved=!1}isEqual(e,t=null){return e===this||("number"==typeof e&&e===this.id||(null===t&&"string"==typeof e?"*"===e||e===this.eventName:this.listener===e&&this.listenerObject===t))}apply(e,t){if(this.isRemoved)return;const{listener:s,listenerObject:r}=this;switch(this.listenerType){case 1:i(r,s,t),this.callAfterApply&&this.callAfterApply();break;case 2:i(r,r[s],t),this.callAfterApply&&this.callAfterApply();break;case 4:{const r=s[e];(this.isCatchEmAll||this.eventName===e)&&("function"==typeof r?r.apply(s,t):((e,t,s)=>{i(t,t.emit,[e].concat(s))})(e,s,t),this.callAfterApply&&this.callAfterApply());break}}}}const a=(e,t)=>e.priority!==t.priority?t.priority-e.priority:e.id-t.id,l=e=>{if(e)return e.slice(0)},o=(e,t)=>{const s=e.indexOf(t);s>-1&&e.splice(s,1)},c=(e,t,s)=>{const i=e.findIndex(e=>e.isEqual(t,s));i>-1&&(e[i].isRemoved=!0,e.splice(i,1))},h=e=>{e&&(e.forEach(e=>{e.isRemoved=!0}),e.length=0)};class f{constructor(){this.namedListeners=new Map,this.catchEmAllListeners=[]}add(e){if(e.isCatchEmAll)this.catchEmAllListeners.push(e),this.catchEmAllListeners.sort(a);else{const{eventName:t}=e;let s=this.namedListeners.get(t);s||(s=[],this.namedListeners.set(t,s)),s.push(e),s.sort(a)}}remove(e,t){if(null==t&&Array.isArray(e))e.forEach(this.remove.bind(this));else if(null==e||null==t&&"*"===e)this.removeAllListeners();else if(null==t&&"string"==typeof e){const t=this.namedListeners.get(e);h(t)}else e instanceof n?(e.isRemoved=!0,this.namedListeners.forEach(t=>o(t,e)),o(this.catchEmAllListeners,e)):(this.namedListeners.forEach(s=>c(s,e,t)),c(this.catchEmAllListeners,e,t))}removeAllListeners(){this.namedListeners.forEach(e=>h(e)),this.namedListeners.clear(),h(this.catchEmAllListeners)}forEach(e,t){const s=l(this.catchEmAllListeners),i=l(this.namedListeners.get(e));if("*"!==e&&i&&0!==i.length)if(0===s.length)i.forEach(t);else{const e=i.length,r=s.length;let n=0,a=0;for(;n<e||a<r;){if(n<e){const e=i[n];if(a>=r||e.priority>=s[a].priority){t(e),++n;continue}}a<r&&(t(s[a]),++a)}}else s.forEach(t)}}class m{constructor(){this.events=new Map,this.eventNames=new Set}add(e){Array.isArray(e)?e.forEach(e=>this.eventNames.add(e)):this.eventNames.add(e)}remove(e){Array.isArray(e)?e.forEach(e=>this.remove(e)):this.eventNames.delete(e)}retain(e,t){this.eventNames.has(e)&&this.events.set(e,t)}isKnown(e){return this.eventNames.has(e)}emit(e,t){if("*"===e)this.eventNames.forEach(e=>this.emit(e,t));else{const s=this.events.get(e);s&&t.apply(e,s)}}}const p="undefined"!=typeof console,y=p?console[console.warn?"warn":"log"].bind(console,"[eventize]"):()=>{},u=(e,t,s)=>{const i=s.length,r=typeof s[0];let a,l,o,c;if(i>=2&&i<=3&&"number"===r?(a="*",[l,o,c]=s):i>=3&&i<=4&&"number"==typeof s[1]?[a,l,o,c]=s:(l=0,"string"===r||Array.isArray(s[0])?[a,o,c]=s:(a="*",[o,c]=s)),!o&&p)return void y("called with insufficient arguments!",s);const h=s=>i=>((e,t,s,i,r,a)=>{const l=new n(s,i,r,a);return e.add(l),t.emit(s,l),l})(e,t,i,s,o,c);return Array.isArray(a)?a.map(e=>Array.isArray(e)?h(e[1])(e[0]):h(l)(e)):h(l)(a)},d=e=>t=>{t.callAfterApply=()=>e.off(t)},A=(e,t)=>{const s=()=>e.off(t);return Object.defineProperties(s,Array.isArray(t)?{listeners:{get:()=>t}}:{listener:{get:()=>t}}),s};function v(e){if(e[s])return e;const t=new f,i=new m;return((e,t,s)=>{Object.defineProperty(e,t,{value:s,configurable:!0})})(e,s,{keeper:i,store:t}),Object.assign(e,{on:(...s)=>A(e,u(t,i,s)),once(...s){const r=u(t,i,s);return Array.isArray(r)?r.forEach(d(e)):d(e)(r),A(e,r)},off(e,s){t.remove(e,s),Array.isArray(e)?i.remove(e.filter(e=>"string"==typeof e)):"string"==typeof e&&i.remove(e)},emit(e,...s){Array.isArray(e)?e.forEach(e=>{t.forEach(e,t=>t.apply(e,s)),i.retain(e,s)}):"*"!==e&&(t.forEach(e,t=>t.apply(e,s)),i.retain(e,s))},retain(e){i.add(e)}}),e}function E(e){return v(e)}return E.inject=v,E.extend=e=>v(Object.create(e)),E.create=e=>{const t=v({});return t.on("*",0,e),t},E.is=e=>!(!e||!e[s]),Object.assign(E,{PRIO_MAX:e,PRIO_A:1e9,PRIO_B:1e6,PRIO_C:1e3,PRIO_DEFAULT:0,PRIO_LOW:-1e4,PRIO_MIN:t}),E}));
//# sourceMappingURL=eventize.umd.js.map