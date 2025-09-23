import "reflect-metadata";
import {
  container,
  getInitializationState,
  setInitializationState,
} from "./ioc-container";
import { TYPES } from "./types";
import { PriceGoUpBotService } from "./services/price-go-up-bot.service";
import { VolumeEngineService } from "./services/volume-engine.service";
import { botToken } from "./config";
import { Telegraf } from "telegraf";

// Initialize services
async function initializeServices() {
  // Check if already initialized
  if (getInitializationState()) {
    console.log("✅ Services already initialized, skipping...");
    return;
  }

  console.log("🔄 Initializing PriceGoUpBot services...");

  try {
    // Get service instances
    const priceGoUpBot = container.get<PriceGoUpBotService>(
      TYPES.PriceGoUpBotService,
    );
    const volumeEngine = container.get<VolumeEngineService>(
      TYPES.VolumeEngineService,
    );

    // Initialize services
    await volumeEngine.initialize();
    await priceGoUpBot.initialize();

    // Mark as initialized
    setInitializationState(true);
    console.log("✅ All PriceGoUpBot services initialized successfully");
  } catch (error) {
    console.error("❌ Error initializing services:", error);
    throw error;
  }
}

// Start bot
async function startBot() {
  try {
    console.log("🔄 Starting bot...");

    // Initialize services
    await initializeServices();

    // Get bot instance from container
    const bot = container.get<Telegraf>(TYPES.Bot);

    // Add catch-all error handler
    bot.catch((err: unknown) => {
      console.error("❌ Bot error:", err);
    });

    // Start bot
    await bot.launch();
    console.log("✅ Bot started successfully");

    // Enable graceful stop
    process.once("SIGINT", () => bot.stop("SIGINT"));
    process.once("SIGTERM", () => bot.stop("SIGTERM"));
  } catch (error) {
    console.error("❌ Error starting bot:", error);
    process.exit(1);
  }
}

// Export the webhook handler for Vercel
export const webhookHandler = async (
  req: {
    body: { update_id?: number; [key: string]: unknown };
    method: string;
    headers: Record<string, string | string[] | undefined>;
  },
  res: { status: (code: number) => { json: (data: unknown) => void } },
) => {
  console.log("🔔 Webhook received:", {
    method: req.method,
    body: JSON.stringify(req.body, null, 2),
    headers: req.headers,
  });

  try {
    // Log bot token status
    console.log("🤖 Bot token status:", botToken ? "Present" : "Missing");

    // Initialize services if needed
    console.log("🔄 Ensuring services are initialized...");
    await initializeServices();

    // Validate the update
    if (!req.body || !req.body.update_id) {
      console.error("❌ Invalid update received:", req.body);
      return res.status(400).json({ error: "Invalid update format" });
    }

    // Get bot instance from container and handle update
    console.log("📥 Processing update:", req.body.update_id);
    const bot = container.get<Telegraf>(TYPES.Bot);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await bot.handleUpdate(req.body as any);
    console.log("✅ Update handled successfully");

    return res.status(200).json({ ok: true });
  } catch (error) {
    console.error("❌ Webhook error:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
};

// Start the bot if not in Vercel environment
if (process.env.VERCEL !== "1") {
  startBot();
  console.log("Bot started in polling mode");
} else {
  console.log("Running in Vercel environment, webhook mode");
}

// Export the container-based bot instance
export default container.get<Telegraf>(TYPES.Bot);
