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
import { SweeperService } from '../src/services/sweeper.service';
import { CRON_SECRET, SWEEPER_SECRET } from '../src/config';

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
    console.log('🔄 Starting sweeper...');
    
    // Get sweeper service instance
    const sweeper = container.get<SweeperService>(TYPES.SweeperService);
    
    // Sweep all pending payments
    const results = await sweeper.sweepAllPendingPayments();
    
    console.log(`✅ Sweeper completed: ${results.swept}/${results.processed} orders swept`);
    
    return res.status(200).json({
      success: true,
      message: `Sweeper completed successfully`,
      results: {
        processed: results.processed,
        swept: results.swept,
        errors: results.errors.length,
        errorDetails: results.errors
      }
    });
    
  } catch (error) {
    console.error('❌ Sweeper error:', error);
    
    return res.status(500).json({
      success: false,
      error: 'Internal server error',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}


