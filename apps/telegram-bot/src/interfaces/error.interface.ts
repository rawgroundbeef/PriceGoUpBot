import { Context } from 'telegraf';
import { ErrorType, ErrorContext } from '../services/error.service';

export interface IErrorService {
  handleError(
    ctx: Context,
    error: Error | unknown,
    errorType?: ErrorType,
    errorContext?: ErrorContext
  ): Promise<void>;

  sendErrorMessage(
    ctx: Context,
    errorType?: ErrorType,
    errorContext?: ErrorContext
  ): Promise<void>;

  handleCallbackError(
    ctx: Context,
    error: Error | unknown,
    errorType?: ErrorType,
    errorContext?: ErrorContext
  ): Promise<void>;

  handleMessageEditError(
    ctx: Context,
    messageId: number,
    error: Error | unknown,
    errorType?: ErrorType,
    errorContext?: ErrorContext
  ): Promise<void>;

  createErrorContext(
    userId?: string,
    action?: string,
    details?: any,
    showDeveloperContact?: boolean
  ): ErrorContext;

  logError(
    error: Error | unknown,
    errorType?: ErrorType,
    errorContext?: ErrorContext
  ): void;
} 