import { HealthRepository } from '../repositories/health.repository';

export interface HealthReport {
  status: 'healthy' | 'unhealthy';
  service: 'workboard-backend';
  checks: {
    persistence: 'healthy' | 'unhealthy';
  };
  timestamp: string;
}

/**
 * Health service — the business logic layer for the health check. Determines
 * overall status from the persistence probe (Principle I: logic lives here,
 * not in the route/controller).
 */
export class HealthService {
  constructor(private readonly repository: HealthRepository = new HealthRepository()) {}

  async getHealth(): Promise<HealthReport> {
    const reachable = await this.repository.isReachable();
    const persistence = reachable ? 'healthy' : 'unhealthy';

    return {
      status: reachable ? 'healthy' : 'unhealthy',
      service: 'workboard-backend',
      checks: { persistence },
      timestamp: new Date().toISOString(),
    };
  }
}
