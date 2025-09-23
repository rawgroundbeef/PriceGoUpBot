import { Telegraf } from 'telegraf';

export interface ITypes {
  Bot: symbol;
  LoggerService: symbol;
  ErrorService: symbol;
  PriceGoUpBotService: symbol;
  VolumeOrderService: symbol;
  SolanaService: symbol;
  VolumeEngineService: symbol;
  PaymentService: symbol;
  SupabaseService: symbol;
  SweeperService: symbol;
}

export const TYPES = {
  Bot: Symbol.for('Bot'),
  LoggerService: Symbol.for('LoggerService'),
  ErrorService: Symbol.for('ErrorService'),
  PriceGoUpBotService: Symbol.for('PriceGoUpBotService'),
  VolumeOrderService: Symbol.for('VolumeOrderService'),
  SolanaService: Symbol.for('SolanaService'),
  VolumeEngineService: Symbol.for('VolumeEngineService'),
  PaymentService: Symbol.for('PaymentService'),
  SupabaseService: Symbol.for('SupabaseService'),
  SweeperService: Symbol.for('SweeperService')
} as const;

export type Bot = Telegraf; 