import PluginVue from "../src";
import { RollupError, RollupWarning } from "rollup";

describe("transform", () => {
  let transform: (code: string, fileName: string) => Promise<{ code: string, map: {
    file: string,
    mappings: string,
    names: string[],
    sourceRoot: string,
    sources: string[],
    sourcesContent: (null|string)[],
    version: number
  } }>;
  let transformPreprocessing: (code: string, fileName: string) => Promise<{ code: string, map: {
    file: string,
    mappings: string,
    names: string[],
    sourceRoot: string,
    sources: string[],
    sourcesContent: (null|string)[],
    version: number
  } }>;
  let load: (code: string) => Promise<null | string | {code: string}>;
  let resolveId: (code: string, importer: string) => Promise<null | string>;
  let resolveIdNonMatching: (code: string, importer: string) => Promise<null | string>;

  beforeEach(() => {
    transform = PluginVue({ customBlocks: ["*"] }).transform as typeof transform;
    transformPreprocessing = PluginVue({ customBlocks: ["*"], preprocessStyles: true }).transform as typeof transform;
    resolveId = PluginVue({ customBlocks: ["*"] }).resolveId as typeof resolveId;
    resolveIdNonMatching = PluginVue({ include: ['none'], exclude: ["example.vue"] }).resolveId as typeof resolveId;
    load = PluginVue().load as typeof load;
  });

  it("should transform <script> block", async () => {
    const { code } = await transform(`<script>export default {}</script>`, `example.vue`);

    expect(code).toEqual(
      expect.stringContaining(`import script from "example.vue?vue&type=script&lang.js"`),
    );

    expect(code).toEqual(
      expect.stringContaining(`export * from "example.vue?vue&type=script&lang.js"`),
    );

    expect(code).toEqual(expect.stringContaining(`export default script`));
  });

  it('should transform <script lang="ts"> block', async () => {
    const { code } = await transform(`<script lang="ts">export default {}</script>`, `example.vue`);

    expect(code).toEqual(
      expect.stringContaining(`import script from "example.vue?vue&type=script&lang.ts"`),
    );

    expect(code).toEqual(
      expect.stringContaining(`export * from "example.vue?vue&type=script&lang.ts"`),
    );

    expect(code).toEqual(expect.stringContaining(`export default script`));
  });

  it("should transform <template> block", async () => {
    const { code } = await transform(`<template><div /></template>`, `example.vue`);

    expect(code).toEqual(
      expect.stringContaining(`import { render } from "example.vue?vue&type=template&id=4b16ad9e"`),
    );

    expect(code).toEqual(expect.stringContaining(`script.render = render`));
  });

  it('should transform <template lang="pug"> block', async () => {
    const { code } = await transform(`<template>div</template>`, `example.vue`);

    expect(code).toEqual(
      expect.stringContaining(`import { render } from "example.vue?vue&type=template&id=4b16ad9e"`),
    );

    expect(code).toEqual(expect.stringContaining(`script.render = render`));
  });

  it('should transform <template lang="pug"> block (with `./` path)', async () => {
    const { code } = await transform(`<template>div</template>`, `./example.vue`);

    expect(code).toEqual(
      expect.stringContaining(
        `import { render } from "./example.vue?vue&type=template&id=4b16ad9e"`,
      ),
    );

    expect(code).toEqual(expect.stringContaining(`script.render = render`));
  });

  it("should err upon parsing errors", async () => {
    let rollupError;
    await transform.call({
      error (error: RollupError) {
        rollupError = error;
      }
    }, `<script>`, `example.vue`);

    expect(rollupError).toEqual(
      expect.objectContaining({
        id: 'example.vue',
        plugin: 'vue3',
        message: 'Element is missing end tag.',
      })
    );
  });

  it("should transform <style> block", async () => {
    const { code } = await transform(`<style>.foo {}</style>`, `example.vue`);

    expect(code).toEqual(
      expect.stringContaining(`import "example.vue?vue&type=style&index=0&lang.css"`),
    );
  });

  it("should transform <style scoped> block", async () => {
    const { code } = await transform(`<style scoped>.foo {}</style>`, `example.vue`);

    expect(code).toEqual(
      expect.stringContaining(
        `import "example.vue?vue&type=style&index=0&id=4b16ad9e&scoped=true&lang.css`,
      ),
    );
  });

  it("should transform <style module> block", async () => {
    const { code } = await transform(`<style module>.foo {}</style>`, `example.vue`);

    expect(code).toEqual(
      expect.stringContaining(`import "example.vue?vue&type=style&index=0&lang.css`),
    );

    expect(code).toEqual(
      expect.stringContaining(
        `import style0 from "example.vue?vue&type=style&index=0&module=true&lang.css`,
      ),
    );

    expect(code).toEqual(expect.stringContaining("script.__cssModules = {}"));

    expect(code).toEqual(expect.stringContaining('cssModules["$style"] = style0'));
  });

  it('should transform <style module="custom"> block', async () => {
    const { code } = await transform(`<style module="custom">.foo {}</style>`, `example.vue`);

    expect(code).toEqual(
      expect.stringContaining(`import "example.vue?vue&type=style&index=0&lang.css`),
    );

    expect(code).toEqual(
      expect.stringContaining(
        `import style0 from "example.vue?vue&type=style&index=0&module=custom&lang.css`,
      ),
    );

    expect(code).toEqual(expect.stringContaining("script.__cssModules = {}"));

    expect(code).toEqual(expect.stringContaining('cssModules["custom"] = style0'));
  });

  it("should transform multiple <style module> block", async () => {
    const { code } = await transform(
      `<style module>.foo {}</style>
       <style module>.bar {}</style>`,
      `example.vue`,
    );

    expect(code).toEqual(
      expect.stringContaining(
        `import style0 from "example.vue?vue&type=style&index=0&module=true&lang.css`,
      ),
    );

    expect(code).toEqual(
      expect.stringContaining(
        `import style1 from "example.vue?vue&type=style&index=1&module=true&lang.css`,
      ),
    );
  });

  it("should return `null` with non-vue query string)", async () => {
    const result = await transform(`<style>.foo {}</style>`, `example.vue?missingVue=1`);

    expect(result).toBeNull();
  });

  it("should return `null` with transform of vue query string missing a matching `type`.", async () => {
    await transform(`<style scoped>.foo {}</style>`, `example.vue`);

    const result = await transform(`<style scoped>.foo {}</style>`, `example.vue?vue&id=example.vue&index=0`);

    expect(result).toBeNull();
  });

  it("should return code/map object with transform of vue query string and a matching template `type`.", async () => {
    await transform(`<template><div /></template>`, `example.vue`);

    const result = await transform(`<template><div /></template>`, `example.vue?vue&id=example.vue&index=0&type=template`);

    expect(result).toEqual(expect.objectContaining({
      code: expect.stringMatching('export function render') as string,
      map: {
        file: 'example.vue',
        mappings: ';;gCAAU,aAAO;;;wBAAjB,aAA4B;IAAlB,UAAO',
        names: [],
        sourceRoot: expect.stringMatching('rollup-plugin-vue3') as string,
        sources: [
          expect.stringMatching("rollup-plugin-vue3/example.vue")
        ],
        sourcesContent: [null],
        version: 3
      }
    }));
  });

  it("should return code/map object with transform of vue query string and a matching style `type`.", async () => {
    await transform(`<style>.foo {}</style>`, `example.vue`);

    const result = await transform(`<style>.foo {}</style>`, `example.vue?vue&id=example.vue&index=0&type=style`);

    expect(result).toEqual(expect.objectContaining({
      code: '.foo {}',
      map: null
    }));
  });

  it("should err with bad transform of vue query string and a matching style `type`.", async () => {
    await transform(`<style>.foo</style>`, `example.vue`);

    let rollupError;
    const result = await transform.call({
      error (error: RollupError) {
        rollupError = error;
      }
    }, `<style>.foo</style>`, `example.vue?vue&id=example.vue&index=0&type=style`);

    expect(rollupError).toEqual(expect.objectContaining({
      id: 'example.vue',
      message: expect.stringMatching('Unknown word') as string,
    }));
    expect(result).toBeNull();
  });

  it("should return code/map object with transform of vue query string and a matching style `type` and `module`.", async () => {
    await transform(`<style module>.foo {}</style>`, `example.vue`);

    const result = await transform(`<style module>.foo {}</style>`, `example.vue?vue&id=example.vue&index=0&type=style&module=1`);

    expect(result).toEqual(expect.objectContaining({
      code: 'export default {"foo":"_foo_1q9ys_1"};',
      map: null
    }));
  });

  it("should return code/map object with transform of vue query string and a matching style `type` with lang.", async () => {
    const css = `.foo {
  color: red;
}`;
    for (const [preprocessLang, input = css, code = css] of [
      ['scss'],
      ['sass', `.foo
    color: red`],
      ['less', css, `${css}\n`],
      ['stylus', css, `.foo {\n  color: #f00;\n}\n`]
    ]) {
      // eslint-disable-next-line no-await-in-loop
      await transformPreprocessing(`<style lang="${preprocessLang}">${input}</style>`, `example.vue`);
      // eslint-disable-next-line no-await-in-loop
      const result = await transformPreprocessing(`<style lang="${preprocessLang}">>${input}</style>`, `example.vue?vue&id=example.vue&index=0&type=style`);
      expect(result).toEqual(expect.objectContaining({
        code,
        map: null
      }));
    }
  });

  it("should process tips with transform of vue query string and a matching `type`.", async () => {
    await transform(`<template lang="md"># Hello</template>`, `example.vue`);

    let warningObject;
    let rollupError;
    const result = await transform.call({
      warn (warnObj: RollupWarning) {
        warningObject = warnObj;
      },
      error (error: RollupError) {
        rollupError = error;
      }
    }, `<template lang="md"># Hello</template>`, `example.vue?vue&id=example.vue&index=0&type=template`);

    expect(warningObject).toEqual(expect.objectContaining({
      id: 'example.vue',
      message: 'Component example.vue uses lang md for template. Please install the language preprocessor.'
    }));

    expect(rollupError).toEqual(expect.objectContaining({
      id: 'example.vue',
      message: 'Component example.vue uses lang md for template, however it is not installed.',
    }));

    expect(result).toBeNull();
  });

  it("should err and return null with transform of vue query string, a matching `type`, and broken template.", async () => {
    await transform(`<template><div /></template>`, `example.vue`);

    let rollupError;
    const result = await transform.call({
      error (error: RollupError) {
        rollupError = error;
      }
    }, `<template>`, `example.vue?vue&id=example.vue&index=0&type=template`);

    expect(rollupError).toEqual(
      expect.objectContaining({
        id: 'example.vue',
        plugin: 'vue3',
        message: 'Element is missing end tag.',
      })
    );
    expect(result).toBeNull();
  });

  it("should return null with non-vue query resolveId.", async () => {
    await transform(`<style scoped>.foo {}</style>`, `example.vue`);

    const result = await resolveId(`example.vue`, 'importer');

    expect(result).toBeNull();
  });

  it("should return null with vue query resolveId and non-matching filter.", async () => {
    const result = await resolveIdNonMatching(`example.vue?vue`, 'importer');

    expect(result).toBeNull();
  });

  it("should return id with vue query `resolveId`.", async () => {
    const result = await resolveId(`example.vue?vue`, 'importer');

    expect(result).toEqual('example.vue?vue');
  });

  it("should return id with vue query of `resolveId` with `src` and empty importer.", async () => {
    const result = await resolveId.call({
      resolve () {
        return {
        	id: 'example.vue'
        }
      }
    }, `example.vue?vue&src`, '');

    expect(result).toEqual('example.vue?vue&src');
  });

  it("should return ResolvedId object with vue query of `resolveId` with `src` and importer.", async () => {
    await transform(`<style scoped>.foo {}</style>`, `example.vue`);

    const result = await resolveId.call({
      resolve () {
        return {
        	id: 'example2.vue'
        }
      }
    }, `example2.vue?vue&src`, 'example.vue');

    expect(result).toEqual(
      expect.objectContaining({
        id: 'example2.vue?vue&src'
      })
    );
  });

  it("should return null with non-vue query load.", async () => {
    const result = await load(`example.vue`);

    expect(result).toBeNull();
  });

  it("should return string with vue query load with `src`.", async () => {
    const result = await load(`./__tests__/fixtures/example.vue?vue&src`);

    expect(result).toEqual(
      '<style>.foo {}</style>\n'
    );
  });

  it("should return null with vue query load with no matching type.", async () => {
    await transform(`<style scoped>.foo {}</style>`, `example.vue`);

    await resolveId.call({
      resolve () {
        return {
        	id: './__tests__/fixtures/example.vue'
        }
      }
    }, `./__tests__/fixtures/example.vue?vue&src`, 'example.vue');

    const result = await load(`./__tests__/fixtures/example.vue?vue`);

    expect(result).toBeNull();
  });


  it("should transform <i18n> block", async () => {
    const { code } = await transform(`<i18n>{}</i18n>`, `example.vue`);
    expect(code).toEqual(
      expect.stringContaining(`import block0 from "example.vue?vue&type=i18n&index=0&lang.i18n`),
    );
    expect(code).toEqual(expect.stringContaining("block0(script)"));
  });

  it('should transform <i18n lang="json"> block', async () => {
    const { code } = await transform(`<i18n lang="json">{}</i18n>`, `example.vue`);
    expect(code).toEqual(
      expect.stringContaining(`import block0 from "example.vue?vue&type=i18n&index=0&lang.json`),
    );
    expect(code).toEqual(expect.stringContaining("block0(script)"));
  });
});
