import { injectable, inject } from 'inversify';
import { Context } from 'telegraf';
import { TYPES } from '../types';
import { LoggerService } from './logger.service';
import { IErrorService } from '../interfaces';

export enum ErrorType {
  GENERAL = 'general',
  NETWORK = 'network',
  VALIDATION = 'validation',
  SUBSCRIPTION = 'subscription',
  FILE_PROCESSING = 'file_processing',
  AUTHENTICATION = 'authentication',
  RATE_LIMIT = 'rate_limit',
  EXTERNAL_API = 'external_api'
}

export interface ErrorContext {
  userId?: string;
  action?: string;
  details?: any;
  showDeveloperContact?: boolean;
  rollback?: () => Promise<void>;
}

@injectable()
export class ErrorService implements IErrorService {
  private loggerService: LoggerService;

  constructor(
    @inject(TYPES.LoggerService) loggerService: LoggerService
  ) {
    this.loggerService = loggerService;
  }

  /**
   * Handle and log an error, then send an appropriate message to the user
   * If rollback is provided, it will be executed before sending the error message
   */
  async handleError(
    ctx: Context,
    error: Error | unknown,
    errorType: ErrorType = ErrorType.GENERAL,
    errorContext?: ErrorContext
  ): Promise<void> {
    const errorMessage = error instanceof Error ? error.message : String(error);
    const stack = error instanceof Error ? error.stack : undefined;
    
    // Execute rollback if provided
    if (errorContext?.rollback) {
      try {
        console.log(`🔄 [ERROR ROLLBACK] Executing rollback for user ${errorContext.userId}`);
        await errorContext.rollback();
      } catch (rollbackError) {
        this.loggerService.error('Failed to execute rollback', {
          originalError: errorMessage,
          rollbackError: rollbackError instanceof Error ? rollbackError.message : String(rollbackError),
          userId: errorContext?.userId
        });
      }
    }
    
    // Log the error with context
    this.loggerService.error(
      `[${errorType.toUpperCase()}] ${errorMessage}`,
      {
        userId: errorContext?.userId || ctx.from?.id,
        action: errorContext?.action,
        details: errorContext?.details,
        stack
      }
    );

    // Send user-friendly error message
    await this.sendErrorMessage(ctx, errorType, errorContext);
  }

  /**
   * Send an error message to the user based on error type
   */
  async sendErrorMessage(
    ctx: Context,
    errorType: ErrorType = ErrorType.GENERAL,
    errorContext?: ErrorContext
  ): Promise<void> {
    try {
      const baseMessage = this.getErrorMessage(errorType);
      const developerContact = errorContext?.showDeveloperContact !== false 
        ? 'If this problem persists, please contact support.'
        : '';
      
      const fullMessage = developerContact 
        ? `${baseMessage}\n\n${developerContact}`
        : baseMessage;

      await ctx.reply(fullMessage, { parse_mode: 'Markdown' });
    } catch (replyError) {
      // Fallback if reply fails
      this.loggerService.error('Failed to send error message to user', {
        originalError: errorType,
        replyError: replyError instanceof Error ? replyError.message : String(replyError),
        userId: ctx.from?.id
      });
    }
  }

  /**
   * Get the appropriate error message for the error type
   */
  private getErrorMessage(errorType: ErrorType): string {
    const errorMessages = {
      [ErrorType.GENERAL]: 'Something went wrong. Please try again.',
      [ErrorType.NETWORK]: 'Network error. Please check your connection and try again.',
      [ErrorType.VALIDATION]: 'Invalid input. Please check your request and try again.',
      [ErrorType.SUBSCRIPTION]: 'Subscription error. Please check your subscription status.',
      [ErrorType.FILE_PROCESSING]: 'File processing error. Please try again.',
      [ErrorType.AUTHENTICATION]: 'Authentication error. Please try again.',
      [ErrorType.RATE_LIMIT]: 'Rate limit exceeded. Please wait a moment and try again.',
      [ErrorType.EXTERNAL_API]: 'External service error. Please try again later.'
    };
    
    return errorMessages[errorType] || errorMessages[ErrorType.GENERAL];
  }

