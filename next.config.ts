import type { NextConfig } from "next";

// Protótipo: todas as telas leem o Supabase a cada requisição, então não usamos Cache Components.
// devIndicators: false tira o selo do Next do canto da tela durante a apresentação.
const nextConfig: NextConfig = {
  devIndicators: false,
};

export default nextConfig;
