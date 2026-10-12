import type { SavedDetail } from "./saved-operations";

/** Display metadata only. Stored titles, manifests, IDs and exports remain untouched. */
export const publicInvestigations = [
  { id: "3bcb37c9-b410-44b1-be7f-c3b368fbe28c", manifest: "d57b681befad0017f83b5ca57af3a55bf4dded71403bc7af3d48a4c30c8c85c3", title: "Scottie Barnes: Scoring Distribution", description: "Five observed games, with exact points and empirical dispersion." },
  { id: "ed0c4c82-9b31-4527-962e-012d180ec2ba", manifest: "a69b64a20e03f6e1e0214ee16b908e0549e97a94126c8fa879d7d28545e67429", title: "Scottie Barnes: Recent vs Prior Games", description: "Points and minutes across two disjoint ten-game windows." },
  { id: "be611173-e250-44cc-bd72-7e64f24341ec", manifest: "e85533a41c3a5c0a8dad522cb9cdfcf3903266a8c43fc4140c56cd674fe5c56f", title: "Scottie Barnes: Home and Away", description: "Observed production split by venue, with sample counts." },
  { id: "fff8adb1-f205-4fdf-a353-8618ac567440", manifest: "25539cd248c0fa43be506070f1eb9db46f0f3afcf0dc1a7801521edba3d61236", title: "Scottie Barnes: Statistical Peers", description: "Five nearest profiles under the retained sample and distance rules." },
] as const;

export function publicInvestigation(detail: Pick<SavedDetail, "id" | "manifest_sha256">) {
  return publicInvestigations.find(item => item.id === detail.id && item.manifest === detail.manifest_sha256);
}
