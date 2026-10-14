/** True in the public read-only demo build (deploy/compose.prod.yml); false locally. */
export const isHostedDemo = process.env.NEXT_PUBLIC_COURTLENS_HOSTED === "true";
