import { injectable } from "inversify";
import {
  Connection,
  Keypair,
  PublicKey,
  VersionedTransaction,
} from "@solana/web3.js";
import { createJupiterApiClient } from "@jup-ag/api";
import { SOLANA_RPC_URL } from "../config";

export interface TradeResult {
  success: boolean;
  signature?: string;
  error?: string;
  amountIn: number;
  amountOut?: number;
  priceImpact?: number;
}

@injectable()
export class JupiterTradingService {
  private connection: Connection;
  private jupiterApi: ReturnType<typeof createJupiterApiClient>;

  constructor() {
    this.connection = new Connection(
      SOLANA_RPC_URL || "https://api.mainnet-beta.solana.com",
      "confirmed",
    );
    this.jupiterApi = createJupiterApiClient();
  }

  /**
   * Execute a buy transaction (SOL -> Token)
   */
  async executeBuy(
    tradingKeypair: Keypair,
    tokenMint: string,
    solAmount: number, // in lamports
    slippageBps: number = 300, // 3% default slippage
  ): Promise<TradeResult> {
    try {
      console.log(
        `🟢 Executing BUY: ${solAmount / 1e9} SOL -> ${tokenMint.substring(0, 8)}...`,
      );

      // Get quote from Jupiter
      const quote = await this.jupiterApi.quoteGet({
        inputMint: "So11111111111111111111111111111111111111112", // SOL mint
        outputMint: tokenMint,
        amount: solAmount,
        slippageBps,
        onlyDirectRoutes: false,
        asLegacyTransaction: false,
      });

      if (!quote) {
        return {
          success: false,
          error: "No quote available",
          amountIn: solAmount,
        };
      }

      // Get swap transaction
      const swapResponse = await this.jupiterApi.swapPost({
        swapRequest: {
          quoteResponse: quote,
          userPublicKey: tradingKeypair.publicKey.toString(),
          wrapAndUnwrapSol: true,
          useSharedAccounts: true,
          feeAccount: undefined,
          trackingAccount: undefined,
          skipUserAccountsRpcCalls: false,
        },
      });

      const swapTransactionBuf = Buffer.from(
        swapResponse.swapTransaction,
        "base64",
      );
      const transaction = VersionedTransaction.deserialize(swapTransactionBuf);

      // Sign transaction
      transaction.sign([tradingKeypair]);

      // Send transaction
      const signature = await this.connection.sendTransaction(transaction, {
        skipPreflight: false,
        preflightCommitment: "confirmed",
      });

      // Confirm transaction
      await this.connection.confirmTransaction(signature, "confirmed");

      const outputAmount = parseInt(quote.outAmount);
      const priceImpact = parseFloat(quote.priceImpactPct || "0");

      console.log(
        `✅ BUY completed: ${signature.substring(0, 8)}... | Impact: ${priceImpact}%`,
      );

      return {
        success: true,
        signature,
        amountIn: solAmount,
        amountOut: outputAmount,
        priceImpact,
      };
    } catch (error) {
      console.error("❌ BUY failed:", error);
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        amountIn: solAmount,
      };
    }
  }

  /**
   * Execute a sell transaction (Token -> SOL)
   */
  async executeSell(
    tradingKeypair: Keypair,
    tokenMint: string,
    tokenAmount: number, // in token units
    slippageBps: number = 300, // 3% default slippage
  ): Promise<TradeResult> {
    try {
      console.log(
        `🔴 Executing SELL: ${tokenAmount} ${tokenMint.substring(0, 8)}... -> SOL`,
      );

      // Get quote from Jupiter
      const quote = await this.jupiterApi.quoteGet({
        inputMint: tokenMint,
        outputMint: "So11111111111111111111111111111111111111112", // SOL mint
        amount: tokenAmount,
        slippageBps,
        onlyDirectRoutes: false,
        asLegacyTransaction: false,
      });

      if (!quote) {
        return {
          success: false,
          error: "No quote available",
          amountIn: tokenAmount,
        };
      }

      // Get swap transaction
      const swapResponse = await this.jupiterApi.swapPost({
        swapRequest: {
          quoteResponse: quote,
          userPublicKey: tradingKeypair.publicKey.toString(),
          wrapAndUnwrapSol: true,
          useSharedAccounts: true,
          feeAccount: undefined,
          trackingAccount: undefined,
          skipUserAccountsRpcCalls: false,
        },
      });

      const swapTransactionBuf = Buffer.from(
        swapResponse.swapTransaction,
        "base64",
      );
      const transaction = VersionedTransaction.deserialize(swapTransactionBuf);

      // Sign transaction
      transaction.sign([tradingKeypair]);

      // Send transaction
      const signature = await this.connection.sendTransaction(transaction, {
        skipPreflight: false,
        preflightCommitment: "confirmed",
      });

      // Confirm transaction
      await this.connection.confirmTransaction(signature, "confirmed");

      const outputAmount = parseInt(quote.outAmount);
      const priceImpact = parseFloat(quote.priceImpactPct || "0");

      console.log(
        `✅ SELL completed: ${signature.substring(0, 8)}... | Impact: ${priceImpact}%`,
      );

      return {
        success: true,
        signature,
        amountIn: tokenAmount,
        amountOut: outputAmount,
        priceImpact,
      };
    } catch (error) {
      console.error("❌ SELL failed:", error);
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        amountIn: tokenAmount,
      };
    }
  }

  /**
   * Get token balance for a wallet
   */
  async getTokenBalance(
    walletPubkey: PublicKey,
    tokenMint: string,
  ): Promise<number> {
    try {
      const tokenAccounts = await this.connection.getParsedTokenAccountsByOwner(
        walletPubkey,
        { mint: new PublicKey(tokenMint) },
      );

      if (tokenAccounts.value.length === 0) {
        return 0;
      }

      const tokenAccount = tokenAccounts.value[0];
      return tokenAccount.account.data.parsed.info.tokenAmount.uiAmount || 0;
    } catch (error) {
      console.error("Error getting token balance:", error);
      return 0;
    }
  }

  /**
   * Get SOL balance for a wallet
   */
  async getSolBalance(walletPubkey: PublicKey): Promise<number> {
    try {
      const balance = await this.connection.getBalance(walletPubkey);
      return balance; // in lamports
    } catch (error) {
      console.error("Error getting SOL balance:", error);
      return 0;
    }
  }

  /**
   * Fund a trading wallet from treasury operations
   */
  async fundTradingWallet(
    treasuryKeypair: Keypair,
    tradingWalletPubkey: PublicKey,
    amountLamports: number,
  ): Promise<string | null> {
    try {
      const { SystemProgram, Transaction } = await import("@solana/web3.js");

      const transaction = new Transaction().add(
        SystemProgram.transfer({
          fromPubkey: treasuryKeypair.publicKey,
          toPubkey: tradingWalletPubkey,
          lamports: amountLamports,
        }),
      );

      const signature = await this.connection.sendTransaction(
        transaction,
        [treasuryKeypair],
        {
          skipPreflight: false,
          preflightCommitment: "confirmed",
        },
      );

      await this.connection.confirmTransaction(signature, "confirmed");

      console.log(
        `💰 Funded trading wallet: ${amountLamports / 1e9} SOL | ${signature.substring(0, 8)}...`,
      );

      return signature;
    } catch (error) {
      console.error("❌ Failed to fund trading wallet:", error);
      return null;
    }
  }
}
