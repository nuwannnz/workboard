import type { Request, Response } from 'express';
import { HealthService } from '../services/health.service';

/**
 * Health controller — thin HTTP adapter (Principle I). Delegates all decisions
 * to the service and only maps the result to an HTTP status code.
 */
export class HealthController {
  constructor(private readonly service: HealthService = new HealthService()) {}

  getHealth = async (_req: Request, res: Response): Promise<void> => {
    const report = await this.service.getHealth();
    const statusCode = report.status === 'healthy' ? 200 : 503;
    res.status(statusCode).json(report);
  };
}
