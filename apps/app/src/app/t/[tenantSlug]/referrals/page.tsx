import { ReferralsClient } from "./ReferralsClient";

export default async function TenantReferralsPage(props: { params: Promise<{ tenantSlug: string }> }) {
  const { tenantSlug } = await props.params;
  return <ReferralsClient tenantSlug={tenantSlug} />;
}

