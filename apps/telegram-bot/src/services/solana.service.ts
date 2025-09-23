import { injectable, inject } from "inversify";
import { Connection, PublicKey, LAMPORTS_PER_SOL } from "@solana/web3.js";
import { TOKEN_PROGRAM_ID } from "@solana/spl-token";
import { TYPES } from "../types";
import { SupabaseService } from "./supabase.service";
import { solanaRpcUrl } from "../config";
import {
  TokenInfo,
  LiquidityPool,
  PoolType,
  ISolanaService,
} from "../interfaces";
import fetch from "node-fetch";

interface JupiterTokenInfo {
  address: string;
  symbol: string;
  name: string;
  decimals: number;
  logoURI?: string;
}

// interface RaydiumPoolInfo { // Unused
//   id: string;
//   baseMint: string;
//   quoteMint: string;
//   lpMint: string;
//   baseDecimals: number;
//   quoteDecimals: number;
//   lpDecimals: number;
//   version: number;
//   programId: string;
//   authority: string;
//   openOrders: string;
//   targetOrders: string;
//   baseVault: string;
//   quoteVault: string;
//   withdrawQueue: string;
//   lpVault: string;
//   marketVersion: number;
//   marketProgramId: string;
//   marketId: string;
//   marketAuthority: string;
//   marketBaseVault: string;
//   marketQuoteVault: string;
//   marketBids: string;
//   marketAsks: string;
//   marketEventQueue: string;
//   lookupTableAccount?: string;
// }

@injectable()
export class SolanaService implements ISolanaService {
  private connection: Connection;
  private supabaseService: SupabaseService;
  private jupiterTokens: Map<string, JupiterTokenInfo> = new Map();

  constructor(@inject(TYPES.SupabaseService) supabaseService: SupabaseService) {
    this.connection = new Connection(
      solanaRpcUrl || "https://api.mainnet-beta.solana.com",
      "confirmed",
    );
    this.supabaseService = supabaseService;
    this.initializeTokenList();
  }

  async validateTokenAddress(address: string): Promise<boolean> {
    try {
      const publicKey = new PublicKey(address);

      // Check if it's a valid public key format
      if (!PublicKey.isOnCurve(publicKey)) {
        return false;
      }

      // Try to get token account info
      const accountInfo = await this.connection.getAccountInfo(publicKey);

      // Check if account exists and is owned by TOKEN_PROGRAM_ID
      return accountInfo !== null && accountInfo.owner.equals(TOKEN_PROGRAM_ID);
    } catch {
      return false;
    }
  }

  async getTokenInfo(address: string): Promise<TokenInfo | null> {
    try {
      // First check our database
      let tokenInfo = await this.supabaseService.getTokenInfo(address);

      if (!tokenInfo) {
        // Try to get from Jupiter token list
        const jupiterToken = this.jupiterTokens.get(address);
        if (jupiterToken) {
          tokenInfo = {
            address: jupiterToken.address,
            symbol: jupiterToken.symbol,
            name: jupiterToken.name,
            decimals: jupiterToken.decimals,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          };

          // Save to database
          await this.supabaseService.upsertTokenInfo(tokenInfo);
        } else {
          // Try to get token metadata from chain
          tokenInfo = await this.getTokenMetadataFromChain(address);
          if (tokenInfo) {
            await this.supabaseService.upsertTokenInfo(tokenInfo);
          }
        }
      }

      return tokenInfo;
    } catch (error) {
      console.error("Error getting token info:", error);
      return null;
    }
  }

