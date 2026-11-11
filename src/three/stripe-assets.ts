export const STRIPE_ASSET_ROOT = "/assets/stripe-press";

export type StripeTextureReference = {
  name: string;
  local_file: string | null;
};

export type StripeBookAsset = {
  index: number;
  slug: string;
  title: string;
  short_title: string | null;
  material: Record<string, number | string | number[]>;
  palette: {
    color: string;
    backgroundColor: string;
    coverColor?: string;
  };
  textures: Record<string, StripeTextureReference>;
};

export function stripeAssetUrl(localFile: string) {
  return `${STRIPE_ASSET_ROOT}/${localFile}`;
}
