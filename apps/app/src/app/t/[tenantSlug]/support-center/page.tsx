import { SupportCenterClient } from "./SupportCenterClient";

export default async function TenantSupportCenterPage(props: { params: Promise<{ tenantSlug: string }> }) {
  const { tenantSlug } = await props.params;
  return <SupportCenterClient tenantSlug={tenantSlug} />;
}

