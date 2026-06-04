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

        case RuleType.FIXED_RANGE:
          return this.evaluateFixedRange(ruleConfig, measuredValue);
        case RuleType.CHEMICAL_COMPOSITION:
          return this.evaluateChemicalComposition(ruleConfig, batchContext);
        case RuleType.MECHANICAL_PROPERTIES:
          return this.evaluateMechanical(ruleConfig, batchContext);
        case RuleType.GENERIC_CONDITION:
          return this.evaluateGeneric(parameter.ruleDefinition.ruleConfig, batchContext);
        case RuleType.TEXT_BOOLEAN:
          return this.evaluateTextBoolean(ruleConfig, batchContext);
        case RuleType.TEXT_NUMERIC:
          return this.evaluateTextNumeric(ruleConfig, batchContext);
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

    if (!band) {
      return {
        pass: false,
        error: 'No matching band for the provided nominal value',
      };
    }

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

    if (!row || !col) {
      return {
        pass: false,
        error: 'No matching matrix band for the provided OD / wall thickness',
      };
    }

    const cell = config.matrix.find(
      (m: any) => m.row === row.key && m.col === col.key
    );

    if (!cell) {
      return {
        pass: false,
        error: 'No matrix tolerance value found for the selected OD / wall thickness',
      };
    }

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

    if (!band) {
      return {
        pass: false,
        error: 'No matching ratio band for the provided OD / wall thickness',
      };
    }

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
      (b) => nominal >= b.min && nominal <= b.max
    );

    if (!band) {
      return {
        pass: false,
        error: 'No matching band for the provided nominal value',
      };
    }

    const min = nominal - (band.minus || 0);
    const max = nominal + (band.plus || 0);

    const pass = measuredValue >= min && measuredValue <= max;

    return { pass, min, max };
  }

  private evaluateFixedRange(config: any, measuredValue: number) {
    const min = config.minValue ?? null;
    const max = config.maxValue ?? null;

    const pass =
      (min === null || measuredValue >= min) &&
      (max === null || measuredValue <= max);

    return { pass, min, max };
  }

  private evaluateChemicalComposition(config: any, batchContext: any) {
    const { grade } = batchContext;

    console.log("Incoming grade:", grade);
    console.log("Available grades:", config.grades);

    let columns = config.columns;
    let grades = config.grades;

    if (!columns) {
      columns = [
        { id: 'cuAgMin', name: 'Cu + Ag', type: 'MIN' },
        { id: 'pMin', name: 'P', type: 'MIN' },
        { id: 'pMax', name: 'P', type: 'MAX' },
        { id: 'oMax', name: 'O', type: 'MAX' }
      ];
      grades = (grades || []).map((g: any) => ({
        key: g.key,
        values: {
          cuAgMin: g.cuAgMin ?? null,
          pMin: g.pMin ?? null,
          pMax: g.pMax ?? null,
          oMax: g.oMax ?? null,
        }
      }));
    }

    const chemicalValues = batchContext.chemicalValues || {
      cuAgMin: batchContext.cuAg,
      pMin: batchContext.p,
      pMax: batchContext.p,
      oMax: batchContext.o,
    };

    const gradeRule = grades.find(
      (g: any) =>
        g.key?.trim().toLowerCase() ===
        grade?.trim().toLowerCase()
    );

    if (!gradeRule) {
      return {
        pass: false,
        error: 'Selected grade not found in configuration',
      };
    }

    let pass = true;
    const details: any = {};

    for (const col of columns) {
      const requiredVal = gradeRule.values?.[col.id];

      // If the limit value is 0 or null, we skip validation for this column
      if (requiredVal === undefined || requiredVal === null || requiredVal === 0) {
        continue;
      }

      const actualVal =
        chemicalValues[col.id] ??
        chemicalValues[col.name] ??
        chemicalValues[String(col.name).trim()] ??
        this.findChemicalValueByNormalizedName(chemicalValues, col.name);
      if (actualVal === undefined || actualVal === null) {
        pass = false; // Missing value fails validation if it's required
        details[col.name] = false;
        continue;
      }

      let result = false;
      if (col.type === 'MIN') {
        result = actualVal >= requiredVal;
      } else if (col.type === 'MAX') {
        result = actualVal <= requiredVal;
      }

      details[col.name] = result;
      if (!result) pass = false;
    }

    return { pass, details };
  }

  private findChemicalValueByNormalizedName(
    chemicalValues: Record<string, unknown>,
    targetName: string,
  ) {
    const normalizedTarget = this.normalizeChemicalKey(targetName);
    const matchedEntry = Object.entries(chemicalValues).find(
      ([key]) => this.normalizeChemicalKey(key) === normalizedTarget,
    );

    return matchedEntry?.[1];
  }

  private normalizeChemicalKey(value: string) {
    return String(value).trim().toLowerCase().replace(/[^a-z0-9]+/g, '');
  }

  private evaluateMechanical(config: any, batchContext: any) {

    const {
      condition,
      tensile,
      elongation,
      flattening,
      drift
    } = batchContext;

    const rule = config.conditions.find(
      (c: any) =>
        c.key?.trim().toLowerCase() ===
        condition?.trim().toLowerCase()
    );

    if (!rule) {
      return { pass: false, error: 'Invalid condition selected' };
    }

    let pass = true;
    const details: any = {};

    // Tensile
    if (rule.tensileMin !== null) {
      const result =
        tensile >= rule.tensileMin &&
        (rule.tensileMax === null || tensile <= rule.tensileMax);

      details.tensile = result;
      if (!result) pass = false;
    }

    // Elongation
    if (rule.elongationMin !== null) {
      const result = elongation >= rule.elongationMin;
      details.elongation = result;
      if (!result) pass = false;
    }

    // Flattening
    if (config.flatteningRequired) {
      const result = flattening === true;
      details.flattening = result;
      if (!result) pass = false;
    }

    // Drift
    if (config.driftRequired) {
      const result = drift === true;
      details.drift = result;
      if (!result) pass = false;
    }

    return { pass, details };
  }

  private evaluateGeneric(config: any, batchContext: any) {

    const { condition, dynamicValues } = batchContext;

    if (!condition) {
      return {
        pass: false,
        error: 'Condition is required',
      };
    }

    const rule = config.conditions?.find(
      (c: any) =>
        c.key?.trim().toLowerCase() ===
        condition?.trim().toLowerCase()
    );

    if (!rule) {
      return {
        pass: false,
        error: 'Invalid condition selected',
      };
    }

    let pass = true;
    const details: any = {};

    for (const field of config.fields || []) {

      const fieldName = field.name;

      const value = dynamicValues?.[fieldName];

      if (value === undefined || value === null) {
        details[fieldName] = {
          error: 'Value missing',
          pass: false
        };
        pass = false;
        continue;
      }

      const ruleDef = rule.rules?.[fieldName];

      if (!ruleDef) {
        details[fieldName] = {
          error: 'No rule defined',
          pass: false
        };
        pass = false;
        continue;
      }

      const min = ruleDef.min ?? null;
      const max = ruleDef.max ?? null;

      const result =
        (min === null || value >= min) &&
        (max === null || value <= max);

      details[fieldName] = {
        value,
        min,
        max,
        pass: result
      };

      if (!result) pass = false;
    }

    return { pass, details };
  }

  private evaluateTextBoolean(config: any, batchContext: any) {

    const { booleanResult, grade } = batchContext;

    // Grade restriction
    if (config.applicableGrades?.length > 0) {
      if (!config.applicableGrades.includes(grade)) {
        return {
          pass: true,
          skipped: true,
          reason: 'Not applicable for this grade'
        };
      }
    }

    const pass = booleanResult === config.expected;

    return {
      pass,
      expected: config.expected,
      actual: booleanResult
    };
  }

  private evaluateTextNumeric(config: any, batchContext: any) {

    const value = batchContext.numericValue;

    if (value === null || value === undefined) {
      throw new Error('Value is required');
    }

    const min = config.min ?? null;
    const max = config.max ?? null;

    const pass =
      (min === null || value >= min) &&
      (max === null || value <= max);

    return {
      pass,
      value,
      min,
      max,
      unit: config.unit
    };
  }
}
