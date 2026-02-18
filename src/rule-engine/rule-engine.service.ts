import { Injectable } from '@nestjs/common';
import { RuleType } from '@prisma/client';

@Injectable()
export class RuleEngineService {

  evaluate(parameter: any, batchContext: any, measuredValue: number) {

    // If dynamic rule exists
    if (parameter.ruleDefinition) {
      const { ruleType, ruleConfig } = parameter.ruleDefinition;

      switch (ruleType) {
        case RuleType.BAND_SINGLE:
          return this.evaluateBandSingle(ruleConfig, batchContext, measuredValue);

        case RuleType.BAND_MATRIX:
          return this.evaluateBandMatrix(ruleConfig, batchContext, measuredValue);

        case RuleType.RATIO_PERCENT:
          return this.evaluateRatioPercent(ruleConfig, batchContext, measuredValue);

        case RuleType.FORMULA:
          return this.evaluateFormula(ruleConfig, batchContext, measuredValue);

        case RuleType.ASYMMETRIC_BAND:
          return this.evaluateAsymmetricBand(ruleConfig, batchContext, measuredValue);

        default:
          throw new Error('Unsupported rule type');
      }
    }

    // fallback to simple min/max
    if (parameter.defaultCriteria) {
      const { minValue, maxValue } = parameter.defaultCriteria;

      const pass =
        (minValue === null || measuredValue >= minValue) &&
        (maxValue === null || measuredValue <= maxValue);

      return { pass };
    }

    throw new Error('No validation rule defined');
  }

  // -------- RULE IMPLEMENTATIONS --------

  private evaluateBandSingle(config: any, batchContext: any, measuredValue: number) {
    const nominal = batchContext.nominalValue;

    const band = config.bands.find(
      (b: any) => nominal > b.min && nominal <= b.max
    );

    if (!band) throw new Error('No matching band');

    const tolerance = band.tolerance;

    const min = nominal - tolerance;
    const max = nominal + tolerance;

    const pass = measuredValue >= min && measuredValue <= max;

    return { pass, min, max };
  }

  private evaluateBandMatrix(config: any, batchContext: any, measuredValue: number) {
    const wt = batchContext.wallThickness;
    const od = batchContext.outerDiameter;

    const row = config.rows.find((r: any) => wt > r.min && wt <= r.max);
    const col = config.columns.find((c: any) => od > c.min && od <= c.max);

    if (!row || !col) throw new Error('No matching matrix band');

    const cell = config.matrix.find(
      (m: any) => m.row === row.key && m.col === col.key
    );

    if (!cell) throw new Error('No matrix value found');

    const tolerance = cell.tolerance;

    const min = wt - tolerance;
    const max = wt + tolerance;

    const pass = measuredValue >= min && measuredValue <= max;

    return { pass, min, max };
  }

  private evaluateRatioPercent(config: any, batchContext: any, measuredValue: number) {
    const wt = batchContext.wallThickness;
    const od = batchContext.outerDiameter;

    const ratio = wt / od;

    const band = config.bands.find(
      (b: any) => ratio > b.min && ratio <= b.max
    );

    if (!band) throw new Error('No matching ratio band');

    const percent1 = band.percent1;
    const percent2 = band.percent2 || null;

    const tol1 = (percent1 / 100) * od;
    const tol2 = percent2 ? (percent2 / 100) * od : 0;

    const tolerance = percent2 ? Math.max(tol1, tol2) : tol1;

    const pass = measuredValue <= tolerance;

    return { pass, max: tolerance };
  }

  private evaluateFormula(config: any, batchContext: any, measuredValue: number) {
    const length = batchContext.length;

    const tolerance = config.perMeter * length;

    const pass = measuredValue <= tolerance;

    return { pass, max: tolerance };
  }

  private evaluateAsymmetricBand(config: any, batchContext: any, measuredValue: number) {
    const nominal = batchContext.nominalValue;

    const band = config.bands.find(
      (b: any) => nominal > b.min && nominal <= b.max
    );

    if (!band) throw new Error('No matching band');

    const min = nominal - (band.minus || 0);
    const max = nominal + (band.plus || 0);

    const pass = measuredValue >= min && measuredValue <= max;

    return { pass, min, max };
  }
}
