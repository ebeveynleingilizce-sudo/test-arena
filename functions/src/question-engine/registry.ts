import type { DomainValidator } from './contracts.js';

// Registration belongs to trusted server configuration, never candidate fields.
export class ValidatorRegistry {
  private readonly validators = new Map<string,DomainValidator>();
  register(validator: DomainValidator) {
    if (!validator.capability || this.validators.has(validator.capability)) throw new Error('DUPLICATE_CAPABILITY');
    this.validators.set(validator.capability,validator);
    return this;
  }
  get(capability: string) { return this.validators.get(capability); }
}
