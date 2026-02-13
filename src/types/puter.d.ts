export {};

declare global {
  interface Window {
    puter?: {
      ai: {
        chat: (
          promptOrMessages: unknown,
          options?: {
            model?: string;
            stream?: boolean;
          }
        ) => Promise<unknown>;
      };
    };
  }
}
