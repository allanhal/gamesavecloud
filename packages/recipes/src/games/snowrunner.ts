import { defineRecipe } from "../types";

export default defineRecipe({
  id: "snowrunner",
  name: "SnowRunner",
  platforms: {
    steam: {
      appId: "1465360",
      saves: [
        "<winDocuments>/My Games/SnowRunner/base/storage",
        "<winDocuments>/My Games/SnowRunner",
      ],
    },
    epic: {
      saves: [
        "<winDocuments>/My Games/SnowRunner/base/storage",
        "<winLocalAppData>/SnowRunner/Saved/SaveGames",
      ],
    },
  },
  exclude: ["**/*.log", "**/logs/**"],
  notes: "Saves sit under a per-user id folder; sync the whole storage dir. VERIFY on disk.",
});
