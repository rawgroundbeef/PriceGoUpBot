import { Telegraf, Context, Markup } from "telegraf";
import { injectable, inject } from "inversify";
import { BaseService } from "./base.service";
import { TYPES } from "../types";
import { ErrorService, ErrorType } from "./error.service";
import { VolumeOrderService } from "./volume-order.service";
import { SolanaService } from "./solana.service";
import { PaymentService } from "./payment.service";
import { volumeBotSettings } from "../config";
import { UserSession, OrderStatus } from "../interfaces";

@injectable()
export class PriceGoUpBotService extends BaseService {
  private errorService: ErrorService;
  private volumeOrderService: VolumeOrderService;
  private solanaService: SolanaService;
  private paymentService: PaymentService;
  private userSessions: Map<string, UserSession> = new Map();

  constructor(
    @inject(TYPES.Bot) bot: Telegraf,
    @inject(TYPES.ErrorService) errorService: ErrorService,
    @inject(TYPES.VolumeOrderService) volumeOrderService: VolumeOrderService,
    @inject(TYPES.SolanaService) solanaService: SolanaService,
    @inject(TYPES.PaymentService) paymentService: PaymentService,
  ) {
    super(bot);
    this.errorService = errorService;
    this.volumeOrderService = volumeOrderService;
    this.solanaService = solanaService;
    this.paymentService = paymentService;
  }

  async initialize(): Promise<void> {
    console.log("🔄 Setting up PriceGoUpBot commands...");

    try {
      // Register commands with Telegram
      await this.bot.telegram.setMyCommands([
        {
          command: "start",
          description: "Start the bot and create volume orders",
        },
        { command: "orders", description: "View your active orders" },
        { command: "help", description: "Get help with the bot" },
      ]);
      console.log("✅ Bot commands registered successfully");
    } catch (error) {
      console.warn("⚠️ Could not register bot commands:", error);
    }

    // Setup command handlers
    this.bot.command("start", (ctx) => this.handleStartCommand(ctx));
    this.bot.command("orders", (ctx) => this.handleOrdersCommand(ctx));
    this.bot.command("help", (ctx) => this.handleHelpCommand(ctx));

    // Setup callback query handlers
    this.bot.action(/^volume_(.+)$/, (ctx) => this.handleVolumeSelection(ctx));
    this.bot.action(/^duration_(.+)$/, (ctx) =>
      this.handleDurationSelection(ctx),
    );
    this.bot.action("separator_amount", (ctx) => this.handleSeparator(ctx));
    this.bot.action("separator_duration", (ctx) => this.handleSeparator(ctx));
    this.bot.action("continue", (ctx) => this.handleContinue(ctx));
    this.bot.action("back", (ctx) => this.handleBack(ctx));
    this.bot.action(/^pool_(.+)$/, (ctx) => this.handlePoolSelection(ctx));
    this.bot.action("confirm_order", (ctx) =>
      this.handleOrderConfirmation(ctx),
    );
    this.bot.action("check_payment", (ctx) => this.handlePaymentCheck(ctx));
    this.bot.action("cancel_order", (ctx) => this.handleOrderCancellation(ctx));

    // Order management handlers
    this.bot.action(/^view_order_(.+)$/, (ctx) => this.handleViewOrder(ctx));
    this.bot.action(/^pause_order_(.+)$/, (ctx) => this.handlePauseOrder(ctx));
    this.bot.action(/^resume_order_(.+)$/, (ctx) =>
      this.handleResumeOrder(ctx),
    );
    this.bot.action(/^stop_order_(.+)$/, (ctx) => this.handleStopOrder(ctx));
    this.bot.action(/^restart_order_(.+)$/, (ctx) =>
      this.handleRestartOrder(ctx),
    );
    this.bot.action(/^delete_order_(.+)$/, (ctx) =>
      this.handleDeleteOrder(ctx),
    );
    this.bot.action(/^confirm_delete_(.+)$/, (ctx) =>
      this.handleConfirmDelete(ctx),
    );
    this.bot.action(/^orders_page_(.+)$/, (ctx) => this.handleOrdersPage(ctx));

    // Setup text message handler for token addresses
    this.bot.on("text", (ctx) => this.handleTextMessage(ctx));

    console.log("✅ PriceGoUpBot commands set up successfully");
  }

  /**
   * Handle /start command
   */
  async handleStartCommand(ctx: Context): Promise<void> {
    try {
      const userId = ctx.from?.id?.toString();
      if (!userId) return;

      // Initialize user session
      this.userSessions.set(userId, {
        userId,
        currentStep: "volume_selection",
      });

      await this.showVolumeAndDurationSelection(ctx);
    } catch (error) {
      await this.errorService.handleError(
        ctx,
        error,
        ErrorType.GENERAL,
        this.errorService.createErrorContext(
          ctx.from?.id?.toString(),
          "handleStartCommand",
          { command: "start" },
        ),
      );
    }
  }