  /**
   * Handle errors that occur during callback query operations
   * If rollback is provided, it will be executed before sending the error message
   */
  async handleCallbackError(
    ctx: Context,
    error: Error | unknown,
    errorType: ErrorType = ErrorType.GENERAL,
    errorContext?: ErrorContext
  ): Promise<void> {
    const errorMessage = error instanceof Error ? error.message : String(error);
    const stack = error instanceof Error ? error.stack : undefined;
    
    // Execute rollback if provided
    if (errorContext?.rollback) {
      try {
        console.log(`🔄 [CALLBACK ERROR ROLLBACK] Executing rollback for user ${errorContext.userId}`);
        await errorContext.rollback();
      } catch (rollbackError) {
        this.loggerService.error('Failed to execute callback rollback', {
          originalError: errorMessage,
          rollbackError: rollbackError instanceof Error ? rollbackError.message : String(rollbackError),
          userId: errorContext?.userId
        });
      }
    }
    
    // Log the error
    this.loggerService.error(
      `[CALLBACK_${errorType.toUpperCase()}] ${errorMessage}`,
      {
        userId: errorContext?.userId || ctx.from?.id,
        action: errorContext?.action,
        details: errorContext?.details,
        stack
      }
    );

    // Answer callback query with error and send message
    try {
      if ('answerCbQuery' in ctx) {
        const shortError = 'Error occurred';
        await ctx.answerCbQuery(shortError);
      }
      
      await this.sendErrorMessage(ctx, errorType, errorContext);
    } catch (replyError) {
      this.loggerService.error('Failed to handle callback error', {
        originalError: errorType,
        replyError: replyError instanceof Error ? replyError.message : String(replyError),
        userId: ctx.from?.id
      });
    }
  }

  /**
   * Handle errors that occur during message editing operations
   */
  async handleMessageEditError(
    ctx: Context,
    messageId: number,
    error: Error | unknown,
    errorType: ErrorType = ErrorType.GENERAL,
    errorContext?: ErrorContext
  ): Promise<void> {
    const errorMessage = error instanceof Error ? error.message : String(error);
    const stack = error instanceof Error ? error.stack : undefined;
    
    // Log the error
    this.loggerService.error(
      `[MESSAGE_EDIT_${errorType.toUpperCase()}] ${errorMessage}`,
      {
        userId: errorContext?.userId || ctx.from?.id,
        action: errorContext?.action,
        messageId,
        details: errorContext?.details,
        stack
      }
    );

    // Try to edit the message with error, fallback to new message
    try {
      const baseMessage = this.getErrorMessage(errorType);
      const developerContact = errorContext?.showDeveloperContact !== false 
        ? 'If this problem persists, please contact support.'
        : '';
      
      const fullMessage = developerContact 
        ? `${baseMessage}\n\n${developerContact}`
        : baseMessage;

      if (ctx.chat?.id) {
        try {
          await ctx.telegram.editMessageText(
            ctx.chat.id,
            messageId,
            undefined,
            fullMessage,
            { parse_mode: 'Markdown' }
          );
        } catch (editError) {
          // If editing fails, send a new message
          await ctx.reply(fullMessage, { parse_mode: 'Markdown' });
        }
      }
    } catch (replyError) {
      this.loggerService.error('Failed to handle message edit error', {
        originalError: errorType,
        replyError: replyError instanceof Error ? replyError.message : String(replyError),
        userId: ctx.from?.id,
        messageId
      });
    }
  }

  /**
   * Create a standardized error context
   */
  createErrorContext(
    userId?: string,
    action?: string,
    details?: any,
    showDeveloperContact: boolean = true,
    rollback?: () => Promise<void>
  ): ErrorContext {
    return {
      userId,
      action,
      details,
      showDeveloperContact,
      rollback
    };
  }

  /**
   * Log an error without sending a message to the user
   */
  logError(
    error: Error | unknown,
    errorType: ErrorType = ErrorType.GENERAL,
    errorContext?: ErrorContext
  ): void {
    const errorMessage = error instanceof Error ? error.message : String(error);
    const stack = error instanceof Error ? error.stack : undefined;
    
    this.loggerService.error(
      `[${errorType.toUpperCase()}] ${errorMessage}`,
      {
        userId: errorContext?.userId,
        action: errorContext?.action,
        details: errorContext?.details,
        stack
      }
    );
  }
} 