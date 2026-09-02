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
      /** Spec: getTools(options?) — only the members we consume are typed. */
      getTools?: (options?: { fromOrigins?: string[] }) => Promise<Array<{ name: string; description?: string }>>;
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
