import { VercelRequest, VercelResponse } from '@vercel/node';
import { webhookHandler } from '../src/index';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  return webhookHandler(req, res);
}