  /**
   * Show volume and duration selection interface
   */
  async showVolumeAndDurationSelection(ctx: Context): Promise<void> {
    const session = await this.getUserSession(ctx.from?.id?.toString());
    if (!session) return;

    // Volume buttons
    const volumeButtons = volumeBotSettings.volumePackages.map((volume) => {
      const formattedVolume = this.formatVolume(volume);
      const isPopular = volume === 1000000;
      const isTrending = volume === 5000000 || volume === 10000000;
      const isSelected = session.selectedVolume === volume;

      let label = formattedVolume;
      if (isPopular) label += " ⭐ (Popular)";
      if (isTrending) label += " 🔥 (Trending)";
      if (isSelected) label = `✅ ${label}`;

      return Markup.button.callback(label, `volume_${volume}`);
    });

    // Duration buttons
    const durationButtons = volumeBotSettings.durations.map((hours) => {
      const isSelected = session.selectedDuration === hours;
      const label = isSelected
        ? `✅ ${this.formatDuration(hours)}`
        : this.formatDuration(hours);
      return Markup.button.callback(label, `duration_${hours}`);
    });

    // Arrange volume buttons in rows of 3
    const keyboard = [];

    // Add volume header
    keyboard.push([
      Markup.button.callback("Choose Volume:", "separator_amount"),
    ]);

    for (let i = 0; i < volumeButtons.length; i += 3) {
      keyboard.push(volumeButtons.slice(i, i + 3));
    }

    // Add duration separator
    keyboard.push([
      Markup.button.callback("Set Duration:", "separator_duration"),
    ]);

    // Arrange duration buttons in rows of 3
    for (let i = 0; i < durationButtons.length; i += 3) {
      keyboard.push(durationButtons.slice(i, i + 3));
    }

    // Add Continue button if both are selected
    if (session.selectedVolume && session.selectedDuration) {
      keyboard.push([Markup.button.callback("✅ Continue", "continue")]);
    }

    const tasksCount =
      session.selectedVolume && session.selectedDuration
        ? this.calculateTasksCount(
            session.selectedVolume,
            session.selectedDuration,
          )
        : 0;
    const totalCost =
      session.selectedVolume && session.selectedDuration
        ? await this.calculateTotalCost(
            session.selectedVolume,
            session.selectedDuration,
          )
        : "0";

    const message = `🚀 **PriceGoUpBot - Volume Generation**

Select volume target and duration:

Choose how fast it's delivered: from 6 hours to 7 days.

Each task runs 3 buys and 2 sells in random sizes, cycled through thousands of unlinked wallets, building buy pressure and a bullish chart. More tasks speed up the chart with additional buys at once.

Package price includes all expenses - 0% hidden fees!

🧠 All estimates below are based on Raydium's 0.25% swap fee. Pools with higher swap fees will result in lower volume and shorter duration; our swap fee is 0%.

🤖 Number of multi-tasks: ${tasksCount}
📈 Volume Selected: ${session.selectedVolume ? this.formatVolume(session.selectedVolume) : "$0"}
⏳ Duration Selected: ${session.selectedDuration ? this.formatDuration(session.selectedDuration) : "0"}

💸 Total to pay: ${totalCost} SOL`;

    if (ctx.callbackQuery) {
      try {
        await ctx.editMessageText(message, {
          parse_mode: "Markdown",
          reply_markup: Markup.inlineKeyboard(keyboard).reply_markup,
        });
      } catch (error: unknown) {
        // If message is not modified, ignore the error (content is the same)
        const errorObj = error as { code?: number; description?: string };
        if (
          errorObj.code === 400 &&
          errorObj.description?.includes("message is not modified")
        ) {
          console.log("📝 Message content unchanged, skipping edit");
          return;
        }
        throw error;
      }
    } else {
      await ctx.reply(message, {
        parse_mode: "Markdown",
        reply_markup: Markup.inlineKeyboard(keyboard).reply_markup,
      });
    }
  }

  /**
   * Handle volume selection
   */
  async handleVolumeSelection(ctx: Context): Promise<void> {
    try {
      const callbackQuery = ctx.callbackQuery;
      if (!callbackQuery || !("data" in callbackQuery)) return;

      const match = callbackQuery.data?.match(/^volume_(.+)$/);
      if (!match) return;

      const volume = parseInt(match[1]);
      const session = await this.getUserSession(ctx.from?.id?.toString());
      if (!session) return;

      // Optimistic update: Update UI immediately
      session.selectedVolume = volume;
      console.log(
        `📊 User ${session.userId} selected volume: ${this.formatVolume(volume)}`,
      );

      // Show updated UI instantly (optimistic)
      await this.showVolumeAndDurationSelection(ctx);

      // Background database operations (don't wait)
      this.handleVolumeSelectionBackground(session, ctx, volume).catch(
        (error) => {
          console.error("❌ Background volume selection error:", error);
        },
      );
    } catch (error) {
      await this.errorService.handleError(ctx, error, ErrorType.GENERAL, {});
    }
  }

  private async handleVolumeSelectionBackground(
    session: UserSession,
    ctx: Context,
    _volume: number,
  ): Promise<void> {
    console.log(
      `📊 Current session state: volume=${session.selectedVolume}, duration=${session.selectedDuration}`,
    );

    // Create draft order if both volume and duration are selected
    await this.createDraftOrderIfReady(session, ctx);
  }

  /**
   * Handle duration selection
   */
  async handleDurationSelection(ctx: Context): Promise<void> {
    try {
      const callbackQuery = ctx.callbackQuery;
      if (!callbackQuery || !("data" in callbackQuery)) return;

      const match = callbackQuery.data?.match(/^duration_(.+)$/);
      if (!match) return;

      const duration = parseInt(match[1]);
      const session = await this.getUserSession(ctx.from?.id?.toString());
      if (!session) return;

      // Optimistic update: Update UI immediately
      session.selectedDuration = duration;
      console.log(
        `⏰ User ${session.userId} selected duration: ${this.formatDuration(duration)}`,
      );

      // Show updated UI instantly (optimistic)
      await this.showVolumeAndDurationSelection(ctx);

      // Background database operations (don't wait)
      this.handleDurationSelectionBackground(session, ctx, duration).catch(
        (error) => {
          console.error("❌ Background duration selection error:", error);
        },
      );
    } catch (error) {
      await this.errorService.handleError(ctx, error, ErrorType.GENERAL, {});
    }
  }

