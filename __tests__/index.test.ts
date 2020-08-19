import PluginVue from "../src";
import { RollupError } from "rollup";

describe("transform", () => {
  let transform: (code: string, fileName: string) => Promise<{ code: string }>;

  beforeEach(() => {
    transform = PluginVue({ customBlocks: ["*"] }).transform as typeof transform;
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
