import { EngagementsListView } from "@/features/engagements/EngagementsListView";

export default function EngagementsPage() {
  return <EngagementsListView detailBasePath="/engagements" clientShell={false} />;
}
