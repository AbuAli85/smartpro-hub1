import { useRoute } from "wouter";
import { EngagementDetailView } from "@/features/engagements/EngagementDetailView";

export default function EngagementDetailPage() {
  const [, params] = useRoute("/engagements/:id");
  const engagementId = params?.id ? Number(params.id) : NaN;
  return <EngagementDetailView engagementId={engagementId} listPath="/engagements" clientMode={false} />;
}
