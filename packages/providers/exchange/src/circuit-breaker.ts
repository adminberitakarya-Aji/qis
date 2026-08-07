// Qis Circuit Breaker
// Explicit circuit breaker ONLY around exchange calls (Binance/Bybit).
// If an exchange is erroring repeatedly, stop hammering it and alert
// (via 0.1 ops alerting) instead of burning through retries silently.
//
// Skip circuit breakers for internal engine-to-engine calls; they're not
// the failure-prone boundary here.

export type CircuitState = 'closed' | 'open' | 'half_open';

export interface CircuitBreakerOptions {
  /** Number of consecutive failures before tripping open. Default: 5 */
  failureThreshold?: number;
  /** Time in ms the breaker stays open before trying half-open. Default: 30_000 */
  resetTimeoutMs?: number;
  /** Number of successful calls in half-open state to close the breaker. Default: 2 */
  successThreshold?: number;
  /** Optional callback fired when the breaker trips open. */
  onOpen?: (exchange: string, operation: string, lastError: unknown) => void;
  /** Optional callback fired when the breaker closes again. */
  onClose?: (exchange: string, operation: string) => void;
  /** Optional callback fired when a call is rejected because the breaker is open. */
  onReject?: (exchange: string, operation: string) => void;
}

interface BreakerState {
  state: CircuitState;
  consecutiveFailures: number;
  consecutiveSuccesses: number;
  openedAt: number | null;
}

/**
 * Circuit breaker for exchange calls.
 *
 * States:
 * - closed: normal operation, calls pass through
 * - open: failures exceeded threshold, calls are rejected immediately
 * - half_open: after resetTimeout, one probe call is allowed; success closes,
 *   failure re-opens
 *
 * The breaker is per (exchange, operation) pair so a failing Binance
 * fetchTicker doesn't block Bybit order execution.
 */
export class CircuitBreaker {
  private readonly failureThreshold: number;
  private readonly resetTimeoutMs: number;
  private readonly successThreshold: number;
  private readonly onOpen?: (exchange: string, operation: string, lastError: unknown) => void;
  private readonly onClose?: (exchange: string, operation: string) => void;
  private readonly onReject?: (exchange: string, operation: string) => void;

  private readonly states = new Map<string, BreakerState>();

  constructor(options: CircuitBreakerOptions = {}) {
    this.failureThreshold = options.failureThreshold ?? 5;
    this.resetTimeoutMs = options.resetTimeoutMs ?? 30_000;
    this.successThreshold = options.successThreshold ?? 2;
    this.onOpen = options.onOpen;
    this.onClose = options.onClose;
    this.onReject = options.onReject;
  }

  private key(exchange: string, operation: string): string {
    return `${exchange}:${operation}`;
  }

  private getState(exchange: string, operation: string): BreakerState {
    const key = this.key(exchange, operation);
    let state = this.states.get(key);
    if (!state) {
      state = { state: 'closed', consecutiveFailures: 0, consecutiveSuccesses: 0, openedAt: null };
      this.states.set(key, state);
    }
    return state;
  }

  /**
   * Returns true if the call should be allowed through.
   * If the breaker is open and the reset timeout has elapsed, transitions
   * to half-open and allows a single probe call.
   */
  isAllowed(exchange: string, operation: string): boolean {
    const state = this.getState(exchange, operation);

    if (state.state === 'closed') return true;

    if (state.state === 'open') {
      // Check if reset timeout has elapsed → transition to half-open
      if (state.openedAt !== null && Date.now() - state.openedAt >= this.resetTimeoutMs) {
        state.state = 'half_open';
        state.consecutiveSuccesses = 0;
        return true; // Allow one probe call
      }
      this.onReject?.(exchange, operation);
      return false;
    }

    // half_open: only allow if we haven't already reached success threshold
    return state.consecutiveSuccesses < this.successThreshold;
  }

  /**
   * Records a successful call.
   */
  recordSuccess(exchange: string, operation: string): void {
    const state = this.getState(exchange, operation);
    state.consecutiveFailures = 0;

    if (state.state === 'half_open') {
      state.consecutiveSuccesses++;
      if (state.consecutiveSuccesses >= this.successThreshold) {
        state.state = 'closed';
        state.consecutiveSuccesses = 0;
        state.openedAt = null;
        this.onClose?.(exchange, operation);
      }
    } else {
      state.consecutiveSuccesses = 0;
    }
  }

  /**
   * Records a failed call. Trips the breaker open if failures exceed threshold.
   */
  recordFailure(exchange: string, operation: string, error: unknown): void {
    const state = this.getState(exchange, operation);
    state.consecutiveFailures++;
    state.consecutiveSuccesses = 0;

    if (state.state === 'half_open' || state.consecutiveFailures >= this.failureThreshold) {
      state.state = 'open';
      state.openedAt = Date.now();
      this.onOpen?.(exchange, operation, error);
    }
  }

  /**
   * Runs a function guarded by the circuit breaker.
   * Throws a CircuitOpenError if the breaker is open.
   */
  async run<T>(
    exchange: string,
    operation: string,
    fn: () => Promise<T>
  ): Promise<T> {
    if (!this.isAllowed(exchange, operation)) {
      throw new CircuitOpenError(
        `Circuit breaker open for ${exchange}:${operation} — call rejected`
      );
    }

    try {
      const result = await fn();
      this.recordSuccess(exchange, operation);
      return result;
    } catch (error) {
      this.recordFailure(exchange, operation, error);
      throw error;
    }
  }

  /** Returns the current state for a given exchange:operation. */
  getStateName(exchange: string, operation: string): CircuitState {
    return this.getState(exchange, operation).state;
  }

  /** Resets all breaker states (e.g. on startup or manual intervention). */
  resetAll(): void {
    this.states.clear();
  }
}

export class CircuitOpenError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CircuitOpenError';
  }
}

// Singleton instance shared across the exchange provider layer.
// Per (exchange, operation) state means one breaker instance is fine.
export const circuitBreaker = new CircuitBreaker({
  onOpen: (exchange, operation, lastError) => {
    console.error(
      `[CircuitBreaker] ${exchange}:${operation} tripped OPEN after repeated failures:`,
      lastError instanceof Error ? lastError.message : String(lastError)
    );
  },
  onClose: (exchange, operation) => {
    console.log(`[CircuitBreaker] ${exchange}:${operation} recovered — breaker CLOSED`);
  },
  onReject: (exchange, operation) => {
    console.warn(`[CircuitBreaker] ${exchange}:${operation} call REJECTED (breaker open)`);
  },
});