  async getLiquidityPools(tokenAddress: string): Promise<LiquidityPool[]> {
    try {
      console.log(`🔍 getLiquidityPools called for token: ${tokenAddress}`);

      // First check our database
      console.log(`🗄️ Checking database for cached pools...`);
      let pools = await this.supabaseService.getTokenPools(tokenAddress);
      console.log(`📊 Found ${pools.length} cached pools in database`);

      if (pools.length === 0) {
        // Fetch from Raydium API
        console.log(`🌐 No cached pools found, fetching from Dexscreener...`);
        pools = await this.fetchRaydiumPools(tokenAddress);
        console.log(`📥 Received ${pools.length} pools from API`);

        // Save to database
        console.log(`💾 Saving ${pools.length} pools to database...`);
        for (const pool of pools) {
          await this.supabaseService.upsertLiquidityPool(pool);
        }
        console.log(`✅ Pools saved to database`);
      } else {
        // If cached pools look invalid (contain '...' or wrong length), refetch immediately
        const looksInvalid = pools.some(
          (p) => p.address.includes("...") || p.address.length < 32,
        );
        if (looksInvalid) {
          console.log("⚠️ Cached pools look invalid; fetching fresh pool list");
          const freshPools = await this.fetchRaydiumPools(tokenAddress);
          if (freshPools && freshPools.length > 0) {
            await this.supabaseService.deleteTokenPools(tokenAddress);
            for (const pool of freshPools) {
              await this.supabaseService.upsertLiquidityPool(pool);
            }
            pools = freshPools;
          }
        } else {
          // Otherwise refresh in background
          this.fetchRaydiumPools(tokenAddress)
            .then(async (freshPools) => {
              if (!freshPools || freshPools.length === 0) return;
              await this.supabaseService.deleteTokenPools(tokenAddress);
              for (const pool of freshPools) {
                await this.supabaseService.upsertLiquidityPool(pool);
              }
            })
            .catch(() => {});
        }
      }

      return pools;
    } catch (error) {
      console.error("Error getting liquidity pools:", error);
      return [];
    }
  }

  async generatePaymentAddress(): Promise<string> {
    // This method is kept for interface compatibility but not used
    // Payment addresses are generated in VolumeOrderService
    throw new Error("Use VolumeOrderService.generatePaymentAddress instead");
  }

  async verifyPayment(
    address: string,
    expectedAmount: number,
  ): Promise<string | null> {
    try {
      const publicKey = new PublicKey(address);
      const tolerance = 0.01; // SOL
      // First, simple balance-based check (robust on devnet and handles overpayment)
      const balanceLamports = await this.connection.getBalance(publicKey);
      const balanceSol = balanceLamports / LAMPORTS_PER_SOL;
      console.log(
        `💰 Payment check: address=${address} balance=${balanceSol.toFixed(6)} expected>=${(expectedAmount - tolerance).toFixed(6)}`,
      );
      if (balanceSol + 1e-9 >= expectedAmount - tolerance) {
        return "BALANCE_OK";
      }

      // Get recent transactions for the address
      const signatures = await this.connection.getSignaturesForAddress(
        publicKey,
        { limit: 10 },
      );

      for (const sigInfo of signatures) {
        const transaction = await this.connection.getTransaction(
          sigInfo.signature,
          {
            commitment: "confirmed",
          },
        );

        if (!transaction) continue;

        // Fallback: if any tx brought balance above threshold, accept
        const preTotal = (transaction.meta?.preBalances || []).reduce(
          (a, b) => a + b,
          0,
        );
        const postTotal = (transaction.meta?.postBalances || []).reduce(
          (a, b) => a + b,
          0,
        );
        const deltaSol = (postTotal - preTotal) / LAMPORTS_PER_SOL;
        if (balanceSol + deltaSol + 1e-9 >= expectedAmount - tolerance) {
          return sigInfo.signature;
        }
      }

      return null;
    } catch (error) {
      console.error("Error verifying payment:", error);
      return null;
    }
  }

  private async initializeTokenList(): Promise<void> {
    try {
      // Fetch Jupiter token list
      const response = await fetch("https://token.jup.ag/all");
      const tokens = (await response.json()) as JupiterTokenInfo[];

      for (const token of tokens) {
        this.jupiterTokens.set(token.address, token);
      }

      console.log(`✅ Loaded ${tokens.length} tokens from Jupiter`);
    } catch (error) {
      console.warn("⚠️ Failed to load Jupiter token list:", error);
    }
  }

