import 'reflect-metadata';
import { Container } from 'inversify';
import { Telegraf } from 'telegraf';
import { TYPES } from './types';
import { IErrorService, IVolumeOrderService, ISolanaService, IVolumeEngineService, IPaymentService } from './interfaces';
import { ErrorService } from './services/error.service';
import { PriceGoUpBotService } from './services/price-go-up-bot.service';
import { LoggerService } from './services/logger.service';
import { SupabaseService } from './services/supabase.service';
import { VolumeOrderService } from './services/volume-order.service';
import { SolanaService } from './services/solana.service';
import { VolumeEngineService } from './services/volume-engine.service';
import { PaymentService } from './services/payment.service';
import { SweeperService } from './services/sweeper.service';
import { botToken } from './config';

// Create a new container
const container = new Container();

// Create a single bot instance
if (!botToken) {
  throw new Error('Bot token is required');
}
const bot = new Telegraf(botToken);

// Add initialization state tracking
let isInitialized = false;

// Bind the bot instance as a singleton
container.bind<Telegraf>(TYPES.Bot).toConstantValue(bot);

// Bind core services
container.bind<IErrorService>(TYPES.ErrorService).to(ErrorService).inSingletonScope();
container.bind<LoggerService>(TYPES.LoggerService).to(LoggerService).inSingletonScope();
container.bind<SupabaseService>(TYPES.SupabaseService).to(SupabaseService).inSingletonScope();

// Bind business services
container.bind<IVolumeOrderService>(TYPES.VolumeOrderService).to(VolumeOrderService).inSingletonScope();
container.bind<ISolanaService>(TYPES.SolanaService).to(SolanaService).inSingletonScope();
container.bind<IVolumeEngineService>(TYPES.VolumeEngineService).to(VolumeEngineService).inSingletonScope();
container.bind<IPaymentService>(TYPES.PaymentService).to(PaymentService).inSingletonScope();
container.bind<SweeperService>(TYPES.SweeperService).to(SweeperService).inSingletonScope();

// Bind the main bot service
container.bind<PriceGoUpBotService>(TYPES.PriceGoUpBotService).to(PriceGoUpBotService).inSingletonScope();

// Export initialization state management
export const getInitializationState = () => isInitialized;
export const setInitializationState = (state: boolean) => {
  isInitialized = state;
};

export { container }; 