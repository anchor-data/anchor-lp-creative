import { getWeights } from "@/server/services/admin";
import { PageTitle } from "@/components/ui";
import { WeightsAdmin } from "./weights-admin";

export default async function WeightsPage() {
  return (
    <>
      <PageTitle eyebrow="A-07">推薦の重み</PageTitle>
      <WeightsAdmin initial={await getWeights()} />
    </>
  );
}
