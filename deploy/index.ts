// deploy barrel — consumers resolve compose + settings by package name.
export const compose = "deploy/compose.yaml";
export const settings = {
  h1: "deploy/settings/h1.settings.json5",
  h2: "deploy/settings/h2.settings.json5",
  h3: "deploy/settings/h3.settings.json5",
} as const;
