import { RewardEpochDetail } from '@/components/rewards/RewardEpochDetail';

export const metadata = { title: "Epoch" };

export default async function RewardEpochPage(props: {
  params: Promise<{ epoch: string }>;
}) {
  const params = await props.params;
  return <RewardEpochDetail epoch={params.epoch} />;
}
