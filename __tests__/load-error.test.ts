import PluginVue from "../src";

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
  let load: (code: string) => Promise<null | string | {code: string}>;
  let resolveId: (code: string, importer: string) => Promise<null | string>;

  beforeEach(() => {
    transform = PluginVue({ customBlocks: ["*"] }).transform as typeof transform;
    resolveId = PluginVue({ customBlocks: ["*"] }).resolveId as typeof resolveId;
    load = PluginVue({ customBlocks: ["*"] }).load as typeof load;
  });

  // Load this test outside of other (runInBand) tests so there is no race
  //   condition
  it("should error (in load) when receiving non-parsed id.", async () => {
    await expect(load(`example.vue?vue`)).rejects.toThrow(
       'example.vue is not parsed yet'
    );
  });
});