  private async handleDurationSelectionBackground(
    session: UserSession,
    ctx: Context,
    _duration: number,
  ): Promise<void> {
    console.log(
      `📊 Current session state: volume=${session.selectedVolume}, duration=${session.selectedDuration}`,
    );

    // Create draft order if both volume and duration are selected
    await this.createDraftOrderIfReady(session, ctx);
  }

  /**
   * Handle separator button (does nothing, just for UI)
   */
  async handleSeparator(ctx: Context): Promise<void> {
    await ctx.answerCbQuery();
  }

  /**
   * Create draft order if both volume and duration are selected
   */
  private async createDraftOrderIfReady(
    session: UserSession,
    ctx: Context,
  ): Promise<void> {
    try {
      console.log(
        `📊 createDraftOrderIfReady: volume=${session.selectedVolume}, duration=${session.selectedDuration}, hasOrder=${!!session.orderData}`,
      );

      // Always ensure we have a draft order (get existing or create new)
      if (!session.orderData) {
        console.log(`🔍 No order in session, getting/creating draft order...`);
        session.orderData = await this.volumeOrderService.getOrCreateDraftOrder(
          session.userId,
          ctx.from?.username,
        );
        console.log(`✅ Draft order ready: ${session.orderData.id}`);
      }

      // Update the order with current selections if both are available
      if (session.selectedVolume && session.selectedDuration) {
        console.log(
          `📊 Both volume and duration selected, updating order with costs...`,
        );

        const costData = await this.paymentService.calculateOrderCost(
          session.selectedVolume,
          session.selectedDuration,
        );

        const updates = {
          volume_target: session.selectedVolume,
          duration_hours: session.selectedDuration,
          tasks_count: costData.tasksCount,
          cost_per_task: costData.costPerTask,
          total_cost: costData.totalCost,
          // Extend expiration since user is actively configuring
          expires_at: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
        };

        await this.volumeOrderService.updateOrder(
          session.orderData?.id || "",
          updates,
        );

        // Update session with new data
        session.orderData = { ...session.orderData, ...updates };

        console.log(
          `✅ Draft order updated: ${session.orderData.total_cost} SOL, expires in 30min`,
        );
      }
    } catch (error) {
      console.error("❌ Error managing draft order:", error);
      await ctx.reply("❌ Error creating order. Please try again.");
    }
  }

  /**
   * Handle continue button
   */
  async handleContinue(ctx: Context): Promise<void> {
    try {
      const session = await this.getUserSession(ctx.from?.id?.toString());
      if (!session || !session.selectedVolume || !session.selectedDuration) {
        await ctx.answerCbQuery(
          "Please select both volume and duration first!",
        );
        return;
      }

      // Order should already be created by createDraftOrderIfReady
      if (!session.orderData) {
        await ctx.answerCbQuery("Order data missing. Please try again.");
        return;
      }

      session.currentStep = "token_address";
      console.log(
        `🔄 Continue clicked - setting currentStep to 'token_address' for user ${session.userId}`,
      );
      await this.showOrderSummary(ctx);
    } catch (error) {
      await this.errorService.handleError(ctx, error, ErrorType.GENERAL, {});
    }
  }

  /**
   * Show order summary and request token address
   */
  async showOrderSummary(ctx: Context): Promise<void> {
    const session = await this.getUserSession(ctx.from?.id?.toString());
    if (!session || !session.selectedVolume || !session.selectedDuration)
      return;

    const tasksCount = this.calculateTasksCount(
      session.selectedVolume,
      session.selectedDuration,
    );
    const costData = await this.paymentService.calculateOrderCost(
      session.selectedVolume,
      session.selectedDuration,
    );
    const intervalMinutes = Math.floor(
      (session.selectedDuration * 60) / tasksCount,
    );

    const message = `Your configuration summary:

Each task will repeatedly buy and sell tokens with specific intervals between transactions.

⚡ ${this.formatVolume(session.selectedVolume)} - ${this.formatDuration(session.selectedDuration)}
🤖 Tasks - Interval
${tasksCount}x ${costData.costPerTask} SOL - ⏳ ${this.formatInterval(intervalMinutes)}

Total: 🟪 ${costData.totalCost} SOL

ℹ️ Once target is met, bots will continue delivering additional volume until stopped.

📄 **Send the contract address of the token you want to increase volume for.**

🔽 Please send as a chat message.`;

    await ctx.editMessageText(message, {
      parse_mode: "Markdown",
      reply_markup: Markup.inlineKeyboard([
        [Markup.button.callback("🔙 Back", "back")],
      ]).reply_markup,
    });
  }

