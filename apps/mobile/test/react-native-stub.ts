export const Platform = {
  OS: "test",
  select: <T>(options: { readonly default?: T }) => options.default
};

export const NativeModules = {
  BlobModule: undefined
};
