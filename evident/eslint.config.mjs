import next from "eslint-config-next";

const config = [
  { ignores: [".next/**", "node_modules/**", "next-env.d.ts", "evals/out/**", "playwright-report/**", "test-results/**"] },
  ...next,
];

export default config;