  /**
   * Handle text messages (token addresses)
   */
  async handleTextMessage(ctx: Context): Promise<void> {
    try {
      const session = await this.getUserSession(ctx.from?.id?.toString());
      const text = (
        ctx as { message?: { text?: string } }
      ).message?.text?.trim();

      console.log(`📝 Received text message: "${text}"`);
      console.log(
        `📊 Session state: step=${session?.currentStep}, user=${session?.userId}`,
      );

      if (!session || session.currentStep !== "token_address") {
        console.log(`❌ Ignoring text message - wrong step or no session`);
        return;
      }

      if (!text) return;

      // Validate token address
      const isValid = await this.solanaService.validateTokenAddress(text);
      if (!isValid) {
        await ctx.reply(
          "❌ Invalid token address. Please send a valid Solana token contract address.",
        );
        return;
      }

      // Optimistic update: Update session and show loading immediately
      session.tokenAddress = text;
      session.currentStep = "pool_selection";

      // Show "searching for pools" message immediately
      await ctx.reply(
        "🔍 Validating token and searching for liquidity pools...",
      );

      // Perform update + pool fetch inline to avoid serverless early return
      try {
        console.log("⏳ Inline processing: updating order and fetching pools");
        const inlineTimeoutMs = 9000;
        const inlineResult = await Promise.race([
          this.handleTokenAddressBackground(session, ctx, text),
          new Promise((_, reject) =>
            setTimeout(
              () => reject(new Error("inline-timeout")),
              inlineTimeoutMs,
            ),
          ),
        ]);
        if (inlineResult === undefined) {
          // handleTokenAddressBackground returns void on success
          console.log("✅ Inline processing completed");
        }
      } catch (e) {
        const err = e as { message?: string };
        if (err?.message === "inline-timeout") {
          console.warn(
            "⚠️ Inline processing hit timeout; user will see pools when ready",
          );
        } else {
          console.error("❌ Inline token processing error:", e);
          try {
            await ctx.reply(
              "❌ Error processing token address. Please try again.",
            );
          } catch {}
        }
      }
    } catch (error) {
      await this.errorService.handleError(ctx, error, ErrorType.GENERAL, {});
    }
  }

  private async handleTokenAddressBackground(
    session: UserSession,
    ctx: Context,
    text: string,
  ): Promise<void> {
    try {
      console.log(
        `🔄 Starting background token address processing for: ${text}`,
      );

      // Update the draft order with the token address
      if (session.orderData && session.orderData.id) {
        console.log(
          `📝 Updating order ${session.orderData.id} with token address...`,
        );
        await this.volumeOrderService.updateOrder(session.orderData.id, {
          token_address: text,
        });
        console.log(`✅ Order updated successfully`);
      }

      // Show pool selection
      console.log(`🏊 Showing pool selection...`);
      await this.showPoolSelection(ctx);
      console.log(`✅ Pool selection completed`);
    } catch (error) {
      console.error(`❌ Error in handleTokenAddressBackground:`, error);
      throw error; // Re-throw to be caught by outer handler
    }
  }

  /**
   * Show liquidity pool selection
   */
  async showPoolSelection(ctx: Context): Promise<void> {
    console.log(`🏊 showPoolSelection called`);
    const session = await this.getUserSession(ctx.from?.id?.toString());
    if (!session || !session.tokenAddress) {
      console.log(`❌ No session or token address found`);
      return;
    }

    try {
      console.log(
        `🔍 Getting liquidity pools for token: ${session.tokenAddress}`,
      );
      const pools = await this.solanaService.getLiquidityPools(
        session.tokenAddress,
      );
      console.log(`📊 Received ${pools.length} pools from service`);

      if (pools.length === 0) {
        await ctx.reply(
          "❌ No liquidity pools found for this token. Please check the token address and try again.",
        );
        return;
      }

      const poolButtons = pools.slice(0, 5).map((pool, index) => {
        return Markup.button.callback(`-${index + 1}-`, `pool_${pool.address}`);
      });

      const keyboard = poolButtons.map((button) => [button]);
      keyboard.push([Markup.button.callback("🔙 Back", "back")]);

      let message = "💧 Select the liquidity pool you want to use:\n\n";

      pools.slice(0, 5).forEach((pool, index) => {
        console.log(`🔍 Pool ${index + 1} address: ${pool.address}`);
        console.log(
          `🔗 Dexscreener link: https://dexscreener.com/solana/${pool.address}`,
        );

        message += `-${index + 1}-\n`;
        message += `💧 LP Type: ${pool.pool_type.toUpperCase()}\n`;
        message += `📄 Pool address: ${pool.address}\n`;
        message += `💦 Liquidity: $${pool.liquidity_usd.toLocaleString()}\n`;
        if (pool.volume_24h) {
          message += `📊 24h Volume: $${pool.volume_24h.toLocaleString()}\n`;
        }
        message += `👀 Chart: [View on Dexscreener](https://dexscreener.com/solana/${pool.address})\n\n`;
      });

      await ctx.reply(message, {
        parse_mode: "Markdown",
        reply_markup: Markup.inlineKeyboard(keyboard).reply_markup,
      });
    } catch (error) {
      await this.errorService.handleError(ctx, error, ErrorType.GENERAL, {});
    }
  }

  /**
   * Handle pool selection
   */
  async handlePoolSelection(ctx: Context): Promise<void> {
    try {
      const callbackQuery = ctx.callbackQuery;
      if (!callbackQuery || !("data" in callbackQuery)) return;

      const match = callbackQuery.data?.match(/^pool_(.+)$/);
      if (!match) return;

      const poolAddress = match[1];
      const session = await this.getUserSession(ctx.from?.id?.toString());
      if (!session) return;

      // Optimistic update: Update UI immediately
      session.selectedPool = poolAddress;
      session.currentStep = "order_review";

      // Show order review immediately
      await this.showOrderReview(ctx);

      // Background database update
      this.handlePoolSelectionBackground(session, poolAddress).catch(
        (error) => {
          console.error("❌ Background pool selection error:", error);
        },
      );
    } catch (error) {
      await this.errorService.handleError(ctx, error, ErrorType.GENERAL, {});
    }
  }

  private async handlePoolSelectionBackground(
    session: UserSession,
    poolAddress: string,
  ): Promise<void> {
    // Update the draft order with the pool address
    if (session.orderData && session.orderData.id) {
      await this.volumeOrderService.updateOrder(session.orderData.id, {
        pool_address: poolAddress,
      });
      console.log(`📝 Updated order ${session.orderData.id} with pool address`);
    }
  }

