import type { NextConfig } from "next";

const config: NextConfig = {
  // pg + aws sdk must stay server-side, never bundled into RSC output
  serverExternalPackages: ["postgres", "@aws-sdk/client-s3", "@aws-sdk/s3-request-presigner"],
};

export default config;
