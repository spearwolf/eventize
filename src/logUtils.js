
import { LOG_NAMESPACE } from './constants';

export const hasConsole = typeof console !== 'undefined';

export const warn = hasConsole ? console[console.warn ? 'warn' : 'log'].bind(console, LOG_NAMESPACE) : () => undefined; // eslint-disable-line