  /**
   * Show order review
   */
  async showOrderReview(ctx: Context): Promise<void> {
    const session = await this.getUserSession(ctx.from?.id?.toString());
    if (
      !session ||
      !session.selectedVolume ||
      !session.selectedDuration ||
      !session.tokenAddress ||
      !session.selectedPool
    )
      return;

    const costData = await this.paymentService.calculateOrderCost(
      session.selectedVolume,
      session.selectedDuration,
    );
    const intervalMinutes = Math.floor(
      (session.selectedDuration * 60) / costData.tasksCount,
    );

    const message = `📋 Review your order summary:

📄 Token address:
${session.tokenAddress}

💧 Pool address:
${session.selectedPool}

🤖 Tasks - Interval:
• ${costData.tasksCount}x ${costData.costPerTask} SOL - ${this.formatInterval(intervalMinutes)}

💸 Total to pay: ${costData.totalCost} SOL

🔥 Dex Trending:
• We will start boosting your token's ranking on Dexscreener for free.
• You will be able to manage holders and Dexscreener reactions from the Trending Tools menu later.

🔽 Click below to pay your order.`;

    await ctx.reply(message, {
      reply_markup: Markup.inlineKeyboard([
        [Markup.button.callback("💳 Pay Order", "confirm_order")],
        [Markup.button.callback("🔙 Back", "back")],
      ]).reply_markup,
    });
  }

  /**
   * Handle order confirmation and payment
   */
  async handleOrderConfirmation(ctx: Context): Promise<void> {
    try {
      const session = await this.getUserSession(ctx.from?.id?.toString());
      if (!session || !session.orderData) return;

      // Order already exists as draft, just generate payment QR code
      const order = session.orderData;

      if (!order.payment_address || !order.total_cost) {
        await ctx.answerCbQuery("Order data incomplete. Please start over.");
        return;
      }

      const qrCode = await this.paymentService.generateQRCode(
        order.payment_address,
        order.total_cost,
      );

      session.currentStep = "payment_pending";

      const message = `Scan the QR code above with your mobile wallet to make your payment quickly.

Pay for your order and start your volume-growth journey!

👛 Send to:
${order.payment_address}
🟪 Amount: ${order.total_cost} SOL

🔽 If you've already made payment, click "Check & Continue" button below to proceed.`;

      await ctx.replyWithPhoto(
        { source: Buffer.from(qrCode, "base64") },
        {
          caption: message,
          reply_markup: Markup.inlineKeyboard([
            [Markup.button.callback("✅ Check & Continue", "check_payment")],
            [Markup.button.callback("❌ Cancel", "cancel_order")],
          ]).reply_markup,
        },
      );
    } catch (error) {
      await this.errorService.handleError(ctx, error, ErrorType.GENERAL, {});
    }
  }

  /**
   * Handle payment check
   */
  async handlePaymentCheck(ctx: Context): Promise<void> {
    try {
      try {
        await ctx.answerCbQuery("Checking payment...");
      } catch {
        /* Ignore callback query errors */
      }
      const session = await this.getUserSession(ctx.from?.id?.toString());
      if (!session || !session.orderData) return;

      const orderData = session.orderData;
      if (
        !orderData.payment_address ||
        !orderData.total_cost ||
        !orderData.id
      ) {
        await ctx.answerCbQuery("Order data incomplete. Please start over.");
        return;
      }

      console.log(
        `🔎 handlePaymentCheck: orderId=${orderData.id} address=${orderData.payment_address} expected=${orderData.total_cost}`,
      );
      const signature = await this.solanaService.verifyPayment(
        orderData.payment_address,
        orderData.total_cost,
      );

      if (signature) {
        // Acknowledge the button to stop the loading spinner
        try {
          await ctx.answerCbQuery("Payment confirmed!");
        } catch {
          /* Ignore callback query errors */
        }
        await this.volumeOrderService.updateOrderStatus(
          orderData.id,
          OrderStatus.PAYMENT_CONFIRMED,
        );

        await ctx.reply(`🎉 Payment confirmed! Your volume generation order is now active.

Order ID: ${orderData.id}
Transaction: ${signature}

Your bots will start generating volume shortly. Use /orders to check your order status.`);

        // Clear session
        this.userSessions.delete(session.userId);
      } else {
        try {
          await ctx.answerCbQuery(
            "Payment not found yet. Please wait a moment and try again.",
          );
        } catch {
          /* Ignore callback query errors */
        }
        await ctx.reply(
          '⌛ Still waiting for payment to arrive. If you just sent it, give it ~15–30s and press "Check & Continue" again.',
        );
      }
    } catch (error) {
      console.error("❌ handlePaymentCheck error:", error);
      await this.errorService.handleError(ctx, error, ErrorType.GENERAL, {});
    }
  }

  /**
   * Handle back button
   */
  async handleBack(ctx: Context): Promise<void> {
    const session = await this.getUserSession(ctx.from?.id?.toString());
    if (!session) return;

    switch (session.currentStep) {
      case "token_address":
        session.currentStep = "volume_selection";
        await this.showVolumeAndDurationSelection(ctx);
        break;
      case "pool_selection":
        session.currentStep = "token_address";
        await this.showOrderSummary(ctx);
        break;
      default:
        await this.showVolumeAndDurationSelection(ctx);
    }
  }

  /**
   * Handle orders command
   */
  async handleOrdersCommand(ctx: Context): Promise<void> {
    try {
      const userId = ctx.from?.id?.toString();
      if (!userId) return;

      await this.showOrdersList(ctx, 0);
    } catch (error) {
      await this.errorService.handleError(ctx, error, ErrorType.GENERAL, {});
    }
  }

