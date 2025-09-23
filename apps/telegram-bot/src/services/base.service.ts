import { Telegraf } from 'telegraf';
import { injectable, inject } from 'inversify';
import { TYPES } from '../types';
import { IBaseService } from '../interfaces';

@injectable()
export abstract class BaseService implements IBaseService {
  constructor(@inject(TYPES.Bot) protected bot: Telegraf) {}

  abstract initialize(): Promise<void>;
} 