try {
  require.resolve("@vue/compiler-sfc");
} catch {
  // istanbul ignore next
  throw new Error("rollup-plugin-vue3 requires @vue/compiler-sfc");
}

import {
  CompilerError,
  compileStyleAsync,
  compileTemplate,
  parse,
  compileScript,
  SFCBlock,
  SFCDescriptor,
  SFCTemplateCompileResults,
  SFCAsyncStyleCompileOptions,
} from "@vue/compiler-sfc";

import fs from "fs-extra";
import createDebugger from "debug";
import { basename, relative } from "path";
import { Plugin, RollupError } from "rollup";
import { createFilter } from "@rollup/pluginutils";
import qs from "query-string";

import { hash, joinCode, normalizePath } from "./utils";
import { Options, Query } from "./types";

const debug = createDebugger("rollup-plugin-vue3");
const cache = new Map<string, SFCDescriptor>();

const defaultOpts: Options = {
  include: /\.vue$/,
  exclude: [],
  target: "browser",
  exposeFilename: false,
  customBlocks: [],
};

export default (opts: Partial<Options> = {}): Plugin => {
  const options: Options = { ...defaultOpts, ...opts };
  const isServer = options.target === "node";
  const isProduction = process.env.NODE_ENV === "production" ||
    process.env.BUILD === "production";
  const rootContext = process.cwd();

  const filter = createFilter(options.include, options.exclude);
  const filterCustomBlock = createCustomBlockFilter(options.customBlocks);

  const plugin: Plugin = {
    name: "vue3",

    async resolveId(id, importer) {
      const query = parseQuery(id);
      if (!query.vue) return null;

      if (query.src) {
        const resolved = await this.resolve(query.filename, importer, { skipSelf: true });
        if (resolved && importer) {
          cache.set(resolved.id, getDescriptor(importer));
          const [, originalQuery] = id.split("?", 2);
          resolved.id += `?${originalQuery}`;
          return resolved;
        }
      } else if (!filter(query.filename)) return null;

      debug(`resolveId(${id})`);
      return id;
    },

    async load(id) {
      const query = parseQuery(id);
      if (!query.vue) return null;

      if (query.src) return fs.readFile(query.filename, "utf-8");

      const descriptor = getDescriptor(query.filename);

      let block = null;
      if (query.type === "template") block = descriptor.template;
      else if (query.type === "script") block = descriptor.script;
      else if (query.type === "style") block = descriptor.styles[query.index];
      else if (query.type === "custom") block = descriptor.customBlocks[query.index];
      if (block) return { code: block.content, map: normalizeSourceMap(block.map) };

      return null;
    },

    async transform(code, id) {
      const query = parseQuery(id);

      // .vue file
      if (!query.vue && filter(id)) {
        debug(`transform(${id})`);

        const { descriptor, errors } = parseSFC(code, id, rootContext);

        if (errors.length > 0) {
          for (const error of errors) this.error(createRollupError(id, error));
          return null;
        }

        const output = transformVueSFC(
          code,
          id,
          descriptor,
          { rootContext, isProduction, isServer, filterCustomBlock },
          options,
        );

        debug("transient .vue file:", `\n${output}\n`);

        return { code: output, map: { mappings: "" } };
      }

      if (!query.vue) return null;
      if (!query.src && !filter(query.filename)) return null;

      const descriptor = getDescriptor(query.filename);
      const hasScoped = descriptor.styles.some(s => s.scoped);

      if (query.type === "template" && descriptor.template) {
        debug(`transform(${id})`);

        const block = descriptor.template;
        const preprocessLang = block.lang;

        const preprocessOptions =
          preprocessLang &&
          options.templatePreprocessOptions &&
          (options.templatePreprocessOptions[preprocessLang] as Record<string, unknown>);

        const result = compileTemplate({
          filename: query.filename,
          source: code,
          inMap: query.src ? undefined : block.map,
          preprocessLang,
          preprocessOptions,
          preprocessCustomRequire: options.preprocessCustomRequire,
          compiler: options.compiler,
          ssr: isServer,
          compilerOptions: {
            ...options.compilerOptions,
            scopeId: hasScoped && query.id ? `data-v-${query.id}` : undefined,
            bindingMetadata: descriptor.script ? descriptor.script.bindings : undefined,
          },
          transformAssetUrls: options.transformAssetUrls,
        });

        if (result.tips.length > 0)
          for (const tip of result.tips)
            this.warn({
              id: query.filename,
              message: tip,
            });

        if (result.errors.length > 0) {
          for (const error of result.errors)
            this.error(
              typeof error === "string"
                ? { id: query.filename, message: error }
                : createRollupError(query.filename, error),
            );

          return null;
        }

        return { code: result.code, map: normalizeSourceMap(result.map) };
      }

      if (query.type === "style" && descriptor.styles[query.index]) {
        debug(`transform(${id})`);
        const block = descriptor.styles[query.index];

        let preprocessOptions = (options.preprocessOptions as Record<string, unknown>) || {};

        const preprocessLang = (options.preprocessStyles
          ? block.lang
          : undefined) as SFCAsyncStyleCompileOptions["preprocessLang"];

        if (preprocessLang) {
          preprocessOptions =
            (preprocessOptions[preprocessLang] as Record<string, unknown>) || preprocessOptions;

          // include node_modules for imports by default
          switch (preprocessLang) {
            case "scss":
            case "sass":
              preprocessOptions = { includePaths: ["node_modules"], ...preprocessOptions };
              break;

            case "less":
            case "stylus":
              preprocessOptions = { paths: ["node_modules"], ...preprocessOptions };
          }
        } else preprocessOptions = {};

        const compileOpts: SFCAsyncStyleCompileOptions = {
          filename: query.filename,
          id: query.id ? `data-v-${query.id}` : ``,
          source: block.content,
          scoped: block.scoped,
          postcssOptions: options.postcssOptions as Record<string, unknown>,
          postcssPlugins: options.postcssPlugins,
          modulesOptions: options.cssModulesOptions,
          preprocessLang,
          preprocessCustomRequire: options.preprocessCustomRequire,
          preprocessOptions,
        };

        if (typeof block.vars !== "undefined") compileOpts.vars = Boolean(block.vars);
        if (typeof block.module !== "undefined") compileOpts.modules = Boolean(block.module);

        const result = await compileStyleAsync(compileOpts);

        if (result.errors.length > 0) {
          for (const error of result.errors)
            this.error({ id: query.filename, message: error.message });

          return null;
        }

        if (query.module)
          return { code: `export default ${JSON.stringify(result.modules)};`, map: null };

        return { code: result.code, map: normalizeSourceMap(result.map) };
      }

      return null;
    },
  };

  return plugin;
};

