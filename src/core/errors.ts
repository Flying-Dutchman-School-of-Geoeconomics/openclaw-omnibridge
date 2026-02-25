export class SecurityError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SecurityError";
  }
}

export class PolicyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PolicyError";
  }
}

export class AdapterError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AdapterError";
  }
}
