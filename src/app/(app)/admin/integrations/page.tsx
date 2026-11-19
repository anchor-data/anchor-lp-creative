import { integrationStatus, listJobRuns } from "@/server/services/admin";
import { JOBS } from "@/server/jobs";
import { PageTitle } from "@/components/ui";
import { IntegrationsAdmin } from "./integrations-admin";

export default async function IntegrationsPage() {
  const [status, runs] = await Promise.all([integrationStatus(), listJobRuns(100)]);
  return (
    <>
      <PageTitle eyebrow="A-06">連携とジョブ</PageTitle>
      <IntegrationsAdmin status={status} runs={runs.filter((r) => !r.job.includes(":"))} jobs={Object.entries(JOBS).map(([id, label]) => ({ id, label }))} />
    </>
  );
}