function createCustomBlockFilter(queries?: string[]): (type: string) => boolean {
  if (!queries || queries.length === 0)
    return /* istanbul ignore next -- Only invoked on customBlocks */ () => false;

  const allowed = new Set(queries.filter(query => /^[a-z]/i.test(query)));

  const disallowed = new Set(
    queries.filter(query => /^![a-z]/i.test(query)).map(query => query.slice(1)),
  );

  const allowAll = queries.includes("*") || !queries.includes("!*");

  return (type: string) => {
    if (allowed.has(type)) return true;
    if (disallowed.has(type)) return false;
    return allowAll;
  };
}

function parseQuery(id: string): Query {
  const [filename, query] = id.split("?", 2);
  if (!query) return { vue: false };

  const raw = qs.parse(query);
  if (!("vue" in raw)) return { vue: false };

  return {
    ...raw,
    filename,
    vue: true,
    index: raw.index && Number(raw.index),
    src: "src" in raw,
    scoped: "scoped" in raw,
  } as Query;
}

function getDescriptor(id: string) {
  const cached = cache.get(id);
  if (cached) return cached;
  throw new Error(`${id} is not parsed yet`);
}

function parseSFC(code: string, id: string, sourceRoot: string) {
  const { descriptor, errors } = parse(code, {
    sourceMap: true,
    filename: id,
    sourceRoot: sourceRoot,
  });

  cache.set(id, descriptor);
  return { descriptor, errors: errors };
}

