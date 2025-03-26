import { SFCTemplateCompileOptions, SFCAsyncStyleCompileOptions } from "vue/compiler-sfc";

export interface Options {
  include: string | RegExp | (string | RegExp)[];
  exclude: string | RegExp | (string | RegExp)[];
  target: "node" | "browser";
  exposeFilename: boolean;

  customBlocks?: string[];

  // if true, handle preprocessors directly instead of delegating to other
  // rollup plugins
  preprocessStyles?: boolean;

  // sfc template options
  templatePreprocessOptions?: Record<string, SFCTemplateCompileOptions["preprocessOptions"]>;
  compiler?: SFCTemplateCompileOptions["compiler"];
  compilerOptions?: SFCTemplateCompileOptions["compilerOptions"];
  transformAssetUrls?: SFCTemplateCompileOptions["transformAssetUrls"];

  // sfc style options
  postcssOptions?: SFCAsyncStyleCompileOptions["postcssOptions"];
  postcssPlugins?: SFCAsyncStyleCompileOptions["postcssPlugins"];
  cssModulesOptions?: SFCAsyncStyleCompileOptions["modulesOptions"];
  preprocessCustomRequire?: SFCAsyncStyleCompileOptions["preprocessCustomRequire"];
  preprocessOptions?: SFCAsyncStyleCompileOptions["preprocessOptions"];
}

/** Parsed Vue SFC query */
export type Query =
  | { vue: false }
  | { filename: string; vue: true; type: "custom"; index: number; src: boolean }
  | { filename: string; vue: true; type: "template"; id?: string; src: boolean }
  | { filename: string; vue: true; type: "script"; src: boolean }
  | {
      filename: string;
      vue: true;
      type: "style";
      index: number;
      id?: string;
      scoped?: boolean;
      module?: string | boolean;
      src: boolean;
    };
