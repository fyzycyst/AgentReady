declare global {
  interface Document {
    modelContext?: {
      registerTool: (
        tool: {
          name: string;
          description: string;
          title?: string;
          inputSchema?: object;
          annotations?: { readOnlyHint?: boolean; untrustedContentHint?: boolean };
          execute: (input: Record<string, unknown>, options: { signal: AbortSignal }) => Promise<unknown>;
        },
        options?: { signal?: AbortSignal },
      ) => Promise<void>;
    };
  }
}

/** Declarative WebMCP attributes (not yet in DOM typings). */
export type WebMcpFormProps = {
  toolname?: string;
  tooldescription?: string;
  toolautosubmit?: boolean;
};

export type WebMcpControlProps = {
  toolparamdescription?: string;
};

export {};
