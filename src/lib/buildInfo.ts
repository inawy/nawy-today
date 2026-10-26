export interface BuildInfo {
  /** Short commit hash, or `dev` for a local build. */
  readonly sha: string;
  /** Build day, `YYYY-MM-DD`. */
  readonly date: string;
}

/** Which build is running (D-052). Set at build time; `dev` when it was not. */
export const BUILD_INFO: BuildInfo = {
  sha: typeof __APP_BUILD_SHA__ === 'string' ? __APP_BUILD_SHA__ : 'dev',
  date: typeof __APP_BUILD_DATE__ === 'string' ? __APP_BUILD_DATE__ : '',
};
