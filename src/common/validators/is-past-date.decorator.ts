import {
  registerDecorator,
  ValidationArguments,
  ValidationOptions,
} from 'class-validator';

export function IsPastDateString(validationOptions?: ValidationOptions) {
  return function (object: object, propertyName: string) {
    registerDecorator({
      name: 'isPastDateString',
      target: object.constructor,
      propertyName,
      options: validationOptions,
      validator: {
        validate(value: unknown) {
          if (value === null || value === undefined || value === '') {
            return true;
          }

          if (typeof value !== 'string') {
            return false;
          }

          const parsed = new Date(value);
          if (Number.isNaN(parsed.getTime())) {
            return false;
          }

          const today = new Date();
          today.setHours(0, 0, 0, 0);
          parsed.setHours(0, 0, 0, 0);

          return parsed.getTime() < today.getTime();
        },
        defaultMessage(args: ValidationArguments) {
          return (args.property ?? 'date') + ' doit être une date passée';
        },
      },
    });
  };
}
