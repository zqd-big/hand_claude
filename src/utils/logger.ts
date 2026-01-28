import kleur from "kleur";

export interface LoggerOptions {
  enabled: boolean;
  verbose: boolean;
}

export class Logger {
  private readonly enabled: boolean;
  private readonly verboseEnabled: boolean;

  constructor(opts: LoggerOptions) {
    this.enabled = opts.enabled;
    this.verboseEnabled = opts.verbose;
  }

  info(msg: string): void {
    if (!this.enabled) return;
    // eslint-disable-next-line no-console
    console.log(kleur.cyan("[hc]"), msg);
  }

  warn(msg: string): void {
    if (!this.enabled) return;
    // eslint-disable-next-line no-console
    console.warn(kleur.yellow("[hc]"), msg);
  }

  error(msg: string): void {
    if (!this.enabled) return;
    // eslint-disable-next-line no-console
    console.error(kleur.red("[hc]"), msg);
  }

  verbose(msg: string): void {
    if (!this.enabled || !this.verboseEnabled) return;
    // eslint-disable-next-line no-console
    console.log(kleur.gray("[hc:verbose]"), msg);
  }
}