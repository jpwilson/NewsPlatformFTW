/** Types for json-image-rewrite.js. */
export declare function responseOrigin(req: { path?: string; url?: string; headers: Record<string, any> }): string;
export declare function absoluteOrigin(req: { headers: Record<string, any> }): string;
export declare function installJsonImageRewrite(app: { use: (...args: any[]) => unknown }): void;