  /**
   * Show orders list with pagination and controls
   */
  async showOrdersList(ctx: Context, page: number = 0): Promise<void> {
    const userId = ctx.from?.id?.toString();
    if (!userId) return;

    const orders = await this.volumeOrderService.getUserOrders(userId);

    if (orders.length === 0) {
      await ctx.reply(
        "You have no orders yet. Use /start to create your first volume order!",
      );
      return;
    }

    const pageSize = 5;
    const totalPages = Math.ceil(orders.length / pageSize);
    const startIdx = page * pageSize;
    const pageOrders = orders.slice(startIdx, startIdx + pageSize);

    let message = `📊 Your Volume Orders (Page ${page + 1}/${totalPages}):\n\n`;

    const keyboard = [];

    for (const order of pageOrders) {
      const shortId = order.id.substring(0, 8);
      const statusIcon = this.getStatusIcon(order.status);

      message += `${statusIcon} **Order ${shortId}**\n`;
      message += `📈 ${this.formatVolume(order.volume_target)} • ${this.formatDuration(order.duration_hours)}\n`;
      message += `💸 ${order.total_cost} SOL • ${order.status.replace("_", " ").toUpperCase()}\n`;
      message += `📅 ${new Date(order.created_at).toLocaleDateString()}\n\n`;

      // Add control buttons for this order
      const orderButtons = [
        Markup.button.callback("👁️ View", `view_order_${order.id}`),
      ];

      if (order.status === OrderStatus.RUNNING) {
        orderButtons.push(
          Markup.button.callback("⏸️ Pause", `pause_order_${order.id}`),
        );
        orderButtons.push(
          Markup.button.callback("🛑 Stop", `stop_order_${order.id}`),
        );
      } else if (order.status === OrderStatus.PAUSED) {
        orderButtons.push(
          Markup.button.callback("▶️ Resume", `resume_order_${order.id}`),
        );
        orderButtons.push(
          Markup.button.callback("🛑 Stop", `stop_order_${order.id}`),
        );
      } else if (order.status === OrderStatus.PAYMENT_CONFIRMED) {
        // Will be started by volume processor
      } else if (order.status === OrderStatus.PENDING_PAYMENT) {
        orderButtons.push(
          Markup.button.callback("🗑️ Delete", `delete_order_${order.id}`),
        );
      }

      if (orderButtons.length > 1) {
        keyboard.push(orderButtons);
      } else {
        keyboard.push([orderButtons[0]]);
      }
    }

    // Pagination controls
    const navButtons = [];
    if (page > 0) {
      navButtons.push(
        Markup.button.callback("⬅️ Prev", `orders_page_${page - 1}`),
      );
    }
    if (page < totalPages - 1) {
      navButtons.push(
        Markup.button.callback("➡️ Next", `orders_page_${page + 1}`),
      );
    }
    if (navButtons.length > 0) {
      keyboard.push(navButtons);
    }

    // Add refresh button
    keyboard.push([
      Markup.button.callback("🔄 Refresh", `orders_page_${page}`),
    ]);

    if (ctx.callbackQuery) {
      try {
        await ctx.editMessageText(message, {
          parse_mode: "Markdown",
          reply_markup: Markup.inlineKeyboard(keyboard).reply_markup,
        });
      } catch (error: unknown) {
        // If message is not modified, ignore the error (content is the same)
        const errorObj = error as { code?: number; description?: string };
        if (
          errorObj.code === 400 &&
          errorObj.description?.includes("message is not modified")
        ) {
          await ctx.answerCbQuery("Orders refreshed");
          return;
        }
        throw error;
      }
    } else {
      await ctx.reply(message, {
        parse_mode: "Markdown",
        reply_markup: Markup.inlineKeyboard(keyboard).reply_markup,
      });
    }
  }

  private getStatusIcon(status: string): string {
    switch (status) {
      case OrderStatus.PENDING_PAYMENT:
        return "💰";
      case OrderStatus.PAYMENT_CONFIRMED:
        return "✅";
      case OrderStatus.RUNNING:
        return "🚀";
      case OrderStatus.PAUSED:
        return "⏸️";
      case OrderStatus.COMPLETED:
        return "✨";
      case OrderStatus.CANCELLED:
        return "❌";
      case OrderStatus.FAILED:
        return "💥";
      default:
        return "❓";
    }
  }

  /**
   * Handle help command
   */
  async handleHelpCommand(ctx: Context): Promise<void> {
    const message = `🤖 **PriceGoUpBot Help**

**What is PriceGoUpBot?**
PriceGoUpBot is a volume generation service for Solana SPL tokens. We create organic-looking trading volume through thousands of unlinked wallets to boost your token's chart and rankings.

**How it works:**
1. Select your desired volume target (75K - 10M USD)
2. Choose duration (6 hours to 7 days)
3. Provide your token's contract address
4. Select a liquidity pool
5. Pay in SOL and watch your volume grow!

**Commands:**
• /start - Create a new volume order
• /orders - View your active orders
• /help - Show this help message

**Features:**
• 0% hidden fees - price includes everything
• Thousands of unlinked wallets
• 3 buys + 2 sells per task cycle
• Free Dexscreener trending boost
• Organic-looking volume patterns

**Support:**
Contact @support for help with your orders.`;

    await ctx.reply(message, { parse_mode: "Markdown" });
  }

