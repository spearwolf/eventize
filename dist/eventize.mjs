/*!
 * =============================================================================
 * @spearwolf/eventize v0.6.7 -- https://github.com/spearwolf/eventize.git
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
var e="*",t=1,r=2,i=4,s=Number.POSITIVE_INFINITY,n=1e9,a=1e6,l=1e3,h=0,o=-1e4,c=Number.NEGATIVE_INFINITY,f=(()=>(Symbol.eventize||(Symbol.eventize=Symbol("eventize")),Symbol.eventize))(),v=(e,t,r)=>{"function"==typeof t&&t.apply(e,r)},m=(e,t,r)=>v(t,t.emit,[e].concat(r)),y=e=>{switch(typeof e){case"function":return t;case"string":return r;case"object":return i}},p=0,A=()=>++p;class d{constructor(t,r,i){var s=arguments.length>3&&void 0!==arguments[3]?arguments[3]:null;this.id=A(),this.eventName=t,this.isCatchEmAll=t===e,this.listener=i,this.listenerObject=s,this.priority=r,this.listenerType=y(i),this.callAfterApply=void 0,this.isRemoved=!1}isEqual(t){var r=arguments.length>1&&void 0!==arguments[1]?arguments[1]:null;return t===this||("number"==typeof t&&t===this.id||(null===r&&"string"==typeof t?t===e||t===this.eventName:this.listener===t&&this.listenerObject===r))}apply(e,s){if(!this.isRemoved){var{listener:n,listenerObject:a}=this;switch(this.listenerType){case t:v(a,n,s),this.callAfterApply&&this.callAfterApply();break;case r:v(a,a[n],s),this.callAfterApply&&this.callAfterApply();break;case i:var l=n[e];(this.isCatchEmAll||this.eventName===e)&&("function"==typeof l?l.apply(n,s):m(e,n,s),this.callAfterApply&&this.callAfterApply())}}}}var u=(e,t)=>e.priority!==t.priority?t.priority-e.priority:e.id-t.id,E=e=>{if(e)return e.slice(0)},g=(e,t)=>{var r=e.indexOf(t);r>-1&&e.splice(r,1)},b=(e,t,r)=>{var i=e.findIndex(e=>e.isEqual(t,r));i>-1&&(e[i].isRemoved=!0,e.splice(i,1))},L=e=>{e&&(e.forEach(e=>{e.isRemoved=!0}),e.length=0)};class N{constructor(){this.namedListeners=new Map,this.catchEmAllListeners=[]}add(e){if(e.isCatchEmAll)this.catchEmAllListeners.push(e),this.catchEmAllListeners.sort(u);else{var{eventName:t}=e,r=this.namedListeners.get(t);r||(r=[],this.namedListeners.set(t,r)),r.push(e),r.sort(u)}}remove(t,r){if(null==r&&Array.isArray(t))t.forEach(this.remove.bind(this));else if(null==t||null==r&&t===e)this.removeAllListeners();else if(null==r&&"string"==typeof t){var i=this.namedListeners.get(t);L(i)}else t instanceof d?(t.isRemoved=!0,this.namedListeners.forEach(e=>g(e,t)),g(this.catchEmAllListeners,t)):(this.namedListeners.forEach(e=>b(e,t,r)),b(this.catchEmAllListeners,t,r))}removeAllListeners(){this.namedListeners.forEach(e=>L(e)),this.namedListeners.clear(),L(this.catchEmAllListeners)}forEach(t,r){var i=E(this.catchEmAllListeners),s=E(this.namedListeners.get(t));if(t!==e&&s&&0!==s.length)if(0===i.length)s.forEach(r);else for(var n=s.length,a=i.length,l=0,h=0;l<n||h<a;){if(l<n){var o=s[l];if(h>=a||o.priority>=i[h].priority){r(o),++l;continue}}h<a&&(r(i[h]),++h)}else i.forEach(r)}}class I{constructor(){this.events=new Map,this.eventNames=new Set}add(e){Array.isArray(e)?e.forEach(e=>this.eventNames.add(e)):this.eventNames.add(e)}remove(e){Array.isArray(e)?e.forEach(e=>this.remove(e)):this.eventNames.delete(e)}retain(e,t){this.eventNames.has(e)&&this.events.set(e,t)}isKnown(e){return this.eventNames.has(e)}emit(t,r){if(t===e)this.eventNames.forEach(e=>this.emit(e,r));else{var i=this.events.get(t);i&&r.apply(t,i)}}}var O=(e,t,r)=>(Object.defineProperty(e,t,{value:r,configurable:!0}),e),w="undefined"!=typeof console,R=w?console[console.warn?"warn":"log"].bind(console,"[@spearwolf/eventize]"):()=>void 0,j=(t,r,i)=>{var s,n,a,l,h=i.length,o=typeof i[0];if(h>=2&&h<=3&&"number"===o?(s=e,[n,a,l]=i):h>=3&&h<=4&&"number"==typeof i[1]?[s,n,a,l]=i:(n=0,"string"===o||Array.isArray(i[0])?[s,a,l]=i:(s=e,[a,l]=i)),a||!w){var c=e=>i=>((e,t,r,i,s,n)=>{var a=new d(r,i,s,n);return e.add(a),t.emit(r,a),a})(t,r,i,e,a,l);return Array.isArray(s)?s.map(e=>Array.isArray(e)?c(e[1])(e[0]):c(n)(e)):c(n)(s)}R("called with insufficient arguments!",i)},P=e=>t=>{t.callAfterApply=()=>e.off(t)};function _(t){if(t[f])return t;var r=new N,i=new I;return O(t,f,{keeper:i,store:r}),Object.assign(t,{on(){for(var e=arguments.length,t=new Array(e),s=0;s<e;s++)t[s]=arguments[s];return j(r,i,t)},once(){for(var e=arguments.length,s=new Array(e),n=0;n<e;n++)s[n]=arguments[n];var a=j(r,i,s);return Array.isArray(a)?a.forEach(P(t)):P(t)(a),a},off(e,t){r.remove(e,t),Array.isArray(e)?i.remove(e.filter(e=>"string"==typeof e)):"string"==typeof e&&i.remove(e)},emit(t){for(var s=arguments.length,n=new Array(s>1?s-1:0),a=1;a<s;a++)n[a-1]=arguments[a];Array.isArray(t)?t.forEach(e=>{r.forEach(e,t=>t.apply(e,n)),i.retain(e,n)}):t!==e&&(r.forEach(t,e=>e.apply(t,n)),i.retain(t,n))},retain(e){i.add(e)}}),t}function T(e){return _(e)}T.inject=_,T.extend=e=>_(Object.create(e)),T.create=t=>{var r=_({});return r.on(e,0,t),r},T.is=e=>!(!e||!e[f]),Object.assign(T,{PRIO_MAX:s,PRIO_A:1e9,PRIO_B:1e6,PRIO_C:1e3,PRIO_DEFAULT:0,PRIO_LOW:-1e4,PRIO_MIN:c});export{e as EVENT_CATCH_EM_ALL,f as NAMESPACE,n as PRIO_A,a as PRIO_B,l as PRIO_C,h as PRIO_DEFAULT,o as PRIO_LOW,s as PRIO_MAX,c as PRIO_MIN,T as eventize};
//# sourceMappingURL=eventize.mjs.map