function transformVueSFC(
  code: string,
  resourcePath: string,
  descriptor: SFCDescriptor,
  {
    rootContext,
    isProduction,
    isServer,
    filterCustomBlock,
  }: {
    rootContext: string;
    isProduction: boolean;
    isServer: boolean;
    filterCustomBlock: (type: string) => boolean;
  },
  options: Options,
) {
  const shortFilePath = relative(rootContext, resourcePath)
    .replace(/^(\.\.[/\\])+/, "")
    .replace(/\\/g, "/");

  const id = hash(isProduction
      // istanbul ignore next -- Not testing prod.
      ? `${shortFilePath}\n${code}`
      : shortFilePath);

  const hasScoped = descriptor.styles.some(s => s.scoped);
  const templateImport = getTemplateCode(descriptor, resourcePath, id, hasScoped, isServer);
  const scriptImport = getScriptCode(descriptor, resourcePath);
  const stylesCode = getStyleCode(descriptor, resourcePath, id, options.preprocessStyles);
  const customBlocksCode = getCustomBlock(descriptor, resourcePath, filterCustomBlock);

  const output = [
    scriptImport,
    templateImport,
    stylesCode,
    customBlocksCode,
    isServer ? `script.ssrRender = ssrRender;` : `script.render = render;`,
  ];

  if (hasScoped) output.push(`script.__scopeId = "data-v-${id}";`);

  // istanbul ignore else -- Not testing prod.
  if (!isProduction) {
    output.push(`script.__file = "${shortFilePath}";`);
  } else if (
    options.exposeFilename
  ) {
    output.push(`script.__file = "${basename(shortFilePath)}";`);
  }

  output.push("export default script");
  return joinCode(output);
}

function getTemplateCode(
  descriptor: SFCDescriptor,
  resourcePath: string,
  id: string,
  hasScoped: boolean,
  isServer: boolean,
) {
  let templateImport = `const render = () => {};`;

  if (descriptor.template) {
    const src = descriptor.template.src ?? resourcePath;
    const idQuery = `&id=${id}`;
    const scopedQuery = hasScoped ? `&scoped=true` : ``;
    const srcQuery = descriptor.template.src ? `&src` : ``;
    const attrsQuery = attrsToQuery(descriptor.template.attrs);
    const query = `?vue&type=template${idQuery}${srcQuery}${scopedQuery}${attrsQuery}`;
    const templateRequest = `"${normalizePath(src) + query}"`;
    templateImport = `import { ${isServer ? "ssrRender" : "render"} } from ${templateRequest};`;
  }

  return templateImport;
}

function getScriptCode(descriptor: SFCDescriptor, resourcePath: string) {
  let scriptImport = `const script = {}`;
  if (descriptor.script || descriptor.scriptSetup) {
    // istanbul ignore else -- Built-in to compiler
    if (compileScript) descriptor.script = compileScript(descriptor);
    // istanbul ignore else -- `descriptor.scriptSetup` is experimental and errs out in the regular build
    if (descriptor.script) {
      const src = descriptor.script.src ?? resourcePath;
      const attrsQuery = attrsToQuery(descriptor.script.attrs, "js");
      const srcQuery = descriptor.script.src ? `&src` : ``;
      const query = `?vue&type=script${srcQuery}${attrsQuery}`;
      const scriptRequest = `"${normalizePath(src) + query}"`;
      scriptImport = `import script from ${scriptRequest};`;
      scriptImport += `\nexport * from ${scriptRequest};`;
    }
  }
  return scriptImport;
}