  // Helper methods
  private async getUserSession(
    userId: string | undefined,
  ): Promise<UserSession | null> {
    if (!userId) return null;

    // First try to get from memory
    let session = this.userSessions.get(userId);

    // If not in memory, try to restore from database
    if (!session) {
      const recentOrders = await this.volumeOrderService.getUserOrders(userId);
      // Restore any latest pending_payment order (even if token/pool already set)
      const pendingOrder = recentOrders.find(
        (order) => order.status === OrderStatus.PENDING_PAYMENT,
      );

      if (pendingOrder) {
        // Restore session from database
        session = {
          userId,
          currentStep: this.determineCurrentStep(pendingOrder),
          selectedVolume: pendingOrder.volume_target,
          selectedDuration: pendingOrder.duration_hours,
          tokenAddress:
            pendingOrder.token_address !== "PENDING"
              ? pendingOrder.token_address
              : undefined,
          selectedPool:
            pendingOrder.pool_address !== "PENDING"
              ? pendingOrder.pool_address
              : undefined,
          orderData: pendingOrder,
        };

        this.userSessions.set(userId, session);
        console.log(`🔄 Restored session for user ${userId} from database`);
      }
    }

    return session || null;
  }

  private determineCurrentStep(order: {
    token_address?: string;
    pool_address?: string;
    payment_address?: string;
  }): string {
    if (order.token_address === "PENDING") return "token_address";
    if (order.pool_address === "PENDING") return "pool_selection";
    return "order_review";
  }

  private formatVolume(volume: number): string {
    if (volume >= 1000000) {
      return `$${volume / 1000000}M`;
    } else if (volume >= 1000) {
      return `$${volume / 1000}K`;
    }
    return `$${volume}`;
  }

  private formatDuration(hours: number): string {
    if (hours >= 24) return `${hours / 24} Days`;
    return `${hours}h`;
  }

  private formatInterval(minutes: number): string {
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    if (hours > 0) {
      return `${hours.toString().padStart(2, "0")}:${mins.toString().padStart(2, "0")}`;
    }
    return `00:${mins.toString().padStart(2, "0")}`;
  }

  private calculateTasksCount(volume: number, duration: number): number {
    // More volume or shorter duration = more tasks
    const baseTasksPerMillion = 12;
    const volumeInMillions = volume / 1000000;
    const durationFactor = 24 / duration; // Normalize to 24 hours

    return Math.max(
      1,
      Math.floor(baseTasksPerMillion * volumeInMillions * durationFactor),
    );
  }

  private async calculateTotalCost(
    volume: number,
    duration: number,
  ): Promise<string> {
    try {
      const costData = await this.paymentService.calculateOrderCost(
        volume,
        duration,
      );
      return costData.totalCost.toFixed(2);
    } catch {
      return "0.00";
    }
  }

  private async handleOrderCancellation(ctx: Context): Promise<void> {
    const session = await this.getUserSession(ctx.from?.id?.toString());
    if (session) {
      this.userSessions.delete(session.userId);
    }
    await ctx.reply("❌ Order cancelled.");
  }

  /**
   * Handle view order details
   */
  async handleViewOrder(ctx: Context): Promise<void> {
    try {
      const callbackQuery = ctx.callbackQuery;
      if (!callbackQuery || !("data" in callbackQuery)) return;

      const match = callbackQuery.data?.match(/^view_order_(.+)$/);
      if (!match) return;

      const orderId = match[1];
      const order = await this.volumeOrderService.getOrder(orderId);

      if (!order) {
        await ctx.answerCbQuery("Order not found");
        return;
      }

      // Get task progress via volume order service
      const progress = await this.volumeOrderService.getOrderProgress(orderId);

      const message = `📋 **Order Details**

🆔 **ID:** ${order.id.substring(0, 16)}...
📄 **Token:** ${order.token_address.substring(0, 16)}...
💧 **Pool:** ${order.pool_address.substring(0, 16)}...
📈 **Volume Target:** ${this.formatVolume(order.volume_target)}
⏳ **Duration:** ${this.formatDuration(order.duration_hours)}
🤖 **Tasks:** ${order.tasks_count}
💸 **Cost:** ${order.total_cost} SOL
📊 **Status:** ${order.status.replace("_", " ").toUpperCase()}

**Progress:**
📈 Volume Generated: $${progress.totalVolume.toLocaleString()}
✅ Completed Tasks: ${progress.completedTasks}
🏃 Running Tasks: ${progress.runningTasks}

📅 **Created:** ${new Date(order.created_at).toLocaleString()}
${order.started_at ? `🚀 **Started:** ${new Date(order.started_at).toLocaleString()}` : ""}
${order.completed_at ? `✨ **Completed:** ${new Date(order.completed_at).toLocaleString()}` : ""}`;

      const keyboard = [];

      // Add action buttons based on status
      if (order.status === OrderStatus.RUNNING) {
        keyboard.push([
          Markup.button.callback("⏸️ Pause", `pause_order_${order.id}`),
          Markup.button.callback("🛑 Stop", `stop_order_${order.id}`),
        ]);
      } else if (order.status === OrderStatus.PAUSED) {
        keyboard.push([
          Markup.button.callback("▶️ Resume", `resume_order_${order.id}`),
          Markup.button.callback("🛑 Stop", `stop_order_${order.id}`),
        ]);
      } else if (order.status === OrderStatus.PENDING_PAYMENT) {
        keyboard.push([
          Markup.button.callback("🗑️ Delete", `delete_order_${order.id}`),
        ]);
      } else if (order.status === OrderStatus.COMPLETED) {
        keyboard.push([
          Markup.button.callback("🔄 Restart", `restart_order_${order.id}`),
        ]);
      }

      keyboard.push([
        Markup.button.callback("🔙 Back to Orders", "orders_page_0"),
      ]);

      await ctx.editMessageText(message, {
        parse_mode: "Markdown",
        reply_markup: Markup.inlineKeyboard(keyboard).reply_markup,
      });
    } catch (error) {
      await this.errorService.handleError(ctx, error, ErrorType.GENERAL, {});
    }
  }

