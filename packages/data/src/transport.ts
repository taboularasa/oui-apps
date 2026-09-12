export interface ConnectUnaryRequest {
  readonly method: string;
  readonly input: Readonly<Record<string, unknown>>;
  readonly headers: Readonly<Record<string, string>>;
  readonly signal: AbortSignal;
}

export type ConnectServerStreamRequest = ConnectUnaryRequest;

export interface GeneratedConnectClient {
  readonly serviceType: string;
  unary(request: ConnectUnaryRequest): Promise<unknown>;
  serverStream?(request: ConnectServerStreamRequest): AsyncIterable<unknown>;
}

export type GeneratedConnectUnaryMethod = (
  input: Readonly<Record<string, unknown>>,
  options: {
    readonly headers: Readonly<Record<string, string>>;
    readonly signal: AbortSignal;
  },
) => Promise<unknown>;

export type GeneratedConnectServerStreamMethod = (
  input: Readonly<Record<string, unknown>>,
  options: {
    readonly headers: Readonly<Record<string, string>>;
    readonly signal: AbortSignal;
  },
) => AsyncIterable<unknown>;

export function createGeneratedConnectClient(
  serviceType: string,
  methods: Readonly<Record<string, GeneratedConnectUnaryMethod>>,
  streams: Readonly<Record<string, GeneratedConnectServerStreamMethod>> = {},
): GeneratedConnectClient {
  return Object.freeze({
    serviceType,
    async unary(request: ConnectUnaryRequest): Promise<unknown> {
      const method = methods[request.method];
      if (method === undefined) {
        throw new Error(
          `Generated client ${serviceType} does not implement ${request.method}.`,
        );
      }
      return method(request.input, {
        headers: request.headers,
        signal: request.signal,
      });
    },
    serverStream(request: ConnectServerStreamRequest): AsyncIterable<unknown> {
      const method = streams[request.method];
      if (method === undefined) {
        throw new Error(
          `Generated client ${serviceType} does not implement stream ${request.method}.`,
        );
      }
      return method(request.input, {
        headers: request.headers,
        signal: request.signal,
      });
    },
  });
}

export interface ConnectClientRegistration {
  readonly serviceBindingId: string;
  readonly client: GeneratedConnectClient;
}

export interface ConnectClientRegistry {
  register(registration: ConnectClientRegistration): void;
  resolve(
    serviceBindingId: string,
    serviceType: string,
  ): GeneratedConnectClient;
}

export function createConnectClientRegistry(): ConnectClientRegistry {
  const registrations = new Map<string, GeneratedConnectClient>();

  return {
    register({ serviceBindingId, client }): void {
      if (registrations.has(serviceBindingId)) {
        throw new Error(
          `Connect client ${serviceBindingId} is already registered.`,
        );
      }
      registrations.set(serviceBindingId, client);
    },
    resolve(serviceBindingId, serviceType): GeneratedConnectClient {
      const client = registrations.get(serviceBindingId);
      if (client === undefined) {
        throw new Error(
          `No generated Connect client is registered for ${serviceBindingId}.`,
        );
      }
      if (client.serviceType !== serviceType) {
        throw new Error(
          `Connect client ${serviceBindingId} implements ${client.serviceType}, expected ${serviceType}.`,
        );
      }
      return client;
    },
  };
}

export type TestConnectHandler = (
  request: ConnectUnaryRequest,
) => Promise<unknown> | unknown;

export type TestConnectStreamHandler = (
  request: ConnectServerStreamRequest,
) => AsyncIterable<unknown>;

export class TestConnectClient implements GeneratedConnectClient {
  readonly serviceType: string;
  readonly requests: ConnectUnaryRequest[] = [];
  readonly streamRequests: ConnectServerStreamRequest[] = [];
  readonly #handlers: Readonly<Record<string, TestConnectHandler>>;
  readonly #streamHandlers: Readonly<Record<string, TestConnectStreamHandler>>;

  constructor(
    serviceType: string,
    handlers: Readonly<Record<string, TestConnectHandler>>,
    streamHandlers: Readonly<Record<string, TestConnectStreamHandler>> = {},
  ) {
    this.serviceType = serviceType;
    this.#handlers = handlers;
    this.#streamHandlers = streamHandlers;
  }

  async unary(request: ConnectUnaryRequest): Promise<unknown> {
    this.requests.push(request);
    const handler = this.#handlers[request.method];
    if (handler === undefined) {
      throw new Error(`Test transport has no handler for ${request.method}.`);
    }
    return handler(request);
  }

  serverStream(request: ConnectServerStreamRequest): AsyncIterable<unknown> {
    this.streamRequests.push(request);
    const handler = this.#streamHandlers[request.method];
    if (handler === undefined) {
      throw new Error(
        `Test transport has no stream handler for ${request.method}.`,
      );
    }
    return handler(request);
  }
}
