import dotenv from "dotenv";
import { Codex } from "@codex-data/sdk";

// Load environment variables
dotenv.config();

const codex = new Codex(process.env.CODEX_API_KEY);

const main = async () => {
  const webhooks = await codex.queries.getWebhooks();

  const webhookIds = webhooks.getWebhooks.items.map(item => item.id);

  await codex.mutations.deleteWebhooks({
    input: {
        webhookIds
    }
  })
};

main();
