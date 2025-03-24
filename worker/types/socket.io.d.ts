declare module "socket.io" {
  export interface ServerOptions {
    cleanupEmptyChildNamespaces?: boolean;
    cors?: any;
    serveClient?: boolean;
  }

  export interface Server {
    _nsps: Map<string, Namespace>;
    of(namespace: string | RegExp): Namespace;
    on(event: string, listener: (...args: any[]) => void): this;
    disconnectSockets(close?: boolean): void;
    sockets: Namespace;
  }

  export interface Namespace {
    name: string;
    sockets: Map<string, Socket>;
    on(event: string, listener: (...args: any[]) => void): this;
    emit(event: string, ...args: any[]): boolean;
    send(event: string, ...args: any[]): this;
    to(room: string | string[]): BroadcastOperator;
  }

  export interface Socket {
    id: string;
    nsp: Namespace;
    client: { id: string };
    rooms: Set<string>;
    join(room: string | string[]): Promise<void>;
    leave(room: string | string[]): Promise<void>;
    to(room: string | string[]): BroadcastOperator;
    emit(event: string, ...args: any[]): boolean;
    on(event: string, listener: (...args: any[]) => void): this;
  }

  export interface BroadcastOperator {
    emit(event: string, ...args: any[]): boolean;
  }
}

declare module "socket.io/lib" {
  export interface Socket {
    id: string;
    nsp: {
      name: string;
    };
    client: { id: string };
    rooms: Set<string>;
    join(room: string | string[]): Promise<void>;
    leave(room: string | string[]): Promise<void>;
    to(room: string | string[]): any;
    emit(event: string, ...args: any[]): boolean;
    on(event: string, listener: (...args: any[]) => void): this;
  }
}