function getStyleCode(
  descriptor: SFCDescriptor,
  resourcePath: string,
  id: string,
  preprocessStyles?: boolean,
) {
  let stylesCode = ``;
  let hasCSSModules = false;

  if (descriptor.styles.length > 0) {
    descriptor.styles.forEach((style, i) => {
      const src = style.src ?? resourcePath;

      // do not include module in default query, since we use it to indicate
      // that the module needs to export the modules json
      const attrsQuery = attrsToQuery(style.attrs, "css", preprocessStyles);
      const attrsQueryWithoutModule = attrsQuery.replace(/&module(=true|=[^&]+)?/, "");

      // make sure to only pass id when necessary so that we don't inject
      // duplicate tags when multiple components import the same css file
      const idQuery = style.scoped ? `&id=${id}` : ``;
      const srcQuery = style.src ? `&src` : ``;
      const query = `?vue&type=style&index=${i}${srcQuery}${idQuery}`;

      const styleRequest = normalizePath(src) + query + attrsQuery;
      const styleRequestWithoutModule = normalizePath(src) + query + attrsQueryWithoutModule;

      if (style.module) {
        if (!hasCSSModules) {
          stylesCode += `\nconst cssModules = script.__cssModules = {};`;
          hasCSSModules = true;
        }

        stylesCode += genCSSModulesCode(i, styleRequest, styleRequestWithoutModule, style.module);
      } else {
        stylesCode += `\nimport "${styleRequest}";`;
      }
    });
  }

  return stylesCode;
}

function getCustomBlock(
  descriptor: SFCDescriptor,
  resourcePath: string,
  filter: (type: string) => boolean,
) {
  const code: string[] = [];

  descriptor.customBlocks.forEach((block, index) => {
    if (!filter(block.type)) return;
    const src = block.src ?? resourcePath;
    const srcQuery = block.src ? `&src` : ``;
    const attrsQuery = attrsToQuery(block.attrs, block.type);
    const query = `?vue&type=${block.type}&index=${index}${srcQuery}${attrsQuery}`;
    const request = `"${normalizePath(src) + query}"`;
    code.push(`import block${index} from ${request};`);
    code.push(`if (typeof block${index} === "function") { block${index}(script) };`);
  });

  return joinCode(code);
}

const createRollupError = (id: string, error: CompilerError | SyntaxError): RollupError => {
  let frame;
  // istanbul ignore else
  if ("code" in error) {
    // Add here for coverage reasons: https://github.com/istanbuljs/istanbuljs/issues/526
    /* istanbul ignore next */
    frame = error.loc?.source;
  }
  return "code" in error
    ? {
        id,
        plugin: "vue3",
        pluginCode: String(error.code),
        message: error.message,
        frame,
        parserError: error,
        loc: error.loc && {
          file: id,
          line: error.loc.start.line,
          column: error.loc.start.column,
        },
      }
    // istanbul ignore next
    : {
        id,
        plugin: "vue3",
        message: error.message,
        parserError: error,
      }
};

// these are built-in query parameters so should be ignored
// if the user happen to add them as attrs
const ignoreList = ["id", "index", "src", "type", "lang"];

function attrsToQuery(
  attrs: SFCBlock["attrs"],
  langFallback?: string,
  forceLangFallback = false,
): string {
  let query = ``;

  const attrsList = Object.entries(attrs).filter(([k]) => !ignoreList.includes(k));
  if (attrsList.length > 0) query += `&`;
  query += qs.stringify(Object.fromEntries(attrsList));

  if (attrs.lang && typeof attrs.lang === "string" && !forceLangFallback) {
    query += `&lang.${attrs.lang}`;
  } else if (langFallback) {
    query += `&lang.${langFallback}`;
  }

  return query;
}

const normalizeSourceMap = (map: SFCTemplateCompileResults["map"]) =>
  map
    ? {
        ...map,
        version: Number(map.version),
        mappings: typeof map.mappings === "string"
          ? map.mappings
          // istanbul ignore next -- Seems `RawSourceMap` of source-map produces regardless
          : "",
      }
    : null;

function genCSSModulesCode(
  index: number,
  request: string,
  requestWithoutModule: string,
  moduleName: string | boolean,
): string {
  const styleVar = `style${index}`;
  const code = [`import "${requestWithoutModule}";`, `import ${styleVar} from "${request}";`];
  const name = typeof moduleName === "string" ? moduleName : "$style";
  code.push(`cssModules["${name}"] = ${styleVar};`);
  return joinCode(code);
}