  /**
   * Handle orders pagination
   */
  async handleOrdersPage(ctx: Context): Promise<void> {
    try {
      const callbackQuery = ctx.callbackQuery;
      if (!callbackQuery || !("data" in callbackQuery)) return;

      const match = callbackQuery.data?.match(/^orders_page_(.+)$/);
      if (!match) return;

      const page = parseInt(match[1]);
      await this.showOrdersList(ctx, page);
    } catch (error) {
      await this.errorService.handleError(ctx, error, ErrorType.GENERAL, {});
    }
  }

  /**
   * Handle pause order
   */
  async handlePauseOrder(ctx: Context): Promise<void> {
    try {
      const callbackQuery = ctx.callbackQuery;
      if (!callbackQuery || !("data" in callbackQuery)) return;

      const match = callbackQuery.data?.match(/^pause_order_(.+)$/);
      if (!match) return;

      const orderId = match[1];
      await this.volumeOrderService.updateOrderStatus(
        orderId,
        "paused" as OrderStatus,
      );

      await ctx.answerCbQuery("Order paused");
      await this.handleViewOrder(ctx); // Refresh the view
    } catch (error) {
      await this.errorService.handleError(ctx, error, ErrorType.GENERAL, {});
    }
  }

  /**
   * Handle resume order
   */
  async handleResumeOrder(ctx: Context): Promise<void> {
    try {
      const callbackQuery = ctx.callbackQuery;
      if (!callbackQuery || !("data" in callbackQuery)) return;

      const match = callbackQuery.data?.match(/^resume_order_(.+)$/);
      if (!match) return;

      const orderId = match[1];
      await this.volumeOrderService.updateOrderStatus(
        orderId,
        OrderStatus.RUNNING,
      );

      await ctx.answerCbQuery("Order resumed");
      await this.handleViewOrder(ctx); // Refresh the view
    } catch (error) {
      await this.errorService.handleError(ctx, error, ErrorType.GENERAL, {});
    }
  }

  /**
   * Handle stop order
   */
  async handleStopOrder(ctx: Context): Promise<void> {
    try {
      const callbackQuery = ctx.callbackQuery;
      if (!callbackQuery || !("data" in callbackQuery)) return;

      const match = callbackQuery.data?.match(/^stop_order_(.+)$/);
      if (!match) return;

      const orderId = match[1];
      await this.volumeOrderService.updateOrderStatus(
        orderId,
        OrderStatus.COMPLETED,
      );

      await ctx.answerCbQuery("Order stopped");
      await this.handleViewOrder(ctx); // Refresh the view
    } catch (error) {
      await this.errorService.handleError(ctx, error, ErrorType.GENERAL, {});
    }
  }

  /**
   * Handle restart order
   */
  async handleRestartOrder(ctx: Context): Promise<void> {
    try {
      const callbackQuery = ctx.callbackQuery;
      if (!callbackQuery || !("data" in callbackQuery)) return;

      const match = callbackQuery.data?.match(/^restart_order_(.+)$/);
      if (!match) return;

      const orderId = match[1];
      await this.volumeOrderService.restartOrder(orderId);

      await ctx.answerCbQuery("Order restarted");
      await this.handleViewOrder(ctx); // Refresh the view
    } catch (error) {
      await this.errorService.handleError(ctx, error, ErrorType.GENERAL, {});
    }
  }

  /**
   * Handle delete order
   */
  async handleDeleteOrder(ctx: Context): Promise<void> {
    try {
      const callbackQuery = ctx.callbackQuery;
      if (!callbackQuery || !("data" in callbackQuery)) return;

      const match = callbackQuery.data?.match(/^delete_order_(.+)$/);
      if (!match) return;

      const orderId = match[1];
      const order = await this.volumeOrderService.getOrder(orderId);

      if (!order) {
        await ctx.answerCbQuery("Order not found");
        return;
      }

      // Only allow deletion of pending payment orders
      if (order.status !== OrderStatus.PENDING_PAYMENT) {
        await ctx.answerCbQuery("Can only delete unpaid orders");
        return;
      }

      const message = `⚠️ **Confirm Deletion**

Are you sure you want to delete this order?

📈 ${this.formatVolume(order.volume_target)} • ${this.formatDuration(order.duration_hours)}
💸 ${order.total_cost} SOL

This action cannot be undone.`;

      await ctx.editMessageText(message, {
        parse_mode: "Markdown",
        reply_markup: Markup.inlineKeyboard([
          [
            Markup.button.callback(
              "✅ Yes, Delete",
              `confirm_delete_${orderId}`,
            ),
            Markup.button.callback("❌ Cancel", `view_order_${orderId}`),
          ],
        ]).reply_markup,
      });
    } catch (error) {
      await this.errorService.handleError(ctx, error, ErrorType.GENERAL, {});
    }
  }

  /**
   * Handle confirm delete order
   */
  async handleConfirmDelete(ctx: Context): Promise<void> {
    try {
      const callbackQuery = ctx.callbackQuery;
      if (!callbackQuery || !("data" in callbackQuery)) return;

      const match = callbackQuery.data?.match(/^confirm_delete_(.+)$/);
      if (!match) return;

      const orderId = match[1];
      await this.volumeOrderService.deleteOrder(orderId);

      await ctx.answerCbQuery("Order deleted");
      await ctx.editMessageText("🗑️ Order deleted successfully.", {
        reply_markup: Markup.inlineKeyboard([
          [Markup.button.callback("🔙 Back to Orders", "orders_page_0")],
        ]).reply_markup,
      });
    } catch (error) {
      await this.errorService.handleError(ctx, error, ErrorType.GENERAL, {});
    }
  }
}
