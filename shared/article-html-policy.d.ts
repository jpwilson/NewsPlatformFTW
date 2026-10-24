/** Types for article-html-policy.js (plain JS so Node functions can import it). */

export declare const ALLOWED_TAGS: string[];
export declare const GLOBAL_ATTRS: string[];
export declare const TAG_ATTRS: Record<string, string[]>;
export declare const ALLOWED_DATA_ATTRS: string[];
export declare const ALLOWED_URL_SCHEMES: string[];
export declare const ALLOWED_IFRAME_HOSTS: string[];
export declare const ALLOWED_STYLE_PROPS: Record<string, RegExp>;
export declare function allAllowedAttrs(): string[];
export declare function isSafeUrl(url: unknown): boolean;
export declare function isAllowedIframeUrl(url: unknown): boolean;
