"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.Logger = void 0;
const kleur_1 = __importDefault(require("kleur"));
class Logger {
    enabled;
    verboseEnabled;
    constructor(opts) {
        this.enabled = opts.enabled;
        this.verboseEnabled = opts.verbose;
    }
    info(msg) {
        if (!this.enabled)
            return;
        // eslint-disable-next-line no-console
        console.log(kleur_1.default.cyan("[hc]"), msg);
    }
    warn(msg) {
        if (!this.enabled)
            return;
        // eslint-disable-next-line no-console
        console.warn(kleur_1.default.yellow("[hc]"), msg);
    }
    error(msg) {
        if (!this.enabled)
            return;
        // eslint-disable-next-line no-console
        console.error(kleur_1.default.red("[hc]"), msg);
    }
    verbose(msg) {
        if (!this.enabled || !this.verboseEnabled)
            return;
        // eslint-disable-next-line no-console
        console.log(kleur_1.default.gray("[hc:verbose]"), msg);
    }
}
exports.Logger = Logger;
//# sourceMappingURL=logger.js.map