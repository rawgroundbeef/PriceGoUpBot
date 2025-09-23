// Define types for Vercel request/response since @vercel/node might not be installed
interface VercelRequest {
  method?: string;
  headers: Record<string, string | string[] | undefined>;
  body?: any;
}

interface VercelResponse {
  status: (code: number) => {
    json: (data: any) => void;
  };
}
import { container } from '../src/ioc-container';
import { TYPES } from '../src/types';
import { VolumeEngineService } from '../src/services/volume-engine.service';
import { VolumeOrderService } from '../src/services/volume-order.service';
import { OrderStatus } from '../src/interfaces';
import { CRON_SECRET, VOLUME_PROCESSOR_SECRET } from '../src/config';

/**
 * Vercel Edge Function to process volume orders
 * This function should be called periodically (e.g., via cron job)
 * to start volume generation for confirmed orders
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Only allow GET requests (Vercel cron)
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Vercel cron authentication - check Authorization header or query param
  const auth = req.headers.authorization;
  const querySecret = (req as any).query?.secret;
  const isAuthorized = auth === `Bearer ${CRON_SECRET}` || querySecret === CRON_SECRET;
  
  if (!isAuthorized) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    console.log('🔄 Starting volume processor...');
    
    // Get service instances
    const volumeEngine = container.get<VolumeEngineService>(TYPES.VolumeEngineService);
    const volumeOrderService = container.get<VolumeOrderService>(TYPES.VolumeOrderService);

    // Step 1: Start any orders that are payment confirmed but not yet running
    const pendingOrders = await volumeOrderService.getPendingOrders();
    console.log(`📊 Found ${pendingOrders.length} orders ready to start`);

    const startResults: Array<{
      orderId: string;
      status: 'started' | 'error';
      message: string;
    }> = [];
    
    for (const order of pendingOrders) {
      try {
        console.log(`🚀 Starting volume generation for order ${order.id}`);
        await volumeEngine.startVolumeGeneration(order.id);
        
        startResults.push({
          orderId: order.id,
          status: 'started',
          message: 'Volume generation started successfully'
        });
        
      } catch (error) {
        console.error(`❌ Error starting order ${order.id}:`, error);
        
        startResults.push({
          orderId: order.id,
          status: 'error',
          message: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    }

    // Step 2: Process all pending tasks for running orders
    console.log('📊 Processing pending tasks for running orders...');
    const taskResults = await volumeEngine.processAllPendingTasks();

    const successCount = startResults.filter(r => r.status === 'started').length;
    const errorCount = startResults.filter(r => r.status === 'error').length;

    console.log(`✅ Volume processor completed:`);
    console.log(`   - Started: ${successCount} orders`);
    console.log(`   - Errors: ${errorCount} orders`);
    console.log(`   - Processed: ${taskResults.processedTasks} tasks`);
    console.log(`   - Completed: ${taskResults.completedOrders.length} orders`);

    return res.status(200).json({
      success: true,
      message: `Volume processor completed successfully`,
      results: {
        ordersStarted: successCount,
        startErrors: errorCount,
        tasksProcessed: taskResults.processedTasks,
        ordersCompleted: taskResults.completedOrders.length,
        processingErrors: taskResults.errors.length,
        details: {
          startedOrders: startResults,
          completedOrders: taskResults.completedOrders,
          errors: [...startResults.filter(r => r.status === 'error'), ...taskResults.errors]
        }
      }
    });

  } catch (error) {
    console.error('❌ Volume processor error:', error);
    
    return res.status(500).json({
      success: false,
      error: 'Internal server error',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}