  private async getTokenMetadataFromChain(
    address: string,
  ): Promise<TokenInfo | null> {
    try {
      const publicKey = new PublicKey(address);
      const accountInfo = await this.connection.getAccountInfo(publicKey);

      if (!accountInfo) return null;

      // For SPL tokens, we can get basic info but not name/symbol from chain alone
      // This would require parsing token metadata accounts which is complex
      // For now, return basic info
      return {
        address,
        symbol: "UNKNOWN",
        name: "Unknown Token",
        decimals: 9, // Default decimals
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
    } catch {
      return null;
    }
  }

  private async fetchRaydiumPools(
    tokenAddress: string,
  ): Promise<LiquidityPool[]> {
    try {
      console.log(`🔍 Searching for pools for token: ${tokenAddress}`);
      console.log(`🌐 Making request to Dexscreener API...`);

      // Prefer Dexscreener API for reliable pair discovery
      const url = `https://api.dexscreener.com/latest/dex/tokens/${tokenAddress}`;
      console.log(`📡 Fetching: ${url}`);

      const res = await fetch(url, {
        timeout: 10000, // 10 second timeout
        headers: {
          "User-Agent": "PriceGoUpBot/1.0",
        },
      });

      console.log(`📊 Response status: ${res.status} ${res.statusText}`);
      if (!res.ok) {
        console.warn(
          `⚠️ Dexscreener returned ${res.status} - falling back to empty list`,
        );
        return [];
      }

      console.log(`📥 Parsing response JSON...`);
      const json = (await res.json()) as { pairs?: unknown[] };
      console.log(`📊 JSON parsed, checking pairs...`);

      const pairs: unknown[] = Array.isArray(json?.pairs) ? json.pairs : [];
      console.log(`🔍 Found ${pairs.length} total pairs`);

      if (pairs.length === 0) {
        console.warn("⚠️ Dexscreener returned no pairs");
        return [];
      }

      // Filter to Solana network and prefer Raydium pairs; otherwise take the highest liquidity
      console.log(`🔍 Filtering pairs for Solana network...`);
      const solPairs = pairs.filter((p) => {
        const pair = p as { chainId?: string; chain?: string };
        return (pair?.chainId || pair?.chain) === "solana";
      });
      console.log(`🌐 Found ${solPairs.length} Solana pairs`);

      console.log(`🔍 Filtering for Raydium pairs...`);
      const raydiumPairs = solPairs.filter((p) => {
        const pair = p as { dexId?: string };
        return (pair?.dexId || "").toLowerCase().includes("raydium");
      });
      console.log(`🏊 Found ${raydiumPairs.length} Raydium pairs`);

      const candidates = raydiumPairs.length > 0 ? raydiumPairs : solPairs;
      console.log(`🎯 Using ${candidates.length} candidate pairs`);

      if (candidates.length === 0) {
        console.warn("⚠️ No suitable pairs found");
        return [];
      }

      // Sort by liquidity USD (desc)
      console.log(`📊 Sorting ${candidates.length} candidates by liquidity...`);
      candidates.sort((a, b) => {
        const aPair = a as { liquidity?: { usd?: string | number } };
        const bPair = b as { liquidity?: { usd?: string | number } };
        return (
          Number(bPair?.liquidity?.usd || 0) -
          Number(aPair?.liquidity?.usd || 0)
        );
      });
      const top = candidates[0];
      console.log(`🏆 Selected top pool candidate`);
      console.log(
        `💰 Top pool liquidity: $${Number((top as any)?.liquidity?.usd || 0).toFixed(2)}`,
      );

      const topPair = top as {
        pairAddress?: string;
        baseToken?: { address?: string };
        quoteToken?: { address?: string };
        dexId?: string;
        liquidity?: { usd?: string | number };
        volume?: { h24?: string | number };
      };

      const pool: LiquidityPool = {
        address: String(topPair.pairAddress),
        token_a: String(topPair.baseToken?.address || tokenAddress),
        token_b: String(topPair.quoteToken?.address || ""),
        pool_type: (topPair?.dexId || "").toLowerCase().includes("raydium")
          ? PoolType.RAYDIUM
          : (topPair?.dexId || "").toLowerCase().includes("orca")
            ? PoolType.ORCA
            : PoolType.RAYDIUM,
        liquidity_usd: Number(topPair?.liquidity?.usd || 0),
        volume_24h: Number(topPair?.volume?.h24 || 0),
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      console.log(
        `✅ Selected pool: ${pool.address} (dex=${topPair?.dexId}, liq=$${pool.liquidity_usd.toFixed(2)})`,
      );
      return [pool];
    } catch (error) {
      console.error("Error fetching pools from Dexscreener:", error);
      return [];
    }
  }

  private async estimatePoolLiquidity(_poolId: string): Promise<number> {
    try {
      // This is a simplified estimation
      // In production, you'd want to calculate actual liquidity based on token balances
      return Math.random() * 1000000 + 10000; // Random value between 10K and 1M for demo
    } catch {
      return 50000; // Default value
    }
  }
}
