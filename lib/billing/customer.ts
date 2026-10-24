import type { SupabaseClient } from "@supabase/supabase-js";
import type Stripe from "stripe";

import { loadBillingRow, saveCustomerId } from "@/lib/billing/store";

/** Find or create the Stripe customer for a teacher, remembering the id locally. */
export async function ensureCustomer(
  stripe: Stripe,
  supabase: SupabaseClient,
  user: { id: string; email: string | null | undefined; name?: string | null },
): Promise<string> {
  const { row } = await loadBillingRow(supabase, user.id);
  if (row?.stripe_customer_id) {
    return row.stripe_customer_id;
  }

  // A customer may exist from an earlier attempt that never reached the row.
  const found = await stripe.customers.search({
    query: `metadata['supabase_user_id']:'${user.id}'`,
    limit: 1,
  });
  const customer =
    found.data[0] ??
    (await stripe.customers.create({
      email: user.email ?? undefined,
      name: user.name ?? undefined,
      metadata: { supabase_user_id: user.id },
    }));

  await saveCustomerId(supabase, user.id, customer.id);
  return customer.id;
}
