export type Platform = "steam" | "epic" | "gog" | "xbox" | "manual";

export interface PlatformConfig {
  /** Steam appid — also used to launch via steam://rungameid/<appId>. */
  appId?: string;
  /** Epic AppName from the .item manifest — launch via com.epicgames.launcher://apps/<appName>. */
  appName?: string;
  /**
   * Save roots, most-likely first. Support placeholders:
   *   <winDocuments> <winAppData> <winLocalAppData> <winLocalLow> <winSavedGames>
   *   <winPublic> <home> <installDir> <steamUserId>
   * The first path that exists on disk wins.
   */
  saves: string[];
  /** Valve already syncs these — we still back them up, but flag it in `detect`. */
  steamCloud?: boolean;
}

export interface Recipe {
  /** stable slug — this is the server-side game key, never change it once used */
  id: string;
  name: string;
  platforms: Partial<Record<Platform, PlatformConfig>>;
  /** glob filters applied under the resolved save root */
  include?: string[];
  exclude?: string[];
  /** where to read playtime/progress from, for conflict dialogs (Phase 4+) */
  notes?: string;
}

export const defineRecipe = (r: Recipe): Recipe => r;
