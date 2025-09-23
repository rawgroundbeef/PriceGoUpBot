import { injectable } from 'inversify';
import * as QRCode from 'qrcode';
import { volumeBotSettings } from '../config';
import { IPaymentService } from '../interfaces';

@injectable()
export class PaymentService implements IPaymentService {
  
  async generateQRCode(address: string, amount: number): Promise<string> {
    try {
      // Create Solana pay URL format
      const solanaPayUrl = `solana:${address}?amount=${amount}&label=PriceGoUpBot%20Volume%20Order`;
      
      // Generate QR code as base64 data URL
      const qrCodeDataUrl = await QRCode.toDataURL(solanaPayUrl, {
        width: 300,
        margin: 2,
        color: {
          dark: '#000000',
          light: '#FFFFFF'
        }
      });

      // Return just the base64 data without the data URL prefix
      return qrCodeDataUrl.split(',')[1];
    } catch (error) {
      console.error('Error generating QR code:', error);
      throw new Error('Failed to generate QR code');
    }
  }

  async calculateOrderCost(volume: number, duration: number): Promise<{
    tasksCount: number;
    costPerTask: number;
    totalCost: number;
  }> {
    try {
      // Calculate number of tasks based on volume and duration
      const tasksCount = this.calculateTasksCount(volume, duration);
      
      // Base cost per task
      const costPerTask = volumeBotSettings.baseCostPerTask;
      
      // Calculate total cost
      const totalCost = tasksCount * costPerTask;
      
      return {
        tasksCount,
        costPerTask,
        totalCost: Math.round(totalCost * 100) / 100 // Round to 2 decimal places
      };
    } catch (error) {
      console.error('Error calculating order cost:', error);
      throw new Error('Failed to calculate order cost');
    }
  }

  private calculateTasksCount(volume: number, duration: number): number {
    // Calculate tasks based on volume target and duration
    // More volume or shorter duration = more tasks needed
    
    const baseTasksPerMillion = 12; // 12 tasks per 1M volume
    const volumeInMillions = volume / 1000000;
    
    // Duration factor: shorter duration needs more parallel tasks
    const durationFactor = this.getDurationFactor(duration);
    
    // Calculate base tasks needed
    const baseTasks = Math.ceil(baseTasksPerMillion * volumeInMillions);
    
    // Apply duration factor
    const totalTasks = Math.ceil(baseTasks * durationFactor);
    
    // Ensure minimum of 1 task
    return Math.max(1, totalTasks);
  }

  private getDurationFactor(hours: number): number {
    // Duration factor multiplier based on how quickly volume needs to be delivered
    if (hours <= 6) return 2.0;    // 6 hours or less: 2x tasks
    if (hours <= 12) return 1.5;   // 12 hours: 1.5x tasks
    if (hours <= 24) return 1.2;   // 24 hours: 1.2x tasks
    if (hours <= 72) return 1.0;   // 3 days: 1x tasks
    return 0.8;                    // 7 days: 0.8x tasks (more time, fewer parallel tasks)
  }

  /**
   * Get volume pricing tiers for display
   */
  getVolumePricingTiers(): Array<{
    volume: number;
    formattedVolume: string;
    estimatedTasks: number;
    estimatedCost: number;
  }> {
    return volumeBotSettings.volumePackages.map(volume => {
      const tasksCount = this.calculateTasksCount(volume, 24); // Use 24h as baseline
      const cost = tasksCount * volumeBotSettings.baseCostPerTask;
      
      return {
        volume,
        formattedVolume: this.formatVolume(volume),
        estimatedTasks: tasksCount,
        estimatedCost: Math.round(cost * 100) / 100
      };
    });
  }

  /**
   * Get duration options for display
   */
  getDurationOptions(): Array<{
    hours: number;
    formattedDuration: string;
    speedMultiplier: number;
  }> {
    return volumeBotSettings.durations.map(hours => ({
      hours,
      formattedDuration: this.formatDuration(hours),
      speedMultiplier: this.getDurationFactor(hours)
    }));
  }

  /**
   * Estimate completion time for an order
   */
  estimateCompletionTime(volume: number, duration: number): {
    estimatedHours: number;
    estimatedMinutes: number;
    intervalBetweenTasks: number;
  } {
    const tasksCount = this.calculateTasksCount(volume, duration);
    const totalCycles = tasksCount * volumeBotSettings.cyclesPerTask;
    
    // Each cycle takes some time, spread across the duration
    const intervalBetweenTasks = Math.floor((duration * 60) / totalCycles); // minutes
    
    return {
      estimatedHours: duration,
      estimatedMinutes: duration * 60,
      intervalBetweenTasks: Math.max(1, intervalBetweenTasks) // At least 1 minute between tasks
    };
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
    if (hours >= 168) return `${hours / 168} Days`;
    if (hours >= 24) return `${hours / 24} Days`;
    return `${hours}h`;
  }
}
