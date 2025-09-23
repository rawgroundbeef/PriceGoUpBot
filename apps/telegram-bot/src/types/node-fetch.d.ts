declare module 'node-fetch' {
  export default function fetch(
    url: string | Request,
    init?: RequestInit
  ): Promise<Response>;
  
  export class Request extends globalThis.Request {}
  export class Response extends globalThis.Response {}
  export class Headers extends globalThis.Headers {}
} 