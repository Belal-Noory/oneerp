import { OwnerGate } from "@/components/OwnerGate";
import { OwnerSupportClient } from "./support-client";

export default function OwnerSupportPage() {
  return (
    <OwnerGate>
      <OwnerSupportClient />
    </OwnerGate>
  );
}

