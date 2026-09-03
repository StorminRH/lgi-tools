import { z } from 'zod';

const ownedAssetSchema = z.object({

  type_id: z.number().int().positive(),
  quantity: z.number().int().positive(),
  location_id: z.number().int().positive(),

  location_flag: z.string(),
  location_type: z.string(),
});
const ownedAssetsBodySchema = z.array(ownedAssetSchema);

export type OwnedAsset = z.infer<typeof ownedAssetSchema>;

function aggregateKey(asset: OwnedAsset): string {
  return `${asset.type_id}|${asset.location_id}|${asset.location_flag}|${asset.location_type}`;
}

function aggregateAssets(assets: OwnedAsset[]): OwnedAsset[] {
  const byKey = new Map<string, OwnedAsset>();
  for (const asset of assets) {
    const existing = byKey.get(aggregateKey(asset));
    if (existing === undefined) {
      byKey.set(aggregateKey(asset), { ...asset });
    } else {
      existing.quantity += asset.quantity;
    }
  }
  return [...byKey.values()];
}

function compareAssets(a: OwnedAsset, b: OwnedAsset): number {
  return (
    a.type_id - b.type_id ||
    a.location_id - b.location_id ||
    (a.location_flag < b.location_flag ? -1 : a.location_flag > b.location_flag ? 1 : 0) ||
    (a.location_type < b.location_type ? -1 : a.location_type > b.location_type ? 1 : 0)
  );
}

export function parseAssetsBody(body: unknown): OwnedAsset[] | null {
  const parsed = ownedAssetsBodySchema.safeParse(body);
  if (!parsed.success) return null;
  return aggregateAssets(parsed.data).sort(compareAssets);
}
