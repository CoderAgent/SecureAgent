import { Axiom } from '@axiomhq/js';

export const axiom = new Axiom({
  token: process.env.AXIOM_API_KEY,
  orgId: process.env.AXIOM_ORG_ID,
});