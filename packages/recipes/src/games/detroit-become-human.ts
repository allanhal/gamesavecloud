import { defineRecipe } from "../types";

/**
 * Candidate paths, most likely first — `firstExisting` picks whichever is really
 * on disk, so listing extras is free. Confirm on your own machine with:
 *   gamesync find-saves "Detroit: Become Human"
 * and replace this list with what it reports.
 */
const SAVES = [
  "<winSavedGames>/Detroit Become Human",
  "<winDocuments>/Quantic Dream/Detroit Become Human",
  "<winDocuments>/My Games/Detroit Become Human",
  "<winLocalAppData>/Detroit Become Human/Saved/SaveGames",
  "<winLocalAppData>/Detroit Become Human",
  "<winLocalAppData>/QuanticDream/Detroit Become Human",
  "<winAppData>/Quantic Dream/Detroit Become Human",
  "<winLocalLow>/Quantic Dream/Detroit Become Human",
];

export default defineRecipe({
  id: "detroit-become-human",
  name: "Detroit: Become Human",
  platforms: {
    steam: { appId: "1222140", saves: SAVES },
    // Epic AppName comes from the .item manifest; `gamesync detect` fills it in
    // at runtime, so launching works even before it's hard-coded here.
    epic: { saves: SAVES },
  },
  // checkpoint saves are large; keep logs and crash dumps out of every version
  exclude: ["**/*.log", "**/logs/**", "**/Crashes/**", "**/*.dmp"],
  notes: "Checkpoint-based, saves run large. Verify the path with `gamesync find-saves`.",
});
