import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { StrategyEngine, type DetailedSimulationResult } from '@qis/strategy-engine';
import type { Blueprint } from '@qis/shared';
import { BuildStrategyDto } from './dto/build-strategy.dto';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class StrategyService {
  private strategyEngine = new StrategyEngine();
  private blueprintStore = new Map<string, Blueprint>();

  constructor(private prisma: PrismaService) {}

  async buildStrategy(userId: string, dto: BuildStrategyDto): Promise<Blueprint> {
    const blueprint = await this.strategyEngine.buildStrategy({
      exchange: dto.exchange,
      pair: dto.pair,
      capital: dto.capital,
      sectionCount: dto.sectionCount,
      capitalAllocationPercent: dto.capitalAllocationPercent,
      riskPreference: dto.riskPreference,
      floorAction: dto.floorAction,
    });

    // Attach userId for ownership validation
    blueprint.userId = userId;

    // Store in-memory map for instantaneous access
    this.blueprintStore.set(blueprint.id, blueprint);

    // Persist to PostgreSQL via Prisma
    try {
      await this.prisma.strategyBlueprint.create({
        data: {
          id: blueprint.id,
          userId,
          exchange: blueprint.exchange,
          pair: blueprint.pair,
          tradingCapital: blueprint.tradingCapital,
          sectionCount: blueprint.sectionCount,
          sectionsJson: JSON.stringify(blueprint.sections),
          capitalProtectionFloor: blueprint.capitalProtectionFloor,
          floorAction: blueprint.floorAction,
          maxCapitalPerMovementPercent: blueprint.maxCapitalPerMovementPercent,
          maxDrawdownAlertPercent: blueprint.maxDrawdownAlertPercent,
          confidenceScore: blueprint.confidenceScore,
          aiReasoning: blueprint.aiReasoning,
          createdAt: blueprint.createdAt,
          expiresAt: blueprint.expiresAt,
        },
      });
    } catch (dbErr: unknown) {
      const msg = dbErr instanceof Error ? dbErr.message : String(dbErr);
      console.warn(`[StrategyService] Database persistence skipped (${msg}). Using in-memory store.`);
    }

    return blueprint;
  }

  async getBlueprint(userId: string, id: string): Promise<Blueprint> {
    // 1. Check in-memory store first
    if (this.blueprintStore.has(id)) {
      const bp = this.blueprintStore.get(id)!;
      // Verify ownership — blueprint belongs to the requesting user
      if (bp.userId && bp.userId !== userId) {
        throw new ForbiddenException('You do not own this strategy blueprint');
      }
      return bp;
    }

    // 2. Fetch from Database
    try {
      const dbBp = await this.prisma.strategyBlueprint.findUnique({
        where: { id },
      });

      if (dbBp) {
        // Verify ownership — blueprint belongs to the requesting user
        if (dbBp.userId !== userId) {
          throw new ForbiddenException('You do not own this strategy blueprint');
        }

        const blueprint: Blueprint = {
          id: dbBp.id,
          userId: dbBp.userId,
          exchange: dbBp.exchange as Blueprint['exchange'],
          pair: dbBp.pair,
          tradingCapital: dbBp.tradingCapital,
          sectionCount: dbBp.sectionCount,
          sections: JSON.parse(dbBp.sectionsJson as string) as Blueprint['sections'],
          capitalProtectionFloor: dbBp.capitalProtectionFloor,
          floorAction: dbBp.floorAction as Blueprint['floorAction'],
          maxCapitalPerMovementPercent: dbBp.maxCapitalPerMovementPercent,
          maxDrawdownAlertPercent: dbBp.maxDrawdownAlertPercent,
          confidenceScore: dbBp.confidenceScore,
          aiReasoning: dbBp.aiReasoning,
          createdAt: dbBp.createdAt,
          expiresAt: dbBp.expiresAt,
        };

        this.blueprintStore.set(blueprint.id, blueprint);
        return blueprint;
      }
    } catch (err: unknown) {
      if (err instanceof ForbiddenException) throw err;
      const msg = err instanceof Error ? err.message : String(err);
      console.warn(`[StrategyService] Failed to query database for blueprint ${id}:`, msg);
    }

    throw new NotFoundException(`Strategy Blueprint with ID ${id} not found`);
  }

  async simulateStrategy(userId: string, blueprintId: string): Promise<DetailedSimulationResult> {
    const blueprint = await this.getBlueprint(userId, blueprintId);
    return this.strategyEngine.simulateStrategy(blueprint);
  }
}
