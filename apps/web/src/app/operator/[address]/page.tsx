import { OperatorView } from '@/components/operator/OperatorView';

export const metadata = { title: "Operator" };

export default async function OperatorPage(props: {
  params: Promise<{ address: string }>;
}) {
  const params = await props.params;
  return <OperatorView address={params.address} />;
}
