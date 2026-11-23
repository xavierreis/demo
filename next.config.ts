import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Os uploads (até 8 MB) vão directamente do navegador para o Supabase Storage.
  poweredByHeader: false,
};

export default nextConfig;
