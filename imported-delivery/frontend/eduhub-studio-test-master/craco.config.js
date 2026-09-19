const path = require("path");
module.exports = {
  webpack: {
    alias: { "@": path.resolve(__dirname, "src") },
    configure: (cfg) => {
      cfg.watchOptions = {
        ...cfg.watchOptions,
        ignored: ["**/node_modules/**","**/.git/**","**/build/**","**/dist/**","**/coverage/**","**/public/**"],
      };
      return cfg;
    },
  },
  eslint: {
    configure: {
      extends: ["plugin:react-hooks/recommended"],
      rules: { "react-hooks/rules-of-hooks": "error", "react-hooks/exhaustive-deps": "warn" },
    },
  },
  jest: {
    configure: (jestConfig) => {
      // CRA builds testMatch by string-concatenating the resolved rootDir
      // into the glob itself; when rootDir contains a mixed-separator
      // segment (as happens when this checkout lives under a path with a
      // dot-prefixed directory component, e.g. a nested `.claude/worktrees`
      // git worktree), the resulting pattern silently matches zero files.
      // Reassigning with the `<rootDir>` token lets Jest substitute it
      // internally instead, which is separator-safe.
      const srcGlobRoot = path.resolve(__dirname, "src").split(path.sep).join("/");
      jestConfig.testMatch = [
        `${srcGlobRoot}/**/__tests__/**/*.{js,jsx,ts,tsx}`,
        `${srcGlobRoot}/**/*.{spec,test}.{js,jsx,ts,tsx}`,
      ];
      return jestConfig;
    },
  },
};
