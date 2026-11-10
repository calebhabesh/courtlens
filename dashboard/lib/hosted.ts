/** True in the public read-only demo build (deploy/compose.prod.yml); false locally. */
export const isHostedDemo = process.env.NEXT_PUBLIC_COURTLENS_HOSTED === "true";
/** The hosted demo with public Ask: a few questions per visitor a day under one shared limit. */
export const isPublicAsk = isHostedDemo && process.env.NEXT_PUBLIC_COURTLENS_PUBLIC_ASK === "true";
/** Ask is offered locally, and on the hosted demo only when public Ask is on. */
export const askAvailable = !isHostedDemo || isPublicAsk;
