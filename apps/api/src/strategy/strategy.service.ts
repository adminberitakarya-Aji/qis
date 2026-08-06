import { Injectable, NotFoundException } from '@nestjs/common';
import { StrategyEngine, DetailedSimulationResult } from '@qis/strategy-engine';
import { Blueprint } from '@qis/shared';
import { BuildStrategyDto } from './dto/build-strategy.dto';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class StrategyService {
  private strategyEngine = new StrategyEngine();
  private blueprintStore = new Map<string, Blueprint>();

  constructor(private prisma: PrismaService) {}

  async buildStrategy(dto: BuildStrategyDto): Promise<Blueprint> {
    const blueprint = await this.strategyEngine.buildStrategy({
      exchange: dto.exchange,
      pair: dto.pair,
      capital: dto.capital,
      sectionCount: dto.sectionCount,
      capitalAllocationPercent: dto.capitalAllocationPercent,
      riskPreference: dto.riskPreference,
    });

    // Store in-memory map for instantaneous access
    this.blueprintStore.set(blueprint.id, blueprint);

    // Persist to PostgreSQL via Prisma
    try {
      await this.prisma.strategyBlueprint.create({
        data: {
          id: blueprint.id,
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
    } catch (dbErr: any) {
      console.warn(`[StrategyService] Database persistence skipped (${dbErr.message}). Using in-memory store.`);
    }

    return blueprint;
  }

  async getBlueprint(id: string): Promise<Blueprint> {
    // 1. Check in-memory store first
    if (this.blueprintStore.has(id)) {
      return this.blueprintStore.get(id)!;
    }

    // 2. Fetch from Database
    try {
      const dbBp = await this.prisma.strategyBlueprint.findUnique({
        where: { id },
      });

      if (dbBp) {
        const blueprint: Blueprint = {
          id: dbBp.id,
          exchange: dbBp.exchange as any,
          pair: dbBp.pair,
          tradingCapital: dbBp.tradingCapital,
          sectionCount: dbBp.sectionCount as any,
          sections: JSON.parse(dbBp.sectionsJson),
          capitalProtectionFloor: dbBp.capitalProtectionFloor,
          floorAction: dbBp.floorAction as any,
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
    } catch (err: any) {
      console.warn(`[StrategyService] Failed to query database for blueprint ${id}:`, err.message);
    }

    throw new NotFoundException(`Strategy Blueprint with ID ${id} not found`);
  }

  async simulateStrategy(blueprintId: string): Promise<DetailedSimulationResult> {
    const blueprint = await this.getBlueprint(blueprintId);
    return this.strategyEngine.simulateStrategy(blueprint);
  }
}
