import { useRoute } from "wouter";
import { EngagementDetailView } from "@/features/engagements/EngagementDetailView";

export default function ClientEngagementDetailPage() {
  const [, params] = useRoute("/client/engagements/:id");
  const engagementId = params?.id ? Number(params.id) : NaN;
  return <EngagementDetailView engagementId={engagementId} listPath="/client/engagements" clientMode />;
}
