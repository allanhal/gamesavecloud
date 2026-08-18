import { defineRecipe } from "../types";

export default defineRecipe({
  id: "detroit-become-human",
  name: "Detroit: Become Human",
  platforms: {
    steam: {
      appId: "1222140",
      saves: [
        "<winSavedGames>/Detroit Become Human",
        "<winDocuments>/Quantic Dream/Detroit Become Human",
        "<winLocalAppData>/Detroit Become Human",
      ],
    },
    epic: {
      saves: [
        "<winSavedGames>/Detroit Become Human",
        "<winLocalAppData>/Detroit Become Human",
      ],
    },
  },
  notes: "Checkpoint saves are large. VERIFY path on disk before trusting.",
});
