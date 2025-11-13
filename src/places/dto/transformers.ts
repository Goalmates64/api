import { TransformFnParams } from 'class-transformer';

const toUnknown = (value: unknown): unknown => value;

export const toTrimmedString = ({ value }: TransformFnParams): unknown => {
  if (typeof value === 'string') {
    return value.trim();
  }
  return toUnknown(value);
};

export const toUppercaseCountry = ({ value }: TransformFnParams): unknown => {
  if (typeof value === 'string') {
    return value.trim().toUpperCase();
  }
  return toUnknown(value);
};

export const toRequiredNumber = ({ value }: TransformFnParams): number => {
  if (typeof value === 'number') {
    return value;
  }
  return Number(value);
};

export const toOptionalNumber = ({
  value,
}: TransformFnParams): number | undefined => {
  if (value === undefined || value === null || value === '') {
    return undefined;
  }

  const parsed = Number(value);
  return Number.isNaN(parsed) ? undefined : parsed;
};
